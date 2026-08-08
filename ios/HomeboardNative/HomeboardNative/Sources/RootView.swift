import SwiftUI
import UIKit

struct RootView: View {
  @State private var appModel = AppModel()

  var body: some View {
    ZStack {
      Group {
        switch appModel.currentScreen {
        case .welcome:
          WelcomeView()
        case .auth:
          AppleAuthView()
        case .onboarding:
          OnboardingView()
        case .board:
          BoardShellView()
        }
      }
      .id(appModel.currentScreen)
      .transition(.opacity)

      Group {
        if appModel.isBootstrapping
            || (appModel.isBoardLoading
                && appModel.currentScreen == .board
                && appModel.board.id == nil) {
          if appModel.currentScreen == .board {
            HomeboardBoardSkeleton()
          } else {
            HomeboardScreenSkeleton()
          }
        }
      }
      .zIndex(10)
    }
    .background(HomeboardPalette.background.ignoresSafeArea())
    .preferredColorScheme(.dark)
    .animation(.easeInOut(duration: 0.24), value: appModel.currentScreen)
    .environment(appModel)
    .task {
      await appModel.bootstrap()
    }
    .onOpenURL { url in
      appModel.handleIncomingURL(url)
    }
    .onReceive(NotificationCenter.default.publisher(for: .homeboardPushToken)) { notification in
      if let token = notification.object as? String {
        appModel.registerPushToken(token)
      }
    }
    .onReceive(
      NotificationCenter.default.publisher(
        for: UIApplication.didBecomeActiveNotification
      )
    ) { _ in
      appModel.consumeSharedListingImport()
    }
  }
}
