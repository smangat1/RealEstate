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

  @ViewBuilder
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
        } else if currentPayload.executionStatus == "needs_input" {
          HStack(spacing: 4) {
            Image(systemName: "info.circle.fill")
              .font(.caption2)
            Text("Needs info")
              .font(.caption2.weight(.semibold))
          }
          .foregroundStyle(HomeboardPalette.accentSecondary)
        } else {
          HStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
              .font(.caption2)
            Text("Ready to send")
              .font(.caption2.weight(.semibold))
          }
          .foregroundStyle(HomeboardPalette.success)
        }
      }

      VStack(alignment: .leading, spacing: 8) {
        if let contact = currentPayload.contact {
          let contactLabel = [contact.agentName, contact.brokerage]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " • ")
          if !contactLabel.isEmpty {
            HStack(spacing: 5) {
              Image(systemName: "person.crop.circle")
                .font(.caption2)
              Text("To: \(contactLabel)")
                .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(HomeboardPalette.accent)
          }
        }

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
                guard selectedTone != tone else { return }
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
              .buttonStyle(HomeboardAreaButtonStyle())
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
              ForEach(toggles.indices, id: \.self) { index in
                let isEnabled = toggles[index].enabled
                let isRequired = toggles[index].required
                Button {
                  guard !isRequired else { return }
                  toggles[index].enabled.toggle()
                  scheduleRegeneration()
                } label: {
                  HStack(spacing: 5) {
                    Image(systemName: isRequired ? "lock.fill" : (isEnabled ? "checkmark.circle.fill" : "circle"))
                      .font(.caption2)
                    Text(toggles[index].label)
                      .font(.caption.weight(.medium))
                  }
                  .padding(.horizontal, 10)
                  .padding(.vertical, 6)
                  .background(isEnabled ? HomeboardPalette.accent.opacity(0.18) : Color.white.opacity(0.05))
                  .foregroundStyle(isEnabled ? HomeboardPalette.accent : HomeboardPalette.secondaryText)
                  .clipShape(Capsule())
                  .overlay {
                    Capsule().stroke(isEnabled ? HomeboardPalette.accent.opacity(0.3) : Color.white.opacity(0.08), lineWidth: 1)
                  }
                }
                .buttonStyle(HomeboardAreaButtonStyle())
                .disabled(isRequired)
                .accessibilityHint(isRequired ? "Required qualification" : "Regenerates the draft")
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
    // Use the card's original @advisor command so a card about a specific listing
    // stays about that listing when tone or toggles change.
    let originalCommand = message.content
    let originatingMessageId = payload?.messageId
    regenerationTask = Task {
      do { try await Task.sleep(nanoseconds: 350_000_000) }
      catch { return }
      guard revision == regenerationRevision, !Task.isCancelled else { return }
      isRegenerating = true

      do {
        let response = try await appModel.regenerateAdvisorDraft(
          originalCommand: originalCommand,
          tone: tone,
          toggles: selectedToggles,
          originatingMessageId: originatingMessageId
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
        dispatchMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
      }

      if revision == regenerationRevision {
        isRegenerating = false
      }
    }
  }

  private func sendViaEmail() {
    guard let payload, isDraftReady(payload) else { return }
    let recipients = [payload.contact?.agentEmail]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    MessageDispatcher.presentMail(
      recipients: recipients,
      subject: "Homeboard rental outreach",
      body: payload.draftText
    ) { result in
      handleDispatchResult(result)
    }
  }

  private func sendViaMessage() {
    guard let payload, isDraftReady(payload) else { return }
    let recipients = [payload.contact?.agentPhone]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    MessageDispatcher.presentMessage(
      recipients: recipients,
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
    payload.executionStatus != "needs_input"
      && !payload.draftText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
}

struct AdvisorWalletPanel: View {
  @Environment(AppModel.self) private var appModel
  @AppStorage("homeboard.advisor.onboarding.v2.completed") private var advisorOnboardingCompleted = false

  @State private var amountCents = 100
  @State private var isPreparingPayment = false
  @State private var paymentMessage: String?
  @State private var showsAdvisorOnboarding = false

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

        Button {
          showsAdvisorOnboarding = true
        } label: {
          Image(systemName: "info.circle")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.secondaryText)
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .accessibilityLabel("How Advisor works")

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
        VStack(alignment: .leading, spacing: 8) {
          Text("Roommates can chip in separately. The shared total unlocks one full week at $4.")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)

          HStack(spacing: 10) {
            Stepper(value: $amountCents, in: 50...maximumContributionCents, step: 50) {
              Text(Self.money(amountCents))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HomeboardPalette.primaryText)
            }

            Button {
              Task { await fundAdvisor() }
            } label: {
              Label("Chip In", systemImage: "creditcard.fill")
                .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(AdvisorCTAButtonStyle())
            .disabled(isPreparingPayment)
          }
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
      if !advisorOnboardingCompleted {
        showsAdvisorOnboarding = true
      }
      await appModel.refreshAdvisorWalletStatus()
      clampContributionAmount()
    }
    .onChange(of: appModel.advisorWalletStatus?.remainingCents) { _, _ in
      clampContributionAmount()
    }
    .sheet(
      isPresented: $showsAdvisorOnboarding,
      onDismiss: { advisorOnboardingCompleted = true }
    ) {
      AdvisorOnboardingView()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
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

  private var maximumContributionCents: Int {
    max(50, min(400, appModel.advisorWalletStatus?.remainingCents ?? 400))
  }

  private func clampContributionAmount() {
    amountCents = min(maximumContributionCents, max(50, amountCents))
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

    guard let clientSecret = await appModel.advisorFundingClientSecret(amountCents: amountCents) else {
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

private struct AdvisorOnboardingStep {
  let eyebrow: String
  let title: String
  let icon: String
  let summary: String
  let details: [(title: String, body: String)]
}

private struct AdvisorOnboardingView: View {
  @Environment(\.dismiss) private var dismiss
  @State private var page = 0

  private static let steps = [
    AdvisorOnboardingStep(
      eyebrow: "Shared intelligence",
      title: "Meet Homeboard Advisor",
      icon: "sparkles",
      summary: "Advisor turns the facts already on your board into a reviewable outreach draft.",
      details: [
        ("Grounded in your board", "It uses saved listing facts, agent contact details, the group brief, commute needs, and the listing analysis."),
        ("Clear when context is missing", "If the board lacks a required fact, the card asks for it instead of making one up."),
        ("Nothing sends automatically", "Advisor prepares copy. You choose whether to open Messages or Mail and remain in control of the final send."),
      ]
    ),
    AdvisorOnboardingStep(
      eyebrow: "Qualifications and voice",
      title: "Bring the important facts",
      icon: "checklist.checked",
      summary: "Complete the group profile and save the listing you want to contact before asking for outreach.",
      details: [
        ("Required qualifications", "The group’s exact income multiple and credit score stay in qualified outreach when available; required controls are locked."),
        ("Requirements that matter", "Budget, move-in timing, must-haves, dealbreakers, commute limits, and readiness give the draft useful context."),
        ("Four distinct tones", "Professional is polished, Casual is brief and friendly, Stern is direct and urgent, and Passive-Aggressive notes a lack of response without inventing history."),
      ]
    ),
    AdvisorOnboardingStep(
      eyebrow: "Board-funded access",
      title: "Unlock it together",
      icon: "creditcard.fill",
      summary: "Advisor access belongs to the board, so roommates can contribute toward the same unlock.",
      details: [
        ("$4 rolling threshold", "Roommates can contribute separately. When the shared total reaches exactly $4, Advisor unlocks for the board."),
        ("Seven days of access", "Once the threshold is reached, the subscription is active for seven days. The wallet shows progress and the current state."),
        ("Confirmed payments only", "Funding uses Stripe’s PaymentSheet. The wallet refreshes after PaymentSheet confirms completion, never after cancel or failure."),
      ]
    ),
    AdvisorOnboardingStep(
      eyebrow: "Draft to action",
      title: "Ask, tune, then send",
      icon: "paperplane.fill",
      summary: "Use @advisor in the group conversation, or tap a suggested request to get started.",
      details: [
        ("Tune the card", "Changing tone or an optional include control regenerates the draft. Rapid changes are debounced so only the latest choice applies."),
        ("Review the recipient", "Confirm the agent, brokerage, phone or email, and every statement in the draft before opening a compose sheet."),
        ("Status follows the real send", "A listing becomes Outreach Sent only when the Messages or Mail delegate confirms it was sent, not when you cancel, save, or encounter a failure."),
      ]
    ),
  ]

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        TabView(selection: $page) {
          ForEach(Self.steps.indices, id: \.self) { index in
            onboardingPage(Self.steps[index])
              .tag(index)
          }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))

        HStack(spacing: 7) {
          ForEach(Self.steps.indices, id: \.self) { index in
            Capsule()
              .fill(index == page ? HomeboardPalette.accent : Color.white.opacity(0.14))
              .frame(width: index == page ? 24 : 7, height: 7)
              .animation(.easeOut(duration: 0.2), value: page)
          }
        }
        .padding(.bottom, 18)

        HStack(spacing: 10) {
          if page > 0 {
            Button("Back") {
              withAnimation(.easeOut(duration: 0.2)) { page -= 1 }
            }
            .buttonStyle(AdvisorCTAButtonStyle(isPrimary: false))
          }

          Button(page == Self.steps.count - 1 ? "Start using Advisor" : "Continue") {
            if page == Self.steps.count - 1 {
              dismiss()
            } else {
              withAnimation(.easeOut(duration: 0.2)) { page += 1 }
            }
          }
          .buttonStyle(AdvisorCTAButtonStyle())
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 20)
      }
      .background(WorkspaceBackgroundView())
      .navigationTitle("Advisor guide")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark")
          }
          .accessibilityLabel("Close Advisor guide")
        }
      }
    }
  }

  private func onboardingPage(_ step: AdvisorOnboardingStep) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        Image(systemName: step.icon)
          .font(.system(size: 34, weight: .semibold))
          .foregroundStyle(HomeboardPalette.accent)
          .frame(width: 64, height: 64)
          .background(HomeboardPalette.accent.opacity(0.14))
          .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

        VStack(alignment: .leading, spacing: 8) {
          Text(step.eyebrow.uppercased())
            .font(.caption.weight(.bold))
            .tracking(1.4)
            .foregroundStyle(HomeboardPalette.accent)
          Text(step.title)
            .font(.system(size: 30, weight: .bold, design: .serif))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text(step.summary)
            .font(.body)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }

        VStack(alignment: .leading, spacing: 12) {
          ForEach(step.details.indices, id: \.self) { index in
            HStack(alignment: .top, spacing: 12) {
              Image(systemName: "checkmark.circle.fill")
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.success)
                .padding(.top, 2)
              VStack(alignment: .leading, spacing: 4) {
                Text(step.details[index].title)
                  .font(.subheadline.weight(.bold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                Text(step.details[index].body)
                  .font(.footnote)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
        }
      }
      .padding(.horizontal, 20)
      .padding(.top, 20)
      .padding(.bottom, 36)
    }
    .scrollBounceBehavior(.basedOnSize)
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
      .background {
        if isPrimary {
          HomeboardPalette.accentGradient
            .opacity(configuration.isPressed ? 0.78 : 1)
        } else {
          Color.white
            .opacity(configuration.isPressed ? 0.05 : 0.08)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

struct AdvisorTypingBubble: View {
  @State private var dotPhase: Int = 0

  var body: some View {
    HStack(alignment: .bottom, spacing: 8) {
      Circle()
        .fill(HomeboardPalette.accent)
        .frame(width: 24, height: 24)
        .overlay {
          Image(systemName: "sparkles")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(HomeboardPalette.buttonText)
        }

      HStack(spacing: 5) {
        ForEach(0..<3, id: \.self) { index in
          Circle()
            .fill(HomeboardPalette.secondaryText)
            .frame(width: 7, height: 7)
            .scaleEffect(dotPhase == index ? 1.3 : 0.8)
            .opacity(dotPhase == index ? 1.0 : 0.4)
            .animation(
              .easeInOut(duration: 0.45)
                .repeatForever(autoreverses: true)
                .delay(Double(index) * 0.18),
              value: dotPhase
            )
        }
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 11)
      .background(Color.white.opacity(0.06))
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .stroke(HomeboardPalette.accent.opacity(0.2), lineWidth: 1)
      }

      Spacer()
    }
    .onAppear {
      dotPhase = 2
    }
    .padding(.vertical, 4)
  }
}
