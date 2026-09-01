import Combine
import Contacts
import MapKit
import SwiftUI

private final class OnboardingAddressSearch: NSObject, ObservableObject, MKLocalSearchCompleterDelegate {
  @Published private(set) var suggestions: [MKLocalSearchCompletion] = []

  private let completer = MKLocalSearchCompleter()
  private var regionSearch: MKLocalSearch?
  private var pendingQuery = ""
  private var pendingCity = ""
  private var requestedRegionCity = ""
  private var resolvedRegionCity = ""

  override init() {
    super.init()
    completer.delegate = self
    completer.resultTypes = [.address, .pointOfInterest]
  }

  func updateCity(query: String) {
    let clean = query.trimmingCharacters(in: .whitespacesAndNewlines)
    pendingQuery = clean
    pendingCity = ""
    completer.region = MKCoordinateRegion(MKMapRect.world)
    guard clean.count >= 2 else {
      completer.queryFragment = ""
      suggestions = []
      return
    }
    completer.queryFragment = clean
  }

  func update(query: String, city: String) {
    let clean = query.trimmingCharacters(in: .whitespacesAndNewlines)
    pendingQuery = clean
    pendingCity = city.trimmingCharacters(in: .whitespacesAndNewlines)
    guard clean.count >= 2 else {
      completer.queryFragment = ""
      suggestions = []
      return
    }

    resolveRegionIfNeeded(for: pendingCity)
    applyAddressQuery()
  }

  func primeRegion(city: String) {
    resolveRegionIfNeeded(
      for: city.trimmingCharacters(in: .whitespacesAndNewlines)
    )
  }

  func clear() {
    completer.queryFragment = ""
    pendingQuery = ""
    pendingCity = ""
    suggestions = []
  }

  func resolvedSearchArea(for suggestion: MKLocalSearchCompletion) async -> String {
    let request = MKLocalSearch.Request(completion: suggestion)
    guard let item = try? await MKLocalSearch(request: request).start().mapItems.first else {
      return Self.fallbackAddress(for: suggestion)
    }

    let placemark = item.placemark
    let locality = placemark.locality
      ?? placemark.subAdministrativeArea
      ?? suggestion.title
    let region = placemark.administrativeArea
    let country = placemark.isoCountryCode == "US" || placemark.isoCountryCode == nil
      ? nil
      : placemark.country
    let components = [locality, region, country]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    let resolved = components.reduce(into: [String]()) { result, component in
      if !result.contains(where: { $0.caseInsensitiveCompare(component) == .orderedSame }) {
        result.append(component)
      }
    }
    return resolved.isEmpty
      ? Self.fallbackAddress(for: suggestion)
      : resolved.joined(separator: ", ")
  }

  func resolvedAddress(for suggestion: MKLocalSearchCompletion) async -> String {
    let request = MKLocalSearch.Request(completion: suggestion)
    guard let item = try? await MKLocalSearch(request: request).start().mapItems.first else {
      return Self.fallbackAddress(for: suggestion)
    }

    if let postalAddress = item.placemark.postalAddress {
      let formatted = CNPostalAddressFormatter.string(
        from: postalAddress,
        style: .mailingAddress
      )
      .components(separatedBy: .newlines)
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .joined(separator: ", ")
      if !formatted.isEmpty {
        return formatted
      }
    }

    return item.placemark.title ?? Self.fallbackAddress(for: suggestion)
  }

  func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    DispatchQueue.main.async {
      self.suggestions = Array(completer.results.prefix(6))
    }
  }

  func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
    DispatchQueue.main.async {
      self.suggestions = []
    }
  }

  private func resolveRegionIfNeeded(for city: String) {
    guard !city.isEmpty else { return }
    let key = city.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
    guard key != requestedRegionCity else { return }
    requestedRegionCity = key
    resolvedRegionCity = ""
    regionSearch?.cancel()

    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = city
    request.resultTypes = [.address, .pointOfInterest]
    let search = MKLocalSearch(request: request)
    regionSearch = search
    search.start { [weak self] response, _ in
      DispatchQueue.main.async {
        guard let self, self.requestedRegionCity == key,
              let coordinate = response?.mapItems.first?.placemark.coordinate
        else { return }

        self.completer.region = MKCoordinateRegion(
          center: coordinate,
          span: MKCoordinateSpan(latitudeDelta: 1.2, longitudeDelta: 1.2)
        )
        self.resolvedRegionCity = key
        self.applyAddressQuery()
      }
    }
  }

  private func applyAddressQuery() {
    guard pendingQuery.count >= 2 else { return }
    let key = pendingCity.folding(
      options: [.caseInsensitive, .diacriticInsensitive],
      locale: .current
    )
    let hasResolvedRegion = !key.isEmpty && key == resolvedRegionCity
    completer.queryFragment = hasResolvedRegion
      || pendingCity.isEmpty
      || pendingQuery.localizedCaseInsensitiveContains(pendingCity)
      ? pendingQuery
      : "\(pendingQuery), \(pendingCity)"
  }

  private static func fallbackAddress(for suggestion: MKLocalSearchCompletion) -> String {
    [suggestion.title, suggestion.subtitle]
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .joined(separator: ", ")
  }
}

struct AuthView: View {
  @Environment(AppModel.self) private var appModel
  @State private var name = ""
  @State private var email = ""
  @State private var password = ""
  @State private var showsPassword = false
  @Namespace private var modeSelection

  var body: some View {
    ZStack {
      HomeboardBackgroundView()

      GeometryReader { geometry in
        let width = max(geometry.size.width - 32, 0)
        let height = max(geometry.size.height - 24, 0)

        ScrollView(.vertical, showsIndicators: false) {
          authContent
            .frame(width: max(width - 44, 0), alignment: .topLeading)
            .frame(minHeight: max(height - 44, 0), alignment: .topLeading)
            .padding(.vertical, 22)
        }
        .frame(width: width, height: height)
        .homeboardWindow()
        .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
        .scrollDismissesKeyboard(.interactively)
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
    .onAppear {
      prefillPendingConfirmationEmail()
    }
    .onChange(of: appModel.pendingConfirmationEmail) {
      prefillPendingConfirmationEmail()
    }
  }

  private var authContent: some View {
    VStack(alignment: .leading, spacing: 20) {
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
          Image(systemName: "lock.fill")
          Text("SECURE ACCESS")
        }
        .font(.caption2.weight(.bold))
        .tracking(1.4)
        .foregroundStyle(HomeboardPalette.accent)
      }

      VStack(alignment: .leading, spacing: 8) {
        Text(appModel.authMode == .createAccount ? "Make Homeboard yours." : "Welcome back.")
          .font(.system(size: 29, weight: .bold, design: .serif))
          .foregroundStyle(HomeboardPalette.primaryText)
          .fixedSize(horizontal: false, vertical: true)

        Text(appModel.authMode == .createAccount
             ? "Create your identity now. Your rental details come next."
             : "Sign in to return to your shared rental boards.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }

      modeSwitcher

      VStack(spacing: 12) {
        if appModel.authMode == .createAccount {
          authField(
            title: "Name",
            systemImage: "person.fill",
            text: $name,
            prompt: "Your name"
          )
          .transition(.move(edge: .top).combined(with: .opacity))
        }

        authField(
          title: "Email",
          systemImage: "envelope.fill",
          text: $email,
          prompt: "you@example.com",
          keyboard: .emailAddress
        )

        passwordField

        if appModel.authMode == .signIn {
          Button {
            Task { await appModel.requestPasswordReset(email: email) }
          } label: {
            Text("Forgot password?")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(HomeboardPalette.accent)
              .frame(maxWidth: .infinity, alignment: .trailing)
          }
          .buttonStyle(.plain)
          .disabled(appModel.isAuthLoading)
        }

      }
      .animation(.easeInOut(duration: 0.22), value: appModel.authMode)

      if let authError = appModel.authError, !authError.isEmpty {
        HStack(alignment: .top, spacing: 9) {
          Image(systemName: "exclamationmark.circle.fill")
          Text(authError)
            .fixedSize(horizontal: false, vertical: true)
        }
        .font(.footnote.weight(.medium))
        .foregroundStyle(Color.red.opacity(0.92))
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.red.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      }


      if let authFeedback = appModel.authFeedback, !authFeedback.isEmpty {
        HStack(alignment: .top, spacing: 9) {
          Image(systemName: "checkmark.circle.fill")
          Text(authFeedback)
            .fixedSize(horizontal: false, vertical: true)
        }
        .font(.footnote.weight(.medium))
        .foregroundStyle(HomeboardPalette.success)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HomeboardPalette.success.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      }

      if appModel.authMode == .signIn,
         !appModel.pendingConfirmationEmail.isEmpty {
        Button {
          Task {
            await appModel.resendSignUpConfirmation(
              email: email.isEmpty ? appModel.pendingConfirmationEmail : email
            )
          }
        } label: {
          Label("Resend confirmation email", systemImage: "envelope.badge")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(HomeboardPalette.accent)
            .frame(maxWidth: .infinity)
            .frame(height: 42)
            .background(HomeboardPalette.accent.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(appModel.isAuthLoading)
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
            .frame(height: 42)
            .background(Color.white.opacity(0.07))
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(appModel.isAuthLoading)
      }

      Button {
        Task {
          await appModel.submitAuth(
            name: name,
            email: email,
            password: password,
            inviteCode: appModel.pendingInviteCode
          )
        }
      } label: {
        ZStack {
          RoundedRectangle(cornerRadius: 17, style: .continuous)
            .fill(HomeboardPalette.accentGradient)

          if appModel.isAuthLoading {
            ProgressView()
              .tint(HomeboardPalette.buttonText)
          } else {
            HStack(spacing: 8) {
              Text(appModel.authMode == .createAccount ? "Create account" : "Sign in")
              Image(systemName: "arrow.right")
            }
            .font(.headline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.buttonText)
          }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 56)
      }
      .buttonStyle(AuthPressStyle())
      .disabled(appModel.isAuthLoading)
      .opacity(appModel.isAuthLoading ? 0.76 : 1)

      Spacer(minLength: 24)

      HStack(spacing: 7) {
        Image(systemName: "checkmark.shield.fill")
        Text("Your boards remain private to invited members.")
      }
      .font(.caption.weight(.medium))
      .foregroundStyle(HomeboardPalette.tertiaryText)
      .frame(maxWidth: .infinity)
    }
  }

  private var modeSwitcher: some View {
    HStack(spacing: 0) {
      authModeButton(.createAccount, title: "Create account")
      authModeButton(.signIn, title: "Sign in")
    }
    .padding(4)
    .background(Color.white.opacity(0.045))
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
  }

  private func prefillPendingConfirmationEmail() {
    guard email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
          !appModel.pendingConfirmationEmail.isEmpty
    else { return }
    email = appModel.pendingConfirmationEmail
  }

  private func authModeButton(_ mode: AppModel.AuthMode, title: String) -> some View {
    Button {
      withAnimation(.easeInOut(duration: 0.22)) {
        appModel.openAuth(mode: mode, inviteCode: appModel.pendingInviteCode)
      }
    } label: {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(
          appModel.authMode == mode
            ? HomeboardPalette.primaryText
            : HomeboardPalette.tertiaryText
        )
        .frame(maxWidth: .infinity)
        .padding(.vertical, 11)
        .background {
          if appModel.authMode == mode {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
              .fill(Color.white.opacity(0.10))
              .matchedGeometryEffect(id: "auth-mode", in: modeSelection)
          }
        }
    }
    .buttonStyle(.plain)
  }

  private func authField(
    title: String,
    systemImage: String,
    text: Binding<String>,
    prompt: String,
    keyboard: UIKeyboardType = .default
  ) -> some View {
    HStack(spacing: 12) {
      Image(systemName: systemImage)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.accent)
        .frame(width: 22)

      VStack(alignment: .leading, spacing: 4) {
        Text(title.uppercased())
          .font(.system(size: 9, weight: .bold))
          .tracking(1.0)
          .foregroundStyle(HomeboardPalette.tertiaryText)

        TextField("", text: text, prompt: Text(prompt).foregroundStyle(HomeboardPalette.tertiaryText))
          .keyboardType(keyboard)
          .textInputAutocapitalization(keyboard == .emailAddress ? .never : .words)
          .autocorrectionDisabled(keyboard == .emailAddress)
          .textContentType(keyboard == .emailAddress ? .emailAddress : .name)
          .foregroundStyle(HomeboardPalette.primaryText)
          .font(.subheadline)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .homeboardInsetSurface(cornerRadius: 16)
  }

  private var passwordField: some View {
    HStack(spacing: 12) {
      Image(systemName: "key.fill")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.accent)
        .frame(width: 22)

      VStack(alignment: .leading, spacing: 4) {
        Text("PASSWORD")
          .font(.system(size: 9, weight: .bold))
          .tracking(1.0)
          .foregroundStyle(HomeboardPalette.tertiaryText)

        Group {
          if showsPassword {
            TextField("", text: $password, prompt: Text("At least 8 characters").foregroundStyle(HomeboardPalette.tertiaryText))
          } else {
            SecureField("", text: $password, prompt: Text("At least 8 characters").foregroundStyle(HomeboardPalette.tertiaryText))
          }
        }
        .textContentType(appModel.authMode == .createAccount ? .newPassword : .password)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .foregroundStyle(HomeboardPalette.primaryText)
        .font(.subheadline)
      }

      Button {
        showsPassword.toggle()
      } label: {
        Image(systemName: showsPassword ? "eye.slash.fill" : "eye.fill")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.tertiaryText)
          .frame(width: 30, height: 30)
      }
      .buttonStyle(.plain)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .homeboardInsetSurface(cornerRadius: 16)
  }
}

struct PostAuthInvitePrompt: View {
  @Environment(AppModel.self) private var appModel
  @State private var inviteCode = ""
  @FocusState private var inviteFocused: Bool

  private var normalizedInviteCode: String {
    normalizeInviteEntry(inviteCode)
  }

  private var inviteTokenIsComplete: Bool {
    // Keep ten-character links from earlier beta builds usable.
    normalizedInviteCode.count == 10 || normalizedInviteCode.count == 32
  }

  private func normalizeInviteEntry(_ value: String) -> String {
    let candidate = value.contains("/")
      ? value.split(separator: "/").last.map(String.init) ?? value
      : value
    let withoutQuery = candidate
      .split(separator: "?").first.map(String.init) ?? candidate
    let token = withoutQuery
      .uppercased()
      .filter { $0.isLetter || $0.isNumber }
    return String(token.prefix(32))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
        HStack(spacing: 13) {
          Image(systemName: "key.fill")
            .font(.headline)
            .foregroundStyle(HomeboardPalette.accent)
            .frame(width: 42, height: 42)
            .background(HomeboardPalette.accent.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))

          VStack(alignment: .leading, spacing: 3) {
            Text("Join your roommates?")
              .font(.title3.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
            Text("Open their link, paste it here, or start a new board.")
              .font(.subheadline)
              .foregroundStyle(HomeboardPalette.secondaryText)
          }
        }

        HStack {
          TextField(
            "",
            text: Binding(
              get: { inviteCode },
              set: { inviteCode = normalizeInviteEntry($0) }
            ),
            prompt: Text("PASTE INVITE LINK").foregroundStyle(HomeboardPalette.tertiaryText)
          )
          .textInputAutocapitalization(.characters)
          .keyboardType(.asciiCapable)
          .autocorrectionDisabled()
          .focused($inviteFocused)
          .submitLabel(.join)
          .onSubmit {
            guard inviteTokenIsComplete else { return }
            Task { await appModel.continueAfterAuthentication(inviteCode: normalizedInviteCode) }
          }
          .foregroundStyle(HomeboardPalette.primaryText)
          .font(.headline.monospaced())

          Text(inviteCode.isEmpty ? "LINK" : "\(normalizedInviteCode.count) CHARS")
            .font(.caption.monospacedDigit().weight(.bold))
            .foregroundStyle(
              inviteTokenIsComplete
                ? HomeboardPalette.accent
                : HomeboardPalette.tertiaryText
            )
        }
        .padding(.horizontal, 14)
        .frame(height: 54)
        .homeboardInsetSurface(cornerRadius: 16)

        if let authError = appModel.authError, !authError.isEmpty {
          Text(authError)
            .font(.footnote.weight(.medium))
            .foregroundStyle(HomeboardPalette.danger)
            .fixedSize(horizontal: false, vertical: true)
        }

        Button {
          Task { await appModel.continueAfterAuthentication(inviteCode: normalizedInviteCode) }
        } label: {
          Group {
            if appModel.isAuthLoading {
              ProgressView().tint(HomeboardPalette.buttonText)
            } else {
              Text("Join board")
            }
          }
          .font(.headline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(maxWidth: .infinity)
          .frame(height: 52)
          .background(HomeboardPalette.accentGradient)
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(AuthPressStyle())
        .disabled(!inviteTokenIsComplete || appModel.isAuthLoading)
        .opacity(inviteTokenIsComplete ? 1 : 0.48)

        Button {
          appModel.continueAfterAuthenticationWithoutInvite()
        } label: {
          Text(appModel.availableBoards.isEmpty ? "Create my own board" : "Continue to my boards")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.secondaryText)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .disabled(appModel.isAuthLoading)
    }
    .padding(20)
    .frame(maxWidth: 360)
    .background(HomeboardPalette.surface.opacity(0.99))
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 24, style: .continuous)
        .stroke(HomeboardPalette.borderStrong.opacity(0.55), lineWidth: 1)
    }
    .shadow(color: Color.black.opacity(0.42), radius: 26, x: 0, y: 14)
    .onAppear {
      inviteCode = appModel.pendingInviteCode
    }
    .toolbar {
      ToolbarItemGroup(placement: .keyboard) {
        Spacer()
        Button("Done") {
          inviteFocused = false
        }
      }
    }
  }
}

struct AuthPressStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.975 : 1)
      .opacity(configuration.isPressed ? 0.86 : 1)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }
}

private enum OnboardingQuestion: Int, CaseIterable, Identifiable {
  case name
  case city
  case moveIn
  case budget
  case commuteTarget
  case commuteAccess
  case commuteLimit
  case neighborhoods
  case priorities
  case mustHaves
  case dealbreakers
  case readiness
  case review

  var id: Int { rawValue }
}

struct OnboardingView: View {
  @Environment(AppModel.self) private var appModel
  @StateObject private var addressSearch = OnboardingAddressSearch()
  @State private var question: OnboardingQuestion = .name
  @State private var showsOther = false
  @State private var customPrimary = ""
  @State private var customSecondary = ""
  @State private var includesNameQuestion = false
  @FocusState private var customFieldFocused: Bool

  private let columns = [
    GridItem(.flexible(), spacing: 10),
    GridItem(.flexible(), spacing: 10)
  ]

  var body: some View {
    ZStack {
      HomeboardBackgroundView()

      VStack(spacing: 0) {
        onboardingHeader

        ScrollView(.vertical, showsIndicators: false) {
          VStack(alignment: .leading, spacing: 18) {
            questionCard

            if question != .review {
              HStack(spacing: 8) {
                Image(systemName: "checkmark.circle")
                Text("Each answer updates the shared search profile.")
              }
              .font(.caption.weight(.medium))
              .foregroundStyle(HomeboardPalette.tertiaryText)
              .frame(maxWidth: .infinity, alignment: .center)
            }
          }
          .padding(.horizontal, 16)
          .padding(.top, 18)
          .padding(.bottom, 118)
        }
        .scrollDismissesKeyboard(.interactively)
        .id(question)
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      navigationBar
    }
    .toolbar {
      ToolbarItemGroup(placement: .keyboard) {
        Spacer()
        Button("Done") {
          customFieldFocused = false
        }
      }
    }
    .onAppear {
      includesNameQuestion = appModel.profile.name
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .isEmpty
      question = includesNameQuestion ? .name : .city
      loadCurrentAnswer()
    }
    .onChange(of: question) { _, _ in
      loadCurrentAnswer()
    }
  }

  private var onboardingHeader: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 3) {
          Text("START YOUR BOARD")
            .font(.caption2.weight(.bold))
            .tracking(2.4)
            .foregroundStyle(HomeboardPalette.accent)

          Text(question == .review ? "Review" : "Step \(currentQuestionNumber) of \(onboardingStepCount)")
            .font(.footnote.weight(.medium))
            .foregroundStyle(HomeboardPalette.secondaryText)
        }

        Spacer()

        Text("\(progressPercent)%")
          .font(.footnote.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
      }

      GeometryReader { geometry in
        ZStack(alignment: .leading) {
          Capsule().fill(Color.white.opacity(0.08))
          Capsule()
            .fill(HomeboardPalette.accentGradient)
            .frame(width: max(18, geometry.size.width * progress))
        }
      }
      .frame(height: 6)
    }
    .padding(.horizontal, 20)
    .padding(.top, 12)
    .padding(.bottom, 14)
    .background(HomeboardPalette.backgroundSecondary.opacity(0.88))
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(HomeboardPalette.border)
        .frame(height: 1)
    }
  }

  private var questionCard: some View {
    VStack(alignment: .leading, spacing: 20) {
      VStack(alignment: .leading, spacing: 8) {
        Text(questionTitle)
          .font(.system(size: 27, weight: .bold, design: .serif))
          .foregroundStyle(HomeboardPalette.primaryText)
          .fixedSize(horizontal: false, vertical: true)

        Text(questionHelper)
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }

      questionAnswer

      if showsOther
          && question != .name
          && question != .city
          && question != .commuteTarget
          && question != .review {
        otherAnswerFields
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .id(question)
    .padding(20)
    .homeboardPanel(cornerRadius: 28)
    .animation(.easeInOut(duration: 0.2), value: showsOther)
  }

  @ViewBuilder
  private var questionAnswer: some View {
    switch question {
    case .name:
      directField(
        title: "Your name",
        prompt: "What your roommates will see",
        text: Binding(
          get: { appModel.profile.name },
          set: { value in
            appModel.profile.name = value
            appModel.saveOnboardingDraft()
          }
        )
      )

    case .city:
      citySearchAnswer

    case .neighborhoods, .priorities, .mustHaves, .dealbreakers:
      multiChoiceGrid(options: options)

    case .commuteTarget:
      commuteAddressAnswer

    case .commuteLimit:
      commuteRangeAnswer

    case .review:
      reviewAnswers

    default:
      singleChoiceGrid(options: options)
    }
  }

  private var citySearchAnswer: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("CITY OR METRO AREA")
        .font(.caption2.weight(.bold))
        .tracking(1.2)
        .foregroundStyle(HomeboardPalette.accent)

      TextField(
        "",
        text: citySearchBinding,
        prompt: Text("Start typing a city or metro").foregroundStyle(HomeboardPalette.tertiaryText)
      )
      .textContentType(.addressCity)
      .textInputAutocapitalization(.words)
      .autocorrectionDisabled()
      .focused($customFieldFocused)
      .font(.body.weight(.medium))
      .foregroundStyle(HomeboardPalette.primaryText)
      .padding(.horizontal, 15)
      .frame(height: 54)
      .homeboardInsetSurface(cornerRadius: 16)

      if !addressSearch.suggestions.isEmpty && customFieldFocused {
        VStack(spacing: 0) {
          ForEach(Array(addressSearch.suggestions.enumerated()), id: \.offset) { index, suggestion in
            Button {
              selectCitySuggestion(suggestion)
            } label: {
              HStack(spacing: 11) {
                Image(systemName: "building.2.crop.circle.fill")
                  .foregroundStyle(HomeboardPalette.accent)

                VStack(alignment: .leading, spacing: 2) {
                  Text(suggestion.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HomeboardPalette.primaryText)
                    .lineLimit(1)
                  if !suggestion.subtitle.isEmpty {
                    Text(suggestion.subtitle)
                      .font(.caption)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                      .lineLimit(1)
                  }
                }

                Spacer(minLength: 4)
              }
              .padding(.horizontal, 12)
              .frame(height: 54)
            }
            .buttonStyle(.plain)

            if index < addressSearch.suggestions.count - 1 {
              Rectangle()
                .fill(HomeboardPalette.border)
                .frame(height: 1)
                .padding(.leading, 44)
            }
          }
        }
        .homeboardInsetSurface(cornerRadius: 16)
      }

      Label("Optional autocomplete from Apple Maps", systemImage: "location.fill")
        .font(.caption2.weight(.medium))
        .foregroundStyle(HomeboardPalette.tertiaryText)
    }
  }

  private var citySearchBinding: Binding<String> {
    Binding(
      get: { appModel.profile.city },
      set: { value in
        appModel.profile.city = value
        addressSearch.updateCity(query: value)
        appModel.saveOnboardingDraft()
      }
    )
  }

  private func selectCitySuggestion(_ suggestion: MKLocalSearchCompletion) {
    customFieldFocused = false
    addressSearch.clear()
    Task {
      let resolved = await addressSearch.resolvedSearchArea(for: suggestion)
      appModel.profile.city = resolved
      addressSearch.primeRegion(city: resolved)
      appModel.saveOnboardingDraft()
    }
  }

  private var commuteAddressAnswer: some View {
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 8) {
        HStack(spacing: 7) {
          Image(systemName: "mappin.and.ellipse")
          Text("WORK OR SCHOOL ADDRESS")
        }
        .font(.caption2.weight(.bold))
        .tracking(1.1)
        .foregroundStyle(HomeboardPalette.accent)

        TextField(
          "",
          text: commuteAddressBinding,
          prompt: Text("Start typing an address or place").foregroundStyle(HomeboardPalette.tertiaryText)
        )
        .textContentType(.fullStreetAddress)
        .textInputAutocapitalization(.words)
        .autocorrectionDisabled()
        .focused($customFieldFocused)
        .font(.body.weight(.medium))
        .foregroundStyle(HomeboardPalette.primaryText)
        .padding(.horizontal, 15)
        .frame(height: 54)
        .homeboardInsetSurface(cornerRadius: 16)
      }

      if !addressSearch.suggestions.isEmpty && customFieldFocused {
        VStack(spacing: 0) {
          ForEach(Array(addressSearch.suggestions.enumerated()), id: \.offset) { index, suggestion in
            Button {
              selectAddressSuggestion(suggestion)
            } label: {
              HStack(spacing: 11) {
                Image(systemName: "mappin.circle.fill")
                  .foregroundStyle(HomeboardPalette.accent)

                VStack(alignment: .leading, spacing: 2) {
                  Text(suggestion.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HomeboardPalette.primaryText)
                    .lineLimit(1)
                  if !suggestion.subtitle.isEmpty {
                    Text(suggestion.subtitle)
                      .font(.caption)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                      .lineLimit(1)
                  }
                }

                Spacer(minLength: 4)
              }
              .padding(.horizontal, 12)
              .frame(height: 54)
            }
            .buttonStyle(.plain)

            if index < addressSearch.suggestions.count - 1 {
              Rectangle()
                .fill(HomeboardPalette.border)
                .frame(height: 1)
                .padding(.leading, 44)
            }
          }
        }
        .homeboardInsetSurface(cornerRadius: 16)
      }

      Label("Suggestions from Apple Maps", systemImage: "location.fill")
        .font(.caption2.weight(.medium))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text("No commute to compare?")
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)
        .padding(.top, 2)

      LazyVGrid(columns: columns, spacing: 10) {
        answerButton(
          title: "I work remotely",
          selected: appModel.profile.commuteAccess == "remote",
          systemImage: "house.fill"
        ) {
          applyCommuteSkip("remote")
        }
        answerButton(
          title: "Skip commute matching",
          selected: appModel.profile.commuteAccess == "skip",
          systemImage: "forward.fill"
        ) {
          applyCommuteSkip("skip")
        }
      }

      if !skipsCommute {
        Rectangle()
          .fill(HomeboardPalette.border)
          .frame(height: 1)
          .padding(.vertical, 4)

        Text("HOW CAN YOU USUALLY GET THERE?")
          .font(.caption2.weight(.bold))
          .tracking(1.1)
          .foregroundStyle(HomeboardPalette.accent)

        LazyVGrid(columns: columns, spacing: 10) {
          ForEach(commuteAccessOptions, id: \.self) { option in
            answerButton(
              title: option,
              selected: appModel.profile.commuteAccess == commuteAccessValue(for: option),
              systemImage: icon(for: option)
            ) {
              applyCommuteAccess(option)
            }
          }
        }

        Text("COMFORTABLE COMMUTE RANGE")
          .font(.caption2.weight(.bold))
          .tracking(1.1)
          .foregroundStyle(HomeboardPalette.accent)
          .padding(.top, 4)

        commuteRangeAnswer
      }
    }
  }

  private var commuteAccessOptions: [String] {
    ["Car or consistent ride", "No car, transit first", "Sometimes / either"]
  }

  private var commuteAddressBinding: Binding<String> {
    Binding(
      get: { appModel.profile.commuteTarget },
      set: { value in
        appModel.profile.commuteTarget = value
        if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          if appModel.profile.commuteAccess == "remote" || appModel.profile.commuteAccess == "skip" {
            appModel.profile.commuteAccess = nil
          }
          ensureDefaultCommuteRange()
          addressSearch.update(query: value, city: appModel.profile.city)
        } else {
          addressSearch.clear()
        }
      }
    )
  }

  private func selectAddressSuggestion(_ suggestion: MKLocalSearchCompletion) {
    customFieldFocused = false
    addressSearch.clear()
    Task {
      let resolved = await addressSearch.resolvedAddress(for: suggestion)
      appModel.profile.commuteTarget = resolved
      appModel.profile.commuteAccess = nil
      ensureDefaultCommuteRange()
      appModel.saveOnboardingDraft()
    }
  }

  private func applyCommuteSkip(_ value: String) {
    customFieldFocused = false
    addressSearch.clear()
    showsOther = false
    if appModel.profile.commuteAccess == value {
      appModel.profile.commuteAccess = nil
    } else {
      appModel.profile.commuteAccess = value
      appModel.profile.commuteTarget = ""
      appModel.profile.minCommuteMinutes = ""
      appModel.profile.maxCommuteMinutes = ""
    }
    appModel.saveOnboardingDraft()
  }

  private func applyCommuteAccess(_ option: String) {
    let value = commuteAccessValue(for: option)
    if appModel.profile.commuteAccess == value {
      appModel.profile.commuteAccess = nil
    } else {
      appModel.profile.commuteAccess = value
      ensureDefaultCommuteRange()
    }
    appModel.saveOnboardingDraft()
  }

  private func ensureDefaultCommuteRange() {
    if appModel.profile.minCommuteMinutes.isEmpty {
      appModel.profile.minCommuteMinutes = "5"
    }
    if appModel.profile.maxCommuteMinutes.isEmpty {
      appModel.profile.maxCommuteMinutes = "45"
    }
  }

  private var commuteRangeAnswer: some View {
    HomeboardCommuteRangeControl(
      minimumMinutes: Binding(
        get: { Int(appModel.profile.minCommuteMinutes) ?? 5 },
        set: { value in
          appModel.profile.minCommuteMinutes = String(value)
          appModel.saveOnboardingDraft()
        }
      ),
      maximumMinutes: Binding(
        get: { Int(appModel.profile.maxCommuteMinutes) ?? 45 },
        set: { value in
          appModel.profile.maxCommuteMinutes = String(value)
          appModel.saveOnboardingDraft()
        }
      )
    )
  }

  private func singleChoiceGrid(options: [String]) -> some View {
    VStack(spacing: 10) {
      LazyVGrid(columns: columns, spacing: 10) {
        ForEach(options, id: \.self) { option in
          answerButton(
            title: option,
            selected: isSingleOptionSelected(option),
            systemImage: icon(for: option)
          ) {
            applySingleOption(option)
          }
        }
      }

      answerButton(
        title: "Other",
        selected: showsOther,
        systemImage: "square.and.pencil"
      ) {
        showsOther.toggle()
        if showsOther {
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
            customFieldFocused = true
          }
        }
      }
    }
  }

  private func multiChoiceGrid(options: [String]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Choose all that apply")
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      LazyVGrid(columns: columns, spacing: 10) {
        ForEach(options, id: \.self) { option in
          answerButton(
            title: option,
            selected: selectedValues.contains(where: { $0.caseInsensitiveCompare(option) == .orderedSame }),
            systemImage: icon(for: option)
          ) {
            toggleMultiOption(option)
          }
        }
      }

      answerButton(
        title: "Other",
        selected: showsOther,
        systemImage: "square.and.pencil"
      ) {
        showsOther.toggle()
        if showsOther {
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) {
            customFieldFocused = true
          }
        }
      }
    }
  }

  private func answerButton(
    title: String,
    selected: Bool,
    systemImage: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Image(systemName: systemImage)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(selected ? HomeboardPalette.buttonText : HomeboardPalette.accentStrong)

          Spacer()

          Image(systemName: selected ? "checkmark.circle.fill" : "circle")
            .font(.caption)
            .foregroundStyle(selected ? HomeboardPalette.buttonText : HomeboardPalette.tertiaryText)
        }

        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .multilineTextAlignment(.leading)
          .lineLimit(2)
          .minimumScaleFactor(0.86)
      }
      .frame(maxWidth: .infinity, minHeight: 76, alignment: .topLeading)
      .padding(13)
      .background {
        RoundedRectangle(cornerRadius: 17, style: .continuous)
          .fill(selected ? AnyShapeStyle(HomeboardPalette.accentGradient) : AnyShapeStyle(HomeboardPalette.insetFill))
      }
      .overlay {
        RoundedRectangle(cornerRadius: 17, style: .continuous)
          .stroke(selected ? HomeboardPalette.accentStrong : HomeboardPalette.border, lineWidth: 1)
      }
      .contentShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
    }
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity)
    .contentShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  @ViewBuilder
  private var otherAnswerFields: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(otherLabel)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.accent)

      if question == .budget {
        HStack(spacing: 10) {
          customField("Minimum", text: $customPrimary, keyboard: .numberPad)
          customField("Maximum", text: $customSecondary, keyboard: .numberPad)
        }
      } else {
        customField(otherPrompt, text: $customPrimary, keyboard: question == .commuteLimit ? .numberPad : .default)
      }

      if isMultiSelectQuestion {
        Text("Separate multiple answers with commas.")
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
    }
    .padding(14)
    .homeboardInsetSurface(cornerRadius: 18, accent: HomeboardPalette.accent)
  }

  private func directField(
    title: String,
    prompt: String,
    text: Binding<String>
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title.uppercased())
        .font(.caption2.weight(.bold))
        .tracking(1.2)
        .foregroundStyle(HomeboardPalette.accent)

      TextField("", text: text, prompt: Text(prompt).foregroundStyle(HomeboardPalette.tertiaryText))
        .textInputAutocapitalization(.words)
        .autocorrectionDisabled()
        .focused($customFieldFocused)
        .font(.body.weight(.medium))
        .foregroundStyle(HomeboardPalette.primaryText)
        .padding(.horizontal, 15)
        .frame(height: 54)
        .homeboardInsetSurface(cornerRadius: 16)
    }
  }

  private func customField(
    _ prompt: String,
    text: Binding<String>,
    keyboard: UIKeyboardType
  ) -> some View {
    TextField("", text: text, prompt: Text(prompt).foregroundStyle(HomeboardPalette.tertiaryText))
      .keyboardType(keyboard)
      .textInputAutocapitalization(keyboard == .numberPad ? .never : .words)
      .autocorrectionDisabled()
      .focused($customFieldFocused)
      .font(.subheadline.weight(.medium))
      .foregroundStyle(HomeboardPalette.primaryText)
      .padding(.horizontal, 14)
      .frame(maxWidth: .infinity)
      .frame(height: 50)
      .background(HomeboardPalette.surfaceDeep.opacity(0.34))
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(HomeboardPalette.border, lineWidth: 1)
      }
  }

  private var reviewAnswers: some View {
    VStack(spacing: 0) {
      reviewRow("Name", value: appModel.profile.name, destination: .name)
      reviewDivider
      reviewRow("City", value: appModel.profile.city, destination: .city)
      reviewDivider
      reviewRow("Move-in", value: appModel.profile.moveInDate, destination: .moveIn)
      reviewDivider
      reviewRow("Budget", value: budgetSummary, destination: .budget)
      reviewDivider
      reviewRow("Commute", value: commuteSummary, destination: .commuteTarget)
      reviewDivider
      reviewRow("Priorities", value: joined(appModel.profile.priorities), destination: .priorities)

      Text("Neighborhoods, amenities, dealbreakers, and application readiness can be refined from Settings after the board opens.")
        .font(.caption)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)
        .padding(14)
    }
    .homeboardInsetSurface(cornerRadius: 20)
  }

  private func reviewRow(_ label: String, value: String, destination: OnboardingQuestion) -> some View {
    Button {
      withAnimation(.easeInOut(duration: 0.2)) {
        question = destination
      }
    } label: {
      HStack(alignment: .top, spacing: 12) {
        Text(label)
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.tertiaryText)
          .frame(width: 88, alignment: .leading)

        Text(value.isEmpty ? "Not answered" : value)
          .font(.subheadline.weight(.medium))
          .foregroundStyle(value.isEmpty ? HomeboardPalette.tertiaryText : HomeboardPalette.primaryText)
          .multilineTextAlignment(.leading)
          .frame(maxWidth: .infinity, alignment: .leading)

        Image(systemName: "pencil")
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.accent)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
    }
    .buttonStyle(.plain)
  }

  private var reviewDivider: some View {
    Rectangle()
      .fill(HomeboardPalette.border)
      .frame(height: 1)
      .padding(.leading, 14)
  }

  private var navigationBar: some View {
    VStack(spacing: 10) {
      if let error = appModel.onboardingError {
        HStack(alignment: .top, spacing: 10) {
          Image(systemName: "exclamationmark.triangle.fill")
            .foregroundStyle(HomeboardPalette.danger)

          Text(error)
            .font(.caption.weight(.medium))
            .foregroundStyle(HomeboardPalette.primaryText)
            .fixedSize(horizontal: false, vertical: true)

          Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .homeboardInsetSurface(cornerRadius: 15, accent: HomeboardPalette.danger)
      }

      HStack(spacing: 10) {
        if onboardingQuestions.first != question {
          Button {
            goBack()
          } label: {
            Image(systemName: "chevron.left")
              .font(.subheadline.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
              .frame(width: 54, height: 56)
              .background(Color.white.opacity(0.07))
              .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
              .overlay {
                RoundedRectangle(cornerRadius: 17, style: .continuous)
                  .stroke(HomeboardPalette.border, lineWidth: 1)
              }
              .contentShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Previous question")
        }

        Button {
          advance()
        } label: {
          ZStack {
            RoundedRectangle(cornerRadius: 17, style: .continuous)
              .fill(HomeboardPalette.accentGradient)

            if appModel.isOnboardingLoading {
              HStack(spacing: 9) {
                ProgressView().tint(HomeboardPalette.buttonText)
                Text("Creating your board…")
              }
              .font(.headline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.buttonText)
            } else {
              HStack(spacing: 8) {
                Text(onboardingButtonTitle)
                Image(systemName: question == .review ? "person.3.fill" : "arrow.right")
              }
              .font(.headline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.buttonText)
            }
          }
          .frame(maxWidth: .infinity)
          .frame(height: 56)
          .contentShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!canContinue || appModel.isOnboardingLoading)
        .opacity(canContinue ? 1 : 0.42)
      }
    }
    .padding(.horizontal, 16)
    .padding(.top, 10)
    .padding(.bottom, 10)
    .background(.ultraThinMaterial)
    .overlay(alignment: .top) {
      Rectangle().fill(HomeboardPalette.border).frame(height: 1)
    }
  }

  private var onboardingButtonTitle: String {
    guard question == .review else { return "Continue" }
    return appModel.onboardingError == nil ? "Create shared board" : "Try creating board again"
  }

  private var options: [String] {
    switch question {
    case .city:
      return []
    case .moveIn:
      return ["ASAP", "Next month", "In 2–3 months", "In 4–6 months", "Flexible", "Just exploring"]
    case .budget:
      return ["Under $1,200", "$1,200–$1,500", "$1,500–$1,800", "$1,800–$2,200", "$2,200–$2,800", "$2,800+"]
    case .commuteTarget:
      return []
    case .commuteAccess:
      return ["Car or consistent ride", "No car, transit first", "Sometimes / either"]
    case .commuteLimit:
      return []
    case .neighborhoods:
      if appModel.profile.city.localizedCaseInsensitiveContains("New York") {
        return ["Williamsburg", "Bushwick", "Astoria", "Upper Manhattan", "Lower Manhattan", "Open to any area"]
      }
      return ["Near work", "Near transit", "Social / lively", "Quiet / residential", "Near campus", "Open to any area"]
    case .priorities:
      return ["Commute", "Price", "Space", "Neighborhood", "Amenities", "Natural light", "Train access", "Nightlife"]
    case .mustHaves:
      return ["Laundry", "Dishwasher", "Natural light", "Train access", "Pet friendly", "Parking", "Outdoor space", "No hard requirements"]
    case .dealbreakers:
      return ["Over budget", "Broker fee", "Long commute", "Poor train access", "No laundry", "Ground floor", "Tiny bedrooms", "No hard dealbreakers"]
    case .readiness:
      return ["Ready to apply", "Gathering documents", "Need a guarantor", "Waiting on an offer", "Just exploring"]
    default:
      return []
    }
  }

  private var selectedValues: [String] {
    switch question {
    case .neighborhoods: return appModel.profile.neighborhoods
    case .priorities: return appModel.profile.priorities
    case .mustHaves: return appModel.profile.mustHaves
    case .dealbreakers: return appModel.profile.dealbreakers
    default: return []
    }
  }

  private var questionTitle: String {
    switch question {
    case .name: return "What should your roommates call you?"
    case .city: return "Where is the group searching?"
    case .moveIn: return "When do you want to move?"
    case .budget: return "What can you contribute each month?"
    case .commuteTarget: return "Include your commute?"
    case .commuteAccess: return "How can you usually get there?"
    case .commuteLimit: return "What commute range feels right?"
    case .neighborhoods: return "Which areas feel right?"
    case .priorities: return "What should win the tradeoffs?"
    case .mustHaves: return "What does the home absolutely need?"
    case .dealbreakers: return "What should rule a listing out?"
    case .readiness: return "How ready is the group to apply?"
    case .review: return "Does this search brief look right?"
    }
  }

  private var questionHelper: String {
    switch question {
    case .name: return "This is how your name will appear on shared updates and decisions."
    case .city: return "Type a city or metro area. You can narrow the neighborhoods in a moment."
    case .moveIn: return "A rough timeframe is enough. You can change it later."
    case .budget: return "This is your personal share, not the whole apartment. Everyone adds their own range, then Homeboard derives the group total and a fair split."
    case .commuteTarget: return "Add one routable destination. Add how you travel and your comfortable time range on this page. Remote workers can skip it."
    case .commuteAccess: return "Homeboard only recommends routes you can realistically use. A car includes a dependable ride to work."
    case .commuteLimit: return "Choose when a home feels too close to work and when it becomes too far. Every route inside the range scores equally."
    case .neighborhoods: return "Select as many as you want. These are preferences, not permanent limits."
    case .priorities: return "Pick the factors the board should protect when compromises appear."
    case .mustHaves: return "Choose genuine requirements rather than nice-to-haves."
    case .dealbreakers: return "These should eliminate a home before the group wastes time on it."
    case .readiness: return "This helps roommates understand what has to happen before an application."
    case .review: return "Tap any core answer to edit it. Fine-tune neighborhoods, amenities, and dealbreakers after the board opens."
    }
  }

  private var otherLabel: String {
    isMultiSelectQuestion ? "ADD YOUR OWN" : "YOUR ANSWER"
  }

  private var otherPrompt: String {
    switch question {
    case .city: return "City or metro area"
    case .moveIn: return "Date or timeframe"
    case .commuteTarget: return "Full work or school address"
    case .commuteAccess: return "Commute access"
    case .commuteLimit: return "Commute range"
    case .neighborhoods: return "Neighborhoods, separated by commas"
    case .priorities: return "Other priorities"
    case .mustHaves: return "Other must-haves"
    case .dealbreakers: return "Other dealbreakers"
    case .readiness: return "What should the group know?"
    default: return "Type your answer"
    }
  }

  private var isMultiSelectQuestion: Bool {
    [.neighborhoods, .priorities, .mustHaves, .dealbreakers].contains(question)
  }

  private var skipsCommute: Bool {
    appModel.profile.commuteAccess == "remote" || appModel.profile.commuteAccess == "skip"
  }

  private var onboardingQuestions: [OnboardingQuestion] {
    var questions: [OnboardingQuestion] = [
      .city,
      .moveIn,
      .budget,
      .commuteTarget,
      .priorities,
      .review
    ]
    if includesNameQuestion {
      questions.insert(.name, at: 0)
    }
    return questions
  }

  private var onboardingStepCount: Int {
    max(onboardingQuestions.count - 1, 1)
  }

  private var currentQuestionNumber: Int {
    guard let index = onboardingQuestions.firstIndex(of: question) else { return 1 }
    return min(index + 1, onboardingStepCount)
  }

  private var progress: CGFloat {
    CGFloat(currentQuestionNumber) / CGFloat(onboardingStepCount)
  }

  private var progressPercent: Int {
    Int((progress * 100).rounded())
  }

  private var canContinue: Bool {
    let customPrimaryIsValid = showsOther
      && !customPrimary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let customBudgetIsValid = showsOther
      && !customSecondary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

    switch question {
    case .name:
      return !appModel.profile.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    case .city:
      return !appModel.profile.city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    case .moveIn:
      return !appModel.profile.moveInDate.isEmpty || customPrimaryIsValid
    case .budget:
      return !appModel.profile.budgetMax.isEmpty || customBudgetIsValid
    case .commuteTarget:
      if skipsCommute { return true }
      guard !appModel.profile.commuteTarget.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            ["car", "transit", "flexible"].contains(appModel.profile.commuteAccess ?? ""),
            let minimum = Int(appModel.profile.minCommuteMinutes),
            let maximum = Int(appModel.profile.maxCommuteMinutes)
      else { return false }
      return minimum < maximum
    case .commuteAccess:
      return ["car", "transit", "flexible"].contains(appModel.profile.commuteAccess ?? "")
    case .commuteLimit:
      guard let minimum = Int(appModel.profile.minCommuteMinutes),
            let maximum = Int(appModel.profile.maxCommuteMinutes)
      else { return false }
      return minimum < maximum
    case .neighborhoods: return !appModel.profile.neighborhoods.isEmpty || customPrimaryIsValid
    case .priorities: return !appModel.profile.priorities.isEmpty || customPrimaryIsValid
    case .mustHaves: return !appModel.profile.mustHaves.isEmpty || customPrimaryIsValid
    case .dealbreakers: return !appModel.profile.dealbreakers.isEmpty || customPrimaryIsValid
    case .readiness: return !readinessSummary.isEmpty || customPrimaryIsValid
    case .review: return true
    }
  }

  private func advance() {
    customFieldFocused = false
    commitCustomAnswer()
    guard canContinue else { return }

    if question == .review {
      applyStreamlinedDefaults()
      Task {
        await appModel.finishOnboarding()
      }
      return
    }

    guard let index = onboardingQuestions.firstIndex(of: question),
          onboardingQuestions.indices.contains(index + 1)
    else { return }
    let next = onboardingQuestions[index + 1]
    withAnimation(.easeInOut(duration: 0.22)) {
      question = next
    }
  }

  private func goBack() {
    customFieldFocused = false
    appModel.onboardingError = nil
    guard let index = onboardingQuestions.firstIndex(of: question), index > 0 else { return }
    let previous = onboardingQuestions[index - 1]
    withAnimation(.easeInOut(duration: 0.22)) {
      question = previous
    }
  }

  private func applyStreamlinedDefaults() {
    if appModel.profile.neighborhoods.isEmpty {
      appModel.profile.neighborhoods = ["Open to any area"]
    }
    if appModel.profile.mustHaves.isEmpty {
      appModel.profile.mustHaves = ["No hard requirements"]
    }
    if appModel.profile.dealbreakers.isEmpty {
      appModel.profile.dealbreakers = ["No hard dealbreakers"]
    }
    appModel.syncBoardFromProfile()
  }

  private func applySingleOption(_ option: String) {
    showsOther = false
    if isSingleOptionSelected(option) {
      clearSingleOption()
      appModel.saveOnboardingDraft()
      return
    }
    switch question {
    case .city:
      appModel.profile.city = option
    case .moveIn:
      appModel.profile.moveInDate = option
    case .budget:
      let range = budgetRange(for: option)
      appModel.profile.budgetMin = range.min
      appModel.profile.budgetMax = range.max
    case .commuteTarget:
      break
    case .commuteAccess:
      appModel.profile.commuteAccess = commuteAccessValue(for: option)
    case .commuteLimit:
      appModel.profile.maxCommuteMinutes = option.filter(\.isNumber)
    case .readiness:
      applyReadiness(option)
    default:
      break
    }
    appModel.saveOnboardingDraft()
  }

  private func clearSingleOption() {
    switch question {
    case .moveIn:
      appModel.profile.moveInDate = ""
    case .budget:
      appModel.profile.budgetMin = ""
      appModel.profile.budgetMax = ""
    case .commuteAccess:
      appModel.profile.commuteAccess = nil
    case .commuteLimit:
      appModel.profile.maxCommuteMinutes = ""
    case .readiness:
      appModel.profile.readiness = .init(
        hasOfferLetter: false,
        needsGuarantor: false,
        hasProofOfIncome: false
      )
    default:
      break
    }
  }

  private func toggleMultiOption(_ option: String) {
    var values = selectedValues
    let emptyChoice = option.localizedCaseInsensitiveContains("no hard") || option == "Open to any area"

    if emptyChoice {
      values = values.count == 1 && values[0].caseInsensitiveCompare(option) == .orderedSame
        ? []
        : [option]
    } else {
      values.removeAll {
        $0.localizedCaseInsensitiveContains("no hard") || $0 == "Open to any area"
      }
      if let index = values.firstIndex(where: { $0.caseInsensitiveCompare(option) == .orderedSame }) {
        values.remove(at: index)
      } else {
        values.append(option)
      }
    }

    setSelectedValues(values)
    appModel.saveOnboardingDraft()
  }

  private func commitCustomAnswer() {
    guard showsOther else { return }
    let primary = customPrimary.trimmingCharacters(in: .whitespacesAndNewlines)
    let secondary = customSecondary.trimmingCharacters(in: .whitespacesAndNewlines)

    if question == .budget {
      guard !secondary.isEmpty else { return }
    } else {
      guard !primary.isEmpty else { return }
    }

    switch question {
    case .city:
      appModel.profile.city = primary
    case .moveIn:
      appModel.profile.moveInDate = primary
    case .budget:
      appModel.profile.budgetMin = primary.filter(\.isNumber)
      appModel.profile.budgetMax = secondary.filter(\.isNumber)
    case .commuteTarget:
      appModel.profile.commuteTarget = primary
      appModel.profile.commuteAccess = nil
    case .commuteAccess:
      break
    case .commuteLimit:
      appModel.profile.maxCommuteMinutes = primary.filter(\.isNumber)
    case .neighborhoods, .priorities, .mustHaves, .dealbreakers:
      let additions = primary
        .split(separator: ",")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
      var values = selectedValues
      for value in additions where !values.contains(where: { $0.caseInsensitiveCompare(value) == .orderedSame }) {
        values.append(value)
      }
      setSelectedValues(values)
    case .readiness:
      appModel.profile.readiness.notes = primary
    default:
      break
    }
    appModel.saveOnboardingDraft()
  }

  private func setSelectedValues(_ values: [String]) {
    switch question {
    case .neighborhoods: appModel.profile.neighborhoods = values
    case .priorities: appModel.profile.priorities = values
    case .mustHaves: appModel.profile.mustHaves = values
    case .dealbreakers: appModel.profile.dealbreakers = values
    default: break
    }
  }

  private func applyReadiness(_ option: String) {
    switch option {
    case "Ready to apply":
      appModel.profile.readiness = .init(hasOfferLetter: true, needsGuarantor: false, hasProofOfIncome: true)
    case "Need a guarantor":
      appModel.profile.readiness = .init(hasOfferLetter: false, needsGuarantor: true, hasProofOfIncome: false)
    case "Waiting on an offer":
      appModel.profile.readiness = .init(hasOfferLetter: false, needsGuarantor: false, hasProofOfIncome: false, notes: option)
    case "Gathering documents", "Just exploring":
      appModel.profile.readiness = .init(hasOfferLetter: false, needsGuarantor: false, hasProofOfIncome: false, notes: option)
    default:
      break
    }
  }

  private func isSingleOptionSelected(_ option: String) -> Bool {
    switch question {
    case .city: return appModel.profile.city == option
    case .moveIn: return appModel.profile.moveInDate == option
    case .budget:
      let range = budgetRange(for: option)
      return appModel.profile.budgetMin == range.min && appModel.profile.budgetMax == range.max
    case .commuteTarget: return false
    case .commuteAccess: return appModel.profile.commuteAccess == commuteAccessValue(for: option)
    case .commuteLimit: return appModel.profile.maxCommuteMinutes == option.filter(\.isNumber)
    case .readiness: return readinessSummary == option
    default: return false
    }
  }

  private func loadCurrentAnswer() {
    addressSearch.clear()
    showsOther = false
    customPrimary = ""
    customSecondary = ""

    switch question {
    case .city:
      break
    case .moveIn:
      loadOtherIfNeeded(value: appModel.profile.moveInDate)
    case .budget:
      let matchesPreset = options.contains { isSingleOptionSelected($0) }
      if !appModel.profile.budgetMax.isEmpty && !matchesPreset {
        showsOther = true
        customPrimary = appModel.profile.budgetMin
        customSecondary = appModel.profile.budgetMax
      }
    case .commuteTarget:
      if !appModel.profile.commuteTarget.isEmpty {
        addressSearch.update(
          query: appModel.profile.commuteTarget,
          city: appModel.profile.city
        )
      }
    case .commuteAccess:
      break
    case .commuteLimit:
      if appModel.profile.minCommuteMinutes.isEmpty {
        appModel.profile.minCommuteMinutes = "5"
      }
      if appModel.profile.maxCommuteMinutes.isEmpty {
        appModel.profile.maxCommuteMinutes = "45"
      }
      appModel.saveOnboardingDraft()
    case .neighborhoods, .priorities, .mustHaves, .dealbreakers:
      let custom = selectedValues.filter { value in
        !options.contains(where: { $0.caseInsensitiveCompare(value) == .orderedSame })
      }
      if !custom.isEmpty {
        showsOther = true
        customPrimary = custom.joined(separator: ", ")
      }
    case .readiness:
      if !appModel.profile.readiness.notes.isEmpty && !options.contains(appModel.profile.readiness.notes) {
        showsOther = true
        customPrimary = appModel.profile.readiness.notes
      }
    default:
      break
    }
  }

  private func loadOtherIfNeeded(value: String) {
    guard !value.isEmpty, !options.contains(value) else { return }
    showsOther = true
    customPrimary = value
  }

  private func budgetRange(for option: String) -> (min: String, max: String) {
    switch option {
    case "Under $1,200": return ("", "1200")
    case "$1,200–$1,500": return ("1200", "1500")
    case "$1,500–$1,800": return ("1500", "1800")
    case "$1,800–$2,200": return ("1800", "2200")
    case "$2,200–$2,800": return ("2200", "2800")
    case "$2,800+": return ("2800", "3500")
    default: return ("", "")
    }
  }

  private func icon(for option: String) -> String {
    let lower = option.lowercased()
    if lower.contains("new york") || lower.contains("city") { return "building.2.fill" }
    if lower.contains("month") || lower.contains("asap") || lower.contains("exploring") { return "calendar" }
    if lower.contains("renter") || lower.contains("me") { return "person.2.fill" }
    if lower.contains("$") || lower.contains("budget") || lower.contains("price") { return "dollarsign.circle.fill" }
    if lower.contains("commute") || lower.contains("train") || lower.contains("transit") { return "tram.fill" }
    if lower.contains("car") || lower.contains("ride") { return "car.fill" }
    if lower.contains("minute") { return "clock.fill" }
    if lower.contains("laundry") { return "washer.fill" }
    if lower.contains("light") { return "sun.max.fill" }
    if lower.contains("parking") { return "car.fill" }
    if lower.contains("pet") { return "pawprint.fill" }
    if lower.contains("ready") || lower.contains("document") || lower.contains("offer") { return "doc.text.fill" }
    return "house.fill"
  }

  private var budgetSummary: String {
    let min = appModel.profile.budgetMin
    let max = appModel.profile.budgetMax
    if !min.isEmpty && !max.isEmpty { return "$\(min)–$\(max)" }
    if !max.isEmpty { return "Up to $\(max)" }
    return min.isEmpty ? "" : "From $\(min)"
  }

  private var commuteSummary: String {
    let target = appModel.profile.commuteTarget
    let minimum = appModel.profile.minCommuteMinutes
    let maximum = appModel.profile.maxCommuteMinutes
    if target.isEmpty {
      if appModel.profile.commuteAccess == "remote" { return "Works remotely. Not scored." }
      if appModel.profile.commuteAccess == "skip" { return "Commute matching skipped" }
      return ""
    }
    let access = commuteAccessSummary
    let range = minimum.isEmpty || maximum.isEmpty ? "" : "\(minimum)–\(maximum) min"
    let route = range.isEmpty ? target : "\(target), ideal \(range)"
    return access.isEmpty ? route : "\(route) · \(access)"
  }

  private var commuteAccessSummary: String {
    switch appModel.profile.commuteAccess {
    case "car": return "car available"
    case "transit": return "transit first"
    case "flexible": return "drive or transit"
    default: return ""
    }
  }

  private func commuteAccessValue(for option: String) -> String? {
    switch option {
    case "Car or consistent ride": return "car"
    case "No car, transit first": return "transit"
    case "Sometimes / either": return "flexible"
    default: return nil
    }
  }

  private var readinessSummary: String {
    let readiness = appModel.profile.readiness
    if !readiness.notes.isEmpty { return readiness.notes }
    if readiness.hasOfferLetter && readiness.hasProofOfIncome { return "Ready to apply" }
    if readiness.needsGuarantor { return "Need a guarantor" }
    return ""
  }

  private func joined(_ values: [String]) -> String {
    values.joined(separator: ", ")
  }
}

private struct LegacyOnboardingView: View {
  @Environment(AppModel.self) private var appModel
  @State private var neighborhoodDraft = ""
  @State private var mustHaveDraft = ""
  @State private var dealbreakerDraft = ""

  var body: some View {
    ZStack {
      HomeboardBackgroundView()

      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 16) {
          header
          progressCard(profile: appModel.profile)
          currentBriefCard(profile: appModel.profile)
          basicsCard
          budgetAndCommuteCard
          prioritiesCard
          tokenCard(
            title: "Neighborhoods",
            subtitle: "Where the group actually wants the first serious pass.",
            tokens: appModel.profile.neighborhoods,
            draft: $neighborhoodDraft,
            placeholder: "Williamsburg"
          ) { value in
            appModel.profile.neighborhoods.append(value)
            appModel.syncBoardFromProfile()
          } onRemove: { value in
            appModel.profile.neighborhoods.removeAll { $0 == value }
            appModel.syncBoardFromProfile()
          }
          tokenCard(
            title: "Must-haves",
            subtitle: "Things the group genuinely needs, not just likes.",
            tokens: appModel.profile.mustHaves,
            draft: $mustHaveDraft,
            placeholder: "Laundry"
          ) { value in
            appModel.profile.mustHaves.append(value)
            appModel.syncBoardFromProfile()
          } onRemove: { value in
            appModel.profile.mustHaves.removeAll { $0 == value }
            appModel.syncBoardFromProfile()
          }
          tokenCard(
            title: "Dealbreakers",
            subtitle: "What kills a listing immediately.",
            tokens: appModel.profile.dealbreakers,
            draft: $dealbreakerDraft,
            placeholder: "Over $1,800"
          ) { value in
            appModel.profile.dealbreakers.append(value)
            appModel.syncBoardFromProfile()
          } onRemove: { value in
            appModel.profile.dealbreakers.removeAll { $0 == value }
            appModel.syncBoardFromProfile()
          }
          readinessCard
          openBoardButton
        }
        .padding(.horizontal, 16)
        .padding(.top, 22)
        .padding(.bottom, 30)
      }
      .scrollBounceBehavior(.always)
    }
  }

  @ViewBuilder
  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("ONBOARDING")
        .font(.caption.weight(.bold))
        .tracking(4)
        .foregroundStyle(HomeboardPalette.accent)

      Text("Build the shared rental brief.")
        .font(.system(size: 23, weight: .bold, design: .serif))
        .foregroundStyle(HomeboardPalette.primaryText)
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)

      Text("No AI needed here. Just turn the group’s real constraints into one clean shared board.")
        .font(.footnote)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  @ViewBuilder
  private func progressCard(profile: RentalProfile) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("Profile progress")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Spacer()
        Text("\(profile.percentComplete)%")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.accent)
      }

      GeometryReader { geometry in
        ZStack(alignment: .leading) {
          Capsule()
            .fill(Color.white.opacity(0.08))
          Capsule()
            .fill(HomeboardPalette.accentGradient)
            .frame(width: max(24, geometry.size.width * profile.completionRatio))
        }
      }
      .frame(height: 10)

      if !profile.missingFields.isEmpty {
        Text("Still missing")
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.tertiaryText)

        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(profile.missingFields, id: \.self) { field in
              Text(field)
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.white.opacity(0.07))
                .clipShape(Capsule())
            }
          }
        }
      }
    }
    .padding(16)
    .homeboardPanel()
  }

  @ViewBuilder
  private func currentBriefCard(profile: RentalProfile) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("Current brief")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)

        Spacer()

        Text(profile.isBoardReady ? "Ready" : "In progress")
          .font(.caption.weight(.bold))
          .foregroundStyle(profile.isBoardReady ? HomeboardPalette.success : HomeboardPalette.accent)
      }

      HStack(alignment: .top, spacing: 12) {
        profileTile("City", value: profile.city, fallback: "Not set")
        profileTile("Move-in", value: profile.moveInDate, fallback: "Not set")
      }

      HStack(alignment: .top, spacing: 12) {
        profileTile("Budget", value: budgetLine(for: profile), fallback: "Not set")
        profileTile("Commute", value: commuteLine(for: profile), fallback: "Not set")
      }

      profileWideRow("Must-haves", values: profile.mustHaves, fallback: "Still open")
      profileWideRow("Dealbreakers", values: profile.dealbreakers, fallback: "Still open")
      profileWideRow("Priorities", values: profile.priorities, fallback: "Still open")
    }
    .padding(16)
    .homeboardPanel()
  }

  @ViewBuilder
  private var basicsCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Search basics")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      formField("Name", text: Binding(
        get: { appModel.profile.name },
        set: {
          appModel.profile.name = $0
          appModel.syncBoardFromProfile()
        }
      ), prompt: "Sam")

      formField("City", text: Binding(
        get: { appModel.profile.city },
        set: {
          appModel.profile.city = $0
          appModel.syncBoardFromProfile()
        }
      ), prompt: "New York City")

      formField("Move-in date", text: Binding(
        get: { appModel.profile.moveInDate },
        set: {
          appModel.profile.moveInDate = $0
          appModel.syncBoardFromProfile()
        }
      ), prompt: "August")

      VStack(alignment: .leading, spacing: 8) {
        Text("Group size")
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.tertiaryText)

        Stepper(value: Binding(
          get: { appModel.profile.groupSize },
          set: {
            appModel.profile.groupSize = max(1, $0)
            appModel.syncBoardFromProfile()
          }
        ), in: 1...8) {
          Text(appModel.profile.groupSize == 1 ? "1 renter" : "\(appModel.profile.groupSize) renters")
            .foregroundStyle(HomeboardPalette.primaryText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .homeboardInsetSurface(cornerRadius: 16)
      }
    }
    .padding(16)
    .homeboardPanel()
  }

  @ViewBuilder
  private var budgetAndCommuteCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Budget and commute")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      HStack(spacing: 12) {
        formField("Budget min", text: Binding(
          get: { appModel.profile.budgetMin },
          set: {
            appModel.profile.budgetMin = digitsOnly($0)
            appModel.syncBoardFromProfile()
          }
        ), prompt: "1400", keyboard: .numberPad)

        formField("Budget max", text: Binding(
          get: { appModel.profile.budgetMax },
          set: {
            appModel.profile.budgetMax = digitsOnly($0)
            appModel.syncBoardFromProfile()
          }
        ), prompt: "1750", keyboard: .numberPad)
      }

      formField("Commute target", text: Binding(
        get: { appModel.profile.commuteTarget },
        set: {
          appModel.profile.commuteTarget = $0
          appModel.syncBoardFromProfile()
        }
      ), prompt: "Midtown")

      HomeboardCommuteRangeControl(
        minimumMinutes: Binding(
          get: { Int(appModel.profile.minCommuteMinutes) ?? 5 },
          set: {
            appModel.profile.minCommuteMinutes = String($0)
            appModel.syncBoardFromProfile()
          }
        ),
        maximumMinutes: Binding(
          get: { Int(appModel.profile.maxCommuteMinutes) ?? 45 },
          set: {
            appModel.profile.maxCommuteMinutes = String($0)
            appModel.syncBoardFromProfile()
          }
        )
      )
    }
    .padding(16)
    .homeboardPanel()
  }

  private func budgetLine(for profile: RentalProfile) -> String {
    let min = profile.budgetMin.trimmingCharacters(in: .whitespacesAndNewlines)
    let max = profile.budgetMax.trimmingCharacters(in: .whitespacesAndNewlines)

    if min.isEmpty && max.isEmpty {
      return ""
    }

    if !min.isEmpty && !max.isEmpty {
      return "$\(min)–$\(max)"
    }

    if !max.isEmpty {
      return "Up to $\(max)"
    }

    return "From $\(min)"
  }

  private func commuteLine(for profile: RentalProfile) -> String {
    let target = profile.commuteTarget.trimmingCharacters(in: .whitespacesAndNewlines)
    let min = profile.minCommuteMinutes.trimmingCharacters(in: .whitespacesAndNewlines)
    let max = profile.maxCommuteMinutes.trimmingCharacters(in: .whitespacesAndNewlines)

    if target.isEmpty && min.isEmpty && max.isEmpty {
      return ""
    }

    if !target.isEmpty && !min.isEmpty && !max.isEmpty {
      return "\(target), ideal \(min)–\(max) min"
    }

    if !target.isEmpty {
      return target
    }

    if !min.isEmpty && !max.isEmpty {
      return "Ideal \(min)–\(max) min"
    }
    return max.isEmpty ? "At least \(min) min" : "Under \(max) min"
  }

  @ViewBuilder
  private var prioritiesCard: some View {
    let options = ["commute", "price", "space", "neighborhood", "amenities", "train access", "natural light"]

    VStack(alignment: .leading, spacing: 12) {
      Text("Priorities")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      Text("Tap the things that should win tie-breakers once listings compete.")
        .font(.footnote)
        .foregroundStyle(HomeboardPalette.secondaryText)

      FlexibleTagWrap(items: options) { option in
        let active = appModel.profile.priorities.contains(where: { $0.caseInsensitiveCompare(option) == .orderedSame })

        Button {
          togglePriority(option)
        } label: {
          Text(option.capitalized)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(active ? AnyShapeStyle(HomeboardPalette.accentGradient) : AnyShapeStyle(HomeboardPalette.surfaceDeep.opacity(0.42)))
            .foregroundStyle(active ? HomeboardPalette.buttonText : HomeboardPalette.primaryText)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
      }
    }
    .padding(16)
    .homeboardPanel()
  }

  @ViewBuilder
  private func tokenCard(
    title: String,
    subtitle: String,
    tokens: [String],
    draft: Binding<String>,
    placeholder: String,
    onAdd: @escaping (String) -> Void,
    onRemove: @escaping (String) -> Void
  ) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(title)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      Text(subtitle)
        .font(.footnote)
        .foregroundStyle(HomeboardPalette.secondaryText)

      if !tokens.isEmpty {
        FlexibleTagWrap(items: tokens) { token in
          Button {
            onRemove(token)
          } label: {
            HStack(spacing: 6) {
              Text(token)
              Image(systemName: "xmark")
                .font(.caption2.weight(.bold))
            }
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.07))
            .foregroundStyle(HomeboardPalette.primaryText)
            .clipShape(Capsule())
          }
          .buttonStyle(.plain)
        }
      }

      HStack(spacing: 10) {
        TextField("", text: draft, prompt: Text(placeholder).foregroundStyle(HomeboardPalette.tertiaryText))
          .foregroundStyle(HomeboardPalette.primaryText)
          .padding(.horizontal, 16)
          .padding(.vertical, 14)
          .homeboardInsetSurface(cornerRadius: 16)

        Button {
          let value = draft.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines)
          guard !value.isEmpty else { return }
          onAdd(value)
          draft.wrappedValue = ""
        } label: {
          Image(systemName: "plus")
            .font(.headline.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
            .frame(width: 48, height: 48)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
      }
    }
    .padding(20)
    .homeboardPanel()
  }

  @ViewBuilder
  private var readinessCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Rental readiness")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      readinessToggle("Offer letter ready", isOn: Binding(
        get: { appModel.profile.readiness.hasOfferLetter },
        set: {
          appModel.profile.readiness.hasOfferLetter = $0
          appModel.syncBoardFromProfile()
        }
      ))

      readinessToggle("Needs guarantor", isOn: Binding(
        get: { appModel.profile.readiness.needsGuarantor },
        set: {
          appModel.profile.readiness.needsGuarantor = $0
          appModel.syncBoardFromProfile()
        }
      ))

      readinessToggle("Proof of income ready", isOn: Binding(
        get: { appModel.profile.readiness.hasProofOfIncome },
        set: {
          appModel.profile.readiness.hasProofOfIncome = $0
          appModel.syncBoardFromProfile()
        }
      ))
    }
    .padding(20)
    .homeboardPanel()
  }

  @ViewBuilder
  private var openBoardButton: some View {
    VStack(alignment: .leading, spacing: 12) {
      if let onboardingError = appModel.onboardingError, !onboardingError.isEmpty {
        Text(onboardingError)
          .font(.footnote.weight(.medium))
          .foregroundStyle(Color.red.opacity(0.92))
          .fixedSize(horizontal: false, vertical: true)
      }

      Button {
        Task {
          await appModel.finishOnboarding()
        }
      } label: {
        ZStack {
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(HomeboardPalette.accentGradient)

          if appModel.isOnboardingLoading {
            ProgressView()
              .tint(HomeboardPalette.buttonText)
          } else {
            Text(appModel.profile.isBoardReady ? "Open shared board" : "Continue with this brief")
              .font(.headline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.buttonText)
          }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 56)
      }
      .buttonStyle(.plain)
      .disabled(appModel.isOnboardingLoading)
      .opacity(appModel.isOnboardingLoading ? 0.82 : 1)

      Text(appModel.profile.isBoardReady
           ? "The brief is strong enough to start real collaboration."
           : "You can still open the board now and let the group finish the missing fields together.")
        .font(.footnote)
        .foregroundStyle(HomeboardPalette.tertiaryText)
    }
  }

  @ViewBuilder
  private func formField(
    _ title: String,
    text: Binding<String>,
    prompt: String,
    keyboard: UIKeyboardType = .default
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      TextField("", text: text, prompt: Text(prompt).foregroundStyle(HomeboardPalette.tertiaryText))
        .keyboardType(keyboard)
        .foregroundStyle(HomeboardPalette.primaryText)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .homeboardInsetSurface(cornerRadius: 16)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func readinessToggle(_ title: String, isOn: Binding<Bool>) -> some View {
    Toggle(isOn: isOn) {
      Text(title)
        .foregroundStyle(HomeboardPalette.primaryText)
    }
    .tint(HomeboardPalette.accentStrong)
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .homeboardInsetSurface(cornerRadius: 16)
  }

  private func togglePriority(_ option: String) {
    if let index = appModel.profile.priorities.firstIndex(where: { $0.caseInsensitiveCompare(option) == .orderedSame }) {
      appModel.profile.priorities.remove(at: index)
    } else {
      appModel.profile.priorities.append(option)
    }
    appModel.syncBoardFromProfile()
  }

  private func digitsOnly(_ value: String) -> String {
    value.filter(\.isNumber)
  }

  @ViewBuilder
  private func profileTile(_ title: String, value: String, fallback: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title.uppercased())
        .font(.caption2.weight(.bold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text(value.isEmpty ? fallback : value)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, minHeight: 76, alignment: .topLeading)
    .padding(14)
    .homeboardInsetSurface(cornerRadius: 18)
  }

  @ViewBuilder
  private func profileWideRow(_ title: String, values: [String], fallback: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title.uppercased())
        .font(.caption2.weight(.bold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text(values.isEmpty ? fallback : values.joined(separator: ", "))
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.primaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .homeboardInsetSurface(cornerRadius: 18)
  }
}

private struct FlexibleTagWrap<Content: View>: View {
  let items: [String]
  @ViewBuilder var content: (String) -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      let rows = buildRows(items: items)
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        HStack(spacing: 8) {
          ForEach(row, id: \.self) { item in
            content(item)
          }
          Spacer(minLength: 0)
        }
      }
    }
  }

  private func buildRows(items: [String], maxPerRow: Int = 3) -> [[String]] {
    stride(from: 0, to: items.count, by: maxPerRow).map { start in
      Array(items[start..<min(start + maxPerRow, items.count)])
    }
  }
}
