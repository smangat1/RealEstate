import XCTest
@testable import HomeboardNative

@MainActor
final class HomeboardNativeTests: XCTestCase {
  private let appModelPersistenceKeys = [
    "homeboard.native.state",
    "homeboard.native.account-session",
    "homeboard.native.profile",
    "homeboard.native.boards-listings",
    "homeboard.native.onboarding",
    "homeboard.native.pending-operations",
  ]

  func testOldBoardMessageJSONDecodesWithoutReplyField() throws {
    let data = Data(#"{"id":"message-old","role":"user","authorName":"Sam","content":"Still available?","createdAt":"2026-10-05T12:00:00Z"}"#.utf8)
    let message = try JSONDecoder().decode(BoardMessage.self, from: data)

    XCTAssertEqual(message.id, "message-old")
    XCTAssertNil(message.replyToMessageId)
  }

  func testChatReplySendPolicyRoutesOnlyExplicitOrAdvisorCardRepliesToAdvisor() {
    let roommate = BoardMessage(
      id: "roommate-message", role: "user", authorName: "Alex",
      content: "This looks good", createdAt: "2026-10-05T12:00:00Z"
    )
    var payload = AdvisorMessagePayload()
    payload.messageId = "advisor-message"
    payload.draftText = "Hello, is this apartment available?"
    let advisor = BoardMessage(
      id: "advisor-message", role: "assistant", authorName: "Advisor",
      content: payload.draftText, createdAt: "2026-10-05T12:01:00Z",
      advisorPayload: payload
    )

    XCTAssertFalse(ChatReplySendPolicy.isAdvisorRequest(content: "Looks good", replyTarget: roommate))
    XCTAssertTrue(ChatReplySendPolicy.isAdvisorRequest(content: "Make it shorter", replyTarget: advisor))
    XCTAssertTrue(ChatReplySendPolicy.isAdvisorRequest(content: "@advisor draft an email", replyTarget: nil))
  }

  func testAdvisorBetaVisibilityFiltersCardsCommandsAndTheirRepliesOnlyWhenDisabled() {
    var payload = AdvisorMessagePayload()
    payload.messageId = "advisor-card"
    let messages = [
      BoardMessage(id: "roommate", role: "user", authorName: "Alex", content: "Tour Saturday?", createdAt: "2026-10-06T12:00:00Z"),
      BoardMessage(id: "roommate-reply", role: "user", authorName: "Sam", content: "Yes", createdAt: "2026-10-06T12:01:00Z", replyToMessageId: "roommate"),
      BoardMessage(id: "advisor-command", role: "user", authorName: "Sam", content: "@advisor draft outreach", createdAt: "2026-10-06T12:02:00Z"),
      BoardMessage(id: "advisor-card", role: "assistant", authorName: "Advisor", content: "Draft", createdAt: "2026-10-06T12:03:00Z", advisorPayload: payload),
      BoardMessage(id: "advisor-reply", role: "user", authorName: "Sam", content: "Shorter", createdAt: "2026-10-06T12:04:00Z", replyToMessageId: "advisor-card"),
    ]

    XCTAssertEqual(
      ChatReplySendPolicy.visibleMessages(messages, advisorEnabled: false).map(\.id),
      ["roommate", "roommate-reply"]
    )
    XCTAssertEqual(
      ChatReplySendPolicy.visibleMessages(messages, advisorEnabled: true).map(\.id),
      messages.map(\.id)
    )
  }

  func testAdvisorNotificationsAreHiddenWithoutBlockingOrdinaryBoardNotifications() {
    XCTAssertFalse(NativeNotificationPresentationPolicy.shouldPresent(type: "advisor_digest", advisorEnabled: false))
    XCTAssertFalse(NativeNotificationPresentationPolicy.shouldRouteToBoard(type: "advisor_follow_up", advisorEnabled: false))
    XCTAssertTrue(NativeNotificationPresentationPolicy.shouldPresent(type: "board_chat", advisorEnabled: false))
    XCTAssertTrue(NativeNotificationPresentationPolicy.shouldRouteToBoard(type: "listing_change", advisorEnabled: false))
    XCTAssertTrue(NativeNotificationPresentationPolicy.shouldRouteToBoard(type: "advisor_follow_up", advisorEnabled: true))
  }

  func testDisabledAdvisorRequestPreservesDraftAndMakesNoRequest() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [AdvisorWalletURLProtocol.self]
    var requestCount = 0
    AdvisorWalletURLProtocol.response = { _ in
      requestCount += 1
      return .init(status: 500, body: #"{"error":"unexpected"}"#)
    }
    let model = AppModel(
      api: HomeboardAPI(session: URLSession(configuration: configuration)),
      advisorEnabled: false
    )
    model.authSession = NativeAuthSession(
      accessToken: "token-a", refreshToken: "refresh-a", userId: "user-a",
      email: "user-a@example.com", displayName: "User A"
    )
    model.board = .empty
    model.board.id = "board-a"
    model.boardMessageDraft = "@advisor draft outreach"

    await model.sendBoardMessage()
    await model.refreshAdvisorWalletStatus()
    await model.refreshAdvisorPreferenceProposal()

    XCTAssertEqual(requestCount, 0)
    XCTAssertEqual(model.boardMessageDraft, "@advisor draft outreach")
    XCTAssertTrue(model.board.chatMessages.isEmpty)
    XCTAssertEqual(model.boardError, "Advisor isn't available in this beta. Your message is still in the composer.")

    var payload = AdvisorMessagePayload()
    payload.messageId = "advisor-card"
    model.board.chatMessages = [
      BoardMessage(
        id: "advisor-card", role: "assistant", authorName: "Advisor",
        content: "Draft", createdAt: "2026-10-06T12:00:00Z", advisorPayload: payload
      ),
    ]
    model.replyToBoardMessageId = "advisor-card"
    model.boardMessageDraft = "Make it shorter"

    await model.sendBoardMessage()

    XCTAssertEqual(requestCount, 0)
    XCTAssertEqual(model.boardMessageDraft, "Make it shorter")
    XCTAssertEqual(model.board.chatMessages.map(\.id), ["advisor-card"])
    XCTAssertEqual(model.boardError, "Advisor isn't available in this beta. Your message is still in the composer.")
  }

  func testBoardMessageRequestEncodesReplyTargetWithoutCopyingQuotedText() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [AdvisorWalletURLProtocol.self]
    AdvisorWalletURLProtocol.response = { request in
      let body = AdvisorWalletURLProtocol.bodyData(for: request)
      let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
      XCTAssertEqual(json?["content"] as? String, "Make it shorter")
      XCTAssertEqual(json?["replyToMessageId"] as? String, "advisor-message")
      XCTAssertNil(json?["quotedText"])
      XCTAssertFalse(String(data: body, encoding: .utf8)?.contains("income 90000") == true)
      return .init(status: 500, body: #"{"error":"Expected test failure"}"#)
    }
    let api = HomeboardAPI(session: URLSession(configuration: configuration))

    do {
      _ = try await api.sendBoardMessage(
        accessToken: "token", boardId: "board-a", content: "Make it shorter",
        messageId: "new-message", replyToMessageId: "advisor-message"
      )
      XCTFail("Expected the test transport failure")
    } catch {
      XCTAssertTrue(true)
    }
  }

  @MainActor
  func testFailedImplicitAdvisorReplyRestoresDraftAndReplyTarget() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [AdvisorWalletURLProtocol.self]
    AdvisorWalletURLProtocol.response = { request in
      XCTAssertEqual(request.httpMethod, "POST")
      return .init(status: 500, body: #"{"error":"Reply failed"}"#)
    }
    let model = AppModel(
      api: HomeboardAPI(session: URLSession(configuration: configuration)),
      advisorEnabled: true
    )
    model.authSession = NativeAuthSession(
      accessToken: "token-a", refreshToken: "refresh-a", userId: "user-a",
      email: "user-a@example.com", displayName: "User A"
    )
    model.board = .empty
    model.board.id = "board-a"
    var payload = AdvisorMessagePayload()
    payload.messageId = "advisor-message"
    payload.originalCommand = "@advisor ask about availability"
    payload.draftText = "Hello, is this apartment available?"
    payload.executionStatus = "draft_ready"
    model.board.chatMessages = [BoardMessage(
      id: "advisor-message", role: "assistant", authorName: "Advisor",
      content: payload.draftText, createdAt: "2026-10-05T12:00:00Z",
      advisorPayload: payload
    )]
    model.advisorWalletStatus = AdvisorWalletStatus(
      rolling7DayTotalCents: 400, thresholdCents: 400, remainingCents: 0,
      windowStartedAt: "2026-10-01T00:00:00Z",
      subscription: AdvisorSubscriptionStatus(active: true, validUntil: "2026-10-12T00:00:00Z")
    )
    model.boardMessageDraft = "Make it shorter"
    model.replyToBoardMessageId = "advisor-message"

    await model.sendBoardMessage()

    XCTAssertEqual(model.boardMessageDraft, "Make it shorter")
    XCTAssertEqual(model.replyToBoardMessageId, "advisor-message")
    XCTAssertEqual(model.board.chatMessages.map(\.id), ["advisor-message"])
    XCTAssertNotNil(model.boardError)
  }

  func testReplyDraftUsesExistingSanitizerBoundaryAndFallsBackWhenUnsafe() async throws {
    var payload = AdvisorMessagePayload()
    payload.messageId = "advisor-reply"
    payload.originalCommand = "@advisor Make it shorter"
    payload.draftText = "Server draft"
    payload.tone = "Professional"

    let safeDraft = "Hello, is this apartment still available?"
    let safePrompt = try XCTUnwrap(AdvisorDraftGenerator.appleIntelligencePrompt(
      payload: payload, tone: "Professional", toggles: [], senderName: "Sam",
      memorySummary: nil, repliedDraftText: safeDraft
    ))
    XCTAssertTrue(safePrompt.contains(safeDraft))

    XCTAssertNil(AdvisorDraftGenerator.appleIntelligencePrompt(
      payload: payload, tone: "Professional", toggles: [], senderName: "Sam",
      memorySummary: nil,
      repliedDraftText: "Hello. My income is 90000 and my credit score is 780."
    ))

    payload.originalCommand = "@advisor My income is 90000"
    let generated = await AdvisorDraftGenerator.generate(
      payload: payload, tone: "Professional", toggles: [], financialSentence: nil,
      senderName: "Sam", repliedDraftText: safeDraft
    )
    XCTAssertEqual(generated.source, "device_template")
    XCTAssertFalse(generated.text.contains("90000"))
    XCTAssertFalse(generated.text.contains(safeDraft))
  }

  @MainActor
  func testAdvisorCardToneSwitchDoesNotRecordMemoryUntilDraftIsRejectedOrEdited() throws {
    let suite = "advisor-card-tone-signal-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    let model = advisorMemoryModel(memory: memory)
    let payload = advisorMemoryPayload(tone: "Casual")
    for outcome in AdvisorCardMemorySignalPolicy.toneSwitched() {
      memory.record(memoryRecord(outcome: outcome))
    }
    XCTAssertNotNil(model.applyAdvisorRegenerationResponse(
      try advisorMemoryResponse(payload: payload),
      payload: payload,
      expectedBoardId: "board-a",
      expectedMessageId: "message-a",
      recordAcceptance: false
    ))
    XCTAssertTrue(memory.records(userId: "user-a", boardId: "board-a").isEmpty)
    XCTAssertEqual(
      AdvisorCardMemorySignalPolicy.draftRejected(afterPersistedToneChange: true),
      [.revised, .rejected]
    )
  }

  @MainActor
  func testAdvisorCardIncludeToggleNeverRecordsMemory() throws {
    let suite = "advisor-card-toggle-signal-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    let model = advisorMemoryModel(memory: memory)
    let payload = advisorMemoryPayload(tone: "Professional")
    for outcome in AdvisorCardMemorySignalPolicy.includeToggled() {
      memory.record(memoryRecord(outcome: outcome))
    }
    XCTAssertNotNil(model.applyAdvisorRegenerationResponse(
      try advisorMemoryResponse(payload: payload),
      payload: payload,
      expectedBoardId: "board-a",
      expectedMessageId: "message-a",
      recordAcceptance: false
    ))
    XCTAssertTrue(memory.records(userId: "user-a", boardId: "board-a").isEmpty)
  }

  @MainActor
  func testAdvisorCardCopyNeverRecordsMemory() throws {
    let suite = "advisor-card-copy-signal-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    let model = advisorMemoryModel(memory: memory)
    let payload = advisorMemoryPayload(tone: "Professional")
    for outcome in AdvisorCardMemorySignalPolicy.draftCopied() {
      memory.record(memoryRecord(outcome: outcome))
    }
    XCTAssertNotNil(model.applyAdvisorRegenerationResponse(
      try advisorMemoryResponse(payload: payload),
      payload: payload,
      expectedBoardId: "board-a",
      expectedMessageId: "message-a",
      recordAcceptance: false
    ))
    XCTAssertTrue(memory.records(userId: "user-a", boardId: "board-a").isEmpty)
  }

  func testAdvisorCardRejectionWithoutToneChangeKeepsRejectedSignalOnly() {
    XCTAssertEqual(
      AdvisorCardMemorySignalPolicy.draftRejected(afterPersistedToneChange: false),
      [.rejected]
    )
  }

  private func memoryRecord(outcome: AdvisorDraftOutcome) -> AdvisorDraftOutcomeRecord {
    AdvisorDraftOutcomeRecord(
      userId: "user-a",
      boardId: "board-a",
      listingId: "listing-a",
      messageId: "message-a",
      templateId: AdvisorOutcomeMemory.standardTemplate,
      tone: "Casual",
      outcome: outcome,
      reasonCode: nil,
      timestamp: Date()
    )
  }

  @MainActor
  private func advisorMemoryModel(memory: AdvisorOutcomeMemory) -> AppModel {
    let model = AppModel(api: HomeboardAPI(), advisorOutcomeMemory: memory)
    model.authSession = NativeAuthSession(
      accessToken: "token-a", refreshToken: "refresh-a", userId: "user-a",
      email: "user-a@example.com", displayName: "User A"
    )
    model.board = .empty
    model.board.id = "board-a"
    return model
  }

  private func advisorMemoryPayload(tone: String) -> AdvisorMessagePayload {
    AdvisorMessagePayload(
      messageId: "message-a",
      schemaVersion: 1,
      originalCommand: "@advisor draft outreach",
      draftText: "Hello, is this apartment available?",
      tone: tone,
      executionStatus: "draft_ready",
      targetListingBoardId: "listing-a",
      templateId: AdvisorOutcomeMemory.standardTemplate
    )
  }

  private func advisorMemoryResponse(payload: AdvisorMessagePayload) throws -> MobileBoardLoadResponse {
    var board = MobileBoard.empty
    board.id = "board-a"
    let profile = try JSONDecoder().decode(
      RemoteRentalProfilePayload.self,
      from: Data(#"{"name":"User A","neighborhoods":[],"mustHaves":[],"dealbreakers":[],"priorities":[]}"#.utf8)
    )
    return MobileBoardLoadResponse(
      board: board,
      profile: profile,
      missingFields: [],
      advisorPayload: payload,
      replyAnalysis: nil,
      replyLog: nil,
      preferenceProposal: nil,
      preferenceResolution: nil,
      outreachEvidence: nil
    )
  }

  func testAdvisorMemoryFallsBackBelowThresholdAndRanksReportedRepliesAboveThreshold() {
    let suite = "advisor-memory-tests-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    let base = AdvisorDraftOutcomeRecord(
      userId: "user-a", boardId: "board-a", listingId: "listing-a", messageId: "message-1",
      templateId: AdvisorOutcomeMemory.conciseTemplate, tone: "Casual",
      outcome: .accepted, reasonCode: nil, timestamp: Date()
    )
    memory.record(base)
    memory.record(.init(
      userId: base.userId, boardId: base.boardId, listingId: base.listingId, messageId: "message-2",
      templateId: base.templateId, tone: base.tone, outcome: .sent,
      reasonCode: nil, timestamp: Date().addingTimeInterval(1)
    ))
    XCTAssertEqual(memory.selection(
      userId: "user-a", boardId: "board-a", listingId: "listing-a", fallbackTone: "Professional",
      explicitTone: nil, boardFeedback: nil
    ).tone, "Professional")

    memory.record(.init(
      userId: base.userId, boardId: base.boardId, listingId: base.listingId, messageId: "message-3",
      templateId: base.templateId, tone: base.tone, outcome: .replied,
      reasonCode: nil, timestamp: Date().addingTimeInterval(2)
    ))
    let ranked = memory.selection(
      userId: "user-a", boardId: "board-a", listingId: "listing-a", fallbackTone: "Professional",
      explicitTone: nil, boardFeedback: nil
    )
    XCTAssertEqual(ranked.tone, "Casual")
    XCTAssertEqual(ranked.templateId, AdvisorOutcomeMemory.conciseTemplate)
    XCTAssertNotNil(ranked.reason)
    XCTAssertEqual(memory.selection(
      userId: "user-a", boardId: "board-b", listingId: "listing-a", fallbackTone: "Professional",
      explicitTone: nil, boardFeedback: nil
    ).tone, "Professional")
    XCTAssertEqual(memory.selection(
      userId: "user-b", boardId: "board-a", listingId: "listing-a", fallbackTone: "Professional",
      explicitTone: nil, boardFeedback: nil
    ).tone, "Professional")
  }

  func testAdvisorDerivedOutcomeUsesExactOutreachInsteadOfNewestListingDraft() {
    let suite = "advisor-memory-outreach-attribution-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    memory.record(.init(
      userId: "user-a", boardId: "board-a", listingId: "listing-a", messageId: "message-a",
      templateId: AdvisorOutcomeMemory.standardTemplate, tone: "Professional", outcome: .sent,
      outreachId: "outreach-a", reasonCode: nil, timestamp: Date().addingTimeInterval(-20)
    ))
    memory.record(.init(
      userId: "user-a", boardId: "board-a", listingId: "listing-a", messageId: "message-b",
      templateId: AdvisorOutcomeMemory.conciseTemplate, tone: "Casual", outcome: .rejected,
      reasonCode: "bad_tone", timestamp: Date()
    ))

    for _ in 0..<2 {
      memory.recordDerivedOutcome(
        userId: "user-a", boardId: "board-a", listingId: "listing-a",
        outreachId: "outreach-a", advisorMessageId: "message-a", outcome: .replied
      )
    }

    let replies = memory.records(userId: "user-a", boardId: "board-a").filter { $0.outcome == .replied }
    XCTAssertEqual(replies.count, 1)
    XCTAssertEqual(replies.first?.messageId, "message-a")
    XCTAssertEqual(replies.first?.tone, "Professional")
    XCTAssertEqual(replies.first?.templateId, AdvisorOutcomeMemory.standardTemplate)
    XCTAssertEqual(replies.first?.outreachId, "outreach-a")
    XCTAssertFalse(replies.contains(where: { $0.messageId == "message-b" }))

    memory.recordDerivedOutcome(
      userId: "user-a", boardId: "board-a", listingId: "listing-a",
      outreachId: "unknown-outreach", advisorMessageId: nil, outcome: .stale
    )
    XCTAssertTrue(
      memory.records(userId: "user-a", boardId: "board-a").filter { $0.outcome == .stale }.isEmpty
    )
  }

  func testAdvisorDerivedOutcomeCanUseVerifiedMessageMappingForLegacySentRecord() {
    let suite = "advisor-memory-message-attribution-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    memory.record(.init(
      userId: "user-a", boardId: "board-a", listingId: "listing-a", messageId: "message-a",
      templateId: AdvisorOutcomeMemory.conciseTemplate, tone: "Stern", outcome: .sent,
      reasonCode: nil, timestamp: Date()
    ))

    memory.recordDerivedOutcome(
      userId: "user-a", boardId: "board-a", listingId: "listing-a",
      outreachId: "outreach-a", advisorMessageId: "message-a", outcome: .stale
    )

    let stale = memory.records(userId: "user-a", boardId: "board-a").first { $0.outcome == .stale }
    XCTAssertEqual(stale?.messageId, "message-a")
    XCTAssertEqual(stale?.outreachId, "outreach-a")
    XCTAssertEqual(stale?.tone, "Stern")
  }

  func testAdvisorReplyThreadRefreshCreditsExactOutreachOnce() async {
    let suite = "advisor-memory-thread-refresh-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    memory.record(.init(
      userId: "user-a", boardId: "board-a", listingId: "listing-a", messageId: "message-a",
      templateId: AdvisorOutcomeMemory.standardTemplate, tone: "Professional", outcome: .sent,
      outreachId: "outreach-a", reasonCode: nil, timestamp: Date().addingTimeInterval(-20)
    ))
    memory.record(.init(
      userId: "user-a", boardId: "board-a", listingId: "listing-a", messageId: "message-b",
      templateId: AdvisorOutcomeMemory.conciseTemplate, tone: "Casual", outcome: .rejected,
      reasonCode: "bad_tone", timestamp: Date()
    ))
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [AdvisorWalletURLProtocol.self]
    AdvisorWalletURLProtocol.response = { request in
      XCTAssertEqual(request.httpMethod, "GET")
      XCTAssertTrue(request.url?.path.hasSuffix("/api/mobile/boards/board-a/advisor/reply-threads") == true)
      return .init(status: 200, body: #"{"threads":[{"id":"outreach-a","outreachId":"outreach-a","advisorMessageId":"message-a","listingId":"listing-a","listingName":"123 Main St","recipientName":"Agent","method":"email","status":"answered","contactedAt":"2026-10-01T12:00:00.000Z"}]}"#)
    }
    let model = AppModel(
      api: HomeboardAPI(session: URLSession(configuration: configuration)),
      advisorOutcomeMemory: memory,
      advisorEnabled: true
    )
    model.authSession = NativeAuthSession(
      accessToken: "token-a", refreshToken: "refresh-a", userId: "user-a",
      email: "user-a@example.com", displayName: "User A"
    )
    model.board = .empty
    model.board.id = "board-a"

    let firstRefresh = await model.loadAdvisorReplyThreads()
    let secondRefresh = await model.loadAdvisorReplyThreads()
    XCTAssertEqual(firstRefresh.count, 1)
    XCTAssertEqual(secondRefresh.count, 1)

    let replies = memory.records(userId: "user-a", boardId: "board-a").filter { $0.outcome == .replied }
    XCTAssertEqual(replies.count, 1)
    XCTAssertEqual(replies.first?.messageId, "message-a")
    XCTAssertEqual(replies.first?.outreachId, "outreach-a")
    XCTAssertFalse(replies.contains(where: { $0.messageId == "message-b" }))
  }

  func testAdvisorMemoryNeverOverridesExplicitTone() {
    let suite = "advisor-memory-explicit-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    for (index, outcome) in [AdvisorDraftOutcome.accepted, .sent, .replied].enumerated() {
      memory.record(.init(
        userId: "user-a", boardId: "board-a", listingId: nil, messageId: "message-\(index)",
        templateId: AdvisorOutcomeMemory.standardTemplate, tone: "Casual",
        outcome: outcome, reasonCode: nil, timestamp: Date().addingTimeInterval(Double(index))
      ))
    }
    XCTAssertEqual(memory.selection(
      userId: "user-a", boardId: "board-a", listingId: nil, fallbackTone: "Professional",
      explicitTone: "Stern", boardFeedback: nil
    ).tone, "Stern")
  }

  func testAdvisorMemoryCorruptionFailsSoftWithoutTouchingOtherState() {
    let suite = "advisor-memory-corrupt-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    defaults.set(Data("not-json".utf8), forKey: "memory")
    defaults.set("keep-me", forKey: "unrelated")
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    XCTAssertTrue(memory.records(userId: "user-a", boardId: "board-a").isEmpty)
    XCTAssertEqual(defaults.string(forKey: "unrelated"), "keep-me")
  }

  @MainActor
  func testAdvisorMemoryClearsOnlySignedOutUser() {
    let suite = "advisor-memory-signout-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    memory.record(memoryRecord(outcome: .accepted))
    var other = memoryRecord(outcome: .accepted)
    other.userId = "user-b"
    other.messageId = "message-b"
    memory.record(other)
    let model = AppModel(api: HomeboardAPI(), advisorOutcomeMemory: memory)
    model.authSession = NativeAuthSession(
      accessToken: "token-a", refreshToken: "refresh-a", userId: "user-a",
      email: "user-a@example.com", displayName: "User A"
    )

    model.signOut()

    XCTAssertTrue(memory.records(userId: "user-a", boardId: "board-a").isEmpty)
    XCTAssertEqual(memory.records(userId: "user-b", boardId: "board-a").count, 1)
  }

  @MainActor
  func testAdvisorMemoryClearsDeletedUserAfterServerConfirmsDeletion() async {
    let suite = "advisor-memory-delete-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    memory.record(memoryRecord(outcome: .accepted))
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [AdvisorWalletURLProtocol.self]
    AdvisorWalletURLProtocol.response = { request in
      XCTAssertEqual(request.httpMethod, "DELETE")
      XCTAssertTrue(request.url?.path.hasSuffix("/api/mobile/account") == true)
      return .init(status: 200, body: #"{"ok":true}"#)
    }
    let model = AppModel(
      api: HomeboardAPI(session: URLSession(configuration: configuration)),
      advisorOutcomeMemory: memory
    )
    model.authSession = NativeAuthSession(
      accessToken: "token-a", refreshToken: "refresh-a", userId: "user-a",
      email: "user-a@example.com", displayName: "User A"
    )

    model.deleteAccount()
    for _ in 0..<100 where !memory.records(userId: "user-a", boardId: "board-a").isEmpty {
      try? await Task.sleep(nanoseconds: 10_000_000)
    }

    XCTAssertTrue(memory.records(userId: "user-a", boardId: "board-a").isEmpty)
    XCTAssertNil(model.authSession)
  }

  func testAdvisorMemoryAndModelContextContainNoDraftOrFinancialValues() throws {
    let suite = "advisor-memory-privacy-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let memory = AdvisorOutcomeMemory(defaults: defaults, key: "memory")
    memory.record(.init(
      userId: "user-a", boardId: "board-a", listingId: "listing-a", messageId: "message-a",
      templateId: AdvisorOutcomeMemory.standardTemplate, tone: "Professional",
      outcome: .accepted, reasonCode: nil, timestamp: Date()
    ))
    let stored = String(data: defaults.data(forKey: "memory")!, encoding: .utf8)!
    XCTAssertFalse(stored.contains("draftText"))
    XCTAssertFalse(stored.contains("income"))
    XCTAssertFalse(stored.contains("credit"))

    let payload = AdvisorMessagePayload(
      messageId: "message-a",
      originalCommand: "My credit score is 780 and I live at 999 Private Road",
      draftText: "private draft", tone: "Professional",
      context: AdvisorContext(
        leverage: AdvisorLeverage(
          memberCount: 2, applicationReadiness: nil, activeOffers: nil,
          strongestListings: [
            AdvisorStrongListing(boardListingId: "listing-a", listing: "123 Main St unit 204"),
          ]
        ),
        requirements: AdvisorRequirements(
          budget: nil,
          moveIn: "October 15, 2026",
          locations: ["456 Park Avenue apartment 789", "Income is 90000 near Secret Place"],
          bedrooms: nil,
          mustHaves: ["Something quiet", "In-unit laundry; income is 91000"],
          dealbreakers: ["No walk-up"],
          priorities: ["Natural light"],
          commuteDestinations: ["900 Broadway unit 12"],
          tensionFlags: ["No pets allowed"]
        ),
        picker: AdvisorPickerContext(
          conversationStage: "sent",
          listingHistory: [AdvisorListingHistory(
            boardListingId: "listing-a", status: "answered", templateId: "standard",
            contactedAt: "2026-10-01T12:00:00Z", answered: true, daysSinceContact: 2
          )],
          boardFeedback: AdvisorFeedbackMemorySummary(sampleSize: 0, signals: [])
        )
      )
    )
    let context = AdvisorDraftGenerator.boundedAppleIntelligenceContext(
      payload: payload,
      memorySummary: "income 92000"
    )
    for privateValue in ["90000", "91000", "92000", "Secret Place"] {
      XCTAssertFalse(context.contains(privateValue), "Leaked \(privateValue) in \(context)")
    }
    for structuredValue in [
      "123 Main St unit 204", "456 Park Avenue apartment 789", "900 Broadway unit 12",
      "October 15, 2026", "Something quiet", "No walk-up", "Natural light",
      "No pets allowed", "sent", "answered",
    ] {
      XCTAssertTrue(context.contains(structuredValue), "Dropped \(structuredValue) from \(context)")
    }
  }

  func testAdvisorRequestSanitizerUsesWholeSentenceKeepOrDrop() {
    let fallback = "Draft outreach for the selected rental."
    XCTAssertEqual(
      AdvisorDraftGenerator.sanitizedAppleIntelligenceRequest(
        "I prefer something quiet and close to the train"
      ),
      "I prefer something quiet and close to the train"
    )

    for unsafe in [
      "My income is:\n90000 Broadway unit 12",
      "My 2025 income is 90000 Broadway unit 12",
      "My credit score is:\n780 Broadway",
      "My credit score is 780 and I live at 123 Main St",
      "my income is about 90000 and my credit score is around 780",
      "Ask about 123 Main St unit 204",
      "Move in October 15, 2026",
      "Need two bedrooms and one elevator",
      "Rent is 3500 and move in October 15, 2026",
    ] {
      XCTAssertEqual(
        AdvisorDraftGenerator.sanitizedAppleIntelligenceRequest(unsafe), fallback,
        "Unsafe user sentence was partially recovered: \(unsafe)"
      )
    }

    let safeThenFinancial: [(String, String)] = [
      ("Parking is not required. My income is 90000", "Parking is not required."),
      ("An elevator is not needed. My credit score is 780", "An elevator is not needed."),
      ("A walk-up is not acceptable. My income is 90000", "A walk-up is not acceptable."),
      ("No\npets allowed. My income is 90000", "No\npets allowed."),
      ("no pets allowed. my income is 90000", "no pets allowed."),
    ]
    for (input, expected) in safeThenFinancial {
      XCTAssertEqual(
        AdvisorDraftGenerator.sanitizedAppleIntelligenceRequest(input), expected,
        "Whole-sentence filtering changed meaning for: \(input)"
      )
    }
  }

  func testAdvisorRequestSanitizerDropsFinancialContinuationChains() {
    let cases: [(String, [String])] = [
      ("My income is about 90000 and 110000 and 120000", ["90000", "110000", "120000"]),
      ("My annual income is:\n90000", ["90000"]),
      ("My credit score:\n780", ["780"]),
      ("My annual income totals 90000; 110000 including bonus", ["90000", "110000"]),
      ("My income is 90000. Including bonus it is 110000.", ["90000", "110000"]),
      ("My salary is currently somewhere around USD 90,000 to $110,000 per year", ["90,000", "110,000"]),
      ("Our income is roughly between 85k and 105k", ["85k", "105k"]),
      ("FICO is approximately 740-780", ["740", "780"]),
      ("My salary comes out to ninety thousand", ["ninety thousand"]),
      ("cred. score: seven hundred eighty; sal. = ninety-five thousand", ["seven hundred eighty", "ninety-five thousand"]),
    ]
    for (input, privateValues) in cases {
      let sanitized = AdvisorDraftGenerator.sanitizedAppleIntelligenceRequest(input)
      for value in privateValues {
        XCTAssertFalse(sanitized.contains(value), "Leaked \(value) from \(input)")
      }
    }
  }

  func testFinancialPhrasingsAcrossSeparatorsNeverReachAssembledPrompt() {
    let phrasings = [
      "my income is 90000",
      "my credit score is 780",
      "my salary is ninety thousand",
      "my budget is $3500",
    ]
    let separators = [" ", "\n", ":\n", "; ", ". Including 2025, "]
    for phrase in phrasings {
      for separator in separators {
        let command = "\(phrase)\(separator)110000"
        let payload = AdvisorMessagePayload(
          messageId: "message-property", originalCommand: command,
          draftText: "server draft", tone: "Professional"
        )
        XCTAssertNil(
          AdvisorDraftGenerator.appleIntelligencePrompt(
            payload: payload, tone: "Professional", toggles: [],
            senderName: "Sam", memorySummary: nil
          ),
          "Financial phrase unexpectedly produced a prompt: \(command)"
        )
      }
    }
  }

  func testAssembledPromptDropsUnsafeUserSentencesWithoutRecoveringSpans() throws {
    let unsafeCommands = [
      "My income is:\n90000 Broadway unit 12",
      "My 2025 income is 90000 Broadway unit 12",
      "My credit score is:\n780 Broadway",
      "My credit score is 780 and I live at 123 Main St",
      "my income is about 90000 and my credit score is around 780",
    ]
    for command in unsafeCommands {
      let payload = AdvisorMessagePayload(
        messageId: "message-unsafe", originalCommand: command,
        draftText: "server draft", tone: "Professional",
        context: sanitizerStructuredContext()
      )
      XCTAssertNil(
        AdvisorDraftGenerator.appleIntelligencePrompt(
          payload: payload, tone: "Professional", toggles: [],
          senderName: "Sam", memorySummary: nil
        ),
        "Unsafe command unexpectedly produced a model prompt: \(command)"
      )
    }

    let payload = AdvisorMessagePayload(
      messageId: "message-mixed",
      originalCommand: "Parking is not required. My income is 90000",
      draftText: "server draft", tone: "Professional",
      context: sanitizerStructuredContext()
    )
    let prompt = try XCTUnwrap(AdvisorDraftGenerator.appleIntelligencePrompt(
      payload: payload, tone: "Professional", toggles: [],
      senderName: "Sam", memorySummary: nil
    ))
    XCTAssertTrue(prompt.contains("Parking is not required."))
    XCTAssertFalse(prompt.contains("90000"))
    XCTAssertTrue(prompt.contains("123 Main St unit 204"))
    XCTAssertTrue(prompt.contains("October 15, 2026"))
    XCTAssertTrue(prompt.contains("No pets allowed"))
    XCTAssertFalse(prompt.contains("999 Private Road"))
  }

  func testAssembledPromptPreservesNegationOnlyAsWholeUserSentenceOrStructuredPreference() throws {
    let cases = [
      ("Parking is not required. My income is 90000", "Parking is not required."),
      ("An elevator is not needed. My credit score is 780", "An elevator is not needed."),
      ("A walk-up is not acceptable. My income is 90000", "A walk-up is not acceptable."),
      ("No\npets allowed. My income is 90000", "No\npets allowed."),
      ("no pets allowed. my income is 90000", "no pets allowed."),
    ]
    for (command, intactMeaning) in cases {
      let payload = AdvisorMessagePayload(
        messageId: "message-negation", originalCommand: command,
        draftText: "server draft", tone: "Professional",
        context: sanitizerStructuredContext()
      )
      let prompt = try XCTUnwrap(AdvisorDraftGenerator.appleIntelligencePrompt(
        payload: payload, tone: "Professional", toggles: [],
        senderName: "Sam", memorySummary: nil
      ))
      XCTAssertTrue(prompt.contains(intactMeaning), "Lost negation in \(prompt)")
      XCTAssertFalse(prompt.contains("90000"))
      XCTAssertFalse(prompt.contains("780"))
    }
  }

  func testEveryPromptFreeTextBoundaryDropsWholeUnsafeStructuredValues() throws {
    let payload = AdvisorMessagePayload(
      messageId: "message-all-fields",
      originalCommand: "I prefer something quiet and close to the train",
      draftText: "server draft", tone: "Professional",
      context: AdvisorContext(
        leverage: AdvisorLeverage(
          memberCount: 2, applicationReadiness: nil, activeOffers: nil,
          strongestListings: [AdvisorStrongListing(
            boardListingId: "listing-a", listing: "Income 90000 at 999 Private Road"
          )]
        ),
        requirements: AdvisorRequirements(
          budget: nil,
          moveIn: "Rent 3500 on October 15, 2026",
          locations: ["Credit 780 near Secret Place"],
          bedrooms: nil,
          mustHaves: ["No pets allowed", "Laundry; income 91000"],
          dealbreakers: ["No walk-up"], priorities: ["Natural light"],
          commuteDestinations: ["Salary 92000 near Hidden Station"],
          tensionFlags: ["No elevator", "Budget $4000 near Hidden Park"]
        ),
        picker: AdvisorPickerContext(
          conversationStage: "sent; income 93000",
          listingHistory: [AdvisorListingHistory(
            boardListingId: "listing-a", status: "answered; credit 740",
            templateId: "standard; salary 94000", contactedAt: nil,
            answered: true, daysSinceContact: 2
          )],
          boardFeedback: AdvisorFeedbackMemorySummary(sampleSize: 0, signals: [])
        )
      )
    )
    let prompt = try XCTUnwrap(AdvisorDraftGenerator.appleIntelligencePrompt(
      payload: payload, tone: "Professional",
      toggles: [AdvisorToggleOption(
        id: "unsafe", label: "Include credit 750", enabled: true, required: false
      )],
      senderName: "Sam income 95000", memorySummary: "accepted twice; income 96000"
    ))
    for privateValue in [
      "90000", "3500", "780", "91000", "92000", "4000", "93000", "740",
      "94000", "750", "95000", "96000", "999 Private Road", "Secret Place",
      "Hidden Station", "Hidden Park",
    ] {
      XCTAssertFalse(prompt.contains(privateValue), "Leaked \(privateValue) in \(prompt)")
    }
    for safeValue in ["No pets allowed", "No walk-up", "Natural light", "No elevator"] {
      XCTAssertTrue(prompt.contains(safeValue), "Dropped safe structured value \(safeValue)")
    }
    XCTAssertTrue(prompt.contains("Sender name: Homeboard member"))
  }

  func testUnsafeAppleIntelligenceInputUsesOnlyStructuredDeterministicFallback() async {
    let payload = AdvisorMessagePayload(
      messageId: "message-fallback",
      originalCommand: "My income is 90000. Including bonus it is 110000.",
      draftText: "server draft", tone: "Professional",
      context: sanitizerStructuredContext()
    )
    let output = await AdvisorDraftGenerator.generate(
      payload: payload, tone: "Professional",
      toggles: [
        AdvisorToggleOption(id: "requirements", label: "Group requirements", enabled: true, required: false),
        AdvisorToggleOption(id: "commute", label: "Commute fit", enabled: true, required: false),
      ],
      financialSentence: nil,
      senderName: "Sam; My annual compensation is:\n88000"
    )
    XCTAssertEqual(output.source, "device_template")
    XCTAssertTrue(output.text.contains("123 Main St unit 204"))
    XCTAssertTrue(output.text.contains("October 15, 2026"))
    XCTAssertTrue(output.text.contains("900 Broadway unit 12"))
    XCTAssertTrue(output.text.contains("Homeboard member"))
    for privateValue in ["90000", "110000", "88000"] {
      XCTAssertFalse(output.text.contains(privateValue), "Leaked \(privateValue) in \(output.text)")
    }
  }

  private func sanitizerStructuredContext() -> AdvisorContext {
    AdvisorContext(
      leverage: AdvisorLeverage(
        memberCount: 2, applicationReadiness: nil, activeOffers: nil,
        strongestListings: [AdvisorStrongListing(
          boardListingId: "listing-a", listing: "123 Main St unit 204"
        )]
      ),
      requirements: AdvisorRequirements(
        budget: nil, moveIn: "October 15, 2026",
        locations: ["456 Park Avenue apartment 789"], bedrooms: nil,
        mustHaves: ["No pets allowed", "Something quiet"],
        dealbreakers: ["A walk-up is not acceptable"],
        priorities: ["Natural light"],
        commuteDestinations: ["900 Broadway unit 12"],
        tensionFlags: ["An elevator is not needed"]
      )
    )
  }

  func testAdvisorDraftBackendCompatibilityRejectsLegacyHealthPayload() {
    let health = MobileHealthResponse(
      apiVersion: "0.0.13",
      serverCommit: "2c34b55c6968",
      checks: nil,
      capabilities: nil,
      routeMethods: nil
    )

    XCTAssertEqual(
      AdvisorBackendCompatibility.advisorDraftAcceptanceIssue(health),
      "Advisor draft persistence is unavailable."
    )
  }

  func testAdvisorDraftBackendCompatibilityRequiresSchemaAndPatchMethod() {
    var health = MobileHealthResponse(
      apiVersion: "0.0.13",
      serverCommit: "8d9942b5320e",
      checks: MobileHealthChecks(advisorDraftPersistence: "ok"),
      capabilities: MobileHealthCapabilities(advisorDraftAcceptance: true),
      routeMethods: MobileHealthRouteMethods(boardMessages: ["POST"])
    )

    XCTAssertEqual(
      AdvisorBackendCompatibility.advisorDraftAcceptanceIssue(health),
      "PATCH /api/mobile/boards/[id]/messages is unavailable."
    )

    health.routeMethods = MobileHealthRouteMethods(boardMessages: ["POST", "PATCH"])
    XCTAssertNil(AdvisorBackendCompatibility.advisorDraftAcceptanceIssue(health))
  }

  func testLegacyNeedsInputAdvisorCardStaysBlockedUntilPersistedRecovery() {
    var payload = AdvisorMessagePayload(
      messageId: "advisor-message-1",
      originalCommand: "@advisor draft a tour request",
      draftText: "Advisor needs more information.",
      executionStatus: "needs_input",
      generationSource: "server_template"
    )

    XCTAssertTrue(AdvisorDraftSafety.hasOriginalAdvisorCommand(payload))
    XCTAssertFalse(
      AdvisorDraftSafety.isPersistedDraftReady(
        payload,
        expectedMessageId: "advisor-message-1"
      )
    )

    payload.draftText = "Hi, could we tour this weekend?"
    payload.executionStatus = "draft_ready"
    payload.generationSource = "device_template"
    payload.acceptedAt = "2026-09-27T20:30:00.000Z"
    XCTAssertTrue(
      AdvisorDraftSafety.isPersistedDraftReady(
        payload,
        expectedMessageId: "advisor-message-1"
      )
    )
  }

  func testRecoveredAdvisorDraftRejectsWrongMessageAndFinancialPlaceholders() {
    var payload = AdvisorMessagePayload(
      messageId: "advisor-message-1",
      originalCommand: "@advisor write to the broker",
      draftText: "Financial information is available on request.",
      executionStatus: "draft_ready",
      generationSource: "apple_intelligence",
      acceptedAt: "2026-09-27T20:30:00.000Z"
    )

    XCTAssertFalse(
      AdvisorDraftSafety.isPersistedDraftReady(
        payload,
        expectedMessageId: "different-message"
      )
    )
    payload.draftText = "Our income is [income multiple] and credit is [credit score]."
    XCTAssertFalse(
      AdvisorDraftSafety.isPersistedDraftReady(
        payload,
        expectedMessageId: "advisor-message-1"
      )
    )
  }

  func testLegacyAdvisorCardWithoutOriginalCommandRequiresReask() {
    let payload = AdvisorMessagePayload(
      messageId: "advisor-message-1",
      draftText: "Old rendered text",
      executionStatus: "needs_input"
    )

    XCTAssertFalse(AdvisorDraftSafety.hasOriginalAdvisorCommand(payload))
    XCTAssertFalse(AdvisorDraftSafety.isPersistedDraftReady(payload))
  }

  private func replyThread(
    id: String = "outreach-1",
    listingID: String = "listing-1"
  ) -> AdvisorReplyThreadOption {
    AdvisorReplyThreadOption(
      id: id,
      outreachId: id,
      listingId: listingID,
      listingName: "123 Main Street",
      recipientName: "Alex Agent",
      method: "email",
      status: "reported_sent",
      contactedAt: "2026-09-26T12:00:00.000Z"
    )
  }

  private func remoteProfile(
    advisorSetupVersion: Int? = nil,
    advisorSetupCompletedAt: String? = nil
  ) -> RemoteRentalProfilePayload {
    RemoteRentalProfilePayload(
      name: "Sam",
      email: nil,
      city: "New York",
      moveInDate: "October",
      budgetMin: nil,
      budgetMax: 4_500,
      commuteTarget: nil,
      commuteAccess: "skip",
      minCommuteMinutes: nil,
      maxCommuteMinutes: nil,
      neighborhoods: [],
      mustHaves: ["Laundry"],
      dealbreakers: [],
      priorities: ["Price"],
      groupSize: 2,
      notes: nil,
      rentalReadiness: nil,
      advisorFinancialMode: advisorSetupVersion == nil ? nil : "available_on_request",
      advisorIncomeMultiple: nil,
      advisorCreditScore: nil,
      advisorSetupCompletedAt: advisorSetupCompletedAt,
      advisorSetupVersion: advisorSetupVersion
    )
  }

  func testOlderServerCannotEraseCompletedAdvisorSetup() {
    var local = RentalProfile()
    local.advisorFinancialMode = "provided"
    local.advisorIncomeMultiple = "3.5x"
    local.advisorCreditScore = "760"
    local.advisorSetupCompletedAt = "2026-09-27T04:30:00Z"
    local.advisorSetupVersion = 2

    let preserved = AppModel.profilePreservingAdvisorSetup(
      remote: remoteProfile(),
      fallback: local
    )
    XCTAssertEqual(preserved.advisorFinancialMode, "available_on_request")
    XCTAssertNil(preserved.advisorIncomeMultiple)
    XCTAssertNil(preserved.advisorCreditScore)
    XCTAssertEqual(preserved.advisorSetupCompletedAt, "2026-09-27T04:30:00Z")
    XCTAssertEqual(preserved.advisorSetupVersion, 2)

    let current = AppModel.profilePreservingAdvisorSetup(
      remote: remoteProfile(
        advisorSetupVersion: 3,
        advisorSetupCompletedAt: "2026-09-27T05:00:00Z"
      ),
      fallback: local
    )
    XCTAssertEqual(current.advisorSetupVersion, 3)
    XCTAssertEqual(current.advisorSetupCompletedAt, "2026-09-27T05:00:00Z")
  }

  func testCompletedAdvisorSetupStaysDismissedAfterStaleProfileRefresh() {
    var completed = RentalProfile()
    completed.advisorSetupCompletedAt = "2026-10-04T20:00:00Z"
    completed.advisorSetupVersion = 2

    XCTAssertFalse(
      AdvisorSetupPresentationPolicy.shouldPresent(
        isUnlocked: true,
        setupVersion: completed.advisorSetupVersion
      )
    )

    let missingVersionRefresh = AppModel.profilePreservingAdvisorSetup(
      remote: remoteProfile(),
      fallback: completed
    )
    XCTAssertEqual(missingVersionRefresh.advisorSetupVersion, 2)
    XCTAssertFalse(
      AdvisorSetupPresentationPolicy.shouldPresent(
        isUnlocked: true,
        setupVersion: missingVersionRefresh.advisorSetupVersion
      )
    )

    let staleVersionRefresh = AppModel.profilePreservingAdvisorSetup(
      remote: remoteProfile(
        advisorSetupVersion: 1,
        advisorSetupCompletedAt: nil
      ),
      fallback: completed
    )
    XCTAssertEqual(staleVersionRefresh.advisorSetupVersion, 2)
    XCTAssertEqual(staleVersionRefresh.advisorSetupCompletedAt, "2026-10-04T20:00:00Z")
    XCTAssertFalse(
      AdvisorSetupPresentationPolicy.shouldPresent(
        isUnlocked: true,
        setupVersion: staleVersionRefresh.advisorSetupVersion
      )
    )
  }

  func testHTMLServerErrorsAreSafeForTheChatFeed() {
    let error = HomeboardAPIError.response(
      endpoint: "GET /api/mobile/boards/board-1/preference-proposals",
      status: 404,
      contentType: "text/html; charset=utf-8",
      bodyExcerpt: "<!DOCTYPE html><html>private deployment details</html>",
      message: "Request failed."
    )
    XCTAssertTrue(error.isMissingEndpoint("/preference-proposals"))
    XCTAssertTrue(error.errorDescription?.contains("newer Homeboard server") == true)
    XCTAssertFalse(error.errorDescription?.contains("<!DOCTYPE") == true)
    XCTAssertTrue(error.diagnosticDescription.contains("<!DOCTYPE"))
  }

  func testAdvisorNotificationSettingsDecodeAsBoardScopedControls() throws {
    let data = try XCTUnwrap(#"{"digestHourLocal":18,"timeZone":"America/New_York","nonCriticalPushEnabled":false,"urgentPushesAlwaysEnabled":true,"scope":"board"}"#.data(using: .utf8))
    let settings = try JSONDecoder().decode(BoardNotificationSettings.self, from: data)
    XCTAssertEqual(settings.digestHourLocal, 18)
    XCTAssertEqual(settings.timeZone, "America/New_York")
    XCTAssertFalse(settings.nonCriticalPushEnabled)
    XCTAssertTrue(settings.urgentPushesAlwaysEnabled)
    XCTAssertEqual(settings.scope, "board")
  }

  func testReplyScreenshotPreviewIsUnverifiedAndRequiresManualThreadChoice() throws {
    let preview = try XCTUnwrap(AdvisorReplyScreenshotExtractor.parseModelResponse(
      #"prefix {"apparentSender":"Alex Agent","replyText":"Unit 4B is available Saturday."} suffix"#
    ))
    XCTAssertEqual(preview.apparentSender, "Alex Agent")
    XCTAssertEqual(preview.replyText, "Unit 4B is available Saturday.")
    XCTAssertTrue(preview.sourceLabel.localizedCaseInsensitiveContains("unverified"))
    XCTAssertNil(AdvisorReplyIntakePolicy.initialThreadID(
      threads: [replyThread()],
      listingID: "listing-1",
      source: .appleIntelligence
    ))
    XCTAssertNil(AdvisorReplyIntakePolicy.initialThreadID(
      threads: [replyThread()],
      listingID: "listing-1",
      source: .onDeviceOCR
    ))
  }

  func testReplyManualFallbackHonorsOnlyOneExplicitListingThread() {
    XCTAssertEqual(AdvisorReplyIntakePolicy.initialThreadID(
      threads: [replyThread()],
      listingID: "listing-1",
      source: .manual
    ), "outreach-1")
    XCTAssertNil(AdvisorReplyIntakePolicy.initialThreadID(
      threads: [replyThread(id: "one"), replyThread(id: "two")],
      listingID: "listing-1",
      source: .manual
    ))
    XCTAssertNil(AdvisorReplyIntakePolicy.initialThreadID(
      threads: [replyThread(listingID: "other-listing")],
      listingID: "listing-1",
      source: .manual
    ))
  }

  func testReplyIntakeCannotSilentlyCrossListings() {
    let listingAThread = replyThread(id: "outreach-a", listingID: "listing-a")
    let listingBThread = replyThread(id: "outreach-b", listingID: "listing-b")
    let threads = [listingAThread, listingBThread]

    XCTAssertEqual(
      AdvisorReplyIntakePolicy.threads(threads, for: "listing-a").map(\.id),
      ["outreach-a"]
    )
    XCTAssertFalse(AdvisorReplyIntakePolicy.canSubmit(
      openListingID: "listing-a",
      activeListingID: "listing-a",
      selectedThread: listingBThread,
      confirmedSwitchedListingID: nil
    ))
    XCTAssertFalse(AdvisorReplyIntakePolicy.canSubmit(
      openListingID: "listing-a",
      activeListingID: "listing-b",
      selectedThread: listingBThread,
      confirmedSwitchedListingID: nil
    ))
    XCTAssertTrue(AdvisorReplyIntakePolicy.canSubmit(
      openListingID: "listing-a",
      activeListingID: "listing-b",
      selectedThread: listingBThread,
      confirmedSwitchedListingID: "listing-b"
    ))
  }

  func testReplyConfirmationGatePreventsDuplicateSubmissionButAllowsRetryAfterFailure() {
    let confirmationID = UUID()
    var gate = AdvisorReplySubmissionGate()
    XCTAssertTrue(gate.begin(confirmationID))
    XCTAssertFalse(gate.begin(confirmationID))
    gate.finish(confirmationID, succeeded: false)
    XCTAssertTrue(gate.begin(confirmationID))
    gate.finish(confirmationID, succeeded: true)
    XCTAssertFalse(gate.begin(confirmationID))
  }

  func testAdvisorRankingDiffReportsMovesWithoutChangingScoreMath() {
    let downtown = ListingPreview(
      id: "downtown", title: "Downtown", location: "SoHo", priceLine: "$3,200",
      commuteLine: "15 min", summary: "Doorman", fitLabel: "", highlights: ["Elevator"], openRisks: []
    )
    let uptown = ListingPreview(
      id: "uptown", title: "Uptown", location: "Harlem", priceLine: "$2,700",
      commuteLine: "35 min", summary: "Parking", fitLabel: "", highlights: ["Parking"], openRisks: []
    )
    var old = RentalProfile()
    old.budgetMax = "3000"
    old.minCommuteMinutes = "10"
    old.maxCommuteMinutes = "20"
    old.neighborhoods = ["SoHo"]
    var updated = old
    updated.maxCommuteMinutes = "40"
    updated.neighborhoods = ["Harlem"]
    updated.mustHaves = ["parking"]

    let result = AdvisorListingRanker.diff(listings: [downtown, uptown], oldProfile: old, newProfile: updated)
    XCTAssertEqual(result.changes.count, 2)
    XCTAssertEqual(result.topListingTitle, "Uptown")
    XCTAssertTrue(result.message.contains("2 listings moved"))
  }

  func testAdvisorRankingDiffReportsNoChangeAndPreservesHardFailureFlag() {
    var listing = ListingPreview(
      id: "same", title: "Same", location: "SoHo", priceLine: "$2,500",
      commuteLine: "20 min", summary: "Elevator", fitLabel: "", highlights: [], openRisks: []
    )
    listing.analysis = GroupListingAnalysis(
      overallScore: 40, lowestRoommateScore: 20, disagreement: 10, fairnessScore: 30,
      hardFailureCount: 1, rankingLabel: "Review", verdict: "Hard limit", confidence: "high",
      confidenceReason: "Known", nextActions: [], members: []
    )
    let profile = RentalProfile()
    let unchanged = AdvisorListingRanker.diff(listings: [listing], oldProfile: profile, newProfile: profile)
    XCTAssertTrue(unchanged.changes.isEmpty)
    XCTAssertEqual(unchanged.message, "Scores updated: no ranking change.")

    var updated = profile
    updated.mustHaves = ["elevator"]
    let scoreOnly = AdvisorListingRanker.diff(listings: [listing], oldProfile: profile, newProfile: updated)
    XCTAssertTrue(scoreOnly.changes.isEmpty, "A score change without a rank change must not claim movement")
    XCTAssertEqual(AdvisorListingRanker.score(listing, profile: updated), 1)
    XCTAssertEqual(listing.analysis?.hardFailureCount, 1)
  }

  func testAdvisorNotificationTimezoneDoesNotSilentlyFollowTravel() {
    XCTAssertEqual(
      AdvisorNotificationTimeZonePolicy.zoneAfterDeviceRegistration(
        stored: "UTC",
        source: "fallback",
        device: "America/Los_Angeles"
      ),
      "America/Los_Angeles"
    )
    XCTAssertEqual(
      AdvisorNotificationTimeZonePolicy.zoneAfterDeviceRegistration(
        stored: "America/New_York",
        source: "manual",
        device: "America/Los_Angeles"
      ),
      "America/New_York"
    )
    XCTAssertTrue(AdvisorNotificationTimeZonePolicy.shouldOfferDeviceUpdate(
      stored: "America/New_York",
      device: "America/Los_Angeles"
    ))
  }

  func testReplyRequestContainsMinimumConfirmedFieldsAndNoScreenshot() throws {
    let request = MobileAdvisorReplyRequest(
      text: "Unit 4B is available Saturday.",
      outreachId: "outreach-1",
      confirmationId: "d9085635-2376-48bd-933d-a94ce6801777"
    )
    let object = try XCTUnwrap(
      JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any]
    )
    XCTAssertEqual(Set(object.keys), Set(["text", "outreachId", "confirmationId", "extractionSource"]))
    XCTAssertEqual(object["extractionSource"] as? String, "manual")
    XCTAssertNil(object["image"])
    XCTAssertNil(object["screenshot"])
    XCTAssertNil(object["apparentSender"])
  }

  func testPreferenceFallbackRequiresExplicitFirstPersonEvidence() {
    let positive = AdvisorPreferenceExtractor.deterministicSignals(
      in: "I really need parking and natural light is important to me."
    )
    XCTAssertEqual(Set(positive.map(\.feature)), Set(["parking", "natural_light"]))

    for unsafe in [
      "Maybe I need parking.",
      "She needs parking.",
      "If I needed parking, I would say so.",
      "The broker wrote \"I need parking\".",
      "I need parking, but I don't care about the garage.",
    ] {
      XCTAssertTrue(AdvisorPreferenceExtractor.deterministicSignals(in: unsafe).isEmpty, unsafe)
    }
  }

  func testPreferenceFallbackRejectsPastAndRetractedAssertions() {
    for retraction in [
      "I used to say I need parking, but I changed my mind",
      "Yesterday I said I need parking, but not anymore",
      "Back then I said I need parking",
      "In the past I said \"I need parking\"",
      "\"I need parking\"",
      "I need parking back then",
      "I need parking, but I no longer do",
      "I need parking, but I don't anymore",
      "I need parking, however I do not anymore",
      "I need parking, but I changed my mind",
    ] {
      XCTAssertTrue(AdvisorPreferenceExtractor.deterministicSignals(in: retraction).isEmpty, retraction)
    }

    for current in [
      "I need parking",
      "we really need parking now",
      "Back then I said I need parking, but I need parking now",
    ] {
      let signals = AdvisorPreferenceExtractor.deterministicSignals(in: current)
      XCTAssertEqual(signals.count, 1, current)
      XCTAssertEqual(signals.first?.feature, "parking", current)
      XCTAssertEqual(signals.first?.weight, 2, current)
      XCTAssertEqual(signals.first?.intent, "preference", current)
    }

    let independent = AdvisorPreferenceExtractor.deterministicSignals(
      in: "I need parking, but I don't need the gym anymore"
    )
    XCTAssertEqual(independent.map(\.feature), ["gym", "parking"])
    XCTAssertEqual(independent.map(\.intent), ["remove_must_have", "preference"])

    let unrelated = AdvisorPreferenceExtractor.deterministicSignals(
      in: "I need parking, however natural light is important to me"
    )
    XCTAssertEqual(unrelated.map(\.feature), ["natural_light", "parking"])
  }

  func testPreferenceFallbackSeparatesLowPriorityFromMustHaveRemoval() throws {
    let lower = try XCTUnwrap(
      AdvisorPreferenceExtractor.deterministicSignals(in: "I don't care about parking").first
    )
    XCTAssertEqual(lower.intent, "preference")
    XCTAssertEqual(lower.weight, -2)

    let removal = try XCTUnwrap(
      AdvisorPreferenceExtractor.deterministicSignals(in: "I don't need parking anymore").first
    )
    XCTAssertEqual(removal.intent, "remove_must_have")
    XCTAssertEqual(removal.feature, "parking")
  }

  func testAdvisorRegenerationRejectsRenderedAssistantContent() {
    XCTAssertThrowsError(
      try AppModel.advisorRegenerationCommand(
        originalCommand: "Hi, I am reaching out regarding 123 Main Street.",
        toggles: []
      )
    )
  }

  func testAdvisorRegenerationSendsExplicitNothingWhenEveryToggleIsOff() throws {
    let toggles = [
      AdvisorToggleOption(id: "include_income_multiple", label: "Income multiple", enabled: false, required: false),
      AdvisorToggleOption(id: "request_tour", label: "Request a tour", enabled: false, required: false),
    ]

    XCTAssertEqual(
      try AppModel.advisorRegenerationCommand(
        originalCommand: "@advisor draft outreach for 123 Main Street",
        toggles: toggles
      ),
      "@advisor draft outreach for 123 Main Street\nInclude: nothing"
    )
  }

  func testAdvisorRegenerationSendsOnlyTheChangedToggleSubset() throws {
    let toggles = [
      AdvisorToggleOption(id: "include_income_multiple", label: "Income multiple", enabled: true, required: false),
      AdvisorToggleOption(id: "include_credit_score", label: "Credit score", enabled: false, required: false),
      AdvisorToggleOption(id: "request_tour", label: "Request a tour", enabled: true, required: false),
    ]

    XCTAssertEqual(
      try AppModel.advisorRegenerationCommand(
        originalCommand: "@advisor draft outreach\nInclude: Credit score",
        toggles: toggles
      ),
      "@advisor draft outreach\nInclude: Income multiple, Request a tour"
    )
  }

  func testLegacySessionResponseDecodesWithoutForcingOnboarding() throws {
    let response = try JSONDecoder().decode(
      MobileSessionResponse.self,
      from: Data(
        #"{"user":{"id":"app-user-1","email":"user@example.com","displayName":"Sam"},"boards":[{"id":"board-1","title":"Shared search","city":"New York, NY","createdAt":"2026-09-01T00:00:00.000Z","updatedAt":"2026-09-12T00:00:00.000Z"}],"activeBoard":null}"#.utf8
      )
    )

    XCTAssertEqual(response.boards.map(\.id), ["board-1"])
    XCTAssertNil(response.membershipState)
  }

  func testPollVoteIdentityDoesNotConfuseMembersWithTheSameName() throws {
    let decision = ListingDecisionSummary(id: "tour", type: "request_viewing", votes: [
      ListingDecisionVote(name: "Sam", choice: "no", userId: "first-sam"),
      ListingDecisionVote(name: "Sam", choice: "yes", userId: "second-sam")
    ])
    XCTAssertEqual(decision.choice(for: "second-sam"), "yes")
    XCTAssertNil(decision.choice(for: nil))
    XCTAssertNil(decision.choice(for: "unknown"))

    let legacy = try JSONDecoder().decode(ListingDecisionVote.self, from: Data(#"{"name":"Sam","choice":"yes"}"#.utf8))
    XCTAssertNil(legacy.userId)
    XCTAssertEqual(legacy.choice, "yes")
  }

  func testGroupDecisionProgressRequiresEveryoneAndDecodesLegacyPayloads() throws {
    let pending = ListingDecisionSummary(
      id: "tour",
      type: "request_viewing",
      votes: [ListingDecisionVote(name: "Sam", choice: "yes", userId: "sam")],
      resolvedCount: 1,
      requiredCount: 3,
      remainingMemberNames: ["Maya", "Alex"]
    )
    XCTAssertEqual(pending.groupResolvedCount, 1)
    XCTAssertEqual(pending.groupRequiredCount, 3)
    XCTAssertFalse(pending.isGroupResolved)

    let complete = ListingDecisionSummary(
      id: "apply",
      type: "apply",
      votes: [],
      resolvedCount: 3,
      requiredCount: 3
    )
    XCTAssertTrue(complete.isGroupResolved)

    let legacy = try JSONDecoder().decode(
      ListingDecisionSummary.self,
      from: Data(#"{"id":"old","type":"shortlist","closedAt":null,"votes":[]}"#.utf8)
    )
    XCTAssertEqual(legacy.groupResolvedCount, 0)
    XCTAssertEqual(legacy.groupRequiredCount, 2)
    XCTAssertFalse(legacy.isGroupResolved)
  }

  func testOpenPollLookupExcludesClosedDecisionsAndOtherPollTypes() {
    var listing = ListingPreview(
      title: "123 Example Street", location: "New York", priceLine: "$2,000",
      commuteLine: "Compare routes", summary: "", fitLabel: "", highlights: [], openRisks: []
    )
    listing.decisions = [
      ListingDecisionSummary(id: "closed-tour", type: "request_viewing", closedAt: "2026-09-04", votes: []),
      ListingDecisionSummary(id: "apply", type: "apply", votes: []),
      ListingDecisionSummary(id: "open-tour", type: "request_viewing", votes: [])
    ]
    XCTAssertEqual(listing.openDecision(for: .requestViewing)?.id, "open-tour")
    XCTAssertNil(listing.openDecision(for: .shortlist))
  }

  func testPassedShortlistFilterHandlesBothStatusesAndDoesNotLeakIntoTouring() {
    var listing = ListingPreview(
      title: "123 Example Street", location: "New York", priceLine: "$2,000",
      commuteLine: "Compare routes", summary: "", fitLabel: "", highlights: [], openRisks: []
    )
    listing.workflowStatus = "viewing"
    for status in ["passed", "rejected", "REJECTED"] {
      listing.status = status
      XCTAssertTrue(SharedListingFilter.passed.includes(listing))
      XCTAssertTrue(SharedListingFilter.all.includes(listing))
      XCTAssertFalse(SharedListingFilter.active.includes(listing))
      XCTAssertFalse(SharedListingFilter.touring.includes(listing))
    }
    listing.status = "interested"
    XCTAssertTrue(SharedListingFilter.touring.includes(listing))
    XCTAssertFalse(SharedListingFilter.passed.includes(listing))
  }

  func testProfileCompletionTracksEveryRequiredField() {
    var profile = RentalProfile()
    XCTAssertEqual(profile.percentComplete, 0)
    XCTAssertEqual(profile.missingFields.count, 8)

    profile.name = "Sam"
    profile.city = "New York City"
    profile.moveInDate = "August"
    profile.budgetMax = "1700"
    profile.commuteTarget = "350 5th Ave, New York, NY 10118"
    profile.minCommuteMinutes = "5"
    profile.maxCommuteMinutes = "45"
    profile.mustHaves = ["Laundry"]
    profile.dealbreakers = ["Over budget"]
    profile.priorities = ["Commute", "Price"]

    XCTAssertTrue(profile.isBoardReady)
    XCTAssertEqual(profile.percentComplete, 100)
    XCTAssertTrue(profile.missingFields.isEmpty)
  }

  func testCommuteScoreIsEqualInsideTheChosenBand() {
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 10,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 22,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 35,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
    XCTAssertLessThan(
      SharedComparisonMath.commuteScore(
        minutes: 5,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
    XCTAssertLessThan(
      SharedComparisonMath.commuteScore(
        minutes: 45,
        preferredMinutes: 10,
        maximumMinutes: 35
      ),
      100
    )
  }

  func testLongCommuteScoreRespectsTheChosenMaximum() {
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 180,
        preferredMinutes: 30,
        maximumMinutes: 120
      ),
      0
    )
    XCTAssertEqual(
      SharedComparisonMath.commuteScore(
        minutes: 180,
        preferredMinutes: 30,
        maximumMinutes: 180
      ),
      100
    )
  }

  func testListingCoordinatesSurvivePersistenceRoundTrip() throws {
    let listing = ListingPreview(
      title: "21-18 31st Avenue",
      address: "21-18 31st Avenue, Astoria, NY 11106",
      location: "Astoria, Queens, NY 11106",
      priceLine: "$4,650",
      commuteLine: "Compare routes",
      summary: "Sample",
      fitLabel: "Strong shared fit",
      highlights: [],
      openRisks: [],
      latitude: 40.7685,
      longitude: -73.9253
    )

    let data = try JSONEncoder().encode(listing)
    let restored = try JSONDecoder().decode(ListingPreview.self, from: data)

    XCTAssertEqual(try XCTUnwrap(restored.latitude), 40.7685, accuracy: 0.000_001)
    XCTAssertEqual(try XCTUnwrap(restored.longitude), -73.9253, accuracy: 0.000_001)
    XCTAssertEqual(restored.address, "21-18 31st Avenue, Astoria, NY 11106")
  }

  func testScannerDoesNotMistakeListingTitleForCapturedAddress() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "pageTitle": "900 Broadway, New York, NY 10003 | Similar rentals",
      "address": "1 Meadowlands Pkwy, Secaucus, NJ 07094",
      "city": "Secaucus",
      "region": "NJ",
      "postalCode": "07094"
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.address, "1 Meadowlands Pkwy, Secaucus, NJ 07094")
  }

  func testMapGeocodesVerifiedAddressWithoutTitleOrBoardCity() {
    let listing = ListingPreview(
      title: "Secaucus: Meadowlands apartments",
      address: "1 Meadowlands Pkwy, Secaucus, NJ 07094",
      location: "Secaucus",
      priceLine: "$2,750",
      commuteLine: "Compare routes",
      summary: "Sample",
      fitLabel: "New",
      highlights: [],
      openRisks: []
    )

    XCTAssertEqual(
      SharedListingLocation.geocodingQuery(for: listing),
      "1 Meadowlands Pkwy, Secaucus, NJ 07094"
    )
  }

  func testSafariListingCapturePreservesEnrichedFacts() throws {
    let capture = HomeboardSharedImportStore.PendingImport(
      url: "https://www.zillow.com/homedetails/123-Main-St-4B/123_zpid/",
      canonicalURL: "https://www.zillow.com/homedetails/123-Main-St-4B/123_zpid/",
      boardId: "board-1",
      sourceName: "Zillow",
      pageTitle: "123 Main Street #4B",
      address: "123 Main Street, New York, NY 10001",
      unit: "4B",
      city: "New York",
      neighborhood: "Chelsea",
      latitude: 40.7465,
      longitude: -74.0014,
      price: 4_800,
      bedrooms: 2,
      bathrooms: 1.5,
      squareFeet: 920,
      availableDate: "Aug 15",
      imageURL: "https://photos.example.com/cover.jpg",
      summary: "Bright two-bedroom close to the train.",
      amenities: ["pet friendly", "free laundry"],
      modelInsights: [
        HomeboardListingInsight(
          category: "interior",
          label: "Double vanity",
          sentiment: 0.7,
          confidence: 0.91,
          evidence: "double-sink bathroom vanity"
        )
      ],
      listingScope: "unit",
      extractionConfidence: "high"
    )

    let data = try JSONEncoder().encode(capture)
    let restored = try JSONDecoder().decode(
      HomeboardSharedImportStore.PendingImport.self,
      from: data
    )

    XCTAssertEqual(restored.sourceName, "Zillow")
    XCTAssertEqual(restored.unit, "4B")
    XCTAssertEqual(restored.price, 4_800)
    XCTAssertEqual(restored.bathrooms, 1.5)
    XCTAssertEqual(try XCTUnwrap(restored.latitude), 40.7465, accuracy: 0.000_001)
    XCTAssertEqual(try XCTUnwrap(restored.longitude), -74.0014, accuracy: 0.000_001)
    XCTAssertEqual(restored.squareFeet, 920)
    XCTAssertEqual(restored.availableDate, "Aug 15")
    XCTAssertEqual(restored.amenities, ["pet friendly", "free laundry"])
    XCTAssertEqual(restored.modelInsights.first?.label, "Double vanity")
    XCTAssertEqual(restored.extractionConfidence, "high")
  }

  func testOlderURLOnlyCaptureStillDecodes() throws {
    let data = Data(
      #"{"url":"https://example.com/listing","boardId":"board-1","createdAt":0}"#.utf8
    )
    let restored = try JSONDecoder().decode(
      HomeboardSharedImportStore.PendingImport.self,
      from: data
    )

    XCTAssertEqual(restored.url, "https://example.com/listing")
    XCTAssertEqual(restored.boardId, "board-1")
    XCTAssertNil(restored.price)
    XCTAssertNil(restored.latitude)
    XCTAssertNil(restored.longitude)
    XCTAssertTrue(restored.modelInsights.isEmpty)
  }

  func testListingIntelligenceKeepsBuildingUnitsSeparate() async {
    let evidence = """
      219 Kent Avenue
      Unit 2A · $4,800 · 2 beds · 2 baths
      Unit 5C · $5,250 · 3 beds · 2 baths
      """
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "building",
      "address": "219 Kent Avenue",
      "pageEvidence": evidence,
      "unitOptions": [
        [
          "id": "2A",
          "label": "Unit 2A",
          "unit": "2A",
          "price": 4_800,
          "bedrooms": 2,
          "bathrooms": 2
        ],
        [
          "id": "5C",
          "label": "Unit 5C",
          "unit": "5C",
          "price": 5_250,
          "bedrooms": 3,
          "bathrooms": 2
        ]
      ]
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.scope, "building")
    XCTAssertEqual(analysis.options.count, 2)
    XCTAssertEqual(analysis.options[0].unit, "2A")
    XCTAssertEqual(analysis.options[0].price, 4_800)
    XCTAssertEqual(analysis.options[1].unit, "5C")
    XCTAssertEqual(analysis.options[1].price, 5_250)
  }

  func testSafariSharePipelineFindsTenUnitsFromTwoInitialCandidates() async {
    let evidence = "Available units\nAll (10)\n" + (1...10).map { index in
      "\(index)A\n2 beds, 1 bath\n850\nNow\n$\(3000 + (index - 1) * 100)"
    }.joined(separator: "\n")
    let scan = await HomeboardListingIntelligence.analyzeWithOneRescan(message: [
      "listingScope": "building",
      "address": "123 Main Street",
      "availabilityPageEvidence": evidence,
      "semanticPageEvidence": evidence,
      "secondaryPageEvidence": evidence,
      "unitOptions": [
        ["unit": "1A", "label": "1A", "price": 3000, "bedrooms": 2, "bathrooms": 1],
        ["unit": "2A", "label": "2A", "price": 3100, "bedrooms": 2, "bathrooms": 1]
      ]
    ], allowSystemModel: false)
    XCTAssertEqual(scan.analysis.options.map(\.unit), (1...10).map { "\($0)A" })
    XCTAssertEqual(scan.analysis.options.map(\.price), (0..<10).map { Double(3000 + $0 * 100) })
    XCTAssertTrue(scan.analysis.options.allSatisfy { $0.bedrooms == 2 && $0.bathrooms == 1 && $0.squareFeet == 850 })
  }

  func testSafariSharePipelineRejectsExtraCandidatesAndUsesEachRowsPrice() async {
    let evidence = "1A\n2 beds, 1 bath\n850\nNow\n$3000\n2A\n2 beds, 1 bath\n850\nNow\n$3100"
    let candidates = (1...5).map { index -> [String: Any] in
      ["unit": "\(index)A", "label": "\(index)A", "price": 3100, "bedrooms": 2, "bathrooms": 1]
    }
    let scan = await HomeboardListingIntelligence.analyzeWithOneRescan(message: [
      "listingScope": "building", "address": "123 Main Street",
      "availabilityPageEvidence": evidence,
      "pageEvidence": "Recommended unit 3A 2 beds 1 bath $3100. Unavailable unit 4A 2 beds 1 bath $3100. Unit 5A 2 beds 1 bath $3100",
      "unitOptions": candidates
    ], allowSystemModel: false)
    XCTAssertEqual(scan.analysis.options.map(\.unit), ["1A", "2A"])
    XCTAssertEqual(scan.analysis.options.map(\.price), [3000, 3100])
  }

  func testSafariEmptyAvailabilityRejectsCandidatesFromGeneralPageCopy() async {
    let scan = await HomeboardListingIntelligence.analyzeWithOneRescan(message: [
      "listingScope": "building", "address": "123 Main Street",
      "availabilityPageEvidence": "", "structuredUnitEvidence": "",
      "pageEvidence": "Unit 3A 2 beds 1 bath $3100",
      "unitOptions": [["unit": "3A", "label": "3A", "price": 3100, "bedrooms": 2, "bathrooms": 1]]
    ], allowSystemModel: false)
    XCTAssertTrue(scan.analysis.options.isEmpty)
  }

  func testPartialBuildingOptionsStillRequestResolution() async {
    let evidence = "Available units\nAll (10)\n1A\n2 beds, 1 bath\n850\nNow\n$3000"
    let message: [String: Any] = ["listingScope": "building", "address": "123 Main Street", "availabilityPageEvidence": evidence]
    let analysis = await HomeboardListingIntelligence.analyze(message: message, allowSystemModel: false)
    XCTAssertEqual(analysis.options.count, 1)
    let plan = HomeboardListingIntelligence.systemModelResolutionPlan(message: message, facts: analysis.facts, options: analysis.options)
    XCTAssertTrue(plan.fields.contains("options"))
  }

  func testSafariGesturePracticeRequiresLeftRightThenDown() {
    var step = SafariGesturePracticeStep.swipeLeft
    step.record(.down)
    step.record(.right)
    XCTAssertEqual(step, .swipeLeft)
    step.record(.left)
    XCTAssertEqual(step, .swipeRight)
    step.record(.down)
    XCTAssertEqual(step, .swipeRight)
    step.record(.right)
    XCTAssertEqual(step, .swipeDown)
    step.record(.left)
    XCTAssertEqual(step, .swipeDown)
    step.record(.down)
    XCTAssertEqual(step, .complete)
  }

  func testListingIntelligenceParsesZillowStyleAvailabilityRows() async {
    let evidence = """
      Unit
      Sqft
      Avail.
      Base rent
      1923
      Studio, 1 ba
      392
      Oct 13
      $2,232
      807
      Studio, 1 ba
      422
      Aug 11
      $2,403
      607
      Studio, 1 ba
      422
      Now
      $2,403
      1806
      Studio, 1 ba
      437
      Now
      $2,488
      506
      Studio, 1 ba
      437
      Aug 25
      $2,488
      """
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "building",
      "address": "Example apartment building",
      "pageEvidence": evidence
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.scope, "building")
    XCTAssertEqual(analysis.options.map(\.unit), ["1923", "807", "607", "1806", "506"])
    XCTAssertEqual(analysis.options[0].bedrooms, 0)
    XCTAssertEqual(analysis.options[0].bathrooms, 1)
    XCTAssertEqual(analysis.options[0].squareFeet, 392)
    XCTAssertEqual(analysis.options[0].availableDate, "Oct 13")
    XCTAssertEqual(analysis.options[0].price, 2_232)
    XCTAssertEqual(analysis.options[2].availableDate, "Now")
    XCTAssertEqual(analysis.options[4].price, 2_488)
  }

  func testBuildingAddressIsSharedWithoutBorrowingFactsAcrossUnitRows() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "building",
      "pageTitle": "The Junction Apartments",
      "sharedPageEvidence": """
        The Junction Apartments
        300 Main Street, Jersey City, NJ 07302
        """,
      "pageEvidence": """
        Unit
        Sqft
        Avail.
        Base rent
        1A
        Studio, 1 ba
        405
        Now
        2B
        1 bed, 1 ba
        710
        Aug 15
        $2,650
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.scope, "building")
    XCTAssertEqual(analysis.facts.address, "300 Main Street, Jersey City, NJ 07302")
    XCTAssertNil(analysis.facts.unit)
    XCTAssertNil(analysis.facts.price)
    XCTAssertNil(analysis.facts.bedrooms)
    XCTAssertEqual(analysis.options.count, 1)
    XCTAssertEqual(analysis.options[0].unit, "2B")
    XCTAssertEqual(analysis.options[0].price, 2_650)
    XCTAssertEqual(analysis.options[0].squareFeet, 710)
    XCTAssertEqual(analysis.options[0].availableDate, "Aug 15")
  }

  func testAddressRankingPrefersStructuredListingAddressOverNearbyHomes() {
    let address = HomeboardListingIntelligence.bestStreetAddress(from: [
      HomeboardAddressEvidence(
        text: "Similar homes near 88 Wrong Street, Brooklyn, NY 11201",
        source: "addressNode"
      ),
      HomeboardAddressEvidence(
        text: "300 Main Street, Jersey City, NJ 07302",
        source: "jsonld"
      ),
      HomeboardAddressEvidence(
        text: "The Junction | 300 Main Street, Jersey City, NJ 07302",
        source: "title"
      )
    ])

    XCTAssertEqual(address, "300 Main Street, Jersey City, NJ 07302")
  }

  func testAddressRankingUsesAgreementAndKeepsBuildingUnitSeparate() {
    let address = HomeboardListingIntelligence.bestStreetAddress(from: [
      HomeboardAddressEvidence(
        text: "219 Kent Avenue Apt 5C",
        source: "h1"
      ),
      HomeboardAddressEvidence(
        text: "219 Kent Avenue, Brooklyn, NY 11249",
        source: "itemprop"
      ),
      HomeboardAddressEvidence(
        text: "219-Kent-Avenue-5C-Brooklyn-NY-11249",
        source: "canonical"
      )
    ])

    XCTAssertEqual(address, "219 Kent Avenue, Brooklyn, NY 11249")
  }

  func testAddressRankingJoinsStreetAndLocalityAcrossLines() {
    let address = HomeboardListingIntelligence.bestStreetAddress(from: [
      HomeboardAddressEvidence(
        text: """
          625 West 57th Street
          New York, NY 10019
          """,
        source: "addressNode"
      )
    ])

    XCTAssertEqual(address, "625 West 57th Street, New York, NY 10019")
  }

  func testFullAddressEnrichesHigherConfidenceStreetOnlyEvidence() {
    let address = HomeboardListingIntelligence.bestStreetAddress(from: [
      HomeboardAddressEvidence(
        text: "625 West 57th Street",
        source: "itemprop"
      ),
      HomeboardAddressEvidence(
        text: "Rent at 625 West 57th Street, New York, NY 10019",
        source: "title"
      )
    ])

    XCTAssertEqual(address, "625 West 57th Street, New York, NY 10019")
  }

  func testSupportingRecommendationCannotReplacePrimaryListingPrice() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryPageEvidence": """
        625 West 57th Street, New York, NY 10019
        $4,800 per month · 2 beds · 2 baths
        """,
      "pageEvidence": """
        [PRIMARY]
        625 West 57th Street, New York, NY 10019
        $4,800 per month · 2 beds · 2 baths

        [SUPPORTING]
        Similar homes
        88 Wrong Street
        $2,200 per month · Studio · 1 bath
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.price, 4_800)
    XCTAssertEqual(analysis.facts.bedrooms, 2)
    XCTAssertEqual(analysis.facts.bathrooms, 2)
    XCTAssertEqual(
      analysis.facts.address,
      "625 West 57th Street, New York, NY 10019"
    )
  }

  func testSupportingRecommendationCannotSupplyMissingMainRent() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryPageEvidence": "625 West 57th Street, New York, NY 10019",
      "pageEvidence": """
        [SUPPORTING]
        Similar homes
        $2,200 per month · Studio · 1 bath
        """
    ], allowSystemModel: false)

    XCTAssertNil(analysis.facts.price)
    XCTAssertNil(analysis.facts.bedrooms)
    XCTAssertNil(analysis.facts.bathrooms)
  }

  func testTrustedPageFactsSupplyRentAndBathroomsBelowFirstViewport() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryPageEvidence": """
        625 West 57th Street, New York, NY 10019
        """,
      "bedrooms": 2,
      "primaryFactEvidence": """
        Monthly rent $4,800
        Bathrooms: 1.5
        """,
      "semanticPageEvidence": """
        Similar homes
        $2,200 per month
        Studio, 1 bath
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.price, 4_800)
    XCTAssertEqual(analysis.facts.bathrooms, 1.5)
    XCTAssertEqual(analysis.facts.bedrooms, 2)
  }

  func testTrustedBaseRentWithoutDollarSignIsRecognized() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryFactEvidence": """
        Base rent: 2650
        2 bathrooms
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.price, 2_650)
    XCTAssertEqual(analysis.facts.bathrooms, 2)
  }

  func testBedroomAndBathroomAbbreviationsAreRecognized() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryFactEvidence": """
        $3,950 per month
        2 bd · 1.5 ba
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.price, 3_950)
    XCTAssertEqual(analysis.facts.bedrooms, 2)
    XCTAssertEqual(analysis.facts.bathrooms, 1.5)
  }

  func testBedroomAbbreviationCanBeReadWithoutAdjacentBathroom() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "primaryFactEvidence": """
        Bedrooms: 3
        3 bd
        """
    ], allowSystemModel: false)

    XCTAssertEqual(analysis.facts.bedrooms, 3)
  }

  func testSelectiveSystemModelTargetsInsightsForCompleteListing() {
    let facts = HomeboardListingFacts(
      address: "625 West 57th Street, New York, NY 10019",
      unit: "4B",
      city: "New York",
      neighborhood: "Hell's Kitchen",
      price: 4_800,
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 900,
      imageURL: nil,
      summary: nil,
      amenities: []
    )
    let plan = HomeboardListingIntelligence.systemModelResolutionPlan(
      message: [
        "listingScope": "unit",
        "primaryPageEvidence": """
          625 West 57th Street, New York, NY 10019
          Unit 4B · $4,800 per month · 2 bd · 2 ba
          """
      ],
      facts: facts,
      options: []
    )

    XCTAssertTrue(plan.shouldRun)
    XCTAssertEqual(plan.fields, ["insights"])
  }

  func testSelectiveSystemModelTargetsMissingAndConflictingFields() {
    let facts = HomeboardListingFacts(
      address: "625 West 57th Street, New York, NY 10019",
      unit: "4B",
      city: "New York",
      neighborhood: nil,
      price: 4_800,
      bedrooms: 2,
      bathrooms: nil,
      squareFeet: nil,
      imageURL: nil,
      summary: nil,
      amenities: []
    )
    let plan = HomeboardListingIntelligence.systemModelResolutionPlan(
      message: [
        "listingScope": "unit",
        "primaryPageEvidence": """
          625 West 57th Street, New York, NY 10019
          Unit 4B · $4,800 per month · 2 bd
          Rent: $5,100 · 3 bd · 1.5 ba
          """
      ],
      facts: facts,
      options: []
    )

    XCTAssertTrue(plan.shouldRun)
    XCTAssertTrue(plan.fields.contains("price"))
    XCTAssertTrue(plan.fields.contains("bedrooms"))
    XCTAssertTrue(plan.fields.contains("bathrooms"))
  }

  func testResolvedBuildingOptionsDoNotTriggerCoreFieldModelPass() {
    let facts = HomeboardListingFacts(
      address: "219 Kent Avenue, Brooklyn, NY 11249",
      unit: nil,
      city: "Brooklyn",
      neighborhood: nil,
      price: nil,
      bedrooms: nil,
      bathrooms: nil,
      squareFeet: nil,
      imageURL: nil,
      summary: nil,
      amenities: []
    )
    let option = HomeboardUnitOption(
      id: "3B",
      label: "Unit 3B",
      unit: "3B",
      price: 4_800,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1_100,
      availableDate: nil,
      evidenceSummary: nil
    )
    let plan = HomeboardListingIntelligence.systemModelResolutionPlan(
      message: [
        "listingScope": "building",
        "primaryPageEvidence": "Unit 3B · $4,800 · 3 bd · 2 ba"
      ],
      facts: facts,
      options: [option]
    )

    XCTAssertEqual(plan.fields, ["insights"])
  }

  func testAddressComponentsCompleteAStreetOnlyCapture() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "address": "625 West 57th Street",
      "city": "New York",
      "region": "NY",
      "postalCode": "10019"
    ], allowSystemModel: false)

    XCTAssertEqual(
      analysis.facts.address,
      "625 West 57th Street, New York, NY 10019"
    )
  }

  func testAddressCompositionAddsPostalCodeToCityAndStateAddress() {
    XCTAssertEqual(
      HomeboardListingIntelligence.composedAddress(
        "625 West 57th Street, New York, NY",
        city: "New York",
        region: "NY",
        postalCode: "10019"
      ),
      "625 West 57th Street, New York, NY 10019"
    )
  }

  func testListingIntelligenceRejectsOptionMissingFromEvidence() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "building",
      "address": "219 Kent Avenue",
      "pageEvidence": "Unit 2A · $4,800 · 2 beds · 2 baths",
      "unitOptions": [
        [
          "id": "9Z",
          "label": "Unit 9Z",
          "unit": "9Z",
          "price": 9_999,
          "bedrooms": 4,
          "bathrooms": 4
        ]
      ]
    ], allowSystemModel: false)

    XCTAssertTrue(analysis.options.isEmpty)
  }

  func testListingIntelligenceAsksForOnlyUnresolvedFacts() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "unit",
      "address": "123 Main Street",
      "unit": "4B",
      "pageEvidence": "123 Main Street Unit 4B"
    ], allowSystemModel: false)

    XCTAssertEqual(
      analysis.message,
      "We weren’t able to figure this listing out. Would you mind filling in a few blanks?"
    )
    XCTAssertEqual(
      Set(analysis.missingFields),
      Set(["monthly rent", "bedrooms", "bathrooms"])
    )
  }

  func testListingIntelligenceAllowsMissingUnitAndFindsPositiveAmenities() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "listingScope": "unit",
      "address": "123 Main Street",
      "price": 3_200,
      "bedrooms": 2,
      "bathrooms": 1,
      "pageEvidence": """
        123 Main Street
        $3,200 per month · 2 beds · 1 bath
        Pet friendly with free laundry and a dishwasher.
        """
    ], allowSystemModel: false)

    XCTAssertTrue(analysis.missingFields.isEmpty)
    XCTAssertNil(analysis.facts.unit)
    XCTAssertEqual(
      Set(analysis.facts.amenities),
      Set(["pet friendly", "free laundry", "dishwasher"])
    )
  }

  func testListingIntelligenceDoesNotPromoteNegatedAmenities() async {
    let analysis = await HomeboardListingIntelligence.analyze(message: [
      "pageEvidence": "No pets allowed. No dishwasher. Paid laundry is available."
    ], allowSystemModel: false)

    XCTAssertFalse(analysis.facts.amenities.contains("pet friendly"))
    XCTAssertFalse(analysis.facts.amenities.contains("dishwasher"))
    XCTAssertFalse(analysis.facts.amenities.contains("free laundry"))
  }

  func testMissingCoreFieldsTriggerOneSecondaryScan() async {
    let result = await HomeboardListingIntelligence.analyzeWithOneRescan(
      message: [
        "address": "219 Kent Avenue",
        "city": "Brooklyn",
        "region": "NY",
        "postalCode": "11249",
        "secondaryPageEvidence": "$4,800 per month · 3 bd · 2 ba"
      ],
      allowSystemModel: false
    )

    XCTAssertTrue(result.performedRescan)
    XCTAssertEqual(
      Set(result.initialMissingFields),
      Set(["monthly rent", "bedrooms", "bathrooms"])
    )
    XCTAssertTrue(result.analysis.missingFields.isEmpty)
    XCTAssertEqual(result.analysis.facts.price, 4_800)
    XCTAssertEqual(result.analysis.facts.bedrooms, 3)
    XCTAssertEqual(result.analysis.facts.bathrooms, 2)
  }

  func testSecondaryScanReportsFieldsThatRemainMissing() async {
    let result = await HomeboardListingIntelligence.analyzeWithOneRescan(
      message: [
        "address": "219 Kent Avenue",
        "price": 4_800,
        "bedrooms": 3,
        "secondaryPageEvidence": "Monthly rent $4,800. Three bedrooms."
      ],
      allowSystemModel: false
    )

    XCTAssertTrue(result.performedRescan)
    XCTAssertEqual(result.initialMissingFields, ["bathrooms"])
    XCTAssertEqual(result.analysis.missingFields, ["bathrooms"])
    XCTAssertEqual(
      result.analysis.message,
      "Homeboard took a second look. Still missing: bathrooms."
    )
  }

  func testCompleteFirstScanSkipsSecondaryScan() async {
    let result = await HomeboardListingIntelligence.analyzeWithOneRescan(
      message: [
        "address": "219 Kent Avenue",
        "price": 4_800,
        "bedrooms": 3,
        "bathrooms": 2,
        "secondaryPageEvidence": "This should not be needed."
      ],
      allowSystemModel: false
    )

    XCTAssertFalse(result.performedRescan)
    XCTAssertTrue(result.initialMissingFields.isEmpty)
    XCTAssertTrue(result.analysis.missingFields.isEmpty)
  }

  func testShareTriggeredImportWaitsForReviewEvenWhenFactsAreComplete() {
    let pending = HomeboardSharedImportStore.PendingImport(
      url: "https://example.com/listing/3b",
      address: "219 Kent Avenue, Brooklyn, NY 11249",
      price: 4_800,
      bedrooms: 3,
      bathrooms: 2,
      extractionConfidence: "needs-review"
    )

    XCTAssertTrue(pending.requiresReview)
  }

  @MainActor
  func testRemoveListingUsesServerBoardWhenLocalOverlayIsEmpty() {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }

    let listing = ListingPreview(
      id: "board-listing-1",
      listingId: "listing-1",
      title: "625 West 57th Street",
      location: "New York, NY 10019",
      priceLine: "$4,800",
      commuteLine: "Compare routes",
      summary: "Sample",
      fitLabel: "Shortlisted",
      highlights: [],
      openRisks: []
    )
    let model = AppModel()
    model.authSession = nil
    model.board = .empty
    model.board.id = "board-removal-test"
    model.board.shortlist = [listing]
    model.localShortlistsByBoard["board-removal-test"] = []

    model.removeManualListing(id: listing.id)

    XCTAssertTrue(model.board.shortlist.isEmpty)
    XCTAssertEqual(model.boardFeedback, "Listing moved to Recently Deleted.")
    XCTAssertNil(model.boardError)
  }

  @MainActor
  func testLocalListingInsertionAndDeletionSurviveRelaunch() {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }

    let model = AppModel()
    model.authSession = nil
    model.board = .empty
    model.board.id = "local-persistence-test"
    model.addManualListing(
      title: "1 Meadowlands Parkway, Secaucus, NJ 07094",
      location: "Secaucus, NJ 07094",
      priceLine: "$2,750 / month",
      commuteLine: "Compare routes",
      summary: "Saved from Safari",
      fitLabel: "New",
      sourceURL: "https://www.zillow.com/example",
      unit: "4B",
      bedrooms: "2",
      bathrooms: "2"
    )

    let restoredAfterInsert = AppModel()
    XCTAssertEqual(restoredAfterInsert.board.shortlist.count, 1)
    XCTAssertEqual(restoredAfterInsert.board.shortlist.first?.unit, "4B")

    model.addManualListing(
      title: "1 Meadowlands Parkway, Secaucus, NJ 07094",
      location: "Secaucus, NJ 07094",
      priceLine: "$2,750 / month",
      commuteLine: "Compare routes",
      summary: "Duplicate",
      fitLabel: "New",
      sourceURL: "https://www.zillow.com/example",
      unit: "4B",
      bedrooms: "2",
      bathrooms: "2"
    )
    XCTAssertEqual(model.board.shortlist.count, 1)

    let listingID = try? XCTUnwrap(model.board.shortlist.first?.id)
    if let listingID { model.removeManualListing(id: listingID) }
    let restoredAfterDelete = AppModel()
    XCTAssertTrue(restoredAfterDelete.board.shortlist.isEmpty)
  }

  @MainActor
  func testAppModelInitWithExistingLocalBoardsDoesNotTriggerExclusivityViolation() {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }

    let model = AppModel()
    var sampleBoard = MobileBoard.empty
    sampleBoard.id = "local-exclusivity-test"
    sampleBoard.recentlyDeleted = [
      ListingPreview(
        id: "del-1",
        title: "Deleted Listing",
        location: "NYC",
        priceLine: "$2,000",
        commuteLine: "15 min",
        summary: "test",
        fitLabel: "test",
        highlights: [],
        openRisks: [],
        deletedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-10 * 24 * 60 * 60))
      )
    ]
    model.localBoardsById["local-exclusivity-test"] = sampleBoard
    model.persist()

    let reinitialized = AppModel()
    XCTAssertNotNil(reinitialized.localBoardsById["local-exclusivity-test"])
    XCTAssertTrue(reinitialized.localBoardsById["local-exclusivity-test"]?.recentlyDeleted?.isEmpty ?? false)
  }

  private func isolateAppModelPersistence() -> [(key: String, data: Data?)] {
    let defaults = UserDefaults.standard
    let previousState = appModelPersistenceKeys.map { key in
      (key: key, data: defaults.data(forKey: key))
    }
    appModelPersistenceKeys.forEach(defaults.removeObject(forKey:))
    return previousState
  }

  private func restoreAppModelPersistence(_ previousState: [(key: String, data: Data?)]) {
    let defaults = UserDefaults.standard
    for record in previousState {
      if let data = record.data {
        defaults.set(data, forKey: record.key)
      } else {
        defaults.removeObject(forKey: record.key)
      }
    }
  }

  func testSharedListingActiveOfferDetectionAndScaling() {
    // 1 month free
    let offer1 = SharedListingActiveOffer.detect(
      highlights: ["1 month free on 12-month lease"],
      summary: "",
      fitLabel: "",
      priceLine: "$3,000",
      amenities: [],
      title: "Nice apartment"
    )
    XCTAssertNotNil(offer1)
    XCTAssertEqual(offer1?.bonusPoints, 10)
    XCTAssertEqual(offer1?.title, "1 Month Free Special")
    XCTAssertEqual(offer1?.badgeLabel, "1 Mo Free")

    // 2 months free
    let offer2 = SharedListingActiveOffer.detect(
      highlights: [],
      summary: "Move in now and receive 2 months free concession",
      fitLabel: "",
      priceLine: "$4,000",
      amenities: [],
      title: "Modern 2BR"
    )
    XCTAssertNotNil(offer2)
    XCTAssertEqual(offer2?.bonusPoints, 18)
    XCTAssertEqual(offer2?.title, "2 Months Free Special")

    // No broker fee
    let offerNoFee = SharedListingActiveOffer.detect(
      highlights: [],
      summary: "",
      fitLabel: "",
      priceLine: "$2,800",
      amenities: ["No broker fee", "Elevator"],
      title: "Spacious studio"
    )
    XCTAssertNotNil(offerNoFee)
    XCTAssertEqual(offerNoFee?.bonusPoints, 8)
    XCTAssertEqual(offerNoFee?.title, "No Broker Fee")

    // Cash credit $1500
    let offerCredit = SharedListingActiveOffer.detect(
      highlights: ["$1,500 move-in bonus for immediate move-ins"],
      summary: "",
      fitLabel: "",
      priceLine: "$3,500",
      amenities: [],
      title: "Luxury unit"
    )
    XCTAssertNotNil(offerCredit)
    XCTAssertEqual(offerCredit?.bonusPoints, 8)

    // Waived deposit
    let offerDeposit = SharedListingActiveOffer.detect(
      highlights: [],
      summary: "Zero deposit required on approved credit",
      fitLabel: "",
      priceLine: "$2,500",
      amenities: [],
      title: "Cozy 1BR"
    )
    XCTAssertNotNil(offerDeposit)
    XCTAssertEqual(offerDeposit?.bonusPoints, 5)

    // Stacking: 1 month free + no broker fee -> 10 + 8 = 18 pts
    let offerStacked = SharedListingActiveOffer.detect(
      highlights: ["1 month free", "No fee"],
      summary: "",
      fitLabel: "",
      priceLine: "$3,200",
      amenities: [],
      title: "Great deal"
    )
    XCTAssertNotNil(offerStacked)
    XCTAssertEqual(offerStacked?.bonusPoints, 18)
    XCTAssertEqual(offerStacked?.title, "1 Month Free + No Broker Fee")

    // Cap at 25 points maximum
    let offerCapped = SharedListingActiveOffer.detect(
      highlights: ["3 months free", "No broker fee", "$2,000 move-in credit"],
      summary: "",
      fitLabel: "",
      priceLine: "$5,000",
      amenities: [],
      title: "Penthouse"
    )
    XCTAssertNotNil(offerCapped)
    XCTAssertEqual(offerCapped?.bonusPoints, 25)
  }

  func testSharedComparisonMathOfferBonusAndPriceAdjustment() {
    let offer = SharedListingActiveOffer(kinds: [.monthsFree(count: 1.0)], rawEvidence: "1 month free")
    let bonus = SharedComparisonMath.offerBonusPoints(for: offer)
    XCTAssertEqual(bonus, 10)

    // Base score 75 boosted by 10 points -> 85
    let adjusted = SharedComparisonMath.adjustedPriceScore(baseScore: 75, bonusPoints: bonus)
    XCTAssertEqual(adjusted, 85)

    // Score clamped at 100
    let clamped = SharedComparisonMath.adjustedPriceScore(baseScore: 96, bonusPoints: bonus)
    XCTAssertEqual(clamped, 100)
  }

  func testListingPreviewActiveOfferIntegration() {
    let listing = ListingPreview(
      id: "test-offer",
      title: "Offer listing",
      location: "New York",
      priceLine: "$3,000",
      commuteLine: "20 min",
      summary: "Sample summary",
      fitLabel: "Great fit",
      highlights: ["1 month free on 12-month lease"],
      openRisks: []
    )
    XCTAssertNotNil(listing.activeOffer)
    XCTAssertEqual(listing.activeOffer?.bonusPoints, 10)
    XCTAssertEqual(listing.activeOffer?.badgeLabel, "1 Mo Free")
  }

  func testAdvisorWalletFailureIsNotPresentedAsInactiveAndRetryCanRecover() async {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }
    AdvisorWalletURLProtocol.response = { _ in
      .init(status: 503, body: #"{"error":"Temporarily unavailable"}"#)
    }
    let model = makeWalletTestModel(userID: "wallet-user", boardID: "wallet-board")

    await model.refreshAdvisorWalletStatus()

    XCTAssertEqual(model.advisorWalletLoadState, .failed)
    XCTAssertNil(model.advisorWalletStatus)
    XCTAssertFalse(model.isAdvisorAccessActive)
    XCTAssertNotNil(model.advisorWalletError)

    AdvisorWalletURLProtocol.response = { _ in
      .init(status: 200, body: Self.walletJSON(active: true, testMode: true))
    }
    await model.refreshAdvisorWalletStatus()

    XCTAssertEqual(model.advisorWalletLoadState, .active)
    XCTAssertNil(model.advisorWalletError)
    XCTAssertTrue(model.isAdvisorAccessActive)
  }

  func testAdvisorWalletTrueInactiveResponseRemainsInactive() async {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }
    AdvisorWalletURLProtocol.response = { _ in
      .init(status: 200, body: Self.walletJSON(active: false, testMode: false))
    }
    let model = makeWalletTestModel(userID: "wallet-user", boardID: "wallet-board")

    await model.refreshAdvisorWalletStatus()

    XCTAssertEqual(model.advisorWalletLoadState, .inactive)
    XCTAssertEqual(model.advisorWalletStatus?.subscription.active, false)
    XCTAssertFalse(model.isAdvisorAccessActive)
    XCTAssertNil(model.advisorWalletError)
  }

  func testAdvisorWalletIgnoresResponseAfterBoardSwitch() async {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }
    AdvisorWalletURLProtocol.response = { request in
      if request.url?.path.contains("board-a") == true {
        return .init(status: 200, body: Self.walletJSON(active: true, testMode: true), delay: 0.2)
      }
      return .init(status: 200, body: Self.walletJSON(active: false, testMode: false))
    }
    let model = makeWalletTestModel(userID: "wallet-user", boardID: "board-a")
    let firstRequest = Task { await model.refreshAdvisorWalletStatus() }
    try? await Task.sleep(nanoseconds: 30_000_000)
    model.board.id = "board-b"

    await model.refreshAdvisorWalletStatus()
    await firstRequest.value

    XCTAssertEqual(model.board.id, "board-b")
    XCTAssertEqual(model.advisorWalletLoadState, .inactive)
    XCTAssertEqual(model.advisorWalletStatus?.testMode, false)
  }

  func testAdvisorWalletIgnoresResponseAfterSessionSwitch() async {
    let previousState = isolateAppModelPersistence()
    defer { restoreAppModelPersistence(previousState) }
    AdvisorWalletURLProtocol.response = { request in
      let token = request.value(forHTTPHeaderField: "Authorization") ?? ""
      if token.contains("token-a") {
        return .init(status: 200, body: Self.walletJSON(active: true, testMode: true), delay: 0.2)
      }
      return .init(status: 200, body: Self.walletJSON(active: false, testMode: false))
    }
    let model = makeWalletTestModel(userID: "user-a", boardID: "wallet-board", token: "token-a")
    let firstRequest = Task { await model.refreshAdvisorWalletStatus() }
    try? await Task.sleep(nanoseconds: 30_000_000)
    model.authSession = NativeAuthSession(
      accessToken: "token-b",
      refreshToken: "refresh-b",
      userId: "user-b",
      email: "user-b@example.com",
      displayName: "User B"
    )

    await model.refreshAdvisorWalletStatus()
    await firstRequest.value

    XCTAssertEqual(model.authSession?.userId, "user-b")
    XCTAssertEqual(model.advisorWalletLoadState, .inactive)
    XCTAssertEqual(model.advisorWalletStatus?.testMode, false)
  }

  private func makeWalletTestModel(
    userID: String,
    boardID: String,
    token: String = "wallet-token"
  ) -> AppModel {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [AdvisorWalletURLProtocol.self]
    let model = AppModel(
      api: HomeboardAPI(session: URLSession(configuration: configuration)),
      advisorEnabled: true
    )
    model.authSession = NativeAuthSession(
      accessToken: token,
      refreshToken: "wallet-refresh",
      userId: userID,
      email: "\(userID)@example.com",
      displayName: "Wallet User"
    )
    model.board = .empty
    model.board.id = boardID
    return model
  }

  private static func walletJSON(active: Bool, testMode: Bool) -> String {
    """
    {
      "rolling7DayTotalCents": 0,
      "thresholdCents": 400,
      "remainingCents": 400,
      "windowStartedAt": "2026-10-01T00:00:00.000Z",
      "subscription": { "active": \(active), "validUntil": null },
      "testMode": \(testMode)
    }
    """
  }

  func testBuiltShareExtensionActivationRulesMatchURLAndPlainTextContract() throws {
    let rules = try builtExtensionActivationRules()
    XCTAssertEqual(Set(rules.values).count, 1)

    // Safari listing page shares contain public.url.
    let urlItem = NSExtensionItem()
    urlItem.attachments = [
      NSItemProvider(item: NSURL(string: "https://www.zillow.com/homedetails/123_zpid/")!, typeIdentifier: "public.url")
    ]

    // Notes text shares contain public.plain-text whether or not they include a URL.
    let textItem = NSExtensionItem()
    textItem.attachments = [
      NSItemProvider(item: "Check this out: https://www.zillow.com/homedetails/123" as NSString, typeIdentifier: "public.plain-text")
    ]

    let urlFreeTextItem = NSExtensionItem()
    urlFreeTextItem.attachments = [
      NSItemProvider(item: "A listing to look up later" as NSString, typeIdentifier: "public.plain-text")
    ]

    // UTF-8 plain text also conforms to public.plain-text
    let utf8TextItem = NSExtensionItem()
    utf8TextItem.attachments = [
      NSItemProvider(item: "Check this out: https://www.zillow.com/homedetails/123" as NSString, typeIdentifier: "public.utf8-plain-text")
    ]

    // Photos share alone contains public.jpeg or public.image, but no URL or plain text.
    let photoItem = NSExtensionItem()
    photoItem.attachments = [
      NSItemProvider(item: NSData(), typeIdentifier: "public.jpeg")
    ]

    let genericImageItem = NSExtensionItem()
    genericImageItem.attachments = [
      NSItemProvider(item: NSData(), typeIdentifier: "public.image")
    ]

    // Other media has no URL or plain-text attachment.
    let movieItem = NSExtensionItem()
    movieItem.attachments = [
      NSItemProvider(item: NSData(), typeIdentifier: "public.movie")
    ]

    let emptyAttachmentsItem = NSExtensionItem()
    emptyAttachmentsItem.attachments = []

    for (extensionName, rule) in rules {
      XCTAssertTrue(rule.contains("SUBQUERY"), extensionName)
      XCTAssertTrue(rule.contains("public.url"), extensionName)
      XCTAssertTrue(rule.contains("public.plain-text"), extensionName)
      XCTAssertFalse(rule.contains(["TRUE", "PREDICATE"].joined()), extensionName)

      let predicate = NSPredicate(format: rule)
      XCTAssertTrue(predicate.evaluate(with: ["extensionItems": [urlItem]]), extensionName)
      XCTAssertTrue(predicate.evaluate(with: ["extensionItems": [textItem]]), extensionName)
      XCTAssertTrue(predicate.evaluate(with: ["extensionItems": [urlFreeTextItem]]), extensionName)
      XCTAssertTrue(predicate.evaluate(with: ["extensionItems": [utf8TextItem]]), extensionName)
      XCTAssertFalse(predicate.evaluate(with: ["extensionItems": [photoItem]]), extensionName)
      XCTAssertFalse(predicate.evaluate(with: ["extensionItems": [genericImageItem]]), extensionName)
      XCTAssertFalse(predicate.evaluate(with: ["extensionItems": [movieItem]]), extensionName)
      XCTAssertFalse(predicate.evaluate(with: ["extensionItems": []]), extensionName)
      XCTAssertFalse(predicate.evaluate(with: ["extensionItems": [emptyAttachmentsItem]]), extensionName)
    }
  }

  private func builtExtensionActivationRules() throws -> [String: String] {
    var candidateURL = Bundle(for: type(of: self)).bundleURL
    var hostAppURL: URL?

    while candidateURL.path != "/" {
      if candidateURL.pathExtension == "app" {
        hostAppURL = candidateURL
        break
      }
      candidateURL.deleteLastPathComponent()
    }

    let appURL = try XCTUnwrap(hostAppURL, "Could not locate the built HomeboardNative.app from the test bundle")
    let plugInsURL = appURL.appendingPathComponent("PlugIns", isDirectory: true)
    let extensionNames = ["HomeboardShareExtension", "HomeboardActionExtension"]

    return try Dictionary(uniqueKeysWithValues: extensionNames.map { extensionName in
      let bundleURL = plugInsURL.appendingPathComponent("\(extensionName).appex", isDirectory: true)
      let bundle = try XCTUnwrap(Bundle(url: bundleURL), "Missing built \(extensionName).appex")
      let extensionDictionary = try XCTUnwrap(bundle.infoDictionary?["NSExtension"] as? [String: Any])
      let attributes = try XCTUnwrap(extensionDictionary["NSExtensionAttributes"] as? [String: Any])
      let rule = try XCTUnwrap(attributes["NSExtensionActivationRule"] as? String)
      return (extensionName, rule)
    })
  }

}

private final class AdvisorWalletURLProtocol: URLProtocol {
  struct Stub {
    var status: Int
    var body: String
    var delay: TimeInterval = 0
  }

  static var response: (URLRequest) -> Stub = { _ in
    Stub(status: 500, body: #"{"error":"Missing test stub"}"#)
  }

  static func bodyData(for request: URLRequest) -> Data {
    if let body = request.httpBody { return body }
    guard let stream = request.httpBodyStream else { return Data() }
    stream.open()
    defer { stream.close() }
    var result = Data()
    var buffer = [UInt8](repeating: 0, count: 4_096)
    while true {
      let count = stream.read(&buffer, maxLength: buffer.count)
      guard count > 0 else { break }
      result.append(buffer, count: count)
    }
    return result
  }

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    let stub = Self.response(request)
    let complete = { [weak self] in
      guard let self, let url = request.url else { return }
      let response = HTTPURLResponse(
        url: url,
        statusCode: stub.status,
        httpVersion: "HTTP/1.1",
        headerFields: ["Content-Type": "application/json"]
      )!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: Data(stub.body.utf8))
      client?.urlProtocolDidFinishLoading(self)
    }
    if stub.delay > 0 {
      DispatchQueue.global().asyncAfter(deadline: .now() + stub.delay, execute: complete)
    } else {
      complete()
    }
  }

  override func stopLoading() {}
}
