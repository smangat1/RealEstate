import SwiftUI
import UIKit

struct BoardShellView: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    TabView(selection: Binding(
      get: {
        switch appModel.boardTab {
        case .board, .shortlist, .updates:
          return appModel.boardTab
        case .compare, .members, .setup:
          return .board
        }
      },
      set: { appModel.openBoardTab($0) }
    )) {
      NavigationStack {
        SharedSearchMapView()
      }
      .toolbarBackground(HomeboardPalette.surface, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .tabItem {
        Label("Search", systemImage: "map.fill")
      }
      .tag(AppModel.BoardTab.board)

      NavigationStack {
        SharedShortlistView()
      }
      .toolbarBackground(HomeboardPalette.surface, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .tabItem {
        Label("Shortlist", systemImage: "building.2.crop.circle.fill")
      }
      .tag(AppModel.BoardTab.shortlist)

      NavigationStack {
        SharedUpdatesView()
      }
      .toolbarBackground(HomeboardPalette.surface, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .tabItem {
        Label("Updates", systemImage: "bubble.left.and.bubble.right.fill")
      }
      .tag(AppModel.BoardTab.updates)

    }
    .tint(HomeboardPalette.accent)
    .toolbarBackground(HomeboardPalette.surface, for: .tabBar)
    .toolbarBackground(.visible, for: .tabBar)
    .background(HomeboardPalette.background)
    .onAppear {
      switch appModel.boardTab {
      case .compare:
        appModel.openBoardTab(.shortlist)
      case .members, .setup:
        appModel.openBoardTab(.board)
      case .board, .shortlist, .updates:
        break
      }
    }
    .task {
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 12_000_000_000)
        await appModel.refreshCurrentBoardSilently()
      }
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .active {
        Task { await appModel.refreshCurrentBoardSilently() }
      }
    }
  }
}

struct WorkspaceBackgroundView: View {
  var showsTexture = false

  var body: some View {
    ZStack(alignment: .top) {
      HomeboardPalette.background

      if showsTexture {
        GeometryReader { geometry in
          Image("HomeboardAuthBackground")
            .resizable()
            .scaledToFill()
            .frame(width: geometry.size.width, height: min(geometry.size.height * 0.42, 380))
            .clipped()
            .opacity(0.13)
            .mask {
              LinearGradient(
                colors: [.black, .black.opacity(0.72), .clear],
                startPoint: .top,
                endPoint: .bottom
              )
            }
        }

        LinearGradient(
          colors: [
            HomeboardPalette.surface.opacity(0.64),
            HomeboardPalette.backgroundSecondary.opacity(0.92),
            HomeboardPalette.background
          ],
          startPoint: .top,
          endPoint: .bottom
        )
      } else {
        GeometryReader { geometry in
          Image("HomeboardAuthBackground")
            .resizable()
            .scaledToFill()
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
            .opacity(0.035)
        }
      }
    }
    .ignoresSafeArea()
  }
}

private struct ShortlistWorkspaceView: View {
  @Environment(AppModel.self) private var appModel
  @State private var selectedListing: ListingPreview?
  @State private var selectedFilter: ListingFilter = .active

  private enum ListingFilter: String, CaseIterable, Identifiable {
    case active
    case touring
    case applied
    case passed
    case all

    var id: String { rawValue }

    var title: String {
      switch self {
      case .active:
        return "Active"
      case .touring:
        return "Touring"
      case .applied:
        return "Applied"
      case .passed:
        return "Passed"
      case .all:
        return "All"
      }
    }
  }

  private var filteredListings: [ListingPreview] {
    switch selectedFilter {
    case .all:
      return appModel.board.shortlist
    case .active:
      return appModel.board.shortlist.filter {
        !["passed", "rejected"].contains($0.status.lowercased())
      }
    default:
      return appModel.board.shortlist.filter {
        $0.status.lowercased() == selectedFilter.rawValue
      }
    }
  }

  private var statusSummary: [(String, Int)] {
    let listings = appModel.board.shortlist
    let active = listings.filter { !["passed", "rejected"].contains($0.status.lowercased()) }.count
    let touring = listings.filter { $0.status.lowercased() == "touring" }.count
    let applied = listings.filter { $0.status.lowercased() == "applied" }.count
    let passed = listings.filter { $0.status.lowercased() == "passed" }.count

    return [
      ("Active", active),
      ("Touring", touring),
      ("Applied", applied),
      ("Passed", passed)
    ]
  }

  var body: some View {
    ScrollView(.vertical, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 12) {
        VStack(alignment: .leading, spacing: 8) {
          Text("Shortlist")
            .font(.system(size: 26, weight: .bold, design: .serif))
            .foregroundStyle(HomeboardPalette.primaryText)

          Text("Track the listings the group is still discussing, what stage they are in, and what still needs to be verified.")
            .font(.footnote)
            .foregroundStyle(HomeboardPalette.secondaryText)
        }

        VStack(alignment: .leading, spacing: 12) {
          Text("Board pulse")
            .font(.headline)
            .foregroundStyle(HomeboardPalette.primaryText)

          LazyVGrid(
            columns: [
              GridItem(.flexible(), spacing: 10),
              GridItem(.flexible(), spacing: 10)
            ],
            spacing: 10
          ) {
            ForEach(statusSummary, id: \.0) { item in
              HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                  Text(item.0)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(HomeboardPalette.secondaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                    .allowsTightening(true)

                  Text("\(item.1)")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(HomeboardPalette.primaryText)
                }

                Spacer(minLength: 4)

                Circle()
                  .fill(item.1 > 0 ? HomeboardPalette.accent : HomeboardPalette.borderStrong)
                  .frame(width: 7, height: 7)
              }
              .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
              .padding(.horizontal, 13)
              .padding(.vertical, 11)
              .homeboardInsetSurface(cornerRadius: 16)
            }
          }
        }
        .padding(16)
        .homeboardPanel()

        VStack(alignment: .leading, spacing: 12) {
          Text("View")
            .font(.caption.weight(.semibold))
            .foregroundStyle(HomeboardPalette.tertiaryText)

          Picker("Shortlist filter", selection: $selectedFilter) {
            ForEach(ListingFilter.allCases) { filter in
              Text(filter.title).tag(filter)
            }
          }
          .pickerStyle(.segmented)
        }
        .padding(16)
        .homeboardPanel(cornerRadius: 24)

        if filteredListings.isEmpty {
          VStack(alignment: .leading, spacing: 8) {
            Text("No listings in this view yet")
              .font(.headline)
              .foregroundStyle(HomeboardPalette.primaryText)

            Text("Add contenders from Setup, then use this space to keep the live shortlist clean as the group tours, applies, or passes.")
              .foregroundStyle(HomeboardPalette.secondaryText)

            Button("Open Setup") {
              appModel.openBoardTab(.setup)
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.06))
            .foregroundStyle(HomeboardPalette.primaryText)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .buttonStyle(.plain)
          }
          .padding(16)
          .homeboardPanel(cornerRadius: 24)
        } else {
          ForEach(filteredListings) { listing in
            Button {
              selectedListing = listing
            } label: {
              VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 10) {
                  VStack(alignment: .leading, spacing: 4) {
                    Text(listing.title)
                      .font(.subheadline.weight(.semibold))
                      .foregroundStyle(HomeboardPalette.primaryText)
                      .multilineTextAlignment(.leading)

                    Text("\(listing.location) · \(listing.priceLine)")
                      .font(.footnote)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                      .multilineTextAlignment(.leading)
                  }

                  Spacer(minLength: 10)

                  Text(listing.status.uppercased())
                    .font(.caption.weight(.bold))
                    .tracking(1.4)
                    .foregroundStyle(HomeboardPalette.accent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Capsule())
                }

                Text(listing.summary)
                  .font(.footnote)
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .multilineTextAlignment(.leading)

                HStack(alignment: .center, spacing: 10) {
                  labelCapsule(systemName: "figure.walk", text: listing.commuteLine)
                  labelCapsule(systemName: "checkmark.seal", text: listing.fitLabel)
                }

                if !listing.groupNote.isEmpty {
                  VStack(alignment: .leading, spacing: 4) {
                    Text("Group note")
                      .font(.caption.weight(.semibold))
                      .foregroundStyle(HomeboardPalette.tertiaryText)
                      Text(listing.groupNote)
                      .font(.caption)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                      .multilineTextAlignment(.leading)
                  }
                }
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(16)
              .homeboardPanel(cornerRadius: 24)
            }
            .buttonStyle(.plain)
          }
        }
      }
      .padding(16)
      .padding(.bottom, 32)
    }
    .scrollBounceBehavior(.always)
    .refreshable {
      await appModel.refreshCurrentBoard()
    }
    .background {
      WorkspaceBackgroundView()
    }
    .toolbar(.hidden, for: .navigationBar)
    .sheet(item: $selectedListing) { listing in
      ListingDetailSheet(listing: listing)
        .presentationDetents([.large])
        .presentationBackground(HomeboardPalette.backgroundSecondary)
    }
  }

  @ViewBuilder
  private func labelCapsule(systemName: String, text: String) -> some View {
    HStack(spacing: 6) {
      Image(systemName: systemName)
      Text(text)
        .lineLimit(1)
    }
    .font(.caption.weight(.medium))
    .foregroundStyle(HomeboardPalette.secondaryText)
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(Color.white.opacity(0.04))
    .clipShape(Capsule())
  }
}

private struct CompareWorkspaceView: View {
  @Environment(AppModel.self) private var appModel
  @State private var selectedListing: ListingPreview?
  @State private var resolutionDrafts: [String: String] = [:]

  var body: some View {
    let board = appModel.board
    let rankedListings = rankedShortlist

    ScrollView(.vertical, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 14) {
        VStack(alignment: .leading, spacing: 8) {
          Text("Comparison")
            .font(.system(size: 26, weight: .bold, design: .serif))
            .foregroundStyle(HomeboardPalette.primaryText)

          Text("See which contenders fit the shared brief best, and close tradeoff questions as the group lines up.")
            .font(.footnote)
            .foregroundStyle(HomeboardPalette.secondaryText)
        }

        if rankedListings.isEmpty {
          VStack(alignment: .leading, spacing: 8) {
            Text("Nothing to compare yet")
              .font(.headline)
              .foregroundStyle(HomeboardPalette.primaryText)

            Text("Once the shortlist has real contenders, this view will surface the strongest practical option, commute option, and risky option.")
              .foregroundStyle(HomeboardPalette.secondaryText)

            Button("Go to shortlist") {
              appModel.openBoardTab(.shortlist)
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.06))
            .foregroundStyle(HomeboardPalette.primaryText)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .buttonStyle(.plain)
          }
          .padding(16)
          .homeboardPanel()
        } else {
          ComparisonSummaryCard(
            practical: rankedListings.first?.listing,
            commute: bestCommuteListing,
            risky: riskiestListing
          )

          VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Ranked contenders", "Deterministic board fit based on budget, commute, neighborhood pull, and must-haves.")

            ForEach(rankedListings, id: \.listing.id) { entry in
              Button {
                selectedListing = entry.listing
              } label: {
                VStack(alignment: .leading, spacing: 8) {
                  HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                      Text(entry.listing.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(HomeboardPalette.primaryText)

                      Text("\(entry.listing.location) · \(entry.listing.priceLine)")
                        .font(.footnote)
                        .foregroundStyle(HomeboardPalette.secondaryText)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 4) {
                      Text(entry.label.uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(HomeboardPalette.accent)
                      Text("\(entry.score) fit cues")
                        .font(.caption)
                        .foregroundStyle(HomeboardPalette.tertiaryText)
                    }
                  }

                  Text(entry.reason)
                    .font(.footnote)
                    .foregroundStyle(HomeboardPalette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)

                  if !entry.concerns.isEmpty {
                    Text("Watch: \(entry.concerns.joined(separator: ", "))")
                      .font(.footnote)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                      .fixedSize(horizontal: false, vertical: true)
                  }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .homeboardInsetSurface(accent: HomeboardPalette.accentStrong)
              }
              .buttonStyle(.plain)
            }
          }
          .padding(16)
          .homeboardPanel()
        }

        VStack(alignment: .leading, spacing: 10) {
          sectionHeader("Resolve decisions", "Turn open questions into concrete board moves.")

          if board.openQuestions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
              Text("No unresolved decisions right now. The board can stay focused on shortlist pressure-testing.")
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

              Button("Add one in Setup") {
                appModel.openBoardTab(.setup)
              }
              .font(.subheadline.weight(.semibold))
              .padding(.horizontal, 14)
              .padding(.vertical, 10)
              .background(Color.white.opacity(0.06))
              .foregroundStyle(HomeboardPalette.primaryText)
              .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
              .buttonStyle(.plain)
            }
          } else {
            ForEach(board.openQuestions, id: \.self) { question in
              VStack(alignment: .leading, spacing: 10) {
                Text(question)
                  .font(.footnote.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .fixedSize(horizontal: false, vertical: true)

                TextField(
                  "",
                  text: Binding(
                    get: { resolutionDrafts[question, default: ""] },
                    set: { resolutionDrafts[question] = $0 }
                  ),
                  prompt: Text("How did the group resolve this?").foregroundStyle(HomeboardPalette.tertiaryText),
                  axis: .vertical
                )
                .lineLimit(2...4)
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .homeboardInsetSurface()

                Button {
                  let resolution = resolutionDrafts[question, default: ""]
                  appModel.resolveOpenQuestion(question, resolution: resolution)
                  resolutionDrafts[question] = ""
                } label: {
                  HStack {
                    Text("Mark resolved")
                    Spacer()
                    Image(systemName: "checkmark.circle.fill")
                  }
                  .font(.subheadline.weight(.semibold))
                  .padding(.horizontal, 14)
                  .padding(.vertical, 13)
                  .background(Color.white.opacity(0.06))
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
              }
              .padding(12)
              .homeboardInsetSurface()
            }
          }
        }
        .padding(16)
        .homeboardPanel()
      }
      .padding(16)
      .padding(.bottom, 32)
    }
    .scrollBounceBehavior(.always)
    .refreshable {
      await appModel.refreshCurrentBoard()
    }
    .background {
      WorkspaceBackgroundView()
    }
    .toolbar(.hidden, for: .navigationBar)
    .sheet(item: $selectedListing) { listing in
      ListingDetailSheet(listing: listing)
        .presentationDetents([.medium, .large])
        .presentationBackground(HomeboardPalette.backgroundSecondary)
    }
  }

  private var rankedShortlist: [(listing: ListingPreview, score: Int, label: String, reason: String, concerns: [String])] {
    appModel.board.shortlist.map { listing in
      let score = score(for: listing)
      let concerns = concerns(for: listing)
      let reason = reason(for: listing, score: score)
      let label: String

      switch score {
      case 5...:
        label = "Strong practical option"
      case 3...4:
        label = "Worth a real look"
      default:
        label = "Needs pressure-testing"
      }

      return (listing, score, label, reason, concerns)
    }
    .sorted { lhs, rhs in
      if lhs.score == rhs.score {
        return lhs.listing.title < rhs.listing.title
      }
      return lhs.score > rhs.score
    }
  }

  private var bestCommuteListing: ListingPreview? {
    rankedShortlist.min {
      commuteBandDistance(from: $0.listing.commuteLine)
        < commuteBandDistance(from: $1.listing.commuteLine)
    }?.listing
  }

  private var riskiestListing: ListingPreview? {
    rankedShortlist.max { concerns(for: $0.listing).count < concerns(for: $1.listing).count }?.listing
  }

  private func score(for listing: ListingPreview) -> Int {
    var score = 0

    if budgetFits(listing) { score += 2 }
    if commuteFits(listing) { score += 1 }
    if neighborhoodFits(listing) { score += 1 }
    if mustHaveSignals(listing) { score += 1 }

    return score
  }

  private func budgetFits(_ listing: ListingPreview) -> Bool {
    guard
      let listingValue = firstCurrencyValue(in: listing.priceLine),
      let boardMax = Int(appModel.profile.budgetMax.trimmingCharacters(in: .whitespacesAndNewlines))
    else { return false }

    return listingValue <= boardMax
  }

  private func commuteFits(_ listing: ListingPreview) -> Bool {
    guard
      let minMinutes = Int(appModel.profile.minCommuteMinutes.trimmingCharacters(in: .whitespacesAndNewlines)),
      let maxMinutes = Int(appModel.profile.maxCommuteMinutes.trimmingCharacters(in: .whitespacesAndNewlines))
    else { return false }

    let listingMinutes = commuteMinutes(from: listing.commuteLine)
    guard listingMinutes != Int.max else { return false }
    return (minMinutes...maxMinutes).contains(listingMinutes)
  }

  private func commuteBandDistance(from commuteLine: String) -> Int {
    let minutes = commuteMinutes(from: commuteLine)
    guard minutes != Int.max,
          let minimum = Int(appModel.profile.minCommuteMinutes),
          let maximum = Int(appModel.profile.maxCommuteMinutes)
    else { return Int.max }
    if minutes < minimum { return minimum - minutes }
    if minutes > maximum { return minutes - maximum }
    return 0
  }

  private func neighborhoodFits(_ listing: ListingPreview) -> Bool {
    let neighborhoods = appModel.profile.neighborhoods.map { $0.lowercased() }
    guard !neighborhoods.isEmpty else { return false }
    let haystack = "\(listing.location) \(listing.summary) \(listing.groupNote)".lowercased()
    return neighborhoods.contains { haystack.contains($0) }
  }

  private func mustHaveSignals(_ listing: ListingPreview) -> Bool {
    let mustHaves = appModel.profile.mustHaves.map { $0.lowercased() }
    guard !mustHaves.isEmpty else { return false }
    let haystack = "\(listing.summary) \(listing.groupNote) \(listing.highlights.joined(separator: " "))".lowercased()
    return mustHaves.contains { haystack.contains($0) }
  }

  private func concerns(for listing: ListingPreview) -> [String] {
    var items: [String] = []

    if !budgetFits(listing), !appModel.profile.budgetMax.isEmpty {
      items.append("budget stretch")
    }

    if !commuteFits(listing),
       !appModel.profile.minCommuteMinutes.isEmpty,
       !appModel.profile.maxCommuteMinutes.isEmpty {
      items.append("commute risk")
    }

    if listing.groupNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      items.append("group note still thin")
    }

    if listing.openRisks.count > 1 {
      items.append("multiple unknowns")
    }

    return items
  }

  private func reason(for listing: ListingPreview, score: Int) -> String {
    if score >= 5 {
      return "This contender is lining up well with the current board brief across budget, commute, and the must-have stack."
    }

    if score >= 3 {
      return "This one still fits enough of the group brief to keep alive, but it needs a sharper read before it becomes the default favorite."
    }

    return "This listing is still on the board, but it is carrying visible tradeoff pressure against the current brief."
  }

  private func firstCurrencyValue(in line: String) -> Int? {
    let digits = line.filter(\.isNumber)
    guard !digits.isEmpty else { return nil }
    return Int(digits)
  }

  private func commuteMinutes(from line: String) -> Int {
    let parts = line.split(whereSeparator: { !$0.isNumber })
    return parts.compactMap { Int($0) }.first ?? Int.max
  }
}

private struct ConversationView: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    @Bindable var appModel = appModel

    ScrollViewReader { proxy in
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 14) {
          VStack(alignment: .leading, spacing: 8) {
            Text("Shared conversation")
              .font(.system(size: 30, weight: .bold, design: .serif))
              .foregroundStyle(HomeboardPalette.primaryText)

            Text("Everyone speaks in one thread, and the advisor can keep shaping the brief from what the group says.")
              .foregroundStyle(HomeboardPalette.secondaryText)
          }

          if appModel.board.chatMessages.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
              Text("No messages yet")
                .font(.headline)
                .foregroundStyle(HomeboardPalette.primaryText)
              Text("As soon as the group starts talking, the shared conversation will live here.")
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
            .padding(18)
            .homeboardPanel()
          } else {
            ForEach(appModel.board.chatMessages) { message in
              boardMessageBubble(message)
                .id(message.id)
            }
          }

          statusMessageBanner(
            message: appModel.boardError,
            style: .error
          )
        }
        .padding(20)
        .padding(.bottom, 140)
      }
      .scrollBounceBehavior(.always)
      .refreshable {
        await appModel.refreshCurrentBoard()
      }
      .background {
        WorkspaceBackgroundView()
      }
      .safeAreaInset(edge: .bottom) {
        VStack(spacing: 10) {
          HStack(alignment: .bottom, spacing: 10) {
            TextField(
              "Update the group: budget, commute, neighborhoods, shortlist thoughts...",
              text: $appModel.boardMessageDraft,
              axis: .vertical
            )
            .lineLimit(1...5)
            .foregroundStyle(HomeboardPalette.primaryText)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .homeboardInsetSurface(cornerRadius: 16)

            Button {
              Task {
                await appModel.sendBoardMessage()
              }
            } label: {
              Image(systemName: "arrow.up")
                .font(.headline.weight(.bold))
                .foregroundStyle(HomeboardPalette.buttonText)
                .frame(width: 50, height: 50)
                .background(HomeboardPalette.accentGradient)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(appModel.isBoardLoading)
            .opacity(appModel.isBoardLoading ? 0.8 : 1)
          }

          HStack {
            if appModel.isBoardLoading {
              ProgressView()
                .tint(HomeboardPalette.accent)
            }

              Text("Shared updates keep the whole group aligned in one place.")
              .font(.footnote)
              .foregroundStyle(HomeboardPalette.tertiaryText)

            Spacer()
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 18)
        .background(.ultraThinMaterial.opacity(0.45))
      }
      .onChange(of: appModel.board.chatMessages.count) {
        if let last = appModel.board.chatMessages.last {
          withAnimation(.easeOut(duration: 0.25)) {
            proxy.scrollTo(last.id, anchor: .bottom)
          }
        }
      }
      .onAppear {
        if let last = appModel.board.chatMessages.last {
          proxy.scrollTo(last.id, anchor: .bottom)
        }
      }
      .toolbar(.hidden, for: .navigationBar)
    }
  }

  @ViewBuilder
  private func boardMessageBubble(_ message: BoardMessage) -> some View {
    HStack {
      if message.role == "assistant" || message.role == "system" {
        VStack(alignment: .leading, spacing: 8) {
          Text((message.authorName?.isEmpty == false ? message.authorName! : "Advisor").uppercased())
            .font(.caption.weight(.bold))
            .tracking(2)
            .foregroundStyle(HomeboardPalette.accent)

          Text(message.content)
            .font(.body)
            .foregroundStyle(HomeboardPalette.primaryText)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .homeboardPanel(cornerRadius: 24)

        Spacer(minLength: 42)
      } else {
        Spacer(minLength: 42)

        VStack(alignment: .trailing, spacing: 8) {
          Text((message.authorName?.isEmpty == false ? message.authorName! : "Member").uppercased())
            .font(.caption.weight(.bold))
            .tracking(2)
            .foregroundStyle(HomeboardPalette.buttonText.opacity(0.72))

          Text(message.content)
            .font(.body.weight(.medium))
            .foregroundStyle(HomeboardPalette.buttonText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(HomeboardPalette.accentGradient)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
      }
    }
  }
}

private struct BoardHomeView: View {
  @Environment(AppModel.self) private var appModel
  @State private var selectedListing: ListingPreview?
  @State private var selectedMember: MemberPreferenceCard?

  var body: some View {
    let board = appModel.board

    ScrollView(.vertical, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 14) {
        BoardMobileTopBar()
        BoardOverviewCard(board: board)
        BoardCompactNotice(
          message: appModel.boardFeedback ?? appModel.boardError,
          isError: appModel.boardError != nil
        )
        BoardActionStrip()
        BoardNextMoveCard(board: board)
        BoardShortlistPreview(board: board, selectedListing: $selectedListing)
        BoardPeoplePreview(board: board, selectedMember: $selectedMember)
        BoardDecisionsPreview(board: board)
        BoardActivityPreview(board: board)
      }
      .padding(16)
      .padding(.bottom, 120)
    }
    .scrollBounceBehavior(.always)
    .refreshable {
      await appModel.refreshCurrentBoard()
    }
    .background {
      WorkspaceBackgroundView(showsTexture: true)
    }
    .toolbar(.hidden, for: .navigationBar)
    .sheet(item: $selectedListing) { listing in
      ListingDetailSheet(listing: listing)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.backgroundSecondary)
    }
    .sheet(item: $selectedMember) { member in
      MemberDetailSheet(member: member)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.backgroundSecondary)
    }
  }
}

private struct BoardCompactNotice: View {
  @Environment(AppModel.self) private var appModel
  let message: String?
  let isError: Bool

  var body: some View {
    if let message, !message.isEmpty {
      HStack(spacing: 10) {
        Image(systemName: isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
          .foregroundStyle(isError ? HomeboardPalette.danger : HomeboardPalette.success)

        Text(message)
          .font(.caption.weight(.medium))
          .foregroundStyle(HomeboardPalette.primaryText)
          .lineLimit(2)

        Spacer(minLength: 4)

        Button {
          appModel.boardFeedback = nil
          appModel.boardError = nil
        } label: {
          Image(systemName: "xmark")
            .font(.caption.weight(.bold))
            .foregroundStyle(HomeboardPalette.tertiaryText)
            .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Dismiss message")
      }
      .padding(.horizontal, 13)
      .padding(.vertical, 10)
      .homeboardInsetSurface(cornerRadius: 15, accent: isError ? HomeboardPalette.danger : HomeboardPalette.success)
    }
  }
}

private struct BoardMobileTopBar: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    HStack(spacing: 12) {
      HStack(spacing: 9) {
        Image("HomeboardMark")
          .resizable()
          .scaledToFit()
          .frame(width: 30, height: 31)

        VStack(alignment: .leading, spacing: 3) {
          Text("HOMEBOARD")
            .font(.caption2.weight(.bold))
            .tracking(2.6)
            .foregroundStyle(HomeboardPalette.accent)

          Text("Shared rental workspace")
            .font(.footnote.weight(.medium))
            .foregroundStyle(HomeboardPalette.secondaryText)
        }
      }

      Spacer()

      Button {
        Task {
          await appModel.refreshCurrentBoard()
        }
      } label: {
        Group {
          if appModel.isBoardLoading {
            ProgressView()
              .tint(HomeboardPalette.accent)
          } else {
            Image(systemName: "arrow.clockwise")
              .font(.subheadline.weight(.semibold))
          }
        }
        .foregroundStyle(HomeboardPalette.primaryText)
        .frame(width: 42, height: 42)
        .background(Color.white.opacity(0.06))
        .clipShape(Circle())
        .overlay {
          Circle()
            .stroke(HomeboardPalette.border, lineWidth: 1)
        }
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Refresh board")
    }
  }
}

private struct BoardOverviewCard: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard

  private var briefIsReady: Bool {
    board.readiness.lowercased().contains("ready")
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .center, spacing: 10) {
        Text("SHARED BOARD")
          .font(.caption2.weight(.bold))
          .tracking(1.8)
          .foregroundStyle(HomeboardPalette.accent)

        Spacer()

        Label(briefIsReady ? "Brief ready" : "Brief building", systemImage: briefIsReady ? "checkmark.circle.fill" : "circle.dotted")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(briefIsReady ? HomeboardPalette.success : HomeboardPalette.secondaryText)
      }

      VStack(alignment: .leading, spacing: 5) {
        Text(board.title)
          .font(.system(size: 29, weight: .bold, design: .serif))
          .foregroundStyle(HomeboardPalette.primaryText)
          .fixedSize(horizontal: false, vertical: true)

        Text(summaryLine)
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }

      Rectangle()
        .fill(HomeboardPalette.border)
        .frame(height: 1)

      HStack(alignment: .top, spacing: 0) {
        overviewMetric("BUDGET", board.budgetLine.isEmpty ? "Still open" : board.budgetLine)
        metricDivider
        overviewMetric("COMMUTE", board.commuteTargets.first ?? "Still open")
        metricDivider
        overviewMetric("GROUP", board.groupSize.isEmpty ? "Still forming" : board.groupSize)
      }

    }
    .padding(17)
    .homeboardPanel(cornerRadius: 26)
  }

  private var summaryLine: String {
    let city = board.city.isEmpty ? "City open" : board.city
    let moveIn = board.moveInTimeline.isEmpty ? "Move-in open" : board.moveInTimeline
    return "\(city)  ·  \(moveIn)"
  }

  @ViewBuilder
  private func overviewMetric(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(label)
        .font(.system(size: 9, weight: .bold))
        .tracking(1.1)
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text(value)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)
        .lineLimit(2)
        .minimumScaleFactor(0.82)
    }
    .frame(maxWidth: .infinity, alignment: .topLeading)
  }

  private var metricDivider: some View {
    Rectangle()
      .fill(HomeboardPalette.border)
      .frame(width: 1, height: 40)
      .padding(.horizontal, 10)
  }
}

private struct BoardActionStrip: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    HStack(spacing: 9) {
      actionButton("Add home", icon: "plus", tab: .setup)
      actionButton("Invite", icon: "person.badge.plus", tab: .setup)
      actionButton("Update", icon: "bubble.left.and.text.bubble.right", tab: .updates)
    }
  }

  @ViewBuilder
  private func actionButton(_ title: String, icon: String, tab: AppModel.BoardTab) -> some View {
    Button {
      appModel.openBoardTab(tab)
    } label: {
      VStack(spacing: 8) {
        Image(systemName: icon)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.accent)
          .frame(width: 34, height: 34)
          .background(HomeboardPalette.accentStrong.opacity(0.12))
          .clipShape(Circle())

        Text(title)
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 12)
      .homeboardInsetSurface(cornerRadius: 17)
    }
    .buttonStyle(.plain)
  }
}

private struct BoardNextMoveCard: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard

  var body: some View {
    Button {
      appModel.openBoardTab(destination)
    } label: {
      HStack(alignment: .center, spacing: 14) {
        ZStack {
          Circle()
            .fill(HomeboardPalette.accentStrong.opacity(0.16))
          Image(systemName: "arrow.up.right")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.accent)
        }
        .frame(width: 44, height: 44)

        VStack(alignment: .leading, spacing: 4) {
          Text("NEXT MOVE")
            .font(.caption2.weight(.bold))
            .tracking(1.4)
            .foregroundStyle(HomeboardPalette.accent)

          Text(nextMove)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.primaryText)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 4)

        Image(systemName: "chevron.right")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
      .padding(15)
      .frame(maxWidth: .infinity, alignment: .leading)
      .homeboardInsetSurface(cornerRadius: 19, accent: HomeboardPalette.accent)
    }
    .buttonStyle(.plain)
  }

  private var destination: AppModel.BoardTab {
    if !briefIsReady { return .setup }
    if board.members.count <= 1 || board.shortlist.isEmpty { return .setup }
    return board.openQuestions.isEmpty ? .shortlist : .compare
  }

  private var nextMove: String {
    if !briefIsReady { return "Finish the shared brief" }
    if board.members.count <= 1 { return "Invite the rest of the group" }
    if board.shortlist.isEmpty { return "Add the first serious listing" }
    if !board.openQuestions.isEmpty { return "Resolve \(board.openQuestions.count) open decision\(board.openQuestions.count == 1 ? "" : "s")" }
    return "Review the live shortlist together"
  }

  private var briefIsReady: Bool {
    board.readiness.lowercased().contains("ready")
  }
}

private struct BoardShortlistPreview: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard
  @Binding var selectedListing: ListingPreview?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      sectionHeader

      if board.shortlist.isEmpty {
        Button {
          appModel.openBoardTab(.setup)
        } label: {
          HStack(spacing: 13) {
            Image(systemName: "building.2.crop.circle")
              .font(.title2)
              .foregroundStyle(HomeboardPalette.accent)

            VStack(alignment: .leading, spacing: 3) {
              Text("No homes saved yet")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HomeboardPalette.primaryText)
              Text("Add the first contender for the group.")
                .font(.footnote)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }

            Spacer()
            Image(systemName: "plus.circle.fill")
              .foregroundStyle(HomeboardPalette.accent)
          }
          .padding(14)
          .homeboardInsetSurface(cornerRadius: 17)
        }
        .buttonStyle(.plain)
      } else {
        ForEach(board.shortlist.prefix(2)) { listing in
          Button {
            selectedListing = listing
          } label: {
            HStack(alignment: .top, spacing: 12) {
              VStack(alignment: .leading, spacing: 4) {
                Text(listing.title)
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .lineLimit(2)
                Text("\(listing.location) · \(listing.priceLine)")
                  .font(.footnote)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .lineLimit(2)
              }
              Spacer()
              Text(listing.status.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(HomeboardPalette.accent)
            }
            .padding(14)
            .homeboardInsetSurface(cornerRadius: 17)
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(16)
    .homeboardPanel(cornerRadius: 24)
  }

  private var sectionHeader: some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text("Shortlist")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Text(board.shortlist.isEmpty ? "Waiting for the first listing" : savedListingLabel)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
      Spacer()
      Button("View all") {
        appModel.openBoardTab(.shortlist)
      }
      .font(.caption.weight(.semibold))
      .foregroundStyle(HomeboardPalette.accent)
      .buttonStyle(.plain)
    }
  }

  private var savedListingLabel: String {
    let count = board.shortlist.count
    return "\(count) saved listing\(count == 1 ? "" : "s")"
  }
}

private struct BoardPeoplePreview: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard
  @Binding var selectedMember: MemberPreferenceCard?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text("People")
            .font(.headline)
            .foregroundStyle(HomeboardPalette.primaryText)
          Text("\(board.members.count) member\(board.members.count == 1 ? "" : "s") on this board")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.tertiaryText)
        }
        Spacer()
        Button("Manage") {
          appModel.openBoardTab(.members)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.accent)
        .buttonStyle(.plain)
      }

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 10) {
          ForEach(board.members.prefix(4)) { member in
            Button {
              selectedMember = member
            } label: {
              VStack(alignment: .leading, spacing: 8) {
                Text(memberInitial(member))
                  .font(.subheadline.weight(.bold))
                  .foregroundStyle(HomeboardPalette.buttonText)
                  .frame(width: 38, height: 38)
                  .background(HomeboardPalette.accentStrong)
                  .clipShape(Circle())

                Text(member.name)
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .lineLimit(1)
                Text(member.budgetLine)
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .lineLimit(2)
              }
              .frame(width: 138, alignment: .leading)
              .frame(minHeight: 126, alignment: .topLeading)
              .padding(13)
              .homeboardInsetSurface(cornerRadius: 17)
            }
            .buttonStyle(.plain)
          }

          Button {
            appModel.openBoardTab(.setup)
          } label: {
            VStack(spacing: 8) {
              Image(systemName: "person.badge.plus")
                .font(.title3)
                .foregroundStyle(HomeboardPalette.accent)
              Text("Invite")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.primaryText)
            }
            .frame(width: 96)
            .frame(minHeight: 126)
            .padding(13)
            .homeboardInsetSurface(cornerRadius: 17, accent: HomeboardPalette.accent)
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(16)
    .homeboardPanel(cornerRadius: 24)
  }

  private func memberInitial(_ member: MemberPreferenceCard) -> String {
    String(member.name.prefix(1)).uppercased()
  }
}

private struct BoardDecisionsPreview: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard

  var body: some View {
    VStack(alignment: .leading, spacing: 11) {
      HStack {
        Text("Open decisions")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Spacer()
        Text("\(board.openQuestions.count)")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
      }

      if board.openQuestions.isEmpty {
        Label("Nothing blocking the group right now", systemImage: "checkmark.circle.fill")
          .font(.footnote.weight(.medium))
          .foregroundStyle(HomeboardPalette.success)
      } else {
        ForEach(board.openQuestions.prefix(2), id: \.self) { question in
          Button {
            appModel.openBoardTab(.compare)
          } label: {
            HStack(alignment: .top, spacing: 10) {
              Circle()
                .fill(HomeboardPalette.accent)
                .frame(width: 6, height: 6)
                .padding(.top, 5)
              Text(question)
                .font(.footnote)
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
              Spacer(minLength: 4)
              Image(systemName: "chevron.right")
                .font(.caption2.weight(.bold))
                .foregroundStyle(HomeboardPalette.tertiaryText)
            }
            .padding(12)
            .homeboardInsetSurface(cornerRadius: 15)
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(16)
    .homeboardPanel(cornerRadius: 24)
  }
}

private struct BoardActivityPreview: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard

  var body: some View {
    VStack(alignment: .leading, spacing: 11) {
      HStack {
        Text("Recent activity")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Spacer()
        Button("Updates") {
          appModel.openBoardTab(.updates)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.accent)
        .buttonStyle(.plain)
      }

      if board.recentActivity.isEmpty {
        Text("Board changes and roommate updates will appear here.")
          .font(.footnote)
          .foregroundStyle(HomeboardPalette.secondaryText)
      } else {
        ForEach(Array(board.recentActivity.prefix(2).enumerated()), id: \.offset) { index, activity in
          HStack(alignment: .top, spacing: 10) {
            Circle()
              .fill(index == 0 ? HomeboardPalette.accent : HomeboardPalette.tertiaryText)
              .frame(width: 7, height: 7)
              .padding(.top, 5)
            Text(activity)
              .font(.footnote)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
    }
    .padding(16)
    .homeboardPanel(cornerRadius: 24)
  }
}

private struct MembersView: View {
  @Environment(AppModel.self) private var appModel
  @State private var selectedMember: MemberPreferenceCard?
  @State private var memberNameDraft = ""
  @State private var memberBudgetDraft = ""
  @State private var memberCommuteDraft = ""
  @State private var memberPrioritiesDraft = ""
  @State private var memberDealbreakersDraft = ""
  @State private var memberNeighborhoodsDraft = ""
  @State private var memberStatusDraft = ""

  var body: some View {
    ScrollView(.vertical, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 14) {
        VStack(alignment: .leading, spacing: 8) {
          Text("Member preferences")
            .font(.system(size: 27, weight: .bold, design: .serif))
            .foregroundStyle(HomeboardPalette.primaryText)

          Text("Make roommate differences explicit so tradeoffs stay honest.")
            .foregroundStyle(HomeboardPalette.secondaryText)
        }

        MembersAlignmentCard(members: appModel.board.members)

        if appModel.board.members.count <= 1 {
          MembersStarterCard()
        }

        VStack(alignment: .leading, spacing: 14) {
          sectionHeader("Add member", "Capture another person’s real budget, commute, and red lines.")

          memberEditorField("Name", binding: $memberNameDraft, prompt: "Maya")

          HStack(spacing: 12) {
            memberEditorField("Budget", binding: $memberBudgetDraft, prompt: "$1,500–$1,800")
            memberEditorField("Commute", binding: $memberCommuteDraft, prompt: "Midtown, 40 min")
          }

          memberEditorField("Priorities", binding: $memberPrioritiesDraft, prompt: "commute, neighborhood")
          memberEditorField("Dealbreakers", binding: $memberDealbreakersDraft, prompt: "broker fee, bad train access")
          memberEditorField("Neighborhoods", binding: $memberNeighborhoodsDraft, prompt: "Williamsburg, Fort Greene")
          memberEditorField("Status", binding: $memberStatusDraft, prompt: "profile complete")

          Button {
            appModel.addManualMember(
              name: memberNameDraft,
              budgetLine: memberBudgetDraft,
              commuteLine: memberCommuteDraft,
              priorities: parseCSV(memberPrioritiesDraft),
              dealbreakers: parseCSV(memberDealbreakersDraft),
              neighborhoods: parseCSV(memberNeighborhoodsDraft),
              status: memberStatusDraft
            )
            memberNameDraft = ""
            memberBudgetDraft = ""
            memberCommuteDraft = ""
            memberPrioritiesDraft = ""
            memberDealbreakersDraft = ""
            memberNeighborhoodsDraft = ""
            memberStatusDraft = ""
          } label: {
            HStack {
              Text("Add member")
              Spacer()
              Image(systemName: "person.badge.plus")
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(Color.white.opacity(0.06))
            .foregroundStyle(HomeboardPalette.primaryText)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(.plain)
        }
        .padding(16)
        .homeboardPanel()

        ForEach(appModel.board.members) { member in
          VStack(spacing: 10) {
            Button {
              selectedMember = member
            } label: {
              MemberCard(member: member)
            }
            .buttonStyle(.plain)

            if appModel.board.members.count > 1 {
              Button {
                appModel.removeManualMember(id: member.id)
              } label: {
                HStack {
                  Text("Remove \(member.name)")
                  Spacer()
                  Image(systemName: "trash")
                }
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color.white.opacity(0.05))
                .foregroundStyle(HomeboardPalette.secondaryText)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
              }
              .buttonStyle(.plain)
            }
          }
        }
      }
      .padding(16)
      .padding(.bottom, 44)
    }
    .scrollBounceBehavior(.always)
    .refreshable {
      await appModel.refreshCurrentBoard()
    }
    .background {
      WorkspaceBackgroundView()
    }
    .toolbar(.hidden, for: .navigationBar)
    .sheet(item: $selectedMember) { member in
      MemberDetailSheet(member: member)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.backgroundSecondary)
    }
  }

  @ViewBuilder
  private func memberEditorField(_ title: String, binding: Binding<String>, prompt: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      TextField("", text: binding, prompt: Text(prompt).foregroundStyle(HomeboardPalette.tertiaryText))
        .foregroundStyle(HomeboardPalette.primaryText)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .homeboardInsetSurface()
    }
  }

  private func parseCSV(_ raw: String) -> [String] {
    raw
      .split(separator: ",")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }
}

private struct BoardSettingsView: View {
  @Environment(AppModel.self) private var appModel
  @State private var copiedInvite = false
  @State private var joinBoardCodeDraft = ""
  @State private var newBoardTitleDraft = ""
  @State private var boardTitleDraft = ""
  @State private var neighborhoodDraft = ""
  @State private var mustHaveDraft = ""
  @State private var dealbreakerDraft = ""
  @State private var listingTitleDraft = ""
  @State private var listingLocationDraft = ""
  @State private var listingPriceDraft = ""
  @State private var listingCommuteDraft = ""
  @State private var listingSummaryDraft = ""
  @State private var listingFitDraft = ""
  @State private var listingSourceURLDraft = ""
  @State private var listingGroupNoteDraft = ""
  @State private var questionDraft = ""
  @State private var questionResolutionDrafts: [String: String] = [:]
  @State private var boardUpdateDraft = ""

  var body: some View {
    @Bindable var appModel = appModel
    let board = appModel.board
    let inviteLink = HomeboardConfig.publicWebBaseURL.appending(path: "invite/\(board.inviteCode)")

    ScrollView(.vertical, showsIndicators: false) {
      VStack(alignment: .leading, spacing: 14) {
        VStack(alignment: .leading, spacing: 8) {
          Text("Board setup")
            .font(.system(size: 27, weight: .bold, design: .serif))
            .foregroundStyle(HomeboardPalette.primaryText)

          Text("Invite state, board readiness, and the shared search frame.")
            .foregroundStyle(HomeboardPalette.secondaryText)
        }

        SetupStatusStrip(board: board)

        statusMessageBanner(
          message: appModel.inviteFeedback ?? appModel.boardFeedback ?? appModel.boardError,
          style: appModel.boardError == nil ? .success : .error
        )

        VStack(alignment: .leading, spacing: 14) {
          sectionHeader("Invite", "Share one link instead of losing the thread in texts.")

          VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
              VStack(alignment: .leading, spacing: 4) {
                Text("Invite link")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.tertiaryText)

                Text(board.inviteCode.isEmpty ? "No active link" : "Secure link ready")
                  .font(.title3.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.primaryText)
              }

              Spacer()

              if board.inviteCode.isEmpty {
                Button {
                  Task { await appModel.createInvite() }
                } label: {
                  Label("Create link", systemImage: "link.badge.plus")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(Color.white.opacity(0.08))
                    .foregroundStyle(HomeboardPalette.primaryText)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
              } else {
                ShareLink(
                  item: inviteLink,
                  message: Text("Join our shared rental board on Homeboard.")
                ) {
                  Label("Share link", systemImage: "square.and.arrow.up")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(Color.white.opacity(0.08))
                    .foregroundStyle(HomeboardPalette.primaryText)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .homeboardInsetSurface(accent: HomeboardPalette.accentStrong)

            if !board.inviteCode.isEmpty {
              Button {
                Task {
                  await appModel.createInvite()
                }
              } label: {
                HStack(spacing: 10) {
                  if appModel.isBoardLoading {
                    ProgressView()
                      .tint(HomeboardPalette.buttonText)
                  } else {
                    Image(systemName: "arrow.triangle.2.circlepath")
                      .font(.headline.weight(.bold))
                  }

                  Text(appModel.isBoardLoading ? "Replacing link" : "Replace active invite link")
                    .font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(HomeboardPalette.buttonText)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(HomeboardPalette.accentGradient)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
              }
              .buttonStyle(.plain)
            }
          }

          Button {
            UIPasteboard.general.string = inviteLink.absoluteString
            copiedInvite = true
          } label: {
            HStack {
              Text(copiedInvite ? "Copied invite link" : "Copy invite link")
              Spacer()
              Image(systemName: copiedInvite ? "checkmark.circle.fill" : "doc.on.doc")
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(Color.white.opacity(0.06))
            .foregroundStyle(HomeboardPalette.primaryText)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(.plain)

          if let invite = board.invitations.first(where: { $0.status == "pending" }) {
            VStack(alignment: .leading, spacing: 6) {
              Text("Latest pending invite")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.tertiaryText)

              Text("Single-use board link")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HomeboardPalette.primaryText)

              Text(invite.expiresAt.map { "Expires \($0.prefix(10))" } ?? "Pending")
                .font(.footnote)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .homeboardInsetSurface()
          }

          if !board.invitations.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
              Text("Recent invites")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.tertiaryText)

              ForEach(board.invitations.prefix(4)) { invite in
                HStack(alignment: .center, spacing: 10) {
                  VStack(alignment: .leading, spacing: 4) {
                    Text("Board invitation link")
                      .font(.footnote.weight(.semibold))
                      .foregroundStyle(HomeboardPalette.primaryText)

                    Text(invite.status.capitalized)
                      .font(.caption)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                  }

                  Spacer()

                  Text(invite.inviteCode)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(HomeboardPalette.accent)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .homeboardInsetSurface()
              }
            }
          }

        }
        .padding(16)
        .homeboardPanel()

        VStack(alignment: .leading, spacing: 14) {
          sectionHeader("Board identity", "Rename the workspace and join other boards without backing out.")

          settingsField("Board title", binding: $boardTitleDraft, prompt: "Williamsburg fall search")

          Button {
            appModel.renameCurrentBoard(boardTitleDraft)
          } label: {
            HStack {
              Text("Save board title")
              Spacer()
              Image(systemName: "pencil.and.outline")
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(Color.white.opacity(0.06))
            .foregroundStyle(HomeboardPalette.primaryText)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(.plain)

          Divider()
            .overlay(HomeboardPalette.cardStroke.opacity(0.35))

          settingsField("Join another board", binding: $joinBoardCodeDraft, prompt: "Paste invite link or token")

          Button {
            let code = joinBoardCodeDraft
            joinBoardCodeDraft = ""
            Task {
              await appModel.joinBoardFromWorkspace(code: code)
            }
          } label: {
            HStack {
              Text("Join from invite link")
              Spacer()
              if appModel.isBoardLoading {
                ProgressView()
                  .tint(HomeboardPalette.primaryText)
              } else {
                Image(systemName: "person.crop.circle.badge.plus")
              }
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(Color.white.opacity(0.06))
            .foregroundStyle(HomeboardPalette.primaryText)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(.plain)
        }
        .padding(16)
        .homeboardPanel()

        if !appModel.availableBoards.isEmpty {
          VStack(alignment: .leading, spacing: 14) {
            sectionHeader("Boards", "Jump between the workspaces tied to this account.")

            HStack(spacing: 10) {
              settingsField("New board title", binding: $newBoardTitleDraft, prompt: "Brooklyn fall search")

              Button {
                appModel.createLocalBoard(title: newBoardTitleDraft)
                newBoardTitleDraft = ""
              } label: {
                VStack(spacing: 6) {
                  Image(systemName: "plus.square.on.square")
                    .font(.headline.weight(.bold))
                  Text("New")
                    .font(.caption.weight(.semibold))
                }
                .foregroundStyle(HomeboardPalette.buttonText)
                .frame(width: 84, height: 84)
                .background(HomeboardPalette.accentGradient)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
              }
              .buttonStyle(.plain)
            }

            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 12) {
                ForEach(appModel.availableBoards) { summary in
                  Button {
                    Task {
                      await appModel.openBoard(id: summary.id)
                    }
                  } label: {
                    VStack(alignment: .leading, spacing: 8) {
                      Text(summary.title)
                        .font(.headline)
                        .foregroundStyle(HomeboardPalette.primaryText)
                        .lineLimit(2)

                      Text(summary.city.isEmpty ? "City still open" : summary.city)
                        .font(.subheadline)
                        .foregroundStyle(HomeboardPalette.secondaryText)
                        .lineLimit(2)

                      Spacer()

                      HStack {
                        Text(appModel.board.id == summary.id ? "Open now" : "Switch board")
                          .font(.caption.weight(.bold))
                          .foregroundStyle(appModel.board.id == summary.id ? HomeboardPalette.accent : HomeboardPalette.primaryText)
                        Spacer()
                        Image(systemName: "arrow.up.right")
                          .font(.caption.weight(.bold))
                          .foregroundStyle(HomeboardPalette.tertiaryText)
                      }
                    }
                    .frame(width: 200, height: 140, alignment: .topLeading)
                    .padding(14)
                    .homeboardInsetSurface(accent: appModel.board.id == summary.id ? HomeboardPalette.accentStrong : nil)
                  }
                  .buttonStyle(.plain)
                  .disabled(appModel.isBoardLoading)
                }
              }
            }
          }
          .padding(16)
          .homeboardCard()
        }

        VStack(alignment: .leading, spacing: 14) {
          sectionHeader("Edit brief", "Keep the shared board current as the search tightens.")

          briefSummaryRow(profile: appModel.profile)

          settingsField("City", binding: $appModel.profile.city, prompt: "New York City")
          settingsField("Move-in", binding: $appModel.profile.moveInDate, prompt: "August")

          HStack(spacing: 12) {
            settingsField("Budget min", binding: $appModel.profile.budgetMin, prompt: "1400", keyboard: .numberPad)
            settingsField("Budget max", binding: $appModel.profile.budgetMax, prompt: "1750", keyboard: .numberPad)
          }

          settingsField("Commute target", binding: $appModel.profile.commuteTarget, prompt: "Midtown")

          HomeboardCommuteRangeControl(
            minimumMinutes: Binding(
              get: { Int(appModel.profile.minCommuteMinutes) ?? 5 },
              set: { appModel.profile.minCommuteMinutes = String($0) }
            ),
            maximumMinutes: Binding(
              get: { Int(appModel.profile.maxCommuteMinutes) ?? 45 },
              set: { appModel.profile.maxCommuteMinutes = String($0) }
            )
          )

          tokenEditor(
            title: "Neighborhoods",
            tokens: appModel.profile.neighborhoods,
            draft: $neighborhoodDraft,
            placeholder: "Fort Greene"
          ) { value in
            appModel.profile.neighborhoods.append(value)
          } onRemove: { value in
            appModel.profile.neighborhoods.removeAll { $0 == value }
          }

          tokenEditor(
            title: "Must-haves",
            tokens: appModel.profile.mustHaves,
            draft: $mustHaveDraft,
            placeholder: "laundry"
          ) { value in
            appModel.profile.mustHaves.append(value)
          } onRemove: { value in
            appModel.profile.mustHaves.removeAll { $0 == value }
          }

          tokenEditor(
            title: "Dealbreakers",
            tokens: appModel.profile.dealbreakers,
            draft: $dealbreakerDraft,
            placeholder: "broker fee"
          ) { value in
            appModel.profile.dealbreakers.append(value)
          } onRemove: { value in
            appModel.profile.dealbreakers.removeAll { $0 == value }
          }

          Button {
            Task {
              await appModel.saveBoardBrief()
            }
          } label: {
            ZStack {
              RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(HomeboardPalette.accentGradient)

              if appModel.isBoardLoading {
                ProgressView()
                  .tint(HomeboardPalette.buttonText)
              } else {
                Text("Save board brief")
                  .font(.headline.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.buttonText)
              }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
          }
          .buttonStyle(.plain)

        }
        .padding(16)
        .homeboardPanel()

        VStack(alignment: .leading, spacing: 14) {
          sectionHeader("Contributions", "Add real board material without relying on any AI flow.")

          HStack(spacing: 10) {
            setupShortcutButton(
              title: "Open shortlist",
              subtitle: "See live contenders",
              systemName: "building.2.crop.circle.fill"
            ) {
              appModel.openBoardTab(.shortlist)
            }

            setupShortcutButton(
              title: "Open compare",
              subtitle: "Pressure-test tradeoffs",
              systemName: "arrow.left.arrow.right.circle.fill"
            ) {
              appModel.openBoardTab(.compare)
            }
          }

          VStack(alignment: .leading, spacing: 10) {
            Text("Add shortlist listing")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.primaryText)

            settingsField("Listing title", binding: $listingTitleDraft, prompt: "219 Kent Ave · 3B")
            settingsField("Location", binding: $listingLocationDraft, prompt: "Williamsburg")

            HStack(spacing: 12) {
              settingsField("Price line", binding: $listingPriceDraft, prompt: "$1,750 / person")
              settingsField("Commute line", binding: $listingCommuteDraft, prompt: "38 min to Midtown")
            }

            settingsField("Fit label", binding: $listingFitDraft, prompt: "Strong practical option")
            settingsField("Source URL", binding: $listingSourceURLDraft, prompt: "https://...")

            VStack(alignment: .leading, spacing: 8) {
              Text("Why it is still alive")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.tertiaryText)

              TextField("", text: $listingSummaryDraft, prompt: Text("Good light, strong train access, maybe tight on space.").foregroundStyle(HomeboardPalette.tertiaryText), axis: .vertical)
                .lineLimit(2...5)
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .homeboardInsetSurface()
            }

            VStack(alignment: .leading, spacing: 8) {
              Text("Group note")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.tertiaryText)

              TextField("", text: $listingGroupNoteDraft, prompt: Text("Maya likes the neighborhood, Sam is worried about the layout.").foregroundStyle(HomeboardPalette.tertiaryText), axis: .vertical)
                .lineLimit(2...5)
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .homeboardInsetSurface()
            }

            Button {
              appModel.addManualListing(
                title: listingTitleDraft,
                location: listingLocationDraft,
                priceLine: listingPriceDraft,
                commuteLine: listingCommuteDraft,
                summary: listingSummaryDraft,
                fitLabel: listingFitDraft,
                sourceURL: listingSourceURLDraft,
                groupNote: listingGroupNoteDraft
              )
              listingTitleDraft = ""
              listingLocationDraft = ""
              listingPriceDraft = ""
              listingCommuteDraft = ""
              listingSummaryDraft = ""
              listingFitDraft = ""
              listingSourceURLDraft = ""
              listingGroupNoteDraft = ""
            } label: {
              HStack {
                Text("Add to shortlist")
                Spacer()
                Image(systemName: "plus.circle.fill")
              }
              .font(.subheadline.weight(.semibold))
              .padding(.horizontal, 14)
              .padding(.vertical, 13)
              .background(Color.white.opacity(0.06))
              .foregroundStyle(HomeboardPalette.primaryText)
              .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)

            if !appModel.board.shortlist.isEmpty {
              VStack(alignment: .leading, spacing: 8) {
                Text("Current shortlist")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.tertiaryText)

                ForEach(appModel.board.shortlist) { listing in
                  VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 10) {
                      VStack(alignment: .leading, spacing: 4) {
                        Text(listing.title)
                          .font(.footnote.weight(.semibold))
                          .foregroundStyle(HomeboardPalette.primaryText)
                        Text("\(listing.location) · \(listing.priceLine)")
                          .font(.caption)
                          .foregroundStyle(HomeboardPalette.secondaryText)
                      }

                      Spacer()

                      VStack(alignment: .trailing, spacing: 8) {
                        Menu {
                          ForEach(["saved", "touring", "applied", "passed"], id: \.self) { status in
                            Button(status.capitalized) {
                              appModel.updateManualListingStatus(id: listing.id, status: status)
                            }
                          }
                        } label: {
                          HStack(spacing: 6) {
                            Text(listing.status.capitalized)
                            Image(systemName: "chevron.down")
                              .font(.caption2.weight(.bold))
                          }
                          .font(.caption.weight(.semibold))
                          .foregroundStyle(HomeboardPalette.primaryText)
                          .padding(.horizontal, 10)
                          .padding(.vertical, 8)
                          .background(Color.white.opacity(0.06))
                          .clipShape(Capsule())
                        }

                        Button {
                          appModel.openBoardTab(.shortlist)
                        } label: {
                          Text("Open")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(HomeboardPalette.tertiaryText)
                        }
                        .buttonStyle(.plain)
                      }

                      Button {
                        appModel.removeManualListing(id: listing.id)
                      } label: {
                        Image(systemName: "trash")
                          .foregroundStyle(HomeboardPalette.tertiaryText)
                          .padding(8)
                      }
                      .buttonStyle(.plain)
                    }

                    if !listing.groupNote.isEmpty {
                      Text(listing.groupNote)
                        .font(.caption)
                        .foregroundStyle(HomeboardPalette.tertiaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    }

                    if !listing.openRisks.isEmpty {
                      Text("Watch: \(listing.openRisks.prefix(2).joined(separator: ", "))")
                        .font(.caption)
                        .foregroundStyle(HomeboardPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                  }
                  .padding(12)
                  .homeboardInsetSurface()
                }
              }
            }
          }

          VStack(alignment: .leading, spacing: 10) {
            Text("Add open decision")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.primaryText)

            HStack(spacing: 10) {
              TextField("", text: $questionDraft, prompt: Text("Should we stretch budget for a better commute?").foregroundStyle(HomeboardPalette.tertiaryText))
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .homeboardInsetSurface()

              Button {
                appModel.addOpenQuestion(questionDraft)
                questionDraft = ""
              } label: {
                Image(systemName: "plus")
                  .font(.headline.weight(.bold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .frame(width: 48, height: 48)
                  .background(HomeboardPalette.surfaceMuted)
                  .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
              }
              .buttonStyle(.plain)
            }

            if !appModel.board.openQuestions.isEmpty {
              ForEach(appModel.board.openQuestions, id: \.self) { question in
                VStack(alignment: .leading, spacing: 10) {
                  HStack(alignment: .top, spacing: 10) {
                    Text(question)
                      .font(.footnote)
                      .foregroundStyle(HomeboardPalette.primaryText)
                      .fixedSize(horizontal: false, vertical: true)

                    Spacer()

                    Button {
                      appModel.removeOpenQuestion(question)
                    } label: {
                      Image(systemName: "xmark")
                        .foregroundStyle(HomeboardPalette.tertiaryText)
                        .padding(8)
                    }
                    .buttonStyle(.plain)
                  }

                  HStack(spacing: 10) {
                    TextField("", text: Binding(
                      get: { questionResolutionDrafts[question, default: ""] },
                      set: { questionResolutionDrafts[question] = $0 }
                    ), prompt: Text("Add the decision outcome").foregroundStyle(HomeboardPalette.tertiaryText))
                      .foregroundStyle(HomeboardPalette.primaryText)
                      .padding(.horizontal, 14)
                      .padding(.vertical, 12)
                      .homeboardInsetSurface()

                    Button {
                      appModel.resolveOpenQuestion(question, resolution: questionResolutionDrafts[question, default: ""])
                      questionResolutionDrafts[question] = ""
                    } label: {
                      Text("Resolve")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(HomeboardPalette.primaryText)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 11)
                        .background(Color.white.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                  }
                }
                .padding(12)
                .homeboardInsetSurface()
              }
            }
          }

          VStack(alignment: .leading, spacing: 10) {
            Text("Add board update")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.primaryText)

            HStack(spacing: 10) {
              TextField("", text: $boardUpdateDraft, prompt: Text("Sam toured a place in Williamsburg and wants a second opinion.").foregroundStyle(HomeboardPalette.tertiaryText))
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .homeboardInsetSurface()

              Button {
                let message = boardUpdateDraft
                boardUpdateDraft = ""
                Task {
                  let posted = await appModel.addBoardUpdate(message)
                  if !posted {
                    boardUpdateDraft = message
                  }
                }
              } label: {
                Image(systemName: "plus")
                  .font(.headline.weight(.bold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .frame(width: 48, height: 48)
                  .background(HomeboardPalette.surfaceMuted)
                  .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
              }
              .buttonStyle(.plain)
            }
          }
        }
        .padding(16)
        .homeboardPanel()

        VStack(alignment: .leading, spacing: 14) {
          sectionHeader("Readiness", "How prepared the board is for real listing decisions.")
          infoBlock("Status", board.readiness)
          infoBlock("Progress", board.completionLine)
          infoBlock("Focus", board.nextBestAction)
        }
        .padding(16)
        .homeboardPanel()

        VStack(alignment: .leading, spacing: 14) {
          sectionHeader("Board frame", "The shared constraints this group is anchoring around.")
          infoBlock("City", board.city)
          infoBlock("Move-in", board.moveInTimeline)
          infoBlock("Budget", board.budgetLine)
          infoBlock("Commute targets", board.commuteTargets.joined(separator: ", "))
        }
        .padding(16)
        .homeboardPanel()

        Button {
          appModel.signOut()
        } label: {
          Text("Sign out")
            .font(.headline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(HomeboardPalette.surfaceMuted)
            .foregroundStyle(HomeboardPalette.primaryText)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: Color.black.opacity(0.24), radius: 12, x: 0, y: 8)
        }
        .buttonStyle(.plain)
      }
      .padding(16)
      .padding(.bottom, 44)
    }
    .scrollBounceBehavior(.always)
    .refreshable {
      await appModel.refreshCurrentBoard()
    }
    .background {
      WorkspaceBackgroundView()
    }
      .toolbar(.hidden, for: .navigationBar)
      .onAppear {
        if boardTitleDraft.isEmpty {
          boardTitleDraft = board.title
        }
      }
      .onChange(of: board.title) {
        boardTitleDraft = board.title
      }
  }

  @ViewBuilder
  private func briefSummaryRow(profile: RentalProfile) -> some View {
    HStack(spacing: 10) {
      setupMetric(
        title: "Budget",
        value: budgetSummary(profile)
      )
      setupMetric(
        title: "Commute",
        value: commuteSummary(profile)
      )
      setupMetric(
        title: "Missing",
        value: "\(profile.missingFields.count)"
      )
    }
  }

  @ViewBuilder
  private func settingsField(
    _ title: String,
    binding: Binding<String>,
    prompt: String,
    keyboard: UIKeyboardType = .default
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      TextField("", text: binding, prompt: Text(prompt).foregroundStyle(HomeboardPalette.tertiaryText))
        .keyboardType(keyboard)
        .foregroundStyle(HomeboardPalette.primaryText)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .homeboardInsetSurface()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func tokenEditor(
    title: String,
    tokens: [String],
    draft: Binding<String>,
    placeholder: String,
    onAdd: @escaping (String) -> Void,
    onRemove: @escaping (String) -> Void
  ) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      if !tokens.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(tokens, id: \.self) { token in
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
                .background(HomeboardPalette.surfaceMuted)
                .foregroundStyle(HomeboardPalette.primaryText)
                .clipShape(Capsule())
              }
              .buttonStyle(.plain)
            }
          }
        }
      }

      HStack(spacing: 10) {
        TextField("", text: draft, prompt: Text(placeholder).foregroundStyle(HomeboardPalette.tertiaryText))
          .foregroundStyle(HomeboardPalette.primaryText)
          .padding(.horizontal, 16)
          .padding(.vertical, 14)
          .homeboardInsetSurface()

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
            .background(HomeboardPalette.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
      }
    }
  }

  private func budgetSummary(_ profile: RentalProfile) -> String {
    let min = profile.budgetMin.trimmingCharacters(in: .whitespacesAndNewlines)
    let max = profile.budgetMax.trimmingCharacters(in: .whitespacesAndNewlines)
    if min.isEmpty && max.isEmpty { return "Open" }
    if !min.isEmpty && !max.isEmpty { return "$\(min)-$\(max)" }
    if !max.isEmpty { return "Up to $\(max)" }
    return "From $\(min)"
  }

  private func commuteSummary(_ profile: RentalProfile) -> String {
    let target = profile.commuteTarget.trimmingCharacters(in: .whitespacesAndNewlines)
    if target.isEmpty { return "Open" }
    return target
  }

  @ViewBuilder
  private func setupMetric(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title.uppercased())
        .font(.caption2.weight(.bold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text(value)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)
        .lineLimit(2)
        .minimumScaleFactor(0.9)
    }
    .frame(maxWidth: .infinity, minHeight: 74, alignment: .topLeading)
    .padding(14)
    .homeboardInsetSurface(accent: HomeboardPalette.accentStrong)
  }

  @ViewBuilder
  private func setupShortcutButton(
    title: String,
    subtitle: String,
    systemName: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 8) {
        Image(systemName: systemName)
          .font(.headline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.accent)

        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)

        Text(subtitle)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
      .padding(14)
      .homeboardInsetSurface()
    }
    .buttonStyle(.plain)
  }
}

private struct SetupStatusStrip: View {
  let board: MobileBoard

  var body: some View {
    HStack(spacing: 10) {
      stripPill("Readiness", value: board.readiness)
      stripPill("Invites", value: board.invitations.isEmpty ? "0 pending" : "\(board.invitations.count) total")
      stripPill("Focus", value: board.openQuestions.isEmpty ? "Comparison" : "Needs decisions")
    }
  }

  @ViewBuilder
  private func stripPill(_ title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title.uppercased())
        .font(.caption2.weight(.bold))
        .foregroundStyle(HomeboardPalette.tertiaryText)
      Text(value)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)
        .lineLimit(2)
    }
    .frame(maxWidth: .infinity, minHeight: 68, alignment: .topLeading)
    .padding(12)
    .homeboardInsetSurface()
  }
}

private struct BoardHeroCard: View {
  let board: MobileBoard

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("CURRENT BOARD")
        .font(.caption.weight(.bold))
        .tracking(2.5)
        .foregroundStyle(HomeboardPalette.accent)

      VStack(alignment: .leading, spacing: 6) {
        Text(board.title)
          .font(.system(size: 26, weight: .bold, design: .serif))
          .foregroundStyle(HomeboardPalette.primaryText)

        Text(heroLine)
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }

      HStack(spacing: 8) {
        compactHeroPill("Board brief")
        compactHeroPill(board.shortlist.isEmpty ? "No shortlist yet" : "\(board.shortlist.count) contenders")
        compactHeroPill(board.openQuestions.isEmpty ? "No live blockers" : "\(board.openQuestions.count) open decisions")
      }
      .fixedSize(horizontal: false, vertical: true)

      VStack(alignment: .leading, spacing: 6) {
        if !board.completionLine.isEmpty {
          Label(board.completionLine, systemImage: "sparkles")
            .font(.footnote.weight(.medium))
            .foregroundStyle(HomeboardPalette.accent)
            .fixedSize(horizontal: false, vertical: true)
        }

        if !board.openQuestions.isEmpty {
          Text("Still unresolved: \(board.openQuestions.prefix(2).joined(separator: " • "))")
            .font(.subheadline)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      if let id = board.id, !id.isEmpty {
        Text("Workspace ID: \(id)")
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
    }
    .padding(16)
    .homeboardPanel()
  }

  @ViewBuilder
  private func compactHeroPill(_ text: String) -> some View {
    Text(text)
      .font(.caption.weight(.semibold))
      .foregroundStyle(HomeboardPalette.primaryText)
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .background(Color.white.opacity(0.05))
      .clipShape(Capsule())
  }

  private var heroLine: String {
    let city = board.city.isEmpty ? "City open" : board.city
    let moveIn = board.moveInTimeline.isEmpty ? "Timing open" : board.moveInTimeline
    let group = board.groupSize.isEmpty ? "Group still forming" : board.groupSize
    return "\(city) · \(moveIn) · \(group)"
  }
}

private struct BoardSnapshotRow: View {
  let board: MobileBoard

  var body: some View {
    HStack(spacing: 8) {
      snapshotTile(
        title: "Budget",
        value: board.budgetLine.isEmpty ? "Still open" : board.budgetLine
      )
      snapshotTile(
        title: "Commute",
        value: board.commuteTargets.first ?? "Not set"
      )
      snapshotTile(
        title: "Shortlist",
        value: board.shortlist.isEmpty ? "0 live" : "\(board.shortlist.count) live"
      )
    }
  }

  @ViewBuilder
  private func snapshotTile(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(title.uppercased())
        .font(.caption2.weight(.bold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text(value)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)
        .lineLimit(3)
        .minimumScaleFactor(0.88)
    }
    .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
    .padding(12)
    .homeboardInsetSurface(accent: HomeboardPalette.accentStrong)
  }
}

private struct NextActionCard: View {
  let action: String

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .center, spacing: 12) {
        Text("Next best action")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)

        Spacer()

        Image(systemName: "arrow.up.right.circle.fill")
          .font(.title2)
          .foregroundStyle(HomeboardPalette.accent)
          .shadow(color: HomeboardPalette.accent.opacity(0.35), radius: 10, x: 0, y: 4)
      }

      Text(action)
        .font(.footnote)
        .foregroundStyle(HomeboardPalette.primaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(16)
    .homeboardPanel()
  }
}

private struct BoardQuickActionsCard: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Move the board")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      HStack(spacing: 8) {
        quickActionButton(
          title: "Add listing",
          subtitle: "Save a contender",
          systemName: "plus.square.on.square"
        ) {
          appModel.openBoardTab(.setup)
        }

        quickActionButton(
          title: "Add member",
          subtitle: "Capture roommate needs",
          systemName: "person.badge.plus"
        ) {
          appModel.openBoardTab(.members)
        }
      }

      HStack(spacing: 8) {
        quickActionButton(
          title: "Resolve decisions",
          subtitle: "Close open tradeoffs",
          systemName: "checkmark.circle"
        ) {
          appModel.openBoardTab(.compare)
        }

        quickActionButton(
          title: "Post update",
          subtitle: "Keep everyone aligned",
          systemName: "bubble.left.and.text.bubble.right"
        ) {
          appModel.openBoardTab(.updates)
        }
      }
    }
    .padding(16)
    .homeboardPanel()
  }

  @ViewBuilder
  private func quickActionButton(
    title: String,
    subtitle: String,
    systemName: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 6) {
        Image(systemName: systemName)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(HomeboardPalette.accent)

        Text(title)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)

        Text(subtitle)
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
      .padding(12)
      .homeboardInsetSurface()
    }
    .buttonStyle(.plain)
  }
}

private struct BoardStarterChecklistCard: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard

  private var checklist: [(title: String, done: Bool, action: AppModel.BoardTab)] {
    [
      ("Finish the shared brief", board.readiness.lowercased().contains("ready"), .setup),
      ("Get the group in", board.members.count > 1 || !board.invitations.isEmpty, .setup),
      ("Add live contenders", !board.shortlist.isEmpty, .setup),
      ("Close one real tradeoff", board.openQuestions.isEmpty && !board.shortlist.isEmpty, .compare)
    ]
  }

  private var completedCount: Int {
    checklist.filter(\.done).count
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .center) {
        Text("Start here")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Spacer()
        Text("\(completedCount)/\(checklist.count)")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
      }

      ForEach(Array(checklist.enumerated()), id: \.offset) { _, item in
        Button {
          appModel.openBoardTab(item.action)
        } label: {
          HStack(spacing: 12) {
            Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(item.done ? HomeboardPalette.success : HomeboardPalette.tertiaryText)

            Text(item.title)
              .font(.caption.weight(.medium))
              .foregroundStyle(HomeboardPalette.primaryText)

            Spacer()

            Image(systemName: "arrow.right")
              .font(.caption.weight(.bold))
              .foregroundStyle(HomeboardPalette.tertiaryText)
          }
          .padding(12)
          .homeboardInsetSurface()
        }
        .buttonStyle(.plain)
      }
    }
    .padding(16)
    .homeboardPanel()
  }
}

private struct CollaboratorsCard: View {
  let board: MobileBoard

  private var pendingInvites: Int {
    board.invitations.filter { $0.status.lowercased() == "pending" }.count
  }

  private var completedMembers: Int {
    board.members.filter { $0.status.lowercased().contains("complete") }.count
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Collaborators")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      HStack(spacing: 8) {
        collaboratorMetric(title: "Members", value: "\(board.members.count)")
        collaboratorMetric(title: "Profiles ready", value: "\(completedMembers)")
        collaboratorMetric(title: "Pending invites", value: "\(pendingInvites)")
      }

      if let latestInvite = board.invitations.first {
        Text("Latest invite link · \(latestInvite.status.capitalized)")
          .font(.footnote)
          .foregroundStyle(HomeboardPalette.secondaryText)
      } else {
        Text("No invites sent yet. Once more people join, the board gets much more honest about tradeoffs.")
          .font(.footnote)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(16)
    .homeboardPanel()
  }

  @ViewBuilder
  private func collaboratorMetric(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title.uppercased())
        .font(.caption2.weight(.bold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text(value)
        .font(.title3.weight(.bold))
        .foregroundStyle(HomeboardPalette.primaryText)
    }
    .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
    .padding(12)
    .homeboardInsetSurface()
  }
}

private struct MembersStarterCard: View {
  @Environment(AppModel.self) private var appModel

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Bring the group in")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      Text("Invite real roommates from Setup or add their preferences manually here so commute, budget, and neighborhood tradeoffs stop being guesswork.")
        .font(.footnote)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)

      HStack(spacing: 8) {
        starterAction("Invite from setup", systemName: "paperplane.fill") {
          appModel.openBoardTab(.setup)
        }

        starterAction("Add a member now", systemName: "person.badge.plus") {
          appModel.openBoardTab(.members)
        }
      }
    }
    .padding(16)
    .homeboardPanel()
  }

  @ViewBuilder
  private func starterAction(_ title: String, systemName: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Image(systemName: systemName)
          .foregroundStyle(HomeboardPalette.accent)
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 13)
      .padding(.horizontal, 12)
      .homeboardInsetSurface()
    }
    .buttonStyle(.plain)
  }
}

private struct GroupBriefCard: View {
  let board: MobileBoard

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Group brief")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      HStack(alignment: .top, spacing: 10) {
        infoBlock("Budget range", board.budgetLine)
        infoBlock("Move-in", board.moveInTimeline.isEmpty ? "Still open" : board.moveInTimeline)
      }

      HStack(alignment: .top, spacing: 10) {
        infoBlock(
          "Commute targets",
          board.commuteTargets.isEmpty ? "Still open" : board.commuteTargets.joined(separator: ", ")
        )
        infoBlock("Readiness", board.readiness)
      }

      infoBlock("Board progress", board.completionLine)
    }
    .padding(16)
    .homeboardPanel()
  }
}

private struct OpenDecisionsCard: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Open decisions")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      if board.openQuestions.isEmpty {
        VStack(alignment: .leading, spacing: 8) {
          Text("The board has no unresolved questions right now. That usually means it is ready for real listing comparison.")
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)

          Button("Add a decision in Setup") {
            appModel.openBoardTab(.setup)
          }
          .font(.subheadline.weight(.semibold))
          .padding(.horizontal, 14)
          .padding(.vertical, 10)
          .background(Color.white.opacity(0.06))
          .foregroundStyle(HomeboardPalette.primaryText)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          .buttonStyle(.plain)
        }
      } else {
        ForEach(board.openQuestions, id: \.self) { question in
          Text("• \(question)")
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
    .padding(16)
    .homeboardPanel()
  }
}

private struct ComparisonSummaryCard: View {
  let practical: ListingPreview?
  let commute: ListingPreview?
  let risky: ListingPreview?

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      sectionHeader("Board read", "The clearest deterministic read on the current contenders.")

      summaryRow(
        title: "Strongest practical option",
        listing: practical,
        fallback: "No practical frontrunner yet."
      )

      summaryRow(
        title: "Best commute option",
        listing: commute,
        fallback: "No commute-led option yet."
      )

      summaryRow(
        title: "Riskiest live option",
        listing: risky,
        fallback: "No obvious risk-heavy option yet."
      )
    }
    .padding(18)
    .homeboardPanel()
  }

  @ViewBuilder
  private func summaryRow(title: String, listing: ListingPreview?, fallback: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title.uppercased())
        .font(.caption.weight(.bold))
        .tracking(1.5)
        .foregroundStyle(HomeboardPalette.tertiaryText)

      if let listing {
        Text(listing.title)
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)

        Text("\(listing.location) · \(listing.priceLine)")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
      } else {
        Text(fallback)
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .homeboardInsetSurface()
  }
}

private struct MembersPreviewCard: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard
  @Binding var selectedMember: MemberPreferenceCard?

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Members")
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      if board.members.isEmpty {
        VStack(alignment: .leading, spacing: 8) {
          Text("No member profiles are visible yet. As soon as people join, their preferences and conflicts will show up here.")
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)

          Button("Open Members") {
            appModel.openBoardTab(.members)
          }
          .font(.subheadline.weight(.semibold))
          .padding(.horizontal, 14)
          .padding(.vertical, 10)
          .background(Color.white.opacity(0.06))
          .foregroundStyle(HomeboardPalette.primaryText)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          .buttonStyle(.plain)
        }
      } else {
        ForEach(board.members.prefix(3)) { member in
          Button {
            selectedMember = member
          } label: {
            VStack(alignment: .leading, spacing: 10) {
              HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                  Text(member.name)
                    .font(.headline)
                    .foregroundStyle(HomeboardPalette.primaryText)

                  Text(member.status)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(HomeboardPalette.success)
                    .lineLimit(1)
                }

                Spacer()

                Text(member.budgetLine)
                  .font(.caption.weight(.bold))
                  .foregroundStyle(HomeboardPalette.accent)
                  .multilineTextAlignment(.trailing)
                  .lineLimit(2)
              }

              memberPreviewLine("Commute", member.commuteLine)
              memberPreviewLine("Priorities", joined(member.priorities, empty: "Still open"))
              memberPreviewLine("Dealbreakers", joined(member.dealbreakers, empty: "Still open"))

              Text("Tap for full member brief")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.tertiaryText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .homeboardInsetSurface()
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(16)
    .homeboardPanel()
  }

  private func joined(_ values: [String], empty: String) -> String {
    values.isEmpty ? empty : values.joined(separator: ", ")
  }

  @ViewBuilder
  private func memberPreviewLine(_ title: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text(value)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct ShortlistCard: View {
  @Environment(AppModel.self) private var appModel
  let board: MobileBoard
  @Binding var selectedListing: ListingPreview?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      sectionHeader("Shortlist", "The listings worth discussing right now.")

      if board.shortlist.isEmpty {
        VStack(alignment: .leading, spacing: 8) {
          Text("No live shortlist yet")
            .font(.headline)
            .foregroundStyle(HomeboardPalette.primaryText)

          Text("Once the board is wired to real listing data, serious contenders will show up here for the whole group to compare.")
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)

          Button("Add first listing") {
            appModel.openBoardTab(.setup)
          }
          .font(.subheadline.weight(.semibold))
          .padding(.horizontal, 14)
          .padding(.vertical, 10)
          .background(Color.white.opacity(0.06))
          .foregroundStyle(HomeboardPalette.primaryText)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .homeboardInsetSurface(accent: HomeboardPalette.accentStrong)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 12) {
            ForEach(board.shortlist) { listing in
              Button {
                selectedListing = listing
              } label: {
                shortlistSpotlightCard(listing)
              }
              .buttonStyle(.plain)
              .frame(width: 250)
            }
          }
          .padding(.bottom, 4)
        }

        ForEach(board.shortlist) { listing in
          Button {
            selectedListing = listing
          } label: {
            VStack(alignment: .leading, spacing: 8) {
              HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                  Text(listing.title)
                    .font(.headline)
                    .foregroundStyle(HomeboardPalette.primaryText)

                  Text("\(listing.location) · \(listing.priceLine)")
                    .foregroundStyle(HomeboardPalette.secondaryText)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                  Text(listing.fitLabel.uppercased())
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(HomeboardPalette.accent)
                    .multilineTextAlignment(.trailing)

                  Text(listing.status.capitalized)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(HomeboardPalette.success)
                }
              }

              Text("\(listing.commuteLine). \(listing.summary)")
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

              if !listing.groupNote.isEmpty {
                Text("Board note: \(listing.groupNote)")
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.tertiaryText)
                  .fixedSize(horizontal: false, vertical: true)
              }

              Text("Tap for breakdown")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.tertiaryText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .homeboardInsetSurface(accent: HomeboardPalette.accentStrong)
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(18)
    .homeboardPanel()
  }

  @ViewBuilder
  private func shortlistSpotlightCard(_ listing: ListingPreview) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top) {
        Text(listing.fitLabel.uppercased())
          .font(.caption2.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)

        Spacer()

        VStack(alignment: .trailing, spacing: 4) {
          Text(listing.priceLine)
            .font(.caption.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)

          Text(listing.status.capitalized)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(HomeboardPalette.success)
        }
      }

      Text(listing.title)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)
        .lineLimit(2)

      Text(listing.location)
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .lineLimit(2)

      Text(listing.commuteLine)
        .font(.caption)
        .foregroundStyle(HomeboardPalette.tertiaryText)
        .lineLimit(2)

      Spacer(minLength: 0)

      Text(listing.highlights.first ?? listing.summary)
        .font(.caption.weight(.medium))
        .foregroundStyle(HomeboardPalette.secondaryText)
        .lineLimit(3)
    }
    .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
    .padding(16)
    .homeboardInsetSurface(accent: HomeboardPalette.accentStrong)
  }
}

private struct ActivityCard: View {
  let board: MobileBoard

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      sectionHeader("Recent Activity", "What the group has already said.")

      if board.recentActivity.isEmpty {
        Text("Once the group starts moving, notable updates will land here.")
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      } else {
        ForEach(Array(board.recentActivity.enumerated()), id: \.offset) { index, item in
          VStack(alignment: .leading, spacing: 4) {
            Text(item)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)

            Text(index == 0 ? "Latest move" : "Earlier board move")
              .font(.caption2.weight(.semibold))
              .foregroundStyle(HomeboardPalette.tertiaryText)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(12)
          .homeboardInsetSurface()
        }
      }
    }
    .padding(18)
    .homeboardPanel()
  }
}

private struct MemberCard: View {
  let member: MemberPreferenceCard

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text(member.name)
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)

        Spacer()

        Text(member.status)
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.success)
      }

      memberLine("Budget", member.budgetLine)
      memberLine("Commute", member.commuteLine)
      memberLine("Priorities", member.priorities.joined(separator: ", "))
      memberLine("Dealbreakers", member.dealbreakers.joined(separator: ", "))
      memberLine("Neighborhoods", member.neighborhoods.joined(separator: ", "))

      Text("Tap for full member brief")
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)
    }
    .padding(18)
    .homeboardPanel()
  }

  @ViewBuilder
  private func memberLine(_ title: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text(value)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct MemberDetailSheet: View {
  let member: MemberPreferenceCard
  @Environment(\.dismiss) private var dismiss
  @Environment(AppModel.self) private var appModel
  @State private var name: String
  @State private var budgetLine: String
  @State private var commuteLine: String
  @State private var prioritiesLine: String
  @State private var dealbreakersLine: String
  @State private var neighborhoodsLine: String
  @State private var status: String

  init(member: MemberPreferenceCard) {
    self.member = member
    _name = State(initialValue: member.name)
    _budgetLine = State(initialValue: member.budgetLine)
    _commuteLine = State(initialValue: member.commuteLine)
    _prioritiesLine = State(initialValue: member.priorities.joined(separator: ", "))
    _dealbreakersLine = State(initialValue: member.dealbreakers.joined(separator: ", "))
    _neighborhoodsLine = State(initialValue: member.neighborhoods.joined(separator: ", "))
    _status = State(initialValue: member.status)
  }

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          VStack(alignment: .leading, spacing: 8) {
            Text(name.isEmpty ? member.name : name)
              .font(.system(size: 28, weight: .bold, design: .serif))
              .foregroundStyle(HomeboardPalette.primaryText)

            Text(status)
              .font(.caption.weight(.bold))
              .foregroundStyle(HomeboardPalette.success)
          }

          HStack(alignment: .top, spacing: 12) {
            infoBlock("Budget", budgetLine)
            infoBlock("Commute", commuteLine)
          }

          infoBlock("Priorities", prioritiesLine.isEmpty ? "Still open" : prioritiesLine)
          infoBlock("Dealbreakers", dealbreakersLine.isEmpty ? "Still open" : dealbreakersLine)
          infoBlock("Neighborhoods", neighborhoodsLine.isEmpty ? "Still open" : neighborhoodsLine)

          VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Edit member brief", "Tighten this person’s real constraints as the board evolves.")

            detailField("Name", text: $name, prompt: "Maya")
            detailField("Budget", text: $budgetLine, prompt: "$1,500–$1,800")
            detailField("Commute", text: $commuteLine, prompt: "Midtown, max 40 min")
            detailField("Priorities", text: $prioritiesLine, prompt: "commute, neighborhood")
            detailField("Dealbreakers", text: $dealbreakersLine, prompt: "bad train access, broker fee")
            detailField("Neighborhoods", text: $neighborhoodsLine, prompt: "Fort Greene, Williamsburg")
            detailField("Status", text: $status, prompt: "profile complete")

            Button {
              appModel.updateManualMember(
                MemberPreferenceCard(
                  id: member.id,
                  name: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? member.name : name.trimmingCharacters(in: .whitespacesAndNewlines),
                  budgetLine: budgetLine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Budget still open" : budgetLine.trimmingCharacters(in: .whitespacesAndNewlines),
                  commuteLine: commuteLine.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Commute still open" : commuteLine.trimmingCharacters(in: .whitespacesAndNewlines),
                  priorities: parseCSV(prioritiesLine),
                  dealbreakers: parseCSV(dealbreakersLine),
                  neighborhoods: parseCSV(neighborhoodsLine),
                  status: status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "profile building" : status.trimmingCharacters(in: .whitespacesAndNewlines)
                )
              )
              dismiss()
            } label: {
              Text("Save member changes")
                .font(.headline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(HomeboardPalette.accentGradient)
                .foregroundStyle(HomeboardPalette.buttonText)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
          }
          .padding(18)
          .homeboardPanel()

          VStack(alignment: .leading, spacing: 10) {
            sectionHeader("How this person affects the board", "Useful when the group starts making tradeoffs.")

            ForEach(memberInsights, id: \.self) { insight in
              Text("• \(insight)")
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
          .padding(18)
          .homeboardPanel()
        }
        .padding(20)
        .padding(.bottom, 40)
      }
      .scrollBounceBehavior(.always)
      .background {
        WorkspaceBackgroundView()
      }
      .navigationTitle("Member")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") {
            dismiss()
          }
          .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
    }
  }

  private var memberInsights: [String] {
    var insights: [String] = []
    if !commuteLine.isEmpty {
      insights.append("\(name.isEmpty ? member.name : name) will likely push the board around \(commuteLine.lowercased()).")
    }
    if !parseCSV(dealbreakersLine).isEmpty {
      insights.append("The group should avoid listings that trigger \(name.isEmpty ? member.name : name)’s dealbreakers: \(parseCSV(dealbreakersLine).joined(separator: ", ")).")
    }
    if !parseCSV(prioritiesLine).isEmpty {
      insights.append("Their top weighting leans toward \(parseCSV(prioritiesLine).joined(separator: ", ")).")
    }
    if !parseCSV(neighborhoodsLine).isEmpty {
      insights.append("Neighborhood fit may matter around \(parseCSV(neighborhoodsLine).joined(separator: ", ")).")
    }
    if insights.isEmpty {
      insights.append("This member still needs more profile detail before the board can weight their preferences well.")
    }
    return insights
  }

  @ViewBuilder
  private func detailField(_ title: String, text: Binding<String>, prompt: String) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      TextField("", text: text, prompt: Text(prompt).foregroundStyle(HomeboardPalette.tertiaryText))
        .foregroundStyle(HomeboardPalette.primaryText)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .homeboardInsetSurface()
    }
  }

  private func parseCSV(_ raw: String) -> [String] {
    raw
      .split(separator: ",")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }
}

private struct MembersAlignmentCard: View {
  let members: [MemberPreferenceCard]

  private var topPriorities: String {
    let ranked = Dictionary(grouping: members.flatMap(\.priorities), by: { $0.lowercased() })
      .sorted { lhs, rhs in
        if lhs.value.count == rhs.value.count {
          return lhs.key < rhs.key
        }
        return lhs.value.count > rhs.value.count
      }
      .prefix(3)
      .map(\.key)

    return ranked.isEmpty ? "Still open" : ranked.joined(separator: ", ")
  }

  private var sharedNeighborhoods: String {
    let ranked = Dictionary(grouping: members.flatMap(\.neighborhoods), by: { $0.lowercased() })
      .sorted { lhs, rhs in
        if lhs.value.count == rhs.value.count {
          return lhs.key < rhs.key
        }
        return lhs.value.count > rhs.value.count
      }
      .prefix(3)
      .map(\.key)

    return ranked.isEmpty ? "Still open" : ranked.joined(separator: ", ")
  }

  private var frictionLine: String {
    let dealbreakers = Set(members.flatMap(\.dealbreakers).map { $0.lowercased() })
    if dealbreakers.isEmpty {
      return "No hard conflicts logged yet."
    }
    return dealbreakers.prefix(3).joined(separator: ", ")
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      sectionHeader("Group alignment", "Where the roommates are lining up and where the board may still fight itself.")

      HStack(spacing: 10) {
        alignmentMetric(title: "Top priorities", value: topPriorities)
        alignmentMetric(title: "Neighborhood pull", value: sharedNeighborhoods)
        alignmentMetric(title: "Main friction", value: frictionLine)
      }
    }
    .padding(18)
    .homeboardPanel()
  }

  @ViewBuilder
  private func alignmentMetric(title: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title.uppercased())
        .font(.caption2.weight(.bold))
        .foregroundStyle(HomeboardPalette.tertiaryText)

      Text(value)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
    .padding(14)
    .homeboardInsetSurface()
  }
}

private struct ListingDetailSheet: View {
  let listing: ListingPreview
  @Environment(\.dismiss) private var dismiss
  @Environment(AppModel.self) private var appModel
  @State private var noteDraft = ""
  @State private var selectedStatus = ""

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          VStack(alignment: .leading, spacing: 8) {
            Text(listing.title)
              .font(.system(size: 28, weight: .bold, design: .serif))
              .foregroundStyle(HomeboardPalette.primaryText)

            Text("\(listing.location) · \(listing.priceLine)")
              .foregroundStyle(HomeboardPalette.secondaryText)

            Text(listing.fitLabel.capitalized)
              .font(.caption.weight(.bold))
              .foregroundStyle(HomeboardPalette.accent)

            Text("Status: \(listing.status.capitalized)")
              .font(.caption.weight(.semibold))
              .foregroundStyle(HomeboardPalette.success)
          }

          infoBlock("Commute picture", listing.commuteLine)
          infoBlock("Why it is still on the board", listing.summary)

          if !listing.sourceURL.isEmpty {
            infoBlock("Source", listing.sourceURL)
          }

          VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Board workflow", "Track how the group is treating this listing right now.")

            Menu {
              ForEach(["saved", "touring", "applied", "passed"], id: \.self) { status in
                Button(status.capitalized) {
                  selectedStatus = status
                  appModel.updateManualListingStatus(id: listing.id, status: status)
                }
              }
            } label: {
              HStack {
                Text(selectedStatus.isEmpty ? "Update status" : "Status: \(selectedStatus.capitalized)")
                Spacer()
                Image(systemName: "chevron.down")
              }
              .font(.subheadline.weight(.semibold))
              .padding(.horizontal, 14)
              .padding(.vertical, 13)
              .background(Color.white.opacity(0.06))
              .foregroundStyle(HomeboardPalette.primaryText)
              .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 8) {
              Text("Shared note")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.tertiaryText)

              TextField("", text: $noteDraft, prompt: Text("What is the group actually thinking about this place?").foregroundStyle(HomeboardPalette.tertiaryText), axis: .vertical)
                .lineLimit(2...5)
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .homeboardInsetSurface()
            }

            Button {
              appModel.updateManualListingNote(id: listing.id, note: noteDraft)
            } label: {
              Text("Save note")
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.white.opacity(0.06))
                .foregroundStyle(HomeboardPalette.primaryText)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
          }
          .padding(18)
          .homeboardPanel()

          if !listing.groupNote.isEmpty {
            infoBlock("Current board note", listing.groupNote)
          }

          VStack(alignment: .leading, spacing: 10) {
            sectionHeader("What works", "Why this listing is still a live contender.")

            ForEach(listing.highlights, id: \.self) { line in
              Text("• \(line)")
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
          .padding(18)
          .homeboardPanel()

          VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Open risks", "What the group should pressure-test before getting attached.")

            ForEach(listing.openRisks, id: \.self) { line in
              Text("• \(line)")
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
          .padding(18)
          .homeboardPanel()
        }
        .padding(20)
        .padding(.bottom, 40)
      }
      .scrollBounceBehavior(.always)
      .background {
        WorkspaceBackgroundView()
      }
      .navigationTitle("Listing")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") {
            dismiss()
          }
          .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .onAppear {
        noteDraft = listing.groupNote
        selectedStatus = listing.status
      }
    }
  }
}

private func sectionHeader(_ title: String, _ subtitle: String) -> some View {
  VStack(alignment: .leading, spacing: 4) {
    Text(title)
      .font(.headline)
      .foregroundStyle(HomeboardPalette.primaryText)

    Text(subtitle)
      .font(.subheadline)
      .foregroundStyle(HomeboardPalette.secondaryText)
      .fixedSize(horizontal: false, vertical: true)
  }
}

private func infoBlock(_ title: String, _ value: String) -> some View {
  VStack(alignment: .leading, spacing: 4) {
    Text(title)
      .font(.caption.weight(.semibold))
      .foregroundStyle(HomeboardPalette.tertiaryText)

    Text(value)
      .foregroundStyle(HomeboardPalette.primaryText)
      .fixedSize(horizontal: false, vertical: true)
  }
  .frame(maxWidth: .infinity, alignment: .leading)
  .padding(14)
  .homeboardInsetSurface()
}

private func boardPill(title: String, value: String) -> some View {
  VStack(alignment: .leading, spacing: 4) {
    Text(title.uppercased())
      .font(.caption2.weight(.bold))
      .foregroundStyle(HomeboardPalette.tertiaryText)

    Text(value)
      .font(.subheadline.weight(.semibold))
      .foregroundStyle(HomeboardPalette.primaryText)
      .lineLimit(2)
  }
  .frame(maxWidth: .infinity, alignment: .leading)
  .padding(14)
  .homeboardInsetSurface(accent: HomeboardPalette.accent)
}

private enum HomeboardStatusStyle {
  case success
  case error
}

@ViewBuilder
private func statusMessageBanner(message: String?, style: HomeboardStatusStyle) -> some View {
  if let message, !message.isEmpty {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: style == .success ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
        .font(.subheadline.weight(.bold))
        .foregroundStyle(style == .success ? HomeboardPalette.success : Color.red.opacity(0.92))

      Text(message)
        .font(.footnote.weight(.medium))
        .foregroundStyle(HomeboardPalette.primaryText)
        .fixedSize(horizontal: false, vertical: true)

      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(Color.white.opacity(style == .success ? 0.07 : 0.08))
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
  }
}
