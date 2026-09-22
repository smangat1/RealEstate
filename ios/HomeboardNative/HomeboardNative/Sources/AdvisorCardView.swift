import SwiftUI
import StripeCore
import StripePaymentSheet
import UIKit

struct AdvisorCardView: View {
  @Environment(AppModel.self) private var appModel

  let message: BoardMessage

  @State private var payload: AdvisorMessagePayload?
  @State private var selectedTone: String
  @State private var toggles: [AdvisorToggleOption]
  @State private var isRegenerating = false
  @State private var regenerationTask: Task<Void, Never>?
  @State private var regenerationRevision = 0
  @State private var dispatchMessage: String?

  private static let tones = ["Professional", "Casual", "Stern", "Passive-Aggressive"]

  init(message: BoardMessage) {
    self.message = message
    let initialPayload = message.advisorPayload
    let initialTone = initialPayload.map(\.tone).flatMap { Self.tones.contains($0) ? $0 : nil } ?? "Professional"
    _payload = State(initialValue: initialPayload)
    _selectedTone = State(initialValue: initialTone)
    _toggles = State(initialValue: initialPayload?.toggleOptions ?? [])
  }

  var body: some View {
    Group {
      if let payload, !payload.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        advisorCard(payload)
      } else {
        legacyMessage
      }
    }
    .onDisappear {
      // Keep generation alive if user scrolls within thread
    }
  }

  private func advisorCard(_ currentPayload: AdvisorMessagePayload) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .center, spacing: 8) {
        Circle()
          .fill(HomeboardPalette.accent)
          .frame(width: 24, height: 24)
          .overlay {
            Image(systemName: "sparkles")
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(HomeboardPalette.buttonText)
          }

        Text("Advisor")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)

        Spacer()

        if isRegenerating {
          ProgressView()
            .tint(HomeboardPalette.accent)
            .scaleEffect(0.8)
        } else {
          HStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
              .font(.caption2)
            Text(currentPayload.executionStatus == "needs_input" ? "Needs info" : "Ready to send")
              .font(.caption2.weight(.semibold))
          }
          .foregroundStyle(currentPayload.executionStatus == "needs_input" ? HomeboardPalette.warning : HomeboardPalette.success)
        }
      }

      VStack(alignment: .leading, spacing: 8) {
        Text(currentPayload.draftText)
          .font(.body)
          .foregroundStyle(HomeboardPalette.primaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color.white.opacity(0.06))
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(HomeboardPalette.accent.opacity(0.25), lineWidth: 1)
      }

      VStack(alignment: .leading, spacing: 5) {
        Text("TONE")
          .font(.system(size: 10, weight: .bold))
          .tracking(1.2)
          .foregroundStyle(HomeboardPalette.tertiaryText)

        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(Self.tones, id: \.self) { tone in
              let isSelected = selectedTone == tone
              Button {
                selectedTone = tone
                scheduleRegeneration()
              } label: {
                Text(tone.replacingOccurrences(of: "-", with: " "))
                  .font(.caption.weight(isSelected ? .bold : .medium))
                  .padding(.horizontal, 12)
                  .padding(.vertical, 7)
                  .background(isSelected ? HomeboardPalette.accent : Color.white.opacity(0.06))
                  .foregroundStyle(isSelected ? HomeboardPalette.buttonText : HomeboardPalette.primaryText)
                  .clipShape(Capsule())
                  .overlay {
                    if !isSelected {
                      Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1)
                    }
                  }
              }
              .buttonStyle(.plain)
            }
          }
        }
      }

      if !toggles.isEmpty {
        VStack(alignment: .leading, spacing: 5) {
          Text("INCLUDE")
            .font(.system(size: 10, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(HomeboardPalette.tertiaryText)

          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
              ForEach($toggles) { $toggle in
                Button {
                  toggle.enabled.toggle()
                  scheduleRegeneration()
                } label: {
                  HStack(spacing: 5) {
                    Image(systemName: toggle.enabled ? "checkmark.circle.fill" : "circle")
                      .font(.caption2)
                    Text(toggle.label)
                      .font(.caption.weight(.medium))
                  }
                  .padding(.horizontal, 10)
                  .padding(.vertical, 6)
                  .background(toggle.enabled ? HomeboardPalette.accent.opacity(0.18) : Color.white.opacity(0.05))
                  .foregroundStyle(toggle.enabled ? HomeboardPalette.accent : HomeboardPalette.secondaryText)
                  .clipShape(Capsule())
                  .overlay {
                    Capsule().stroke(toggle.enabled ? HomeboardPalette.accent.opacity(0.3) : Color.white.opacity(0.08), lineWidth: 1)
                  }
                }
                .buttonStyle(.plain)
              }
            }
          }
        }
      }

      HStack(spacing: 10) {
        Button {
          sendViaMessage()
        } label: {
          Label("Send via iMessage", systemImage: "message.fill")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(AdvisorCTAButtonStyle(isPrimary: true))
        .disabled(!MessageDispatcher.canSendText || !isDraftReady(currentPayload))

        Button {
          sendViaEmail()
        } label: {
          Label("Send via Email", systemImage: "envelope.fill")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(AdvisorCTAButtonStyle(isPrimary: false))
        .disabled(!MessageDispatcher.canSendMail || !isDraftReady(currentPayload))
      }

      if let dispatchMessage {
        Text(dispatchMessage)
          .font(.footnote)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }
    }
    .padding(16)
    .homeboardPanel(cornerRadius: 22)
  }

  private var legacyMessage: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("ADVISOR")
        .font(.caption.weight(.bold))
        .tracking(2)
        .foregroundStyle(HomeboardPalette.accent)
      Text(message.content.isEmpty ? "This Advisor response is unavailable." : message.content)
        .font(.body)
        .foregroundStyle(HomeboardPalette.primaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(18)
    .homeboardPanel(cornerRadius: 24)
  }

  private func scheduleRegeneration() {
    guard payload != nil, let expectedBoardId = appModel.board.id else { return }
    regenerationRevision += 1
    let revision = regenerationRevision
    regenerationTask?.cancel()
    let tone = selectedTone
    let selectedToggles = toggles
    regenerationTask = Task {
      do { try await Task.sleep(nanoseconds: 350_000_000) }
      catch { return }
      guard revision == regenerationRevision, !Task.isCancelled else { return }
      isRegenerating = true

      do {
        let response = try await appModel.regenerateAdvisorDraft(
          originalCommand: "@advisor Draft broker outreach for the strongest saved listing.",
          tone: tone,
          toggles: selectedToggles
        )
        guard revision == regenerationRevision, !Task.isCancelled else { return }
        guard var next = response.advisorPayload else {
          isRegenerating = false
          return
        }

        // The backend regenerates the copy, while these controls remain the source
        // of truth for the user's current selection.
        next.tone = tone
        next.toggleOptions = selectedToggles
        if let applied = appModel.applyAdvisorRegenerationResponse(
          response,
          payload: next,
          expectedBoardId: expectedBoardId
        ) {
          payload = applied
          dispatchMessage = nil
        }
      } catch is CancellationError {
        return
      } catch {
        guard revision == regenerationRevision, !Task.isCancelled else { return }
        let msg = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        if !msg.lowercased().contains("cancel") {
          dispatchMessage = msg
        }
      }

      if revision == regenerationRevision {
        isRegenerating = false
      }
    }
  }

  private func sendViaEmail() {
    guard let payload, isDraftReady(payload) else { return }
    MessageDispatcher.presentMail(
      recipients: [],
      subject: "Homeboard rental outreach",
      body: payload.draftText
    ) { result in
      handleDispatchResult(result)
    }
  }

  private func sendViaMessage() {
    guard let payload, isDraftReady(payload) else { return }
    MessageDispatcher.presentMessage(
      recipients: [],
      body: payload.draftText
    ) { result in
      handleDispatchResult(result)
    }
  }

  private func handleDispatchResult(_ result: MessageDispatchResult) {
    switch result {
    case .sent:
      dispatchMessage = "Outreach sent."
      if let payload {
        appModel.markAdvisorOutreachSent(for: payload)
      }
    case .cancelled:
      dispatchMessage = nil
    case .failed(let reason):
      dispatchMessage = reason ?? "Unable to send this draft."
    }
  }

  private func isDraftReady(_ payload: AdvisorMessagePayload) -> Bool {
    !payload.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
}

struct AdvisorWalletPanel: View {
  @Environment(AppModel.self) private var appModel

  @State private var amountDollars = 4
  @State private var isPreparingPayment = false
  @State private var paymentMessage: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 4) {
          Text("Advisor wallet")
            .font(.headline)
            .foregroundStyle(HomeboardPalette.primaryText)
          Text(statusLine)
            .font(.footnote)
            .foregroundStyle(HomeboardPalette.secondaryText)
        }

        Spacer()

        if appModel.isAdvisorWalletLoading {
          ProgressView()
            .tint(HomeboardPalette.accent)
        }
      }

      ProgressView(value: appModel.advisorWalletStatus?.progressFraction ?? 0)
        .tint(appModel.advisorWalletStatus?.isUnlocked == true ? HomeboardPalette.success : HomeboardPalette.accent)

      if appModel.advisorWalletStatus?.isUnlocked == true {
        HStack {
          Label("Advisor Unlocked", systemImage: "checkmark.seal.fill")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.success)
          Spacer()
        }
      } else {
        HStack(spacing: 10) {
          Stepper(value: $amountDollars, in: 1...100) {
            Text("$\(amountDollars)")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.primaryText)
          }

          Button {
            Task { await fundAdvisor() }
          } label: {
            Label("Fund Advisor", systemImage: "creditcard.fill")
              .font(.subheadline.weight(.semibold))
          }
          .buttonStyle(AdvisorCTAButtonStyle())
          .disabled(isPreparingPayment)
        }
      }

      if let paymentMessage {
        Text(paymentMessage)
          .font(.footnote)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }
    }
    .padding(16)
    .homeboardPanel(cornerRadius: 24)
    .task {
      await appModel.refreshAdvisorWalletStatus()
    }
  }

  private var statusLine: String {
    guard let status = appModel.advisorWalletStatus else {
      return "Loading weekly progress."
    }
    if status.subscription.active {
      return "Unlocked this week."
    }
    return "\(Self.money(status.rolling7DayTotalCents)) of \(Self.money(status.thresholdCents)) funded this week."
  }

  private func fundAdvisor() async {
    let publishableKey = HomeboardConfig.stripePublishableKey
    guard !publishableKey.isEmpty else {
      paymentMessage = "Stripe is not configured for this build."
      return
    }
    isPreparingPayment = true
    paymentMessage = nil
    defer { isPreparingPayment = false }

    guard let clientSecret = await appModel.advisorFundingClientSecret(amountCents: amountDollars * 100) else {
      paymentMessage = "Unable to start payment."
      return
    }

    StripeAPI.defaultPublishableKey = publishableKey
    var configuration = PaymentSheet.Configuration()
    configuration.merchantDisplayName = "Homeboard"
    let paymentSheet = PaymentSheet(paymentIntentClientSecret: clientSecret, configuration: configuration)

    guard let presenter = Self.topViewController() else {
      paymentMessage = "Unable to present payment sheet."
      return
    }

    paymentSheet.present(from: presenter) { result in
      Task { @MainActor in
        switch result {
        case .completed:
          paymentMessage = "Advisor funding received."
          await appModel.refreshAdvisorWalletStatus()
        case .canceled:
          paymentMessage = "Payment canceled."
        case .failed(let error):
          paymentMessage = error.localizedDescription
        }
      }
    }
  }

  private static func money(_ cents: Int) -> String {
    let dollars = Double(cents) / 100
    return dollars.formatted(.currency(code: "USD"))
  }

  private static func topViewController(base: UIViewController? = nil) -> UIViewController? {
    let baseController: UIViewController? = {
      if let base { return base }
      for scene in UIApplication.shared.connectedScenes {
        guard let windowScene = scene as? UIWindowScene else { continue }
        for window in windowScene.windows where window.isKeyWindow {
          return window.rootViewController
        }
      }
      return nil
    }()

    if let nav = baseController as? UINavigationController {
      return topViewController(base: nav.visibleViewController ?? nav.topViewController)
    }
    if let tab = baseController as? UITabBarController {
      return topViewController(base: tab.selectedViewController)
    }
    if let presented = baseController?.presentedViewController, !presented.isBeingDismissed {
      return topViewController(base: presented)
    }
    return baseController
  }
}

private struct AdvisorCTAButtonStyle: ButtonStyle {
  var isPrimary: Bool = true

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(isPrimary ? HomeboardPalette.buttonText : HomeboardPalette.primaryText)
      .padding(.horizontal, 12)
      .padding(.vertical, 12)
      .background(isPrimary ? HomeboardPalette.accentGradient.opacity(configuration.isPressed ? 0.78 : 1) : Color.white.opacity(0.08))
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}
