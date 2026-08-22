import SwiftUI
import UIKit

struct RootView: View {
  @State private var appModel = AppModel()
  @State private var showsLaunchIntro = true

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

      if showsLaunchIntro {
        HomeboardLaunchIntro()
          .transition(.opacity.combined(with: .scale(scale: 1.015)))
          .zIndex(20)
      }
    }
    .background(HomeboardPalette.background.ignoresSafeArea())
    .preferredColorScheme(.dark)
    .animation(.easeInOut(duration: 0.24), value: appModel.currentScreen)
    .environment(appModel)
    .task {
      await appModel.bootstrap()
    }
    .task {
      try? await Task.sleep(for: .seconds(1.45))
      withAnimation(.easeInOut(duration: 0.34)) {
        showsLaunchIntro = false
      }
    }
    .onOpenURL { url in
      appModel.handleIncomingURL(url)
    }
    .sheet(
      item: Binding(
        get: { appModel.pendingMacPairingRequest },
        set: { appModel.pendingMacPairingRequest = $0 }
      )
    ) { pairing in
      MacDevicePairingFlowView(initialRequest: pairing)
        .environment(appModel)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
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

private struct HomeboardLaunchIntro: View {
  @State private var markAppeared = false
  @State private var progressFilled = false

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          HomeboardPalette.background,
          HomeboardPalette.surfaceDeep
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      VStack(spacing: 24) {
        Image("HomeboardMark")
          .resizable()
          .scaledToFit()
          .padding(24)
          .frame(width: 190, height: 194)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: 40, style: .continuous))
          .shadow(color: Color.black.opacity(0.2), radius: 28, x: 0, y: 18)
          .scaleEffect(markAppeared ? 1 : 0.82)
          .opacity(markAppeared ? 1 : 0)

        Text("HOMEBOARD")
          .font(.caption.weight(.bold))
          .tracking(4.4)
          .foregroundStyle(HomeboardPalette.primaryText)
          .offset(y: markAppeared ? 0 : 8)
          .opacity(markAppeared ? 1 : 0)

        ZStack(alignment: .leading) {
          Capsule()
            .fill(HomeboardPalette.border.opacity(0.3))

          Capsule()
            .fill(HomeboardPalette.accent)
            .scaleEffect(x: progressFilled ? 1 : 0.06, anchor: .leading)
        }
        .frame(width: 92, height: 3)
        .opacity(markAppeared ? 1 : 0)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Opening Homeboard")
    .onAppear {
      withAnimation(.spring(response: 0.58, dampingFraction: 0.76)) {
        markAppeared = true
      }
      withAnimation(.easeInOut(duration: 1.12).delay(0.16)) {
        progressFilled = true
      }
    }
  }
}
