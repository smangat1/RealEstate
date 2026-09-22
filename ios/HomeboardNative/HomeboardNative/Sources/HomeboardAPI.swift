import Foundation

enum HomeboardAPIError: LocalizedError {
  case invalidURL
  case invalidResponse
  case unauthorized
  case missingSession
  case server(String)
  case response(
    endpoint: String,
    status: Int,
    contentType: String,
    bodyExcerpt: String,
    message: String?
  )

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "The mobile app could not build the request URL."
    case .invalidResponse:
      return "The server returned an unreadable response."
    case .unauthorized:
      return "Your session is no longer valid. Please sign in again."
    case .missingSession:
      return "This account requires a live auth session before continuing."
    case .server(let message):
      return message
    case .response(let endpoint, let status, let contentType, let bodyExcerpt, let message):
      let details = "Endpoint \(endpoint) · status \(status) · content type \(contentType) · body \(bodyExcerpt)"
      guard let message, !message.isEmpty else { return details }
      return "\(message) \(details)"
    }
  }
}

enum MobileMembershipState: String, Codable {
  case member
  case authenticatedNoMembership = "authenticated_no_membership"
}

struct MobileSessionResponse: Decodable {
  var user: RemoteUserPayload
  var boards: [MobileBoardSummary]
  // Older production servers predate this discriminator. A missing value is
  // deliberately unknown rather than `authenticatedNoMembership`, so an empty
  // legacy response can never force an existing account into onboarding.
  var membershipState: MobileMembershipState?
  var activeBoard: MobileBoardLoadResponse?
}

enum NativeSignUpOutcome {
  case authenticated(NativeAuthSession)
  case confirmationRequired(email: String)
}

struct MobileBoardLoadResponse: Decodable {
  var board: MobileBoard
  var profile: RemoteRentalProfilePayload
  var missingFields: [String]
  var advisorPayload: AdvisorMessagePayload?
}

struct MobileListingInventoryResponse: Decodable {
  var listings: [ListingPreview]
  var nextCursor: String?
  var hasMore: Bool
  var source: String
}

struct MobileHealthResponse: Decodable {
  var apiVersion: String
  var serverCommit: String
}

struct MobileBoardMessageCreateRequest: Encodable {
  var content: String
  var tone: String?
  var regenerateOnly: Bool?

  init(content: String, tone: String? = nil, regenerateOnly: Bool? = nil) {
    self.content = content
    self.tone = tone
    self.regenerateOnly = regenerateOnly
  }
}

private struct MobileAdvisorFundRequest: Encodable {
  var amountCents: Int
}

struct MobileAdvisorFundResponse: Decodable {
  var clientSecret: String
  var paymentIntentId: String
  var amountCents: Int
}

private struct MobileListingCreateRequest: Encodable {
  var title: String
  var address: String?
  var unit: String?
  var location: String?
  var city: String?
  var neighborhood: String?
  var latitude: Double?
  var longitude: Double?
  var price: Double?
  var bedrooms: Double?
  var bathrooms: Double?
  var squareFeet: Int?
  var availableDate: String?
  var amenities: [String]?
  var modelInsights: [HomeboardListingInsight]?
  var description: String?
  var sourceUrl: String?
  var imageUrl: String?
  var groupNote: String?
  var agentName: String?
  var agentPhone: String?
  var agentEmail: String?
  var brokerage: String?
}

private struct MobileListingPatchRequest: Encodable {
  var status: String?
  var userNotes: String?
  var workflowStatus: String?
  var restore: Bool? = nil
}

private struct MobileReactionRequest: Encodable {
  var vote: String
  var note: String?
}

private struct MobileCommentRequest: Encodable {
  var content: String
}

private struct MobileListingRatingsRequest: Encodable {
  var ratings: [String: Int]
}

private struct ListingImportPreviewRequest: Encodable {
  var url: String
  var address: String?
  var unit: String?
  var price: Double?
  var bedrooms: Double?
  var bathrooms: Double?
}

struct ListingImportPreviewResponse: Decodable {
  var normalizedUrl: String
  var provider: String
  var suggestedAddress: String?
  var suggestedUnit: String?
  var missingEssentialFields: [String]
  var notice: String
}

private struct ListingSourceRequest: Encodable {
  var url: String
  var label: String?
  var kind: String
}

private struct CatalogSourceReportRequest: Encodable {
  var reason: String
  var details: String?
}

private struct ListingVerificationRequest: Encodable {
  var status: String
  var note: String?
}

private struct ListingQuickReviewRequest: Encodable {
  var tourIntent: String
  var interiorAppeal: Int?
  var naturalLight: String
  var mainConcern: String?
  var sourceViewed: Bool
}

private struct ListingDecisionRequest: Encodable {
  var type: String
  var choice: String
}

private struct BoardAnalyticsRequest: Encodable {
  var event: String
  var listingIds: [String]
}


private struct MobileBoardUpdateRequest: Encodable {
  let action: String
  let content: String

  init(content: String) {
    action = "update"
    self.content = content
  }
}

private struct MobileBoardRenameRequest: Encodable {
  var title: String
}

private struct MobileMemberCreateRequest: Encodable {
  var name: String
  var roleLabel: String?
  var budgetMin: Double?
  var idealBudget: Double?
  var budgetMax: Double?
  var stretchBudget: Double?
  var commuteDestination: String?
  var commuteAccess: String?
  var preferredCommuteMinutes: Int?
  var maxCommuteMinutes: Int?
  var petsRequired: Bool?
  var accessibilityNeeds: String?
}

private struct MobileMemberPatchRequest: Encodable {
  var name: String?
  var budgetMin: Double?
  var idealBudget: Double?
  var budgetMax: Double?
  var stretchBudget: Double?
  var commuteDestination: String?
  var commuteAccess: String?
  var preferredCommuteMinutes: Int?
  var maxCommuteMinutes: Int?
  var preferredNeighborhoods: [String]?
  var mustHaves: [String]?
  var dealbreakers: [String]?
  var commutePriority: String?
  var neighborhoodPriority: String?
  var spacePriority: String?
  var privacyPriority: String?
  var petsRequired: Bool?
  var accessibilityNeeds: String?
  var notes: String?
}

private struct PushDeviceRequest: Encodable {
  var token: String
  var environment: String
}

private struct PushDeviceDeleteRequest: Encodable {
  var token: String
}

private struct NativeDiagnosticsRequest: Encodable {
  var payloads: [String]
  var appVersion: String
  var buildNumber: String
}

private struct MobileBugReportRequest: Encodable {
  var description: String
  var currentScreen: String
  var boardId: String?
  var appVersion: String
  var buildNumber: String
  var deviceKind: String
  var osVersion: String
  var boardLoaded: Bool
  var boardCount: Int
  var memberCount: Int
  var savedListingCount: Int
  var shareDiagnostics: String
}

struct MobileBugReportResponse: Decodable {
  var ok: Bool
  var reportId: String
  var promisedBy: String
}

private struct PasswordRecoveryRequest: Encodable {
  var email: String
}

private struct PasswordRecoveryResponse: Decodable {}

private struct UploadResponse: Decodable {
  var url: String
}

struct MobileOnboardingTurnResponse: Decodable {
  var profile: RemoteRentalProfilePayload
  var assistantMessage: RemoteChatMessagePayload
}

struct MobileOnboardingConfirmResponse: Decodable {
  var boardId: String
  var board: MobileBoard
  var profile: RemoteRentalProfilePayload
  var missingFields: [String]
}

struct MobileInvitationCreateResponse: Decodable {
  var invitation: BoardInvitationSummary
  var inviteUrl: String
}

struct MobileInvitationAcceptResponse: Decodable {
  var boardId: String
  var board: MobileBoard
  var profile: RemoteRentalProfilePayload
  var missingFields: [String]
}

struct RemoteChatMessagePayload: Decodable {
  var id: String
  var role: String
  var authorName: String?
  var content: String
  var createdAt: String
}

struct RemoteUserPayload: Decodable {
  var id: String
  var email: String
  var displayName: String
}

struct RemoteRentalProfilePayload: Decodable {
  var name: String
  var email: String?
  var city: String?
  var moveInDate: String?
  var budgetMin: Double?
  var budgetMax: Double?
  var commuteTarget: String?
  var commuteAccess: String?
  var minCommuteMinutes: Int?
  var maxCommuteMinutes: Int?
  var neighborhoods: [String]
  var mustHaves: [String]
  var dealbreakers: [String]
  var priorities: [String]
  var groupSize: Int?
  var notes: String?
}

private struct SupabaseAuthResponse: Decodable {
  var access_token: String?
  var refresh_token: String?
  var user: SupabaseUserPayload?
  var session: SupabaseSessionPayload?
  var id: String?
  var email: String?
  var user_metadata: SupabaseUserPayload.Metadata?

  var resolvedUser: SupabaseUserPayload? {
    if let user {
      return user
    }
    guard let id else { return nil }
    return SupabaseUserPayload(id: id, email: email, user_metadata: user_metadata)
  }
}

private struct SupabaseSessionPayload: Decodable {
  var access_token: String
  var refresh_token: String
  var user: SupabaseUserPayload
}

private struct SupabaseUserPayload: Decodable {
  struct Metadata: Decodable {
    var displayName: String?
    var full_name: String?
    var name: String?

    var resolvedDisplayName: String? {
      [displayName, full_name, name]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .first { !$0.isEmpty }
    }
  }

  var id: String
  var email: String?
  var user_metadata: Metadata?
}

private struct APIErrorPayload: Decodable {
  var error: String?
  var msg: String?
  var message: String?
  var error_description: String?

  var resolvedMessage: String {
    error ?? msg ?? message ?? error_description ?? "Something went wrong."
  }
}

private struct AuthRequestBody: Encodable {
  var email: String
  var password: String
  var data: MetadataPayload?

  struct MetadataPayload: Encodable {
    var displayName: String
  }
}

private struct RefreshRequestBody: Encodable {
  var refresh_token: String
}

private struct AppleIDTokenRequestBody: Encodable {
  var provider = "apple"
  var id_token: String
  var nonce: String
}

private struct UserMetadataUpdateRequestBody: Encodable {
  var data: AuthRequestBody.MetadataPayload
}

private struct SignUpResendRequestBody: Encodable {
  var type = "signup"
  var email: String
}

private struct SignUpResendResponse: Decodable {
  var message_id: String?
}

private struct MobileOnboardingTurnRequest: Encodable {
  var action = "turn"
  var message: String
  var profile: RemoteRentalProfileRequest
  var messages: [RemoteChatMessageRequest]
}

private struct MobileOnboardingConfirmRequest: Encodable {
  var action = "confirm"
  var profile: RemoteRentalProfileRequest
  var creationRequestId: String
}

private struct MobileInvitationCreateRequest: Encodable {
  var boardId: String
}

private struct MobileInvitationRevokeRequest: Encodable {
  var invitationId: String
}

private struct MacDevicePairingApprovalRequest: Encodable {
  var approvalCode: String
}

struct MacDevicePairingApprovalResponse: Decodable {
  var ok: Bool
  var deviceName: String
}

private struct SaveBoardProfileRequest: Encodable {
  var profile: RemoteRentalProfileRequest
}

private struct RemoteRentalProfileRequest: Encodable {
  var id: String
  var boardId: String
  var name: String
  var email: String?
  var city: String?
  var moveInDate: String?
  var budgetMin: Double?
  var budgetMax: Double?
  var stretchBudget: Double?
  var neighborhoods: [String]
  var commuteTarget: String?
  var commuteAccess: String?
  var minCommuteMinutes: Int?
  var maxCommuteMinutes: Int?
  var mustHaves: [String]
  var dealbreakers: [String]
  var niceToHaves: [String]
  var priorities: [String]
  var pets: Bool?
  var parking: Bool?
  var groupSize: Int?
  var hasRoommates: Bool?
  var rentalReadiness: RentalReadinessRequest
  var completionStatus: String
  var notes: String?
  var createdAt: String
  var updatedAt: String
  var intent: String? = "rent"
  var propertyType: String? = "apartment"
  var locations: [String]
  var bedroomsPreferred: Int? = nil
  var bedroomsFlexible: [String] = []
  var moveInTimeframe: String? = nil
  var petsRequired: Bool? = nil
  var parkingRequired: Bool? = nil
  var laundryRequired: Bool? = nil
}

private struct RentalReadinessRequest: Encodable {
  var hasOfferLetter: Bool
  var needsGuarantor: Bool
  var hasProofOfIncome: Bool
}

private struct RemoteChatMessageRequest: Encodable {
  var role: String
  var content: String
  var authorName: String?
}

final class HomeboardAPI {
  private let session: URLSession
  private let decoder: JSONDecoder
  private let encoder: JSONEncoder
  private let backendRequestTimeout: TimeInterval = 12
  private let boardRequestTimeout: TimeInterval = 20

  init(session: URLSession? = nil) {
    self.session = session ?? Self.makeNetworkSession()
    self.decoder = JSONDecoder()
    self.encoder = JSONEncoder()
  }

  private static func makeNetworkSession() -> URLSession {
    let configuration = URLSessionConfiguration.default
    configuration.waitsForConnectivity = true
    configuration.timeoutIntervalForRequest = 20
    configuration.timeoutIntervalForResource = 45
    return URLSession(configuration: configuration)
  }

  func signUp(name: String, email: String, password: String) async throws -> NativeSignUpOutcome {
    let body = AuthRequestBody(
      email: email,
      password: password,
      data: .init(displayName: name)
    )
    let response: SupabaseAuthResponse = try await requestSupabase(
      path: "/auth/v1/signup",
      method: "POST",
      body: body
    )
    if let session = sessionFromAuthResponse(response) {
      return .authenticated(session)
    }
    // When email confirmation is enabled, GoTrue returns the new user at the
    // top level without access tokens. Treat that as a successful pending
    // account instead of an unreadable response.
    if response.resolvedUser != nil {
      return .confirmationRequired(email: email)
    }
    throw HomeboardAPIError.invalidResponse
  }

  func signIn(email: String, password: String) async throws -> NativeAuthSession {
    let body = AuthRequestBody(email: email, password: password, data: nil)
    let response: SupabaseAuthResponse = try await requestSupabase(
      path: "/auth/v1/token?grant_type=password",
      method: "POST",
      body: body
    )
    guard let session = sessionFromAuthResponse(response) else {
      throw HomeboardAPIError.invalidResponse
    }
    return session
  }

  func refreshSession(refreshToken: String) async throws -> NativeAuthSession {
    let response: SupabaseAuthResponse = try await requestSupabase(
      path: "/auth/v1/token?grant_type=refresh_token",
      method: "POST",
      body: RefreshRequestBody(refresh_token: refreshToken)
    )
    guard let session = sessionFromAuthResponse(response) else {
      throw HomeboardAPIError.invalidResponse
    }
    return session
  }

  func signInWithApple(identityToken: String, nonce: String) async throws -> NativeAuthSession {
    let response: SupabaseAuthResponse = try await requestSupabase(
      path: "/auth/v1/token?grant_type=id_token",
      method: "POST",
      body: AppleIDTokenRequestBody(id_token: identityToken, nonce: nonce)
    )
    guard let session = sessionFromAuthResponse(response) else {
      throw HomeboardAPIError.invalidResponse
    }
    return session
  }

  func updateDisplayName(accessToken: String, displayName: String) async throws {
    guard let url = URL(string: "/auth/v1/user", relativeTo: HomeboardConfig.supabaseURL) else {
      throw HomeboardAPIError.invalidURL
    }
    var request = URLRequest(url: url)
    request.httpMethod = "PUT"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(HomeboardConfig.supabasePublishableKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try encoder.encode(
      UserMetadataUpdateRequestBody(data: .init(displayName: displayName))
    )
    let _: SupabaseUserPayload = try await perform(request)
  }

  func resendSignUpConfirmation(email: String) async throws {
    let _: SignUpResendResponse = try await requestSupabase(
      path: "/auth/v1/resend",
      method: "POST",
      body: SignUpResendRequestBody(email: email)
    )
  }

  func requestPasswordReset(email: String) async throws {
    let redirectURL = HomeboardConfig.publicWebBaseURL.appending(path: "reset-password")
    var components = URLComponents(
      url: HomeboardConfig.supabaseURL.appending(path: "auth/v1/recover"),
      resolvingAgainstBaseURL: false
    )
    components?.queryItems = [URLQueryItem(name: "redirect_to", value: redirectURL.absoluteString)]
    guard let url = components?.url else { throw HomeboardAPIError.invalidURL }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(HomeboardConfig.supabasePublishableKey, forHTTPHeaderField: "apikey")
    request.httpBody = try encoder.encode(PasswordRecoveryRequest(email: email))
    let _: PasswordRecoveryResponse = try await perform(request)
  }

  func fetchSession(accessToken: String) async throws -> MobileSessionResponse {
    try await requestBackend(
      path: "/api/mobile/session",
      accessToken: accessToken,
      timeoutInterval: 8
    )
  }

  func fetchHealth() async throws -> MobileHealthResponse {
    guard let url = URL(string: "/api/health", relativeTo: HomeboardConfig.backendBaseURL) else {
      throw HomeboardAPIError.invalidURL
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.timeoutInterval = 8
    return try await perform(request)
  }

  func fetchBootstrapSession(accessToken: String) async throws -> MobileSessionResponse {
    try await requestBackend(
      path: "/api/mobile/session?includeBoard=1",
      accessToken: accessToken,
      timeoutInterval: boardRequestTimeout
    )
  }

  func fetchBoard(accessToken: String, boardId: String) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)",
      accessToken: accessToken,
      timeoutInterval: boardRequestTimeout
    )
  }

  func fetchListingInventory(
    accessToken: String,
    boardId: String,
    view: String,
    minimumLatitude: Double? = nil,
    maximumLatitude: Double? = nil,
    minimumLongitude: Double? = nil,
    maximumLongitude: Double? = nil,
    maximumPrice: Double? = nil,
    minimumBedrooms: Double? = nil,
    query: String? = nil,
    cursor: String? = nil,
    limit: Int
  ) async throws -> MobileListingInventoryResponse {
    var components = URLComponents()
    components.path = "/api/mobile/boards/\(boardId)/listings"
    components.queryItems = [
      URLQueryItem(name: "view", value: view),
      URLQueryItem(name: "limit", value: String(limit)),
      minimumLatitude.map { URLQueryItem(name: "minLat", value: String($0)) },
      maximumLatitude.map { URLQueryItem(name: "maxLat", value: String($0)) },
      minimumLongitude.map { URLQueryItem(name: "minLng", value: String($0)) },
      maximumLongitude.map { URLQueryItem(name: "maxLng", value: String($0)) },
      maximumPrice.map { URLQueryItem(name: "maxPrice", value: String($0)) },
      minimumBedrooms.map { URLQueryItem(name: "minBedrooms", value: String($0)) },
      query.flatMap {
        $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          ? nil
          : URLQueryItem(name: "query", value: $0)
      },
      cursor.map { URLQueryItem(name: "cursor", value: $0) }
    ].compactMap { $0 }

    guard let path = components.string else {
      throw HomeboardAPIError.invalidURL
    }
    return try await requestBackend(path: path, accessToken: accessToken)
  }

  func saveBoardProfile(
    accessToken: String,
    boardId: String,
    profile: RentalProfile
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)",
      method: "PATCH",
      accessToken: accessToken,
      body: SaveBoardProfileRequest(profile: RemoteRentalProfileRequest(profile: profile))
    )
  }

  func renameBoard(accessToken: String, boardId: String, title: String) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)",
      method: "PUT",
      accessToken: accessToken,
      body: MobileBoardRenameRequest(title: title)
    )
  }

  func sendBoardMessage(
    accessToken: String,
    boardId: String,
    content: String,
    tone: String? = nil,
    regenerateOnly: Bool? = nil
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/messages",
      method: "POST",
      accessToken: accessToken,
      body: MobileBoardMessageCreateRequest(content: content, tone: tone, regenerateOnly: regenerateOnly)
    )
  }

  func fetchAdvisorWalletStatus(
    accessToken: String,
    boardId: String
  ) async throws -> AdvisorWalletStatus {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/wallet",
      accessToken: accessToken
    )
  }

  func createAdvisorFundingIntent(
    accessToken: String,
    boardId: String,
    amountCents: Int
  ) async throws -> MobileAdvisorFundResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/wallet/fund",
      method: "POST",
      accessToken: accessToken,
      body: MobileAdvisorFundRequest(amountCents: amountCents)
    )
  }

  func addListing(accessToken: String, boardId: String, listing: ListingPreview) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings",
      method: "POST",
      accessToken: accessToken,
      body: MobileListingCreateRequest(
        title: listing.title,
        address: listing.address.isEmpty ? nil : listing.address,
        unit: listing.unit.isEmpty ? nil : listing.unit,
        location: listing.location,
        city: nil,
        neighborhood: nil,
        latitude: listing.latitude,
        longitude: listing.longitude,
        price: Self.number(from: listing.priceLine),
        bedrooms: Double(listing.bedrooms),
        bathrooms: Double(listing.bathrooms),
        squareFeet: listing.squareFeet,
        availableDate: listing.availableDate,
        amenities: listing.amenities.isEmpty ? nil : listing.amenities,
        modelInsights: listing.modelInsights.isEmpty ? nil : listing.modelInsights,
        description: listing.summary,
        sourceUrl: listing.sourceURL.isEmpty ? nil : listing.sourceURL,
        imageUrl: listing.photoURL.isEmpty ? nil : listing.photoURL,
        groupNote: listing.groupNote.isEmpty ? nil : listing.groupNote,
        agentName: listing.contact?.agentName,
        agentPhone: listing.contact?.agentPhone,
        agentEmail: listing.contact?.agentEmail,
        brokerage: listing.contact?.brokerage
      )
    )
  }

  func updateListing(
    accessToken: String,
    boardId: String,
    listingId: String,
    status: String? = nil,
    note: String? = nil,
    workflowStatus: String? = nil
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)",
      method: "PATCH",
      accessToken: accessToken,
      body: MobileListingPatchRequest(status: status, userNotes: note, workflowStatus: workflowStatus)
    )
  }

  func restoreListing(accessToken: String, boardId: String, listingId: String) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)",
      method: "PATCH",
      accessToken: accessToken,
      body: MobileListingPatchRequest(status: nil, userNotes: nil, workflowStatus: nil, restore: true)
    )
  }

  func clearRecentlyDeleted(accessToken: String, boardId: String) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/recently-deleted",
      method: "DELETE",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func purgeExpiredRecentlyDeleted(accessToken: String, boardId: String) async throws {
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/recently-deleted",
      method: "POST",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func previewListingImport(
    accessToken: String,
    url: String,
    address: String?,
    unit: String?,
    price: Double?,
    bedrooms: Double?,
    bathrooms: Double?
  ) async throws -> ListingImportPreviewResponse {
    try await requestBackend(
      path: "/api/mobile/listing-import/preview",
      method: "POST",
      accessToken: accessToken,
      body: ListingImportPreviewRequest(
        url: url,
        address: address,
        unit: unit,
        price: price,
        bedrooms: bedrooms,
        bathrooms: bathrooms
      )
    )
  }

  func attachListingSource(
    accessToken: String,
    boardId: String,
    listingId: String,
    url: String,
    label: String? = nil
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)/sources",
      method: "POST",
      accessToken: accessToken,
      body: ListingSourceRequest(url: url, label: label, kind: "confirmed_exact")
    )
  }

  func markListingSourceOpened(
    accessToken: String,
    boardId: String,
    sourceId: String
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listing-sources/\(sourceId)/opened",
      method: "POST",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func attestListingSource(
    accessToken: String,
    boardId: String,
    sourceId: String
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listing-sources/\(sourceId)/attest",
      method: "POST",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func reportListingSource(
    accessToken: String,
    boardId: String,
    sourceId: String,
    reason: String,
    details: String?
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listing-sources/\(sourceId)/report",
      method: "POST",
      accessToken: accessToken,
      body: CatalogSourceReportRequest(reason: reason, details: details)
    )
  }

  func verifyListing(
    accessToken: String,
    boardId: String,
    listingId: String,
    status: String,
    note: String? = nil
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)/verification",
      method: "POST",
      accessToken: accessToken,
      body: ListingVerificationRequest(status: status, note: note)
    )
  }

  func reviewListing(
    accessToken: String,
    boardId: String,
    listingId: String,
    tourIntent: String,
    interiorAppeal: Int?,
    naturalLight: String,
    mainConcern: String?,
    sourceViewed: Bool
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)/review",
      method: "POST",
      accessToken: accessToken,
      body: ListingQuickReviewRequest(
        tourIntent: tourIntent,
        interiorAppeal: interiorAppeal,
        naturalLight: naturalLight,
        mainConcern: mainConcern,
        sourceViewed: sourceViewed
      )
    )
  }

  func voteOnListingDecision(
    accessToken: String,
    boardId: String,
    listingId: String,
    type: String,
    choice: String
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)/decisions",
      method: "POST",
      accessToken: accessToken,
      body: ListingDecisionRequest(type: type, choice: choice)
    )
  }

  func trackListingComparison(
    accessToken: String,
    boardId: String,
    listingIds: [String]
  ) async throws {
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/analytics",
      method: "POST",
      accessToken: accessToken,
      body: BoardAnalyticsRequest(event: "listing_comparison_opened", listingIds: listingIds)
    )
  }

  func archiveListing(accessToken: String, boardId: String, listingId: String) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)",
      method: "DELETE",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func reactToListing(accessToken: String, boardId: String, listingId: String, vote: String, note: String? = nil) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)/reactions",
      method: "POST",
      accessToken: accessToken,
      body: MobileReactionRequest(vote: vote, note: note)
    )
  }

  func commentOnListing(accessToken: String, boardId: String, listingId: String, content: String) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)/comments",
      method: "POST",
      accessToken: accessToken,
      body: MobileCommentRequest(content: content)
    )
  }

  func rateListing(accessToken: String, boardId: String, listingId: String, ratings: [String: Int]) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/listings/\(listingId)/ratings",
      method: "POST",
      accessToken: accessToken,
      body: MobileListingRatingsRequest(ratings: ratings)
    )
  }

  func addBoardUpdate(accessToken: String, boardId: String, content: String) async throws -> MobileBoardLoadResponse {
    try await boardUpdate(accessToken: accessToken, boardId: boardId, body: .init(content: content))
  }

  private func boardUpdate(accessToken: String, boardId: String, body: MobileBoardUpdateRequest) async throws -> MobileBoardLoadResponse {
    try await requestBackend(path: "/api/mobile/boards/\(boardId)/updates", method: "POST", accessToken: accessToken, body: body)
  }

  func addMember(
    accessToken: String,
    boardId: String,
    name: String,
    budgetMin: Double?,
    budgetMax: Double?,
    stretchBudget: Double?,
    commuteDestination: String?,
    maxCommuteMinutes: Int?,
    roleLabel: String? = nil,
    commuteAccess: String? = nil,
    preferredCommuteMinutes: Int? = nil
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/members",
      method: "POST",
      accessToken: accessToken,
      body: MobileMemberCreateRequest(
        name: name,
        roleLabel: roleLabel,
        budgetMin: budgetMin,
        idealBudget: budgetMax,
        budgetMax: budgetMax,
        stretchBudget: stretchBudget,
        commuteDestination: commuteDestination,
        commuteAccess: commuteAccess,
        preferredCommuteMinutes: preferredCommuteMinutes,
        maxCommuteMinutes: maxCommuteMinutes,
        petsRequired: nil,
        accessibilityNeeds: nil
      )
    )
  }

  func updateMember(accessToken: String, boardId: String, memberId: String, member: MemberPreferenceCard) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/members/\(memberId)",
      method: "PATCH",
      accessToken: accessToken,
      body: MobileMemberPatchRequest(
        name: member.status == "commute point" ? member.name : nil,
        budgetMin: member.budgetMin,
        idealBudget: member.idealBudget,
        budgetMax: member.budgetMax,
        stretchBudget: member.stretchBudget,
        commuteDestination: member.commuteDestination,
        commuteAccess: member.commuteAccess,
        preferredCommuteMinutes: member.preferredCommuteMinutes,
        maxCommuteMinutes: member.maxCommuteMinutes,
        preferredNeighborhoods: member.neighborhoods,
        mustHaves: member.mustHaves,
        dealbreakers: member.dealbreakers,
        commutePriority: member.priorities.contains("commute") ? "high" : "medium",
        neighborhoodPriority: member.priorities.contains("neighborhood") ? "high" : "medium",
        spacePriority: member.priorities.contains("space") ? "high" : "medium",
        privacyPriority: member.priorities.contains("privacy") ? "high" : "medium",
        petsRequired: member.petsRequired,
        accessibilityNeeds: member.accessibilityNeeds?.joined(separator: ", "),
        notes: nil
      )
    )
  }

  func removeMember(accessToken: String, boardId: String, memberId: String) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/members/\(memberId)",
      method: "DELETE",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func leaveBoard(accessToken: String, boardId: String) async throws {
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/membership",
      method: "DELETE",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func deleteBoard(accessToken: String, boardId: String) async throws {
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/membership?action=delete",
      method: "DELETE",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func uploadListingImage(accessToken: String, boardId: String, data: Data, fileExtension: String = "jpg", contentType: String = "image/jpeg") async throws -> String {
    guard let url = URL(string: "/api/mobile/boards/\(boardId)/uploads", relativeTo: HomeboardConfig.backendBaseURL) else {
      throw HomeboardAPIError.invalidURL
    }
    let boundary = "Boundary-\(UUID().uuidString)"
    var body = Data()
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"file\"; filename=\"listing.\(fileExtension)\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
    body.append(data)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = body
    let response: UploadResponse = try await perform(request)
    return response.url
  }

  func registerPushDevice(accessToken: String, token: String) async throws {
    #if DEBUG
    let environment = "development"
    #else
    let environment = "production"
    #endif
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/push-devices",
      method: "POST",
      accessToken: accessToken,
      body: PushDeviceRequest(token: token, environment: environment)
    )
  }

  func unregisterPushDevice(accessToken: String, token: String) async throws {
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/push-devices",
      method: "DELETE",
      accessToken: accessToken,
      body: PushDeviceDeleteRequest(token: token)
    )
  }

  func uploadNativeDiagnostics(accessToken: String, payloads: [String]) async throws {
    guard !payloads.isEmpty else { return }
    let info = Bundle.main.infoDictionary
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/diagnostics",
      method: "POST",
      accessToken: accessToken,
      body: NativeDiagnosticsRequest(
        payloads: payloads,
        appVersion: info?["CFBundleShortVersionString"] as? String ?? "unknown",
        buildNumber: info?["CFBundleVersion"] as? String ?? "unknown"
      )
    )
  }

  func submitBugReport(
    accessToken: String,
    description: String,
    currentScreen: String,
    boardId: String?,
    deviceKind: String,
    boardLoaded: Bool,
    boardCount: Int,
    memberCount: Int,
    savedListingCount: Int,
    shareDiagnostics: String
  ) async throws -> MobileBugReportResponse {
    let info = Bundle.main.infoDictionary
    return try await requestBackend(
      path: "/api/mobile/bug-reports",
      method: "POST",
      accessToken: accessToken,
      body: MobileBugReportRequest(
        description: description,
        currentScreen: currentScreen,
        boardId: boardId,
        appVersion: info?["CFBundleShortVersionString"] as? String ?? "unknown",
        buildNumber: info?["CFBundleVersion"] as? String ?? "unknown",
        deviceKind: deviceKind,
        osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
        boardLoaded: boardLoaded,
        boardCount: boardCount,
        memberCount: memberCount,
        savedListingCount: savedListingCount,
        shareDiagnostics: shareDiagnostics
      )
    )
  }

  private static func number(from text: String) -> Double? {
    let digits = text.filter { $0.isNumber || $0 == "." }
    return Double(digits)
  }

  func sendOnboardingTurn(
    accessToken: String,
    message: String,
    profile: RentalProfile,
    messages: [OnboardingChatMessage]
  ) async throws -> MobileOnboardingTurnResponse {
    let payload = MobileOnboardingTurnRequest(
      message: message,
      profile: RemoteRentalProfileRequest(profile: profile),
      messages: messages.map {
        RemoteChatMessageRequest(
          role: $0.role == .assistant ? "assistant" : "user",
          content: $0.content,
          authorName: $0.role == .assistant ? "Homeboard setup" : nil
        )
      }
    )

    return try await requestBackend(
      path: "/api/mobile/onboarding",
      method: "POST",
      accessToken: accessToken,
      body: payload
    )
  }

  func confirmOnboarding(
    accessToken: String,
    profile: RentalProfile,
    creationRequestId: String
  ) async throws -> MobileOnboardingConfirmResponse {
    try await requestBackend(
      path: "/api/mobile/onboarding",
      method: "POST",
      accessToken: accessToken,
      body: MobileOnboardingConfirmRequest(
        profile: RemoteRentalProfileRequest(profile: profile),
        creationRequestId: creationRequestId
      )
    )
  }

  func createInvitation(
    accessToken: String,
    boardId: String
  ) async throws -> MobileInvitationCreateResponse {
    try await requestBackend(
      path: "/api/mobile/invitations",
      method: "POST",
      accessToken: accessToken,
      body: MobileInvitationCreateRequest(boardId: boardId)
    )
  }

  func acceptInvitation(
    accessToken: String,
    inviteCode: String
  ) async throws -> MobileInvitationAcceptResponse {
    try await requestBackend(
      path: "/api/mobile/invitations/\(inviteCode)/accept",
      method: "POST",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func revokeInvitation(accessToken: String, invitationId: String) async throws {
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/invitations",
      method: "DELETE",
      accessToken: accessToken,
      body: MobileInvitationRevokeRequest(invitationId: invitationId)
    )
  }

  func deleteAccount(accessToken: String) async throws {
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/account",
      method: "DELETE",
      accessToken: accessToken,
      body: EmptyRequestBody()
    )
  }

  func approveMacDevicePairing(
    accessToken: String,
    request pairing: MacDevicePairingRequest
  ) async throws -> MacDevicePairingApprovalResponse {
    try await requestBackend(
      path: "/api/mobile/device-pairings/\(pairing.id)/approve",
      method: "POST",
      accessToken: accessToken,
      body: MacDevicePairingApprovalRequest(approvalCode: pairing.approvalCode)
    )
  }

  private func sessionFromAuthResponse(_ response: SupabaseAuthResponse) -> NativeAuthSession? {
    if let session = response.session {
      let email = session.user.email ?? "unknown@homeboard.app"
      let displayName = session.user.user_metadata?.resolvedDisplayName
      return NativeAuthSession(
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userId: session.user.id,
        email: email,
        displayName: displayName?.isEmpty == false ? displayName! : email.components(separatedBy: "@").first ?? "Board member"
      )
    }

    if let accessToken = response.access_token,
       let refreshToken = response.refresh_token,
       let user = response.user {
      let email = user.email ?? "unknown@homeboard.app"
      let displayName = user.user_metadata?.resolvedDisplayName
      return NativeAuthSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
        userId: user.id,
        email: email,
        displayName: displayName?.isEmpty == false ? displayName! : email.components(separatedBy: "@").first ?? "Board member"
      )
    }

    return nil
  }

  private func requestSupabase<Response: Decodable, Body: Encodable>(
    path: String,
    method: String,
    body: Body
  ) async throws -> Response {
    guard let url = URL(string: path, relativeTo: HomeboardConfig.supabaseURL) else {
      throw HomeboardAPIError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(HomeboardConfig.supabasePublishableKey, forHTTPHeaderField: "apikey")
    request.httpBody = try encoder.encode(body)
    request.timeoutInterval = 12

    return try await perform(request)
  }

  private func requestBackend<Response: Decodable, Body: Encodable>(
    path: String,
    method: String,
    accessToken: String,
    body: Body
  ) async throws -> Response {
    guard let url = URL(string: path, relativeTo: HomeboardConfig.backendBaseURL) else {
      throw HomeboardAPIError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try encoder.encode(body)
    request.timeoutInterval = backendRequestTimeout

    return try await perform(request)
  }

  private func requestBackend<Response: Decodable>(
    path: String,
    accessToken: String,
    timeoutInterval: TimeInterval? = nil
  ) async throws -> Response {
    guard let url = URL(string: path, relativeTo: HomeboardConfig.backendBaseURL) else {
      throw HomeboardAPIError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.timeoutInterval = timeoutInterval ?? backendRequestTimeout

    return try await perform(request)
  }

  private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await dataForRequestWithTransientRetry(request)
    } catch {
      if let urlError = error as? URLError {
        switch urlError.code {
        case .cancelled:
          throw CancellationError()
        case .timedOut:
          throw HomeboardAPIError.server(
            "Homeboard’s server took too long to respond. Tap Retry to reconnect."
          )
        case .notConnectedToInternet:
          throw HomeboardAPIError.server(
            "This device is offline. Reconnect, then tap Retry."
          )
        case .cannotFindHost, .dnsLookupFailed, .cannotConnectToHost,
             .networkConnectionLost, .resourceUnavailable:
          throw HomeboardAPIError.server("Homeboard could not reach the server. Check your connection and try again.")
        default:
          throw HomeboardAPIError.server(urlError.localizedDescription)
        }
      }
      throw error
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw HomeboardAPIError.invalidResponse
    }

    if (200..<300).contains(httpResponse.statusCode) {
      do {
        return try decoder.decode(Response.self, from: data)
      } catch {
        throw responseError(
          request: request,
          response: httpResponse,
          data: data,
          message: "The server response could not be decoded."
        )
      }
    }

    let apiError = (try? decoder.decode(APIErrorPayload.self, from: data))?.resolvedMessage ?? "Request failed."
    if httpResponse.statusCode == 401 {
      throw HomeboardAPIError.unauthorized
    }
    throw responseError(
      request: request,
      response: httpResponse,
      data: data,
      message: apiError
    )
  }

  private func responseError(
    request: URLRequest,
    response: HTTPURLResponse,
    data: Data,
    message: String?
  ) -> HomeboardAPIError {
    let method = request.httpMethod ?? "GET"
    let path = request.url?.path.isEmpty == false ? request.url!.path : "/"
    let contentType = response.value(forHTTPHeaderField: "Content-Type") ?? "unknown"
    let rawBody = String(data: data, encoding: .utf8) ?? "<\(data.count) non-text bytes>"
    let compactBody = rawBody
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let excerpt = compactBody.isEmpty ? "<empty>" : String(compactBody.prefix(240))
    return .response(
      endpoint: "\(method) \(path)",
      status: response.statusCode,
      contentType: contentType,
      bodyExcerpt: excerpt,
      message: message
    )
  }

  private func dataForRequestWithTransientRetry(
    _ request: URLRequest
  ) async throws -> (Data, URLResponse) {
    do {
      return try await session.data(for: request)
    } catch let urlError as URLError {
      guard request.httpMethod == "GET", Self.shouldRetryImmediately(urlError) else {
        throw urlError
      }
      try Task.checkCancellation()
      return try await session.data(for: request)
    }
  }

  private static func shouldRetryImmediately(_ error: URLError) -> Bool {
    switch error.code {
    case .cannotFindHost, .dnsLookupFailed, .cannotConnectToHost,
         .networkConnectionLost, .resourceUnavailable:
      return true
    default:
      return false
    }
  }
}

private struct EmptyRequestBody: Encodable {}
private struct EmptyResponse: Decodable { var ok: Bool }

extension RentalProfile {
  init(remote: RemoteRentalProfilePayload) {
    self.name = remote.name
    self.city = remote.city ?? ""
    self.moveInDate = remote.moveInDate ?? ""
    self.groupSize = remote.groupSize ?? 1
    self.budgetMin = Self.stringAmount(remote.budgetMin)
    self.budgetMax = Self.stringAmount(remote.budgetMax)
    self.commuteTarget = remote.commuteTarget ?? ""
    self.commuteAccess = remote.commuteAccess
    self.minCommuteMinutes = remote.minCommuteMinutes.map(String.init) ?? ""
    self.maxCommuteMinutes = remote.maxCommuteMinutes.map(String.init) ?? ""
    self.neighborhoods = remote.neighborhoods
    self.mustHaves = remote.mustHaves
    self.dealbreakers = remote.dealbreakers
    self.priorities = remote.priorities
    self.readiness.notes = remote.notes ?? ""
  }

  private static func stringAmount(_ value: Double?) -> String {
    guard let value else { return "" }
    let rounded = Int(value.rounded())
    return rounded == 0 ? "" : String(rounded)
  }
}

extension OnboardingChatMessage {
  init(remote: RemoteChatMessagePayload) {
    self.id = UUID(uuidString: remote.id) ?? UUID()
    self.role = remote.role == "assistant" ? .assistant : .user
    self.content = remote.content
  }
}

extension RemoteRentalProfileRequest {
  init(profile: RentalProfile) {
    let now = ISO8601DateFormatter().string(from: Date())
    self.id = UUID().uuidString
    self.boardId = "onboarding-draft"
    self.name = profile.name
    self.email = nil
    self.city = profile.city.isEmpty ? nil : profile.city
    self.moveInDate = profile.moveInDate.isEmpty ? nil : profile.moveInDate
    self.budgetMin = Double(profile.budgetMin)
    self.budgetMax = Double(profile.budgetMax)
    self.stretchBudget = nil
    self.neighborhoods = profile.neighborhoods
    self.commuteTarget = profile.commuteTarget.isEmpty ? nil : profile.commuteTarget
    self.commuteAccess = profile.commuteAccess
    self.minCommuteMinutes = Int(profile.minCommuteMinutes)
    self.maxCommuteMinutes = Int(profile.maxCommuteMinutes)
    self.mustHaves = profile.mustHaves
    self.dealbreakers = profile.dealbreakers
    self.niceToHaves = []
    self.priorities = profile.priorities
    self.pets = nil
    self.parking = nil
    self.groupSize = profile.groupSize
    self.hasRoommates = profile.groupSize > 1
    self.rentalReadiness = RentalReadinessRequest(
      hasOfferLetter: profile.readiness.hasOfferLetter,
      needsGuarantor: profile.readiness.needsGuarantor,
      hasProofOfIncome: profile.readiness.hasProofOfIncome
    )
    self.completionStatus = profile.isBoardReady ? "complete" : "incomplete"
    self.notes = profile.readiness.notes.isEmpty ? nil : profile.readiness.notes
    self.createdAt = now
    self.updatedAt = now
    self.locations = profile.city.isEmpty ? [] : [profile.city]
  }
}
