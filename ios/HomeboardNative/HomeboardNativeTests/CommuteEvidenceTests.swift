import CoreLocation
import XCTest
@testable import HomeboardNative

@MainActor
final class CommuteEvidenceTests: XCTestCase {
  func testManualParserAcceptsExplicitDurationsAndRejectsArbitraryDigits() {
    XCTAssertEqual(HomeboardManualCommuteParser.minutes(from: "38 min to Midtown"), 38)
    XCTAssertEqual(HomeboardManualCommuteParser.minutes(from: "About 42 minutes by train"), 42)
    XCTAssertNil(HomeboardManualCommuteParser.minutes(from: "123 Main Street"))
    XCTAssertNil(HomeboardManualCommuteParser.minutes(from: "Unit 42 near Midtown"))
    XCTAssertNil(HomeboardManualCommuteParser.minutes(from: "38 min driving estimate"))
    XCTAssertNil(HomeboardManualCommuteParser.minutes(from: "0 minutes"))
  }

  func testFreshNativeEvidenceWinsOverManualAndThenUsesFreshCache() async {
    let clock = TestClock()
    let provider = TestRoutingProvider()
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 24, mode: requestedMode)
    }
    let service = makeService(provider: provider, clock: clock)

    let live = await service.evidence(
      scope: scope(),
      listingID: "listing-a",
      manualLine: "38 min to Midtown",
      origin: origin,
      targets: [target(access: "car")]
    )
    XCTAssertEqual(live.source, .appleLive)
    XCTAssertEqual(live.routeSnapshots.first?.minutes, 24)
    XCTAssertEqual(live.manualMinutes, 38)

    let cached = await service.evidence(
      scope: scope(),
      listingID: "listing-a",
      manualLine: "38 min to Midtown",
      origin: origin,
      targets: [target(access: "car")]
    )
    XCTAssertEqual(cached.source, .appleCache)
    XCTAssertEqual(provider.routeCallCount(), 1)
  }

  func testStaleCacheIsLabeledAndManualIsOnlyUsedWhenNativeIsUnavailable() async {
    let clock = TestClock()
    let provider = TestRoutingProvider()
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 26, mode: requestedMode)
    }
    let service = makeService(provider: provider, clock: clock)
    _ = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "41 min to work",
      origin: origin, targets: [target(access: "car")]
    )

    clock.advance(hours: 7)
    provider.routeHandler = { _, _, _ in throw HomeboardCommuteRoutingError.terminal }
    let stale = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "41 min to work",
      origin: origin, targets: [target(access: "car")], forceRefresh: true
    )
    XCTAssertEqual(stale.source, .appleStaleCache)
    XCTAssertEqual(stale.freshness, .stale)
    XCTAssertEqual(stale.score != nil, true)

    let noNative = await service.evidence(
      scope: scope(), listingID: "listing-b", manualLine: "41 min to work",
      origin: CLLocationCoordinate2D(latitude: 40.701, longitude: -74.001),
      targets: [target(access: "car")], forceRefresh: true
    )
    XCTAssertNil(noNative.score)
    XCTAssertEqual(noNative.source, .manual)
    XCTAssertEqual(noNative.state, .failed)
    XCTAssertEqual(noNative.displaySummary, "Manual fallback · 41 min · not per-member verified")
  }

  func testTransitOnlyMemberNeverUsesAutomobileEvidence() async {
    let provider = TestRoutingProvider()
    provider.routeHandler = { _, _, requestedMode in
      requestedMode == .transit
        ? Self.route(minutes: 18, mode: .automobile)
        : Self.route(minutes: 18, mode: .automobile)
    }
    let service = makeService(provider: provider)
    let evidence = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "",
      origin: origin, targets: [target(access: "transit")]
    )

    XCTAssertNil(evidence.score)
    XCTAssertEqual(evidence.state, .failed)
    XCTAssertFalse(evidence.routeSnapshots.contains { $0.mode == .automobile })
    XCTAssertEqual(provider.requestedModes(), [.transit, .walking])
  }

  func testPartialDestinationsStayUnknownAndCannotCreateRiskOrWinner() async {
    let provider = TestRoutingProvider()
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 20, mode: requestedMode)
    }
    let service = makeService(provider: provider)
    let evidence = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "",
      origin: origin, targets: [target(access: "car")], expectedDestinationCount: 2
    )

    XCTAssertNil(evidence.score)
    XCTAssertEqual(evidence.resolvedDestinations, 1)
    XCTAssertEqual(evidence.requestedDestinations, 2)
    XCTAssertEqual(evidence.state, .unknown)
    XCTAssertFalse(evidence.hasResolvedRisk)
  }

  func testBoundedLongDistanceSkipStaysUnknownWithoutClaimingRouteRisk() async {
    let provider = TestRoutingProvider()
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 180, mode: requestedMode)
    }
    let service = makeService(provider: provider)
    let distant = SharedComparisonCommuteTarget(
      id: "far-away",
      memberID: "member-a",
      memberName: "member-a",
      destination: "Far away",
      destinationSignature: "far-away",
      latitude: 47.6062,
      longitude: -122.3321,
      commuteAccess: "car",
      preferredMinutes: 20,
      maximumMinutes: 45
    )
    let evidence = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "",
      origin: origin, targets: [distant]
    )

    XCTAssertNil(evidence.score)
    XCTAssertEqual(evidence.suppressedLongRouteDestinations, 1)
    XCTAssertEqual(evidence.state, .failed)
    XCTAssertFalse(evidence.hasResolvedRisk)
    XCTAssertEqual(provider.routeCallCount(), 0)
  }

  func testRemoteAndSkipMembersAreExcludedFromGroupScore() async {
    let provider = TestRoutingProvider()
    provider.coordinates = ["Office, New York": destination]
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 25, mode: requestedMode)
    }
    let service = makeService(provider: provider)
    await service.evaluateListings(
      scope: scope(),
      city: "New York",
      listings: [listing()],
      members: [
        member(id: "active", destination: "Office", access: "car"),
        member(id: "remote", destination: "Elsewhere", access: "remote"),
        member(id: "skip", destination: "Elsewhere", access: "skip"),
      ]
    )

    let evidence = service.evaluation(for: "listing-a", scope: scope())
    XCTAssertEqual(evidence?.requestedDestinations, 1)
    XCTAssertEqual(evidence?.resolvedDestinations, 1)
    XCTAssertNotNil(evidence?.score)
    XCTAssertEqual(provider.coordinateQueries(), ["Office, New York"])
  }

  func testGroupScoreUsesAverageAndWorstMemberCompromise() async {
    let provider = TestRoutingProvider()
    provider.routeHandler = { _, destination, requestedMode in
      let minutes = destination.longitude < -73.99 ? 20 : 60
      return Self.route(minutes: minutes, mode: requestedMode)
    }
    let service = makeService(provider: provider)
    let first = target(
      id: "destination-a", memberID: "member-a", longitude: -73.995,
      access: "car", preferred: 15, maximum: 45
    )
    let second = target(
      id: "destination-b", memberID: "member-b", longitude: -73.98,
      access: "car", preferred: 15, maximum: 45
    )
    let evidence = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "",
      origin: origin, targets: [first, second]
    )

    let memberScores = evidence.routeSnapshots
      .filter { evidence.scoredRouteIDs.contains("\($0.targetID)|\($0.mode.rawValue)") }
      .map(\.score)
    let expected = (memberScores.reduce(0, +) / Double(memberScores.count)) * 0.72
      + (memberScores.min() ?? 0) * 0.28
    XCTAssertEqual(evidence.score ?? -1, expected, accuracy: 0.001)
    XCTAssertTrue(evidence.hasResolvedRisk)
  }

  func testIdenticalRequestsDeduplicateAndPreferenceChangesRescoreWithoutRefetch() async {
    let provider = TestRoutingProvider()
    provider.routeDelayNanoseconds = 80_000_000
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 30, mode: requestedMode)
    }
    let service = makeService(provider: provider)
    let first = target(id: "same", memberID: "member-a", access: "car", preferred: 10, maximum: 40)
    let second = target(id: "same", memberID: "member-b", access: "car", preferred: 20, maximum: 50)
    let evidence = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "",
      origin: origin, targets: [first, second]
    )
    XCTAssertNotNil(evidence.score)
    XCTAssertEqual(provider.routeCallCount(), 1)

    let rescored = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "",
      origin: origin,
      targets: [target(id: "same", memberID: "member-a", access: "car", preferred: 35, maximum: 55)]
    )
    XCTAssertEqual(provider.routeCallCount(), 1)
    XCTAssertNotEqual(rescored.score, evidence.routeSnapshots.first?.score)
  }

  func testConcurrentIdenticalRequestsShareOneInFlightRoute() async {
    let provider = TestRoutingProvider()
    provider.routeDelayNanoseconds = 100_000_000
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 28, mode: requestedMode)
    }
    let service = makeService(provider: provider)
    let first = Task { @MainActor in
      await service.evidence(
        scope: scope(), listingID: "listing-a", manualLine: "", origin: origin,
        targets: [target(access: "car")]
      )
    }
    let second = Task { @MainActor in
      await service.evidence(
        scope: scope(), listingID: "listing-b", manualLine: "", origin: origin,
        targets: [target(access: "car")]
      )
    }

    let firstEvidence = await first.value
    let secondEvidence = await second.value
    XCTAssertNotNil(firstEvidence.score)
    XCTAssertNotNil(secondEvidence.score)
    XCTAssertEqual(provider.routeCallCount(), 1)
  }

  func testCoordinateBoardAccountModeAndDepartureChangesInvalidateRouteCache() async {
    let clock = TestClock()
    let provider = TestRoutingProvider()
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 22, mode: requestedMode)
    }
    let service = makeService(provider: provider, clock: clock)

    _ = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "", origin: origin,
      targets: [target(access: "car")]
    )
    _ = await service.evidence(
      scope: scope(boardID: "board-b"), listingID: "listing-a", manualLine: "", origin: origin,
      targets: [target(access: "car")]
    )
    _ = await service.evidence(
      scope: scope(accountID: "account-b"), listingID: "listing-a", manualLine: "", origin: origin,
      targets: [target(access: "car")]
    )
    _ = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "",
      origin: CLLocationCoordinate2D(latitude: 40.71, longitude: -74.02),
      targets: [target(access: "car")]
    )
    _ = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "", origin: origin,
      targets: [target(access: "transit")]
    )
    clock.advance(minutes: 31)
    _ = await service.evidence(
      scope: scope(), listingID: "listing-a", manualLine: "", origin: origin,
      targets: [target(access: "transit")]
    )

    XCTAssertEqual(provider.routeCallCount(), 6)
  }

  func testCancellationDoesNotPublishACompletedEvaluation() async {
    let provider = TestRoutingProvider()
    provider.routeDelayNanoseconds = 500_000_000
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 20, mode: requestedMode)
    }
    let service = makeService(provider: provider)
    let task = Task { @MainActor in
      await service.evidence(
        scope: scope(), listingID: "listing-a", manualLine: "", origin: origin,
        targets: [target(access: "car")]
      )
    }
    try? await Task.sleep(nanoseconds: 30_000_000)
    task.cancel()
    _ = await task.value

    XCTAssertNil(service.evaluation(for: "listing-a", scope: scope()))
  }

  func testAccountPurgeRemovesOnlyThatAccountsEvidenceAndRoutes() async {
    let provider = TestRoutingProvider()
    provider.routeHandler = { _, _, requestedMode in
      Self.route(minutes: 20, mode: requestedMode)
    }
    let service = makeService(provider: provider)
    let firstScope = scope(accountID: "account-a")
    let secondScope = scope(accountID: "account-b")
    _ = await service.evidence(
      scope: firstScope, listingID: "listing-a", manualLine: "", origin: origin,
      targets: [target(access: "car")]
    )
    _ = await service.evidence(
      scope: secondScope, listingID: "listing-b", manualLine: "", origin: origin,
      targets: [target(access: "car")]
    )

    service.purgeAccount("account-a")
    for _ in 0..<20 where await service.cachedEntryCount(accountID: "account-a") != 0 {
      await Task.yield()
    }
    XCTAssertNil(service.evaluation(for: "listing-a", scope: firstScope))
    XCTAssertNotNil(service.evaluation(for: "listing-b", scope: secondScope))
    let firstAccountCount = await service.cachedEntryCount(accountID: "account-a")
    let secondAccountCount = await service.cachedEntryCount(accountID: "account-b")
    XCTAssertEqual(firstAccountCount, 0)
    XCTAssertEqual(secondAccountCount, 1)
  }

  func testAdvisorRankingParsesOnlyManualDurationsAndNativeTakesPriority() {
    var profile = RentalProfile()
    profile.minCommuteMinutes = "20"
    profile.maxCommuteMinutes = "45"
    let streetNumber = listing(commuteLine: "123 Main Street")
    let manual = listing(commuteLine: "38 min to Midtown")

    XCTAssertEqual(
      AdvisorListingRanker.score(streetNumber, profile: profile),
      AdvisorListingRanker.score(streetNumber, profile: profile, commuteScore: 40)
    )
    XCTAssertEqual(
      AdvisorListingRanker.score(manual, profile: profile),
      AdvisorListingRanker.score(manual, profile: profile, commuteScore: 100) + 0
    )
    XCTAssertEqual(
      AdvisorListingRanker.score(manual, profile: profile, commuteScore: 40),
      AdvisorListingRanker.score(streetNumber, profile: profile)
    )
  }

  private var origin: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: 40.70, longitude: -74.0)
  }

  private var destination: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: 40.72, longitude: -73.99)
  }

  private func makeService(
    provider: TestRoutingProvider,
    clock: TestClock = TestClock()
  ) -> HomeboardCommuteService {
    HomeboardCommuteService(
      provider: provider,
      now: { clock.now() },
      sleeper: { _ in },
      persistsCache: false
    )
  }

  private func scope(
    accountID: String = "account-a",
    boardID: String = "board-a"
  ) -> HomeboardCommuteService.Scope {
    HomeboardCommuteService.Scope(accountID: accountID, boardID: boardID)
  }

  private func target(
    id: String = "destination-a",
    memberID: String = "member-a",
    longitude: Double = -73.99,
    access: String?,
    preferred: Int = 20,
    maximum: Int = 45
  ) -> SharedComparisonCommuteTarget {
    SharedComparisonCommuteTarget(
      id: id,
      memberID: memberID,
      memberName: memberID,
      destination: "Office",
      destinationSignature: id,
      latitude: 40.72,
      longitude: longitude,
      commuteAccess: access,
      preferredMinutes: preferred,
      maximumMinutes: maximum
    )
  }

  private func member(
    id: String,
    destination: String,
    access: String
  ) -> HomeboardCommuteService.MemberInput {
    HomeboardCommuteService.MemberInput(
      id: id,
      name: id,
      destination: destination,
      commuteAccess: access,
      preferredMinutes: 20,
      maximumMinutes: 45
    )
  }

  private func listing(commuteLine: String = "") -> ListingPreview {
    ListingPreview(
      id: "listing-a",
      title: "Test home",
      location: "Downtown",
      priceLine: "$2500",
      commuteLine: commuteLine,
      summary: "",
      fitLabel: "",
      highlights: [],
      openRisks: [],
      latitude: origin.latitude,
      longitude: origin.longitude
    )
  }

  private func listing() -> HomeboardCommuteService.ListingInput {
    HomeboardCommuteService.ListingInput(
      id: "listing-a",
      latitude: origin.latitude,
      longitude: origin.longitude,
      locationQuery: "Downtown",
      manualLine: ""
    )
  }

  nonisolated private static func route(
    minutes: Int,
    mode: SharedCommuteMode
  ) -> SharedRouteResult {
    let coordinates = [
      SharedRouteCoordinate(latitude: 40.70, longitude: -74.0),
      SharedRouteCoordinate(latitude: 40.72, longitude: -73.99),
    ]
    return SharedRouteResult(
      minutes: minutes,
      distanceMeters: 7_500,
      stepCount: 2,
      actualMode: mode,
      transitKind: mode == .transit ? .train : nil,
      coordinates: coordinates,
      legs: [SharedRouteLegResult(
        mode: mode,
        transitKind: mode == .transit ? .train : nil,
        minutes: minutes,
        coordinates: coordinates
      )]
    )
  }
}

private final class TestClock: @unchecked Sendable {
  private let lock = NSLock()
  private var value = Date(timeIntervalSince1970: 1_800_000_000)

  func now() -> Date {
    lock.lock()
    defer { lock.unlock() }
    return value
  }

  func advance(minutes: Double = 0, hours: Double = 0) {
    lock.lock()
    value = value.addingTimeInterval(minutes * 60 + hours * 60 * 60)
    lock.unlock()
  }
}

private final class TestRoutingProvider: HomeboardCommuteRoutingProviding, @unchecked Sendable {
  typealias RouteHandler = @Sendable (
    CLLocationCoordinate2D,
    CLLocationCoordinate2D,
    SharedCommuteMode
  ) async throws -> SharedRouteResult?

  private let lock = NSLock()
  private var routeCalls: [SharedCommuteMode] = []
  private var queries: [String] = []
  var routeHandler: RouteHandler = { _, _, _ in nil }
  var routeDelayNanoseconds: UInt64 = 0
  var coordinates: [String: CLLocationCoordinate2D] = [:]

  func route(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    mode: SharedCommuteMode,
    departureDate: Date?
  ) async throws -> SharedRouteResult? {
    let (delay, handler) = lock.withLock {
      routeCalls.append(mode)
      return (routeDelayNanoseconds, routeHandler)
    }
    if delay > 0 { try await Task.sleep(nanoseconds: delay) }
    return try await handler(origin, destination, mode)
  }

  func coordinate(for query: String) async throws -> CLLocationCoordinate2D? {
    lock.withLock {
      queries.append(query)
      return coordinates[query]
    }
  }

  func routeCallCount() -> Int {
    lock.withLock { routeCalls.count }
  }

  func requestedModes() -> [SharedCommuteMode] {
    lock.withLock { routeCalls }
  }

  func coordinateQueries() -> [String] {
    lock.withLock { queries }
  }
}
