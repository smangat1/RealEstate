import AppKit
import AuthenticationServices
import CoreImage
import CoreImage.CIFilterBuiltins
import SafariServices
import SwiftUI

private enum HomeboardMacPalette {
  static let background = Color(red: 0.239, green: 0.314, blue: 0.290)
  static let backgroundDeep = Color(red: 0.192, green: 0.267, blue: 0.243)
  static let surface = Color(red: 0.294, green: 0.380, blue: 0.349)
  static let accent = Color(red: 0.976, green: 0.886, blue: 0.804)
  static let primaryText = Color(red: 1.000, green: 0.953, blue: 0.898)
  static let success = Color(red: 0.620, green: 0.827, blue: 0.671)
  static let danger = Color(red: 1.000, green: 0.706, blue: 0.671)
}

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
  @Published var pairingChallenge: HomeboardDevicePairingChallenge?
  @Published var pairingStatusText = "Creating a secure QR code…"
  @Published var isPairing = false
  private var pairingTask: Task<Void, Never>?

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
    } else {
      Task { [weak self] in await self?.startDevicePairing() }
    }
  }

  func startDevicePairing() async {
    pairingTask?.cancel()
    if let pairingChallenge {
      await HomeboardExtensionSyncClient.cancelDevicePairing(pairingChallenge)
    }
    pairingChallenge = nil
    pairingStatusText = "Creating a secure QR code…"
    errorMessage = nil
    feedback = nil
    isPairing = true

    do {
      let deviceName = Host.current().localizedName?.trimmingCharacters(
        in: .whitespacesAndNewlines
      )
      let challenge = try await HomeboardExtensionSyncClient.createDevicePairing(
        deviceName: deviceName?.isEmpty == false ? deviceName! : "Mac"
      )
      pairingChallenge = challenge
      pairingStatusText = "Waiting for approval on your iPhone"
      pairingTask = Task { [weak self] in
        await self?.pollDevicePairing(challenge)
      }
    } catch {
      isPairing = false
      pairingStatusText = "QR code unavailable"
      errorMessage = readable(error)
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
      pairingTask?.cancel()
      if let pairingChallenge {
        await HomeboardExtensionSyncClient.cancelDevicePairing(pairingChallenge)
      }
      try await loadBoardsAndSelectDestination()
      pairingChallenge = nil
      isPairing = false
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
    Task { await startDevicePairing() }
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

  private func pollDevicePairing(
    _ challenge: HomeboardDevicePairingChallenge
  ) async {
    var transientFailures = 0
    while !Task.isCancelled, pairingChallenge?.id == challenge.id {
      do {
        let status = try await HomeboardExtensionSyncClient.devicePairingStatus(challenge)
        transientFailures = 0
        switch status.status {
        case "approved":
          guard let tokenHash = status.tokenHash, !tokenHash.isEmpty else {
            throw HomeboardExtensionSyncError.server(
              "The approval arrived without a usable session. Refresh the QR code."
            )
          }
          pairingStatusText = "Connecting this Mac…"
          let context = try await HomeboardExtensionSyncClient.redeemDevicePairing(
            tokenHash: tokenHash
          )
          try? await HomeboardExtensionSyncClient.completeDevicePairing(
            challenge,
            accessToken: context.accessToken
          )
          pairingChallenge = nil
          isPairing = false
          feedback = "This Mac is connected to \(context.displayName)’s Homeboard account."
          do {
            try await loadBoardsAndSelectDestination()
          } catch {
            errorMessage = "The Mac is connected, but boards could not refresh yet. Use the refresh button in a moment."
          }
          objectWillChange.send()
          return
        case "expired", "cancelled":
          pairingStatusText = "This QR code expired"
          isPairing = false
          return
        case "completed":
          pairingStatusText = "This pairing was already used"
          isPairing = false
          return
        default:
          pairingStatusText = "Waiting for approval on your iPhone"
        }
      } catch {
        transientFailures += 1
        if transientFailures >= 3 {
          isPairing = false
          pairingStatusText = "Connection interrupted"
          errorMessage = readable(error)
          return
        }
      }

      do {
        try await Task.sleep(for: .seconds(2))
      } catch {
        return
      }
    }
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
          HomeboardMacPalette.background,
          HomeboardMacPalette.backgroundDeep
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      .ignoresSafeArea()

      VStack(alignment: .leading, spacing: 22) {
        HStack(spacing: 12) {
          Image(systemName: "house.and.flag.fill")
            .font(.system(size: 23, weight: .bold))
            .foregroundStyle(HomeboardMacPalette.accent)
            .frame(width: 46, height: 46)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
          VStack(alignment: .leading, spacing: 3) {
            Text("HOMEBOARD")
              .font(.system(size: 12, weight: .heavy))
              .tracking(2)
              .foregroundStyle(HomeboardMacPalette.accent)
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
            .foregroundStyle(HomeboardMacPalette.danger)
        }
        if let feedback = model.feedback {
          Label(feedback, systemImage: "checkmark.circle.fill")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(HomeboardMacPalette.success)
        }

        Spacer(minLength: 0)

        Text("Once connected, a listing saved from Mac Safari goes straight to the same shared board your iPhone refreshes.")
          .font(.system(size: 12))
          .foregroundStyle(.white.opacity(0.48))
          .fixedSize(horizontal: false, vertical: true)
      }
      .padding(30)
      .foregroundStyle(HomeboardMacPalette.primaryText)
    }
  }

  private var signInContent: some View {
    VStack(alignment: .leading, spacing: 15) {
      Text("Connect this Mac")
        .font(.system(size: 17, weight: .bold))
      Text("Scan this with the Homeboard app on your signed-in iPhone.")
        .font(.system(size: 13))
        .foregroundStyle(.white.opacity(0.62))

      HStack(alignment: .center, spacing: 22) {
        Group {
          if let challenge = model.pairingChallenge,
             let image = homeboardQRCode(for: challenge.deepLink) {
            Image(nsImage: image)
              .interpolation(.none)
              .resizable()
              .scaledToFit()
              .padding(12)
              .background(Color.white)
          } else {
            ZStack {
              HomeboardMacPalette.surface.opacity(0.72)
              ProgressView()
                .controlSize(.regular)
                .tint(.white)
            }
          }
        }
        .frame(width: 174, height: 174)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

        VStack(alignment: .leading, spacing: 12) {
          Label("On iPhone", systemImage: "iphone")
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(HomeboardMacPalette.accent)
          Text("Open Homeboard → Settings → Connect a Mac, then point it at this code.")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(.white.opacity(0.78))
            .fixedSize(horizontal: false, vertical: true)

          if let code = model.pairingChallenge?.approvalCode {
            VStack(alignment: .leading, spacing: 3) {
              Text("MATCH CODE")
                .font(.system(size: 9, weight: .heavy))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.42))
              Text(code.chunkedPairingCode)
                .font(.system(size: 20, weight: .bold, design: .monospaced))
                .tracking(2)
            }
          }

          Label(
            model.pairingStatusText,
            systemImage: model.isPairing ? "lock.shield.fill" : "arrow.clockwise"
          )
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.white.opacity(0.56))

          if !model.isPairing {
            Button("Refresh QR code") {
              Task { await model.startDevicePairing() }
            }
            .buttonStyle(.borderedProminent)
            .tint(HomeboardMacPalette.accent)
            .foregroundStyle(Color.black)
          }
        }
      }

      HStack(spacing: 12) {
        Rectangle().fill(.white.opacity(0.1)).frame(height: 1)
        Text("OR")
          .font(.system(size: 9, weight: .heavy))
          .foregroundStyle(.white.opacity(0.34))
        Rectangle().fill(.white.opacity(0.1)).frame(height: 1)
      }

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
        .frame(height: 40)
        .disabled(model.isWorking)
        .opacity(model.isWorking ? 0.58 : 1)

        if model.isWorking {
          RoundedRectangle(cornerRadius: 7).fill(.black.opacity(0.46))
          ProgressView().controlSize(.small).tint(.white)
        }
      }
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
          .foregroundStyle(HomeboardMacPalette.accent)
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
        .tint(HomeboardMacPalette.accent)
        .foregroundStyle(Color.black)

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

private func homeboardQRCode(for url: URL) -> NSImage? {
  let filter = CIFilter.qrCodeGenerator()
  filter.message = Data(url.absoluteString.utf8)
  filter.correctionLevel = "M"
  guard let output = filter.outputImage else { return nil }
  let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
  let context = CIContext(options: [.useSoftwareRenderer: false])
  guard let image = context.createCGImage(scaled, from: scaled.extent) else { return nil }
  return NSImage(cgImage: image, size: NSSize(width: scaled.extent.width, height: scaled.extent.height))
}

private extension String {
  var chunkedPairingCode: String {
    guard count == 6 else { return self }
    let middle = index(startIndex, offsetBy: 3)
    return "\(self[..<middle]) \(self[middle...])"
  }
}
