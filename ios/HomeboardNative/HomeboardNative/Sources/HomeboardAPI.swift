import Foundation

enum HomeboardAPIError: LocalizedError {
  case invalidURL
  case invalidResponse
  case unauthorized
  case missingSession
  case server(String)

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
    }
  }
}

struct MobileSessionResponse: Decodable {
  var user: RemoteUserPayload
  var boards: [MobileBoardSummary]
}

enum NativeSignUpOutcome {
  case authenticated(NativeAuthSession)
  case confirmationRequired(email: String)
}

struct MobileBoardLoadResponse: Decodable {
  var board: MobileBoard
  var profile: RemoteRentalProfilePayload
  var missingFields: [String]
}

struct MobileListingInventoryResponse: Decodable {
  var listings: [ListingPreview]
  var nextCursor: String?
  var hasMore: Bool
  var source: String
}

struct MobileBoardMessageCreateRequest: Encodable {
  var content: String
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
  var amenities: [String]?
  var modelInsights: [HomeboardListingInsight]?
  var description: String?
  var sourceUrl: String?
  var imageUrl: String?
  var groupNote: String?
}

private struct MobileListingPatchRequest: Encodable {
  var status: String?
  var userNotes: String?
  var workflowStatus: String?
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
  var action: String
  var content: String?
  var question: String?
  var resolution: String?
}

private struct MobileBoardRenameRequest: Encodable {
  var title: String
}

private struct MobileMemberCreateRequest: Encodable {
  var name: String
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
}

private struct MobileInvitationCreateRequest: Encodable {
  var boardId: String
  var email: String?
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

  init(session: URLSession = .shared) {
    self.session = session
    self.decoder = JSONDecoder()
    self.encoder = JSONEncoder()
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

  func fetchBoard(accessToken: String, boardId: String) async throws -> MobileBoardLoadResponse {
    try await requestBackend(path: "/api/mobile/boards/\(boardId)", accessToken: accessToken)
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
    content: String
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/messages",
      method: "POST",
      accessToken: accessToken,
      body: MobileBoardMessageCreateRequest(content: content)
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
        amenities: listing.amenities.isEmpty ? nil : listing.amenities,
        modelInsights: listing.modelInsights.isEmpty ? nil : listing.modelInsights,
        description: listing.summary,
        sourceUrl: listing.sourceURL.isEmpty ? nil : listing.sourceURL,
        imageUrl: listing.photoURL.isEmpty ? nil : listing.photoURL,
        groupNote: listing.groupNote.isEmpty ? nil : listing.groupNote
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
    try await boardUpdate(accessToken: accessToken, boardId: boardId, body: .init(action: "update", content: content, question: nil, resolution: nil))
  }

  func openDecision(accessToken: String, boardId: String, question: String) async throws -> MobileBoardLoadResponse {
    try await boardUpdate(accessToken: accessToken, boardId: boardId, body: .init(action: "open_decision", content: nil, question: question, resolution: nil))
  }

  func resolveDecision(accessToken: String, boardId: String, question: String, resolution: String) async throws -> MobileBoardLoadResponse {
    try await boardUpdate(accessToken: accessToken, boardId: boardId, body: .init(action: "resolve_decision", content: nil, question: question, resolution: resolution))
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
    maxCommuteMinutes: Int?
  ) async throws -> MobileBoardLoadResponse {
    try await requestBackend(
      path: "/api/mobile/boards/\(boardId)/members",
      method: "POST",
      accessToken: accessToken,
      body: MobileMemberCreateRequest(
        name: name,
        budgetMin: budgetMin,
        idealBudget: budgetMax,
        budgetMax: budgetMax,
        stretchBudget: stretchBudget,
        commuteDestination: commuteDestination,
        commuteAccess: nil,
        preferredCommuteMinutes: nil,
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
          authorName: $0.role == .assistant ? "Advisor" : nil
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

  func confirmOnboarding(accessToken: String, profile: RentalProfile) async throws -> MobileOnboardingConfirmResponse {
    try await requestBackend(
      path: "/api/mobile/onboarding",
      method: "POST",
      accessToken: accessToken,
      body: MobileOnboardingConfirmRequest(profile: RemoteRentalProfileRequest(profile: profile))
    )
  }

  func createInvitation(
    accessToken: String,
    boardId: String,
    email: String? = nil
  ) async throws -> MobileInvitationCreateResponse {
    try await requestBackend(
      path: "/api/mobile/invitations",
      method: "POST",
      accessToken: accessToken,
      body: MobileInvitationCreateRequest(boardId: boardId, email: email)
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

  func wipeDevelopmentAccount(accessToken: String) async throws {
    let _: EmptyResponse = try await requestBackend(
      path: "/api/mobile/account?mode=wipe",
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
    if let timeoutInterval {
      request.timeoutInterval = timeoutInterval
    }

    return try await perform(request)
  }

  private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await session.data(for: request)
    } catch {
      if let urlError = error as? URLError {
        switch urlError.code {
        case .cannotConnectToHost, .timedOut, .networkConnectionLost, .notConnectedToInternet:
          throw HomeboardAPIError.server("The iPhone app could not reach Homeboard services. Make sure the web/backend server is running and Supabase config is live.")
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
        throw HomeboardAPIError.invalidResponse
      }
    }

    let apiError = (try? decoder.decode(APIErrorPayload.self, from: data))?.resolvedMessage ?? "Request failed."
    if httpResponse.statusCode == 401 {
      throw HomeboardAPIError.unauthorized
    }
    throw HomeboardAPIError.server(apiError)
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
