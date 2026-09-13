import Foundation
import Observation
import Security

private func normalizedInviteToken(from rawValue: String) -> String {
  let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
  let candidate: String

  if trimmed.contains("/"), let lastComponent = trimmed.split(separator: "/").last {
    candidate = String(lastComponent).split(separator: "?").first.map(String.init) ?? String(lastComponent)
  } else {
    candidate = trimmed
  }

  let normalized = candidate
    .uppercased()
    .filter { $0.isLetter || $0.isNumber }
  return String(normalized.prefix(128))
}

@Observable
@MainActor
final class AppModel {
  enum Screen: String, Codable {
    case welcome
    case auth
    case onboarding
    case board
  }

  enum AuthMode: String, Codable {
    case createAccount
    case signIn
  }

  enum BoardTab: String, Codable {
    case board
    case shortlist
    case compare
    case updates
    case members
    case setup
  }

  private struct VersionedPersistenceRecord<Payload: Codable>: Codable {
    var schemaVersion: Int
    var payload: Payload
  }

  private struct AccountSessionPersistence: Codable {
    var currentScreen: Screen
    var authMode: AuthMode
    var boardTab: BoardTab?
    var account: LocalAccount?
    var authenticatedAuthUserID: String?
    var membershipState: MobileMembershipState?
    var availableBoards: [MobileBoardSummary]
    var pendingConfirmationEmail: String?
  }

  private struct ProfilePersistence: Codable {
    var profile: RentalProfile
    var localProfilesByBoard: [String: RentalProfile]
  }

  private struct BoardsListingsPersistence: Codable {
    var board: MobileBoard
    var localShortlistsByBoard: [String: [ListingPreview]]
    var localQuestionsByBoard: [String: [String]]
    var localActivityByBoard: [String: [String]]
    var localMembersByBoard: [String: [MemberPreferenceCard]]
    var localChatMessagesByBoard: [String: [BoardMessage]]?
    var localBoardsById: [String: MobileBoard]
    var listingInventory: [ListingPreview]?
    var listingInventoryNextCursor: String?
    var listingInventoryHasMore: Bool?
    var advisorHistoryByListingID: [String: [ListingChangeEntry]]?
    var advisorChecklistByListingID: [String: [ApplicationChecklistEntry]]?
    var advisorInquiriesByListingID: [String: [ListingInquiry]]?
    var advisorTourNotesByListingID: [String: TourNoteSummary]?
  }

  private struct OnboardingPersistence: Codable {
    var onboardingCreationRequestId: String?
    var onboardingMessages: [OnboardingChatMessage]
  }

  private struct PendingOperationsPersistence: Codable {
    var pendingListingCreatesByBoard: [String: [ListingPreview]]?
    var pendingLocalListingRemovalIDs: Set<String>?
    var pendingServerListingRemovalIDsByBoard: [String: Set<String>]?
    var serverListingIDByLocalID: [String: String]?
    var removedServerListingIDsByBoard: [String: Set<String>]?
    var removedListingIdentityKeysByBoard: [String: Set<String>]?
  }

  /// Decoder for the single pre-v1 snapshot. It is retained only to migrate
  /// existing installs into the independent records above.
  private struct LegacyPersistedState: Codable {
    var currentScreen: Screen
    var authMode: AuthMode
    var boardTab: BoardTab?
    var board: MobileBoard
    var account: LocalAccount?
    var authenticatedAuthUserID: String?
    var availableBoards: [MobileBoardSummary]
    var pendingInviteCode: String
    var pendingConfirmationEmail: String?
    var onboardingCreationRequestId: String?
    var profile: RentalProfile
    var onboardingMessages: [OnboardingChatMessage]
    var localShortlistsByBoard: [String: [ListingPreview]]
    var localQuestionsByBoard: [String: [String]]
    var localActivityByBoard: [String: [String]]
    var localMembersByBoard: [String: [MemberPreferenceCard]]
    var localChatMessagesByBoard: [String: [BoardMessage]]?
    var localBoardsById: [String: MobileBoard]
    var localProfilesByBoard: [String: RentalProfile]
    var pendingListingCreatesByBoard: [String: [ListingPreview]]?
    var pendingLocalListingRemovalIDs: Set<String>?
    var pendingServerListingRemovalIDsByBoard: [String: Set<String>]?
    var serverListingIDByLocalID: [String: String]?
    var removedServerListingIDsByBoard: [String: Set<String>]?
    var removedListingIdentityKeysByBoard: [String: Set<String>]?
  }

  @ObservationIgnored private let api = HomeboardAPI()
  @ObservationIgnored private var didBootstrap = false
  @ObservationIgnored private var didFinishBootstrap = false
  @ObservationIgnored private var bootstrapWaiters: [CheckedContinuation<Void, Never>] = []
  @ObservationIgnored private var activeListingInventoryRequestID: UUID?
  @ObservationIgnored private var listingUploadTask: Task<Void, Never>?
  @ObservationIgnored private var onboardingPersistenceTask: Task<Void, Never>?
  @ObservationIgnored private var pendingListingCreatesByBoard: [String: [ListingPreview]] = [:]
  @ObservationIgnored private var pendingLocalListingRemovalIDs = Set<String>()
  @ObservationIgnored private var pendingServerListingRemovalIDsByBoard: [String: Set<String>] = [:]
  @ObservationIgnored private var serverListingIDByLocalID: [String: String] = [:]
  @ObservationIgnored private var removedServerListingIDsByBoard: [String: Set<String>] = [:]
  @ObservationIgnored private var removedListingIdentityKeysByBoard: [String: Set<String>] = [:]
  @ObservationIgnored private var recentlyDeletedPurgeBoardIDs = Set<String>()
  @ObservationIgnored private var restoredAuthUserID: String?
  @ObservationIgnored private var unreadablePersistenceKeys = Set<String>()
  @ObservationIgnored private var sessionEpoch = UUID()
  private let persistenceSchemaVersion = 1
  private let legacyPersistenceKey = "homeboard.native.state"
  private let accountSessionPersistenceKey = "homeboard.native.account-session"
  private let profilePersistenceKey = "homeboard.native.profile"
  private let boardsListingsPersistenceKey = "homeboard.native.boards-listings"
  private let onboardingPersistenceKey = "homeboard.native.onboarding"
  private let pendingOperationsPersistenceKey = "homeboard.native.pending-operations"
  private let pushTokenKey = "homeboard.native.push-device-token"

  private var persistenceKeys: [String] {
    [
      accountSessionPersistenceKey,
      profilePersistenceKey,
      boardsListingsPersistenceKey,
      onboardingPersistenceKey,
      pendingOperationsPersistenceKey,
    ]
  }

  var currentScreen: Screen = .welcome
  var authMode: AuthMode = .createAccount
  var boardTab: BoardTab = .board
  var board: MobileBoard = .empty
  var account: LocalAccount?
  var authSession: NativeAuthSession?
  var authenticatedMembershipState: MobileMembershipState?
  var availableBoards: [MobileBoardSummary] = []
  var pendingInviteCode = ""
  var pendingConfirmationEmail = ""
  var onboardingCreationRequestId: String?
  var profile: RentalProfile = RentalProfile()
  var onboardingMessages: [OnboardingChatMessage] = []
  var localShortlistsByBoard: [String: [ListingPreview]] = [:]
  var localQuestionsByBoard: [String: [String]] = [:]
  var localActivityByBoard: [String: [String]] = [:]
  var localMembersByBoard: [String: [MemberPreferenceCard]] = [:]
  var localChatMessagesByBoard: [String: [BoardMessage]] = [:]
  var localBoardsById: [String: MobileBoard] = [:]
  var localProfilesByBoard: [String: RentalProfile] = [:]
  var isBootstrapping = false
  var isAuthLoading = false
  var isOnboardingLoading = false
  var isBoardLoading = false
  var isRestoredBoardRefreshing = false
  var isPostingBoardUpdate = false
  var isAdvisorActionWorking = false
  var advisorHistoryByListingID: [String: [ListingChangeEntry]] = [:]
  var advisorChecklistByListingID: [String: [ApplicationChecklistEntry]] = [:]
  var advisorInquiriesByListingID: [String: [ListingInquiry]] = [:]
  var advisorTourNotesByListingID: [String: TourNoteSummary] = [:]
  var advisorError: String?
  var apiVersion: String?
  var apiCommit: String?
  var apiVersionError: String?
  var authError: String?
  var authFeedback: String?
  var showsPostAuthInvitePrompt = false
  var showsPostAuthNotificationPrompt = false
  var isNotificationPermissionLoading = false
  var opensWelcomeOnAccessPage = false
  var onboardingError: String?
  var boardError: String?
  var inviteFeedback: String?
  var incomingLinkError: String?
  var boardFeedback: String?
  var boardMessageDraft = ""
  var listingInventory: [ListingPreview] = []
  var listingInventoryNextCursor: String?
  var listingInventoryHasMore = false
  var isListingInventoryLoading = false
  var listingInventoryError: String?
  var pendingSharedListingImport: HomeboardSharedImportStore.PendingImport?
  var pendingMacPairingRequest: MacDevicePairingRequest?
  var recentlyDeletedListings: [ListingPreview] {
    (board.recentlyDeleted ?? []).filter { listing in
      guard let deletedAt = listing.deletedAt,
            let date = recentlyDeletedDate(from: deletedAt)
      else { return true }
      return date > Date().addingTimeInterval(-7 * 24 * 60 * 60)
    }
  }
  var canPermanentlyClearRecentlyDeleted: Bool {
    if board.id?.hasPrefix("local-") == true || board.id?.hasPrefix("preview-") == true {
      return true
    }
    guard let userId = account?.id else { return false }
    return board.members.first(where: { $0.userId == userId })?.role == "owner"
  }
  var isGuestPreview: Bool {
    authSession == nil && board.id?.hasPrefix("preview-") == true && currentScreen == .board
  }
  var pendingSharedListingURL: String? {
    get {
      pendingSharedListingImport?.canonicalURL ?? pendingSharedListingImport?.url
    }
    set {
      guard let newValue else {
        pendingSharedListingImport = nil
        return
      }
      if pendingSharedListingImport == nil {
        pendingSharedListingImport = HomeboardSharedImportStore.PendingImport(url: newValue)
      } else {
        pendingSharedListingImport?.url = newValue
        pendingSharedListingImport?.canonicalURL = newValue
      }
    }
  }

  init() {
    if ProcessInfo.processInfo.arguments.contains("-homeboard.resetForUITesting") {
      for key in persistenceKeys + [legacyPersistenceKey] {
        UserDefaults.standard.removeObject(forKey: key)
      }
      UserDefaults.standard.set(0, forKey: "homeboard.debug.welcomePage")
      NativeAuthSessionStore.delete()
    }
    restore()
    removePersistedStressTestListings()
    purgeExpiredLocalRecentlyDeletedListings()
    authSession = NativeAuthSessionStore.load()
    // Cached membership is not proof of identity or authorization. Preserve it
    // until a successful session response identifies the current app user.
    if authSession == nil {
      clearGuestPreviewState(preservingNonPreviewBoard: true)
      opensWelcomeOnAccessPage = false
      currentScreen = .welcome
    }
    persist()
  }

  func bootstrap() async {
    if didBootstrap {
      if !didFinishBootstrap {
        await withCheckedContinuation { continuation in
          bootstrapWaiters.append(continuation)
        }
      }
      return
    }
    didBootstrap = true
    defer {
      didFinishBootstrap = true
      bootstrapWaiters.forEach { $0.resume() }
      bootstrapWaiters.removeAll()
    }
    guard let session = authSession else { return }

    // RootView starts this refresh underneath the launch intro. When a board was
    // restored from disk, keep it available so the intro can hand off directly
    // to useful content while the network refresh finishes in the background.
    let canShowRestoredBoard = currentScreen == .board && board.id != nil
    isBootstrapping = !canShowRestoredBoard
    isRestoredBoardRefreshing = canShowRestoredBoard
    defer {
      isBootstrapping = false
      isRestoredBoardRefreshing = false
      persist()
    }

    do {
      let response = try await api.fetchBootstrapSession(accessToken: session.accessToken)
      guard applySessionResponse(response, session: session) else { return }
      if let firstBoard = response.boards.first {
        if let activeBoard = response.activeBoard,
           activeBoard.board.id == firstBoard.id {
          applyBoardLoadResponse(activeBoard, id: firstBoard.id)
        } else {
          try await loadBoard(id: firstBoard.id)
        }
      } else if response.membershipState == .authenticatedNoMembership {
        seedOnboardingMessagesIfNeeded()
        currentScreen = .onboarding
      } else {
        boardError = "The server did not confirm this account's board membership. Your saved board is still available."
      }
    } catch HomeboardAPIError.unauthorized {
      do {
        let refreshed = try await api.refreshSession(refreshToken: session.refreshToken)
        guard authSession?.userId == session.userId else { return }
        authSession = refreshed
        NativeAuthSessionStore.save(refreshed)
        let response = try await api.fetchBootstrapSession(accessToken: refreshed.accessToken)
        guard applySessionResponse(response, session: refreshed) else { return }
        if let firstBoard = response.boards.first {
          if let activeBoard = response.activeBoard,
             activeBoard.board.id == firstBoard.id {
            applyBoardLoadResponse(activeBoard, id: firstBoard.id)
          } else {
            try await loadBoard(id: firstBoard.id)
          }
        } else if response.membershipState == .authenticatedNoMembership {
          seedOnboardingMessagesIfNeeded()
          currentScreen = .onboarding
        } else {
          boardError = "The server did not confirm this account's board membership. Your saved board is still available."
        }
      } catch HomeboardAPIError.unauthorized {
        // A failed refresh is not a successful identity transition. Preserve
        // the Keychain session and every cached workspace record for retry.
        boardError = "Homeboard could not renew this session. Your saved board is still on this device."
      } catch {
        boardError = readable(error)
      }
    } catch {
      // A slow board or temporary backend failure is not an expired login.
      // Keep the restored board/session visible and let the user retry instead
      // of refreshing auth and replaying the same long request.
      boardError = readable(error)
    }
  }

  func openAuth(mode: AuthMode, inviteCode: String = "") {
    authError = nil
    authFeedback = nil
    authMode = mode
    let inviteToken = normalizedInviteToken(from: inviteCode)
    if !inviteToken.isEmpty {
      pendingInviteCode = inviteToken
    }
    currentScreen = .auth
    persist()
  }

  func openWelcomeFromGuestPreview() {
    clearGuestPreviewState()
    opensWelcomeOnAccessPage = false
    #if DEBUG
    UserDefaults.standard.set(0, forKey: "homeboard.debug.welcomePage")
    #endif
    currentScreen = .welcome
    persist()
  }

  @discardableResult
  func saveInviteForAppleSignIn(code rawCode: String) -> Bool {
    let inviteCode = normalizedInviteToken(from: rawCode)
    guard !inviteCode.isEmpty else {
      authError = "Open an invite link or paste its token first."
      return false
    }

    authError = nil
    pendingInviteCode = inviteCode
    persist()
    return true
  }

  func openBoardTab(_ tab: BoardTab) {
    // Errors belong to the action that produced them. Do not carry a stale
    // network error into Group just because the user changed tabs.
    boardError = nil
    boardTab = tab
    currentScreen = .board
    persist()
  }

  func startInviteJoin(code rawCode: String) async {
    let inviteCode = normalizedInviteToken(from: rawCode)
    guard !inviteCode.isEmpty else {
      authError = "Open an invite link or paste its token first."
      return
    }

    authError = nil
    pendingInviteCode = inviteCode

    if authSession != nil {
      incomingLinkError = nil
      do {
        try await acceptInvite(code: inviteCode)
        persist()
      } catch {
        incomingLinkError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      }
      return
    }

    opensWelcomeOnAccessPage = true
    currentScreen = .welcome
    persist()
  }

  func completeAuth(name: String, email: String) {
    let resolvedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let resolvedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)

    account = LocalAccount(
      name: resolvedName.isEmpty ? "Homeboard user" : resolvedName,
      email: resolvedEmail
    )

    if profile.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      profile.name = account?.name ?? ""
    }

    onboardingMessages = [
      OnboardingChatMessage(
        role: .assistant,
        content: "Set up your rental search by adding a city, roommates, budget, move-in timing, commute, and neighborhoods."
      )
    ]
    currentScreen = .onboarding
    persist()
  }

  func submitAppleAuth(
    identityToken: String,
    nonce: String,
    displayName: String?,
    inviteCode: String = ""
  ) async {
    authError = nil
    authFeedback = nil
    isAuthLoading = true
    defer {
      isAuthLoading = false
      persist()
    }

    do {
      var session = try await api.signInWithApple(
        identityToken: identityToken,
        nonce: nonce
      )

      if let appleName = displayName?
        .trimmingCharacters(in: .whitespacesAndNewlines),
         !appleName.isEmpty {
        try? await api.updateDisplayName(
          accessToken: session.accessToken,
          displayName: appleName
        )
        session.displayName = appleName
      }

      authSession = session
      NativeAuthSessionStore.save(session)

      let normalizedInvite = inviteCode
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .uppercased()
      if !normalizedInvite.isEmpty {
        pendingInviteCode = normalizedInvite
      }

      let response = try await api.fetchSession(accessToken: session.accessToken)
      guard applySessionResponse(response, session: session) else { return }
      pendingConfirmationEmail = ""
      await preparePostAuthenticationPrompts()
    } catch {
      let message = readable(error)
      let normalized = message.lowercased()
      if normalized.contains("provider")
          && (normalized.contains("not enabled") || normalized.contains("unsupported")) {
        authError = "Apple sign-in is not enabled in Homeboard's Supabase project yet. Enable the Apple provider, then try again."
      } else {
        authError = readableAuthError(error, email: "your Apple account")
      }
    }
  }

  func submitAuth(name: String, email: String, password: String, inviteCode: String = "") async {
    authError = nil
    authFeedback = nil

    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)

    if authMode == .createAccount && trimmedName.isEmpty {
      authError = "Add your name before continuing."
      return
    }

    if !isValidEmail(trimmedEmail) {
      authError = "Enter a real email address."
      return
    }

    if trimmedPassword.count < 8 {
      authError = "Password must be at least 8 characters."
      return
    }

    isAuthLoading = true
    defer {
      isAuthLoading = false
      persist()
    }

    do {
      let session: NativeAuthSession
      if authMode == .createAccount {
        switch try await api.signUp(
          name: trimmedName,
          email: trimmedEmail,
          password: trimmedPassword
        ) {
        case .authenticated(let authenticatedSession):
          session = authenticatedSession
        case .confirmationRequired(let confirmationEmail):
          pendingConfirmationEmail = confirmationEmail
          authMode = .signIn
          authFeedback = "Account created. Confirm the email we sent to \(confirmationEmail), then return here and sign in."
          return
        }
      } else {
        session = try await api.signIn(
          email: trimmedEmail,
          password: trimmedPassword
        )
      }

      authSession = session
      NativeAuthSessionStore.save(session)

      let normalizedInvite = inviteCode
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .uppercased()
      if !normalizedInvite.isEmpty {
        pendingInviteCode = normalizedInvite
      }

      let response = try await api.fetchSession(accessToken: session.accessToken)
      guard applySessionResponse(response, session: session) else { return }
      pendingConfirmationEmail = ""
      await preparePostAuthenticationPrompts()
    } catch {
      authError = readableAuthError(error, email: trimmedEmail)
    }
  }

  func resendSignUpConfirmation(email: String) async {
    authError = nil
    authFeedback = nil
    let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard isValidEmail(normalizedEmail) else {
      authError = "Enter the email address you used to create the account."
      return
    }

    isAuthLoading = true
    defer {
      isAuthLoading = false
      persist()
    }
    do {
      try await api.resendSignUpConfirmation(email: normalizedEmail)
      pendingConfirmationEmail = normalizedEmail
      authFeedback = "Confirmation email resent to \(normalizedEmail)."
    } catch {
      authError = readableAuthError(error, email: normalizedEmail)
    }
  }

  func retryAuthenticatedSession() async {
    authError = nil
    authFeedback = nil
    guard let session = authSession else {
      authError = "Sign in again before reconnecting."
      return
    }

    isAuthLoading = true
    defer {
      isAuthLoading = false
      persist()
    }
    do {
      do {
        let response = try await api.fetchSession(accessToken: session.accessToken)
        guard applySessionResponse(response, session: session) else { return }
      } catch HomeboardAPIError.unauthorized {
        let refreshed = try await api.refreshSession(refreshToken: session.refreshToken)
        guard authSession?.userId == session.userId else { return }
        authSession = refreshed
        NativeAuthSessionStore.save(refreshed)
        let response = try await api.fetchSession(accessToken: refreshed.accessToken)
        guard applySessionResponse(response, session: refreshed) else { return }
      }
      pendingConfirmationEmail = ""
      await preparePostAuthenticationPrompts()
    } catch {
      authError = readableAuthError(error, email: session.email)
    }
  }

  private func preparePostAuthenticationPrompts() async {
    showsPostAuthInvitePrompt = false
    showsPostAuthNotificationPrompt = await NativePushService.shouldOfferAuthorization()
    if !showsPostAuthNotificationPrompt {
      showsPostAuthInvitePrompt = true
    }
  }

  func continueAfterAuthentication(inviteCode rawCode: String?) async {
    authError = nil
    let inviteCode = (rawCode ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .uppercased()

    if inviteCode.isEmpty {
      continueAfterAuthenticationWithoutInvite()
      return
    }

    isAuthLoading = true
    defer {
      isAuthLoading = false
      persist()
    }

    do {
      try await acceptInvite(code: inviteCode)
      pendingInviteCode = ""
      showsPostAuthInvitePrompt = false
    } catch {
      authError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func respondToPostAuthNotificationPrompt(enableNotifications: Bool) async {
    guard showsPostAuthNotificationPrompt, !isNotificationPermissionLoading else { return }
    isNotificationPermissionLoading = true
    defer {
      isNotificationPermissionLoading = false
      showsPostAuthNotificationPrompt = false
      showsPostAuthInvitePrompt = true
      persist()
    }

    if enableNotifications {
      // A declined system prompt should never block the user from finishing sign-in.
      try? await NativePushService.requestAuthorization()
    }
  }

  func continueAfterAuthenticationWithoutInvite() {
    authError = nil
    pendingInviteCode = ""
    showsPostAuthInvitePrompt = false

    guard let firstBoard = availableBoards.first else {
      guard authenticatedMembershipState == .authenticatedNoMembership else {
        authError = "Homeboard has not confirmed that this account has no boards. Your cached data was kept; retry the connection."
        persist()
        return
      }
      profile.name = account?.name ?? profile.name
      seedOnboardingMessagesIfNeeded()
      currentScreen = .onboarding
      persist()
      return
    }

    let cachedBoard = localBoardsById[firstBoard.id]
    if let cachedBoard {
      board = boardByApplyingRemovalTombstones(cachedBoard, storageKey: firstBoard.id)
      profile = localProfilesByBoard[firstBoard.id] ?? profile
      listingInventory = cachedBoard.suggestions ?? []
      listingInventoryNextCursor = nil
      listingInventoryHasMore = false
      listingInventoryError = nil
      applyLocalBoardContributions()
      HomeboardSharedImportStore.setActiveBoard(firstBoard.id)
    }

    currentScreen = .board
    boardTab = .board
    isBoardLoading = cachedBoard == nil
    persist()

    Task {
      defer {
        isBoardLoading = false
        persist()
      }
      do {
        try await loadBoard(id: firstBoard.id)
      } catch {
        boardError = (error as? LocalizedError)?.errorDescription
          ?? error.localizedDescription
      }
    }
  }

  func requestPasswordReset(email: String) async {
    authError = nil
    authFeedback = nil
    let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard isValidEmail(normalizedEmail) else {
      authError = "Enter the email address attached to your account first."
      return
    }

    isAuthLoading = true
    defer { isAuthLoading = false }
    do {
      try await api.requestPasswordReset(email: normalizedEmail)
      authFeedback = "Password reset sent. Open the email on this device, choose a new password, then return here to sign in."
    } catch {
      authError = readable(error)
    }
  }

  func openBoard() {
    currentScreen = .board
    boardTab = .board
    persist()
  }

  func refreshVersionInfo() async {
    apiVersionError = nil
    do {
      let health = try await api.fetchHealth()
      apiVersion = health.apiVersion
      apiCommit = health.serverCommit
    } catch {
      apiVersion = nil
      apiCommit = nil
      apiVersionError = readable(error)
    }
  }

  func openBoard(id: String) async {
    boardError = nil
    boardFeedback = nil
    advisorError = nil

    if id.hasPrefix("local-"), let localBoard = localBoardsById[id] {
      board = localBoard
      listingInventory = localBoard.suggestions ?? []
      listingInventoryNextCursor = nil
      listingInventoryHasMore = false
      profile = localProfilesByBoard[id] ?? profile
      applyLocalBoardContributions()
      currentScreen = .board
      boardTab = .board
      persist()
      return
    }

    guard authSession != nil else {
      currentScreen = .board
      boardTab = .board
      persist()
      return
    }

    isBoardLoading = true
    defer {
      isBoardLoading = false
      persist()
    }

    do {
      try await loadBoard(id: id)
      boardTab = .board
    } catch {
      boardError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func refreshCurrentBoard() async {
    boardError = nil
    boardFeedback = nil
    guard let boardId = board.id else { return }
    isBoardLoading = true
    defer {
      isBoardLoading = false
      persist()
    }
    do {
      try await loadBoard(id: boardId)
    } catch {
      boardError = (error as? LocalizedError)?.errorDescription
        ?? error.localizedDescription
    }
  }

  func refreshCurrentBoardSilently() async {
    guard let boardId = board.id, let session = authSession else { return }
    do {
      try await loadBoard(id: boardId)
    } catch HomeboardAPIError.unauthorized {
      do {
        let refreshed = try await api.refreshSession(refreshToken: session.refreshToken)
        guard authSession?.userId == session.userId, board.id == boardId else { return }
        authSession = refreshed
        NativeAuthSessionStore.save(refreshed)
        try await loadBoard(id: boardId)
      } catch {
        // A later foreground action can surface the auth failure without
        // interrupting someone who is currently reading the board.
      }
    } catch {
      // Keep silent refresh silent so the UI does not feel noisy.
    }
  }

  func triggerScoutScan(boardId: String) async {
    advisorError = nil
    boardFeedback = nil

    if boardId.hasPrefix("preview-") || boardId.hasPrefix("local-") {
      boardFeedback = "Preview listings use their saved facts; live checks require a signed-in board."
      return
    }
    guard let session = authSession else {
      advisorError = "Sign in before running an Advisor scan."
      return
    }
    do {
      try await api.triggerScoutScan(accessToken: session.accessToken, boardId: boardId)
      await refreshCurrentBoardSilently()
      boardFeedback = "Advisor scan finished. Review Updates for any grounded listing changes or follow-ups."
    } catch {
      advisorError = readable(error)
    }
  }

  func updateAdvisorAction(_ action: AdvisorAction, status: String) async {
    guard let session = authSession, let boardId = board.id else { return }
    isAdvisorActionWorking = true
    advisorError = nil
    defer { isAdvisorActionWorking = false }
    do {
      try await api.updateAdvisorAction(
        accessToken: session.accessToken,
        boardId: boardId,
        actionId: action.id,
        status: status
      )
      board.advisorActions.removeAll { $0.id == action.id }
      storeCurrentBoardSnapshot()
      persist()
    } catch {
      advisorError = readable(error)
    }
  }

  func checkListingAgain(listingId: String) async {
    guard let session = authSession, let boardId = board.id else {
      advisorError = "Sign in before checking a live listing."
      return
    }
    isAdvisorActionWorking = true
    advisorError = nil
    defer { isAdvisorActionWorking = false }
    do {
      let response = try await api.checkListing(
        accessToken: session.accessToken,
        boardId: boardId,
        listingId: listingId
      )
      boardFeedback = response.message
      await refreshCurrentBoardSilently()
      await loadAdvisorListingTools(listingId: listingId)
    } catch {
      advisorError = readable(error)
    }
  }

  func loadAdvisorListingTools(listingId: String) async {
    guard let session = authSession, let boardId = board.id else { return }
    advisorError = nil
    do {
      async let history = api.loadListingHistory(accessToken: session.accessToken, boardId: boardId, listingId: listingId)
      async let checklist = api.loadApplicationChecklist(accessToken: session.accessToken, boardId: boardId, listingId: listingId)
      async let inquiries = api.loadListingInquiries(accessToken: session.accessToken, boardId: boardId, listingId: listingId)
      let result = try await (history, checklist, inquiries)
      advisorHistoryByListingID[listingId] = result.0
      advisorChecklistByListingID[listingId] = result.1
      advisorInquiriesByListingID[listingId] = result.2
      persist()
    } catch {
      advisorError = readable(error)
    }
  }

  func createInquiryDraft(listingId: String, templateKey: String) async {
    guard let session = authSession, let boardId = board.id else { return }
    isAdvisorActionWorking = true
    advisorError = nil
    defer { isAdvisorActionWorking = false }
    do {
      let inquiry = try await api.createInquiryDraft(
        accessToken: session.accessToken,
        boardId: boardId,
        listingId: listingId,
        templateKey: templateKey
      )
      advisorInquiriesByListingID[listingId, default: []].insert(inquiry, at: 0)
      boardFeedback = "Draft created. Review every word before sending."
      await refreshCurrentBoardSilently()
    } catch {
      advisorError = readable(error)
    }
  }

  func updateInquiry(
    listingId: String,
    inquiry: ListingInquiry,
    status: String,
    subject: String,
    body: String,
    replyText: String? = nil,
    reviewConfirmed: Bool? = nil
  ) async {
    guard let session = authSession, let boardId = board.id else { return }
    isAdvisorActionWorking = true
    advisorError = nil
    defer { isAdvisorActionWorking = false }
    do {
      let updated = try await api.updateInquiry(
        accessToken: session.accessToken,
        boardId: boardId,
        listingId: listingId,
        inquiryId: inquiry.id,
        status: status,
        subject: subject,
        body: body,
        replyText: replyText,
        reviewConfirmed: reviewConfirmed
      )
      advisorInquiriesByListingID[listingId] = advisorInquiriesByListingID[listingId, default: []].map {
        $0.id == updated.id ? updated : $0
      }
      boardFeedback = status == "sent" ? "Marked sent after your review." : status == "answered" ? "Reply parsed into grounded fields." : "Draft saved."
      await refreshCurrentBoardSilently()
    } catch {
      advisorError = readable(error)
    }
  }

  func updateApplicationItem(listingId: String, item: ApplicationChecklistEntry, status: String) async {
    guard let session = authSession, let boardId = board.id else { return }
    advisorError = nil
    do {
      let updated = try await api.updateApplicationChecklist(
        accessToken: session.accessToken,
        boardId: boardId,
        listingId: listingId,
        itemId: item.id,
        status: status
      )
      advisorChecklistByListingID[listingId] = advisorChecklistByListingID[listingId, default: []].map {
        $0.id == updated.id ? updated : $0
      }
    } catch {
      advisorError = readable(error)
    }
  }

  func saveTourNote(listingId: String, transcript: String) async {
    guard let session = authSession, let boardId = board.id else { return }
    isAdvisorActionWorking = true
    advisorError = nil
    defer { isAdvisorActionWorking = false }
    do {
      let summary = try await api.saveTourNote(
        accessToken: session.accessToken,
        boardId: boardId,
        listingId: listingId,
        transcript: transcript
      )
      advisorTourNotesByListingID[listingId] = summary
      boardFeedback = "Tour notes organized: \(summary.pros.count) pros, \(summary.cons.count) cons, and \(summary.followUps.count) follow-ups."
      await refreshCurrentBoardSilently()
    } catch {
      advisorError = readable(error)
    }
  }

  @discardableResult
  func startAdvisorSplit(boardId: String) async -> Bool {
    guard let session = authSession else {
      boardError = "Sign in before starting an Advisor split."
      return false
    }

    boardError = nil
    boardFeedback = nil
    do {
      let subscription = try await api.startAdvisorSplit(
        accessToken: session.accessToken,
        boardId: boardId
      )
      guard board.id == boardId, authSession?.userId == session.userId else { return false }
      board.scoutSubscription = subscription
      storeCurrentBoardSnapshot()
      persist()
      boardFeedback = subscription.isActive
        ? "Advisor is already active for this board."
        : "The Advisor split is ready. Fund your share to keep it moving."
      return true
    } catch {
      boardError = readable(error)
      return false
    }
  }

  @discardableResult
  func fundAdvisor(boardId: String, coverRemaining: Bool = false) async -> Bool {
    guard let session = authSession else {
      boardError = "Sign in before funding Advisor."
      return false
    }

    boardError = nil
    boardFeedback = nil
    do {
      let subscription = try await api.fundAdvisor(
        accessToken: session.accessToken,
        boardId: boardId,
        coverRemaining: coverRemaining
      )
      guard board.id == boardId, authSession?.userId == session.userId else { return false }
      board.scoutSubscription = subscription
      storeCurrentBoardSnapshot()
      persist()
      boardFeedback = subscription.isActive
        ? "Advisor is active for the next seven days."
        : "Your Advisor share is funded. Waiting for the rest of the group."
      return true
    } catch {
      boardError = readable(error)
      return false
    }
  }

  func loadListingInventory(
    view: String,
    minimumLatitude: Double? = nil,
    maximumLatitude: Double? = nil,
    minimumLongitude: Double? = nil,
    maximumLongitude: Double? = nil,
    maximumPrice: Double? = nil,
    minimumBedrooms: Double? = nil,
    query: String? = nil,
    append: Bool = false
  ) async {
    guard let boardId = board.id, !boardId.hasPrefix("local-") else {
      listingInventory = board.suggestions ?? []
      listingInventoryNextCursor = nil
      listingInventoryHasMore = false
      return
    }
    guard let session = authSession else { return }
    guard !append || listingInventoryHasMore else { return }
    guard !append || !isListingInventoryLoading else { return }

    let requestID = UUID()
    activeListingInventoryRequestID = requestID
    isListingInventoryLoading = true
    listingInventoryError = nil

    do {
      let response = try await api.fetchListingInventory(
        accessToken: session.accessToken,
        boardId: boardId,
        view: view,
        minimumLatitude: minimumLatitude,
        maximumLatitude: maximumLatitude,
        minimumLongitude: minimumLongitude,
        maximumLongitude: maximumLongitude,
        maximumPrice: maximumPrice,
        minimumBedrooms: minimumBedrooms,
        query: query,
        cursor: append ? listingInventoryNextCursor : nil,
        limit: view == "cards" ? 30 : 500
      )
      guard activeListingInventoryRequestID == requestID else { return }

      if append {
        var known = Set(listingInventory.map(\.listingId))
        listingInventory.append(
          contentsOf: response.listings.filter {
            known.insert($0.listingId).inserted
          }
        )
      } else {
        listingInventory = Array(response.listings.prefix(500))
      }
      listingInventoryNextCursor = response.nextCursor
      listingInventoryHasMore = response.hasMore
      isListingInventoryLoading = false
    } catch {
      guard activeListingInventoryRequestID == requestID else { return }
      listingInventoryError = readable(error)
      isListingInventoryLoading = false
    }
  }

  func sendBoardMessage() async {
    let message = boardMessageDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !message.isEmpty else { return }
    guard let session = authSession, let boardId = board.id else {
      boardError = "Open a real board before sending messages."
      return
    }
    let requestEpoch = sessionEpoch

    boardError = nil
    boardFeedback = nil
    boardMessageDraft = ""

    let temporaryID = "local-msg-\(UUID().uuidString)"
    board.chatMessages.append(
      BoardMessage(
        id: temporaryID,
        role: "user",
        authorName: account?.name ?? authSession?.displayName ?? "You",
        content: message,
        createdAt: ISO8601DateFormatter().string(from: Date())
      )
    )
    storeCurrentBoardSnapshot()

    isBoardLoading = true
    defer {
      isBoardLoading = false
      persist()
    }

    do {
      let response = try await api.sendBoardMessage(
        accessToken: session.accessToken,
        boardId: boardId,
        content: message
      )
      guard requestEpoch == sessionEpoch,
            authSession?.userId == session.userId,
            board.id == boardId else { return }
      board = boardWithDemoAdvisorEntitlement(response.board)
      profile = RentalProfile(remote: response.profile)
    } catch {
      guard requestEpoch == sessionEpoch, authSession?.userId == session.userId else { return }
      board.chatMessages.removeAll { $0.id == temporaryID }
      storeCurrentBoardSnapshot()
      boardError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      boardMessageDraft = message
    }
  }

  func signOut() {
    let session = authSession
    let pushToken = UserDefaults.standard.string(forKey: pushTokenKey)
    let apiClient = api
    NativeAuthSessionStore.delete()
    clearSessionState()
    persist()
    if let session, let pushToken {
      Task {
        try? await apiClient.unregisterPushDevice(
          accessToken: session.accessToken,
          token: pushToken
        )
      }
    }
  }

  @discardableResult
  func createInvite() async -> BoardInvitationSummary? {
    boardError = nil
    inviteFeedback = nil
    boardFeedback = nil

    guard let session = authSession, let boardId = board.id else {
      boardError = "Open a real board before creating invites."
      return nil
    }

    isBoardLoading = true
    defer {
      isBoardLoading = false
      persist()
    }

    do {
      let response = try await api.createInvitation(
        accessToken: session.accessToken,
        boardId: boardId
      )
      inviteFeedback = "Single-use roommate link ready. Share it with the person joining this board."
      try await loadBoard(id: boardId)
      return response.invitation
    } catch {
      boardError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      return nil
    }
  }

  func revokeInvite(_ invitation: BoardInvitationSummary) {
    guard invitation.status == "pending", let session = authSession else { return }
    Task {
      do {
        try await api.revokeInvitation(accessToken: session.accessToken, invitationId: invitation.id)
        if let boardId = board.id { try await loadBoard(id: boardId) }
        inviteFeedback = "Shareable invite canceled."
      } catch {
        boardError = readable(error)
      }
      persist()
    }
  }

  func deleteAccount() {
    guard let session = authSession else { return }
    Task {
      do {
        try await api.deleteAccount(accessToken: session.accessToken)
        HomeboardShareDiagnosticStore.clear()
        HomeboardShareBootDiagnosticStore.clear()
        NativeAuthSessionStore.delete()
        clearSessionState()
        boardFeedback = "Your account and Homeboard data were deleted."
      } catch {
        boardError = readable(error)
      }
      persist()
    }
  }

  func acceptInvite(code rawCode: String) async throws {
    let inviteCode = normalizedInviteToken(from: rawCode)
    guard let session = authSession else {
      throw HomeboardAPIError.missingSession
    }
    let requestEpoch = sessionEpoch

    let response = try await api.acceptInvitation(accessToken: session.accessToken, inviteCode: inviteCode)
    guard requestEpoch == sessionEpoch, authSession?.userId == session.userId else { return }
    board = boardByApplyingRemovalTombstones(response.board, storageKey: response.boardId)
    HomeboardSharedImportStore.setActiveBoard(response.boardId)
    consumeSharedListingImport()
    profile = RentalProfile(remote: response.profile)
    if !availableBoards.contains(where: { $0.id == response.boardId }) {
      availableBoards.insert(
        MobileBoardSummary(id: response.boardId, title: response.board.title, city: response.board.city, createdAt: "", updatedAt: ""),
        at: 0
      )
    }
    currentScreen = .board
    inviteFeedback = "You joined \(response.board.title)."
    pendingInviteCode = ""
    boardTab = .board
  }

  func joinBoardFromWorkspace(code rawCode: String) async {
    boardError = nil
    let inviteCode = normalizedInviteToken(from: rawCode)
    guard !inviteCode.isEmpty else {
      boardError = "Open an invite link or paste its token first."
      return
    }

    guard authSession != nil else {
      pendingInviteCode = inviteCode
      currentScreen = .auth
      authMode = .signIn
      persist()
      return
    }

    boardError = nil
    inviteFeedback = nil
    isBoardLoading = true
    defer {
      isBoardLoading = false
      persist()
    }

    do {
      try await acceptInvite(code: inviteCode)
    } catch {
      boardError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func finishOnboarding() async {
    guard !isOnboardingLoading else { return }
    onboardingError = nil

    guard let session = authSession else {
      onboardingError = "Sign in again before creating the shared board."
      return
    }
    let requestEpoch = sessionEpoch

    flushOnboardingDraft()
    let creationRequestId = onboardingCreationRequestId ?? UUID().uuidString
    onboardingCreationRequestId = creationRequestId
    persist()
    isOnboardingLoading = true
    defer {
      isOnboardingLoading = false
      persist()
    }

    do {
      let response: MobileOnboardingConfirmResponse
      do {
        response = try await api.confirmOnboarding(
          accessToken: session.accessToken,
          profile: profile,
          creationRequestId: creationRequestId
        )
      } catch HomeboardAPIError.unauthorized {
        let refreshed = try await api.refreshSession(refreshToken: session.refreshToken)
        guard requestEpoch == sessionEpoch, authSession?.userId == session.userId else { return }
        authSession = refreshed
        NativeAuthSessionStore.save(refreshed)
        response = try await api.confirmOnboarding(
          accessToken: refreshed.accessToken,
          profile: profile,
          creationRequestId: creationRequestId
        )
      }
      guard requestEpoch == sessionEpoch, authSession?.userId == session.userId else { return }
      applyOnboardingConfirmation(response)
    } catch {
      guard requestEpoch == sessionEpoch, authSession?.userId == session.userId else { return }
      onboardingError = "\(readable(error)) Your answers are saved. Tap below to try again."
    }
  }

  func syncBoardFromProfile() {
    board = buildBoard(from: profile)
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    scheduleOnboardingPersistence()
  }

  func saveOnboardingDraft() {
    scheduleOnboardingPersistence()
  }

  func flushOnboardingDraft() {
    onboardingPersistenceTask?.cancel()
    onboardingPersistenceTask = nil
    persist()
  }

  private func scheduleOnboardingPersistence() {
    onboardingPersistenceTask?.cancel()
    onboardingPersistenceTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 350_000_000)
      guard !Task.isCancelled, let self else { return }
      self.onboardingPersistenceTask = nil
      self.persist()
    }
  }

  private func applyOnboardingConfirmation(_ response: MobileOnboardingConfirmResponse) {
    profile = RentalProfile(remote: response.profile)
    board = boardWithDemoAdvisorEntitlement(response.board)
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    if let boardId = response.board.id {
      availableBoards = [MobileBoardSummary(
        id: boardId,
        title: response.board.title,
        city: response.board.city,
        createdAt: "",
        updatedAt: ""
      )]
    }
    onboardingCreationRequestId = nil
    UserDefaults.standard.set(
      true,
      forKey: "homeboard.guide.first-listing.pending"
    )
    currentScreen = .board
    boardTab = .board
  }

  func createLocalBoard(title rawTitle: String) {
    let resolvedTitle = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    var nextBoard = buildBoard(from: profile)
    nextBoard.id = "local-\(UUID().uuidString)"
    if !resolvedTitle.isEmpty {
      nextBoard.title = resolvedTitle
    }

    board = nextBoard
    currentScreen = .board
    boardTab = .board

    if let boardId = nextBoard.id {
      availableBoards.insert(
        MobileBoardSummary(
          id: boardId,
          title: nextBoard.title,
          city: nextBoard.city,
          createdAt: "",
          updatedAt: ""
        ),
        at: 0
      )
      localProfilesByBoard[boardId] = profile
    }

    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    boardFeedback = "\(nextBoard.title) is ready as a manual board."
    persist()
  }

  func renameCurrentBoard(_ rawTitle: String) {
    let resolvedTitle = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !resolvedTitle.isEmpty else {
      boardError = "Add a board title before saving it."
      return
    }

    boardError = nil
    boardFeedback = nil
    board.title = resolvedTitle

    if let boardId = board.id {
      if let index = availableBoards.firstIndex(where: { $0.id == boardId }) {
        availableBoards[index].title = resolvedTitle
      }
      localBoardsById[boardId] = board
      localProfilesByBoard[boardId] = profile
    }

    boardFeedback = "Board title updated."
    persist()

    if let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") {
      Task {
        do {
          let response = try await api.renameBoard(accessToken: session.accessToken, boardId: boardId, title: resolvedTitle)
          applyRemoteMutation(response, clearing: [.activity])
        } catch {
          boardError = readable(error)
        }
      }
    }
  }

  func saveBoardBrief() async {
    boardError = nil
    boardFeedback = nil

    guard let session = authSession, let boardId = board.id else {
      syncBoardFromProfile()
      boardFeedback = "Board brief updated locally."
      return
    }
    let requestEpoch = sessionEpoch

    isBoardLoading = true
    defer {
      isBoardLoading = false
      persist()
    }

    do {
      let response = try await api.saveBoardProfile(accessToken: session.accessToken, boardId: boardId, profile: profile)
      guard requestEpoch == sessionEpoch,
            authSession?.userId == session.userId,
            board.id == boardId else { return }
      board = boardWithDemoAdvisorEntitlement(response.board)
      profile = RentalProfile(remote: response.profile)
      storeCurrentBoardSnapshot()
      boardFeedback = "Board brief saved."
    } catch {
      guard requestEpoch == sessionEpoch, authSession?.userId == session.userId else { return }
      boardError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
  }

  func prepareSearchBriefEditing() {
    onboardingError = nil
    guard let member = currentAccountMemberForSearchBrief else { return }

    if !member.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      profile.name = member.name
    }
    profile.budgetMin = member.budgetMin.map { String(Int($0.rounded())) } ?? ""
    profile.budgetMax = (member.budgetMax ?? member.idealBudget)
      .map { String(Int($0.rounded())) } ?? ""
    profile.commuteTarget = member.commuteDestination ?? ""
    profile.commuteAccess = member.commuteAccess
    profile.minCommuteMinutes = member.preferredCommuteMinutes.map(String.init) ?? ""
    profile.maxCommuteMinutes = member.maxCommuteMinutes.map(String.init) ?? ""
    profile.neighborhoods = member.neighborhoods
    profile.mustHaves = member.mustHaves ?? []
    profile.dealbreakers = member.dealbreakers
    profile.priorities = member.priorities
    flushOnboardingDraft()
  }

  func saveSearchBriefEdits() async -> Bool {
    onboardingError = nil
    await saveBoardBrief()

    if let boardError {
      onboardingError = boardError
      return false
    }

    if var member = currentAccountMemberForSearchBrief {
      let minimum = Double(profile.budgetMin)
      let maximum = Double(profile.budgetMax)
      let previousIdeal = member.idealBudget
      member.budgetMin = minimum
      member.idealBudget = previousIdeal.flatMap { ideal in
        let clearsMinimum = minimum.map { ideal >= $0 } ?? true
        let clearsMaximum = maximum.map { ideal <= $0 } ?? true
        return clearsMinimum && clearsMaximum ? ideal : maximum
      } ?? maximum
      member.budgetMax = maximum
      member.budgetLine = searchBriefBudgetSummary(minimum: minimum, maximum: maximum)
      member.commuteDestination = profile.commuteTarget.isEmpty ? nil : profile.commuteTarget
      member.commuteAccess = profile.commuteAccess
      member.preferredCommuteMinutes = Int(profile.minCommuteMinutes)
      member.maxCommuteMinutes = Int(profile.maxCommuteMinutes)
      member.commuteLine = searchBriefCommuteSummary()
      member.priorities = profile.priorities.map { $0.lowercased() }
      member.neighborhoods = profile.neighborhoods
      member.mustHaves = profile.mustHaves
      member.dealbreakers = profile.dealbreakers
      member.status = "profile complete"
      updateManualMember(member)
    }

    boardFeedback = "Search brief updated."
    return true
  }

  private var currentAccountMemberForSearchBrief: MemberPreferenceCard? {
    if let userId = account?.id,
       let linkedMember = board.members.first(where: { $0.userId == userId }) {
      return linkedMember
    }
    return board.members.first(where: { $0.userId.isEmpty && $0.role == "owner" })
  }

  private func searchBriefBudgetSummary(minimum: Double?, maximum: Double?) -> String {
    guard let maximum else { return "Budget still open" }
    if let minimum, minimum > 0 {
      return "$\(Int(minimum).formatted())–$\(Int(maximum).formatted()) / month"
    }
    return "Up to $\(Int(maximum).formatted()) / month"
  }

  private func searchBriefCommuteSummary() -> String {
    if profile.commuteAccess == "remote" { return "Works remotely · not scored" }
    if profile.commuteAccess == "skip" { return "Commute not included" }
    guard !profile.commuteTarget.isEmpty else { return "Commute not included" }
    if let minimum = Int(profile.minCommuteMinutes),
       let maximum = Int(profile.maxCommuteMinutes) {
      return "\(profile.commuteTarget) · ideal \(minimum)–\(maximum) min"
    }
    return profile.commuteTarget
  }

  func returnHome() {
    currentScreen = .welcome
    persist()
  }

  func resetToWelcome() {
    currentScreen = .welcome
    persist()
  }

  func sendOnboardingMessage(_ rawMessage: String) async {
    let message = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !message.isEmpty else { return }

    onboardingError = nil
    onboardingMessages.append(.init(role: .user, content: message))

    guard let session = authSession else {
      processOnboardingLocally(message)
      persist()
      return
    }
    let requestEpoch = sessionEpoch

    isOnboardingLoading = true
    defer {
      isOnboardingLoading = false
      persist()
    }

    do {
      let response = try await api.sendOnboardingTurn(
        accessToken: session.accessToken,
        message: message,
        profile: profile,
        messages: onboardingMessages
      )
      guard requestEpoch == sessionEpoch, authSession?.userId == session.userId else { return }
      profile = RentalProfile(remote: response.profile)
      onboardingMessages.append(.init(remote: response.assistantMessage))
    } catch {
      guard requestEpoch == sessionEpoch, authSession?.userId == session.userId else { return }
      onboardingError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      processOnboardingLocally(message)
    }
  }

  private func processOnboardingLocally(_ message: String) {
    let previousProfile = profile
    var nextProfile = profile

    applyBudget(from: message, into: &nextProfile)
    applyGroupSize(from: message, into: &nextProfile)
    applyLocation(from: message, into: &nextProfile)
    applyMoveInDate(from: message, into: &nextProfile)
    applyCommute(from: message, into: &nextProfile)
    applyBedroomIntent(from: message, into: &nextProfile)
    applyPriorities(from: message, into: &nextProfile)
    applyMustHaves(from: message, into: &nextProfile)
    applyDealbreakers(from: message, into: &nextProfile)
    applyNeighborhoods(from: message, into: &nextProfile)

    profile = normalized(profile: nextProfile)

    let assistantReply = buildOnboardingReply(previous: previousProfile, next: profile)
    onboardingMessages.append(.init(role: .assistant, content: assistantReply))
  }

  private func loadBoard(id: String) async throws {
    guard let session = authSession else {
      throw HomeboardAPIError.missingSession
    }
    let requestEpoch = sessionEpoch

    let response = try await api.fetchBoard(accessToken: session.accessToken, boardId: id)
    guard requestEpoch == sessionEpoch, authSession?.userId == session.userId else { return }
    applyBoardLoadResponse(response, id: id)
  }

  private func applyBoardLoadResponse(_ response: MobileBoardLoadResponse, id: String) {
    let previousBoardID = board.id
    board = boardByApplyingRemovalTombstones(response.board, storageKey: id)
    HomeboardSharedImportStore.setActiveBoard(response.board.id ?? id)
    if previousBoardID != id {
      listingInventory = response.board.suggestions ?? []
      listingInventoryNextCursor = nil
      listingInventoryHasMore = false
      listingInventoryError = nil
    }
    profile = RentalProfile(remote: response.profile)
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    currentScreen = .board
    resumePendingListingMutations(boardId: id)
    scheduleRecentlyDeletedPurge(boardId: id)
  }

  @discardableResult
  private func applySessionResponse(_ response: MobileSessionResponse, session: NativeAuthSession) -> Bool {
    guard authSession?.userId == session.userId else { return false }
    let authenticatedAccountChanged: Bool
    if let cachedAppUserID = account?.id {
      authenticatedAccountChanged = cachedAppUserID != response.user.id
    } else if let restoredAuthUserID {
      authenticatedAccountChanged = restoredAuthUserID != session.userId
    } else {
      authenticatedAccountChanged = false
    }

    // This is the only automatic workspace-clear path: both the auth session
    // and application user have been confirmed by a successful API response.
    if authenticatedAccountChanged {
      clearWorkspaceStateForAccountTransition()
    }

    authSession = session
    restoredAuthUserID = session.userId
    account = LocalAccount(id: response.user.id, name: response.user.displayName, email: response.user.email)
    authenticatedMembershipState = response.membershipState
    if !response.boards.isEmpty || response.membershipState == .authenticatedNoMembership {
      availableBoards = response.boards
    }
    if profile.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      profile.name = response.user.displayName
    }
    return true
  }

  private func seedOnboardingMessagesIfNeeded() {
    if onboardingMessages.isEmpty {
      onboardingMessages = [
        OnboardingChatMessage(
          role: .assistant,
          content: "Set up your rental search by adding a city, roommates, budget, move-in timing, commute, and neighborhoods."
        )
      ]
    }
  }

  private func clearSessionState() {
    sessionEpoch = UUID()
    activeListingInventoryRequestID = nil
    listingUploadTask?.cancel()
    listingUploadTask = nil
    onboardingPersistenceTask?.cancel()
    onboardingPersistenceTask = nil
    authSession = nil
    restoredAuthUserID = nil
    authenticatedMembershipState = nil
    account = nil
    availableBoards = []
    pendingInviteCode = ""
    pendingConfirmationEmail = ""
    onboardingCreationRequestId = nil
    board = .empty
    profile = RentalProfile()
    onboardingMessages = []
    localShortlistsByBoard = [:]
    localQuestionsByBoard = [:]
    localActivityByBoard = [:]
    localMembersByBoard = [:]
    localChatMessagesByBoard = [:]
    advisorHistoryByListingID = [:]
    advisorChecklistByListingID = [:]
    advisorInquiriesByListingID = [:]
    advisorTourNotesByListingID = [:]
    advisorError = nil
    localBoardsById = [:]
    localProfilesByBoard = [:]
    pendingListingCreatesByBoard = [:]
    pendingLocalListingRemovalIDs = []
    pendingServerListingRemovalIDsByBoard = [:]
    serverListingIDByLocalID = [:]
    removedServerListingIDsByBoard = [:]
    removedListingIdentityKeysByBoard = [:]
    recentlyDeletedPurgeBoardIDs = []
    listingInventory = []
    listingInventoryNextCursor = nil
    listingInventoryHasMore = false
    listingInventoryError = nil
    pendingSharedListingImport = nil
    HomeboardSharedImportStore.clearAccountData()
    UserDefaults.standard.set(false, forKey: "homeboard.guide.first-listing.pending")
    authError = nil
    authFeedback = nil
    showsPostAuthInvitePrompt = false
    showsPostAuthNotificationPrompt = false
    isNotificationPermissionLoading = false
    opensWelcomeOnAccessPage = false
    onboardingError = nil
    boardFeedback = nil
    inviteFeedback = nil
    boardError = nil
    currentScreen = .welcome
  }

  /// Board snapshots and optimistic member data are device-local conveniences,
  /// not authorization. They must never survive a change in authenticated user.
  private func clearWorkspaceStateForAccountTransition() {
    sessionEpoch = UUID()
    activeListingInventoryRequestID = nil
    listingUploadTask?.cancel()
    listingUploadTask = nil
    onboardingPersistenceTask?.cancel()
    onboardingPersistenceTask = nil
    availableBoards = []
    authenticatedMembershipState = nil
    onboardingCreationRequestId = nil
    board = .empty
    profile = RentalProfile()
    onboardingMessages = []
    localShortlistsByBoard = [:]
    localQuestionsByBoard = [:]
    localActivityByBoard = [:]
    localMembersByBoard = [:]
    localChatMessagesByBoard = [:]
    advisorHistoryByListingID = [:]
    advisorChecklistByListingID = [:]
    advisorInquiriesByListingID = [:]
    advisorTourNotesByListingID = [:]
    advisorError = nil
    localBoardsById = [:]
    localProfilesByBoard = [:]
    pendingListingCreatesByBoard = [:]
    pendingLocalListingRemovalIDs = []
    pendingServerListingRemovalIDsByBoard = [:]
    serverListingIDByLocalID = [:]
    removedServerListingIDsByBoard = [:]
    removedListingIdentityKeysByBoard = [:]
    recentlyDeletedPurgeBoardIDs = []
    listingInventory = []
    listingInventoryNextCursor = nil
    listingInventoryHasMore = false
    listingInventoryError = nil
    pendingSharedListingImport = nil
    HomeboardSharedImportStore.clearAccountData()
    boardTab = .board
    boardError = nil
    boardFeedback = nil
    inviteFeedback = nil
  }

  func markLegacyProjectIgnored() {
    boardFeedback = "Use HomeboardNative as the active iOS app. HomeboardIOS is legacy scratch work."
  }

  func addManualListing(
    title: String,
    location: String,
    priceLine: String,
    commuteLine: String,
    summary: String,
    fitLabel: String,
    sourceURL: String = "",
    listingScope: String = "unit",
    partialUnitParsing: Bool = false,
    groupNote: String = "",
    photoURL: String = "",
    unit: String = "",
    bedrooms: String = "",
    bathrooms: String = "",
    squareFeet: Int? = nil,
    availableDate: String? = nil,
    amenities: [String] = [],
    modelInsights: [HomeboardListingInsight] = [],
    address: String = "",
    latitude: Double? = nil,
    longitude: Double? = nil
  ) {
    let cleanedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedAddress = address.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedLocation = location.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedPrice = priceLine.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedCommute = commuteLine.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedSummary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedFit = fitLabel.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedURL = sourceURL.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedNote = groupNote.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedPhotoURL = photoURL.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedUnit = unit.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedBedrooms = bedrooms.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedBathrooms = bathrooms.trimmingCharacters(in: .whitespacesAndNewlines)
    var seenAmenities = Set<String>()
    let cleanedAmenities = amenities.compactMap { value -> String? in
      let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard !cleaned.isEmpty, seenAmenities.insert(cleaned).inserted else { return nil }
      return cleaned
    }
    var groundedModelInsights = modelInsights
    if partialUnitParsing,
       !groundedModelInsights.contains(where: { $0.label == "Partial unit availability" })
    {
      groundedModelInsights.insert(
        HomeboardListingInsight(
          category: "risk",
          label: "Partial unit availability",
          sentiment: -0.25,
          confidence: 1,
          evidence: "The saved building source may not include every current unit. Check the original page before deciding."
        ),
        at: 0
      )
    }
    groundedModelInsights = Array(groundedModelInsights.prefix(16))

    guard !cleanedTitle.isEmpty else {
      boardError = "Add a listing title before saving it to the board."
      return
    }

    boardError = nil
    boardFeedback = nil

    let listing = ListingPreview(
      title: cleanedTitle,
      address: cleanedAddress,
      location: cleanedLocation.isEmpty ? "Location still being verified" : cleanedLocation,
      priceLine: cleanedPrice.isEmpty ? "Price still being verified" : cleanedPrice,
      commuteLine: cleanedCommute.isEmpty ? "Commute still being verified" : cleanedCommute,
      summary: cleanedSummary.isEmpty ? "The group saved this as a live contender and still needs to inspect the details." : cleanedSummary,
      fitLabel: cleanedFit.isEmpty ? "Board pick" : cleanedFit,
      highlights: {
        var groupHighlights: [String] = []
        if let offer = SharedListingActiveOffer.detect(
          highlights: cleanedAmenities,
          summary: cleanedSummary,
          fitLabel: cleanedFit,
          priceLine: cleanedPrice,
          amenities: cleanedAmenities,
          title: cleanedTitle,
          modelInsights: groundedModelInsights
        ) {
          groupHighlights.append("\(offer.title) reduces monthly rent across the group")
        }
        if !cleanedBedrooms.isEmpty, cleanedBedrooms != "0" {
          groupHighlights.append("\(cleanedBedrooms) separate bedrooms for roommate privacy")
        }
        if !cleanedBathrooms.isEmpty, (Double(cleanedBathrooms) ?? 0) >= 2.0 {
          groupHighlights.append("\(cleanedBathrooms) bathrooms make shared morning routines easier")
        }
        for amenity in cleanedAmenities {
          let lower = amenity.lowercased()
          if lower.contains("laundry") || lower.contains("washer") || lower.contains("dryer") {
            if !groupHighlights.contains(where: { $0.contains("laundry") }) {
              groupHighlights.append("In-unit laundry for easy shared living")
            }
          } else if lower.contains("dish") {
            if !groupHighlights.contains(where: { $0.contains("Dishwasher") }) {
              groupHighlights.append("Dishwasher included in common kitchen")
            }
          } else if lower.contains("balcony") || lower.contains("terrace") || lower.contains("patio") || lower.contains("outdoor") {
            if !groupHighlights.contains(where: { $0.contains("outdoor") }) {
              groupHighlights.append("Private outdoor space for roommates to share")
            }
          } else if groupHighlights.count < 4 {
            groupHighlights.append(amenity)
          }
        }
        if !cleanedPrice.isEmpty, groupHighlights.count < 3 {
          groupHighlights.append("Target rent fits group budget (\(cleanedPrice))")
        }
        if groupHighlights.isEmpty {
          groupHighlights.append("Saved as an active contender for the group")
        }
        return Array(groupHighlights.prefix(4))
      }(),
      amenities: cleanedAmenities,
      modelInsights: groundedModelInsights,
      openRisks: {
        var groupChecks: [String] = []
        if partialUnitParsing {
          groupChecks.append("Unit availability is partial; check the original building page for current openings")
        }
        if cleanedBathrooms == "1" || (Double(cleanedBathrooms) ?? 0) == 1.0 {
          groupChecks.append("Single bathroom shared across roommates: align on morning routines")
        }
        groupChecks.append("Compare bedroom sizes to agree on an equitable rent split")
        groupChecks.append("Confirm total monthly share (including utilities) fits everyone's budget")
        if let availableDate, !availableDate.isEmpty {
          groupChecks.append("Check that \(availableDate) move-in fits everyone's current lease end dates")
        } else {
          groupChecks.append("Confirm target move-in date aligns with each roommate's schedule")
        }
        return Array(groupChecks.prefix(3))
      }(),
      status: "saved",
      sourceURL: cleanedURL,
      listingScope: listingScope,
      partialUnitParsing: partialUnitParsing,
      groupNote: cleanedNote,
      photoURL: cleanedPhotoURL,
      unit: cleanedUnit,
      bedrooms: cleanedBedrooms,
      bathrooms: cleanedBathrooms,
      squareFeet: squareFeet,
      availableDate: availableDate,
      latitude: latitude,
      longitude: longitude
    )

    let key = boardStorageKey()
    let identityKey = listingIdentityKey(listing)
    if board.shortlist.contains(where: { listingIdentityKey($0) == identityKey })
      || (localShortlistsByBoard[key] ?? []).contains(where: { listingIdentityKey($0) == identityKey })
    {
      boardFeedback = "That exact listing is already on this board."
      return
    }
    removedListingIdentityKeysByBoard[key]?.remove(identityKey)
    var items = localShortlistsByBoard[key] ?? []
    items.insert(listing, at: 0)
    localShortlistsByBoard[key] = items

    if authSession != nil,
       let boardId = board.id,
       !boardId.hasPrefix("local-"),
       !boardId.hasPrefix("preview-")
    {
      pendingListingCreatesByBoard[key, default: []].removeAll {
        listingIdentityKey($0) == identityKey
      }
      pendingListingCreatesByBoard[key, default: []].insert(listing, at: 0)
    }

    appendLocalActivity("\(account?.name ?? "A member") saved \(cleanedTitle) to the shortlist.")
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    boardFeedback = "\(cleanedTitle) was added to the shortlist."
    persist()

    if let boardId = board.id,
       pendingListingCreatesByBoard[key]?.contains(where: { $0.id == listing.id }) == true
    {
      enqueueListingUpload(localListingID: listing.id, boardId: boardId, storageKey: key)
    }
  }

  func updateManualListingStatus(id: ListingPreview.ID, status: String) {
    let cleanedStatus = status.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleanedStatus.isEmpty else { return }

    let key = boardStorageKey()
    var updatedTitle: String?
    if let index = localShortlistsByBoard[key]?.firstIndex(where: { $0.id == id }) {
      localShortlistsByBoard[key]?[index].status = cleanedStatus
      updatedTitle = localShortlistsByBoard[key]?[index].title
    }
    if let index = board.shortlist.firstIndex(where: { $0.id == id }) {
      board.shortlist[index].status = cleanedStatus
      updatedTitle = board.shortlist[index].title
    }
    guard let updatedTitle else { return }
    if let pendingIndex = pendingListingCreatesByBoard[key]?.firstIndex(where: { $0.id == id }) {
      pendingListingCreatesByBoard[key]?[pendingIndex].status = cleanedStatus
    }
    appendLocalActivity("\(account?.name ?? "A member") marked \(updatedTitle) as \(cleanedStatus.lowercased()).")
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    boardFeedback = "Listing status updated."
    persist()

    let resolvedID = serverListingIDByLocalID[id] ?? id
    let isPendingCreate = pendingListingCreatesByBoard[key]?.contains(where: { $0.id == id }) == true
    if let session = authSession,
       let boardId = board.id,
       !boardId.hasPrefix("local-"),
       !isPendingCreate
    {
      Task {
        do {
          let response = try await api.updateListing(
            accessToken: session.accessToken,
            boardId: boardId,
            listingId: resolvedID,
            status: serverListingStatus(cleanedStatus)
          )
          applyRemoteMutation(response, clearing: [.shortlist])
        } catch {
          boardError = readable(error)
        }
      }
    }
  }

  func updateManualListingNote(id: ListingPreview.ID, note: String) {
    let cleanedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
    let key = boardStorageKey()
    var updatedTitle: String?
    if let index = localShortlistsByBoard[key]?.firstIndex(where: { $0.id == id }) {
      localShortlistsByBoard[key]?[index].groupNote = cleanedNote
      updatedTitle = localShortlistsByBoard[key]?[index].title
    }
    if let index = board.shortlist.firstIndex(where: { $0.id == id }) {
      board.shortlist[index].groupNote = cleanedNote
      updatedTitle = board.shortlist[index].title
    }
    guard let updatedTitle else { return }
    if let pendingIndex = pendingListingCreatesByBoard[key]?.firstIndex(where: { $0.id == id }) {
      pendingListingCreatesByBoard[key]?[pendingIndex].groupNote = cleanedNote
    }
    appendLocalActivity("\(account?.name ?? "A member") updated the board note for \(updatedTitle).")
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    boardFeedback = "Listing note updated."
    persist()

    let resolvedID = serverListingIDByLocalID[id] ?? id
    let isPendingCreate = pendingListingCreatesByBoard[key]?.contains(where: { $0.id == id }) == true
    if let session = authSession,
       let boardId = board.id,
       !boardId.hasPrefix("local-"),
       !isPendingCreate
    {
      Task {
        do {
          let response = try await api.updateListing(accessToken: session.accessToken, boardId: boardId, listingId: resolvedID, note: cleanedNote)
          applyRemoteMutation(response, clearing: [.shortlist])
        } catch {
          boardError = readable(error)
        }
      }
    }
  }

  @discardableResult
  func addBoardUpdate(_ rawMessage: String) async -> Bool {
    let message = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !message.isEmpty, !isPostingBoardUpdate else { return false }

    let requestEpoch = sessionEpoch
    isPostingBoardUpdate = true
    defer {
      isPostingBoardUpdate = false
      persist()
    }

    boardError = nil
    boardFeedback = nil
    let temporaryID = "local-update-\(UUID().uuidString)"
    board.chatMessages.append(
      BoardMessage(
        id: temporaryID,
        role: "user",
        authorName: account?.name ?? authSession?.displayName ?? "You",
        content: message,
        createdAt: ISO8601DateFormatter().string(from: Date())
      )
    )
    storeCurrentBoardSnapshot()
    persist()

    guard let session = authSession,
          let boardId = board.id,
          !boardId.hasPrefix("local-"),
          !boardId.hasPrefix("preview-") else {
      boardFeedback = "Message added."
      return true
    }

    do {
      let response = try await api.addBoardUpdate(
        accessToken: session.accessToken,
        boardId: boardId,
        content: message
      )
      guard requestEpoch == sessionEpoch, authSession?.userId == session.userId, board.id == boardId else { return false }
      applyRemoteMutation(response, clearing: [.activity])
      boardFeedback = "Message sent."
      return true
    } catch {
      guard requestEpoch == sessionEpoch, authSession?.userId == session.userId, board.id == boardId else { return false }
      board.chatMessages.removeAll { $0.id == temporaryID }
      storeCurrentBoardSnapshot()
      boardError = "\(readable(error)) Your message was put back in the composer."
      return false
    }
  }

  func removeManualListing(id: ListingPreview.ID) {
    let key = boardStorageKey()
    let resolvedID = serverListingIDByLocalID[id] ?? id
    guard let listing =
      board.shortlist.first(where: { $0.id == resolvedID || $0.id == id })
      ?? localShortlistsByBoard[key]?.first(where: { $0.id == resolvedID || $0.id == id })
    else {
      boardError = "Homeboard could not find that listing on the current board."
      return
    }

    let identityKey = listingIdentityKey(listing)
    let remoteBoardID = board.id.flatMap { boardId -> String? in
      guard !boardId.hasPrefix("local-"), !boardId.hasPrefix("preview-") else { return nil }
      return boardId
    }
    if let remoteBoardID {
      removedListingIdentityKeysByBoard[remoteBoardID, default: []].insert(identityKey)
      if listing.listingId.isEmpty, serverListingIDByLocalID[id] == nil {
        pendingLocalListingRemovalIDs.insert(id)
      } else {
        removedServerListingIDsByBoard[remoteBoardID, default: []].insert(resolvedID)
        pendingServerListingRemovalIDsByBoard[remoteBoardID, default: []].insert(resolvedID)
      }
    }

    var recentlyDeletedListing = listing
    recentlyDeletedListing.deletedAt = ISO8601DateFormatter().string(from: Date())
    var recentlyDeleted = board.recentlyDeleted ?? []
    recentlyDeleted.removeAll { $0.id == resolvedID || $0.id == id }
    recentlyDeleted.insert(recentlyDeletedListing, at: 0)
    board.recentlyDeleted = recentlyDeleted

    board.shortlist.removeAll { $0.id == resolvedID || $0.id == id }
    localShortlistsByBoard[key]?.removeAll { $0.id == resolvedID || $0.id == id }
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    boardFeedback = "Listing moved to Recently Deleted."
    persist()

    guard authSession != nil, let boardId = remoteBoardID else { return }

    if listing.listingId.isEmpty, serverListingIDByLocalID[id] == nil {
      persist()
      return
    }

    enqueueServerListingRemoval(listingID: resolvedID, boardId: boardId)
  }

  func moveListingsToRecentlyDeleted(ids: Set<ListingPreview.ID>) {
    let existingIDs = Set(board.shortlist.map(\.id))
    let targets = ids.intersection(existingIDs)
    guard !targets.isEmpty else { return }
    for id in targets {
      removeManualListing(id: id)
    }
    boardFeedback = "Moved \(targets.count) listing\(targets.count == 1 ? "" : "s") to Recently Deleted."
    persist()
  }

  @discardableResult
  func restoreRecentlyDeletedListing(id: ListingPreview.ID) async -> Bool {
    guard let listing = (board.recentlyDeleted ?? []).first(where: { $0.id == id }) else {
      boardError = "Homeboard could not find that recently deleted listing."
      return false
    }
    let key = boardStorageKey()
    var resolvedID = serverListingIDByLocalID[id] ?? id
    let remoteBoardID = board.id.flatMap { boardId -> String? in
      guard !boardId.hasPrefix("local-"), !boardId.hasPrefix("preview-") else { return nil }
      return boardId
    }

    pendingLocalListingRemovalIDs.remove(id)
    pendingServerListingRemovalIDsByBoard[remoteBoardID ?? key]?.remove(resolvedID)
    removedServerListingIDsByBoard[remoteBoardID ?? key]?.remove(resolvedID)
    removedListingIdentityKeysByBoard[remoteBoardID ?? key]?.remove(listingIdentityKey(listing))

    guard let session = authSession, let boardId = remoteBoardID else {
      var restored = listing
      restored.deletedAt = nil
      board.recentlyDeleted?.removeAll { $0.id == id }
      if !board.shortlist.contains(where: { $0.id == id }) {
        board.shortlist.insert(restored, at: 0)
      }
      var local = localShortlistsByBoard[key] ?? []
      if !local.contains(where: { $0.id == id }) { local.insert(restored, at: 0) }
      localShortlistsByBoard[key] = local
      applyLocalBoardContributions()
      storeCurrentBoardSnapshot()
      boardFeedback = "Listing restored to the board."
      boardError = nil
      persist()
      return true
    }

    await listingUploadTask?.value
    resolvedID = serverListingIDByLocalID[id] ?? resolvedID
    do {
      let response = try await api.restoreListing(
        accessToken: session.accessToken,
        boardId: boardId,
        listingId: resolvedID
      )
      guard authSession?.userId == session.userId, board.id == boardId else { return false }
      applyRemoteMutation(response, clearing: [.shortlist])
      boardFeedback = "Listing restored to the board."
      boardError = nil
      return true
    } catch {
      boardError = readable(error)
      persist()
      return false
    }
  }

  @discardableResult
  func clearRecentlyDeletedListings() async -> Bool {
    guard !(board.recentlyDeleted ?? []).isEmpty else { return true }
    let key = boardStorageKey()
    guard let session = authSession,
          let boardId = board.id,
          !boardId.hasPrefix("local-"),
          !boardId.hasPrefix("preview-")
    else {
      board.recentlyDeleted = []
      localBoardsById[key]?.recentlyDeleted = []
      boardFeedback = "Recently Deleted cleared."
      boardError = nil
      storeCurrentBoardSnapshot()
      persist()
      return true
    }

    await listingUploadTask?.value
    do {
      let response = try await api.clearRecentlyDeleted(
        accessToken: session.accessToken,
        boardId: boardId
      )
      guard authSession?.userId == session.userId, board.id == boardId else { return false }
      let clearedLocalIDs = Set((board.recentlyDeleted ?? []).map(\.id))
      for listingID in clearedLocalIDs {
        if let pending = pendingListingCreatesByBoard[key]?.first(where: { $0.id == listingID }),
           let previewID = HomeboardSharedImportStore.previewImageID(from: pending.photoURL)
        {
          HomeboardSharedImportStore.discardPreviewImage(for: previewID)
        }
        pendingLocalListingRemovalIDs.remove(listingID)
        serverListingIDByLocalID.removeValue(forKey: listingID)
      }
      pendingListingCreatesByBoard[key]?.removeAll { clearedLocalIDs.contains($0.id) }
      localShortlistsByBoard[key]?.removeAll { clearedLocalIDs.contains($0.id) }
      removedServerListingIDsByBoard[boardId] = []
      removedListingIdentityKeysByBoard[boardId] = []
      applyRemoteMutation(response, clearing: [])
      boardFeedback = "Recently Deleted cleared."
      boardError = nil
      return true
    } catch {
      boardError = readable(error)
      persist()
      return false
    }
  }

  func purgeExpiredRecentlyDeletedListings() async {
    purgeExpiredLocalRecentlyDeletedListings()
    guard let session = authSession,
          let boardId = board.id,
          !boardId.hasPrefix("local-"),
          !boardId.hasPrefix("preview-")
    else {
      persist()
      return
    }
    try? await api.purgeExpiredRecentlyDeleted(
      accessToken: session.accessToken,
      boardId: boardId
    )
  }

  private func scheduleRecentlyDeletedPurge(boardId: String) {
    guard let session = authSession,
          !boardId.hasPrefix("local-"),
          !boardId.hasPrefix("preview-"),
          recentlyDeletedPurgeBoardIDs.insert(boardId).inserted
    else { return }

    Task { [weak self] in
      do {
        try await self?.api.purgeExpiredRecentlyDeleted(
          accessToken: session.accessToken,
          boardId: boardId
        )
      } catch {
        self?.recentlyDeletedPurgeBoardIDs.remove(boardId)
      }
    }
  }

  func addOpenQuestion(_ question: String) {
    _ = question
    boardError = nil
    boardFeedback = nil
    boardError = "Start a group decision from a saved place. It completes only after every member responds."
  }

  func submitBoardDecision(question: String, resolution: String? = nil) async -> Bool {
    _ = question
    _ = resolution
    boardError = nil
    boardFeedback = nil
    boardError = "Start a group decision from a saved place. It completes only after every member responds."
    return false
  }

  func removeOpenQuestion(_ question: String) {
    _ = question
    boardFeedback = nil
    boardError = "Group decisions cannot be removed by one member."
  }

  func resolveOpenQuestion(_ question: String, resolution: String) {
    _ = question
    _ = resolution
    boardFeedback = nil
    boardError = "One member cannot resolve a group decision. Everyone must respond."
  }

  func addManualMember(
    name: String,
    budgetLine: String,
    commuteLine: String,
    priorities: [String],
    dealbreakers: [String],
    neighborhoods: [String],
    status: String
  ) {
    let cleanedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleanedName.isEmpty else {
      boardError = "Add a member name before saving the profile."
      return
    }

    boardError = nil
    boardFeedback = nil

    let member = MemberPreferenceCard(
      name: cleanedName,
      budgetMax: number(from: budgetLine),
      budgetLine: budgetLine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Budget still open" : budgetLine.trimmingCharacters(in: .whitespacesAndNewlines),
      commuteDestination: commuteLine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? nil
        : commuteLine.trimmingCharacters(in: .whitespacesAndNewlines),
      commuteLine: commuteLine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Commute still open" : commuteLine.trimmingCharacters(in: .whitespacesAndNewlines),
      priorities: priorities.isEmpty ? ["still open"] : priorities,
      dealbreakers: dealbreakers,
      neighborhoods: neighborhoods,
      status: status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "profile building" : status.trimmingCharacters(in: .whitespacesAndNewlines)
    )

    let key = boardStorageKey()
    var members = localMembersByBoard[key] ?? board.members
    members.append(member)
    localMembersByBoard[key] = members

    appendLocalActivity("\(cleanedName) was added to the board with their own preferences.")
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    boardFeedback = "\(cleanedName) was added to the board."
    persist()

    if let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") {
      Task {
        do {
          let response = try await api.addMember(
            accessToken: session.accessToken,
            boardId: boardId,
            name: cleanedName,
            budgetMin: nil,
            budgetMax: number(from: budgetLine),
            stretchBudget: nil,
            commuteDestination: commuteLine.trimmingCharacters(in: .whitespacesAndNewlines),
            maxCommuteMinutes: nil
          )
          applyRemoteMutation(response, clearing: [.members, .activity])
        } catch {
          boardError = readable(error)
        }
      }
    }
  }

  func addCommutePoint(
    label: String,
    destination: String,
    access: String,
    preferredMinutes: Int,
    maximumMinutes: Int
  ) {
    let cleanedLabel = label.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanedDestination = destination.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleanedLabel.isEmpty else {
      boardError = "Give this commute point a short label."
      return
    }
    guard !cleanedDestination.isEmpty else {
      boardError = "Add a neighborhood or address for this commute point."
      return
    }

    let supportedAccess = ["car", "transit", "flexible"].contains(access)
      ? access
      : "flexible"
    let minimum = max(preferredMinutes, 0)
    let maximum = max(maximumMinutes, minimum + 5)
    let point = MemberPreferenceCard(
      name: cleanedLabel,
      budgetLine: "Additional commute point",
      commuteDestination: cleanedDestination,
      commuteAccess: supportedAccess,
      preferredCommuteMinutes: minimum,
      maxCommuteMinutes: maximum,
      commuteLine: "\(cleanedDestination) · ideal \(minimum)–\(maximum) min",
      priorities: ["commute"],
      dealbreakers: [],
      neighborhoods: [],
      status: "commute point"
    )

    boardError = nil
    boardFeedback = nil
    let key = boardStorageKey()
    var members = localMembersByBoard[key] ?? board.members
    members.append(point)
    localMembersByBoard[key] = members
    appendLocalActivity("\(cleanedLabel) was added as another commute point.")
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    boardFeedback = "\(cleanedLabel) was added to every listing comparison."
    persist()

    if let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") {
      Task {
        do {
          let response = try await api.addMember(
            accessToken: session.accessToken,
            boardId: boardId,
            name: cleanedLabel,
            budgetMin: nil,
            budgetMax: nil,
            stretchBudget: nil,
            commuteDestination: cleanedDestination,
            maxCommuteMinutes: maximum,
            roleLabel: "commute point",
            commuteAccess: supportedAccess,
            preferredCommuteMinutes: minimum
          )
          applyRemoteMutation(response, clearing: [.members, .activity])
        } catch {
          boardError = readable(error)
        }
      }
    }
  }

  func removeManualMember(id: MemberPreferenceCard.ID) {
    let key = boardStorageKey()
    var members = localMembersByBoard[key] ?? board.members
    let removedMember = members.first { $0.id == id }
    members.removeAll { $0.id == id }
    localMembersByBoard[key] = members
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    boardFeedback = removedMember?.status == "commute point"
      ? "Commute point removed from the board."
      : "Member removed from the board."
    persist()

    if let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") {
      Task {
        do {
          let response = try await api.removeMember(
            accessToken: session.accessToken,
            boardId: boardId,
            memberId: removedMember?.roommateId ?? id
          )
          applyRemoteMutation(response, clearing: [.members, .activity])
        } catch {
          boardError = readable(error)
        }
      }
    }
  }

  func updateManualMember(_ updatedMember: MemberPreferenceCard) {
    let key = boardStorageKey()
    var members = localMembersByBoard[key] ?? board.members
    guard let index = members.firstIndex(where: { $0.id == updatedMember.id }) else { return }
    members[index] = updatedMember
    localMembersByBoard[key] = members
    appendLocalActivity(
      updatedMember.status == "commute point"
        ? "\(updatedMember.name) commute point was updated."
        : "\(updatedMember.name) updated their board preferences."
    )
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    boardFeedback = updatedMember.status == "commute point"
      ? "\(updatedMember.name) now updates every listing comparison."
      : "\(updatedMember.name)’s preferences were updated."
    persist()

    if let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-"), let roommateId = updatedMember.roommateId {
      Task {
        do {
          let response = try await api.updateMember(
            accessToken: session.accessToken,
            boardId: boardId,
            memberId: roommateId,
            member: updatedMember
          )
          applyRemoteMutation(response, clearing: [.members, .activity])
        } catch {
          boardError = readable(error)
        }
      }
    }
  }

  func reactToListing(id: ListingPreview.ID, vote: String, note: String = "") {
    #if DEBUG
    if board.id?.hasPrefix("preview-") == true {
      guard let index = board.shortlist.firstIndex(where: { $0.id == id }) else { return }
      let name = account?.name ?? "You"
      board.shortlist[index].reactions.removeAll { $0.name == name }
      board.shortlist[index].reactions.append(
        ListingReaction(name: name, vote: vote, note: note.isEmpty ? nil : note)
      )
      localShortlistsByBoard[boardStorageKey()] = board.shortlist
      boardFeedback = "Preview reaction shared locally."
      return
    }
    #endif
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else {
      boardError = "Sign in to share reactions with the group."
      return
    }
    Task {
      do {
        let response = try await api.reactToListing(
          accessToken: session.accessToken,
          boardId: boardId,
          listingId: id,
          vote: vote,
          note: note.isEmpty ? nil : note
        )
        applyRemoteMutation(response, clearing: [.shortlist, .activity])
        boardFeedback = "Reaction shared."
      } catch {
        boardError = readable(error)
      }
    }
  }

  func commentOnListing(id: ListingPreview.ID, content rawContent: String) {
    let content = rawContent.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !content.isEmpty else { return }
    #if DEBUG
    if board.id?.hasPrefix("preview-") == true {
      guard let index = board.shortlist.firstIndex(where: { $0.id == id }) else { return }
      board.shortlist[index].comments.append(
        ListingComment(
          id: UUID().uuidString,
          name: account?.name ?? "You",
          content: content,
          createdAt: ISO8601DateFormatter().string(from: Date())
        )
      )
      localShortlistsByBoard[boardStorageKey()] = board.shortlist
      boardFeedback = "Preview comment shared locally."
      return
    }
    #endif
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else {
      boardError = "Sign in to share comments with the group."
      return
    }
    Task {
      do {
        let response = try await api.commentOnListing(
          accessToken: session.accessToken,
          boardId: boardId,
          listingId: id,
          content: content
        )
        applyRemoteMutation(response, clearing: [.shortlist, .activity])
        boardFeedback = "Comment shared."
      } catch {
        boardError = readable(error)
      }
    }
  }

  func rateListing(id: ListingPreview.ID, ratings: [String: Int]) {
    #if DEBUG
    if board.id?.hasPrefix("preview-") == true {
      guard let index = board.shortlist.firstIndex(where: { $0.id == id }) else { return }
      let userId = account?.id ?? "preview-sam"
      board.shortlist[index].ratings.removeAll { $0.userId == userId }
      board.shortlist[index].ratings.append(
        ListingDimensionRating(
          id: "preview-rating-\(userId)-\(id)",
          memberId: userId,
          userId: userId,
          name: account?.name ?? "You",
          values: ratings,
          updatedAt: ISO8601DateFormatter().string(from: Date())
        )
      )
      localShortlistsByBoard[boardStorageKey()] = board.shortlist
      boardFeedback = "Preview group fit updated locally."
      return
    }
    #endif
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else {
      boardError = "Sign in to share ratings with the group."
      return
    }
    Task {
      do {
        let response = try await api.rateListing(
          accessToken: session.accessToken,
          boardId: boardId,
          listingId: id,
          ratings: ratings
        )
        applyRemoteMutation(response, clearing: [.shortlist, .activity])
        boardFeedback = "Your group fit read was shared."
      } catch {
        boardError = readable(error)
      }
    }
  }

  func previewExternalListing(
    url: String,
    address: String?,
    unit: String?,
    price: Double?,
    bedrooms: Double?,
    bathrooms: Double?
  ) async throws -> ListingImportPreviewResponse {
    guard let session = authSession else {
      throw HomeboardAPIError.missingSession
    }
    return try await api.previewListingImport(
      accessToken: session.accessToken,
      url: url,
      address: address,
      unit: unit,
      price: price,
      bedrooms: bedrooms,
      bathrooms: bathrooms
    )
  }

  func confirmListingSource(id: ListingPreview.ID, url: String, label: String? = nil) {
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else {
      boardError = "Sign in to confirm an exact listing source."
      return
    }
    Task {
      do {
        let response = try await api.attachListingSource(
          accessToken: session.accessToken,
          boardId: boardId,
          listingId: id,
          url: url,
          label: label
        )
        applyRemoteMutation(response, clearing: [.shortlist, .activity])
        boardFeedback = "Exact listing source confirmed."
      } catch {
        boardError = readable(error)
      }
    }
  }

  func openListingSource(_ source: ListingSourceLink) {
    guard
      let sourceId = source.catalogSourceId,
      let session = authSession,
      let boardId = board.id,
      !boardId.hasPrefix("local-")
    else { return }

    Task {
      do {
        let response = try await api.markListingSourceOpened(
          accessToken: session.accessToken,
          boardId: boardId,
          sourceId: sourceId
        )
        applyRemoteMutation(response, clearing: [])
      } catch {
        boardError = readable(error)
      }
    }
  }

  func attestListingSource(_ source: ListingSourceLink) {
    guard
      let sourceId = source.catalogSourceId,
      let session = authSession,
      let boardId = board.id,
      !boardId.hasPrefix("local-")
    else {
      boardError = "Sign in to confirm a listing source."
      return
    }

    Task {
      do {
        let response = try await api.attestListingSource(
          accessToken: session.accessToken,
          boardId: boardId,
          sourceId: sourceId
        )
        applyRemoteMutation(response, clearing: [.activity])
        boardFeedback = "Your exact-listing confirmation was counted."
      } catch {
        boardError = readable(error)
      }
    }
  }

  func reportListingSource(
    _ source: ListingSourceLink,
    reason: String,
    details: String = ""
  ) {
    guard
      let sourceId = source.catalogSourceId,
      let session = authSession,
      let boardId = board.id,
      !boardId.hasPrefix("local-")
    else {
      boardError = "Sign in to report a listing source."
      return
    }

    Task {
      do {
        let response = try await api.reportListingSource(
          accessToken: session.accessToken,
          boardId: boardId,
          sourceId: sourceId,
          reason: reason,
          details: details.isEmpty ? nil : details
        )
        applyRemoteMutation(response, clearing: [.activity])
        boardFeedback = "The source was removed from discovery and sent to review."
      } catch {
        boardError = readable(error)
      }
    }
  }

  func verifyListing(id: ListingPreview.ID, status: String, note: String = "") {
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else {
      boardError = "Sign in to update listing availability."
      return
    }
    Task {
      do {
        let response = try await api.verifyListing(
          accessToken: session.accessToken,
          boardId: boardId,
          listingId: id,
          status: status,
          note: note.isEmpty ? nil : note
        )
        applyRemoteMutation(response, clearing: [.shortlist, .activity])
        boardFeedback = "Listing verification updated."
      } catch {
        boardError = readable(error)
      }
    }
  }

  func reviewListing(
    id: ListingPreview.ID,
    tourIntent: String,
    interiorAppeal: Int?,
    naturalLight: String,
    mainConcern: String,
    sourceViewed: Bool
  ) {
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else {
      boardError = "Sign in to share a listing review."
      return
    }
    Task {
      do {
        let response = try await api.reviewListing(
          accessToken: session.accessToken,
          boardId: boardId,
          listingId: id,
          tourIntent: tourIntent,
          interiorAppeal: interiorAppeal,
          naturalLight: naturalLight,
          mainConcern: mainConcern.isEmpty ? nil : mainConcern,
          sourceViewed: sourceViewed
        )
        applyRemoteMutation(response, clearing: [.shortlist, .activity])
        boardFeedback = "Your quick review was shared."
      } catch {
        boardError = readable(error)
      }
    }
  }

  func voteOnListingDecision(id: ListingPreview.ID, type: String, choice: String) async -> Bool {
    boardError = nil
    boardFeedback = nil
    guard let listing = board.shortlist.first(where: { $0.id == id }) else {
      boardError = "Save this place to the shortlist before starting a poll."
      return false
    }
    guard !listing.listingId.isEmpty else {
      boardError = "This place is still syncing. Try your vote again in a moment."
      return false
    }
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else {
      boardError = "Sign in to vote on this decision."
      return false
    }
    do {
      let response = try await api.voteOnListingDecision(
        accessToken: session.accessToken,
        boardId: boardId,
        listingId: id,
        type: type,
        choice: choice
      )
      guard board.id == boardId else { return false }
      applyRemoteMutation(response, clearing: [.shortlist, .activity])
      boardFeedback = "Your vote was shared."
      return true
    } catch {
      guard board.id == boardId else { return false }
      boardError = readable(error)
      return false
    }
  }

  func moveListing(id: ListingPreview.ID, to workflowStatus: String) {
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else {
      boardError = "Sign in to update the listing workflow."
      return
    }
    Task {
      do {
        let response = try await api.updateListing(
          accessToken: session.accessToken,
          boardId: boardId,
          listingId: id,
          workflowStatus: workflowStatus
        )
        applyRemoteMutation(response, clearing: [.shortlist, .activity])
        boardFeedback = "Listing moved to \(workflowStatus.replacingOccurrences(of: "_", with: " "))."
      } catch {
        boardError = readable(error)
      }
    }
  }

  func trackComparisonOpened(listingIds: [String]) {
    guard listingIds.count >= 2,
          let session = authSession,
          let boardId = board.id,
          !boardId.hasPrefix("local-") else { return }
    Task {
      try? await api.trackListingComparison(
        accessToken: session.accessToken,
        boardId: boardId,
        listingIds: Array(listingIds.prefix(3))
      )
    }
  }

  func leaveCurrentBoard() {
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else { return }
    Task {
      do {
        try await api.leaveBoard(accessToken: session.accessToken, boardId: boardId)
        guard authSession?.userId == session.userId, board.id == boardId else { return }
        availableBoards.removeAll { $0.id == boardId }
        board = .empty
        if let next = availableBoards.first { await openBoard(id: next.id) }
        else {
          authenticatedMembershipState = .authenticatedNoMembership
          currentScreen = .onboarding
        }
        persist()
      } catch {
        guard authSession?.userId == session.userId else { return }
        boardError = readable(error)
      }
    }
  }

  func deleteCurrentBoard() {
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else { return }
    Task {
      do {
        try await api.deleteBoard(accessToken: session.accessToken, boardId: boardId)
        guard authSession?.userId == session.userId, board.id == boardId else { return }
        availableBoards.removeAll { $0.id == boardId }
        board = .empty
        if let next = availableBoards.first { await openBoard(id: next.id) }
        else {
          authenticatedMembershipState = .authenticatedNoMembership
          currentScreen = .onboarding
        }
        persist()
      } catch {
        guard authSession?.userId == session.userId else { return }
        boardError = readable(error)
      }
    }
  }

  func uploadListingImage(_ data: Data) async -> String? {
    guard let session = authSession, let boardId = board.id, !boardId.hasPrefix("local-") else { return nil }
    do {
      let url = try await api.uploadListingImage(accessToken: session.accessToken, boardId: boardId, data: data)
      guard authSession?.userId == session.userId, board.id == boardId else { return nil }
      return url
    } catch {
      guard authSession?.userId == session.userId else { return nil }
      boardError = readable(error)
      return nil
    }
  }

  func registerPushToken(_ token: String) {
    UserDefaults.standard.set(token, forKey: pushTokenKey)
    guard let session = authSession else { return }
    Task {
      do {
        try await api.registerPushDevice(accessToken: session.accessToken, token: token)
      } catch {
        guard authSession?.userId == session.userId else { return }
        boardError = readable(error)
      }
    }
  }

  func uploadPendingNativeDiagnostics() async {
    guard let session = authSession else { return }
    let payloads = PendingNativeDiagnostics.snapshot()
    guard !payloads.isEmpty else { return }
    do {
      try await api.uploadNativeDiagnostics(
        accessToken: session.accessToken,
        payloads: payloads
      )
      PendingNativeDiagnostics.removeFirst(payloads.count)
    } catch {
      // Keep diagnostics queued for the next authenticated launch.
    }
  }

  func submitBugReport(
    description: String,
    currentScreen: String,
    deviceKind: String
  ) async throws -> MobileBugReportResponse {
    guard let session = authSession else {
      throw HomeboardAPIError.missingSession
    }

    return try await api.submitBugReport(
      accessToken: session.accessToken,
      description: description,
      currentScreen: currentScreen,
      boardId: board.id,
      deviceKind: deviceKind,
      boardLoaded: board.id != nil,
      boardCount: availableBoards.count,
      memberCount: board.members.count,
      savedListingCount: board.shortlist.count,
      shareDiagnostics: HomeboardShareReportDiagnostics.exportText()
    )
  }

  func openBoardChatNotification(boardId: String) async {
    guard authSession != nil else { return }
    await openBoard(id: boardId)
    openBoardTab(.updates)
  }

  func handleIncomingURL(_ url: URL) {
    let components = url.pathComponents.filter { $0 != "/" }
    let queryCode = URLComponents(url: url, resolvingAgainstBaseURL: false)?
      .queryItems?
      .first(where: { $0.name == "invite" || $0.name == "code" })?
      .value

    if url.scheme == "homeboard", url.host == "preview" || url.host == "debug" {
      openPreviewBoard()
      let tab = (url.host == "preview" ? components.first : components.dropFirst().first) ?? "shortlist"
      switch tab {
      case "shortlist":
        openBoardTab(.shortlist)
      case "updates":
        openBoardTab(.updates)
      default:
        openBoardTab(.board)
      }
      return
    }

    if let pairing = MacDevicePairingRequest(url: url) {
      pendingMacPairingRequest = pairing
      return
    }

    if url.scheme == "homeboard", url.host == "share" {
      let sourceURL = URLComponents(
        url: url,
        resolvingAgainstBaseURL: false
      )?
      .queryItems?
      .first(where: { $0.name == "url" })?
      .value
      if let sourceURL {
        pendingSharedListingImport = HomeboardSharedImportStore.PendingImport(url: sourceURL)
      }
      return
    }

    if url.scheme == "homeboard", url.host == "import" {
      consumeSharedListingImport()
      return
    }

    let code: String?
    if url.scheme == "homeboard", url.host == "invite" {
      code = components.first
    } else if let inviteIndex = components.firstIndex(of: "invite"), components.indices.contains(inviteIndex + 1) {
      code = components[inviteIndex + 1]
    } else {
      code = queryCode
    }
    guard let code else { return }
    let inviteCode = normalizedInviteToken(from: code)
    guard !inviteCode.isEmpty else { return }

    // Preserve the newest incoming link immediately, then serialize its board
    // acceptance after session bootstrap so a cold launch cannot load the
    // account's first board over the invited board.
    pendingInviteCode = inviteCode
    persist()
    Task {
      await bootstrap()
      guard pendingInviteCode == inviteCode else { return }
      await startInviteJoin(code: inviteCode)
    }
  }

  func approveMacPairing(_ pairing: MacDevicePairingRequest) async throws -> String {
    guard let session = authSession else {
      throw HomeboardAPIError.missingSession
    }
    let response = try await api.approveMacDevicePairing(
      accessToken: session.accessToken,
      request: pairing
    )
    pendingMacPairingRequest = nil
    return response.deviceName
  }

  func consumeSharedListingImport() {
    let imports = HomeboardSharedImportStore.all()
    guard !imports.isEmpty else { return }

    guard let currentBoardId = board.id else {
      pendingSharedListingImport = imports.first
      return
    }

    var needsReview = pendingSharedListingImport
    var deferred: [HomeboardSharedImportStore.PendingImport] = []
    for shared in imports {
      guard shared.boardId == nil || shared.boardId == currentBoardId else {
        deferred.append(shared)
        continue
      }

      currentScreen = .board
      boardTab = .board
      if commitSharedListingImportIfComplete(shared) {
        let keepsCapturedPreview = HomeboardSharedImportStore.hasPreviewImage(for: shared.id)
        HomeboardSharedImportStore.remove(
          id: shared.id,
          preservingPreviewImage: keepsCapturedPreview
        )
      } else {
        if needsReview == nil {
          needsReview = shared
        } else {
          deferred.append(shared)
        }
      }
    }
    pendingSharedListingImport = needsReview

    if !deferred.isEmpty {
      if needsReview == nil,
         let destinationBoardId = deferred.first?.boardId,
         destinationBoardId != currentBoardId,
         availableBoards.contains(where: { $0.id == destinationBoardId })
      {
        Task {
          await openBoard(id: destinationBoardId)
          guard board.id == destinationBoardId else { return }
          boardTab = .board
          consumeSharedListingImport()
        }
      }
    }
  }

  func resolvePendingSharedListingImport() {
    if let pendingSharedListingImport {
      HomeboardSharedImportStore.remove(id: pendingSharedListingImport.id)
    }
    pendingSharedListingImport = nil
  }

  private func applyListingCreateResponse(
    _ response: MobileBoardLoadResponse,
    localListingID: ListingPreview.ID,
    boardId: String,
    storageKey: String
  ) {
    localShortlistsByBoard[storageKey]?.removeAll { $0.id == localListingID }
    if let serverListingID = matchingServerListingID(
      forLocalID: localListingID,
      in: response.board
    ) {
      serverListingIDByLocalID[localListingID] = serverListingID
    }
    guard board.id == boardId else {
      persist()
      return
    }
    board = boardByApplyingRemovalTombstones(response.board, storageKey: storageKey)
    profile = RentalProfile(remote: response.profile)
    applyLocalBoardContributions()
    storeCurrentBoardSnapshot()
    persist()
  }

  private func resumePendingListingMutations(boardId: String) {
    guard authSession != nil else { return }
    let storageKey = boardId
    for listing in pendingListingCreatesByBoard[storageKey] ?? [] {
      enqueueListingUpload(
        localListingID: listing.id,
        boardId: boardId,
        storageKey: storageKey
      )
    }
    for listingID in pendingServerListingRemovalIDsByBoard[boardId] ?? [] {
      enqueueServerListingRemoval(listingID: listingID, boardId: boardId)
    }
  }

  private func enqueueListingUpload(
    localListingID: String,
    boardId: String,
    storageKey: String
  ) {
    let previousUpload = listingUploadTask
    listingUploadTask = Task { [weak self] in
      await previousUpload?.value
      guard let self else { return }
      await self.uploadPendingListing(
        localListingID: localListingID,
        boardId: boardId,
        storageKey: storageKey
      )
    }
  }

  private func uploadPendingListing(
    localListingID: String,
    boardId: String,
    storageKey: String
  ) async {
    guard
      let session = authSession,
      let listing = pendingListingCreatesByBoard[storageKey]?.first(where: {
        $0.id == localListingID
      })
    else { return }

    do {
      var listingForUpload = listing
      if let previewID = HomeboardSharedImportStore.previewImageID(from: listing.photoURL) {
        if let previewData = HomeboardSharedImportStore.previewImageData(for: previewID) {
          let uploadedURL = try await api.uploadListingImage(
            accessToken: session.accessToken,
            boardId: boardId,
            data: previewData
          )
          listingForUpload.photoURL = uploadedURL
          replacePendingListingPhoto(
            localListingID: localListingID,
            storageKey: storageKey,
            photoURL: uploadedURL
          )
          HomeboardSharedImportStore.discardPreviewImage(for: previewID)
        } else {
          listingForUpload.photoURL = ""
          replacePendingListingPhoto(
            localListingID: localListingID,
            storageKey: storageKey,
            photoURL: ""
          )
        }
      }
      let response = try await api.addListing(
        accessToken: session.accessToken,
        boardId: boardId,
        listing: listingForUpload
      )
      guard !Task.isCancelled, authSession?.userId == session.userId, board.id == boardId else {
        return
      }
      guard let serverListingID = matchingServerListingID(for: listingForUpload, in: response.board) else {
        boardError = "The listing reached the board, but Homeboard could not reconcile its saved copy. It will retry safely."
        persist()
        return
      }

      let latestLocalListing = pendingListingCreatesByBoard[storageKey]?.first(where: {
        $0.id == localListingID
      }) ?? listing
      serverListingIDByLocalID[localListingID] = serverListingID

      if pendingLocalListingRemovalIDs.remove(localListingID) != nil {
        pendingListingCreatesByBoard[storageKey]?.removeAll { $0.id == localListingID }
        localShortlistsByBoard[storageKey]?.removeAll { $0.id == localListingID }
        removedServerListingIDsByBoard[boardId, default: []].insert(serverListingID)
        pendingServerListingRemovalIDsByBoard[boardId, default: []].insert(serverListingID)
        persist()

        do {
          let removalResponse = try await api.archiveListing(
            accessToken: session.accessToken,
            boardId: boardId,
            listingId: serverListingID
          )
          pendingServerListingRemovalIDsByBoard[boardId]?.remove(serverListingID)
          if board.id == boardId {
            applyRemoteMutation(removalResponse, clearing: [.shortlist])
            boardFeedback = "Listing moved to Recently Deleted."
          } else {
            persist()
          }
        } catch {
          boardError = "\(readable(error)) Homeboard kept it hidden and will retry the removal."
          persist()
        }
        return
      }

      var reconciledResponse = response
      let statusChangedWhileSaving = latestLocalListing.status.lowercased() != "saved"
      let noteChangedWhileSaving = latestLocalListing.groupNote != listing.groupNote
        || !latestLocalListing.groupNote.isEmpty
      if statusChangedWhileSaving || noteChangedWhileSaving {
        reconciledResponse = try await api.updateListing(
          accessToken: session.accessToken,
          boardId: boardId,
          listingId: serverListingID,
          status: statusChangedWhileSaving
            ? serverListingStatus(latestLocalListing.status)
            : nil,
          note: noteChangedWhileSaving ? latestLocalListing.groupNote : nil
        )
      }

      pendingListingCreatesByBoard[storageKey]?.removeAll { $0.id == localListingID }
      removedServerListingIDsByBoard[boardId]?.remove(serverListingID)
      removedListingIdentityKeysByBoard[boardId]?.remove(
        listingIdentityKey(listingForUpload)
      )
      applyListingCreateResponse(
        reconciledResponse,
        localListingID: localListingID,
        boardId: boardId,
        storageKey: storageKey
      )
      boardFeedback = "\(listing.title) is shared with the board."
    } catch {
      guard !Task.isCancelled, authSession?.userId == session.userId else { return }
      boardError = "\(readable(error)) The listing is still saved on this device and will retry."
      persist()
    }
  }

  private func replacePendingListingPhoto(
    localListingID: ListingPreview.ID,
    storageKey: String,
    photoURL: String
  ) {
    if let index = pendingListingCreatesByBoard[storageKey]?.firstIndex(where: {
      $0.id == localListingID
    }) {
      pendingListingCreatesByBoard[storageKey]?[index].photoURL = photoURL
    }
    if let index = localShortlistsByBoard[storageKey]?.firstIndex(where: {
      $0.id == localListingID
    }) {
      localShortlistsByBoard[storageKey]?[index].photoURL = photoURL
    }
    if let index = board.shortlist.firstIndex(where: { $0.id == localListingID }) {
      board.shortlist[index].photoURL = photoURL
    }
    storeCurrentBoardSnapshot()
    persist()
  }

  private func enqueueServerListingRemoval(listingID: String, boardId: String) {
    let previousUpload = listingUploadTask
    listingUploadTask = Task { [weak self] in
      await previousUpload?.value
      guard let self, let session = self.authSession else { return }
      guard self.pendingServerListingRemovalIDsByBoard[boardId]?.contains(listingID) == true else {
        return
      }
      do {
        let response = try await self.api.archiveListing(
          accessToken: session.accessToken,
          boardId: boardId,
          listingId: listingID
        )
        guard !Task.isCancelled,
              self.authSession?.userId == session.userId,
              self.board.id == boardId else { return }
        self.pendingServerListingRemovalIDsByBoard[boardId]?.remove(listingID)
        if self.board.id == boardId {
          self.applyRemoteMutation(response, clearing: [.shortlist])
        } else {
          self.persist()
        }
      } catch {
        guard !Task.isCancelled, self.authSession?.userId == session.userId else { return }
        self.boardError = "\(self.readable(error)) Homeboard kept it hidden and will retry the removal."
        self.persist()
      }
    }
  }

  @discardableResult
  private func commitSharedListingImportIfComplete(
    _ shared: HomeboardSharedImportStore.PendingImport
  ) -> Bool {
    guard !shared.requiresReview else { return false }
    guard
      let address = shared.address?.trimmingCharacters(in: .whitespacesAndNewlines),
      !address.isEmpty
    else {
      return false
    }
    let isBuildingReference = shared.listingScope?.lowercased() == "building"
      && shared.unit?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
    guard isBuildingReference
      || (shared.price != nil && shared.bedrooms != nil && shared.bathrooms != nil)
    else { return false }

    let sourceURL = shared.canonicalURL ?? shared.url
    let normalizedUnit = shared.unit?
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .uppercased() ?? ""
    let alreadySaved = board.shortlist.contains {
      let existing = $0.sourceURL.trimmingCharacters(in: .whitespacesAndNewlines)
      let existingUnit = $0.unit
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .uppercased()
      return !existing.isEmpty
        && existing == sourceURL
        && existingUnit == normalizedUnit
    }
    if alreadySaved {
      HomeboardSharedImportStore.discardPreviewImage(for: shared.id)
      boardFeedback = "That exact source is already on this board."
      pendingSharedListingImport = nil
      return true
    }

    let formatted: (Double) -> String = { value in
      value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }
    let addressLocation = address
      .split(separator: ",", maxSplits: 1)
      .dropFirst()
      .first?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let location = shared.neighborhood
      ?? shared.city
      ?? addressLocation
      ?? "Location still being verified"
    let capturedPageTitle = shared.pageTitle?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let displayTitle = capturedPageTitle.isEmpty ? address : capturedPageTitle
    let unit = shared.unit?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let remoteImage = shared.imageURL?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let photoURL = HomeboardSharedImportStore.hasPreviewImage(for: shared.id)
        ? HomeboardSharedImportStore.previewImageReference(for: shared.id)
        : remoteImage
    var modelInsights = shared.modelInsights
    if (isBuildingReference || shared.partialUnitParsing),
       !modelInsights.contains(where: { $0.label == "Partial unit availability" })
    {
      modelInsights.insert(
        HomeboardListingInsight(
          category: "risk",
          label: "Partial unit availability",
          sentiment: -0.25,
          confidence: 1,
          evidence: "This building-level source may not include every current unit. Check the original page before deciding."
        ),
        at: 0
      )
    }
    let summary = shared.summary
      ?? (isBuildingReference
        ? "Saved as a building reference. Unit availability may be partial; check the original source for current openings."
        : "Collected from \(shared.sourceName ?? "the original listing source").")

    addManualListing(
      title: displayTitle,
      location: location,
      priceLine: shared.price.map { "$\(Int($0.rounded()).formatted()) / month" } ?? "",
      commuteLine: "Compare group commutes",
      summary: summary,
      fitLabel: isBuildingReference
        ? "Building reference"
        : "New from \(shared.sourceName ?? "shared link")",
      sourceURL: sourceURL,
      listingScope: isBuildingReference ? "building" : "unit",
      partialUnitParsing: isBuildingReference || shared.partialUnitParsing,
      photoURL: photoURL,
      unit: unit,
      bedrooms: shared.bedrooms.map(formatted) ?? "",
      bathrooms: shared.bathrooms.map(formatted) ?? "",
      squareFeet: shared.squareFeet,
      availableDate: shared.availableDate,
      amenities: shared.amenities,
      modelInsights: modelInsights,
      address: address,
      latitude: shared.latitude,
      longitude: shared.longitude
    )
    pendingSharedListingImport = nil
    pendingMacPairingRequest = nil
    return boardError == nil
  }

  #if DEBUG
  private func handleDebugURL(_ components: [String]) {
    guard let first = components.first else { return }
    switch first {
    case "welcome":
      let page = Int(components.dropFirst().first ?? "0") ?? 0
      UserDefaults.standard.set(min(max(page, 0), 1), forKey: "homeboard.debug.welcomePage")
      if isGuestPreview {
        clearGuestPreviewState()
      }
      currentScreen = .welcome
      persist()
    case "preview":
      openPreviewBoard()
      if let tabName = components.dropFirst().first {
        switch tabName {
        case "search", "map", "board":
          openBoardTab(.board)
        case "shortlist":
          openBoardTab(.shortlist)
        case "updates":
          openBoardTab(.updates)
        default:
          break
        }
      }
    default:
      break
    }
  }
  #endif

  private enum LocalContributionKind: Hashable {
    case shortlist
    case questions
    case activity
    case members
  }

  private func applyRemoteMutation(_ response: MobileBoardLoadResponse, clearing kinds: Set<LocalContributionKind>) {
    guard authSession != nil, response.board.id == board.id else { return }
    let key = boardStorageKey()
    board = boardByApplyingRemovalTombstones(response.board, storageKey: key)
    profile = RentalProfile(remote: response.profile)
    if kinds.contains(.shortlist) {
      localShortlistsByBoard[key] = pendingListingCreatesByBoard[key] ?? []
    }
    if kinds.contains(.questions) { localQuestionsByBoard[key] = [] }
    if kinds.contains(.activity) { localActivityByBoard[key] = [] }
    if kinds.contains(.members) { localMembersByBoard[key] = [] }
    storeCurrentBoardSnapshot()
    persist()
  }

  private func boardWithDemoAdvisorEntitlement(_ remoteBoard: MobileBoard) -> MobileBoard {
    // Server entitlement is shared by the board, subscription API, and scan API.
    // Preview boards carry their own local demo entitlement.
    remoteBoard
  }

  private func boardByApplyingRemovalTombstones(
    _ remoteBoard: MobileBoard,
    storageKey: String
  ) -> MobileBoard {
    let removedIDs = removedServerListingIDsByBoard[storageKey] ?? []
    let removedIdentityKeys = removedListingIdentityKeysByBoard[storageKey] ?? []
    var filtered = boardWithDemoAdvisorEntitlement(remoteBoard)
    guard !removedIDs.isEmpty || !removedIdentityKeys.isEmpty else { return filtered }
    filtered.shortlist.removeAll {
      removedIDs.contains($0.id)
        || removedIdentityKeys.contains(listingIdentityKey($0))
    }
    return filtered
  }

  private func listingIdentityKey(_ listing: ListingPreview) -> String {
    let source = listing.sourceURL
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let unit = listing.unit
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
    if !source.isEmpty {
      return "source:\(source)|unit:\(unit)"
    }
    let title = listing.title
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    let location = listing.location
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    return "address:\(title)|unit:\(unit)|location:\(location)"
  }

  private func matchingServerListingID(
    for localListing: ListingPreview,
    in remoteBoard: MobileBoard
  ) -> String? {
    let source = localListing.sourceURL.trimmingCharacters(in: .whitespacesAndNewlines)
    let unit = localListing.unit.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if !source.isEmpty,
       let match = remoteBoard.shortlist.first(where: {
         $0.sourceURL.trimmingCharacters(in: .whitespacesAndNewlines) == source
           && $0.unit.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == unit
       })
    {
      return match.id
    }
    return remoteBoard.shortlist.first(where: {
      $0.title.caseInsensitiveCompare(localListing.title) == .orderedSame
        && $0.unit.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == unit
    })?.id
  }

  private func matchingServerListingID(
    forLocalID localListingID: String,
    in remoteBoard: MobileBoard
  ) -> String? {
    serverListingIDByLocalID[localListingID]
      ?? remoteBoard.shortlist.first(where: { $0.id == localListingID })?.id
  }

  private func readable(_ error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
  }

  private func readableAuthError(_ error: Error, email: String) -> String {
    let message = readable(error)
    let normalized = message.lowercased()
    if normalized.contains("email not confirmed") {
      pendingConfirmationEmail = email
      authMode = .signIn
      return "Confirm the email sent to \(email), then sign in. You can resend it below."
    }
    if normalized.contains("invalid login credentials") {
      return "That email and password do not match."
    }
    if normalized.contains("user already registered") {
      authMode = .signIn
      return "An account already exists for that email. Sign in instead."
    }
    if authSession != nil,
       (normalized.contains("could not reach homeboard")
        || normalized.contains("could not connect")
        || normalized.contains("timed out")) {
      return "You are signed in, but Homeboard's data service is offline. Start the backend, then tap Retry connection."
    }
    return message
  }

  private func serverListingStatus(_ status: String) -> String {
    switch status.lowercased() {
    case "saved": return "maybe"
    case "touring": return "toured"
    case "passed": return "rejected"
    case "top choice": return "interested"
    default: return status.lowercased()
    }
  }

  private func number(from text: String) -> Double? {
    Double(text.filter { $0.isNumber || $0 == "." })
  }

  private func isValidEmail(_ email: String) -> Bool {
    let pattern = #"^[A-Z0-9a-z._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"#
    return email.range(of: pattern, options: .regularExpression) != nil
  }

  private func buildBoard(from profile: RentalProfile) -> MobileBoard {
    let city = profile.city.trimmingCharacters(in: .whitespacesAndNewlines)
    let moveIn = profile.moveInDate.trimmingCharacters(in: .whitespacesAndNewlines)
    let groupSize = profile.groupSize <= 1 ? "1 renter" : "\(profile.groupSize) renters"
    let budgetLine = formattedBudgetLine(min: profile.budgetMin, max: profile.budgetMax)
    let commuteLine: String
    if profile.commuteAccess == "remote" {
      commuteLine = "Works remotely · commute not scored"
    } else if profile.commuteAccess == "skip" {
      commuteLine = "Commute not included"
    } else {
      commuteLine = profile.commuteTarget.isEmpty ? "Commute still flexible" : profile.commuteTarget
    }
    let readinessLine = profile.isBoardReady ? "Board brief ready" : "Profile still in progress"
    let progressLine = profile.isBoardReady
      ? "Core search constraints aligned"
      : "Missing: \(profile.missingFields.joined(separator: ", "))"
    let nextAction = profile.isBoardReady
      ? "Invite the rest of the group, then start comparing live listings against commute, neighborhood, and budget tradeoffs."
      : "Finish the missing profile fields so the board can move from rough preferences into real comparisons."

    let memberCard = MemberPreferenceCard(
      name: profile.name.isEmpty ? (account?.name ?? "You") : profile.name,
      budgetLine: budgetLine,
      commuteDestination: profile.commuteTarget.isEmpty ? nil : profile.commuteTarget,
      commuteAccess: profile.commuteAccess,
      preferredCommuteMinutes: Int(profile.minCommuteMinutes),
      maxCommuteMinutes: Int(profile.maxCommuteMinutes),
      commuteLine: "\(commuteLine)\(profile.minCommuteMinutes.isEmpty || profile.maxCommuteMinutes.isEmpty ? "" : ", ideal \(profile.minCommuteMinutes)–\(profile.maxCommuteMinutes) min")",
      priorities: profile.priorities.isEmpty ? ["commute", "budget"] : profile.priorities,
      dealbreakers: profile.dealbreakers.isEmpty ? ["unclear fees"] : profile.dealbreakers,
      neighborhoods: profile.neighborhoods.isEmpty ? ["Open"] : profile.neighborhoods,
      status: profile.isBoardReady ? "profile complete" : "profile building"
    )

    return MobileBoard(
      id: nil,
      title: city.isEmpty ? "New homeboard" : "\(city) homeboard",
      city: city.isEmpty ? "City still open" : city,
      moveInTimeline: moveIn.isEmpty ? "Move-in still open" : moveIn,
      groupSize: groupSize,
      budgetLine: budgetLine,
      commuteTargets: commuteTargets(from: profile),
      readiness: readinessLine,
      completionLine: progressLine,
      nextBestAction: nextAction,
      inviteCode: "",
      recentActivity: activityFeed(for: profile, member: memberCard),
      chatMessages: [],
      openQuestions: openQuestions(for: profile),
      members: [memberCard],
      shortlist: [],
      invitations: []
    )
  }

  private func formattedBudgetLine(min: String, max: String) -> String {
    let trimmedMin = min.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedMax = max.trimmingCharacters(in: .whitespacesAndNewlines)

    if !trimmedMin.isEmpty && !trimmedMax.isEmpty {
      return "$\(trimmedMin)–$\(trimmedMax)"
    }

    if !trimmedMax.isEmpty {
      return "Up to $\(trimmedMax)"
    }

    if !trimmedMin.isEmpty {
      return "From $\(trimmedMin)"
    }

    return "Budget still open"
  }

  private func commuteTargets(from profile: RentalProfile) -> [String] {
    let commute = profile.commuteTarget.trimmingCharacters(in: .whitespacesAndNewlines)
    let minMinutes = profile.minCommuteMinutes.trimmingCharacters(in: .whitespacesAndNewlines)
    let maxMinutes = profile.maxCommuteMinutes.trimmingCharacters(in: .whitespacesAndNewlines)

    if commute.isEmpty && minMinutes.isEmpty && maxMinutes.isEmpty {
      return []
    }

    if commute.isEmpty {
      if !minMinutes.isEmpty && !maxMinutes.isEmpty {
        return ["Ideal \(minMinutes)–\(maxMinutes) min"]
      }
      return [maxMinutes.isEmpty ? "At least \(minMinutes) min" : "Max \(maxMinutes) min"]
    }

    if minMinutes.isEmpty || maxMinutes.isEmpty {
      return [commute]
    }

    return ["\(commute) · ideal \(minMinutes)–\(maxMinutes) min"]
  }

  private func activityFeed(for profile: RentalProfile, member: MemberPreferenceCard) -> [String] {
    var items: [String] = []

    if !profile.city.isEmpty {
      items.append("\(member.name) anchored the search around \(profile.city).")
    }

    if !profile.moveInDate.isEmpty {
      items.append("The board is targeting a \(profile.moveInDate) move-in.")
    }

    if !member.budgetLine.isEmpty && member.budgetLine != "Budget still open" {
      items.append("Budget was framed around \(member.budgetLine.lowercased()).")
    }

    if !profile.priorities.isEmpty {
      items.append("Top priorities now read: \(profile.priorities.joined(separator: ", ")).")
    }

    if !profile.mustHaves.isEmpty {
      items.append("Must-haves include \(profile.mustHaves.joined(separator: ", ")).")
    }

    return items.isEmpty
      ? ["The board exists, but the group brief still needs real constraints."]
      : items
  }

  private func openQuestions(for profile: RentalProfile) -> [String] {
    if !profile.missingFields.isEmpty {
      return profile.missingFields.map { "Still needed: \($0)." }
    }

    var questions: [String] = []

    if profile.neighborhoods.isEmpty {
      questions.append("Which neighborhoods deserve the first serious pass?")
    } else {
      questions.append("Are \(profile.neighborhoods.joined(separator: ", ")) the final neighborhoods, or just the first pass?")
    }

    if profile.commuteTarget.isEmpty {
      questions.append("Whose commute should anchor the search first?")
    } else {
      questions.append("How much extra time is acceptable if the better neighborhood wins?")
    }

    questions.append("Which listings should survive into the first real shortlist?")
    return questions
  }

  private func normalized(profile: RentalProfile) -> RentalProfile {
    var next = profile
    next.priorities = dedupe(next.priorities)
    next.mustHaves = dedupe(next.mustHaves)
    next.dealbreakers = dedupe(next.dealbreakers)
    next.neighborhoods = dedupe(next.neighborhoods)
    return next
  }

  private func buildOnboardingReply(previous: RentalProfile, next: RentalProfile) -> String {
    let changes = describeChanges(previous: previous, next: next)
    let nextQuestion = nextOnboardingQuestion(for: next)

    if next.isBoardReady {
      let changeLead = changes.isEmpty ? "The board brief is in good shape now." : "\(changes) "
      return "\(changeLead)You’ve given me enough to open the shared board. From there the group can edit constraints, invite people in, and start comparing real listings."
    }

    if changes.isEmpty {
      return nextQuestion
    }

    return "\(changes) \(nextQuestion)"
  }

  private func describeChanges(previous: RentalProfile, next: RentalProfile) -> String {
    var changes: [String] = []

    if previous.city != next.city, !next.city.isEmpty {
      changes.append("I’m anchoring the search around \(next.city).")
    }

    if previous.moveInDate != next.moveInDate, !next.moveInDate.isEmpty {
      changes.append("Move-in is reading as \(next.moveInDate).")
    }

    if previous.budgetMax != next.budgetMax || previous.budgetMin != next.budgetMin {
      let budgetLine = formattedBudgetLine(min: next.budgetMin, max: next.budgetMax)
      if budgetLine != "Budget still open" {
        changes.append("Budget is now framed around \(budgetLine.lowercased()).")
      }
    }

    if previous.groupSize != next.groupSize, next.groupSize > 1 {
      changes.append("This sounds like a \(next.groupSize)-person search.")
    }

    if previous.commuteTarget != next.commuteTarget
      || previous.minCommuteMinutes != next.minCommuteMinutes
      || previous.maxCommuteMinutes != next.maxCommuteMinutes {
      if next.commuteTarget.isEmpty {
        // Commute matching was intentionally removed or skipped.
      } else if next.minCommuteMinutes.isEmpty || next.maxCommuteMinutes.isEmpty {
        changes.append("I’ve got the commute anchored around \(next.commuteTarget).")
      } else {
        changes.append("I’ve got the commute anchored around \(next.commuteTarget), with \(next.minCommuteMinutes)–\(next.maxCommuteMinutes) minutes receiving the full commute score.")
      }
    }

    if previous.priorities != next.priorities, !next.priorities.isEmpty {
      changes.append("Top priorities now read \(joinedList(next.priorities)).")
    }

    if previous.mustHaves != next.mustHaves, !next.mustHaves.isEmpty {
      changes.append("Must-haves now include \(joinedList(next.mustHaves)).")
    }

    if previous.dealbreakers != next.dealbreakers, !next.dealbreakers.isEmpty {
      changes.append("Dealbreakers include \(joinedList(next.dealbreakers)).")
    }

    if previous.neighborhoods != next.neighborhoods, !next.neighborhoods.isEmpty {
      changes.append("I’m keeping \(joinedList(next.neighborhoods)) in the first neighborhood pass.")
    }

    return changes.joined(separator: " ")
  }

  private func nextOnboardingQuestion(for profile: RentalProfile) -> String {
    if profile.city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return "What city should this board focus on first?"
    }

    if profile.budgetMax.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return "What monthly budget should I stay under per person?"
    }

    if profile.moveInDate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return "When are you trying to move?"
    }

    if profile.commuteTarget.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && profile.neighborhoods.isEmpty {
      return "What should anchor the search next: a commute target or a few neighborhoods you actually want to live in?"
    }

    if profile.priorities.isEmpty {
      return "What should win tie-breakers once listings start competing: commute, neighborhood, price, space, or amenities?"
    }

    if profile.mustHaves.isEmpty {
      return "What is a real must-have for this group: laundry, natural light, doorman, elevator, parking, or something else?"
    }

    if profile.dealbreakers.isEmpty {
      return "What kills a listing immediately for this group?"
    }

    return "You can keep refining here, or open the board and let the group start working from the shared brief."
  }

  private func applyLocation(from message: String, into profile: inout RentalProfile) {
    let lower = message.lowercased()
    let known = [
      "nyc": "New York City",
      "new york city": "New York City",
      "new york": "New York City",
      "brooklyn": "Brooklyn",
      "queens": "Queens",
      "jersey city": "Jersey City",
      "hoboken": "Hoboken",
      "los angeles": "Los Angeles",
      "san francisco": "San Francisco",
      "chicago": "Chicago",
      "boston": "Boston"
    ]

    for (needle, value) in known {
      if lower.contains(needle) {
        profile.city = value
        return
      }
    }
  }

  private func applyMoveInDate(from message: String, into profile: inout RentalProfile) {
    let lower = message.lowercased()
    let months = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december"
    ]

    if let month = months.first(where: { lower.contains($0) }) {
      profile.moveInDate = month.capitalized
      return
    }

    if lower.contains("asap") {
      profile.moveInDate = "ASAP"
    }
  }

  private func applyBudget(from message: String, into profile: inout RentalProfile) {
    let normalized = message.lowercased().replacingOccurrences(of: ",", with: "")

    if let range = firstMatch(in: normalized, pattern: #"\$?(\d+(?:\.\d+)?k?)\s*(?:to|-)\s*\$?(\d+(?:\.\d+)?k?)"#) {
      let min = parseAmount(range[1])
      let max = parseAmount(range[2])
      profile.budgetMin = min
      profile.budgetMax = max
      return
    }

    if let stretch = firstMatch(in: normalized, pattern: #"(?:stretch|maybe|max|max of|up to|ceiling|under|budget of|budget is|stay under)\s*\$?(\d+(?:\.\d+)?k?)"#) {
      let value = parseAmount(stretch[1])
      if normalized.contains("stretch") || normalized.contains("maybe") {
        profile.budgetMax = value
      } else {
        profile.budgetMax = value
      }
      return
    }

    if let plain = firstMatch(in: normalized, pattern: #"\$?(\d+(?:\.\d+)?k?)"#),
       normalized.contains("budget") || normalized.contains("under") || normalized.contains("max") || normalized.contains("per person") {
      profile.budgetMax = parseAmount(plain[1])
    }
  }

  private func applyGroupSize(from message: String, into profile: inout RentalProfile) {
    let lower = message.lowercased()

    if lower.contains("with two roommates") {
      profile.groupSize = 3
      return
    }
    if lower.contains("with one roommate") {
      profile.groupSize = 2
      return
    }
    if lower.contains("with three roommates") {
      profile.groupSize = 4
      return
    }

    if let match = firstMatch(in: lower, pattern: #"(?:we are|we're|group of|with)\s*(\d+)"#) {
      profile.groupSize = max(1, Int(match[1]) ?? profile.groupSize)
    }
  }

  private func applyCommute(from message: String, into profile: inout RentalProfile) {
    let lower = message.lowercased()

    if let match = firstMatch(in: message, pattern: #"(?i)(?:commuting to|commute to|work in|working in|job in)\s+([A-Za-z ]{2,40})"#) {
      profile.commuteTarget = match[1].trimmingCharacters(in: .whitespacesAndNewlines)
    }

    if let match = firstMatch(in: lower, pattern: #"(\d{1,3})\s*(?:min|mins|minutes)"#) {
      profile.maxCommuteMinutes = match[1]
    }
  }

  private func applyPriorities(from message: String, into profile: inout RentalProfile) {
    let lower = message.lowercased()
    let fields = ["commute", "price", "space", "neighborhood", "amenities"]
    for field in fields where lower.contains(field) {
      if lower.contains("priority") || lower.contains("matters most") || lower.contains("care about") || lower.contains("most important") {
        profile.priorities.append(field)
      }
    }
  }

  private func applyMustHaves(from message: String, into profile: inout RentalProfile) {
    let lower = message.lowercased()
    let signals = [
      ("laundry", "laundry"),
      ("parking", "parking"),
      ("natural light", "natural light"),
      ("elevator", "elevator"),
      ("doorman", "doorman"),
      ("pet friendly", "pet friendly")
    ]

    for (needle, token) in signals {
      if lower.contains(needle) && (lower.contains("must") || lower.contains("need") || lower.contains("have to")) {
        profile.mustHaves.append(token)
      }
    }
  }

  private func applyDealbreakers(from message: String, into profile: inout RentalProfile) {
    let lower = message.lowercased()

    if lower.contains("no broker fee") || lower.contains("broker fee is a dealbreaker") {
      profile.dealbreakers.append("broker fee")
    }
    if lower.contains("over 1600") {
      profile.dealbreakers.append("over $1,600")
    }
    if lower.contains("over 1800") {
      profile.dealbreakers.append("over $1,800")
    }
    if lower.contains("bad train access") || lower.contains("poor train access") {
      profile.dealbreakers.append("bad train access")
    }
  }

  private func applyNeighborhoods(from message: String, into profile: inout RentalProfile) {
    let lower = message.lowercased()
    let known = [
      "midtown": "Midtown",
      "williamsburg": "Williamsburg",
      "greenpoint": "Greenpoint",
      "fort greene": "Fort Greene",
      "park slope": "Park Slope",
      "astoria": "Astoria",
      "sunnyside": "Sunnyside",
      "long island city": "Long Island City"
    ]

    for (needle, value) in known where lower.contains(needle) {
      profile.neighborhoods.append(value)
    }
  }

  private func applyBedroomIntent(from message: String, into profile: inout RentalProfile) {
    let lower = message.lowercased()
    if lower.contains("2 bed") || lower.contains("2 bedroom") || lower.contains("two bedroom") {
      if !profile.dealbreakers.contains("not enough bedrooms") {
        profile.priorities.append("space")
      }
    }
  }

  private func dedupe(_ values: [String]) -> [String] {
    var seen = Set<String>()
    var result: [String] = []
    for value in values {
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else { continue }
      let key = trimmed.lowercased()
      if seen.insert(key).inserted {
        result.append(trimmed)
      }
    }
    return result
  }

  private func joinedList(_ values: [String]) -> String {
    guard !values.isEmpty else { return "" }
    if values.count == 1 { return values[0] }
    if values.count == 2 { return "\(values[0]) and \(values[1])" }
    return "\(values.dropLast().joined(separator: ", ")), and \(values.last!)"
  }

  private func openPreviewBoard() {
    let members = [
      MemberPreferenceCard(
        id: "preview-member-sam",
        userId: "preview-sam",
        roommateId: "preview-member-sam",
        role: "owner",
        name: "Sam",
        budgetLine: "$1,400–$1,700",
        commuteLine: "350 5th Ave, New York, NY 10118 · max 40 min",
        priorities: ["commute", "value"],
        dealbreakers: ["over $1,700", "poor train access"],
        neighborhoods: ["Astoria", "Hamilton Heights"],
        status: "profile complete"
      ),
      MemberPreferenceCard(
        id: "preview-member-maya",
        userId: "preview-maya",
        roommateId: "preview-member-maya",
        role: "member",
        name: "Maya",
        budgetLine: "$1,500–$1,800",
        commuteLine: "1 MetroTech Center, Brooklyn, NY 11201 · max 45 min",
        priorities: ["neighborhood", "natural light"],
        dealbreakers: ["dark bedrooms"],
        neighborhoods: ["Crown Heights", "Bed-Stuy"],
        status: "profile complete"
      ),
      MemberPreferenceCard(
        id: "preview-member-jordan",
        userId: "preview-jordan",
        roommateId: "preview-member-jordan",
        role: "member",
        name: "Jordan",
        budgetLine: "$1,250–$1,550",
        commuteLine: "28 Liberty St, New York, NY 10005 · max 45 min",
        priorities: ["budget", "train access"],
        dealbreakers: ["over $1,600 per person"],
        neighborhoods: ["Hamilton Heights", "Astoria"],
        status: "profile complete"
      )
    ]

    var astoria = ListingPreview(
      id: "preview-astoria",
      listingId: "preview-astoria",
      title: "21-18 31st Avenue",
      location: "Astoria, Queens, NY 11106",
      priceLine: "$4,650",
      commuteLine: "Compare 3 work routes on the map",
      summary: "Preview data for testing Homeboard’s shared decision tools. This is not a live rental advertisement.",
      fitLabel: "Strong shared fit",
      highlights: ["3 bedrooms and 2 full bathrooms for all roommates", "Near N/W trains with direct access to Midtown", "Balanced neighborhood vibe for the whole group"],
      openRisks: ["Pushes Jordan to the top of their $1,550 budget cap", "Compare bedroom sizes to agree on an even rent split"],
      status: "interested",
      photoURL: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop&q=80",
      bedrooms: "3",
      bathrooms: "2",
      latitude: 40.7685,
      longitude: -73.9253
    )
    astoria.ratings = previewRatings(
      listingId: astoria.id,
      sam: ["value": 4, "commute": 5, "space": 4, "neighborhood": 4, "amenities": 3, "confidence": 4],
      maya: ["value": 4, "commute": 4, "space": 4, "neighborhood": 4, "amenities": 4, "confidence": 4],
      jordan: ["value": 4, "commute": 4, "space": 5, "neighborhood": 3, "amenities": 3, "confidence": 4]
    )

    var hamilton = ListingPreview(
      id: "preview-hamilton",
      listingId: "preview-hamilton",
      title: "540 West 143rd Street",
      location: "New York, NY 10031",
      priceLine: "$4,350",
      commuteLine: "Compare 3 work routes on the map",
      summary: "Preview data for testing filters, group ratings, and commute routes. This is not a live rental advertisement.",
      fitLabel: "Best value conversation · 1 mo free",
      highlights: ["1 month free lowers effective rent to $1,329/person", "Well within Jordan and Sam's budget goals", "1 train stop is a short walk away"],
      openRisks: ["Only 1 bathroom shared between 3 roommates", "Longer morning commute for Maya's downtown route"],
      status: "maybe",
      photoURL: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&auto=format&fit=crop&q=80",
      bedrooms: "3",
      bathrooms: "1",
      latitude: 40.8253,
      longitude: -73.9493
    )
    hamilton.ratings = previewRatings(
      listingId: hamilton.id,
      sam: ["value": 5, "commute": 5, "space": 4, "neighborhood": 3, "amenities": 2, "confidence": 4],
      maya: ["value": 4, "commute": 2, "space": 4, "neighborhood": 2, "amenities": 2, "confidence": 2],
      jordan: ["value": 5, "commute": 4, "space": 5, "neighborhood": 3, "amenities": 3, "confidence": 4]
    )

    var brooklyn = ListingPreview(
      id: "preview-brooklyn",
      listingId: "preview-brooklyn",
      title: "790 Classon Avenue",
      location: "Brooklyn, NY 11238",
      priceLine: "$4,950",
      commuteLine: "Compare 3 work routes on the map",
      summary: "Preview data for testing Homeboard’s shared workspace. This is not a live rental advertisement.",
      fitLabel: "Lifestyle-led option",
      highlights: ["Large open living room for shared socializing", "2 full bathrooms make morning routines seamless", "Top neighborhood pick for weekend culture"],
      openRisks: ["$1,650/person exceeds Jordan's $1,550 budget cap", "Longer 45+ min commute to Midtown for Sam"],
      status: "new",
      photoURL: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop&q=80",
      bedrooms: "3",
      bathrooms: "2",
      latitude: 40.6747,
      longitude: -73.9596
    )
    brooklyn.ratings = previewRatings(
      listingId: brooklyn.id,
      sam: ["value": 2, "commute": 2, "space": 4, "neighborhood": 4, "amenities": 4, "confidence": 3],
      maya: ["value": 4, "commute": 5, "space": 4, "neighborhood": 5, "amenities": 5, "confidence": 5],
      jordan: ["value": 1, "commute": 3, "space": 4, "neighborhood": 4, "amenities": 4, "confidence": 2]
    )

    let demoStartedAt = ISO8601DateFormatter().string(from: Date())
    let demoExpiresAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(7 * 24 * 60 * 60))
    let demoAdvisor = ScoutSubscription(
      id: "demo-advisor-preview-workspace",
      boardId: "preview-workspace",
      status: "active",
      tier: "scout_weekly",
      amountCents: 499,
      currency: "usd",
      startedAt: demoStartedAt,
      expiresAt: demoExpiresAt,
      fundedCents: 499,
      targetCents: 499,
      daysRemaining: 7,
      contributions: [
        ScoutContribution(id: "preview-advisor-sam", subscriptionId: "demo-advisor-preview-workspace", userId: "preview-sam", userName: "Sam", amountCents: 167, status: "paid"),
        ScoutContribution(id: "preview-advisor-maya", subscriptionId: "demo-advisor-preview-workspace", userId: "preview-maya", userName: "Maya", amountCents: 166, status: "paid"),
        ScoutContribution(id: "preview-advisor-jordan", subscriptionId: "demo-advisor-preview-workspace", userId: "preview-jordan", userName: "Jordan", amountCents: 166, status: "paid")
      ]
    )

    account = nil
    authSession = nil
    opensWelcomeOnAccessPage = false
    board = MobileBoard(
      id: "preview-workspace",
      title: "NYC roommate search · Preview",
      city: "New York City",
      moveInTimeline: "August",
      groupSize: "3 renters",
      budgetLine: "$4,200–$5,100 total",
      commuteTargets: members.map(\.commuteLine),
      readiness: "Preview board ready",
      completionLine: "All core constraints aligned",
      nextBestAction: "Open a listing, compare everyone’s commute routes, and adjust your group fit read.",
      inviteCode: "PREVIEW123",
      recentActivity: [
        "Maya added the Crown Heights option.",
        "Jordan flagged the per-person budget ceiling.",
        "Sam updated the Midtown commute target."
      ],
      chatMessages: [],
      openQuestions: ["Which tradeoff matters more: the Brooklyn location or the lower Hamilton Heights rent?"],
      members: members,
      shortlist: [hamilton, astoria, brooklyn],
      invitations: [],
      scoutSubscription: demoAdvisor
    )
    localShortlistsByBoard["preview-workspace"] = board.shortlist
    localMembersByBoard["preview-workspace"] = members
    listingInventory = []
    listingInventoryNextCursor = nil
    listingInventoryHasMore = false
    listingInventoryError = nil
    boardTab = .board
    currentScreen = .board
    pendingInviteCode = ""
  }

  private func previewRatings(
    listingId: String,
    sam: [String: Int],
    maya: [String: Int],
    jordan: [String: Int]
  ) -> [ListingDimensionRating] {
    [
      ListingDimensionRating(id: "\(listingId)-sam", memberId: "preview-member-sam", userId: "preview-sam", name: "Sam", values: sam, updatedAt: ""),
      ListingDimensionRating(id: "\(listingId)-maya", memberId: "preview-member-maya", userId: "preview-maya", name: "Maya", values: maya, updatedAt: ""),
      ListingDimensionRating(id: "\(listingId)-jordan", memberId: "preview-member-jordan", userId: "preview-jordan", name: "Jordan", values: jordan, updatedAt: "")
    ]
  }

  private func clearGuestPreviewState(preservingNonPreviewBoard: Bool = false) {
    let isDisplayingPreview = board.id == "preview-workspace"
    localShortlistsByBoard.removeValue(forKey: "preview-workspace")
    localMembersByBoard.removeValue(forKey: "preview-workspace")
    localBoardsById.removeValue(forKey: "preview-workspace")
    localProfilesByBoard.removeValue(forKey: "preview-workspace")
    if preservingNonPreviewBoard, !isDisplayingPreview {
      return
    }
    account = nil
    board = .empty
    listingInventory = []
    listingInventoryNextCursor = nil
    listingInventoryHasMore = false
    listingInventoryError = nil
    boardTab = .board
  }

  private func parseAmount(_ value: String) -> String {
    let lower = value.lowercased()
    if lower.hasSuffix("k"), let raw = Double(lower.dropLast()) {
      return String(Int(raw * 1000))
    }
    return String(Int(Double(lower) ?? 0))
  }

  private func firstMatch(in input: String, pattern: String) -> [String]? {
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
    let range = NSRange(input.startIndex..<input.endIndex, in: input)
    guard let match = regex.firstMatch(in: input, range: range) else { return nil }
    return (0..<match.numberOfRanges).compactMap { index in
      guard let range = Range(match.range(at: index), in: input) else { return nil }
      return String(input[range])
    }
  }

  func persist() {
    let accountSession = AccountSessionPersistence(
      currentScreen: currentScreen,
      authMode: authMode,
      boardTab: boardTab,
      account: account,
      authenticatedAuthUserID: authSession?.userId ?? restoredAuthUserID,
      membershipState: authenticatedMembershipState,
      availableBoards: availableBoards,
      pendingConfirmationEmail: pendingConfirmationEmail
    )
    let profileRecord = ProfilePersistence(
      profile: profile,
      localProfilesByBoard: localProfilesByBoard
    )
    let boardsListings = BoardsListingsPersistence(
      board: board,
      localShortlistsByBoard: localShortlistsByBoard,
      localQuestionsByBoard: localQuestionsByBoard,
      localActivityByBoard: localActivityByBoard,
      localMembersByBoard: localMembersByBoard,
      localChatMessagesByBoard: localChatMessagesByBoard,
      localBoardsById: localBoardsById,
      listingInventory: listingInventory,
      listingInventoryNextCursor: listingInventoryNextCursor,
      listingInventoryHasMore: listingInventoryHasMore,
      advisorHistoryByListingID: advisorHistoryByListingID,
      advisorChecklistByListingID: advisorChecklistByListingID,
      advisorInquiriesByListingID: advisorInquiriesByListingID,
      advisorTourNotesByListingID: advisorTourNotesByListingID
    )
    let onboarding = OnboardingPersistence(
      onboardingCreationRequestId: onboardingCreationRequestId,
      onboardingMessages: onboardingMessages
    )
    let pendingOperations = PendingOperationsPersistence(
      pendingListingCreatesByBoard: pendingListingCreatesByBoard,
      pendingLocalListingRemovalIDs: pendingLocalListingRemovalIDs,
      pendingServerListingRemovalIDsByBoard: pendingServerListingRemovalIDsByBoard,
      serverListingIDByLocalID: serverListingIDByLocalID,
      removedServerListingIDsByBoard: removedServerListingIDsByBoard,
      removedListingIdentityKeysByBoard: removedListingIdentityKeysByBoard
    )

    writePersistenceRecord(accountSession, key: accountSessionPersistenceKey)
    writePersistenceRecord(profileRecord, key: profilePersistenceKey)
    writePersistenceRecord(boardsListings, key: boardsListingsPersistenceKey)
    writePersistenceRecord(onboarding, key: onboardingPersistenceKey)
    writePersistenceRecord(pendingOperations, key: pendingOperationsPersistenceKey)

    // A failed or undecodable Keychain read must not be converted into a
    // deletion just because unrelated app state was persisted.
    if let authSession {
      NativeAuthSessionStore.save(authSession)
    }
  }

  private func restore() {
    let defaults = UserDefaults.standard
    let legacyData = defaults.data(forKey: legacyPersistenceKey)
    let legacySnapshot = legacyData.flatMap {
      try? JSONDecoder().decode(LegacyPersistedState.self, from: $0)
    }
    if legacyData != nil, legacySnapshot == nil {
      // Keep every missing destination untouched. The legacy bytes remain in
      // place for a future decoder or support build to recover.
      unreadablePersistenceKeys.formUnion(
        persistenceKeys.filter { defaults.data(forKey: $0) == nil }
      )
    }

    var restoredBoardData = false

    if let record: AccountSessionPersistence = readPersistenceRecord(
      AccountSessionPersistence.self,
      key: accountSessionPersistenceKey
    ) {
      currentScreen = record.currentScreen
      authMode = record.authMode
      boardTab = record.boardTab ?? .board
      account = record.account
      restoredAuthUserID = record.authenticatedAuthUserID
      authenticatedMembershipState = record.membershipState
      availableBoards = record.availableBoards
      pendingConfirmationEmail = record.pendingConfirmationEmail ?? ""
    } else if defaults.data(forKey: accountSessionPersistenceKey) == nil,
              let snapshot = legacySnapshot {
      currentScreen = snapshot.currentScreen
      authMode = snapshot.authMode
      boardTab = snapshot.boardTab ?? .board
      account = snapshot.account
      restoredAuthUserID = snapshot.authenticatedAuthUserID
      availableBoards = snapshot.availableBoards
      pendingConfirmationEmail = snapshot.pendingConfirmationEmail ?? ""
    }

    if let record: ProfilePersistence = readPersistenceRecord(
      ProfilePersistence.self,
      key: profilePersistenceKey
    ) {
      profile = record.profile
      localProfilesByBoard = record.localProfilesByBoard
    } else if defaults.data(forKey: profilePersistenceKey) == nil,
              let snapshot = legacySnapshot {
      profile = snapshot.profile
      localProfilesByBoard = snapshot.localProfilesByBoard
    }

    if let record: BoardsListingsPersistence = readPersistenceRecord(
      BoardsListingsPersistence.self,
      key: boardsListingsPersistenceKey
    ) {
      board = record.board
      localShortlistsByBoard = record.localShortlistsByBoard
      localQuestionsByBoard = record.localQuestionsByBoard
      localActivityByBoard = record.localActivityByBoard
      localMembersByBoard = record.localMembersByBoard
      localChatMessagesByBoard = record.localChatMessagesByBoard ?? [:]
      localBoardsById = record.localBoardsById
      listingInventory = record.listingInventory ?? record.board.suggestions ?? []
      listingInventoryNextCursor = record.listingInventoryNextCursor
      listingInventoryHasMore = record.listingInventoryHasMore ?? false
      advisorHistoryByListingID = record.advisorHistoryByListingID ?? [:]
      advisorChecklistByListingID = record.advisorChecklistByListingID ?? [:]
      advisorInquiriesByListingID = record.advisorInquiriesByListingID ?? [:]
      advisorTourNotesByListingID = record.advisorTourNotesByListingID ?? [:]
      restoredBoardData = true
    } else if defaults.data(forKey: boardsListingsPersistenceKey) == nil,
              let snapshot = legacySnapshot {
      board = snapshot.board
      localShortlistsByBoard = snapshot.localShortlistsByBoard
      localQuestionsByBoard = snapshot.localQuestionsByBoard
      localActivityByBoard = snapshot.localActivityByBoard
      localMembersByBoard = snapshot.localMembersByBoard
      localChatMessagesByBoard = snapshot.localChatMessagesByBoard ?? [:]
      localBoardsById = snapshot.localBoardsById
      listingInventory = snapshot.board.suggestions ?? []
      restoredBoardData = true
    }

    if let record: OnboardingPersistence = readPersistenceRecord(
      OnboardingPersistence.self,
      key: onboardingPersistenceKey
    ) {
      onboardingCreationRequestId = record.onboardingCreationRequestId
      onboardingMessages = record.onboardingMessages
    } else if defaults.data(forKey: onboardingPersistenceKey) == nil,
              let snapshot = legacySnapshot {
      onboardingCreationRequestId = snapshot.onboardingCreationRequestId
      onboardingMessages = snapshot.onboardingMessages
    }

    if let record: PendingOperationsPersistence = readPersistenceRecord(
      PendingOperationsPersistence.self,
      key: pendingOperationsPersistenceKey
    ) {
      pendingListingCreatesByBoard = record.pendingListingCreatesByBoard ?? [:]
      pendingLocalListingRemovalIDs = record.pendingLocalListingRemovalIDs ?? []
      pendingServerListingRemovalIDsByBoard = record.pendingServerListingRemovalIDsByBoard ?? [:]
      serverListingIDByLocalID = record.serverListingIDByLocalID ?? [:]
      removedServerListingIDsByBoard = record.removedServerListingIDsByBoard ?? [:]
      removedListingIdentityKeysByBoard = record.removedListingIdentityKeysByBoard ?? [:]
    } else if defaults.data(forKey: pendingOperationsPersistenceKey) == nil,
              let snapshot = legacySnapshot {
      pendingListingCreatesByBoard = snapshot.pendingListingCreatesByBoard ?? [:]
      pendingLocalListingRemovalIDs = snapshot.pendingLocalListingRemovalIDs ?? []
      pendingServerListingRemovalIDsByBoard = snapshot.pendingServerListingRemovalIDsByBoard ?? [:]
      serverListingIDByLocalID = snapshot.serverListingIDByLocalID ?? [:]
      removedServerListingIDsByBoard = snapshot.removedServerListingIDsByBoard ?? [:]
      removedListingIdentityKeysByBoard = snapshot.removedListingIdentityKeysByBoard ?? [:]
    }

    // Invite links are bearer credentials and intentionally never migrate out
    // of the old blob into UserDefaults.
    pendingInviteCode = ""
    if restoredBoardData {
      applyLocalBoardContributions()
    }

    if legacySnapshot != nil {
      persist()
      let migrationCompleted = persistenceKeys.allSatisfy {
        defaults.data(forKey: $0) != nil && !unreadablePersistenceKeys.contains($0)
      }
      if migrationCompleted {
        defaults.removeObject(forKey: legacyPersistenceKey)
      }
    }
  }

  private func readPersistenceRecord<Payload: Codable>(
    _ type: Payload.Type,
    key: String
  ) -> Payload? {
    guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
    do {
      let record = try JSONDecoder().decode(
        VersionedPersistenceRecord<Payload>.self,
        from: data
      )
      guard record.schemaVersion == persistenceSchemaVersion else {
        unreadablePersistenceKeys.insert(key)
        return nil
      }
      return record.payload
    } catch {
      unreadablePersistenceKeys.insert(key)
      return nil
    }
  }

  private func writePersistenceRecord<Payload: Codable>(_ payload: Payload, key: String) {
    guard !unreadablePersistenceKeys.contains(key) else { return }
    let record = VersionedPersistenceRecord(
      schemaVersion: persistenceSchemaVersion,
      payload: payload
    )
    guard let data = try? JSONEncoder().encode(record) else { return }
    UserDefaults.standard.set(data, forKey: key)
  }

  private func boardStorageKey(for board: MobileBoard? = nil) -> String {
    let resolvedBoard = board ?? self.board
    if let id = resolvedBoard.id, !id.isEmpty {
      return id
    }
    if !resolvedBoard.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return "draft-\(resolvedBoard.title.lowercased())"
    }
    return "draft"
  }

  private func appendLocalActivity(_ message: String) {
    let key = boardStorageKey()
    var items = localActivityByBoard[key] ?? []
    items.insert(message, at: 0)
    localActivityByBoard[key] = Array(items.prefix(12))
  }

  private func applyLocalBoardContributions() {
    let key = boardStorageKey()
    let isDeviceLocalBoard = board.id.map {
      $0.hasPrefix("local-") || $0.hasPrefix("preview-")
    } ?? true

    if !isDeviceLocalBoard {
      board.members.removeAll {
        $0.userId.isEmpty
          && $0.roommateId == nil
          && $0.status != "commute point"
      }
    }

    let localShortlist = localShortlistsByBoard[key] ?? []
    if !localShortlist.isEmpty {
      var merged = localShortlist
      for item in board.shortlist where !merged.contains(where: {
        $0.id == item.id || listingIdentityKey($0) == listingIdentityKey(item)
      }) {
        merged.append(item)
      }
      board.shortlist = merged
    }

    let localQuestions = localQuestionsByBoard[key] ?? []
    if !localQuestions.isEmpty {
      var merged = localQuestions
      for item in board.openQuestions where !merged.contains(where: { $0.caseInsensitiveCompare(item) == .orderedSame }) {
        merged.append(item)
      }
      board.openQuestions = merged
    }

    let localActivity = localActivityByBoard[key] ?? []
    if !localActivity.isEmpty {
      var merged = localActivity
      for item in board.recentActivity where !merged.contains(where: { $0.caseInsensitiveCompare(item) == .orderedSame }) {
        merged.append(item)
      }
      board.recentActivity = merged
    }

    let localMembers = (localMembersByBoard[key] ?? []).filter {
      isDeviceLocalBoard || $0.status == "commute point"
    }
    if !localMembers.isEmpty {
      var merged = board.members
      for item in localMembers where !merged.contains(where: {
        $0.id == item.id
          || (!item.userId.isEmpty && $0.userId == item.userId)
          || ($0.name.caseInsensitiveCompare(item.name) == .orderedSame
              && $0.status == item.status)
      }) {
        merged.append(item)
      }
      board.members = merged
    }

    ensureCurrentAccountMemberPresence()
  }

  private func recentlyDeletedDate(from value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) { return date }
    return ISO8601DateFormatter().date(from: value)
  }

  private func purgeExpiredLocalRecentlyDeletedListings() {
    let cutoff = Date().addingTimeInterval(-7 * 24 * 60 * 60)
    let retained: ([ListingPreview]?) -> [ListingPreview] = { listings in
      (listings ?? []).filter { listing in
        guard let deletedAt = listing.deletedAt,
              let date = self.recentlyDeletedDate(from: deletedAt)
        else { return true }
        return date > cutoff
      }
    }
    let currentBoardRecentlyDeleted = board.recentlyDeleted
    board.recentlyDeleted = retained(currentBoardRecentlyDeleted)

    var updatedBoards = localBoardsById
    for (key, var targetBoard) in updatedBoards {
      targetBoard.recentlyDeleted = retained(targetBoard.recentlyDeleted)
      updatedBoards[key] = targetBoard
    }
    localBoardsById = updatedBoards
  }

  private func removePersistedStressTestListings() {
    let prefix = "debug-stress-listing-"
    board.shortlist.removeAll { $0.id.hasPrefix(prefix) }

    var updatedShortlists = localShortlistsByBoard
    for (key, var list) in updatedShortlists {
      list.removeAll { $0.id.hasPrefix(prefix) }
      updatedShortlists[key] = list
    }
    localShortlistsByBoard = updatedShortlists

    var updatedBoards = localBoardsById
    for (key, var targetBoard) in updatedBoards {
      targetBoard.shortlist.removeAll { $0.id.hasPrefix(prefix) }
      updatedBoards[key] = targetBoard
    }
    localBoardsById = updatedBoards

    var updatedCreates = pendingListingCreatesByBoard
    for (key, var list) in updatedCreates {
      list.removeAll { $0.id.hasPrefix(prefix) }
      updatedCreates[key] = list
    }
    pendingListingCreatesByBoard = updatedCreates
  }

  private func storeCurrentBoardSnapshot() {
    guard let boardId = board.id else { return }
    localBoardsById[boardId] = board
    localProfilesByBoard[boardId] = profile
  }

  private func ensureCurrentAccountMemberPresence() {
    let canSynthesizeLocalMember = board.id.map {
      $0.hasPrefix("local-") || $0.hasPrefix("preview-")
    } ?? true
    guard canSynthesizeLocalMember else { return }

    let resolvedName = profile.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? account?.name.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      : profile.name.trimmingCharacters(in: .whitespacesAndNewlines)

    guard !resolvedName.isEmpty else { return }

    let normalizedName = resolvedName.lowercased()
    if board.members.contains(where: { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedName }) {
      return
    }

    let budgetLine = formattedBudgetLine(min: profile.budgetMin, max: profile.budgetMax)
    let commuteLine = commuteTargets(from: profile).first ?? "Commute still open"
    let member = MemberPreferenceCard(
      name: resolvedName,
      budgetLine: budgetLine,
      commuteDestination: profile.commuteTarget.isEmpty ? nil : profile.commuteTarget,
      commuteAccess: profile.commuteAccess,
      commuteLine: commuteLine,
      priorities: profile.priorities.isEmpty ? ["still open"] : profile.priorities,
      dealbreakers: profile.dealbreakers,
      neighborhoods: profile.neighborhoods,
      status: profile.isBoardReady ? "profile complete" : "profile building"
    )

    board.members.insert(member, at: 0)

    let key = boardStorageKey()
    var members = localMembersByBoard[key] ?? []
    if !members.contains(where: { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedName }) {
      members.insert(member, at: 0)
      localMembersByBoard[key] = members
    }
  }
}

private enum NativeAuthSessionStore {
  private struct StoredSessionRecord: Codable {
    var schemaVersion: Int
    var session: NativeAuthSession
  }

  // Keep the service independent of build metadata so an app update cannot
  // strand an otherwise valid login merely because Info.plist changed.
  private static let service = "com.homeboard.native"
  private static let account = "supabase.session"
  private static let schemaVersion = 1

  static func load() -> NativeAuthSession? {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(
      [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
        kSecReturnData: true,
        kSecMatchLimit: kSecMatchLimitOne
      ] as CFDictionary,
      &result
    )

    guard status == errSecSuccess, let data = result as? Data else { return nil }
    if let record = try? JSONDecoder().decode(StoredSessionRecord.self, from: data),
       record.schemaVersion == schemaVersion {
      return record.session
    }
    if let legacySession = try? JSONDecoder().decode(NativeAuthSession.self, from: data) {
      save(legacySession)
      return legacySession
    }
    // Preserve undecodable Keychain bytes. A successful explicit sign-in can
    // replace them, while unrelated persistence must never delete them.
    return nil
  }

  static func save(_ session: NativeAuthSession) {
    let record = StoredSessionRecord(schemaVersion: schemaVersion, session: session)
    guard let data = try? JSONEncoder().encode(record) else { return }

    HomeboardSharedAuthStore.save(
      HomeboardSharedAuthContext(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        userId: session.userId,
        email: session.email,
        displayName: session.displayName
      )
    )

    let lookup = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: service,
      kSecAttrAccount: account
    ] as CFDictionary
    let update = [kSecValueData: data] as CFDictionary

    if SecItemUpdate(lookup, update) == errSecItemNotFound {
      SecItemAdd(
        [
          kSecClass: kSecClassGenericPassword,
          kSecAttrService: service,
          kSecAttrAccount: account,
          kSecValueData: data,
          kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ] as CFDictionary,
        nil
      )
    }
  }

  static func delete() {
    HomeboardSharedAuthStore.delete()
    SecItemDelete(
      [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account
      ] as CFDictionary
    )
  }
}
