import Foundation

enum HomeboardConfig {
  private static let productionBackendBaseURL = URL(
    string: "https://real-estate-samyanmangat-6662s-projects.vercel.app"
  )!

  static var appVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
      ?? "0.0.13"
  }

  static let supabaseURL = URL(string: "https://zlhniurrhhstivtmixuh.supabase.co")!
  static let supabasePublishableKey = "sb_publishable_eNgMkBhv8l___GC0IjgIBQ_4jqCepCK"

  static var backendBaseURL: URL {
    #if DEBUG
    if let override = ProcessInfo.processInfo.environment["HOMEBOARD_API_BASE_URL"],
       let url = validBaseURL(override, allowsInsecureLocalhost: true) {
      return url
    }
    #endif
    if let configured = Bundle.main.object(forInfoDictionaryKey: "HomeboardAPIBaseURL") as? String,
       let url = validBaseURL(configured, allowsInsecureLocalhost: false) {
      return url
    }
    // A missing build substitution must not quietly point a physical beta
    // device at itself. Keep the last-known production origin as the safe
    // fallback; local development remains available through the DEBUG-only
    // process environment override above.
    return productionBackendBaseURL
  }

  static var publicWebBaseURL: URL {
    #if DEBUG
    if let override = ProcessInfo.processInfo.environment["HOMEBOARD_PUBLIC_WEB_URL"],
       let url = validBaseURL(override, allowsInsecureLocalhost: true) {
      return url
    }
    #endif
    if let configured = Bundle.main.object(forInfoDictionaryKey: "HomeboardPublicWebURL") as? String,
       let url = validBaseURL(configured, allowsInsecureLocalhost: false) {
      return url
    }
    return backendBaseURL
  }

  private static func validBaseURL(
    _ rawValue: String,
    allowsInsecureLocalhost: Bool
  ) -> URL? {
    let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty,
          !value.contains("$("),
          var components = URLComponents(string: value),
          let scheme = components.scheme?.lowercased(),
          let host = components.host?.lowercased(),
          !host.isEmpty
    else { return nil }

    let isLocalhost = host == "localhost" || host == "127.0.0.1" || host == "::1"
    guard scheme == "https" || (allowsInsecureLocalhost && isLocalhost && scheme == "http") else {
      return nil
    }

    components.path = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    components.query = nil
    components.fragment = nil
    return components.url
  }
}
