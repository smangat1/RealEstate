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
      regenerationRevision += 1
      regenerationTask?.cancel()
    }
  }

  private func advisorCard(_ currentPayload: AdvisorMessagePayload) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .center) {
        VStack(alignment: .leading, spacing: 4) {
          Text("Advisor draft")
            .font(.caption.weight(.bold))
            .tracking(1.6)
            .foregroundStyle(HomeboardPalette.accent)
          Text(currentPayload.executionStatus == "needs_input" ? "Needs group info" : "Ready to send")
            .font(.footnote)
            .foregroundStyle(HomeboardPalette.secondaryText)
        }

        Spacer()

        if isRegenerating {
          ProgressView()
            .tint(HomeboardPalette.accent)
        }
      }

      Text(currentPayload.draftText)
        .font(.body)
        .foregroundStyle(HomeboardPalette.primaryText)
        .fixedSize(horizontal: false, vertical: true)

      Picker("Tone", selection: $selectedTone) {
        ForEach(Self.tones, id: \.self) { tone in
          Text(tone.replacingOccurrences(of: "-", with: " ")).tag(tone)
        }
      }
      .pickerStyle(.segmented)
      .onChange(of: selectedTone) { _, _ in
        scheduleRegeneration()
      }

      VStack(alignment: .leading, spacing: 8) {
        ForEach($toggles) { $toggle in
          Toggle(toggle.label, isOn: $toggle.enabled)
            .disabled(toggle.required)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(HomeboardPalette.primaryText)
            .tint(HomeboardPalette.accent)
        }
      }
      .onChange(of: toggles) { _, _ in
        scheduleRegeneration()
      }

      HStack(spacing: 10) {
        Button {
          sendViaEmail()
        } label: {
          Label("Send via Email", systemImage: "envelope.fill")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(AdvisorCTAButtonStyle())
        .disabled(!MessageDispatcher.canSendMail || !isDraftReady(currentPayload))

        Button {
          sendViaMessage()
        } label: {
          Label("Send via iMessage", systemImage: "message.fill")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(AdvisorCTAButtonStyle())
        .disabled(!MessageDispatcher.canSendText || !isDraftReady(currentPayload))
      }

      if let dispatchMessage {
        Text(dispatchMessage)
          .font(.footnote)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }
    }
    .padding(18)
    .homeboardPanel(cornerRadius: 24)
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
      do { try await Task.sleep(nanoseconds: 650_000_000) }
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
          dispatchMessage = "Advisor returned an unreadable draft."
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
        dispatchMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
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
      dispatchMessage = "Draft was not sent."
    case .failed(let reason):
      dispatchMessage = reason ?? "Unable to send this draft."
    }
  }

  private func isDraftReady(_ payload: AdvisorMessagePayload) -> Bool {
    payload.executionStatus != "needs_input"
      && !payload.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(HomeboardPalette.buttonText)
      .padding(.horizontal, 12)
      .padding(.vertical, 12)
      .background(HomeboardPalette.accentGradient.opacity(configuration.isPressed ? 0.78 : 1))
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}
