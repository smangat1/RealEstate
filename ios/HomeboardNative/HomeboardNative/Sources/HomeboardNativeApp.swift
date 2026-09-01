import MetricKit
import SwiftUI
import UIKit
import UserNotifications

extension Notification.Name {
  static let homeboardPushToken = Notification.Name("homeboard.push-token")
  static let homeboardOpenBoardChat = Notification.Name("homeboard.open-board-chat")
  static let homeboardNativeDiagnostics = Notification.Name("homeboard.native-diagnostics")
}

enum PendingNativeDiagnostics {
  private static let key = "homeboard.pending-native-diagnostics"
  private static let lock = NSLock()

  static func append(_ payloads: [String]) {
    guard !payloads.isEmpty else { return }
    lock.lock()
    defer { lock.unlock() }
    let existing = UserDefaults.standard.stringArray(forKey: key) ?? []
    UserDefaults.standard.set(Array((existing + payloads).suffix(4)), forKey: key)
  }

  static func snapshot() -> [String] {
    lock.lock()
    defer { lock.unlock() }
    return UserDefaults.standard.stringArray(forKey: key) ?? []
  }

  static func removeFirst(_ count: Int) {
    guard count > 0 else { return }
    lock.lock()
    defer { lock.unlock() }
    let existing = UserDefaults.standard.stringArray(forKey: key) ?? []
    UserDefaults.standard.set(Array(existing.dropFirst(min(count, existing.count))), forKey: key)
  }
}

enum PendingBoardNotification {
  private static let key = "homeboard.pending-notification-board-id"

  static func store(_ boardId: String) {
    UserDefaults.standard.set(boardId, forKey: key)
  }

  static func consume() -> String? {
    let value = UserDefaults.standard.string(forKey: key)
    UserDefaults.standard.removeObject(forKey: key)
    return value
  }
}

enum NativePushService {
  static func shouldOfferAuthorization() async -> Bool {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    return settings.authorizationStatus == .notDetermined
  }

  static func requestAuthorization() async throws {
    let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
    guard granted else { throw HomeboardAPIError.server("Notifications are disabled for Homeboard in Settings.") }
    await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
  }
}

final class HomeboardAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MXMetricManagerSubscriber {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    MXMetricManager.shared.add(self)
    Task {
      let settings = await UNUserNotificationCenter.current().notificationSettings()
      if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
        await MainActor.run { application.registerForRemoteNotifications() }
      }
    }
    return true
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let token = deviceToken.map { String(format: "%02x", $0) }.joined()
    NotificationCenter.default.post(name: .homeboardPushToken, object: token)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let info = response.notification.request.content.userInfo
    if info["type"] as? String == "board_chat", let boardId = info["boardId"] as? String {
      PendingBoardNotification.store(boardId)
      DispatchQueue.main.async {
        NotificationCenter.default.post(name: .homeboardOpenBoardChat, object: boardId)
      }
    }
    completionHandler()
  }

  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    let encoded = payloads.compactMap { payload -> String? in
      let data = payload.jsonRepresentation()
      guard data.count <= 1_500_000 else { return nil }
      return String(data: data, encoding: .utf8)
    }
    PendingNativeDiagnostics.append(encoded)
    DispatchQueue.main.async {
      NotificationCenter.default.post(name: .homeboardNativeDiagnostics, object: nil)
    }
  }
}

@main
struct HomeboardNativeApp: App {
  @UIApplicationDelegateAdaptor(HomeboardAppDelegate.self) private var appDelegate
  var body: some Scene {
    WindowGroup {
      RootView()
    }
  }
}
