#if DEBUG
import Foundation

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
      status: "saved"
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
      status: "saved"
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
      status: "saved"
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
      content: "Let's also look at the Mission 2BR - it's under budget.",
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
    p.advisorSetupVersion = 1
    return p
  }

  // ── Advisor payload template ──────────────────────────────────────────────

  static func advisorPayload(for command: String) -> AdvisorMessagePayload {
    AdvisorMessagePayload(
      messageId: UUID().uuidString,
      schemaVersion: 2,
      originalCommand: command,
      draftText: "Subject: Inquiry – \(listings[0].address)\n\nHi,\n\nWe are a group of three looking to rent starting November 2026. Could you share availability and next steps?\n\nBest,\nSam",
      tone: "Professional",
      toggleOptions: [
        AdvisorToggleOption(id: "budget", label: "Budget range", enabled: true, required: false),
        AdvisorToggleOption(id: "moveIn", label: "Move-in date", enabled: true, required: false),
      ],
      executionStatus: "draft_ready",
      missingInputs: []
    )
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// MARK: - URLProtocol stub
// ──────────────────────────────────────────────────────────────────────────────

/// Intercepts all network requests in UI test fixture mode and returns
/// pre-canned JSON. No real network calls are made.
final class HomeboardUITestStubProtocol: URLProtocol {

  private static var advisorShouldFail: Bool {
    ProcessInfo.processInfo.environment[UITestFixture.advisorModeEnvKey] == UITestFixture.advisorModeFail
  }

  override class func canInit(with request: URLRequest) -> Bool {
    // Only intercept when the fixture flag is active.
    ProcessInfo.processInfo.arguments.contains("-homeboard.uiTestFixture")
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    let url = request.url?.absoluteString ?? ""
    let response: (statusCode: Int, body: Data)

    if url.contains("/api/mobile/session") {
      response = (200, sessionResponseJSON())
    } else if url.contains("/api/mobile/boards/") && url.contains("/messages") {
      response = Self.advisorShouldFail
        ? (500, serverErrorJSON())
        : (200, sendMessageResponseJSON())
    } else if url.contains("/api/mobile/boards/") && url.contains("/invite") {
      response = (200, inviteResponseJSON())
    } else if url.contains("/api/mobile/boards/") && url.contains("/advisor-wallet") {
      response = (200, walletResponseJSON())
    } else if url.contains("/api/mobile/boards/") && (url.hasSuffix("/load") || request.httpMethod == "GET") {
      response = (200, boardResponseJSON())
    } else if url.contains("/api/mobile/boards/") {
      response = (200, boardResponseJSON())
    } else if url.contains("/api/mobile/listings") || url.contains("/api/mobile/inventory") {
      response = (200, listingInventoryJSON())
    } else if url.contains("/api/health") {
      response = (200, healthJSON())
    } else {
      // Default: return the seeded board response so unknown endpoints don't crash.
      response = (200, boardResponseJSON())
    }

    let httpResponse = HTTPURLResponse(
      url: request.url!,
      statusCode: response.statusCode,
      httpVersion: "HTTP/1.1",
      headerFields: ["Content-Type": "application/json"]
    )!
    client?.urlProtocol(self, didReceive: httpResponse, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: response.body)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  // ── JSON builders ─────────────────────────────────────────────────────────

  private func sessionResponseJSON() -> Data {
    let json: [String: Any] = [
      "user": [
        "id": UITestFixture.samUserID,
        "email": "sam@example.com",
        "displayName": "Sam"
      ],
      "boards": [
        [
          "id": UITestFixture.boardID,
          "title": UITestFixture.boardTitle,
          "city": UITestFixture.boardCity,
          "createdAt": "2026-09-01T00:00:00Z",
          "updatedAt": "2026-09-28T00:00:00Z",
        ]
      ],
      "membershipState": "member",
      "activeBoard": boardLoadPayload()
    ]
    return (try? JSONSerialization.data(withJSONObject: json)) ?? Data()
  }

  private func boardResponseJSON() -> Data {
    let payload = boardLoadPayload()
    return (try? JSONSerialization.data(withJSONObject: payload)) ?? Data()
  }

  private func sendMessageResponseJSON() -> Data {
    let advisorPayload: [String: Any] = [
      "messageId": UUID().uuidString,
      "schemaVersion": 2,
      "originalCommand": "@advisor draft an email",
      "draftText": "Subject: Rental Inquiry – 123 Valencia St\n\nHi,\n\nWe are a group of three interested in your listing starting November 2026.\n\nBest,\nSam",
      "tone": "Professional",
      "toggleOptions": [
        ["id": "budget", "label": "Budget range", "enabled": true, "required": false],
        ["id": "moveIn", "label": "Move-in date", "enabled": true, "required": false],
      ],
      "executionStatus": "draft_ready",
      "missingInputs": [] as [String],
    ]
    let advisorMsg: [String: Any] = [
      "id": UUID().uuidString,
      "role": "assistant",
      "authorName": "Advisor",
      "content": "[Advisor draft ready]",
      "createdAt": ISO8601DateFormatter().string(from: Date()),
      "advisorPayload": advisorPayload
    ]
    var board = boardLoadPayload()
    if var msgs = (board["board"] as? [String: Any])?["chatMessages"] as? [[String: Any]] {
      msgs.append(advisorMsg)
      if var b = board["board"] as? [String: Any] {
        b["chatMessages"] = msgs
        board["board"] = b
      }
    }
    return (try? JSONSerialization.data(withJSONObject: board)) ?? Data()
  }

  private func serverErrorJSON() -> Data {
    let json: [String: Any] = [
      "error": "Internal server error",
      "message": "Advisor service is temporarily unavailable."
    ]
    return (try? JSONSerialization.data(withJSONObject: json)) ?? Data()
  }

  private func inviteResponseJSON() -> Data {
    let json: [String: Any] = [
      "invitation": [
        "id": "fixture-inv-001",
        "email": NSNull(),
        "inviteCode": "FIXTURE1",
        "status": "pending",
      ],
      "inviteUrl": "https://homeboard.app/join/FIXTURE1"
    ]
    return (try? JSONSerialization.data(withJSONObject: json)) ?? Data()
  }

  private func walletResponseJSON() -> Data {
    let json: [String: Any] = [
      "rolling7DayTotalCents": 400,
      "thresholdCents": 400,
      "remainingCents": 0,
      "windowStartedAt": "2026-09-28T00:00:00Z",
      "subscription": [
        "active": true,
        "validUntil": "2026-10-05T00:00:00Z"
      ]
    ]
    return (try? JSONSerialization.data(withJSONObject: json)) ?? Data()
  }

  private func listingInventoryJSON() -> Data {
    let json: [String: Any] = [
      "listings": listingsPayload(),
      "nextCursor": NSNull(),
      "hasMore": false,
      "source": "fixture"
    ]
    return (try? JSONSerialization.data(withJSONObject: json)) ?? Data()
  }

  private func healthJSON() -> Data {
    let json: [String: Any] = [
      "apiVersion": "fixture",
      "serverCommit": "fixture-commit"
    ]
    return (try? JSONSerialization.data(withJSONObject: json)) ?? Data()
  }

  // ── Shared payload helpers ────────────────────────────────────────────────

  private func boardLoadPayload() -> [String: Any] {
    [
      "board": boardPayload(),
      "profile": profilePayload(),
      "missingFields": [] as [String]
    ]
  }

  private func boardPayload() -> [String: Any] {
    [
      "id": UITestFixture.boardID,
      "revision": "fixture-rev-1",
      "title": UITestFixture.boardTitle,
      "city": UITestFixture.boardCity,
      "moveInTimeline": "November 2026",
      "groupSize": "3 roommates",
      "budgetLine": "$3,200–$4,100/mo",
      "commuteTargets": ["SoMa", "Financial District"],
      "readiness": "Profile complete",
      "completionLine": "All three members have added their preferences.",
      "nextBestAction": "Start a group vote on the Mission listing.",
      "inviteCode": "FIXTURE1",
      "recentActivity": ["Alex added the Hayes Valley flat.", "Sam saved the Mission 2BR."],
      "chatMessages": chatMessagesPayload(),
      "openQuestions": [] as [String],
      "members": membersPayload(),
      "shortlist": listingsPayload(),
      "suggestions": listingsPayload(),
      "recentlyDeleted": [] as [String],
      "invitations": [[
        "id": "fixture-inv-001",
        "inviteCode": "FIXTURE1",
        "status": "pending"
      ]],
    ]
  }

  private func chatMessagesPayload() -> [[String: Any]] {
    [
      [
        "id": "fixture-msg-001",
        "role": "user",
        "authorName": "Alex",
        "content": "The Hayes Valley flat looks amazing for the space.",
        "createdAt": "2026-09-01T10:00:00Z"
      ],
      [
        "id": "fixture-msg-002",
        "role": "user",
        "authorName": "Jordan",
        "content": "Agreed, but the split bathrooms might be tricky for three people.",
        "createdAt": "2026-09-01T10:05:00Z"
      ],
      [
        "id": "fixture-msg-003",
        "role": "user",
        "authorName": "Sam",
        "content": "Let's also look at the Mission 2BR - it's under budget.",
        "createdAt": "2026-09-01T10:10:00Z"
      ],
    ]
  }

  private func membersPayload() -> [[String: Any]] {
    [
      [
        "id": "fixture-member-sam",
        "userId": UITestFixture.samUserID,
        "role": "owner",
        "name": "Sam",
        "budgetMin": 2500,
        "idealBudget": 3000,
        "budgetMax": 3500,
        "budgetLine": "$2,500–$3,500/mo",
        "commuteLine": "22 min to SoMa",
        "priorities": ["commute", "price"],
        "dealbreakers": ["shared laundry"],
        "neighborhoods": ["Mission", "Castro"],
        "status": "active"
      ],
      [
        "id": "fixture-member-alex",
        "userId": UITestFixture.alexUserID,
        "role": "member",
        "name": "Alex",
        "budgetMin": 2000,
        "idealBudget": 2500,
        "budgetMax": 3000,
        "budgetLine": "$2,000–$3,000/mo",
        "commuteLine": "18 min to Financial District",
        "priorities": ["space", "natural light"],
        "dealbreakers": ["no pets allowed"],
        "neighborhoods": ["Hayes Valley", "Noe Valley"],
        "status": "active"
      ],
      [
        "id": "fixture-member-jordan",
        "userId": UITestFixture.jordanUserID,
        "role": "member",
        "name": "Jordan",
        "budgetMin": 1800,
        "idealBudget": 2200,
        "budgetMax": 2600,
        "budgetLine": "$1,800–$2,600/mo",
        "commuteLine": "Remote",
        "priorities": ["neighborhood vibe", "outdoor space"],
        "dealbreakers": ["top-floor walk-up"],
        "neighborhoods": ["Outer Sunset", "Inner Sunset"],
        "status": "active"
      ],
    ]
  }

  private func listingsPayload() -> [[String: Any]] {
    [
      [
        "id": UITestFixture.listing1ID,
        "listingId": UITestFixture.listing1ID,
        "title": "2BR in the Mission",
        "address": "123 Valencia St",
        "location": "Mission District, SF",
        "priceLine": "$3,200/mo",
        "commuteLine": "20 min to SoMa",
        "summary": "Bright two-bed in the heart of the Mission.",
        "fitLabel": "Strong group fit",
        "highlights": ["In-unit laundry", "Hardwood floors", "Rooftop deck"],
        "openRisks": ["Loud weekend nights"],
        "status": "saved",
        "workflowStatus": "suggested"
      ],
      [
        "id": UITestFixture.listing2ID,
        "listingId": UITestFixture.listing2ID,
        "title": "3BR Hayes Valley Flat",
        "address": "456 Ivy St",
        "location": "Hayes Valley, SF",
        "priceLine": "$4,100/mo",
        "commuteLine": "15 min to Financial District",
        "summary": "Spacious Victorian flat in Hayes Valley.",
        "fitLabel": "Good group fit",
        "highlights": ["Private garden", "Original details", "Dishwasher"],
        "openRisks": ["Split bathrooms"],
        "status": "saved",
        "workflowStatus": "suggested"
      ],
      [
        "id": UITestFixture.listing3ID,
        "listingId": UITestFixture.listing3ID,
        "title": "2BR Noe Valley Sun-Trap",
        "address": "789 Sanchez St",
        "location": "Noe Valley, SF",
        "priceLine": "$3,500/mo",
        "commuteLine": "25 min to SoMa",
        "summary": "South-facing 2BR with a deck and stunning views.",
        "fitLabel": "Fair group fit",
        "highlights": ["Panoramic views", "Deck", "Pet-friendly"],
        "openRisks": ["One parking spot only"],
        "status": "saved",
        "workflowStatus": "suggested"
      ],
    ]
  }

  private func profilePayload() -> [String: Any] {
    [
      "name": "Sam",
      "email": "sam@example.com",
      "city": UITestFixture.boardCity,
      "moveInDate": "2026-11-01",
      "budgetMin": 2500.0,
      "budgetMax": 4100.0,
      "commuteTarget": "SoMa, SF",
      "commuteAccess": "transit",
      "minCommuteMinutes": 10,
      "maxCommuteMinutes": 35,
      "neighborhoods": ["Mission", "Hayes Valley", "Noe Valley"],
      "mustHaves": ["in-unit laundry", "pet-friendly"],
      "dealbreakers": ["no laundry in building"],
      "niceToHaves": [] as [String],
      "priorities": ["price", "commute", "space"],
      "groupSize": 3,
      "rentalReadiness": [
        "hasOfferLetter": false,
        "needsGuarantor": false,
        "hasProofOfIncome": true
      ],
      "completionStatus": "complete",
      "advisorSetupVersion": 1,
      "createdAt": "2026-09-01T00:00:00Z",
      "updatedAt": "2026-09-28T00:00:00Z",
      "locations": [UITestFixture.boardCity]
    ]
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// MARK: - AppModel extension: apply fixture
// ──────────────────────────────────────────────────────────────────────────────

extension AppModel {
  /// Seeds the model with deterministic fixture data. Called from `init()`
  /// only when `-homeboard.uiTestFixture` is present. Registers the stub
  /// URLProtocol so no real network calls are made.
  @MainActor
  func applyUITestFixture() {
    // Register the stub URLProtocol globally. This is safe because the app
    // was launched by the test runner in a controlled environment.
    URLProtocol.registerClass(HomeboardUITestStubProtocol.self)

    // Inject a seeded session into the Keychain so bootstrap() finds it.
    let session = UITestFixture.session
    NativeAuthSessionStore.save(session)
    authSession = session

    account = UITestFixture.account
    board = UITestFixture.board
    localBoardsById[UITestFixture.boardID] = UITestFixture.board
    localShortlistsByBoard[UITestFixture.boardID] = UITestFixture.listings
    localChatMessagesByBoard[UITestFixture.boardID] = UITestFixture.chatMessages
    availableBoards = [
      MobileBoardSummary(
        id: UITestFixture.boardID,
        title: UITestFixture.boardTitle,
        city: UITestFixture.boardCity,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-28T00:00:00Z"
      )
    ]
    profile = UITestFixture.profile
    authenticatedMembershipState = .member

    let walletInactive =
      ProcessInfo.processInfo.environment["UITEST_WALLET_INACTIVE"] == "1"
    advisorWalletStatus = walletInactive
      ? UITestFixture.walletInactive
      : UITestFixture.walletActive

    currentScreen = .board
    boardTab = .updates
  }
}
#endif
