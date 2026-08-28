import AuthenticationServices
import SwiftUI

struct AppleAuthView: View {
  @Environment(AppModel.self) private var appModel
  @State private var appleNonce: String?

  var body: some View {
    ZStack {
      HomeboardBackgroundView()

      GeometryReader { geometry in
        let width = max(geometry.size.width - 32, 0)
        let height = max(geometry.size.height - 24, 0)

        VStack(alignment: .leading, spacing: 22) {
          header

          Spacer(minLength: 12)

          VStack(alignment: .leading, spacing: 10) {
            Text(authTitle)
              .font(.system(size: 31, weight: .bold, design: .serif))
              .foregroundStyle(HomeboardPalette.primaryText)
              .fixedSize(horizontal: false, vertical: true)

            Text(authSubtitle)
              .font(.subheadline)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)
          }

          appleBenefits

          if let error = appModel.authError, !error.isEmpty {
            Label(error, systemImage: "exclamationmark.circle.fill")
              .font(.footnote.weight(.medium))
              .foregroundStyle(Color.red.opacity(0.92))
              .fixedSize(horizontal: false, vertical: true)
              .padding(12)
              .frame(maxWidth: .infinity, alignment: .leading)
              .background(Color.red.opacity(0.08))
              .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          }

          if appModel.authSession != nil,
             appModel.authError?.contains("Retry connection") == true {
            Button {
              Task { await appModel.retryAuthenticatedSession() }
            } label: {
              Label("Retry connection", systemImage: "arrow.clockwise")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(HomeboardPalette.primaryText)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(Color.white.opacity(0.07))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(appModel.isAuthLoading)
          }

          ZStack {
            SignInWithAppleButton(.continue) { request in
              do {
                appleNonce = try HomeboardAppleSignIn.prepare(request)
                appModel.authError = nil
              } catch {
                appleNonce = nil
                appModel.authError = readable(error)
              }
            } onCompletion: { result in
              finishAppleAuthorization(result)
            }
            .signInWithAppleButtonStyle(.white)
            .frame(height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .disabled(appModel.isAuthLoading)
            .opacity(appModel.isAuthLoading ? 0.58 : 1)

            if appModel.isAuthLoading {
              RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.black.opacity(0.48))
              ProgressView()
                .tint(.white)
            }
          }
          .frame(height: 50)

          Label(
            "Homeboard receives an Apple identity token—not your Apple password.",
            systemImage: "checkmark.shield.fill"
          )
          .font(.caption.weight(.medium))
          .foregroundStyle(HomeboardPalette.tertiaryText)
          .fixedSize(horizontal: false, vertical: true)

          Spacer(minLength: 8)
        }
        .frame(width: max(width - 44, 0), height: max(height - 44, 0), alignment: .topLeading)
        .padding(22)
        .frame(width: width, height: height)
        .homeboardWindow()
        .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
      }

      if appModel.showsPostAuthInvitePrompt {
        Color.black.opacity(0.58)
          .ignoresSafeArea()
          .transition(.opacity)

        PostAuthInvitePrompt()
          .environment(appModel)
          .padding(.horizontal, 20)
          .transition(.scale(scale: 0.94).combined(with: .opacity))
          .zIndex(1)
      }
    }
    .animation(.easeInOut(duration: 0.2), value: appModel.showsPostAuthInvitePrompt)
  }

  private var header: some View {
    HStack {
      Button {
        withAnimation(.easeInOut(duration: 0.24)) {
          appModel.resetToWelcome()
        }
      } label: {
        Image(systemName: "chevron.left")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .frame(width: 38, height: 38)
          .background(Color.white.opacity(0.07))
          .clipShape(Circle())
      }
      .buttonStyle(AuthPressStyle())

      Spacer()

      HStack(spacing: 6) {
        Image(systemName: "apple.logo")
        Text("APPLE ACCOUNT")
      }
      .font(.caption2.weight(.bold))
      .tracking(1.4)
      .foregroundStyle(HomeboardPalette.accent)
    }
  }

  private var authTitle: String {
    return "One account. No password."
  }

  private var authSubtitle: String {
    return "Continue with the Apple Account already on this device. Apple securely creates your Homeboard account the first time and signs you back in after that."
  }

  private var appleBenefits: some View {
    VStack(alignment: .leading, spacing: 11) {
      benefit("person.crop.circle.badge.checkmark", "No separate Homeboard password")
      benefit("iphone.and.arrow.forward", "The same identity can connect iPhone and Mac")
      benefit("envelope.badge.shield.half.filled", "You decide whether Apple shares or hides your email")
    }
    .padding(15)
    .homeboardInsetSurface(cornerRadius: 17)
  }

  private func benefit(_ icon: String, _ text: String) -> some View {
    HStack(spacing: 11) {
      Image(systemName: icon)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.accent)
        .frame(width: 24)
      Text(text)
        .font(.subheadline.weight(.medium))
        .foregroundStyle(HomeboardPalette.secondaryText)
    }
  }

  private func finishAppleAuthorization(_ result: Result<ASAuthorization, Error>) {
    switch result {
    case .success(let authorization):
      do {
        let credential = try HomeboardAppleSignIn.credential(
          from: authorization,
          nonce: appleNonce
        )
        appleNonce = nil
        Task {
          await appModel.submitAppleAuth(
            identityToken: credential.identityToken,
            nonce: credential.nonce,
            displayName: credential.displayName,
            inviteCode: appModel.pendingInviteCode
          )
        }
      } catch {
        appleNonce = nil
        appModel.authError = readable(error)
      }
    case .failure(let error):
      appleNonce = nil
      if (error as? ASAuthorizationError)?.code != .canceled {
        appModel.authError = readable(error)
      }
    }
  }

  private func readable(_ error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
  }
}
