import SwiftUI
import UIKit

struct WelcomeView: View {
  @Environment(AppModel.self) private var appModel
  @State private var joinCode = ""
  @State private var selectedPage = 0
  @State private var welcomeDragOffset: CGFloat = 0
  @GestureState private var welcomeGestureActive = false
  @State private var showsInviteEntry = false
  @State private var keyRotation = 0.0
  @State private var isUnlockingInvite = false
  @State private var isInviteUnlocked = false
  @AppStorage("homeboard.debug.welcomePage") private var debugWelcomePage = 0
  @FocusState private var inviteCodeFocused: Bool

  var body: some View {
    ZStack {
      HomeboardPalette.background
        .ignoresSafeArea()

      GeometryReader { geometry in
        ZStack {
          windowedPage {
            heroContent
          }
          .contentShape(Rectangle())
          .gesture(welcomeAdvanceGesture)
          .offset(
            y: selectedPage == 0
              ? welcomeDragOffset
              : -geometry.size.height + welcomeDragOffset
          )
          .allowsHitTesting(selectedPage == 0)

          windowedPage {
            accessContent
          }
          .contentShape(Rectangle())
          .simultaneousGesture(welcomeReturnGesture)
          .offset(
            y: selectedPage == 0
              ? geometry.size.height + welcomeDragOffset
              : welcomeDragOffset
          )
          .allowsHitTesting(selectedPage == 1)
        }
        .clipped()
      }
      .ignoresSafeArea(.container, edges: .bottom)
      .ignoresSafeArea(.keyboard, edges: .bottom)
    }
    .onAppear {
      #if DEBUG
      selectedPage = min(max(debugWelcomePage, 0), 1)
      #endif
    }
    .onChange(of: debugWelcomePage) { _, newValue in
      #if DEBUG
      withAnimation(.easeInOut(duration: 0.2)) {
        selectedPage = min(max(newValue, 0), 1)
        welcomeDragOffset = 0
      }
      #endif
    }
    .onChange(of: welcomeGestureActive) { wasActive, isActive in
      guard wasActive, !isActive, welcomeDragOffset != 0 else { return }
      withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
        welcomeDragOffset = 0
      }
    }
  }

  private func windowedPage<Content: View>(
    @ViewBuilder content: @escaping () -> Content
  ) -> some View {
    GeometryReader { geometry in
      let topMargin: CGFloat = 12
      let bottomMargin = max(geometry.safeAreaInsets.bottom + 18, 54)
      let width = max(geometry.size.width - 32, 0)
      let height = max(geometry.size.height - topMargin - bottomMargin, 0)

      content()
        .frame(
          width: max(width - 44, 0),
          height: max(height - 44, 0),
          alignment: .topLeading
        )
        .padding(22)
        .frame(width: width, height: height)
        .homeboardWindow()
        .position(
          x: geometry.size.width / 2,
          y: topMargin + (height / 2)
        )
    }
  }

  private var heroContent: some View {
    VStack(alignment: .leading, spacing: 24) {
      HStack {
        Text("HOMEBOARD")
          .font(.caption.weight(.bold))
          .tracking(3.4)
          .foregroundStyle(HomeboardPalette.primaryText)

        Spacer()

        Text("UPDATE \(HomeboardConfig.appVersion)")
          .font(.system(size: 9, weight: .bold, design: .rounded))
          .tracking(1.15)
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }

      Spacer(minLength: 28)

      VStack(alignment: .leading, spacing: 14) {
        Text("Finding a place with friends doesn’t have to end your friendship.")
          .font(.system(size: 36, weight: .bold, design: .serif))
          .foregroundStyle(HomeboardPalette.primaryText)
          .fixedSize(horizontal: false, vertical: true)

        Rectangle()
          .fill(HomeboardPalette.accent)
          .frame(width: 52, height: 3)

        Text("Keep listings, commutes, and tradeoffs in one shared place—before the group chat becomes the problem.")
          .font(.body)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }

      Spacer(minLength: 24)

      HStack(spacing: 12) {
        ZStack {
          ForEach(Array(["S", "M", "J"].enumerated()), id: \.offset) { index, initial in
            memberAvatar(initial, color: previewAvatarColors[index], size: 32)
              .offset(x: CGFloat(index) * 22)
          }
        }
        .frame(width: 76, alignment: .leading)

        VStack(alignment: .leading, spacing: 2) {
          Text("Built for the group")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text("One search. Every tradeoff visible.")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.tertiaryText)
        }
      }

      HStack(spacing: 8) {
        Text("Swipe up to continue")
        Image(systemName: "arrow.up")
      }
      .font(.caption.weight(.semibold))
      .foregroundStyle(HomeboardPalette.tertiaryText)
      .frame(maxWidth: .infinity, alignment: .center)
    }
    .padding(.top, 6)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private var welcomeAdvanceGesture: some Gesture {
    DragGesture(minimumDistance: 8, coordinateSpace: .global)
      .updating($welcomeGestureActive) { _, isActive, _ in
        isActive = true
      }
      .onChanged { value in
        guard value.translation.height < 0 else {
          welcomeDragOffset = 0
          return
        }
        guard welcomeDragOffset != 0 ||
                abs(value.translation.height) > abs(value.translation.width) * 0.72
        else { return }
        welcomeDragOffset = min(0, value.translation.height)
      }
      .onEnded { value in
        let verticalTravel = max(
          -value.translation.height,
          -value.predictedEndTranslation.height
        )
        let horizontalTravel = abs(value.translation.width)
        guard verticalTravel >= 68,
              verticalTravel > horizontalTravel * 1.15
        else {
          withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) {
            welcomeDragOffset = 0
          }
          return
        }

        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.interactiveSpring(response: 0.38, dampingFraction: 0.88, blendDuration: 0.12)) {
          selectedPage = 1
          welcomeDragOffset = 0
        }
      }
  }

  private var welcomeReturnGesture: some Gesture {
    DragGesture(minimumDistance: 8, coordinateSpace: .global)
      .updating($welcomeGestureActive) { _, isActive, _ in
        isActive = true
      }
      .onChanged { value in
        guard selectedPage == 1,
              !inviteCodeFocused
        else { return }
        guard value.translation.height > 0 else {
          welcomeDragOffset = 0
          return
        }
        guard welcomeDragOffset != 0 ||
                abs(value.translation.height) > abs(value.translation.width) * 0.72
        else { return }
        welcomeDragOffset = max(0, value.translation.height)
      }
      .onEnded { value in
        guard selectedPage == 1, !inviteCodeFocused else {
          welcomeDragOffset = 0
          return
        }
        let verticalTravel = max(
          value.translation.height,
          value.predictedEndTranslation.height
        )
        let horizontalTravel = abs(value.translation.width)
        guard verticalTravel >= 68,
              verticalTravel > horizontalTravel * 1.15
        else {
          withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) {
            welcomeDragOffset = 0
          }
          return
        }

        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        withAnimation(.interactiveSpring(response: 0.38, dampingFraction: 0.88, blendDuration: 0.12)) {
          selectedPage = 0
          welcomeDragOffset = 0
        }
      }
  }

  private var accessContent: some View {
    ScrollView(.vertical, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 14) {
        VStack(alignment: .leading, spacing: 7) {
          HStack(spacing: 7) {
            Image(systemName: "key.fill")
            Text("BOARD ACCESS")

            Spacer()

            HStack(spacing: 4) {
              Image(systemName: "arrow.down")
              Text("SWIPE DOWN")
            }
            .font(.system(size: 8, weight: .bold))
            .tracking(0.7)
            .foregroundStyle(HomeboardPalette.tertiaryText)
          }
          .font(.caption2.weight(.bold))
          .tracking(1.6)
          .foregroundStyle(HomeboardPalette.accent)

          Text("Get into the workspace.")
            .font(.system(size: 25, weight: .bold, design: .serif))
            .foregroundStyle(HomeboardPalette.primaryText)
            .fixedSize(horizontal: false, vertical: true)

          Text("Use an invite key from your group, then continue with Apple to create or reopen your Homeboard account.")
            .font(.subheadline)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }

        if !appModel.pendingInviteCode.isEmpty {
          pendingInviteBanner
        }

        accessKeyButton

        if showsInviteEntry || !appModel.pendingInviteCode.isEmpty {
          inviteSection
            .id("invite-code")
            .transition(.opacity.combined(with: .move(edge: .top)))
        }

        fullAccountButtons

        Spacer(minLength: 12)

        HStack(spacing: 7) {
          Image(systemName: "lock.fill")
          Text("Boards are private and invite-only.")
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)
        .frame(maxWidth: .infinity)
      }
      .frame(maxWidth: .infinity, minHeight: 0, alignment: .topLeading)
    }
    .background(HomeboardPalette.surface)
    .scrollDismissesKeyboard(.interactively)
    .scrollBounceBehavior(.basedOnSize, axes: .vertical)
    .onChange(of: inviteCodeFocused) { _, focused in
      if focused {
        withAnimation(.easeOut(duration: 0.2)) {
          showsInviteEntry = true
        }
      }
    }
  }

  private var fullAccountButtons: some View {
    Button {
      withAnimation(.easeInOut(duration: 0.24)) {
        appModel.openAuth(mode: .signIn)
      }
    } label: {
      Label("Continue with Apple", systemImage: "apple.logo")
        .font(.subheadline.weight(.semibold))
        .frame(maxWidth: .infinity)
        .padding(.vertical, 15)
        .background(HomeboardPalette.accentGradient)
        .foregroundStyle(HomeboardPalette.buttonText)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(WelcomeAccessPressStyle())
  }

  private var compactAccountButtons: some View {
    compactAccountButton("Continue with Apple", mode: .signIn)
    .padding(.top, 2)
  }

  private func compactAccountButton(_ title: String, mode: AppModel.AuthMode) -> some View {
    Button {
      withAnimation(.easeInOut(duration: 0.2)) {
        appModel.openAuth(mode: mode, inviteCode: joinCode)
      }
    } label: {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.secondaryText)
        .frame(maxWidth: .infinity)
        .frame(height: 34)
        .background(Color.white.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }
    .buttonStyle(.plain)
  }

  private var workspacePreview: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(spacing: 10) {
        Circle()
          .fill(HomeboardPalette.accent)
          .frame(width: 9, height: 9)
        Text("Live shared search")
          .font(.caption.weight(.bold))
          .tracking(1.2)
          .foregroundStyle(HomeboardPalette.secondaryText)
        Spacer()
        Text("NYC")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
      }

      VStack(alignment: .leading, spacing: 10) {
        previewRow(icon: "person.3.fill", title: "Group brief", value: "$4.8K max · 3 people")
        previewRow(icon: "tram.fill", title: "Commutes", value: "Midtown · FiDi · Dumbo")
        previewRow(icon: "building.2.fill", title: "Shortlist", value: "5 places being discussed")
      }

      HStack(spacing: 8) {
        ForEach(Array(["S", "M", "J"].enumerated()), id: \.offset) { index, initial in
          memberAvatar(initial, color: previewAvatarColors[index], size: 30)
        }
        Spacer()
        Image(systemName: "arrow.right")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
      }
    }
    .padding(16)
    .background(Color.white.opacity(0.045))
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
  }

  private var previewAvatarColors: [Color] {
    [
      HomeboardPalette.accentStrong,
      Color(red: 1.0, green: 0.66, blue: 0.30),
      Color(red: 0.42, green: 0.88, blue: 0.67)
    ]
  }

  private func previewRow(icon: String, title: String, value: String) -> some View {
    HStack(spacing: 10) {
      Image(systemName: icon)
        .font(.caption.weight(.bold))
        .foregroundStyle(HomeboardPalette.accent)
        .frame(width: 22)
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)
      Spacer(minLength: 8)
      Text(value)
        .font(.caption)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }
  }

  private var pendingInviteBanner: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("INVITE SAVED")
        .font(.caption2.weight(.bold))
        .tracking(1.5)
        .foregroundStyle(HomeboardPalette.accent)

      Text("Code \(appModel.pendingInviteCode) will be checked after you continue with Apple.")
        .font(.footnote)
        .foregroundStyle(HomeboardPalette.primaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .homeboardInsetSurface(cornerRadius: 14, accent: HomeboardPalette.accent)
  }

  private var inviteSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 12) {
        TextField(
          "",
          text: inviteCodeBinding,
          prompt: Text("10-character invite code").foregroundStyle(HomeboardPalette.tertiaryText)
        )
        .textInputAutocapitalization(.characters)
        .keyboardType(.asciiCapable)
        .autocorrectionDisabled()
        .focused($inviteCodeFocused)
        .submitLabel(.go)
        .onSubmit {
          Task {
            await unlockInviteIfReady()
          }
        }
        .toolbar {
          ToolbarItemGroup(placement: .keyboard) {
            Spacer()
            Button("Done") {
              inviteCodeFocused = false
            }
          }
        }
        .foregroundStyle(HomeboardPalette.primaryText)

        Text("\(joinCode.count)/10")
          .font(.caption2.monospacedDigit().weight(.bold))
          .foregroundStyle(
            joinCode.count == 10
              ? HomeboardPalette.accent
              : HomeboardPalette.tertiaryText
          )
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 13)
      .frame(maxWidth: .infinity)
      .homeboardInsetSurface(cornerRadius: 14)
      .onChange(of: joinCode) { _, newValue in
        guard newValue.count == 10, !isUnlockingInvite, !isInviteUnlocked else { return }
        Task {
          await unlockInviteIfReady()
        }
      }

      Text("Homeboard checks the code after you authenticate.")
        .font(.caption)
        .foregroundStyle(HomeboardPalette.tertiaryText)
        .frame(maxWidth: .infinity, alignment: .center)

      if let authError = appModel.authError, !authError.isEmpty {
        Text(authError)
          .font(.footnote.weight(.medium))
          .foregroundStyle(Color.red.opacity(0.92))
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity)
  }

  private func featureRow(title: String, detail: String) -> some View {
    HStack(alignment: .top, spacing: 12) {
      Circle()
        .fill(HomeboardPalette.accent.opacity(0.9))
        .frame(width: 7, height: 7)
        .padding(.top, 5)

      VStack(alignment: .leading, spacing: 3) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)

        Text(detail)
          .font(.footnote)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .background(Color.white.opacity(0.045))
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
  }

  private var searchSnapshot: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text("HOW HOMEBOARD WORKS")
            .font(.caption2.weight(.bold))
            .tracking(1.6)
            .foregroundStyle(HomeboardPalette.accent)

          Text("Align · collect · decide")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.primaryText)
        }

        Spacer()

        Image(systemName: "person.3.sequence.fill")
          .font(.title3.weight(.semibold))
          .foregroundStyle(HomeboardPalette.accent)
      }

      Rectangle()
        .fill(HomeboardPalette.border)
        .frame(height: 1)

      HStack(spacing: 0) {
        snapshotMetric(value: "Brief", label: "ALIGN")
        snapshotDivider
        snapshotMetric(value: "Homes", label: "COLLECT")
        snapshotDivider
        snapshotMetric(value: "Choice", label: "DECIDE")
      }
    }
    .padding(14)
    .background {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(
          LinearGradient(
            colors: [
              HomeboardPalette.accentStrong.opacity(0.10),
              Color.white.opacity(0.035)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
    }
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(HomeboardPalette.accent.opacity(0.16), lineWidth: 1)
    }
  }

  private var accessKeyButton: some View {
    Button {
      guard !isUnlockingInvite else { return }

      if !showsInviteEntry {
        withAnimation(.spring(response: 0.52, dampingFraction: 0.82)) {
          showsInviteEntry = true
          keyRotation = 90
        }
      }

      DispatchQueue.main.async {
        inviteCodeFocused = true
      }
    } label: {
      VStack(spacing: 12) {
        ZStack {
          RoundedRectangle(cornerRadius: 30, style: .continuous)
            .stroke(HomeboardPalette.accent.opacity(0.10), lineWidth: 1)
            .frame(width: 220, height: 132)
            .rotationEffect(.degrees(-5))

          RoundedRectangle(cornerRadius: 26, style: .continuous)
            .stroke(Color.white.opacity(0.08), lineWidth: 1)
            .frame(width: 178, height: 108)
            .rotationEffect(.degrees(5))

          Circle()
            .fill(HomeboardPalette.accentStrong.opacity(isInviteUnlocked ? 0.24 : 0.14))
            .frame(width: 78, height: 78)
            .overlay {
              Circle()
                .stroke(HomeboardPalette.accent.opacity(isInviteUnlocked ? 0.42 : 0.22), lineWidth: 1)
            }

          if isInviteUnlocked {
            Image(systemName: "arrow.right.circle.fill")
              .font(.system(size: 29, weight: .semibold))
              .foregroundStyle(HomeboardPalette.accent)
              .transition(.scale.combined(with: .opacity))
          } else {
            Image(systemName: "key.horizontal.fill")
              .font(.system(size: 31, weight: .semibold))
            .foregroundStyle(HomeboardPalette.accent)
              .rotationEffect(.degrees(keyRotation))
              .animation(.spring(response: 0.52, dampingFraction: 0.74), value: keyRotation)
              .transition(.scale.combined(with: .opacity))
          }
        }
        .frame(maxWidth: .infinity)

        Text(keyActionTitle)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)

        Text(keyActionDetail)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(WelcomeAccessPressStyle())
    .accessibilityHint("Turns the key and activates the shared board invite code field")
  }

  private var inviteCodeBinding: Binding<String> {
    Binding(
      get: { joinCode },
      set: { value in
        let normalized = value
          .uppercased()
          .filter { $0.isLetter || $0.isNumber }
        joinCode = String(normalized.prefix(10))
      }
    )
  }

  private var keyActionTitle: String {
    if isInviteUnlocked { return "Continue to sign in" }
    if showsInviteEntry { return "Enter your key" }
    return "Have an invite key?"
  }

  private var keyActionDetail: String {
    if isInviteUnlocked { return "Authentication comes before board access." }
    if showsInviteEntry { return "Enter the code your roommate sent you." }
    return "Tap to turn the key and join an existing board."
  }

  @MainActor
  private func unlockInviteIfReady() async {
    guard joinCode.count == 10, !isUnlockingInvite else {
      inviteCodeFocused = true
      return
    }

    isUnlockingInvite = true
    inviteCodeFocused = false
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder),
      to: nil,
      from: nil,
      for: nil
    )

    // Let the keyboard finish moving before the key and screen transition begin.
    try? await Task.sleep(for: .milliseconds(180))

    withAnimation(.spring(response: 0.48, dampingFraction: 0.70)) {
      keyRotation = 180
    }

    try? await Task.sleep(for: .milliseconds(260))

    withAnimation(.easeInOut(duration: 0.20)) {
      isInviteUnlocked = true
    }

    try? await Task.sleep(for: .milliseconds(320))

    await appModel.startInviteJoin(code: joinCode)

    if appModel.currentScreen == .welcome, appModel.authError != nil {
      withAnimation(.spring(response: 0.42, dampingFraction: 0.72)) {
        isInviteUnlocked = false
        keyRotation = 90
      }
      isUnlockingInvite = false
      inviteCodeFocused = true
    }
  }

  private func memberAvatar(
    _ initial: String,
    color: Color,
    size: CGFloat = 28
  ) -> some View {
    Text(initial)
      .font(.system(size: size * 0.39, weight: .bold))
      .foregroundStyle(HomeboardPalette.buttonText)
      .frame(width: size, height: size)
      .background(color)
      .clipShape(Circle())
      .overlay {
        Circle()
          .stroke(HomeboardPalette.surfaceDeep, lineWidth: 2)
      }
  }

  private func snapshotMetric(value: String, label: String) -> some View {
    VStack(spacing: 2) {
      Text(value)
        .font(.subheadline.weight(.bold))
        .foregroundStyle(HomeboardPalette.primaryText)

      Text(label)
        .font(.system(size: 8, weight: .bold))
        .tracking(0.8)
        .foregroundStyle(HomeboardPalette.tertiaryText)
    }
    .frame(maxWidth: .infinity)
  }

  private var snapshotDivider: some View {
    Rectangle()
      .fill(HomeboardPalette.border)
      .frame(width: 1, height: 28)
  }
}

private struct WelcomeAccessPressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.975 : 1)
      .opacity(configuration.isPressed ? 0.86 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}

struct HomeboardWindowModifier: ViewModifier {
  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: 30, style: .continuous)

    content
      .background {
        shape.fill(HomeboardPalette.surface)
      }
      .clipShape(shape)
      .overlay {
        shape.stroke(HomeboardPalette.borderStrong.opacity(0.62), lineWidth: 1)
      }
      .shadow(color: Color.black.opacity(0.30), radius: 18, x: 0, y: 10)
      .contentShape(shape)
  }
}

extension View {
  func homeboardWindow() -> some View {
    modifier(HomeboardWindowModifier())
  }
}
