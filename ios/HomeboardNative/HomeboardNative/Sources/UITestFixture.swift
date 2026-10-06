#if DEBUG
import Foundation
import Observation
import SwiftUI
#if canImport(FoundationModels)
import FoundationModels
#endif

// ──────────────────────────────────────────────────────────────────────────────
// MARK: - Seeded fixture data
// ──────────────────────────────────────────────────────────────────────────────

enum UITestFixture {

  // MARK: Static identifiers used by both app code and XCUITest assertions.

  static let boardID = "fixture-board-001"
  static let boardTitle = "SF Search · Sam & Co"
  static let boardCity = "San Francisco, CA"

  // Member IDs
  static let samUserID = "fixture-user-sam"
  static let alexUserID = "fixture-user-alex"
  static let jordanUserID = "fixture-user-jordan"

  // Listing IDs (board-scoped)
  static let listing1ID = "fixture-listing-001"
  static let listing2ID = "fixture-listing-002"
  static let listing3ID = "fixture-listing-003"

  // Advisor mode env var
  static let advisorModeEnvKey = "UITEST_ADVISOR_MODE"
  static let advisorModeFail = "fail"

  // ── Session ──────────────────────────────────────────────────────────────

  static let session = NativeAuthSession(
    accessToken: "fixture-access-token",
    refreshToken: "fixture-refresh-token",
    userId: samUserID,
    email: "sam@example.com",
    displayName: "Sam"
  )

  static let account = LocalAccount(
    id: samUserID,
    name: "Sam",
    email: "sam@example.com"
  )

  // ── Members ───────────────────────────────────────────────────────────────

  static let members: [MemberPreferenceCard] = [
    MemberPreferenceCard(
      id: "fixture-member-sam",
      userId: samUserID,
      role: "owner",
      name: "Sam",
      budgetMin: 2500,
      idealBudget: 3000,
      budgetMax: 3500,
      budgetLine: "$2,500–$3,500/mo",
      commuteDestination: "1 Market St, San Francisco, CA",
      commuteAccess: "transit",
      preferredCommuteMinutes: 25,
      maxCommuteMinutes: 40,
      commuteLine: "22 min to SoMa",
      priorities: ["commute", "price"],
      dealbreakers: ["shared laundry"],
      neighborhoods: ["Mission", "Castro"],
      status: "active"
    ),
    MemberPreferenceCard(
      id: "fixture-member-alex",
      userId: alexUserID,
      role: "member",
      name: "Alex",
      budgetMin: 2000,
      idealBudget: 2500,
      budgetMax: 3000,
      budgetLine: "$2,000–$3,000/mo",
      commuteDestination: "1355 Market St, San Francisco, CA",
      commuteAccess: "car",
      preferredCommuteMinutes: 20,
      maxCommuteMinutes: 35,
      commuteLine: "18 min to Financial District",
      priorities: ["space", "natural light"],
      dealbreakers: ["no pets allowed"],
      neighborhoods: ["Hayes Valley", "Noe Valley"],
      status: "active"
    ),
    MemberPreferenceCard(
      id: "fixture-member-jordan",
      userId: jordanUserID,
      role: "member",
      name: "Jordan",
      budgetMin: 1800,
      idealBudget: 2200,
      budgetMax: 2600,
      budgetLine: "$1,800–$2,600/mo",
      commuteAccess: "remote",
      commuteLine: "Remote",
      priorities: ["neighborhood vibe", "outdoor space"],
      dealbreakers: ["top-floor walk-up"],
      neighborhoods: ["Outer Sunset", "Inner Sunset"],
      status: "active"
    ),
  ]

  // ── Listings ──────────────────────────────────────────────────────────────

  static let listings: [ListingPreview] = [
    ListingPreview(
      id: listing1ID,
      listingId: listing1ID,
      title: "2BR in the Mission",
      address: "123 Valencia St",
      location: "Mission District, SF",
      priceLine: "$3,200/mo",
      commuteLine: "20 min to SoMa",
      summary: "Bright two-bed in the heart of the Mission, steps from Valencia Street dining.",
      fitLabel: "Strong group fit",
      highlights: ["In-unit laundry", "Hardwood floors", "Rooftop deck"],
      openRisks: ["Loud weekend nights"],
      status: "saved",
      latitude: 37.7694,
      longitude: -122.4222
    ),
    ListingPreview(
      id: listing2ID,
      listingId: listing2ID,
      title: "3BR Hayes Valley Flat",
      address: "456 Ivy St",
      location: "Hayes Valley, SF",
      priceLine: "$4,100/mo",
      commuteLine: "15 min to Financial District",
      summary: "Spacious Victorian flat in Hayes Valley, ideal for three roommates.",
      fitLabel: "Good group fit",
      highlights: ["Private garden", "Original details", "Dishwasher"],
      openRisks: ["Split bathrooms"],
      status: "saved",
      latitude: 37.7772,
      longitude: -122.4242
    ),
    ListingPreview(
      id: listing3ID,
      listingId: listing3ID,
      title: "2BR Noe Valley Sun-Trap",
      address: "789 Sanchez St",
      location: "Noe Valley, SF",
      priceLine: "$3,500/mo",
      commuteLine: "25 min to SoMa",
      summary: "South-facing 2BR with a deck and stunning views toward Twin Peaks.",
      fitLabel: "Fair group fit",
      highlights: ["Panoramic views", "Deck", "Pet-friendly"],
      openRisks: ["One parking spot only"],
      status: "saved",
      latitude: 37.7510,
      longitude: -122.4292
    ),
  ]

  // ── Chat messages ─────────────────────────────────────────────────────────

  static let chatMessages: [BoardMessage] = [
    BoardMessage(
      id: "fixture-msg-001",
      role: "user",
      authorName: "Alex",
      content: "The Hayes Valley flat looks amazing for the space.",
      createdAt: "2026-09-01T10:00:00Z"
    ),
    BoardMessage(
      id: "fixture-msg-002",
      role: "user",
      authorName: "Jordan",
      content: "Agreed, but the split bathrooms might be tricky for three people.",
      createdAt: "2026-09-01T10:05:00Z"
    ),
    BoardMessage(
      id: "fixture-msg-003",
      role: "user",
      authorName: "Sam",
      content: "Let's also look at the Mission 2BR. It's under budget.",
      createdAt: "2026-09-01T10:10:00Z"
    ),
  ]

  // ── Board ─────────────────────────────────────────────────────────────────

  static let board = MobileBoard(
    id: boardID,
    revision: "fixture-rev-1",
    title: boardTitle,
    city: boardCity,
    moveInTimeline: "November 2026",
    groupSize: "3 roommates",
    budgetLine: "$3,200–$4,100/mo",
    commuteTargets: ["SoMa", "Financial District"],
    readiness: "Profile complete",
    completionLine: "All three members have added their preferences.",
    nextBestAction: "Start a group vote on the Mission listing.",
    inviteCode: "FIXTURE1",
    recentActivity: [
      "Alex added the Hayes Valley flat.",
      "Sam saved the Mission 2BR.",
    ],
    chatMessages: chatMessages,
    openQuestions: [],
    members: members,
    suggestions: listings,
    shortlist: listings,
    recentlyDeleted: [],
    invitations: [
      BoardInvitationSummary(
        id: "fixture-inv-001",
        email: nil,
        inviteCode: "FIXTURE1",
        status: "pending"
      )
    ]
  )

  // ── Wallet (active) ───────────────────────────────────────────────────────

  static let walletActive = AdvisorWalletStatus(
    rolling7DayTotalCents: 400,
    thresholdCents: 400,
    remainingCents: 0,
    windowStartedAt: "2026-09-28T00:00:00Z",
    subscription: AdvisorSubscriptionStatus(active: true, validUntil: "2026-10-05T00:00:00Z")
  )

  static let walletInactive = AdvisorWalletStatus(
    rolling7DayTotalCents: 150,
    thresholdCents: 400,
    remainingCents: 250,
    windowStartedAt: "2026-09-28T00:00:00Z",
    subscription: AdvisorSubscriptionStatus(active: false, validUntil: nil)
  )

  // ── Profile ───────────────────────────────────────────────────────────────

  static var profile: RentalProfile {
    var p = RentalProfile()
    p.name = "Sam"
    p.city = boardCity
    p.moveInDate = "2026-11-01"
    p.groupSize = 3
    p.budgetMin = "2500"
    p.budgetMax = "4100"
    p.commuteTarget = "SoMa, SF"
    p.commuteAccess = "transit"
    p.minCommuteMinutes = "10"
    p.maxCommuteMinutes = "35"
    p.neighborhoods = ["Mission", "Hayes Valley", "Noe Valley"]
    p.mustHaves = ["in-unit laundry", "pet-friendly"]
    p.dealbreakers = ["no laundry in building"]
    p.priorities = ["price", "commute", "space"]
    p.advisorSetupVersion = 2
    return p
  }

}

/// A single launch contract, with provider selection independent of backend failures.
/// No test provider claims Apple Intelligence: its schema source is device_template.
@MainActor @Observable
final class UITestFixtureState {
  static let shared = UITestFixtureState()
  nonisolated static var enabled: Bool {
    ProcessInfo.processInfo.arguments.contains("-homeboard.uiTestFixture")
  }
  let provider = ProcessInfo.processInfo.environment["UITEST_ADVISOR_PROVIDER"] ?? "deterministic"
  let scenario = ProcessInfo.processInfo.environment["UITEST_ADVISOR_MODE"] ?? "ok"
  let onboarding = ProcessInfo.processInfo.environment["UITEST_ONBOARDING"] == "1"
  let inactive = ProcessInfo.processInfo.environment["UITEST_WALLET_INACTIVE"] == "1"
  let delayed = ProcessInfo.processInfo.environment["UITEST_DELAY_GENERATION"] == "1"
  var board: MobileBoard = {
    var board = UITestFixture.board
    board.ranking = UITestFixture.listings.enumerated().map { index, listing in
      MobileListingRanking(boardListingId: listing.id, listingId: listing.listingId, position: index + 1,
        label: listing.fitLabel, verdict: "Synthetic fixture score", overallScore: Double(86 - index * 8),
        lowestRoommateScore: Double(75 - index * 5), fairnessScore: Double(86 - index * 8), confidence: "high")
    }
    return board
  }()
  var profile: [String: Any] = [
    "name": "Sam", "email": "sam@example.com", "city": UITestFixture.boardCity,
    "moveInDate": "2026-11-01", "budgetMin": 2500, "budgetMax": 4100,
    "commuteTarget": "SoMa", "commuteAccess": "transit", "minCommuteMinutes": 10,
    "maxCommuteMinutes": 35, "neighborhoods": ["Mission"], "mustHaves": ["laundry"],
    "dealbreakers": ["walk-up"], "priorities": ["price", "space"], "groupSize": 3,
    "rentalReadiness": ["hasOfferLetter": false, "hasProofOfIncome": true, "needsGuarantor": false],
    "advisorSetupVersion": 2
  ]
  var requests: [String] = []
  var unexpected: [String] = []
  var generations: [[String: Any]] = []
  var acceptances: [[String: Any]] = []
  var postCount = 0
  var patchCount = 0
  var boardReadCount = 0
  var lastReadMessages: [[String: Any]] = []
  var delayedPostStarted = false
  var modelDiagnostics: [[String: String]] = []
  var created = false

  var availability: String {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return String(describing: SystemLanguageModel.default.availability)
    }
    #endif
    return "FoundationModels requires iOS 26 and a supported ready device"
  }
  var modelAvailable: Bool {
    #if canImport(FoundationModels)
    if #available(iOS 26.0, *) { return SystemLanguageModel.default.isAvailable }
    #endif
    return false
  }
  var diagnostics: String {
    let result: [String: Any] = [
      "provider": provider, "modelAvailable": modelAvailable, "availability": availability,
      "requests": requests, "unexpected": unexpected, "generations": generations,
      "acceptances": acceptances, "postCount": postCount, "patchCount": patchCount,
      "boardReadCount": boardReadCount, "lastReadMessages": lastReadMessages, "storedMessages": object(board.chatMessages),
      "delayedPostStarted": delayedPostStarted, "modelDiagnostics": modelDiagnostics,
      "boardTitle": board.title, "inviteCode": board.inviteCode, "inviteURL": "https://example.com/invite/\(board.inviteCode)",
      "storedListings": object(board.shortlist), "created": created
    ]
    return String(data: try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!
  }
  func object<T: Encodable>(_ value: T) -> Any {
    try! JSONSerialization.jsonObject(with: JSONEncoder().encode(value), options: [.fragmentsAllowed])
  }
  func load(_ payload: AdvisorMessagePayload? = nil) -> [String: Any] {
    var result: [String: Any] = ["board": object(board), "profile": profile, "missingFields": []]
    if let payload { result["advisorPayload"] = object(payload) }
    return result
  }
  func generate(payload: AdvisorMessagePayload, tone: String, toggles: [AdvisorToggleOption],
                financialSentence: String?, senderName: String) async -> AdvisorDraftGeneration {
    let index = generations.count
    let enabled = toggles.filter(\.enabled).map(\.id).sorted().joined(separator: ",")
    var entry: [String: Any] = ["invocation": index + 1, "messageId": payload.messageId ?? "",
      "originalCommand": payload.originalCommand ?? "", "context": object(payload.context),
      "tone": tone, "toggles": object(toggles), "completed": false]
    generations.append(entry)
    if delayed && tone == "Casual" {
      // Deliberately finish despite task cancellation, to exercise the real card revision guard.
      await withCheckedContinuation { continuation in
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { continuation.resume() }
      }
    }
    let text = "Fixture generation \(index + 1) for \(payload.messageId ?? "missing"): \(tone); include \(enabled). Regarding 123 Valencia St, could you confirm availability? Thanks, \(senderName)."
    let output = AdvisorDraftGeneration(text: text, source: "device_template")
    entry["text"] = text
    entry["source"] = output.source
    entry["completed"] = true
    entry["completionOrder"] = generations.filter { $0["completed"] as? Bool == true }.count + 1
    generations[index] = entry
    return output
  }
  func recordRealGeneration(payload: AdvisorMessagePayload, tone: String, toggles: [AdvisorToggleOption],
                            output: AdvisorDraftGeneration) {
    generations.append(["invocation": generations.count + 1, "messageId": payload.messageId ?? "",
      "originalCommand": payload.originalCommand ?? "", "context": object(payload.context),
      "tone": tone, "toggles": object(toggles), "text": output.text, "source": output.source, "completed": true])
  }

  func recordModelDiagnostic(messageId: String, tone: String, stage: String, reason: String) {
    guard modelDiagnostics.count < 20 else { return }
    modelDiagnostics.append([
      "messageId": String(messageId.prefix(80)),
      "tone": String(tone.prefix(40)),
      "stage": String(stage.prefix(40)),
      "reason": String(reason.prefix(80)),
    ])
  }

  func shouldDelayResponse(_ request: URLRequest) -> Bool {
    guard scenario == "delayed-fail", request.httpMethod == "POST" else { return false }
    return request.url?.path == "/api/mobile/boards/\(board.id!)/messages"
  }

  func respond(_ request: URLRequest, body: Data) throws -> (Int, [String: Any]) {
    let path = request.url?.path ?? ""
    let method = request.httpMethod ?? "GET"
    let route = "\(method) \(path)"
    requests.append(route)
    let input = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
    let boardPath = "/api/mobile/boards/\(board.id!)"
    if path.hasPrefix("/api/"), request.url?.host != "homeboard-fixture.invalid" { return reject(route) }
    if route == "POST /auth/v1/token", request.url?.query == "grant_type=refresh_token",
       input["refresh_token"] as? String == UITestFixture.session.refreshToken {
      return (200, ["access_token": UITestFixture.session.accessToken, "refresh_token": UITestFixture.session.refreshToken,
        "user": ["id": UITestFixture.samUserID, "email": "sam@example.com", "user_metadata": ["display_name": "Sam"]]])
    }
    if route == "GET /api/health" {
      return (200, ["apiVersion": "fixture", "serverCommit": "fixture",
        "capabilities": ["advisorDraftAcceptance": scenario != "mismatch"],
        "checks": ["advisorDraftPersistence": "ok"], "routeMethods": ["boardMessages": ["POST", "PATCH"]]])
    }
    if route == "GET /api/mobile/session" {
      return (200, ["user": ["id": UITestFixture.samUserID, "email": "sam@example.com", "displayName": "Sam"],
        "membershipState": onboarding && !created ? "authenticated_no_membership" : "member",
        "boards": onboarding && !created ? [] : [["id": board.id!, "title": board.title, "city": board.city, "createdAt": "", "updatedAt": ""]],
        "activeBoard": onboarding && !created ? NSNull() : load()])
    }
    if route == "POST /api/mobile/onboarding" {
      guard let submitted = input["profile"] as? [String: Any] else { return reject(route) }
      profile.merge(submitted) { _, new in new }
      board.title = "\(profile["name"] as? String ?? "Sam")'s new hunt"
      board.city = profile["city"] as? String ?? UITestFixture.boardCity
      created = true
      var result = load()
      result["boardId"] = board.id!
      return (200, result)
    }
    if route == "GET \(boardPath)" {
      boardReadCount += 1
      lastReadMessages = object(board.chatMessages) as! [[String: Any]]
      return (200, load())
    }
    if route == "GET \(boardPath)/wallet" {
      return (200, object(inactive ? UITestFixture.walletInactive : UITestFixture.walletActive) as! [String: Any])
    }
    if route == "GET \(boardPath)/advisor-finances" {
      return (200, ["mine": ["disclosureMode": "available_on_request", "promptCompletedAt": "2026-09-28T00:00:00Z"],
        "group": ["contributorCount": 0, "memberCount": 3]])
    }
    if route == "GET \(boardPath)/preference-proposals" { return (200, ["preferenceProposal": NSNull()]) }
    if route == "GET \(boardPath)/listings" {
      return (200, ["listings": object(board.shortlist), "hasMore": false, "source": "fixture", "nextCursor": NSNull()])
    }
    if route == "POST /api/mobile/listing-import/preview" {
      guard let url = input["url"] as? String, url == "https://example.com/rental/fixture" else { return reject(route) }
      return (200, ["normalizedUrl": url, "provider": "Fixture", "suggestedAddress": "321 Test Lane",
        "missingEssentialFields": ["price", "bedrooms", "bathrooms"], "notice": "Synthetic listing link confirmed."])
    }
    if route == "POST /api/mobile/invitations" {
      guard input["boardId"] as? String == board.id else { return reject(route) }
      let invite = BoardInvitationSummary(id: "fixture-invite-new", email: nil, inviteCode: "FIXTURE2", status: "pending")
      board.inviteCode = invite.inviteCode
      board.invitations = [invite]
      return (200, ["invitation": object(invite), "inviteUrl": "https://example.com/invite/FIXTURE2"])
    }
    if route == "POST \(boardPath)/updates" || route == "POST \(boardPath)/messages" {
      guard let text = input["content"] as? String ?? input["message"] as? String else { return reject(route) }
      let replyToMessageId = input["replyToMessageId"] as? String
      let replyTarget = replyToMessageId.flatMap { replyID in
        board.chatMessages.first(where: { $0.id == replyID })
      }
      let advisor = text.lowercased().hasPrefix("@advisor")
        || ChatReplySendPolicy.isAdvisorCard(replyTarget)
      if advisor {
        postCount += 1
        if scenario == "fail" || scenario == "delayed-fail" {
          return (500, ["error": "Fixture Advisor POST failure"])
        }
        if inactive { return reject(route) }
      }
      let userMessageID = input["messageId"] as? String ?? "fixture-user-\(board.chatMessages.count)"
      board.chatMessages.append(BoardMessage(
        id: userMessageID, role: "user", authorName: "Sam", content: text,
        createdAt: "2026-09-28T10:00:00Z", replyToMessageId: replyToMessageId
      ))
      if !advisor { return (200, load()) }
      var payload = AdvisorMessagePayload()
      payload.messageId = "fixture-advisor-\(postCount)"
      payload.schemaVersion = 2
      payload.originalCommand = text.lowercased().hasPrefix("@advisor") ? text : "@advisor \(text)"
      payload.draftText = "Initial server template: please regenerate on device."
      payload.executionStatus = "draft_ready"
      payload.generationSource = "server_template"
      payload.financialDisclosure = "available_on_request"
      payload.missingInputs = []
      payload.targetListingBoardId = UITestFixture.listing1ID
      payload.replyToMessageId = ChatReplySendPolicy.isAdvisorCard(replyTarget) ? replyToMessageId : nil
      payload.toggleOptions = [.init(id: "requirements", label: "Group requirements", enabled: true, required: false),
        .init(id: "tour", label: "Request a tour", enabled: true, required: false)]
      payload.context = AdvisorContext(leverage: AdvisorLeverage(memberCount: 3, strongestListings: [
        .init(boardListingId: UITestFixture.listing1ID, listing: "123 Valencia St", rankingLabel: "Strong group fit", fairnessScore: 86, confidence: "high")]),
        requirements: AdvisorRequirements(budget: .init(minimum: 2500, maximum: 4100, summary: "Synthetic shared rent range"),
          moveIn: "November 2026", locations: [UITestFixture.boardCity], bedrooms: 2, mustHaves: ["laundry"],
          priorities: ["price", "commute"], commuteDestinations: ["SoMa"]))
      board.chatMessages.append(BoardMessage(id: payload.messageId!, role: "assistant", authorName: "Advisor", content: "Draft for review", createdAt: "2026-09-28T10:00:01Z", advisorPayload: payload))
      return (200, load(payload))
    }
    if route == "PATCH \(boardPath)/messages" {
      patchCount += 1
      guard let id = input["messageId"] as? String,
            let raw = input["payload"] as? [String: Any],
            let index = board.chatMessages.firstIndex(where: { $0.id == id }),
            let initial = board.chatMessages[index].advisorPayload else { return reject(route) }
      guard let submitted = try? JSONDecoder().decode(AdvisorMessagePayload.self, from: JSONSerialization.data(withJSONObject: raw)) else { return reject(route) }
      guard submitted.messageId == id, submitted.originalCommand == initial.originalCommand,
            submitted.context == initial.context, submitted.executionStatus == "draft_ready",
            ["device_template", "apple_intelligence"].contains(submitted.generationSource ?? ""),
            let time = submitted.clientGeneratedAt, !time.isEmpty,
            !submitted.draftText.isEmpty, submitted.draftText.count <= 4000,
            !AdvisorDraftSafety.hasFinancialPlaceholder(submitted),
            generations.contains(where: {
              $0["messageId"] as? String == id && $0["text"] as? String == submitted.draftText
                && $0["tone"] as? String == submitted.tone && $0["source"] as? String == submitted.generationSource
                && NSDictionary(dictionary: ["toggles": $0["toggles"] ?? []]).isEqual(to: ["toggles": object(submitted.toggleOptions)])
            }) else { return reject(route) }
      var receipt = raw
      receipt["boardId"] = board.id!
      receipt["saved"] = false
      acceptances.append(receipt)
      // First acceptance only fails; recovery uses the real existing UI and next PATCH.
      if scenario == "save-fail" && patchCount == 1 { return (500, ["error": "Fixture accepted draft save failure"]) }
      var saved = submitted
      saved.acceptedAt = "2026-09-28T10:00:02Z"
      board.chatMessages[index].advisorPayload = saved
      acceptances[acceptances.count - 1]["saved"] = true
      return (200, load(saved))
    }
    if route == "POST \(boardPath)/listings" {
      guard let title = input["title"] as? String else { return reject(route) }
      var listing = UITestFixture.listings[0]
      listing.id = "fixture-added-listing"
      listing.listingId = listing.id
      listing.title = title
      listing.address = input["address"] as? String ?? title
      listing.priceLine = "$\(Int(input["price"] as? Double ?? 3200))/mo"
      listing.sourceURL = input["sourceUrl"] as? String ?? ""
      board.shortlist.append(listing)
      return (200, load())
    }
    if method == "POST", path.hasPrefix("\(boardPath)/listings/"), path.hasSuffix("/reactions") {
      let id = path.split(separator: "/").dropLast().last.map(String.init) ?? ""
      guard let index = board.shortlist.firstIndex(where: { $0.id == id }), let vote = input["vote"] as? String else { return reject(route) }
      board.shortlist[index].reactions.removeAll { $0.name == "Sam" }
      board.shortlist[index].reactions.append(.init(name: "Sam", vote: vote, note: nil))
      return (200, load())
    }
    // Explicit auxiliary routes used by bootstrap/settings. Unknown requests are never successes.
    if route == "POST \(boardPath)/recently-deleted" { return (200, [:]) }
    if route == "POST /api/mobile/diagnostics" || route == "DELETE /api/mobile/push-devices" || route == "POST /api/mobile/push-devices" { return (200, [:]) }
    return reject(route)
  }
  private func reject(_ route: String) -> (Int, [String: Any]) {
    unexpected.append(route)
    return (599, ["error": "Unexpected or malformed fixture request: \(route)"])
  }
}

final class HomeboardUITestStubProtocol: URLProtocol {
  override class func canInit(with request: URLRequest) -> Bool { UITestFixtureState.enabled }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  private var responseTask: Task<Void, Never>?
  override func startLoading() {
    let request = request
    responseTask = Task { @MainActor in
      var body = request.httpBody ?? Data()
      if body.isEmpty, let stream = request.httpBodyStream {
        stream.open()
        defer { stream.close() }
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
          let count = stream.read(&buffer, maxLength: buffer.count)
          if count <= 0 { break }
          body.append(buffer, count: count)
        }
      }
      do {
        if UITestFixtureState.shared.shouldDelayResponse(request) {
          UITestFixtureState.shared.delayedPostStarted = true
          try await Task.sleep(for: .seconds(8))
        }
        guard !Task.isCancelled else { return }
        let (status, json) = try UITestFixtureState.shared.respond(request, body: body)
        guard !Task.isCancelled else { return }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: json))
        client?.urlProtocolDidFinishLoading(self)
      } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
  }
  override func stopLoading() { responseTask?.cancel() }
}

struct UITestDiagnosticsModifier: ViewModifier {
  func body(content: Content) -> some View {
    if UITestFixtureState.enabled {
      content.overlay(alignment: .topLeading) {
        Color.clear.frame(width: 1, height: 1)
          .accessibilityElement()
          .accessibilityLabel("Fixture diagnostics")
          .accessibilityIdentifier("homeboard.fixture.diagnostics")
          .accessibilityValue(UITestFixtureState.shared.diagnostics)
          .allowsHitTesting(false)
      }
    } else { content }
  }
}
#endif
