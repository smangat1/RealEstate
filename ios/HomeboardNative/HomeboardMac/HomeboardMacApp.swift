import AuthenticationServices
import SafariServices
import SwiftUI

@main
struct HomeboardMacApp: App {
  @StateObject private var model = HomeboardMacConnectionModel()

  var body: some Scene {
    WindowGroup {
      HomeboardMacConnectionView()
        .environmentObject(model)
        .frame(minWidth: 520, minHeight: 510)
    }
    .windowResizability(.contentMinSize)
  }
}

@MainActor
private final class HomeboardMacConnectionModel: ObservableObject {
  @Published var boards: [HomeboardSharedBoard] = []
  @Published var activeBoardId = HomeboardSharedImportStore.activeBoardId ?? ""
  @Published var isWorking = false
  @Published var errorMessage: String?
  @Published var feedback: String?

  var isConnected: Bool {
    HomeboardSharedAuthStore.load() != nil
  }

  var connectedName: String {
    HomeboardSharedAuthStore.load()?.displayName ?? "Homeboard account"
  }

  init() {
    let credentialBridgeReady = HomeboardSharedAuthStore.verifyRoundTrip()
    UserDefaults(suiteName: HomeboardSharedImportStore.appGroup)?.set(
      credentialBridgeReady,
      forKey: "homeboard.mac.credential-bridge-ready"
    )
    if !credentialBridgeReady {
      errorMessage =
        "The Homeboard Safari credential bridge is not available in this build."
      return
    }
    if HomeboardSharedAuthStore.load() != nil {
      Task { await refreshBoards() }
    }
  }

  func signIn(with credential: HomeboardAppleCredential) async {
    isWorking = true
    errorMessage = nil
    feedback = nil
    defer { isWorking = false }
    do {
      _ = try await HomeboardExtensionSyncClient.signInWithApple(
        identityToken: credential.identityToken,
        nonce: credential.nonce,
        displayName: credential.displayName
      )
      try await loadBoardsAndSelectDestination()
      feedback = "This Mac is connected to the same Homeboard account as your phone."
      objectWillChange.send()
    } catch {
      errorMessage = readable(error)
    }
  }

  func reportAppleSignInError(_ error: Error) {
    errorMessage = readable(error)
  }

  func refreshBoards() async {
    isWorking = true
    errorMessage = nil
    defer { isWorking = false }
    do {
      try await loadBoardsAndSelectDestination()
    } catch {
      errorMessage = readable(error)
    }
  }

  func selectBoard(_ id: String) {
    activeBoardId = id
    HomeboardSharedImportStore.setActiveBoard(id.isEmpty ? nil : id)
    feedback = id.isEmpty
      ? nil
      : "Safari will save reviewed listings to this board on every device."
  }

  func syncPendingImports() async {
    guard !activeBoardId.isEmpty else {
      errorMessage = "Choose the destination board first."
      return
    }
    let imports = HomeboardSharedImportStore.consumeAll()
    guard !imports.isEmpty else {
      feedback = "There are no offline Safari saves waiting to sync."
      return
    }

    isWorking = true
    errorMessage = nil
    var deferred: [HomeboardSharedImportStore.PendingImport] = []
    var savedCount = 0
    for var listing in imports {
      listing.boardId = listing.boardId ?? activeBoardId
      do {
        try await HomeboardExtensionSyncClient.saveListing(
          listing,
          boardId: listing.boardId
        )
        savedCount += 1
      } catch {
        deferred.append(listing)
        errorMessage = readable(error)
      }
    }
    if !deferred.isEmpty {
      HomeboardSharedImportStore.prepend(deferred)
    }
    isWorking = false
    if savedCount > 0 {
      feedback = "\(savedCount) saved listing\(savedCount == 1 ? "" : "s") synced to the shared board."
    }
  }

  func signOut() {
    HomeboardSharedAuthStore.delete()
    HomeboardSharedImportStore.setActiveBoard(nil)
    boards = []
    activeBoardId = ""
    feedback = nil
    errorMessage = nil
    objectWillChange.send()
  }

  func openSafariExtensionSettings() {
    SFSafariApplication.showPreferencesForExtension(
      withIdentifier: safariExtensionIdentifier
    ) { error in
      Task { @MainActor in
        if let error {
          self.errorMessage = error.localizedDescription
        }
      }
    }
  }

  private var safariExtensionIdentifier: String {
    Bundle.main.bundleIdentifier?.hasSuffix(".dev") == true
      ? "com.homeboard.native.mac.dev.safari"
      : "com.homeboard.native.mac.safari"
  }

  private func loadBoardsAndSelectDestination() async throws {
    boards = try await HomeboardExtensionSyncClient.fetchBoards()
    if !boards.contains(where: { $0.id == activeBoardId }) {
      activeBoardId = boards.first?.id ?? ""
    }
    HomeboardSharedImportStore.setActiveBoard(
      activeBoardId.isEmpty ? nil : activeBoardId
    )
  }

  private func readable(_ error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
  }
}

private struct HomeboardMacConnectionView: View {
  @EnvironmentObject private var model: HomeboardMacConnectionModel
  @State private var appleNonce: String?

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          Color(red: 0.055, green: 0.075, blue: 0.11),
          Color(red: 0.025, green: 0.035, blue: 0.055)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      VStack(alignment: .leading, spacing: 22) {
        HStack(spacing: 12) {
          Image(systemName: "house.and.flag.fill")
            .font(.system(size: 23, weight: .bold))
            .foregroundStyle(Color(red: 0.54, green: 0.87, blue: 1))
            .frame(width: 46, height: 46)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
          VStack(alignment: .leading, spacing: 3) {
            Text("HOMEBOARD")
              .font(.system(size: 12, weight: .heavy))
              .tracking(2)
              .foregroundStyle(Color(red: 0.54, green: 0.87, blue: 1))
            Text("Safari connection")
              .font(.system(size: 22, weight: .bold))
          }
        }

        if model.isConnected {
          connectedContent
        } else {
          signInContent
        }

        if let error = model.errorMessage {
          Label(error, systemImage: "exclamationmark.triangle.fill")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color(red: 1, green: 0.69, blue: 0.42))
        }
        if let feedback = model.feedback {
          Label(feedback, systemImage: "checkmark.circle.fill")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color(red: 0.48, green: 0.88, blue: 0.71))
        }

        Spacer(minLength: 0)

        Text("Once connected, a listing saved from Mac Safari goes straight to the same shared board your iPhone refreshes.")
          .font(.system(size: 12))
          .foregroundStyle(.white.opacity(0.48))
          .fixedSize(horizontal: false, vertical: true)
      }
      .padding(30)
      .foregroundStyle(.white)
    }
  }

  private var signInContent: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Connect this Mac")
        .font(.system(size: 17, weight: .bold))
      Text("Use the same Homeboard account as your iPhone.")
        .font(.system(size: 13))
        .foregroundStyle(.white.opacity(0.62))

      ZStack {
        SignInWithAppleButton(.continue) { request in
          do {
            appleNonce = try HomeboardAppleSignIn.prepare(request)
            model.errorMessage = nil
          } catch {
            appleNonce = nil
            model.reportAppleSignInError(error)
          }
        } onCompletion: { result in
          finishAppleAuthorization(result)
        }
        .signInWithAppleButtonStyle(.white)
        .frame(height: 44)
        .disabled(model.isWorking)
        .opacity(model.isWorking ? 0.58 : 1)

        if model.isWorking {
          RoundedRectangle(cornerRadius: 7)
            .fill(.black.opacity(0.46))
          ProgressView().controlSize(.small).tint(.white)
        }
      }

      Text("No Homeboard password. Apple securely creates or reopens the same account on this Mac.")
        .font(.system(size: 11))
        .foregroundStyle(.white.opacity(0.48))
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
        Task { await model.signIn(with: credential) }
      } catch {
        appleNonce = nil
        model.reportAppleSignInError(error)
      }
    case .failure(let error):
      appleNonce = nil
      if (error as? ASAuthorizationError)?.code != .canceled {
        model.reportAppleSignInError(error)
      }
    }
  }

  private var connectedContent: some View {
    VStack(alignment: .leading, spacing: 15) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text("Connected as \(model.connectedName)")
            .font(.system(size: 16, weight: .bold))
          Text(HomeboardSharedAuthStore.load()?.email ?? "Apple account")
            .font(.system(size: 12))
            .foregroundStyle(.white.opacity(0.56))
        }
        Spacer()
        Button("Sign out") { model.signOut() }
          .buttonStyle(.plain)
          .foregroundStyle(.white.opacity(0.62))
      }

      VStack(alignment: .leading, spacing: 7) {
        Text("SAFARI SAVES TO")
          .font(.system(size: 10, weight: .heavy))
          .tracking(1.1)
          .foregroundStyle(Color(red: 0.54, green: 0.87, blue: 1))
        Picker("Destination board", selection: $model.activeBoardId) {
          ForEach(model.boards) { board in
            Text(board.title.isEmpty ? board.city : board.title)
              .tag(board.id)
          }
        }
        .labelsHidden()
        .onChange(of: model.activeBoardId) { _, id in
          model.selectBoard(id)
        }
      }
      .padding(14)
      .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 15))

      HStack {
        Button("Enable in Safari") {
          model.openSafariExtensionSettings()
        }
        .buttonStyle(.borderedProminent)
        .tint(Color(red: 0.43, green: 0.72, blue: 0.98))

        Button("Sync offline saves") {
          Task { await model.syncPendingImports() }
        }
        .buttonStyle(.bordered)
        .disabled(model.isWorking || model.activeBoardId.isEmpty)

        Spacer()

        Button {
          Task { await model.refreshBoards() }
        } label: {
          Image(systemName: "arrow.clockwise")
        }
        .buttonStyle(.borderless)
        .disabled(model.isWorking)
      }
    }
  }
}
