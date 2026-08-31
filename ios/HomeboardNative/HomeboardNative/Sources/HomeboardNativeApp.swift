import SwiftUI
import UIKit
import UserNotifications

extension Notification.Name {
  static let homeboardPushToken = Notification.Name("homeboard.push-token")
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

final class HomeboardAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return true
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    let token = deviceToken.map { String(format: "%02x", $0) }.joined()
    NotificationCenter.default.post(name: .homeboardPushToken, object: token)
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
