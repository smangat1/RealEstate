import Foundation
import MapKit
import Observation

enum SharedCommuteMode: String, CaseIterable, Hashable, Codable, Sendable {
  case transit
  case walking
  case automobile

  var label: String {
    switch self {
    case .transit: "Transit"
    case .walking: "Walk"
    case .automobile: "Drive"
    }
  }

  var icon: String {
    switch self {
    case .transit: "tram.fill"
    case .walking: "figure.walk"
    case .automobile: "car.fill"
    }
  }

  var cardOrder: Int {
    switch self {
    case .automobile: 0
    case .transit: 1
    case .walking: 2
    }
  }
}

enum SharedTransitKind: String, Codable, Sendable {
  case bus
  case train
  case ferry
  case transit

  var label: String {
    switch self {
    case .bus: "Bus"
    case .train: "Train"
    case .ferry: "Ferry"
    case .transit: "Transit"
    }
  }

  var icon: String {
    switch self {
    case .bus: "bus.fill"
    case .train: "tram.fill"
    case .ferry: "ferry.fill"
    case .transit: "tram.fill"
    }
  }
}

enum HomeboardCommuteEvidenceState: String, Codable, Sendable {
  case loading
  case known
  case unknown
  case failed
}

enum HomeboardCommuteEvidenceSource: String, Codable, Sendable {
  case appleLive
  case appleCache
  case appleStaleCache
  case manual

  var label: String {
    switch self {
    case .appleLive: "Apple Maps · updated now"
    case .appleCache: "Apple Maps · cached"
    case .appleStaleCache: "Apple Maps · stale cache"
    case .manual: "Manual fallback · not per-member verified"
    }
  }
}

enum HomeboardCommuteFreshness: String, Codable, Sendable {
  case fresh
  case stale
}

enum SharedCommuteRouteLogic {
  static func permits(_ mode: SharedCommuteMode, access: String?) -> Bool {
    guard access != "remote", access != "skip" else { return false }
    if mode == .automobile {
      return access == nil || access == "car" || access == "flexible"
    }
    return true
  }

  static func easeAdjustedMinutes(
    mode: SharedCommuteMode,
    minutes: Int,
    stepCount: Int,
    access: String?
  ) -> Int {
    guard permits(mode, access: access) else { return 999 }
    let base = Double(max(minutes, 1))
    let adjustment: Double
    switch mode {
    case .automobile:
      adjustment = access == "flexible" ? 2 : 0
    case .transit:
      let preferencePenalty = access == "car" ? 6.0 : access == "flexible" ? 2.0 : 1.0
      let complexityPenalty = min(Double(max(stepCount - 2, 0)) * 1.5, 9)
      adjustment = preferencePenalty + complexityPenalty
    case .walking:
      let longWalkPenalty = Double(max(minutes - 10, 0)) * 0.75
      let preferencePenalty = access == "car" ? 4.0 : 0
      adjustment = longWalkPenalty + preferencePenalty
    }
    return min(Int((base + adjustment).rounded()), 999)
  }

  static func routeModes(for commuteAccess: String?, includeAlternatives: Bool) -> [SharedCommuteMode] {
    let ordered: [SharedCommuteMode]
    switch commuteAccess {
    case "car":
      ordered = [.automobile, .transit, .walking]
    case "transit":
      // Driving is never an allowed fallback for a transit-only member.
      ordered = [.transit, .walking]
    default:
      ordered = [.transit, .automobile, .walking]
    }
    if includeAlternatives { return ordered }
    return ordered
  }
}

struct SharedRouteCoordinate: Codable, Hashable, Sendable {
  let latitude: Double
  let longitude: Double

  init(latitude: Double, longitude: Double) {
    self.latitude = latitude
    self.longitude = longitude
  }

  init(_ coordinate: CLLocationCoordinate2D) {
    latitude = coordinate.latitude
    longitude = coordinate.longitude
  }

  var mapCoordinate: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
  }
}

struct SharedRouteLegResult: Codable, Sendable {
  let mode: SharedCommuteMode
  let transitKind: SharedTransitKind?
  let minutes: Int
  let coordinates: [SharedRouteCoordinate]
}

struct SharedRouteResult: Codable, Sendable {
  let minutes: Int
  let distanceMeters: Double?
  let stepCount: Int
  let actualMode: SharedCommuteMode
  let transitKind: SharedTransitKind?
  let coordinates: [SharedRouteCoordinate]
  let legs: [SharedRouteLegResult]
}

struct SharedComparisonCommuteTarget: Sendable {
  let id: String
  let memberID: String
  let memberName: String
  let destination: String
  let destinationSignature: String
  let latitude: Double
  let longitude: Double
  let commuteAccess: String?
  let preferredMinutes: Int?
  let maximumMinutes: Int?
}

struct SharedComparisonRouteSnapshot: Sendable {
  let targetID: String
  let memberID: String
  let memberName: String
  let destination: String
  let destinationSignature: String
  let commuteAccess: String?
  let mode: SharedCommuteMode
  let transitKind: SharedTransitKind?
  let minutes: Int
  let distanceMeters: Double?
  let easeMinutes: Int
  let score: Double
  let preferredMinutes: Int
  let maximumMinutes: Int
  let computedAt: Date
  let freshness: HomeboardCommuteFreshness
  let source: HomeboardCommuteEvidenceSource
  let state: HomeboardCommuteEvidenceState
  let coordinates: [SharedRouteCoordinate]
  let legs: [SharedRouteLegResult]
}

struct SharedComparisonCommuteEvidence: Sendable {
  let listingID: String
  let score: Double?
  let averageMinutes: Int
  let averageEaseMinutes: Int
  let worstMemberScore: Double?
  let resolvedDestinations: Int
  let requestedDestinations: Int
  let suppressedLongRouteDestinations: Int
  let usedWalkingFallback: Bool
  let displayedRouteIDs: Set<String>
  let scoredRouteIDs: Set<String>
  let routeSnapshots: [SharedComparisonRouteSnapshot]
  let state: HomeboardCommuteEvidenceState
  let source: HomeboardCommuteEvidenceSource?
  let freshness: HomeboardCommuteFreshness?
  let computedAt: Date?
  let manualMinutes: Int?

  var hasResolvedRisk: Bool {
    guard score != nil else { return false }
    return routeSnapshots.contains { snapshot in
      scoredRouteIDs.contains("\(snapshot.targetID)|\(snapshot.mode.rawValue)")
        && snapshot.score < 100
    }
  }

  var displaySummary: String {
    if let score, requestedDestinations > 0 {
      let sourceLabel = source?.label ?? "Apple Maps"
      return "\(sourceLabel) · \(averageMinutes) min avg · score \(Int(score.rounded()))"
    }
    if let manualMinutes {
      return "Manual fallback · \(manualMinutes) min · not per-member verified"
    }
    switch state {
    case .loading: return "Checking Apple Maps routes…"
    case .failed: return "Commute unavailable · retry"
    case .unknown: return "Commute not evaluated"
    case .known: return "Commute evidence available"
    }
  }
}

enum HomeboardManualCommuteParser {
  static func minutes(from line: String) -> Int? {
    let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
          !trimmed.localizedCaseInsensitiveContains("estimate"),
          let expression = try? NSRegularExpression(
            pattern: #"(?i)(?:^|\b)(\d{1,3})\s*(?:min|mins|minute|minutes)\b"#
          )
    else { return nil }
    let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
    guard let match = expression.firstMatch(in: trimmed, range: range),
          let minuteRange = Range(match.range(at: 1), in: trimmed),
          let minutes = Int(trimmed[minuteRange]),
          (1...300).contains(minutes)
    else { return nil }
    return minutes
  }
}

protocol HomeboardCommuteRoutingProviding {
  func route(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    mode: SharedCommuteMode,
    departureDate: Date?
  ) async throws -> SharedRouteResult?

  func coordinate(for query: String) async throws -> CLLocationCoordinate2D?
}

enum HomeboardCommuteRoutingError: Error {
  case retryable
  case terminal
}

struct MapKitHomeboardCommuteRoutingProvider: HomeboardCommuteRoutingProviding {
  func route(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    mode: SharedCommuteMode,
    departureDate: Date?
  ) async throws -> SharedRouteResult? {
    let request = MKDirections.Request()
    request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin))
    request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination))
    request.transportType = switch mode {
    case .transit: .transit
    case .walking: .walking
    case .automobile: .automobile
    }
    request.requestsAlternateRoutes = false
    if mode == .transit { request.departureDate = departureDate }

    let response: MKDirections.Response
    do {
      response = try await MKDirections(request: request).calculate()
    } catch {
      if Self.failureIsRetryable(error) {
        throw HomeboardCommuteRoutingError.retryable
      }
      throw HomeboardCommuteRoutingError.terminal
    }
    guard let route = response.routes.min(by: {
      $0.expectedTravelTime < $1.expectedTravelTime
    }) else { return nil }
    let fallbackMode = Self.commuteMode(
      for: route.transportType,
      fallback: mode
    )
    let coordinates = Self.routeCoordinates(from: route.polyline)
    guard coordinates.count >= 2 else { return nil }
    let legs = Self.routeLegResults(for: route, fallbackMode: fallbackMode)
    let actualMode: SharedCommuteMode
    if mode == .transit, legs.contains(where: { $0.mode == .transit }) {
      actualMode = .transit
    } else if legs.allSatisfy({ $0.mode == .walking }) {
      actualMode = .walking
    } else {
      actualMode = fallbackMode
    }
    let transitKind = legs
      .filter { $0.mode == .transit }
      .max { $0.coordinates.count < $1.coordinates.count }?
      .transitKind
    return SharedRouteResult(
      minutes: max(1, Int((route.expectedTravelTime / 60).rounded())),
      distanceMeters: route.distance > 0 ? route.distance : nil,
      stepCount: route.steps.count,
      actualMode: actualMode,
      transitKind: transitKind,
      coordinates: coordinates,
      legs: legs
    )
  }

  func coordinate(for query: String) async throws -> CLLocationCoordinate2D? {
    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = query
    do {
      return try await MKLocalSearch(request: request).start().mapItems.first?.placemark.coordinate
    } catch {
      if Self.failureIsRetryable(error) {
        throw HomeboardCommuteRoutingError.retryable
      }
      throw HomeboardCommuteRoutingError.terminal
    }
  }

  private static func failureIsRetryable(_ error: Error) -> Bool {
    if error is CancellationError { return false }
    if let mapError = error as? MKError {
      switch mapError.code {
      case .unknown, .serverFailure, .loadingThrottled: return true
      case .placemarkNotFound, .directionsNotFound, .decodingFailed: return false
      @unknown default: return false
      }
    }
    if let urlError = error as? URLError {
      switch urlError.code {
      case .timedOut, .cannotFindHost, .cannotConnectToHost,
           .networkConnectionLost, .dnsLookupFailed,
           .notConnectedToInternet, .resourceUnavailable:
        return true
      default:
        return false
      }
    }
    return true
  }

  private static func routeLegResults(
    for route: MKRoute,
    fallbackMode: SharedCommuteMode
  ) -> [SharedRouteLegResult] {
    struct Draft {
      let mode: SharedCommuteMode
      let transitKind: SharedTransitKind?
      var distance: CLLocationDistance
      var coordinates: [SharedRouteCoordinate]
    }
    var drafts: [Draft] = []
    for step in route.steps {
      let coordinates = routeCoordinates(from: step.polyline)
      guard coordinates.count >= 2 else { continue }
      let mode = commuteMode(
        for: step.transportType,
        fallback: fallbackMode,
        instructions: step.instructions
      )
      let transitKind = mode == .transit ? inferredTransitKind(from: [step]) : nil
      if let lastIndex = drafts.indices.last,
         drafts[lastIndex].mode == mode,
         drafts[lastIndex].transitKind == transitKind {
        drafts[lastIndex].distance += max(step.distance, 0)
        drafts[lastIndex].coordinates = joinedRouteCoordinates(
          drafts[lastIndex].coordinates,
          coordinates
        )
      } else {
        drafts.append(Draft(
          mode: mode,
          transitKind: transitKind,
          distance: max(step.distance, 0),
          coordinates: coordinates
        ))
      }
    }
    if drafts.isEmpty {
      let coordinates = routeCoordinates(from: route.polyline)
      guard coordinates.count >= 2 else { return [] }
      drafts = [Draft(
        mode: fallbackMode,
        transitKind: fallbackMode == .transit ? inferredTransitKind(from: route.steps) : nil,
        distance: max(route.distance, 1),
        coordinates: coordinates
      )]
    }
    let weights = drafts.map { draft -> Double in
      let metersPerSecond: Double = switch draft.mode {
      case .walking: 1.3
      case .automobile: 8.5
      case .transit:
        switch draft.transitKind {
        case .bus: 5.5
        case .train: 11.0
        case .ferry: 8.0
        case .transit, nil: 7.0
        }
      }
      return max(draft.distance, 25) / metersPerSecond
    }
    let totalWeight = max(weights.reduce(0, +), 1)
    let totalSeconds = max(route.expectedTravelTime, 60)
    return drafts.enumerated().map { index, draft in
      SharedRouteLegResult(
        mode: draft.mode,
        transitKind: draft.transitKind,
        minutes: max(1, Int((totalSeconds * weights[index] / totalWeight / 60).rounded())),
        coordinates: draft.coordinates
      )
    }
  }

  private static func commuteMode(
    for transportType: MKDirectionsTransportType,
    fallback: SharedCommuteMode,
    instructions: String = ""
  ) -> SharedCommuteMode {
    if transportType == .walking || instructions.localizedCaseInsensitiveContains("walk") {
      return .walking
    }
    if transportType == .automobile { return .automobile }
    if transportType == .transit { return .transit }
    return fallback
  }

  private static func routeCoordinates(from polyline: MKPolyline) -> [SharedRouteCoordinate] {
    let points = polyline.points()
    return (0..<polyline.pointCount).map { SharedRouteCoordinate(points[$0].coordinate) }
  }

  private static func joinedRouteCoordinates(
    _ leading: [SharedRouteCoordinate],
    _ trailing: [SharedRouteCoordinate]
  ) -> [SharedRouteCoordinate] {
    guard let last = leading.last,
          let first = trailing.first,
          abs(last.latitude - first.latitude) < 0.000_001,
          abs(last.longitude - first.longitude) < 0.000_001
    else { return leading + trailing }
    return leading + trailing.dropFirst()
  }

  private static func inferredTransitKind(from steps: [MKRoute.Step]) -> SharedTransitKind {
    let routeText = steps
      .flatMap { [$0.instructions, $0.notice ?? ""] }
      .joined(separator: " ")
      .lowercased()
    if routeText.contains("bus") || routeText.contains("coach") { return .bus }
    if routeText.contains("ferry") || routeText.contains("boat") { return .ferry }
    if routeText.contains("train") || routeText.contains("rail")
      || routeText.contains("subway") || routeText.contains("metro")
      || routeText.contains("tram") {
      return .train
    }
    return .transit
  }
}

private struct HomeboardCommuteCacheEntry: Codable, Sendable {
  let accountScope: String
  let result: SharedRouteResult
  let savedAt: Date
}

private struct HomeboardCommuteCachePayload: Codable, Sendable {
  let version: Int
  let entries: [String: HomeboardCommuteCacheEntry]
}

private struct HomeboardCachedRoute: Sendable {
  let result: SharedRouteResult
  let savedAt: Date
  let freshness: HomeboardCommuteFreshness
  let source: HomeboardCommuteEvidenceSource
}

private actor HomeboardCommuteRouteCache {
  private static let version = 2
  private static let maximumEntryCount = 1_200
  private let cacheURL: URL?
  private let now: @Sendable () -> Date
  private var values: [String: HomeboardCommuteCacheEntry]
  private var inFlight: [String: Task<HomeboardCachedRoute?, Never>] = [:]
  private var persistenceTask: Task<Void, Never>?

  init(
    fileManager: FileManager = .default,
    cacheURL: URL? = nil,
    persists: Bool = true,
    now: @escaping @Sendable () -> Date
  ) {
    self.now = now
    guard persists else {
      self.cacheURL = nil
      values = [:]
      return
    }
    let baseURL = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
      ?? fileManager.temporaryDirectory
    let directoryURL = baseURL.appendingPathComponent("HomeboardRouteCache", isDirectory: true)
    try? fileManager.createDirectory(
      at: directoryURL,
      withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
    )
    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    var protectedDirectoryURL = directoryURL
    try? protectedDirectoryURL.setResourceValues(resourceValues)
    let resolvedURL = cacheURL ?? directoryURL.appendingPathComponent(
      "commute-evidence-v2.json",
      isDirectory: false
    )
    self.cacheURL = resolvedURL
    // The superseded comparison cache had no freshness or account boundary.
    try? fileManager.removeItem(
      at: directoryURL.appendingPathComponent("comparison-routes-v1.json")
    )
    if let data = try? Data(contentsOf: resolvedURL),
       let payload = try? JSONDecoder().decode(HomeboardCommuteCachePayload.self, from: data),
       payload.version == Self.version {
      values = payload.entries
    } else {
      values = [:]
    }
  }

  func value(
    for key: String,
    accountScope: String,
    freshFor: TimeInterval,
    staleFor: TimeInterval,
    forceRefresh: Bool,
    operation: @escaping @Sendable () async -> SharedRouteResult?
  ) async -> HomeboardCachedRoute? {
    let current = now()
    let cached = values[key]
    if !forceRefresh, let cached, cached.accountScope == accountScope {
      let age = current.timeIntervalSince(cached.savedAt)
      if age <= freshFor {
        return HomeboardCachedRoute(
          result: cached.result,
          savedAt: cached.savedAt,
          freshness: .fresh,
          source: .appleCache
        )
      }
    }
    if let existing = inFlight[key] { return await existing.value }

    let task = Task<HomeboardCachedRoute?, Never> {
      guard !Task.isCancelled, let result = await operation() else { return nil }
      return HomeboardCachedRoute(
        result: result,
        savedAt: self.now(),
        freshness: .fresh,
        source: .appleLive
      )
    }
    inFlight[key] = task
    let live = await task.value
    inFlight[key] = nil
    if let live {
      values[key] = HomeboardCommuteCacheEntry(
        accountScope: accountScope,
        result: live.result,
        savedAt: live.savedAt
      )
      trimIfNeeded()
      schedulePersistence()
      return live
    }
    if let cached, cached.accountScope == accountScope,
       current.timeIntervalSince(cached.savedAt) <= staleFor {
      return HomeboardCachedRoute(
        result: cached.result,
        savedAt: cached.savedAt,
        freshness: .stale,
        source: .appleStaleCache
      )
    }
    return nil
  }

  func purge(accountScope: String) {
    values = values.filter { $0.value.accountScope != accountScope }
    schedulePersistence()
  }

  func count(accountScope: String? = nil) -> Int {
    guard let accountScope else { return values.count }
    return values.values.filter { $0.accountScope == accountScope }.count
  }

  private func trimIfNeeded() {
    let overflow = values.count - Self.maximumEntryCount
    guard overflow > 0 else { return }
    let oldest = values.sorted { $0.value.savedAt < $1.value.savedAt }
      .prefix(overflow)
      .map(\.key)
    for key in oldest { values[key] = nil }
  }

  private func schedulePersistence() {
    guard cacheURL != nil else { return }
    persistenceTask?.cancel()
    persistenceTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 400_000_000)
      guard !Task.isCancelled else { return }
      await self?.persist()
    }
  }

  private func persist() {
    guard let cacheURL,
          let data = try? JSONEncoder().encode(
            HomeboardCommuteCachePayload(version: Self.version, entries: values)
          )
    else { return }
    try? data.write(to: cacheURL, options: [.atomic, .completeFileProtection])
  }
}

@Observable
@MainActor
final class HomeboardCommuteService {
  struct Scope: Hashable, Sendable {
    let accountID: String
    let boardID: String

    var key: String { "\(accountID)|\(boardID)" }
    var accountScope: String { HomeboardCommuteService.stableSignature(accountID) }
  }

  struct ListingInput: Sendable {
    let id: String
    let latitude: Double?
    let longitude: Double?
    let locationQuery: String
    let manualLine: String
  }

  struct MemberInput: Sendable {
    let id: String
    let name: String
    let destination: String
    let commuteAccess: String?
    let preferredMinutes: Int?
    let maximumMinutes: Int?
  }

  static let shared = HomeboardCommuteService()
  private(set) var evaluationsByScope: [String: [String: SharedComparisonCommuteEvidence]] = [:]

  private let provider: HomeboardCommuteRoutingProviding
  private let now: @Sendable () -> Date
  private let sleeper: @Sendable (UInt64) async -> Void
  private let cache: HomeboardCommuteRouteCache
  private var coordinateCache: [String: (coordinate: SharedRouteCoordinate, savedAt: Date)] = [:]

  convenience init() {
    let clock: @Sendable () -> Date = { Date() }
    self.init(
      provider: MapKitHomeboardCommuteRoutingProvider(),
      now: clock,
      sleeper: { try? await Task.sleep(nanoseconds: $0) },
      cache: HomeboardCommuteRouteCache(now: clock)
    )
  }

  init(
    provider: HomeboardCommuteRoutingProviding,
    now: @escaping @Sendable () -> Date,
    sleeper: @escaping @Sendable (UInt64) async -> Void = {
      try? await Task.sleep(nanoseconds: $0)
    },
    persistsCache: Bool = false
  ) {
    self.provider = provider
    self.now = now
    self.sleeper = sleeper
    self.cache = HomeboardCommuteRouteCache(persists: persistsCache, now: now)
  }

  private init(
    provider: HomeboardCommuteRoutingProviding,
    now: @escaping @Sendable () -> Date,
    sleeper: @escaping @Sendable (UInt64) async -> Void,
    cache: HomeboardCommuteRouteCache
  ) {
    self.provider = provider
    self.now = now
    self.sleeper = sleeper
    self.cache = cache
  }

  func evaluation(for listingID: String, scope: Scope) -> SharedComparisonCommuteEvidence? {
    evaluationsByScope[scope.key]?[listingID]
  }

  func evaluations(for scope: Scope) -> [String: SharedComparisonCommuteEvidence] {
    evaluationsByScope[scope.key] ?? [:]
  }

  func groupScores(for scope: Scope) -> [String: Double] {
    evaluations(for: scope).compactMapValues(\.score)
  }

  func purgeAccount(_ accountID: String) {
    let accountScope = Self.stableSignature(accountID)
    evaluationsByScope = evaluationsByScope.filter {
      !$0.key.hasPrefix("\(accountID)|")
    }
    coordinateCache = coordinateCache.filter { !$0.key.hasPrefix("\(accountScope)|") }
    Task { await cache.purge(accountScope: accountScope) }
  }

  func evaluateListings(
    scope: Scope,
    city: String,
    listings: [ListingInput],
    members: [MemberInput],
    forceRefresh: Bool = false
  ) async {
    let relevantMembers = members.filter {
      $0.commuteAccess != "remote"
        && $0.commuteAccess != "skip"
        && !$0.destination.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    var current = evaluationsByScope[scope.key] ?? [:]
    let listingIDs = Set(listings.map(\.id))
    current = current.filter { listingIDs.contains($0.key) }
    for listing in listings where current[listing.id] == nil || forceRefresh {
      current[listing.id] = Self.placeholderEvidence(
        listingID: listing.id,
        state: .loading,
        manualLine: listing.manualLine
      )
    }
    evaluationsByScope[scope.key] = current

    let targets = await resolvedTargets(scope: scope, city: city, members: relevantMembers)
    guard !Task.isCancelled else { return }
    let batchSize = 3
    for start in stride(from: 0, to: listings.count, by: batchSize) {
      guard !Task.isCancelled else { return }
      let end = min(start + batchSize, listings.count)
      let batch = Array(listings[start..<end])
      let resolved = await withTaskGroup(
        of: (String, SharedComparisonCommuteEvidence).self,
        returning: [(String, SharedComparisonCommuteEvidence)].self
      ) { group in
        for listing in batch {
          group.addTask { [provider, now, sleeper, cache] in
            let origin: CLLocationCoordinate2D?
            if let latitude = listing.latitude, let longitude = listing.longitude {
              origin = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            } else {
              origin = await Self.resolveCoordinateWithRetries(
                query: [listing.locationQuery, city]
                  .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                  .joined(separator: ", "),
                provider: provider,
                sleeper: sleeper
              )
            }
            guard let origin else {
              return (listing.id, Self.placeholderEvidence(
                listingID: listing.id,
                state: .failed,
                manualLine: listing.manualLine
              ))
            }
            let evidence = await Self.buildEvidence(
              scope: scope,
              listingID: listing.id,
              manualLine: listing.manualLine,
              origin: origin,
              targets: targets,
              expectedDestinationCount: relevantMembers.count,
              includeAlternatives: false,
              forceRefresh: forceRefresh,
              provider: provider,
              now: now,
              sleeper: sleeper,
              cache: cache
            )
            return (listing.id, evidence)
          }
        }
        var values: [(String, SharedComparisonCommuteEvidence)] = []
        for await value in group { values.append(value) }
        return values
      }
      guard !Task.isCancelled else { return }
      var next = evaluationsByScope[scope.key] ?? [:]
      for (listingID, evidence) in resolved { next[listingID] = evidence }
      evaluationsByScope[scope.key] = next
    }
  }

  func evidence(
    scope: Scope,
    listingID: String,
    manualLine: String,
    origin: CLLocationCoordinate2D,
    targets: [SharedComparisonCommuteTarget],
    expectedDestinationCount: Int? = nil,
    includeAlternatives: Bool = false,
    forceRefresh: Bool = false
  ) async -> SharedComparisonCommuteEvidence {
    let value = await Self.buildEvidence(
      scope: scope,
      listingID: listingID,
      manualLine: manualLine,
      origin: origin,
      targets: targets,
      expectedDestinationCount: expectedDestinationCount ?? targets.count,
      includeAlternatives: includeAlternatives,
      forceRefresh: forceRefresh,
      provider: provider,
      now: now,
      sleeper: sleeper,
      cache: cache
    )
    guard !Task.isCancelled else { return value }
    var current = evaluationsByScope[scope.key] ?? [:]
    current[listingID] = value
    evaluationsByScope[scope.key] = current
    return value
  }

  func resolvedTargets(
    scope: Scope,
    city: String,
    members: [MemberInput]
  ) async -> [SharedComparisonCommuteTarget] {
    var targets: [SharedComparisonCommuteTarget] = []
    for member in members {
      guard !Task.isCancelled,
            member.commuteAccess != "remote",
            member.commuteAccess != "skip"
      else { continue }
      let destination = member.destination.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !destination.isEmpty else { continue }
      let signature = Self.stableSignature(destination.lowercased())
      let key = "\(scope.accountScope)|\(scope.boardID)|\(signature)|\(city.lowercased())"
      let coordinate: CLLocationCoordinate2D?
      if let cached = coordinateCache[key],
         now().timeIntervalSince(cached.savedAt) <= 24 * 60 * 60 {
        coordinate = cached.coordinate.mapCoordinate
      } else {
        coordinate = await Self.resolveCoordinateWithRetries(
          query: [destination, city]
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: ", "),
          provider: provider,
          sleeper: sleeper
        )
        if let coordinate {
          coordinateCache[key] = (SharedRouteCoordinate(coordinate), now())
        }
      }
      guard let coordinate else { continue }
      targets.append(SharedComparisonCommuteTarget(
        id: signature,
        memberID: member.id,
        memberName: member.name,
        destination: destination,
        destinationSignature: signature,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        commuteAccess: member.commuteAccess,
        preferredMinutes: member.preferredMinutes,
        maximumMinutes: member.maximumMinutes
      ))
    }
    return targets
  }

  func cachedEntryCount(accountID: String? = nil) async -> Int {
    await cache.count(accountScope: accountID.map(Self.stableSignature))
  }

  private static func buildEvidence(
    scope: Scope,
    listingID: String,
    manualLine: String,
    origin: CLLocationCoordinate2D,
    targets: [SharedComparisonCommuteTarget],
    expectedDestinationCount: Int,
    includeAlternatives: Bool,
    forceRefresh: Bool,
    provider: HomeboardCommuteRoutingProviding,
    now: @escaping @Sendable () -> Date,
    sleeper: @escaping @Sendable (UInt64) async -> Void,
    cache: HomeboardCommuteRouteCache
  ) async -> SharedComparisonCommuteEvidence {
    let manualMinutes = HomeboardManualCommuteParser.minutes(from: manualLine)
    guard !targets.isEmpty else {
      return placeholderEvidence(
        listingID: listingID,
        state: expectedDestinationCount > 0 ? .failed : (manualMinutes == nil ? .unknown : .known),
        manualLine: manualLine,
        requestedDestinations: expectedDestinationCount
      )
    }
    var durations: [Int] = []
    var easeDurations: [Int] = []
    var memberScores: [Double] = []
    var evaluated = 0
    var suppressed = 0
    var usedWalkingFallback = false
    var displayedRouteIDs = Set<String>()
    var scoredRouteIDs = Set<String>()
    var snapshots: [SharedComparisonRouteSnapshot] = []

    for target in targets {
      guard !Task.isCancelled else {
        return placeholderEvidence(listingID: listingID, state: .unknown, manualLine: manualLine)
      }
      let destination = CLLocationCoordinate2D(
        latitude: target.latitude,
        longitude: target.longitude
      )
      let preferred = max(target.preferredMinutes ?? 0, 0)
      let maximum = max(target.maximumMinutes ?? 45, preferred + 5)
      if shouldSkipClearlyImpracticalRoute(
        from: origin,
        to: destination,
        preferredMinutes: target.preferredMinutes,
        maximumMinutes: target.maximumMinutes
      ) {
        suppressed += 1
        continue
      }

      var visible: [(SharedCommuteMode, HomeboardCachedRoute)] = []
      for requestedMode in SharedCommuteRouteLogic.routeModes(
        for: target.commuteAccess,
        includeAlternatives: includeAlternatives
      ) {
        guard !Task.isCancelled else { break }
        let route = await cachedRoute(
          scope: scope,
          origin: origin,
          destination: destination,
          requestedMode: requestedMode,
          forceRefresh: forceRefresh,
          provider: provider,
          now: now,
          sleeper: sleeper,
          cache: cache
        )
        guard let route else { continue }
        let actualMode = route.result.actualMode
        // A walking-only response to a transit request is a walking fallback,
        // never proof that Apple returned a usable transit itinerary.
        if requestedMode == .transit,
           actualMode != .transit,
           actualMode != .walking {
          continue
        }
        guard SharedCommuteRouteLogic.permits(
          actualMode,
          access: target.commuteAccess
        ) else { continue }
        if !visible.contains(where: { $0.0 == actualMode }) {
          visible.append((actualMode, route))
        }
        if !includeAlternatives,
           SharedCommuteRouteLogic.permits(actualMode, access: target.commuteAccess) {
          break
        }
      }

      for (mode, route) in visible {
        let ease = SharedCommuteRouteLogic.easeAdjustedMinutes(
          mode: mode,
          minutes: route.result.minutes,
          stepCount: route.result.stepCount,
          access: target.commuteAccess
        )
        snapshots.append(SharedComparisonRouteSnapshot(
          targetID: target.id,
          memberID: target.memberID,
          memberName: target.memberName,
          destination: target.destination,
          destinationSignature: target.destinationSignature,
          commuteAccess: target.commuteAccess,
          mode: mode,
          transitKind: route.result.transitKind,
          minutes: route.result.minutes,
          distanceMeters: route.result.distanceMeters,
          easeMinutes: ease,
          score: SharedComparisonMath.commuteScore(
            minutes: ease,
            preferredMinutes: target.preferredMinutes,
            maximumMinutes: target.maximumMinutes
          ),
          preferredMinutes: preferred,
          maximumMinutes: maximum,
          computedAt: route.savedAt,
          freshness: route.freshness,
          source: route.source,
          state: .known,
          coordinates: route.result.coordinates,
          legs: route.result.legs
        ))
      }

      let eligible = visible.filter {
        SharedCommuteRouteLogic.permits($0.0, access: target.commuteAccess)
      }
      let primary = eligible.min {
        SharedCommuteRouteLogic.easeAdjustedMinutes(
          mode: $0.0,
          minutes: $0.1.result.minutes,
          stepCount: $0.1.result.stepCount,
          access: target.commuteAccess
        ) < SharedCommuteRouteLogic.easeAdjustedMinutes(
          mode: $1.0,
          minutes: $1.1.result.minutes,
          stepCount: $1.1.result.stepCount,
          access: target.commuteAccess
        )
      }
      guard let primary else { continue }
      let ease = SharedCommuteRouteLogic.easeAdjustedMinutes(
        mode: primary.0,
        minutes: primary.1.result.minutes,
        stepCount: primary.1.result.stepCount,
        access: target.commuteAccess
      )
      let memberScore = SharedComparisonMath.commuteScore(
        minutes: ease,
        preferredMinutes: target.preferredMinutes,
        maximumMinutes: target.maximumMinutes
      )
      evaluated += 1
      durations.append(primary.1.result.minutes)
      easeDurations.append(ease)
      memberScores.append(memberScore)
      usedWalkingFallback = usedWalkingFallback || primary.0 == .walking
      let routeID = "\(target.id)|\(primary.0.rawValue)"
      scoredRouteIDs.insert(routeID)
      if memberScore > 0 { displayedRouteIDs.insert(routeID) }
    }

    let fullyResolved = evaluated == expectedDestinationCount
    let score: Double?
    if fullyResolved, let worst = memberScores.min() {
      let average = memberScores.reduce(0, +) / Double(memberScores.count)
      score = average * 0.72 + worst * 0.28
    } else {
      score = nil
    }
    let sources = snapshots.map(\.source)
    let source: HomeboardCommuteEvidenceSource? = sources.contains(.appleStaleCache)
      ? .appleStaleCache
      : sources.contains(.appleLive)
        ? .appleLive
        : sources.contains(.appleCache)
          ? .appleCache
          : manualMinutes == nil ? nil : .manual
    let computedAt = snapshots.map(\.computedAt).min()
    let averageMinutes = durations.isEmpty
      ? 0
      : Int((Double(durations.reduce(0, +)) / Double(durations.count)).rounded())
    let averageEaseMinutes = easeDurations.isEmpty
      ? 0
      : Int((Double(easeDurations.reduce(0, +)) / Double(easeDurations.count)).rounded())
    return SharedComparisonCommuteEvidence(
      listingID: listingID,
      score: score,
      averageMinutes: averageMinutes,
      averageEaseMinutes: averageEaseMinutes,
      worstMemberScore: memberScores.min(),
      resolvedDestinations: evaluated,
      requestedDestinations: expectedDestinationCount,
      suppressedLongRouteDestinations: suppressed,
      usedWalkingFallback: usedWalkingFallback,
      displayedRouteIDs: displayedRouteIDs,
      scoredRouteIDs: scoredRouteIDs,
      routeSnapshots: snapshots,
      state: fullyResolved ? .known : (evaluated > 0 ? .unknown : .failed),
      source: source,
      freshness: source == .appleStaleCache ? .stale : source == nil ? nil : .fresh,
      computedAt: computedAt,
      manualMinutes: manualMinutes
    )
  }

  private static func cachedRoute(
    scope: Scope,
    origin: CLLocationCoordinate2D,
    destination: CLLocationCoordinate2D,
    requestedMode: SharedCommuteMode,
    forceRefresh: Bool,
    provider: HomeboardCommuteRoutingProviding,
    now: @escaping @Sendable () -> Date,
    sleeper: @escaping @Sendable (UInt64) async -> Void,
    cache: HomeboardCommuteRouteCache
  ) async -> HomeboardCachedRoute? {
    let keyMaterial = [
      scope.accountScope,
      stableSignature(scope.boardID),
      String(format: "%.5f,%.5f", origin.latitude, origin.longitude),
      String(format: "%.5f,%.5f", destination.latitude, destination.longitude),
      requestedMode.rawValue,
    ].joined(separator: "|")
    let key = stableSignature(keyMaterial)
    let freshFor: TimeInterval = requestedMode == .transit ? 30 * 60 : 6 * 60 * 60
    return await cache.value(
      for: key,
      accountScope: scope.accountScope,
      freshFor: freshFor,
      staleFor: 48 * 60 * 60,
      forceRefresh: forceRefresh
    ) {
      await routeWithRetries(
        from: origin,
        to: destination,
        mode: requestedMode,
        departureDate: requestedMode == .transit ? now() : nil,
        provider: provider,
        sleeper: sleeper
      )
    }
  }

  private static func routeWithRetries(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    mode: SharedCommuteMode,
    departureDate: Date?,
    provider: HomeboardCommuteRoutingProviding,
    sleeper: @escaping @Sendable (UInt64) async -> Void
  ) async -> SharedRouteResult? {
    let maximumAttempts = 3
    for attempt in 0..<maximumAttempts {
      guard !Task.isCancelled else { return nil }
      do {
        return try await provider.route(
          from: origin,
          to: destination,
          mode: mode,
          departureDate: departureDate
        )
      } catch HomeboardCommuteRoutingError.terminal {
        return nil
      } catch is CancellationError {
        return nil
      } catch {
        guard attempt < maximumAttempts - 1 else { return nil }
        await sleeper(UInt64(350_000_000 * (1 << attempt)))
      }
    }
    return nil
  }

  private static func resolveCoordinateWithRetries(
    query: String,
    provider: HomeboardCommuteRoutingProviding,
    sleeper: @escaping @Sendable (UInt64) async -> Void
  ) async -> CLLocationCoordinate2D? {
    guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    for attempt in 0..<3 {
      guard !Task.isCancelled else { return nil }
      do {
        return try await provider.coordinate(for: query)
      } catch HomeboardCommuteRoutingError.terminal {
        return nil
      } catch is CancellationError {
        return nil
      } catch {
        guard attempt < 2 else { return nil }
        await sleeper(UInt64(350_000_000 * (1 << attempt)))
      }
    }
    return nil
  }

  private static func shouldSkipClearlyImpracticalRoute(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    preferredMinutes: Int?,
    maximumMinutes: Int?
  ) -> Bool {
    let directDistance = CLLocation(
      latitude: origin.latitude,
      longitude: origin.longitude
    ).distance(from: CLLocation(
      latitude: destination.latitude,
      longitude: destination.longitude
    ))
    // A generous 120 mph lower bound avoids asking Apple for a cross-country
    // polyline only when even that impossible best case scores zero.
    let optimisticMetersPerMinute = 120.0 * 1_609.344 / 60.0
    let optimisticMinutes = max(Int(ceil(directDistance / optimisticMetersPerMinute)), 1)
    let maximum = max(maximumMinutes ?? 45, (preferredMinutes ?? 0) + 5)
    guard optimisticMinutes > maximum else { return false }
    return SharedComparisonMath.commuteScore(
      minutes: optimisticMinutes,
      preferredMinutes: preferredMinutes,
      maximumMinutes: maximumMinutes
    ) == 0
  }

  nonisolated private static func placeholderEvidence(
    listingID: String,
    state: HomeboardCommuteEvidenceState,
    manualLine: String,
    requestedDestinations: Int = 0
  ) -> SharedComparisonCommuteEvidence {
    let manualMinutes = HomeboardManualCommuteParser.minutes(from: manualLine)
    return SharedComparisonCommuteEvidence(
      listingID: listingID,
      score: nil,
      averageMinutes: 0,
      averageEaseMinutes: 0,
      worstMemberScore: nil,
      resolvedDestinations: 0,
      requestedDestinations: requestedDestinations,
      suppressedLongRouteDestinations: 0,
      usedWalkingFallback: false,
      displayedRouteIDs: [],
      scoredRouteIDs: [],
      routeSnapshots: [],
      state: manualMinutes == nil ? state : .known,
      source: manualMinutes == nil ? nil : .manual,
      freshness: manualMinutes == nil ? nil : .fresh,
      computedAt: nil,
      manualMinutes: manualMinutes
    )
  }

  nonisolated static func stableSignature(_ value: String) -> String {
    var hash: UInt64 = 14_695_981_039_346_656_037
    for byte in value.utf8 {
      hash ^= UInt64(byte)
      hash &*= 1_099_511_628_211
    }
    return String(hash, radix: 16)
  }
}
