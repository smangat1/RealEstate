import Foundation

enum HomeboardConfig {
  static var appVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
      ?? "0.0.11"
  }

  static let supabaseURL = URL(string: "https://zlhniurrhhstivtmixuh.supabase.co")!
  static let supabasePublishableKey = "sb_publishable_eNgMkBhv8l___GC0IjgIBQ_4jqCepCK"

  static var backendBaseURL: URL {
    if let override = ProcessInfo.processInfo.environment["HOMEBOARD_API_BASE_URL"],
       let url = URL(string: override),
       !override.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return url
    }
    if let override = UserDefaults.standard.string(forKey: "homeboard.apiBaseURL"),
       let url = URL(string: override),
       !override.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return url
    }
    if let configured = Bundle.main.object(forInfoDictionaryKey: "HomeboardAPIBaseURL") as? String,
       !configured.contains("$("),
       let url = URL(string: configured),
       !configured.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return url
    }
    return URL(string: "http://127.0.0.1:3000")!
  }

  static var publicWebBaseURL: URL {
    if let override = ProcessInfo.processInfo.environment["HOMEBOARD_PUBLIC_WEB_URL"],
       let url = URL(string: override),
       !override.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return url
    }
    if let override = UserDefaults.standard.string(forKey: "homeboard.publicWebURL"),
       let url = URL(string: override),
       !override.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return url
    }
    if let configured = Bundle.main.object(forInfoDictionaryKey: "HomeboardPublicWebURL") as? String,
       !configured.contains("$("),
       let url = URL(string: configured),
       !configured.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return url
    }
    return backendBaseURL
  }
}
