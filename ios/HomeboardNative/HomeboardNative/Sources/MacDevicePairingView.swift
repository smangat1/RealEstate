import SwiftUI
import UIKit
import VisionKit

struct MacDevicePairingFlowView: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var pairing: MacDevicePairingRequest?
  @State private var isApproving = false
  @State private var connectedDeviceName: String?
  @State private var errorMessage: String?

  init(initialRequest: MacDevicePairingRequest? = nil) {
    _pairing = State(initialValue: initialRequest)
  }

  var body: some View {
    NavigationStack {
      ZStack {
        WorkspaceBackgroundView()

        Group {
          if let connectedDeviceName {
            successContent(deviceName: connectedDeviceName)
          } else if let pairing {
            approvalContent(pairing)
          } else {
            scannerContent
          }
        }
        .padding(18)
      }
      .navigationTitle(pairing == nil ? "Scan Mac QR code" : "Connect this Mac")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Cancel") { dismiss() }
            .foregroundStyle(HomeboardPalette.secondaryText)
        }
      }
    }
  }

  private var scannerContent: some View {
    VStack(spacing: 16) {
      VStack(spacing: 5) {
        Text("Point your iPhone at the QR code")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Text("The code is shown in the Homeboard Mac app and expires after three minutes.")
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .multilineTextAlignment(.center)
      }

      if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
        ZStack {
          HomeboardPairingQRScanner { scanned in
            pairing = scanned
            errorMessage = nil
          } onFailure: { message in
            errorMessage = message
          }
          .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

          RoundedRectangle(cornerRadius: 22, style: .continuous)
            .stroke(HomeboardPalette.accent, lineWidth: 3)
            .frame(width: 230, height: 230)
            .allowsHitTesting(false)
        }
      } else {
        ContentUnavailableView(
          "Camera scanner unavailable",
          systemImage: "camera.fill",
          description: Text("Use the iPhone Camera app to scan the Mac code, or try again on a supported device.")
        )
      }

      if let errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.danger)
          .multilineTextAlignment(.center)
      } else {
        Label("The QR code contains no password or iPhone login token.", systemImage: "lock.shield.fill")
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.secondaryText)
      }
    }
  }

  private func approvalContent(_ request: MacDevicePairingRequest) -> some View {
    VStack(spacing: 20) {
      Spacer(minLength: 0)

      ZStack {
        Circle().fill(HomeboardPalette.accent.opacity(0.14))
        Image(systemName: "laptopcomputer.and.iphone")
          .font(.system(size: 42, weight: .semibold))
          .foregroundStyle(HomeboardPalette.accent)
      }
      .frame(width: 92, height: 92)

      VStack(spacing: 7) {
        Text("Connect \(request.deviceName)?")
          .font(.title2.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text("This gives the Mac its own Homeboard session and connects its Safari extension to your boards.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .multilineTextAlignment(.center)
      }

      VStack(spacing: 5) {
        Text("MAKE SURE THIS MATCHES THE MAC")
          .font(.caption2.weight(.heavy))
          .tracking(1.1)
          .foregroundStyle(HomeboardPalette.tertiaryText)
        Text(request.formattedCode)
          .font(.system(size: 30, weight: .bold, design: .monospaced))
          .tracking(3)
          .foregroundStyle(HomeboardPalette.primaryText)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 16)
      .background(Color.white.opacity(0.06))
      .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

      if let errorMessage {
        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.danger)
          .multilineTextAlignment(.center)
      }

      Button {
        approve(request)
      } label: {
        HStack(spacing: 9) {
          if isApproving {
            ProgressView().tint(Color.black)
          } else {
            Image(systemName: "checkmark.shield.fill")
          }
          Text(isApproving ? "Connecting…" : "Connect Mac")
        }
        .font(.headline)
        .foregroundStyle(Color.black)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .background(HomeboardPalette.accent)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(isApproving)

      Button("Scan a different code") {
        pairing = nil
        errorMessage = nil
      }
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(HomeboardPalette.secondaryText)
      .disabled(isApproving)

      Spacer(minLength: 0)
    }
  }

  private func successContent(deviceName: String) -> some View {
    VStack(spacing: 15) {
      Spacer()
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 68))
        .foregroundStyle(HomeboardPalette.success)
      Text("\(deviceName) is connected")
        .font(.title2.weight(.bold))
        .foregroundStyle(HomeboardPalette.primaryText)
      Text("The Mac will finish signing in and load your shared boards automatically.")
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .multilineTextAlignment(.center)
      Spacer()
    }
  }

  private func approve(_ request: MacDevicePairingRequest) {
    guard !isApproving else { return }
    isApproving = true
    errorMessage = nil
    Task {
      do {
        let deviceName = try await appModel.approveMacPairing(request)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        connectedDeviceName = deviceName
        try? await Task.sleep(for: .seconds(1.1))
        dismiss()
      } catch {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
        errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      }
      isApproving = false
    }
  }
}

private struct HomeboardPairingQRScanner: UIViewControllerRepresentable {
  var onScan: (MacDevicePairingRequest) -> Void
  var onFailure: (String) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(onScan: onScan, onFailure: onFailure)
  }

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let controller = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .balanced,
      recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false,
      isPinchToZoomEnabled: true,
      isGuidanceEnabled: true,
      isHighlightingEnabled: true
    )
    controller.delegate = context.coordinator
    Task { @MainActor in
      do {
        try controller.startScanning()
      } catch {
        context.coordinator.onFailure("Homeboard could not start the camera scanner. Check Camera access in Settings.")
      }
    }
    return controller
  }

  func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}

  static func dismantleUIViewController(_ uiViewController: DataScannerViewController, coordinator: Coordinator) {
    uiViewController.stopScanning()
  }

  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    let onScan: (MacDevicePairingRequest) -> Void
    let onFailure: (String) -> Void
    private var acceptedCode = false

    init(
      onScan: @escaping (MacDevicePairingRequest) -> Void,
      onFailure: @escaping (String) -> Void
    ) {
      self.onScan = onScan
      self.onFailure = onFailure
    }

    func dataScanner(
      _ dataScanner: DataScannerViewController,
      didAdd addedItems: [RecognizedItem],
      allItems: [RecognizedItem]
    ) {
      guard !acceptedCode else { return }
      for item in addedItems {
        guard case .barcode(let barcode) = item,
              let payload = barcode.payloadStringValue
        else { continue }
        guard let request = MacDevicePairingRequest(payload: payload) else {
          onFailure("That is not a Homeboard Mac pairing code.")
          continue
        }
        acceptedCode = true
        dataScanner.stopScanning()
        onScan(request)
        return
      }
    }
  }
}
