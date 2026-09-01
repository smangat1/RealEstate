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

      if appModel.showsPostAuthNotificationPrompt {
        Color.black.opacity(0.60)
          .ignoresSafeArea()
          .transition(.opacity)
          .zIndex(15)

        PostAuthNotificationPrompt()
          .padding(.horizontal, 20)
          .transition(.scale(scale: 0.94).combined(with: .opacity))
          .zIndex(16)
      }

      if appModel.showsPostAuthInvitePrompt {
        Color.black.opacity(0.58)
          .ignoresSafeArea()
          .transition(.opacity)
          .zIndex(15)

        PostAuthInvitePrompt()
          .padding(.horizontal, 20)
          .transition(.scale(scale: 0.94).combined(with: .opacity))
          .zIndex(16)
      }

      if showsLaunchIntro {
        HomeboardLaunchIntro()
          .transition(.opacity.combined(with: .scale(scale: 1.015)))
          .zIndex(20)
      }
    }
    .background(HomeboardPalette.background.ignoresSafeArea())
    .preferredColorScheme(.dark)
    .animation(.easeInOut(duration: 0.24), value: appModel.currentScreen)
    .animation(.easeInOut(duration: 0.20), value: appModel.showsPostAuthNotificationPrompt)
    .animation(.easeInOut(duration: 0.20), value: appModel.showsPostAuthInvitePrompt)
    .environment(appModel)
    .task {
      await appModel.bootstrap()
      await appModel.uploadPendingNativeDiagnostics()
      if let boardId = PendingBoardNotification.consume() {
        await appModel.openBoardChatNotification(boardId: boardId)
      }
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
    .alert(
      "Couldn’t open invitation",
      isPresented: Binding(
        get: { appModel.incomingLinkError != nil },
        set: { if !$0 { appModel.incomingLinkError = nil } }
      )
    ) {
      Button("OK", role: .cancel) {
        appModel.incomingLinkError = nil
      }
    } message: {
      Text(appModel.incomingLinkError ?? "This invitation is no longer available.")
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
    .onReceive(NotificationCenter.default.publisher(for: .homeboardNativeDiagnostics)) { _ in
      Task { await appModel.uploadPendingNativeDiagnostics() }
    }
    .onReceive(NotificationCenter.default.publisher(for: .homeboardOpenBoardChat)) { notification in
      if let boardId = notification.object as? String {
        _ = PendingBoardNotification.consume()
        Task { await appModel.openBoardChatNotification(boardId: boardId) }
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

private struct PostAuthNotificationPrompt: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .top, spacing: 13) {
        Image(systemName: "bell.badge.fill")
          .font(.title3.weight(.semibold))
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(width: 46, height: 46)
          .background(HomeboardPalette.accentGradient)
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))

        VStack(alignment: .leading, spacing: 4) {
          Text("Stay in sync with your board")
            .font(.title3.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)

          Text("Turn on notifications when a roommate posts a new message. Other board activity stays in the app for now.")
            .font(.subheadline)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      Button {
        Task {
          await appModel.respondToPostAuthNotificationPrompt(enableNotifications: true)
        }
      } label: {
        Group {
          if appModel.isNotificationPermissionLoading {
            ProgressView().tint(HomeboardPalette.buttonText)
          } else {
            Text("Turn on notifications")
          }
        }
        .font(.headline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.buttonText)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .background(HomeboardPalette.accentGradient)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(appModel.isNotificationPermissionLoading)
      .accessibilityIdentifier("homeboard.notifications.enable")

      Button("Not now") {
        Task {
          await appModel.respondToPostAuthNotificationPrompt(enableNotifications: false)
        }
      }
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(HomeboardPalette.secondaryText)
      .frame(maxWidth: .infinity)
      .buttonStyle(.plain)
      .disabled(appModel.isNotificationPermissionLoading)
      .accessibilityIdentifier("homeboard.notifications.notNow")
    }
    .padding(20)
    .frame(maxWidth: 370)
    .background(HomeboardPalette.surface.opacity(0.99))
    .clipShape(RoundedRectangle(cornerRadius: 25, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 25, style: .continuous)
        .stroke(HomeboardPalette.borderStrong.opacity(0.62), lineWidth: 1)
    }
    .shadow(color: Color.black.opacity(0.42), radius: 28, x: 0, y: 16)
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
