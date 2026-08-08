import AuthenticationServices
import CryptoKit
import Foundation
import Security

struct HomeboardAppleCredential {
  var identityToken: String
  var nonce: String
  var displayName: String?
}

enum HomeboardAppleSignInError: LocalizedError {
  case missingNonce
  case missingIdentityToken
  case unreadableIdentityToken
  case randomNumberFailure(OSStatus)

  var errorDescription: String? {
    switch self {
    case .missingNonce:
      return "Apple sign-in expired before it finished. Please try again."
    case .missingIdentityToken, .unreadableIdentityToken:
      return "Apple did not return a usable sign-in credential. Please try again."
    case .randomNumberFailure:
      return "Homeboard could not securely start Apple sign-in. Please try again."
    }
  }
}

enum HomeboardAppleSignIn {
  static func prepare(_ request: ASAuthorizationAppleIDRequest) throws -> String {
    let nonce = try randomNonce()
    request.requestedScopes = [.fullName, .email]
    request.nonce = hashed(nonce)
    return nonce
  }

  static func credential(
    from authorization: ASAuthorization,
    nonce: String?
  ) throws -> HomeboardAppleCredential {
    guard let nonce else {
      throw HomeboardAppleSignInError.missingNonce
    }
    guard let appleCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
          let tokenData = appleCredential.identityToken else {
      throw HomeboardAppleSignInError.missingIdentityToken
    }
    guard let identityToken = String(data: tokenData, encoding: .utf8) else {
      throw HomeboardAppleSignInError.unreadableIdentityToken
    }

    let formattedName = appleCredential.fullName.map {
      PersonNameComponentsFormatter().string(from: $0)
    }?
      .trimmingCharacters(in: .whitespacesAndNewlines)

    return HomeboardAppleCredential(
      identityToken: identityToken,
      nonce: nonce,
      displayName: formattedName?.isEmpty == false ? formattedName : nil
    )
  }

  private static func hashed(_ value: String) -> String {
    SHA256.hash(data: Data(value.utf8))
      .map { String(format: "%02x", $0) }
      .joined()
  }

  private static func randomNonce(length: Int = 32) throws -> String {
    precondition(length > 0)
    let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var result = ""
    var remaining = length

    while remaining > 0 {
      var randomBytes = [UInt8](repeating: 0, count: 16)
      let status = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
      guard status == errSecSuccess else {
        throw HomeboardAppleSignInError.randomNumberFailure(status)
      }

      for byte in randomBytes where remaining > 0 && byte < characters.count {
        result.append(characters[Int(byte)])
        remaining -= 1
      }
    }
    return result
  }
}
