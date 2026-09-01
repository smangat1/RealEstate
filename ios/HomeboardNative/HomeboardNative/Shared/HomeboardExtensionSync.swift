import CryptoKit
import Foundation
import Security

struct HomeboardSharedAuthContext: Codable, Sendable, Equatable {
  var accessToken: String
  var refreshToken: String
  var userId: String
  var email: String
  var displayName: String
}

struct HomeboardSharedBoard: Codable, Identifiable, Sendable, Equatable {
  var id: String
  var title: String
  var city: String
}

struct HomeboardDevicePairingChallenge: Sendable, Equatable {
  var id: String
  var deviceName: String
  var approvalCode: String
  var expiresAt: String
  var deepLink: URL
  var clientSecret: String
}

struct HomeboardDevicePairingStatus: Decodable, Sendable, Equatable {
  var status: String
  var deviceName: String?
  var tokenHash: String?
  var verificationType: String?
  var expiresAt: String
}

enum HomeboardSharedAuthStore {
  private static let service = "com.homeboard.native.shared-auth"
  private static let account = "supabase.session"

  static func load() -> HomeboardSharedAuthContext? {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(
      query(returningData: true) as CFDictionary,
      &result
    )
    guard status == errSecSuccess, let data = result as? Data else { return nil }
    return try? JSONDecoder().decode(HomeboardSharedAuthContext.self, from: data)
  }

  @discardableResult
  static func save(_ context: HomeboardSharedAuthContext?) -> Bool {
    guard let context, let data = try? JSONEncoder().encode(context) else {
      delete()
      return context == nil
    }

    let lookup = query(returningData: false)
    let updateStatus = SecItemUpdate(
      lookup as CFDictionary,
      [kSecValueData: data] as CFDictionary
    )
    if updateStatus == errSecSuccess {
      return true
    }
    guard updateStatus == errSecItemNotFound else {
      return false
    }

    var addition = lookup
    addition[kSecValueData] = data
    addition[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlock
    return SecItemAdd(addition as CFDictionary, nil) == errSecSuccess
  }

  static func delete() {
    SecItemDelete(query(returningData: false) as CFDictionary)
  }

  static func verifyRoundTrip() -> Bool {
    if let existing = load() {
      return save(existing) && load() == existing
    }
    let probe = HomeboardSharedAuthContext(
      accessToken: "homeboard-keychain-probe",
      refreshToken: "homeboard-keychain-probe",
      userId: "homeboard-keychain-probe",
      email: "probe@homeboard.local",
      displayName: "Homeboard probe"
    )
    guard save(probe) else { return false }
    let succeeded = load() == probe
    delete()
    return succeeded
  }

  private static func query(returningData: Bool) -> [CFString: Any] {
    var value: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: service,
      kSecAttrAccount: account
    ]
    value[kSecAttrAccessGroup] = accessGroup
    #if os(macOS)
    value[kSecUseDataProtectionKeychain] = true
    #endif
    if returningData {
      value[kSecReturnData] = true
      value[kSecMatchLimit] = kSecMatchLimitOne
    }
    return value
  }

  private static var accessGroup: String {
    if
      let configured = Bundle.main.object(
        forInfoDictionaryKey: "HomeboardKeychainAccessGroup"
      ) as? String
    {
      let cleaned = configured.trimmingCharacters(in: .whitespacesAndNewlines)
      if !cleaned.isEmpty, !cleaned.contains("$(") {
        return cleaned
      }
    }
    return "4SSAVHCM6U.com.homeboard.native.shared"
  }

}

enum HomeboardExtensionSyncError: LocalizedError {
  case missingSession
  case missingBoard
  case invalidListing
  case invalidConfiguration
  case credentialStorage
  case unauthorized
  case server(String)

  var errorDescription: String? {
    switch self {
    case .missingSession:
      return "Open Homeboard and connect this device first."
    case .missingBoard:
      return "Choose an active Homeboard before saving."
    case .invalidListing:
      return "Confirm the address, rent, bedrooms, and bathrooms first."
    case .invalidConfiguration:
      return "Homeboard’s server connection is not configured."
    case .credentialStorage:
      return "Homeboard could not securely connect this app and its Safari extension."
    case .unauthorized:
      return "Your Homeboard session expired. Open Homeboard and sign in again."
    case .server(let message):
      return message
    }
  }
}

enum HomeboardExtensionSyncClient {
  private static let supabaseURL = URL(
    string: "https://zlhniurrhhstivtmixuh.supabase.co"
  )!
  private static let supabasePublishableKey =
    "sb_publishable_eNgMkBhv8l___GC0IjgIBQ_4jqCepCK"

  static func createDevicePairing(
    deviceName: String
  ) async throws -> HomeboardDevicePairingChallenge {
    let clientSecret = try securePairingSecret()
    var request = try backendRequest(
      path: "api/mobile/device-pairings",
      method: "POST"
    )
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(
      CreateDevicePairingRequest(
        deviceName: deviceName,
        clientSecretHash: sha256Hex(clientSecret)
      )
    )
    let response: CreateDevicePairingResponse = try await decodedResponse(for: request)
    guard let deepLink = URL(string: response.deepLink) else {
      throw HomeboardExtensionSyncError.server("Homeboard received an invalid pairing code.")
    }
    return HomeboardDevicePairingChallenge(
      id: response.id,
      deviceName: response.deviceName,
      approvalCode: response.approvalCode,
      expiresAt: response.expiresAt,
      deepLink: deepLink,
      clientSecret: clientSecret
    )
  }

  static func devicePairingStatus(
    _ challenge: HomeboardDevicePairingChallenge
  ) async throws -> HomeboardDevicePairingStatus {
    var request = try backendRequest(
      path: "api/mobile/device-pairings/\(challenge.id)",
      method: "GET"
    )
    request.setValue(
      challenge.clientSecret,
      forHTTPHeaderField: "X-Homeboard-Pairing-Secret"
    )
    return try await decodedResponse(for: request)
  }

  static func redeemDevicePairing(
    tokenHash: String
  ) async throws -> HomeboardSharedAuthContext {
    let url = supabaseURL.appending(path: "auth/v1/verify")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(supabasePublishableKey, forHTTPHeaderField: "apikey")
    request.httpBody = try JSONEncoder().encode(
      VerifyDevicePairingTokenRequest(token_hash: tokenHash)
    )
    let response: SupabaseAuthResponse = try await decodedResponse(for: request)
    let context = try sharedContext(from: response, fallback: nil)
    guard HomeboardSharedAuthStore.save(context) else {
      throw HomeboardExtensionSyncError.credentialStorage
    }
    return context
  }

  static func completeDevicePairing(
    _ challenge: HomeboardDevicePairingChallenge,
    accessToken: String
  ) async throws {
    var request = try backendRequest(
      path: "api/mobile/device-pairings/\(challenge.id)/complete",
      method: "POST",
      accessToken: accessToken
    )
    request.setValue(
      challenge.clientSecret,
      forHTTPHeaderField: "X-Homeboard-Pairing-Secret"
    )
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = Data("{}".utf8)
    let _: DevicePairingCompletionResponse = try await decodedResponse(for: request)
  }

  static func cancelDevicePairing(
    _ challenge: HomeboardDevicePairingChallenge
  ) async {
    guard var request = try? backendRequest(
      path: "api/mobile/device-pairings/\(challenge.id)",
      method: "DELETE"
    ) else { return }
    request.setValue(
      challenge.clientSecret,
      forHTTPHeaderField: "X-Homeboard-Pairing-Secret"
    )
    let _: DevicePairingCompletionResponse? = try? await decodedResponse(for: request)
  }

  static func signIn(
    email: String,
    password: String
  ) async throws -> HomeboardSharedAuthContext {
    let endpoint = supabaseURL.appending(
      path: "auth/v1/token"
    )
    guard var components = URLComponents(
      url: endpoint,
      resolvingAgainstBaseURL: false
    ) else {
      throw HomeboardExtensionSyncError.invalidConfiguration
    }
    components.queryItems = [
      URLQueryItem(name: "grant_type", value: "password")
    ]
    guard let url = components.url else {
      throw HomeboardExtensionSyncError.invalidConfiguration
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(supabasePublishableKey, forHTTPHeaderField: "apikey")
    request.httpBody = try JSONEncoder().encode(
      SignInRequest(email: email, password: password)
    )

    let response: SupabaseAuthResponse = try await decodedResponse(for: request)
    let context = try sharedContext(from: response, fallback: nil)
    guard HomeboardSharedAuthStore.save(context) else {
      throw HomeboardExtensionSyncError.credentialStorage
    }
    return context
  }

  static func signInWithApple(
    identityToken: String,
    nonce: String,
    displayName: String?
  ) async throws -> HomeboardSharedAuthContext {
    let endpoint = supabaseURL.appending(path: "auth/v1/token")
    guard var components = URLComponents(
      url: endpoint,
      resolvingAgainstBaseURL: false
    ) else {
      throw HomeboardExtensionSyncError.invalidConfiguration
    }
    components.queryItems = [
      URLQueryItem(name: "grant_type", value: "id_token")
    ]
    guard let url = components.url else {
      throw HomeboardExtensionSyncError.invalidConfiguration
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(supabasePublishableKey, forHTTPHeaderField: "apikey")
    request.httpBody = try JSONEncoder().encode(
      AppleIDTokenRequest(
        id_token: identityToken,
        nonce: nonce
      )
    )

    let response: SupabaseAuthResponse = try await decodedResponse(for: request)
    var context = try sharedContext(
      from: response,
      fallback: nil,
      fallbackDisplayName: displayName
    )
    if let cleanName = displayName?
      .trimmingCharacters(in: .whitespacesAndNewlines),
       !cleanName.isEmpty {
      try? await updateDisplayName(
        accessToken: context.accessToken,
        displayName: cleanName
      )
      context.displayName = cleanName
    }
    guard HomeboardSharedAuthStore.save(context) else {
      throw HomeboardExtensionSyncError.credentialStorage
    }
    return context
  }

  private static func updateDisplayName(
    accessToken: String,
    displayName: String
  ) async throws {
    let url = supabaseURL.appending(path: "auth/v1/user")
    var request = URLRequest(url: url)
    request.httpMethod = "PUT"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(supabasePublishableKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONEncoder().encode(
      UserMetadataUpdateRequest(data: .init(displayName: displayName))
    )
    let _: SupabaseUserResponse = try await decodedResponse(for: request)
  }

  static func fetchBoards() async throws -> [HomeboardSharedBoard] {
    var context = try requiredContext()
    do {
      return try await requestBoards(accessToken: context.accessToken)
    } catch HomeboardExtensionSyncError.unauthorized {
      context = try await refresh(context)
      return try await requestBoards(accessToken: context.accessToken)
    }
  }

  static func saveListing(
    _ listing: HomeboardSharedImportStore.PendingImport,
    boardId: String? = nil
  ) async throws {
    guard
      listing.address?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        == false,
      listing.price != nil,
      listing.bedrooms != nil,
      listing.bathrooms != nil
    else {
      throw HomeboardExtensionSyncError.invalidListing
    }

    let destination = boardId ?? listing.boardId
      ?? HomeboardSharedImportStore.activeBoardId
    guard let destination, !destination.isEmpty else {
      throw HomeboardExtensionSyncError.missingBoard
    }

    var context = try requiredContext()
    do {
      try await requestSave(
        listing,
        boardId: destination,
        accessToken: context.accessToken
      )
    } catch HomeboardExtensionSyncError.unauthorized {
      context = try await refresh(context)
      try await requestSave(
        listing,
        boardId: destination,
        accessToken: context.accessToken
      )
    }
  }

  private static func requiredContext() throws -> HomeboardSharedAuthContext {
    guard let context = HomeboardSharedAuthStore.load() else {
      throw HomeboardExtensionSyncError.missingSession
    }
    return context
  }

  private static func requestBoards(
    accessToken: String
  ) async throws -> [HomeboardSharedBoard] {
    let request = try backendRequest(
      path: "api/mobile/session",
      method: "GET",
      accessToken: accessToken
    )
    let response: SessionResponse = try await decodedResponse(for: request)
    return response.boards
  }

  private static func requestSave(
    _ listing: HomeboardSharedImportStore.PendingImport,
    boardId: String,
    accessToken: String
  ) async throws {
    var request = try backendRequest(
      path: "api/mobile/boards/\(boardId)/listings",
      method: "POST",
      accessToken: accessToken
    )
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(
      ListingRequest(
        title: listing.pageTitle ?? listing.address ?? "Rental listing",
        address: listing.address,
        unit: listing.unit,
        location: listing.neighborhood ?? listing.city,
        city: listing.city,
        neighborhood: listing.neighborhood,
        latitude: listing.latitude,
        longitude: listing.longitude,
        price: listing.price,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        amenities: listing.amenities,
        modelInsights: listing.modelInsights,
        description: listing.summary,
        sourceUrl: listing.canonicalURL ?? listing.url,
        imageUrl: listing.imageURL
      )
    )
    let _: SaveResponse = try await decodedResponse(for: request)
  }

  private static func refresh(
    _ current: HomeboardSharedAuthContext
  ) async throws -> HomeboardSharedAuthContext {
    let endpoint = supabaseURL.appending(path: "auth/v1/token")
    guard var components = URLComponents(
      url: endpoint,
      resolvingAgainstBaseURL: false
    ) else {
      throw HomeboardExtensionSyncError.invalidConfiguration
    }
    components.queryItems = [
      URLQueryItem(name: "grant_type", value: "refresh_token")
    ]
    guard let url = components.url else {
      throw HomeboardExtensionSyncError.invalidConfiguration
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(supabasePublishableKey, forHTTPHeaderField: "apikey")
    request.httpBody = try JSONEncoder().encode(
      RefreshRequest(refresh_token: current.refreshToken)
    )
    let response: SupabaseAuthResponse = try await decodedResponse(for: request)
    let context = try sharedContext(from: response, fallback: current)
    guard HomeboardSharedAuthStore.save(context) else {
      throw HomeboardExtensionSyncError.credentialStorage
    }
    return context
  }

  private static func sharedContext(
    from response: SupabaseAuthResponse,
    fallback: HomeboardSharedAuthContext?,
    fallbackDisplayName: String? = nil
  ) throws -> HomeboardSharedAuthContext {
    let session = response.session
    guard
      let accessToken = response.access_token ?? session?.access_token,
      let refreshToken = response.refresh_token ?? session?.refresh_token
    else {
      throw HomeboardExtensionSyncError.unauthorized
    }
    let user = response.user
    let userId = user?.id ?? fallback?.userId ?? ""
    guard !userId.isEmpty else {
      throw HomeboardExtensionSyncError.unauthorized
    }
    let email = user?.email ?? fallback?.email ?? ""
    let displayName = user?.user_metadata?.displayName
      ?? user?.user_metadata?.display_name
      ?? user?.user_metadata?.full_name
      ?? user?.user_metadata?.name
      ?? fallbackDisplayName
      ?? fallback?.displayName
      ?? email.components(separatedBy: "@").first
      ?? "Homeboard user"
    return HomeboardSharedAuthContext(
      accessToken: accessToken,
      refreshToken: refreshToken,
      userId: userId,
      email: email,
      displayName: displayName
    )
  }

  private static func backendRequest(
    path: String,
    method: String,
    accessToken: String
  ) throws -> URLRequest {
    let baseURL = try backendBaseURL()
    let url = path.split(separator: "/").reduce(baseURL) {
      $0.appending(path: String($1))
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.timeoutInterval = 12
    return request
  }

  private static func backendRequest(
    path: String,
    method: String
  ) throws -> URLRequest {
    let baseURL = try backendBaseURL()
    let url = path.split(separator: "/").reduce(baseURL) {
      $0.appending(path: String($1))
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.timeoutInterval = 12
    return request
  }

  private static func securePairingSecret() throws -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
      throw HomeboardExtensionSyncError.server("Homeboard could not create a secure pairing code.")
    }
    return Data(bytes).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private static func sha256Hex(_ value: String) -> String {
    SHA256.hash(data: Data(value.utf8))
      .map { String(format: "%02x", $0) }
      .joined()
  }

  private static func backendBaseURL() throws -> URL {
    if
      let configured = Bundle.main.object(
        forInfoDictionaryKey: "HomeboardAPIBaseURL"
      ) as? String
    {
      let cleaned = configured.trimmingCharacters(in: .whitespacesAndNewlines)
      if !cleaned.isEmpty, !cleaned.contains("$("), let url = URL(string: cleaned) {
        return url
      }
    }
    throw HomeboardExtensionSyncError.invalidConfiguration
  }

  private static func decodedResponse<Response: Decodable>(
    for request: URLRequest
  ) async throws -> Response {
    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await URLSession.shared.data(for: request)
    } catch {
      throw HomeboardExtensionSyncError.server(
        "Homeboard could not reach the shared board. The save remains available locally."
      )
    }

    guard let http = response as? HTTPURLResponse else {
      throw HomeboardExtensionSyncError.server(
        "Homeboard received an unreadable server response."
      )
    }
    if http.statusCode == 401 {
      throw HomeboardExtensionSyncError.unauthorized
    }
    guard (200..<300).contains(http.statusCode) else {
      let serverError = try? JSONDecoder().decode(
        ServerErrorResponse.self,
        from: data
      )
      throw HomeboardExtensionSyncError.server(
        serverError?.error ?? "Homeboard could not save this listing."
      )
    }
    do {
      return try JSONDecoder().decode(Response.self, from: data)
    } catch {
      throw HomeboardExtensionSyncError.server(
        "Homeboard could not understand the server response."
      )
    }
  }
}

private struct SignInRequest: Encodable {
  var email: String
  var password: String
}

private struct RefreshRequest: Encodable {
  var refresh_token: String
}

private struct AppleIDTokenRequest: Encodable {
  var provider = "apple"
  var id_token: String
  var nonce: String
}

private struct CreateDevicePairingRequest: Encodable {
  var deviceName: String
  var clientSecretHash: String
}

private struct CreateDevicePairingResponse: Decodable {
  var id: String
  var deviceName: String
  var approvalCode: String
  var expiresAt: String
  var deepLink: String
}

private struct VerifyDevicePairingTokenRequest: Encodable {
  var token_hash: String
  var type = "magiclink"
}

private struct DevicePairingCompletionResponse: Decodable {
  var ok: Bool
}

private struct UserMetadataUpdateRequest: Encodable {
  struct Metadata: Encodable {
    var displayName: String
  }

  var data: Metadata
}

private struct SupabaseSessionResponse: Decodable {
  var access_token: String
  var refresh_token: String
}

private struct SupabaseUserMetadata: Decodable {
  var displayName: String?
  var display_name: String?
  var full_name: String?
  var name: String?
}

private struct SupabaseUserResponse: Decodable {
  var id: String
  var email: String?
  var user_metadata: SupabaseUserMetadata?
}

private struct SupabaseAuthResponse: Decodable {
  var access_token: String?
  var refresh_token: String?
  var session: SupabaseSessionResponse?
  var user: SupabaseUserResponse?
}

private struct SessionResponse: Decodable {
  var boards: [HomeboardSharedBoard]
}

private struct ListingRequest: Encodable {
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
  var amenities: [String]
  var modelInsights: [HomeboardListingInsight]
  var description: String?
  var sourceUrl: String
  var imageUrl: String?
}

private struct SaveResponse: Decodable {
  var board: SavedBoard

  struct SavedBoard: Decodable {
    var id: String?
  }
}

private struct ServerErrorResponse: Decodable {
  var error: String
}
