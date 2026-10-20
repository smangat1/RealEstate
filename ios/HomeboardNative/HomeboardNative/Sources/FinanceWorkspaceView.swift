import Foundation
import SwiftUI

enum FinanceAmountValidationError: Error, Equatable {
  case empty
  case invalidFormat
  case outOfRange

  var message: String {
    switch self {
    case .empty:
      "Enter the amount that was paid."
    case .invalidFormat:
      "Use dollars and up to two cents, like 125.50."
    case .outOfRange:
      "Enter an amount from $0.01 through $100,000."
    }
  }
}

enum FinanceAmountParser {
  static let maximumCents = 10_000_000

  static func cents(from rawValue: String) -> Result<Int, FinanceAmountValidationError> {
    var cleaned = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty else { return .failure(.empty) }
    if cleaned.first == "$" { cleaned.removeFirst() }
    cleaned = cleaned.replacingOccurrences(of: ",", with: "")

    guard cleaned.range(of: #"^(?:\d+|\d*\.\d{1,2})$"#, options: .regularExpression) != nil,
          let dollars = Decimal(string: cleaned, locale: Locale(identifier: "en_US_POSIX"))
    else { return .failure(.invalidFormat) }

    let maximumDollars = Decimal(maximumCents) / 100
    guard dollars > 0, dollars <= maximumDollars else { return .failure(.outOfRange) }

    var value = dollars
    var cents = Decimal()
    NSDecimalMultiplyByPowerOf10(&cents, &value, 2, .plain)
    return .success(NSDecimalNumber(decimal: cents).intValue)
  }
}

struct SharedGroupHubView: View {
  @Environment(AppModel.self) private var appModel
  @State private var showsSettings = false
  @State private var showsChat = false
  @State private var showsFinance = false
  @State private var groupHubGuideStep = 0
  @AppStorage("homeboard.guide.group-hub.dismissed") private var groupHubGuideDismissed = false

  private var recentMessages: [BoardMessage] {
    Array(appModel.visibleBoardMessages.suffix(4))
  }

  private var currentBalance: BoardExpenseBalance? {
    let userID = appModel.account?.id ?? appModel.authSession?.userId
    return ledger?.balances.first { $0.userId == userID }
  }

  private var ledger: BoardExpenseLedger? {
    appModel.currentBoardExpenseLedger
  }

  private var bestFinanceOption: FinanceListingOption? {
    FinanceMath.rankFinancialOptions(
      appModel.board.shortlist,
      memberCount: max(1, appModel.board.members.filter { !$0.userId.isEmpty }.count)
    ).first
  }

  var body: some View {
    ZStack {
      WorkspaceBackgroundView()

      ScrollViewReader { guideScrollProxy in
        ScrollView(.vertical, showsIndicators: false) {
          VStack(alignment: .leading, spacing: 18) {
          HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 7) {
              Text("SHARED SPACE")
                .font(.caption2.weight(.bold))
                .tracking(1.6)
                .foregroundStyle(HomeboardPalette.accent)
              Text("Group")
                .font(.system(size: 29, weight: .bold, design: .serif))
                .foregroundStyle(HomeboardPalette.primaryText)
              Text("Talk through the search and keep the money clear.")
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
            Spacer()
            Button {
              showsSettings = true
            } label: {
              Image(systemName: "gearshape.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(HomeboardPalette.secondaryText)
                .frame(width: 42, height: 42)
                .background(Color.white.opacity(0.06))
                .clipShape(Circle())
            }
            .buttonStyle(HomeboardAreaButtonStyle())
            .accessibilityLabel("Board settings")
          }

            VStack(spacing: 18) {
              Button {
                showsChat = true
              } label: {
                groupChatWidget
              }
              .buttonStyle(HomeboardAreaButtonStyle())
              .accessibilityIdentifier("homeboard.group.chat-widget")
              .sharedCoachmarkTarget("group-hub-chat-widget")
              .id("group-hub-chat-widget")

              Button {
                showsFinance = true
              } label: {
                financeWidget
              }
              .buttonStyle(HomeboardAreaButtonStyle())
              .accessibilityIdentifier("homeboard.group.finance-widget")
              .sharedCoachmarkTarget("group-hub-finance-widget")
              .id("group-hub-finance-widget")
            }
          }
          .padding(.horizontal, 16)
          .padding(.top, 18)
          .padding(.bottom, 38)
        }
        .overlayPreferenceValue(SharedCoachmarkAnchorKey.self) { anchors in
          if !groupHubGuideDismissed, groupHubGuideStep == 0 {
            SharedCoachmarkOverlay(
              target: anchors["group-hub-chat-widget"],
              title: "Chat is the group’s conversation",
              message: "See recent roommate messages here, then open it to discuss listings, reply in context, and run decisions that everyone answers.",
              targetLabel: "GROUP CHAT",
              actionLabel: "Next: Finance",
              stepLabel: "1 of 2",
              onClose: { groupHubGuideDismissed = true },
              onDismiss: {
                withAnimation(.easeInOut(duration: 0.3)) {
                  groupHubGuideStep = 1
                  guideScrollProxy.scrollTo("group-hub-finance-widget", anchor: .center)
                }
              }
            )
          } else if !groupHubGuideDismissed {
            SharedCoachmarkOverlay(
              target: anchors["group-hub-finance-widget"],
              title: "Finance keeps the money actionable",
              message: "Your balance, group spending, best shortlist value, and recent expenses appear here. Open it to compare homes, prepare documents, and update the ledger.",
              targetLabel: "FINANCE",
              actionLabel: "Done",
              stepLabel: "2 of 2",
              onClose: { groupHubGuideDismissed = true },
              onDismiss: { groupHubGuideDismissed = true }
            )
          }
        }
        .onChange(of: groupHubGuideDismissed) { _, isDismissed in
          guard !isDismissed else { return }
          withAnimation(.easeInOut(duration: 0.3)) {
            groupHubGuideStep = 0
            guideScrollProxy.scrollTo("group-hub-chat-widget", anchor: .center)
          }
        }
      }
    }
    .toolbar(.hidden, for: .navigationBar)
    .navigationDestination(isPresented: $showsChat) {
      SharedUpdatesView(showsBackButton: true)
    }
    .navigationDestination(isPresented: $showsFinance) {
      FinanceWorkspaceView(showsBackButton: true)
    }
    .task(id: appModel.board.id) {
      _ = await appModel.loadBoardExpenses()
    }
    .sheet(isPresented: $showsSettings) {
      SharedSetupView()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
  }

  private var groupChatWidget: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 12) {
        Image(systemName: "bubble.left.and.bubble.right.fill")
          .font(.title2)
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(width: 48, height: 48)
          .background(HomeboardPalette.accentGradient)
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text("Group chat")
            .font(.title3.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text(appModel.visibleBoardMessages.isEmpty
            ? "Start the conversation"
            : "\(appModel.visibleBoardMessages.count) message\(appModel.visibleBoardMessages.count == 1 ? "" : "s")")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
        }
        Spacer()
        Image(systemName: "chevron.right")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
      }

      HStack(spacing: 10) {
        FinanceMetricTile(
          label: "Messages",
          value: "\(appModel.visibleBoardMessages.count)",
          tint: HomeboardPalette.accent
        )
        FinanceMetricTile(
          label: "Roommates",
          value: "\(appModel.board.members.count)",
          tint: HomeboardPalette.success
        )
      }

      if recentMessages.isEmpty {
        Text("Share a listing, ask a roommate, or make the first group decision.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(14)
          .background(Color.white.opacity(0.045))
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      } else {
        VStack(spacing: 0) {
          ForEach(Array(recentMessages.enumerated()), id: \.element.id) { index, message in
            HStack(alignment: .top, spacing: 10) {
              Circle()
                .fill(message.role == "assistant" ? HomeboardPalette.accentSecondary : HomeboardPalette.success)
                .frame(width: 7, height: 7)
                .padding(.top, 6)
              VStack(alignment: .leading, spacing: 2) {
                Text(message.authorName?.isEmpty == false ? message.authorName! : message.role == "assistant" ? "Advisor" : "Roommate")
                  .font(.caption2.weight(.bold))
                  .foregroundStyle(HomeboardPalette.tertiaryText)
                Text(message.content)
                  .font(.subheadline)
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .lineLimit(2)
              }
              Spacer(minLength: 0)
            }
            .padding(.vertical, 9)
            if index < recentMessages.count - 1 { FinanceDivider() }
          }
        }
        .padding(.horizontal, 13)
        .background(Color.white.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      }

      HStack {
        Label("Open conversation", systemImage: "arrow.up.right")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
        Spacer()
        Text("\(appModel.board.members.count) roommate\(appModel.board.members.count == 1 ? "" : "s")")
          .font(.caption2.weight(.semibold))
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
    }
    .padding(17)
    .frame(minHeight: 390, alignment: .top)
    .financeSurface(cornerRadius: 22)
  }

  private var financeWidget: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 12) {
        Image(systemName: "dollarsign.circle.fill")
          .font(.title2)
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(width: 48, height: 48)
          .background(HomeboardPalette.accentGradient)
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        VStack(alignment: .leading, spacing: 3) {
          Text("Finances")
            .font(.title3.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text(bestFinanceOption.map { "Best fit: \($0.listing.title)" } ?? "Ledger ready without a listing")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .lineLimit(1)
        }
        Spacer()
        Image(systemName: "chevron.right")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
      }

      HStack(spacing: 10) {
        FinanceMetricTile(
          label: (currentBalance?.balanceCents ?? 0) >= 0 ? "You’re owed" : "You owe",
          value: FinanceMath.money(abs(currentBalance?.balanceCents ?? 0)),
          tint: (currentBalance?.balanceCents ?? 0) >= 0 ? HomeboardPalette.success : HomeboardPalette.accentSecondary
        )
        FinanceMetricTile(
          label: "Group paid",
          value: FinanceMath.money(ledger?.totalCents ?? 0),
          tint: HomeboardPalette.primaryText
        )
      }

      HStack {
        Label("\(ledger?.expenses.count ?? 0) ledger entries", systemImage: "list.bullet.rectangle")
        Spacer()
        Label("\(appModel.board.shortlist.count) shortlisted", systemImage: "building.2")
      }
      .font(.caption2.weight(.semibold))
      .foregroundStyle(HomeboardPalette.tertiaryText)

      if let option = bestFinanceOption {
        VStack(alignment: .leading, spacing: 5) {
          Text("BEST SHORTLIST VALUE")
            .font(.system(size: 9, weight: .bold))
            .tracking(0.9)
            .foregroundStyle(HomeboardPalette.tertiaryText)
          HStack(alignment: .firstTextBaseline) {
            Text(option.listing.title)
              .font(.subheadline.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
              .lineLimit(1)
            Spacer(minLength: 8)
            Text(option.monthlyCost.map(FinanceMath.dollars) ?? "Rent unknown")
              .font(.caption.weight(.bold))
              .foregroundStyle(HomeboardPalette.accent)
          }
          Text("\(option.bedroomLabel) · \(option.spaceLabel) · \(option.budgetLabel)")
            .font(.caption2)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .lineLimit(2)
        }
        .padding(13)
        .background(HomeboardPalette.accent.opacity(0.075))
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      }

      if let expenses = ledger?.expenses, !expenses.isEmpty {
        VStack(spacing: 9) {
          ForEach(expenses.prefix(2)) { expense in
            HStack {
              VStack(alignment: .leading, spacing: 2) {
                Text(expense.description)
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .lineLimit(1)
                Text("Paid by \(expense.paidByName)")
                  .font(.caption2)
                  .foregroundStyle(HomeboardPalette.secondaryText)
              }
              Spacer()
              Text(FinanceMath.money(expense.amountCents))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)
            }
          }
        }
        .padding(13)
        .background(Color.white.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      } else {
        Text("Estimate move-in cash, check application readiness, and record the first shared payment.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(14)
          .background(Color.white.opacity(0.045))
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      }
    }
    .padding(17)
    .frame(minHeight: 390, alignment: .top)
    .financeSurface(cornerRadius: 22)
  }
}

struct FinanceWorkspaceView: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  var showsBackButton = false
  @State private var selectedListingID: String?
  @State private var isLoadingLedger = true
  @State private var ledgerLoadFailed = false
  @State private var showsAddPayment = false
  @State private var showsReadiness = false
  @State private var financeGuideStep = 0
  @AppStorage("homeboard.guide.finance.dismissed") private var financeGuideDismissed = false

  private var memberCount: Int {
    max(1, appModel.board.members.filter { !$0.userId.isEmpty }.count)
  }

  private var rankedListings: [FinanceListingOption] {
    FinanceMath.rankFinancialOptions(appModel.board.shortlist, memberCount: memberCount)
  }

  private var selectedListing: ListingPreview? {
    if let selectedListingID,
       let listing = appModel.board.shortlist.first(where: { $0.id == selectedListingID }) {
      return listing
    }
    return rankedListings.first?.listing
  }

  private var rent: Int? {
    selectedListing?.trueMonthlyCost?.listedRent ?? selectedListing.flatMap { FinanceMath.firstAmount(in: $0.priceLine) }
  }

  private var disclosedUpfrontFees: Int {
    selectedListing?.trueMonthlyCost?.upfrontFeesTotal ?? 0
  }

  private var estimatedMoveInTotal: Int? {
    rent.map { ($0 * 2) + disclosedUpfrontFees }
  }

  private var currentUserID: String {
    appModel.account?.id ?? appModel.authSession?.userId ?? ""
  }

  private var currentMember: MemberPreferenceCard? {
    appModel.board.members.first { $0.userId == currentUserID }
  }

  private var plannedPersonalShare: Int? {
    guard let rent else { return nil }
    let rentShare = selectedListing?.rentSplit?.shares.first { share in
      share.memberId == currentMember?.id || share.memberId == currentMember?.roommateId
    }?.amount ?? Int(ceil(Double(rent) / Double(memberCount)))
    return (rentShare * 2) + Int(ceil(Double(disclosedUpfrontFees) / Double(memberCount)))
  }

  private var listingExpenses: [BoardExpense] {
    guard let selectedListing else { return [] }
    return ledger?.expenses.filter { $0.boardListingId == selectedListing.id } ?? []
  }

  private var ledger: BoardExpenseLedger? {
    appModel.currentBoardExpenseLedger
  }

  private var listingPaidCents: Int {
    listingExpenses.reduce(0) { $0 + $1.amountCents }
  }

  private var groupPersonalBalance: BoardExpenseBalance? {
    ledger?.balances.first { $0.userId == currentUserID }
  }

  private var readinessNextMove: (title: String, detail: String, icon: String) {
    let readiness = appModel.profile.readiness
    if !readiness.hasProofOfIncome {
      return (
        "Choose the proof you’ll actually submit",
        "Pay stubs, an employment or offer letter, tax returns, bank statements, and guarantor documents are common, but the property decides what it accepts.",
        "doc.text.magnifyingglass"
      )
    }
    if readiness.needsGuarantor {
      return (
        "Prepare the guarantor packet",
        "Ask for the guarantor’s ID and accepted income or asset proof before the application deadline.",
        "person.badge.shield.checkmark.fill"
      )
    }
    if readiness.hasOfferLetter {
      return (
        "Check that the letter is current",
        "Confirm it includes your name, employer, compensation or start date, and a contact the property can verify.",
        "briefcase.fill"
      )
    }
    return (
      "Verify the property accepts your form",
      "Make sure the document is current, readable, and safe to share before you submit it.",
      "checkmark.seal.fill"
    )
  }

  var body: some View {
    ZStack {
      WorkspaceBackgroundView()

      ScrollViewReader { guideScrollProxy in
        ScrollView(.vertical, showsIndicators: false) {
          VStack(alignment: .leading, spacing: 18) {
            FinancePageHeader(showsBackButton: showsBackButton) {
              dismiss()
            }

            groupLedgerSnapshot
              .sharedCoachmarkTarget("finance-ledger")
              .id("finance-guide-ledger")

            if !rankedListings.isEmpty {
              shortlistComparison
                .sharedCoachmarkTarget("finance-comparison")
                .id("finance-guide-comparison")
            }

            if let listing = selectedListing {
              listingSelector(listing)
              moveInSnapshot(listing)
              costPlan(listing)
              monthlyReality(listing)
              paymentSafety(listing)
            } else {
              noListingState
            }

            readinessCard
              .sharedCoachmarkTarget("finance-readiness")
              .id("finance-guide-readiness")
          }
          .padding(.horizontal, 16)
          .padding(.top, 14)
          .padding(.bottom, 38)
        }
        .refreshable {
          await refreshLedger()
        }
        .overlayPreferenceValue(SharedCoachmarkAnchorKey.self) { anchors in
          if !financeGuideDismissed, financeGuideStep == 0 {
            SharedCoachmarkOverlay(
              target: anchors["finance-ledger"],
              title: "Start with what the group owes",
              message: "The ledger works before or after you choose a home. It shows who paid, who owes, recent expenses, and the group total in one place.",
              targetLabel: "GROUP LEDGER",
              actionLabel: rankedListings.isEmpty ? "Next: Application prep" : "Next: Home comparison",
              stepLabel: rankedListings.isEmpty ? "1 of 2" : "1 of 3",
              onClose: { financeGuideDismissed = true },
              onDismiss: {
                withAnimation(.easeInOut(duration: 0.3)) {
                  financeGuideStep = 1
                  guideScrollProxy.scrollTo(
                    rankedListings.isEmpty ? "finance-guide-readiness" : "finance-guide-comparison",
                    anchor: .center
                  )
                }
              }
            )
          } else if !financeGuideDismissed, financeGuideStep == 1, !rankedListings.isEmpty {
            SharedCoachmarkOverlay(
              target: anchors["finance-comparison"],
              title: "Compare value, not just rent",
              message: "Shortlisted homes are ranked using budget fit, monthly cost per bedroom, and space for the money. Tap one to make it the active finance plan.",
              targetLabel: "BEST FINANCIAL OPTIONS",
              actionLabel: "Next: Application prep",
              stepLabel: "2 of 3",
              onClose: { financeGuideDismissed = true },
              onDismiss: {
                withAnimation(.easeInOut(duration: 0.3)) {
                  financeGuideStep = 2
                  guideScrollProxy.scrollTo("finance-guide-readiness", anchor: .center)
                }
              }
            )
          } else if !financeGuideDismissed {
            SharedCoachmarkOverlay(
              target: anchors["finance-readiness"],
              title: "Leave with a real application task",
              message: "Choose the income form you will use, say whether it is ready, and prepare any guarantor packet. Homeboard gives you the next document action, not a generic checklist.",
              targetLabel: "APPLICATION PREP",
              actionLabel: "Done",
              stepLabel: rankedListings.isEmpty ? "2 of 2" : "3 of 3",
              onClose: { financeGuideDismissed = true },
              onDismiss: { financeGuideDismissed = true }
            )
          }
        }
        .onChange(of: financeGuideDismissed) { _, isDismissed in
          guard !isDismissed else { return }
          withAnimation(.easeInOut(duration: 0.3)) {
            financeGuideStep = 0
            guideScrollProxy.scrollTo("finance-guide-ledger", anchor: .center)
          }
        }
      }
    }
    .toolbar(.hidden, for: .navigationBar)
    .onAppear {
      if selectedListingID == nil {
        selectedListingID = rankedListings.first?.id
      }
    }
    .task(id: appModel.board.id) {
      await refreshLedger()
    }
    .sheet(isPresented: $showsAddPayment) {
      FinanceAddPaymentSheet(listing: selectedListing) { _ in }
      .presentationDetents([.large])
      .presentationDragIndicator(.visible)
      .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsReadiness) {
      FinanceReadinessSheet()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
  }

  private var groupLedgerSnapshot: some View {
    let balance = groupPersonalBalance?.balanceCents ?? 0
    return VStack(alignment: .leading, spacing: 15) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text("GROUP LEDGER")
            .font(.caption2.weight(.bold))
            .tracking(1.15)
            .foregroundStyle(HomeboardPalette.tertiaryText)
          if isLoadingLedger {
            HStack(spacing: 9) {
              ProgressView().tint(HomeboardPalette.accent)
              Text("Loading balances…")
                .font(.headline)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
          } else if ledgerLoadFailed && ledger == nil {
            Text("Ledger unavailable")
              .font(.title2.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
          } else {
            Text(balance > 0 ? "You’re owed \(FinanceMath.money(balance))" : balance < 0 ? "You owe \(FinanceMath.money(abs(balance)))" : "You’re settled up")
              .font(.title2.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
          }
          Text(ledgerLoadFailed && ledger == nil
            ? "Pull down to try again. Your shortlist analysis is still available below."
            : "The ledger works with or without a listing. Record application, moving, rent, or household payments anytime.")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 8)
        Image(systemName: "list.bullet.rectangle.portrait.fill")
          .font(.title2)
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(width: 50, height: 50)
          .background(HomeboardPalette.accentGradient)
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      }

      HStack(spacing: 10) {
        FinanceMetricTile(
          label: "Group paid",
          value: FinanceMath.money(ledger?.totalCents ?? 0),
          tint: HomeboardPalette.primaryText
        )
        FinanceMetricTile(
          label: "Entries",
          value: "\(ledger?.expenses.count ?? 0)",
          tint: HomeboardPalette.accent
        )
      }

      if !isLoadingLedger, let ledger {
        if !ledger.balances.isEmpty {
          FinanceDivider()
          VStack(alignment: .leading, spacing: 9) {
            Text("WHO’S AHEAD")
              .font(.system(size: 9, weight: .bold))
              .tracking(0.9)
              .foregroundStyle(HomeboardPalette.tertiaryText)
            ForEach(ledger.balances) { item in
              HStack {
                Text(item.userId == currentUserID ? "You" : item.name)
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                Spacer()
                Text(item.balanceCents > 0
                  ? "owed \(FinanceMath.money(item.balanceCents))"
                  : item.balanceCents < 0
                    ? "owes \(FinanceMath.money(abs(item.balanceCents)))"
                    : "settled")
                  .font(.caption.weight(.bold))
                  .foregroundStyle(item.balanceCents >= 0 ? HomeboardPalette.success : HomeboardPalette.accentSecondary)
              }
            }
          }
        }

        FinanceDivider()
        VStack(alignment: .leading, spacing: 10) {
          Text("RECENT ENTRIES")
            .font(.system(size: 9, weight: .bold))
            .tracking(0.9)
            .foregroundStyle(HomeboardPalette.tertiaryText)
          if ledger.expenses.isEmpty {
            Text("No payments yet. Add an application fee, deposit, rent payment, moving cost, or general roommate expense.")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)
          } else {
            ForEach(Array(ledger.expenses.prefix(4))) { expense in
              FinanceExpenseRow(expense: expense)
            }
          }
        }
      }

      Button {
        showsAddPayment = true
      } label: {
        Label("Add an expense", systemImage: "plus.circle.fill")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(maxWidth: .infinity)
          .frame(height: 50)
          .background(HomeboardPalette.accentGradient)
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      }
      .buttonStyle(HomeboardAreaButtonStyle())
      .accessibilityIdentifier("homeboard.finance.add-payment")
    }
    .padding(18)
    .background {
      ZStack {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .fill(HomeboardPalette.surfaceDeep)
        Circle()
          .fill(HomeboardPalette.accent.opacity(0.11))
          .frame(width: 180, height: 180)
          .blur(radius: 24)
          .offset(x: 135, y: -90)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 24, style: .continuous)
        .stroke(HomeboardPalette.borderStrong.opacity(0.72), lineWidth: 1)
    }
  }

  private var shortlistComparison: some View {
    VStack(alignment: .leading, spacing: 13) {
      VStack(alignment: .leading, spacing: 4) {
        FinanceSectionTitle(title: "Best financial options", trailing: "\(rankedListings.count) shortlisted")
        Text("Ranked from the facts you have: budget fit, monthly cost per bedroom, and space for the money. Missing details stay visible instead of being guessed.")
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }

      ForEach(Array(rankedListings.prefix(4).enumerated()), id: \.element.id) { index, option in
        Button {
          selectedListingID = option.id
        } label: {
          FinanceListingOptionRow(
            option: option,
            rank: index + 1,
            isSelected: selectedListing?.id == option.id
          )
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .accessibilityLabel("Open finance plan for \(option.listing.title)")
      }
    }
    .padding(16)
    .financeSurface(cornerRadius: 20)
  }

  private func listingSelector(_ listing: ListingPreview) -> some View {
    Menu {
      ForEach(appModel.board.shortlist) { option in
        Button {
          selectedListingID = option.id
        } label: {
          Label(
            option.title,
            systemImage: option.id == listing.id ? "checkmark.circle.fill" : "circle"
          )
        }
      }
    } label: {
      HStack(spacing: 13) {
        Image(systemName: "building.2.fill")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(width: 42, height: 42)
          .background(HomeboardPalette.accentGradient)
          .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))

        VStack(alignment: .leading, spacing: 3) {
          Text("PLANNING FOR")
            .font(.caption2.weight(.bold))
            .tracking(1.15)
            .foregroundStyle(HomeboardPalette.tertiaryText)
          Text(listing.title)
            .font(.headline)
            .foregroundStyle(HomeboardPalette.primaryText)
            .lineLimit(1)
          Text(listing.priceLine)
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
        }

        Spacer()
        Image(systemName: "chevron.up.chevron.down")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
      }
      .padding(14)
      .financeSurface(cornerRadius: 18)
    }
    .buttonStyle(HomeboardAreaButtonStyle())
    .accessibilityLabel("Choose a listing for the finance plan")
    .accessibilityIdentifier("homeboard.finance.listing-picker")
  }

  private func moveInSnapshot(_ listing: ListingPreview) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 5) {
          Text("ESTIMATED CASH TO MOVE IN")
            .font(.caption2.weight(.bold))
            .tracking(1.15)
            .foregroundStyle(HomeboardPalette.tertiaryText)
          Text(estimatedMoveInTotal.map(FinanceMath.dollars) ?? "Needs rent details")
            .font(.system(size: 34, weight: .bold, design: .rounded))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text("First month + estimated security deposit + disclosed one-time fees")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 10)

        Image(systemName: "key.horizontal.fill")
          .font(.title2)
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(width: 52, height: 52)
          .background(HomeboardPalette.accentGradient)
          .clipShape(Circle())
      }

      HStack(spacing: 10) {
        FinanceMetricTile(
          label: "Your plan",
          value: plannedPersonalShare.map(FinanceMath.dollars) ?? "Not set",
          tint: HomeboardPalette.accent
        )
        FinanceMetricTile(
          label: "Recorded paid",
          value: FinanceMath.money(listingPaidCents),
          tint: HomeboardPalette.success
        )
      }

      Button {
        showsAddPayment = true
      } label: {
        Label("Record a payment for this home", systemImage: "plus.circle.fill")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(maxWidth: .infinity)
          .frame(height: 50)
          .background(HomeboardPalette.accentGradient)
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      }
      .buttonStyle(HomeboardAreaButtonStyle())
      .accessibilityIdentifier("homeboard.finance.add-listing-payment")
    }
    .padding(18)
    .background {
      ZStack {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .fill(HomeboardPalette.surfaceDeep)
        Circle()
          .fill(HomeboardPalette.accent.opacity(0.12))
          .frame(width: 190, height: 190)
          .blur(radius: 22)
          .offset(x: 130, y: -90)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 24, style: .continuous)
        .stroke(HomeboardPalette.borderStrong.opacity(0.72), lineWidth: 1)
    }
  }

  private var readinessCard: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text("Application prep")
            .font(.headline)
            .foregroundStyle(HomeboardPalette.primaryText)
          Text("Choose real documents and leave with a next step")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
        }
        Spacer()
        Image(systemName: "lock.shield.fill")
          .font(.title3)
          .foregroundStyle(HomeboardPalette.success)
      }

      HStack(alignment: .top, spacing: 12) {
        Image(systemName: readinessNextMove.icon)
          .font(.headline)
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(width: 42, height: 42)
          .background(HomeboardPalette.accentGradient)
          .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        VStack(alignment: .leading, spacing: 4) {
          Text("YOUR NEXT MOVE")
            .font(.system(size: 9, weight: .bold))
            .tracking(0.9)
            .foregroundStyle(HomeboardPalette.tertiaryText)
          Text(readinessNextMove.title)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text(readinessNextMove.detail)
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(14)
      .background(HomeboardPalette.surfaceDeep.opacity(0.72))
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

      HStack(spacing: 7) {
        FinanceComparisonPill(text: "Pay stubs", positive: false)
        FinanceComparisonPill(text: "Offer letter", positive: false)
        FinanceComparisonPill(text: "Other proof", positive: false)
      }

      Button {
        showsReadiness = true
      } label: {
        Label("Build my application packet", systemImage: "arrow.right.circle.fill")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
      }
      .buttonStyle(HomeboardAreaButtonStyle())
    }
    .padding(16)
    .financeSurface(cornerRadius: 20)
  }

  private func costPlan(_ listing: ListingPreview) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      FinanceSectionTitle(title: "Upfront cost plan", trailing: "Working estimate")

      FinanceCostRow(
        icon: "doc.text.fill",
        title: "Disclosed one-time fees",
        detail: disclosedUpfrontFees > 0 ? "From listing details" : "Verify application, broker, and move-in fees",
        amount: disclosedUpfrontFees > 0 ? FinanceMath.dollars(disclosedUpfrontFees) : "Unknown",
        verified: disclosedUpfrontFees > 0
      )
      FinanceDivider()
      FinanceCostRow(
        icon: "lock.shield.fill",
        title: "Security deposit",
        detail: rent == nil ? "Ask the property manager" : "Planning estimate · one month of rent",
        amount: rent.map(FinanceMath.dollars) ?? "Unknown",
        verified: false
      )
      FinanceDivider()
      FinanceCostRow(
        icon: "calendar.badge.clock",
        title: "First month’s rent",
        detail: rent == nil ? "Rent has not been verified" : "Based on the current listed rent",
        amount: rent.map(FinanceMath.dollars) ?? "Unknown",
        verified: rent != nil
      )
      FinanceDivider()
      FinanceCostRow(
        icon: "shippingbox.fill",
        title: "Moving and setup",
        detail: "Movers, utility deposits, insurance, and supplies",
        amount: "Add plan",
        verified: false
      )

      Text("Estimates are planning aids, not property requirements. Confirm every amount and refund policy before paying.")
        .font(.caption2)
        .foregroundStyle(HomeboardPalette.tertiaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(16)
    .financeSurface(cornerRadius: 20)
  }

  private func monthlyReality(_ listing: ListingPreview) -> some View {
    let cost = listing.trueMonthlyCost
    return VStack(alignment: .leading, spacing: 13) {
      FinanceSectionTitle(
        title: "Monthly reality",
        trailing: cost?.complete == true ? "Verified inputs" : "Known so far"
      )

      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 3) {
          Text(cost?.knownMonthlyTotal.map(FinanceMath.dollars) ?? rent.map(FinanceMath.dollars) ?? "Unknown")
            .font(.title2.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text("Group monthly cost")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
        }
        Spacer()
        if let share = selectedListing?.rentSplit?.shares.first(where: { item in
          item.memberId == currentMember?.id || item.memberId == currentMember?.roommateId
        }) {
          VStack(alignment: .trailing, spacing: 3) {
            Text(FinanceMath.dollars(share.amount))
              .font(.title3.weight(.bold))
              .foregroundStyle(HomeboardPalette.accent)
            Text("Your suggested rent")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
          }
        }
      }

      if let cost, !cost.lines.isEmpty {
        ForEach(cost.lines.prefix(4)) { line in
          HStack {
            Text(line.label)
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
            Spacer()
            Text(FinanceMath.signedDollars(line.monthlyAmount))
              .font(.caption.weight(.semibold))
              .foregroundStyle(line.monthlyAmount < 0 ? HomeboardPalette.success : HomeboardPalette.primaryText)
          }
        }
      }
    }
    .padding(16)
    .financeSurface(cornerRadius: 20)
  }

  private func paymentSafety(_ listing: ListingPreview) -> some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: listing.scamWarning == nil ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
        .font(.title3)
        .foregroundStyle(listing.scamWarning == nil ? HomeboardPalette.success : HomeboardPalette.danger)
      VStack(alignment: .leading, spacing: 4) {
        Text("Verify before paying")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text(listing.scamWarning?.message ?? "Confirm the exact unit, recipient, refund terms, and payment instructions through a verified listing source.")
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(16)
    .background((listing.scamWarning == nil ? HomeboardPalette.success : HomeboardPalette.danger).opacity(0.10))
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke((listing.scamWarning == nil ? HomeboardPalette.success : HomeboardPalette.danger).opacity(0.35), lineWidth: 1)
    }
  }

  private var noListingState: some View {
    VStack(alignment: .leading, spacing: 14) {
      Image(systemName: "building.2.crop.circle")
        .font(.system(size: 34))
        .foregroundStyle(HomeboardPalette.accent)
      Text("Your ledger is ready now")
        .font(.title3.weight(.bold))
        .foregroundStyle(HomeboardPalette.primaryText)
      Text("You can record general application, moving, utility, and roommate expenses above. Add homes to the shortlist when you want rent, bedroom, space, and move-in cash comparisons.")
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.secondaryText)
    }
    .padding(18)
    .financeSurface(cornerRadius: 22)
  }

  private func refreshLedger() async {
    isLoadingLedger = true
    let updatedLedger = await appModel.loadBoardExpenses()
    guard !Task.isCancelled else { return }
    if let updatedLedger {
      ledgerLoadFailed = false
    } else {
      ledgerLoadFailed = true
    }
    isLoadingLedger = false
  }
}

private struct FinanceAddPaymentSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  let onSaved: (BoardExpenseLedger) -> Void

  @State private var selectedListingID: String?
  @State private var category = FinanceExpenseCategory.securityDeposit
  @State private var amount = ""
  @State private var note = ""
  @State private var payerUserID = ""
  @State private var splitUserIDs = Set<String>()
  @State private var isSaving = false
  @State private var saveError: String?

  init(
    listing: ListingPreview?,
    onSaved: @escaping (BoardExpenseLedger) -> Void
  ) {
    self.onSaved = onSaved
    _selectedListingID = State(initialValue: listing?.id)
    _category = State(initialValue: listing == nil ? .other : .securityDeposit)
  }

  private var selectedListing: ListingPreview? {
    guard let selectedListingID else { return nil }
    return appModel.board.shortlist.first { $0.id == selectedListingID }
  }

  private var people: [FinancePerson] {
    var seen = Set<String>()
    var values = appModel.board.members.compactMap { member -> FinancePerson? in
      guard !member.userId.isEmpty, seen.insert(member.userId).inserted else { return nil }
      return FinancePerson(id: member.userId, name: member.name)
    }
    let currentID = appModel.account?.id ?? appModel.authSession?.userId ?? ""
    if !currentID.isEmpty, !seen.contains(currentID) {
      values.insert(FinancePerson(id: currentID, name: appModel.account?.name ?? "You"), at: 0)
    }
    return values
  }

  private var parsedAmountCents: Int? {
    guard case .success(let cents) = FinanceAmountParser.cents(from: amount) else { return nil }
    return cents
  }

  private var amountError: String? {
    guard saveError == nil, !amount.isEmpty,
          case .failure(let error) = FinanceAmountParser.cents(from: amount)
    else { return nil }
    return error.message
  }

  private var perPersonCents: Int? {
    guard let parsedAmountCents, !splitUserIDs.isEmpty else { return nil }
    return Int(ceil(Double(parsedAmountCents) / Double(splitUserIDs.count)))
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          VStack(alignment: .leading, spacing: 5) {
            Text("RECORD A PAYMENT")
              .font(.caption2.weight(.bold))
              .tracking(1.2)
              .foregroundStyle(HomeboardPalette.accent)
            Text(selectedListing?.title ?? "Group ledger")
              .font(.title2.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
            Text("Choose what was paid, where it belongs, and who shares it. Homeboard will calculate the balances.")
              .font(.subheadline)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)
          }

          VStack(alignment: .leading, spacing: 10) {
            FinanceSectionTitle(title: "Applies to", trailing: selectedListing == nil ? "General" : "Shortlist")
            Menu {
              Button {
                selectedListingID = nil
              } label: {
                Label("General group expense", systemImage: selectedListingID == nil ? "checkmark.circle.fill" : "person.3.fill")
              }
              ForEach(appModel.board.shortlist) { option in
                Button {
                  selectedListingID = option.id
                } label: {
                  Label(option.title, systemImage: selectedListingID == option.id ? "checkmark.circle.fill" : "building.2")
                }
              }
            } label: {
              FinanceSelectionRow(
                icon: selectedListing == nil ? "person.3.fill" : "building.2.fill",
                title: selectedListing?.title ?? "General group expense",
                detail: selectedListing == nil
                  ? "Not tied to one home"
                  : "Keeps this payment with the selected home"
              )
            }
          }

          VStack(alignment: .leading, spacing: 12) {
            FinanceSectionTitle(title: "What was paid?", trailing: nil)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
              ForEach(FinanceExpenseCategory.allCases) { option in
                Button {
                  category = option
                } label: {
                  HStack(spacing: 9) {
                    Image(systemName: option.icon)
                      .font(.subheadline.weight(.bold))
                    Text(option.shortTitle)
                      .font(.caption.weight(.semibold))
                      .lineLimit(1)
                    Spacer(minLength: 0)
                  }
                  .foregroundStyle(category == option ? HomeboardPalette.buttonText : HomeboardPalette.primaryText)
                  .padding(.horizontal, 12)
                  .frame(height: 46)
                  .background(category == option ? HomeboardPalette.accent : Color.white.opacity(0.06))
                  .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                  .overlay {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                      .stroke(category == option ? Color.clear : HomeboardPalette.border.opacity(0.7), lineWidth: 1)
                  }
                }
                .buttonStyle(HomeboardAreaButtonStyle())
              }
            }
          }

          VStack(alignment: .leading, spacing: 9) {
            Text("AMOUNT")
              .font(.caption2.weight(.bold))
              .tracking(1.1)
              .foregroundStyle(HomeboardPalette.tertiaryText)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
              Text("$")
                .font(.title.weight(.bold))
                .foregroundStyle(HomeboardPalette.accent)
              TextField("0.00", text: $amount)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(HomeboardPalette.primaryText)
                .keyboardType(.decimalPad)
                .onChange(of: amount) { _, _ in saveError = nil }
            }
            .padding(.horizontal, 16)
            .frame(height: 72)
            .background(HomeboardPalette.surfaceDeep.opacity(0.78))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
              RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(HomeboardPalette.borderStrong.opacity(0.7), lineWidth: 1)
            }
            if let amountError {
              Label(amountError, systemImage: "exclamationmark.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.danger)
                .fixedSize(horizontal: false, vertical: true)
            }
          }

          VStack(alignment: .leading, spacing: 10) {
            FinanceSectionTitle(title: "Paid by", trailing: nil)
            Menu {
              ForEach(people) { person in
                Button(person.name) {
                  payerUserID = person.id
                  saveError = nil
                }
              }
            } label: {
              FinanceSelectionRow(
                icon: "person.crop.circle.fill",
                title: people.first(where: { $0.id == payerUserID })?.name ?? "Choose a roommate",
                detail: "The person who fronted the payment"
              )
            }
          }

          VStack(alignment: .leading, spacing: 10) {
            FinanceSectionTitle(title: "Split between", trailing: "\(splitUserIDs.count) selected")
            ForEach(people) { person in
              Button {
                if splitUserIDs.contains(person.id) {
                  if splitUserIDs.count > 1 { splitUserIDs.remove(person.id) }
                } else {
                  splitUserIDs.insert(person.id)
                }
                saveError = nil
              } label: {
                HStack(spacing: 11) {
                  Image(systemName: splitUserIDs.contains(person.id) ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(splitUserIDs.contains(person.id) ? HomeboardPalette.success : HomeboardPalette.tertiaryText)
                  Text(person.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HomeboardPalette.primaryText)
                  Spacer()
                  if splitUserIDs.contains(person.id), let perPersonCents {
                    Text(FinanceMath.money(perPersonCents))
                      .font(.caption.weight(.bold))
                      .foregroundStyle(HomeboardPalette.secondaryText)
                  }
                }
                .padding(.horizontal, 13)
                .frame(height: 48)
                .background(Color.white.opacity(splitUserIDs.contains(person.id) ? 0.08 : 0.035))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
              }
              .buttonStyle(HomeboardAreaButtonStyle())
            }
          }

          VStack(alignment: .leading, spacing: 9) {
            Text("NOTE · OPTIONAL")
              .font(.caption2.weight(.bold))
              .tracking(1.1)
              .foregroundStyle(HomeboardPalette.tertiaryText)
            TextField(category.defaultNote, text: $note)
              .font(.subheadline)
              .foregroundStyle(HomeboardPalette.primaryText)
              .padding(.horizontal, 14)
              .frame(height: 50)
              .background(Color.white.opacity(0.06))
              .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
              .overlay {
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                  .stroke(HomeboardPalette.border.opacity(0.7), lineWidth: 1)
              }
          }

          if let error = saveError {
            HStack(alignment: .top, spacing: 10) {
              Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(HomeboardPalette.danger)
              Text(error)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HomeboardPalette.primaryText)
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(13)
            .background(HomeboardPalette.danger.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityIdentifier("homeboard.finance.payment-error")
          }

          Button(action: save) {
            HStack(spacing: 9) {
              if isSaving { ProgressView().tint(HomeboardPalette.buttonText) }
              Text(isSaving ? "Saving payment…" : "Add to ledger")
              if !isSaving { Image(systemName: "arrow.right") }
            }
            .font(.headline)
            .foregroundStyle(HomeboardPalette.buttonText)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(HomeboardPalette.accentGradient)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
          .disabled(isSaving)
          .opacity(isSaving ? 0.72 : 1)
          .accessibilityIdentifier("homeboard.finance.payment-save")
        }
        .padding(18)
      }
      .background(WorkspaceBackgroundView())
      .navigationTitle("New payment")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Cancel") { dismiss() }
        }
      }
      .onAppear {
        let currentID = appModel.account?.id ?? appModel.authSession?.userId ?? people.first?.id ?? ""
        if payerUserID.isEmpty { payerUserID = currentID }
        if splitUserIDs.isEmpty { splitUserIDs = Set(people.map(\.id)) }
      }
    }
  }

  private func save() {
    saveError = nil
    let amountCents: Int
    switch FinanceAmountParser.cents(from: amount) {
    case .success(let cents):
      amountCents = cents
    case .failure(let error):
      saveError = error.message
      return
    }
    guard !payerUserID.isEmpty else {
      saveError = "Choose the roommate who made the payment."
      return
    }
    guard !splitUserIDs.isEmpty else {
      saveError = "Choose at least one roommate who shares this expense."
      return
    }
    isSaving = true
    Task {
      let updated = await appModel.addBoardExpense(
        description: note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? category.defaultNote : note,
        category: category.rawValue,
        amountCents: amountCents,
        boardListingId: selectedListingID,
        paidByUserId: payerUserID,
        splitUserIds: people.map(\.id).filter(splitUserIDs.contains)
      )
      isSaving = false
      if let updated {
        onSaved(updated)
        dismiss()
      } else {
        let reason = appModel.boardError ?? "The server could not save this payment."
        saveError = "\(reason) Your entries are still here; check the selections and try again."
      }
    }
  }
}

private struct FinanceReadinessSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var proofChoice: FinanceIncomeProofChoice?
  @State private var documentStatus: FinanceDocumentStatus?
  @State private var guarantorChoice: Bool?
  @State private var isSaving = false

  private var answeredCount: Int {
    [proofChoice != nil, documentStatus != nil, guarantorChoice != nil].filter { $0 }.count
  }

  private var canSave: Bool {
    answeredCount == 3 && !isSaving
  }

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 20) {
          VStack(alignment: .leading, spacing: 7) {
            Image(systemName: "doc.badge.gearshape.fill")
              .font(.title)
              .foregroundStyle(HomeboardPalette.accent)
            Text("Build your application packet")
              .font(.title2.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
            Text("Answer three practical questions. Homeboard will tell you what to gather and what to verify before you send anything.")
              .font(.subheadline)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)

            ProgressView(value: Double(answeredCount), total: 3)
              .tint(answeredCount == 3 ? HomeboardPalette.success : HomeboardPalette.accent)
          }

          VStack(alignment: .leading, spacing: 11) {
            FinanceQuestionHeader(number: 1, title: "Which proof of income will you use?")
            Text("Choose the form you expect to submit. Always confirm that the property accepts it.")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
            ForEach(FinanceIncomeProofChoice.allCases) { choice in
              Button {
                proofChoice = choice
                if choice == .guarantor { guarantorChoice = true }
              } label: {
                FinanceReadinessChoiceRow(
                  icon: choice.icon,
                  title: choice.title,
                  detail: choice.detail,
                  selected: proofChoice == choice
                )
              }
              .buttonStyle(HomeboardAreaButtonStyle())
            }
          }
          .padding(16)
          .financeSurface(cornerRadius: 20)

          if let proofChoice {
            HStack(alignment: .top, spacing: 11) {
              Image(systemName: "lightbulb.fill")
                .foregroundStyle(HomeboardPalette.accent)
                .frame(width: 24)
              VStack(alignment: .leading, spacing: 3) {
                Text("What to prepare")
                  .font(.subheadline.weight(.bold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                Text(proofChoice.guidance)
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
            .padding(15)
            .background(HomeboardPalette.accent.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
          }

          VStack(alignment: .leading, spacing: 11) {
            FinanceQuestionHeader(number: 2, title: "Did you get the document ready?")
            ForEach(FinanceDocumentStatus.allCases) { status in
              Button {
                documentStatus = status
              } label: {
                FinanceReadinessChoiceRow(
                  icon: status.icon,
                  title: status.title,
                  detail: status.detail,
                  selected: documentStatus == status
                )
              }
              .buttonStyle(HomeboardAreaButtonStyle())
            }
          }
          .padding(16)
          .financeSurface(cornerRadius: 20)

          VStack(alignment: .leading, spacing: 11) {
            FinanceQuestionHeader(number: 3, title: "Will this application use a guarantor?")
            Text("A guarantor normally prepares a separate packet. Do not share their private documents in group chat.")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
            HStack(spacing: 10) {
              ForEach([true, false], id: \.self) { value in
                Button {
                  guarantorChoice = value
                } label: {
                  Label(value ? "Yes" : "No", systemImage: guarantorChoice == value ? "checkmark.circle.fill" : "circle")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(guarantorChoice == value ? HomeboardPalette.buttonText : HomeboardPalette.primaryText)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(guarantorChoice == value ? HomeboardPalette.accent : Color.white.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(HomeboardAreaButtonStyle())
              }
            }
          }
          .padding(16)
          .financeSurface(cornerRadius: 20)

          VStack(alignment: .leading, spacing: 10) {
            FinanceSectionTitle(title: "Before you submit", trailing: "Verify, don’t upload here")
            FinancePrepReminder(text: "Government-issued ID is current and readable")
            FinancePrepReminder(text: "The property accepts the income form you selected")
            FinancePrepReminder(text: "Every roommate uses the same move-in date and contact details")
            FinancePrepReminder(text: "Application fee and deposit instructions came from a verified source")
          }
          .padding(16)
          .financeSurface(cornerRadius: 20)

          Button {
            save()
          } label: {
            HStack {
              if isSaving { ProgressView().tint(HomeboardPalette.buttonText) }
              Text(isSaving ? "Saving…" : "Save my preparation plan")
            }
            .font(.headline)
            .foregroundStyle(HomeboardPalette.buttonText)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(HomeboardPalette.accentGradient)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
          .disabled(!canSave)
          .opacity(canSave ? 1 : 0.5)
        }
        .padding(18)
      }
      .background(WorkspaceBackgroundView())
      .navigationTitle("Application prep")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } } }
      .onAppear {
        let readiness = appModel.profile.readiness
        if proofChoice == nil {
          if let stored = readiness.incomeProofType.flatMap(FinanceIncomeProofChoice.init(rawValue:)) {
            proofChoice = stored
          } else if readiness.needsGuarantor {
            proofChoice = .guarantor
          } else if readiness.hasOfferLetter {
            proofChoice = .employmentLetter
          } else if readiness.hasProofOfIncome {
            proofChoice = .payStubs
          }
        }
        if documentStatus == nil {
          documentStatus = readiness.documentStatus.flatMap(FinanceDocumentStatus.init(rawValue:))
          if documentStatus == nil, readiness.hasProofOfIncome { documentStatus = .ready }
        }
        if guarantorChoice == nil {
          guarantorChoice = readiness.usesGuarantor
          if guarantorChoice == nil, readiness.hasProofOfIncome || readiness.hasOfferLetter || readiness.needsGuarantor {
            guarantorChoice = readiness.needsGuarantor
          }
        }
      }
    }
  }

  private func save() {
    guard let proofChoice, let documentStatus, let guarantorChoice, canSave else { return }
    isSaving = true
    let documentIsReady = documentStatus == .ready && proofChoice != .unsure
    appModel.profile.readiness.hasProofOfIncome = documentIsReady
    appModel.profile.readiness.hasOfferLetter = documentIsReady && proofChoice == .employmentLetter
    appModel.profile.readiness.needsGuarantor = guarantorChoice
    appModel.profile.readiness.incomeProofType = proofChoice.rawValue
    appModel.profile.readiness.documentStatus = documentStatus.rawValue
    appModel.profile.readiness.usesGuarantor = guarantorChoice
    Task {
      await appModel.saveBoardBrief()
      isSaving = false
      if appModel.boardError == nil { dismiss() }
    }
  }
}

private enum FinanceIncomeProofChoice: String, CaseIterable, Identifiable {
  case payStubs = "pay_stubs"
  case employmentLetter = "employment_letter"
  case taxReturns = "tax_returns"
  case bankStatements = "bank_statements"
  case guarantor
  case unsure

  var id: String { rawValue }

  var title: String {
    switch self {
    case .payStubs: "Recent pay stubs"
    case .employmentLetter: "Employment or offer letter"
    case .taxReturns: "Tax returns or 1099s"
    case .bankStatements: "Bank or asset statements"
    case .guarantor: "Guarantor’s financial packet"
    case .unsure: "I’m not sure yet"
    }
  }

  var detail: String {
    switch self {
    case .payStubs: "Often the most direct proof for current employment"
    case .employmentLetter: "Useful for a new job or income not shown on pay stubs yet"
    case .taxReturns: "Common for freelance or self-employed income"
    case .bankStatements: "Sometimes accepted for savings or liquid assets"
    case .guarantor: "A separate person supports the application financially"
    case .unsure: "Ask the leasing contact before collecting sensitive files"
    }
  }

  var icon: String {
    switch self {
    case .payStubs: "doc.text.fill"
    case .employmentLetter: "briefcase.fill"
    case .taxReturns: "doc.plaintext.fill"
    case .bankStatements: "building.columns.fill"
    case .guarantor: "person.badge.shield.checkmark.fill"
    case .unsure: "questionmark.circle.fill"
    }
  }

  var guidance: String {
    switch self {
    case .payStubs:
      "Gather the most recent two or three pay stubs. Check your name, employer, pay period, and year-to-date income; export a clean PDF if possible."
    case .employmentLetter:
      "Use a signed offer or employment verification letter showing your name, employer, compensation or start date, and a contact the property can verify."
    case .taxReturns:
      "Prepare the latest filed return or requested 1099s. Ask which pages are required and redact full Social Security numbers when permitted."
    case .bankStatements:
      "Ask how many months are required and whether screenshots are accepted. Hide full account numbers when the property permits redaction."
    case .guarantor:
      "Ask the property for its guarantor criteria, then gather the guarantor’s ID and accepted income or asset proof through a private channel."
    case .unsure:
      "Message the verified leasing contact: “Which income documents do you accept, how recent must they be, and do you accept guarantors?”"
    }
  }
}

private enum FinanceDocumentStatus: String, CaseIterable, Identifiable {
  case ready
  case canRequest = "can_request"
  case notStarted = "not_started"

  var id: String { rawValue }

  var title: String {
    switch self {
    case .ready: "Yes, current and ready to send"
    case .canRequest: "I know where to get it"
    case .notStarted: "Not yet"
    }
  }

  var detail: String {
    switch self {
    case .ready: "Readable file, correct name, and recent enough for the property"
    case .canRequest: "Download it or request it before the group applies"
    case .notStarted: "Make this the next preparation task"
    }
  }

  var icon: String {
    switch self {
    case .ready: "checkmark.circle.fill"
    case .canRequest: "arrow.down.doc.fill"
    case .notStarted: "clock.fill"
    }
  }
}

private struct FinancePageHeader: View {
  let showsBackButton: Bool
  let onBack: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 7) {
        Text("MONEY TO MOVE")
          .font(.caption2.weight(.bold))
          .tracking(1.6)
          .foregroundStyle(HomeboardPalette.accent)
        Text("Finance")
          .font(.system(size: 29, weight: .bold, design: .serif))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text("Know what a home requires, prepare a strong application, and keep every shared payment accountable.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 4)
      if showsBackButton {
        Button(action: onBack) {
          Image(systemName: "chevron.left")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
            .frame(width: 40, height: 40)
            .background(Color.white.opacity(0.06))
            .clipShape(Circle())
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .accessibilityLabel("Back to Group")
      }
    }
  }
}

private struct FinanceMetricTile: View {
  let label: String
  let value: String
  let tint: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label.uppercased())
        .font(.system(size: 9, weight: .bold))
        .tracking(0.9)
        .foregroundStyle(HomeboardPalette.tertiaryText)
      Text(value)
        .font(.headline.weight(.bold))
        .foregroundStyle(tint)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }
    .padding(13)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.white.opacity(0.06))
    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
  }
}

private struct FinanceSectionTitle: View {
  let title: String
  let trailing: String?

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)
      Spacer()
      if let trailing {
        Text(trailing)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
    }
  }
}

private struct FinanceCostRow: View {
  let icon: String
  let title: String
  let detail: String
  let amount: String
  let verified: Bool

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      Image(systemName: icon)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(verified ? HomeboardPalette.success : HomeboardPalette.accentSecondary)
        .frame(width: 34, height: 34)
        .background((verified ? HomeboardPalette.success : HomeboardPalette.accentSecondary).opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text(detail)
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .lineLimit(2)
      }
      Spacer(minLength: 8)
      Text(amount)
        .font(.subheadline.weight(.bold))
        .foregroundStyle(HomeboardPalette.primaryText)
        .multilineTextAlignment(.trailing)
    }
  }
}

private struct FinanceListingOption: Identifiable {
  let listing: ListingPreview
  let monthlyCost: Int?
  let bedrooms: Double?
  let squareFeet: Int?
  let memberCount: Int
  let budgetPriority: Int

  var id: String { listing.id }

  var bedroomLabel: String {
    guard let bedrooms else { return "Beds unknown" }
    let value = bedrooms.rounded() == bedrooms ? String(Int(bedrooms)) : bedrooms.formatted(.number.precision(.fractionLength(1)))
    return "\(value) bd"
  }

  var spaceLabel: String {
    squareFeet.map { "\($0.formatted()) sq ft" } ?? "Size unknown"
  }

  var costPerBedroom: Int? {
    guard let monthlyCost, let bedrooms, bedrooms > 0 else { return nil }
    return Int((Double(monthlyCost) / bedrooms).rounded())
  }

  var equalShareEstimate: Int? {
    guard let monthlyCost, memberCount > 0 else { return nil }
    return Int(ceil(Double(monthlyCost) / Double(memberCount)))
  }

  var spacePerHundredDollars: Int? {
    guard let monthlyCost, monthlyCost > 0, let squareFeet else { return nil }
    return Int((Double(squareFeet) / Double(monthlyCost) * 100).rounded())
  }

  var budgetLabel: String {
    switch listing.rentSplit?.status {
    case "ready": "Comfortable budget fit"
    case "stretch": "Uses stretch budget"
    case "over_budget": "Above group range"
    default: "Budget details incomplete"
    }
  }

  var bedroomFitLabel: String {
    guard let bedrooms else { return "Add bedrooms to compare room fit" }
    return bedrooms >= Double(memberCount)
      ? "At least one bedroom per roommate"
      : "\(bedroomLabel) for \(memberCount) roommates"
  }

  var valueDetail: String {
    var parts: [String] = []
    if let costPerBedroom { parts.append("\(FinanceMath.dollars(costPerBedroom)) per bedroom") }
    if let spacePerHundredDollars { parts.append("\(spacePerHundredDollars) sq ft per $100 rent") }
    return parts.isEmpty ? "Add bedroom and square-foot details for a sharper comparison" : parts.joined(separator: " · ")
  }
}

private struct FinanceListingOptionRow: View {
  let option: FinanceListingOption
  let rank: Int
  let isSelected: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Text("#\(rank)")
        .font(.caption.weight(.bold))
        .foregroundStyle(rank == 1 ? HomeboardPalette.buttonText : HomeboardPalette.accent)
        .frame(width: 35, height: 35)
        .background(rank == 1 ? HomeboardPalette.accent : HomeboardPalette.accent.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

      VStack(alignment: .leading, spacing: 6) {
        HStack(alignment: .firstTextBaseline) {
          Text(option.listing.title)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
            .lineLimit(1)
          Spacer(minLength: 8)
          Text(option.monthlyCost.map(FinanceMath.dollars) ?? "Rent unknown")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.accent)
        }

        Text([option.bedroomLabel, option.spaceLabel].joined(separator: " · "))
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)

        HStack(spacing: 6) {
          FinanceComparisonPill(text: option.budgetLabel, positive: option.budgetPriority == 0)
          if let share = option.equalShareEstimate {
            FinanceComparisonPill(text: "~\(FinanceMath.dollars(share)) each", positive: false)
          }
        }

        Text("\(option.bedroomFitLabel) · \(option.valueDetail)")
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }

      Image(systemName: isSelected ? "checkmark.circle.fill" : "chevron.right")
        .font(.caption.weight(.bold))
        .foregroundStyle(isSelected ? HomeboardPalette.success : HomeboardPalette.accent)
        .padding(.top, 4)
    }
    .padding(13)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(isSelected ? HomeboardPalette.accent.opacity(0.09) : Color.white.opacity(0.035))
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(isSelected ? HomeboardPalette.accent.opacity(0.45) : HomeboardPalette.border.opacity(0.55), lineWidth: 1)
    }
  }
}

private struct FinanceComparisonPill: View {
  let text: String
  let positive: Bool

  var body: some View {
    Text(text)
      .font(.system(size: 9, weight: .bold))
      .foregroundStyle(positive ? HomeboardPalette.success : HomeboardPalette.secondaryText)
      .lineLimit(1)
      .minimumScaleFactor(0.75)
      .padding(.horizontal, 7)
      .padding(.vertical, 5)
      .background((positive ? HomeboardPalette.success : HomeboardPalette.secondaryText).opacity(0.10))
      .clipShape(Capsule())
  }
}

private struct FinanceExpenseRow: View {
  let expense: BoardExpense

  var body: some View {
    HStack(spacing: 11) {
      Image(systemName: FinanceExpenseCategory(rawValue: expense.category)?.icon ?? "dollarsign")
        .font(.caption.weight(.bold))
        .foregroundStyle(HomeboardPalette.accent)
        .frame(width: 34, height: 34)
        .background(HomeboardPalette.accent.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text(expense.description)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .lineLimit(1)
        Text([
          "\(expense.paidByName) paid",
          expense.listingName ?? "General",
          "\(expense.splitNames?.count ?? 0) sharing",
        ].joined(separator: " · "))
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .lineLimit(1)
      }
      Spacer()
      Text(FinanceMath.money(expense.amountCents))
        .font(.subheadline.weight(.bold))
        .foregroundStyle(HomeboardPalette.primaryText)
    }
  }
}

private struct FinanceSelectionRow: View {
  let icon: String
  let title: String
  let detail: String

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: icon)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.accent)
        .frame(width: 36, height: 36)
        .background(HomeboardPalette.accent.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text(detail)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }
      Spacer()
      Image(systemName: "chevron.up.chevron.down")
        .font(.caption.weight(.bold))
        .foregroundStyle(HomeboardPalette.accent)
    }
    .padding(13)
    .financeSurface(cornerRadius: 15)
  }
}

private struct FinanceQuestionHeader: View {
  let number: Int
  let title: String

  var body: some View {
    HStack(spacing: 10) {
      Text("\(number)")
        .font(.caption.weight(.heavy))
        .foregroundStyle(HomeboardPalette.buttonText)
        .frame(width: 28, height: 28)
        .background(HomeboardPalette.accent)
        .clipShape(Circle())
      Text(title)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)
    }
  }
}

private struct FinanceReadinessChoiceRow: View {
  let icon: String
  let title: String
  let detail: String
  let selected: Bool

  var body: some View {
    HStack(spacing: 11) {
      Image(systemName: icon)
        .foregroundStyle(selected ? HomeboardPalette.buttonText : HomeboardPalette.accent)
        .frame(width: 34, height: 34)
        .background(selected ? HomeboardPalette.accent : HomeboardPalette.accent.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text(detail)
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 6)
      Image(systemName: selected ? "checkmark.circle.fill" : "circle")
        .foregroundStyle(selected ? HomeboardPalette.success : HomeboardPalette.tertiaryText)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(selected ? HomeboardPalette.accent.opacity(0.08) : Color.white.opacity(0.035))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(selected ? HomeboardPalette.accent.opacity(0.45) : HomeboardPalette.border.opacity(0.55), lineWidth: 1)
    }
  }
}

private struct FinancePrepReminder: View {
  let text: String

  var body: some View {
    HStack(alignment: .top, spacing: 9) {
      Image(systemName: "checkmark.circle")
        .font(.caption.weight(.bold))
        .foregroundStyle(HomeboardPalette.success)
        .padding(.top, 2)
      Text(text)
        .font(.caption)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct FinanceDivider: View {
  var body: some View {
    Rectangle()
      .fill(HomeboardPalette.border.opacity(0.55))
      .frame(height: 1)
  }
}

private struct FinancePerson: Identifiable {
  let id: String
  let name: String
}

private enum FinanceExpenseCategory: String, CaseIterable, Identifiable {
  case applicationFee = "application_fee"
  case holdingDeposit = "holding_deposit"
  case securityDeposit = "security_deposit"
  case firstMonthRent = "first_month_rent"
  case lastMonthRent = "last_month_rent"
  case brokerFee = "broker_fee"
  case moveInFee = "move_in_fee"
  case rentersInsurance = "renters_insurance"
  case utilityDeposit = "utility_deposit"
  case tour
  case moving
  case other

  var id: String { rawValue }

  var shortTitle: String {
    switch self {
    case .applicationFee: "Application"
    case .holdingDeposit: "Holding deposit"
    case .securityDeposit: "Security deposit"
    case .firstMonthRent: "First month"
    case .lastMonthRent: "Last month"
    case .brokerFee: "Broker fee"
    case .moveInFee: "Move-in fee"
    case .rentersInsurance: "Insurance"
    case .utilityDeposit: "Utilities"
    case .tour: "Tour cost"
    case .moving: "Moving"
    case .other: "Other"
    }
  }

  var defaultNote: String {
    switch self {
    case .applicationFee: "Application fee"
    case .holdingDeposit: "Holding deposit"
    case .securityDeposit: "Security deposit"
    case .firstMonthRent: "First month’s rent"
    case .lastMonthRent: "Last month’s rent"
    case .brokerFee: "Broker or leasing fee"
    case .moveInFee: "Building move-in fee"
    case .rentersInsurance: "Renters insurance"
    case .utilityDeposit: "Utility deposit"
    case .tour: "Shared tour cost"
    case .moving: "Moving cost"
    case .other: "Shared payment"
    }
  }

  var icon: String {
    switch self {
    case .applicationFee: "doc.text.fill"
    case .holdingDeposit: "pause.circle.fill"
    case .securityDeposit: "lock.shield.fill"
    case .firstMonthRent: "calendar.badge.checkmark"
    case .lastMonthRent: "calendar.badge.clock"
    case .brokerFee: "person.crop.circle.badge.checkmark"
    case .moveInFee: "building.fill"
    case .rentersInsurance: "umbrella.fill"
    case .utilityDeposit: "bolt.fill"
    case .tour: "car.fill"
    case .moving: "shippingbox.fill"
    case .other: "ellipsis.circle.fill"
    }
  }
}

private enum FinanceMath {
  static func rankFinancialOptions(
    _ listings: [ListingPreview],
    memberCount: Int
  ) -> [FinanceListingOption] {
    listings.map { listing in
      FinanceListingOption(
        listing: listing,
        monthlyCost: listing.trueMonthlyCost?.knownMonthlyTotal
          ?? listing.trueMonthlyCost?.listedRent
          ?? firstAmount(in: listing.priceLine),
        bedrooms: Double(listing.bedrooms),
        squareFeet: listing.squareFeet,
        memberCount: memberCount,
        budgetPriority: budgetPriority(listing.rentSplit?.status)
      )
    }
    .sorted { left, right in
      if left.budgetPriority != right.budgetPriority {
        return left.budgetPriority < right.budgetPriority
      }

      switch (left.costPerBedroom, right.costPerBedroom) {
      case let (leftCost?, rightCost?) where leftCost != rightCost:
        return leftCost < rightCost
      case (_?, nil):
        return true
      case (nil, _?):
        return false
      default:
        break
      }

      switch (left.spacePerHundredDollars, right.spacePerHundredDollars) {
      case let (leftValue?, rightValue?) where leftValue != rightValue:
        return leftValue > rightValue
      case (_?, nil):
        return true
      case (nil, _?):
        return false
      default:
        break
      }

      switch (left.monthlyCost, right.monthlyCost) {
      case let (leftCost?, rightCost?) where leftCost != rightCost:
        return leftCost < rightCost
      case (_?, nil):
        return true
      case (nil, _?):
        return false
      default:
        return left.listing.title < right.listing.title
      }
    }
  }

  private static func budgetPriority(_ status: String?) -> Int {
    switch status {
    case "ready": 0
    case "stretch": 1
    case nil, "incomplete": 2
    case "over_budget": 3
    default: 2
    }
  }

  static func money(_ cents: Int) -> String {
    (Double(cents) / 100).formatted(.currency(code: "USD"))
  }

  static func dollars(_ amount: Int) -> String {
    Double(amount).formatted(.currency(code: "USD").precision(.fractionLength(0)))
  }

  static func signedDollars(_ amount: Int) -> String {
    amount < 0 ? "−\(dollars(abs(amount)))" : dollars(amount)
  }

  static func firstAmount(in text: String) -> Int? {
    guard let match = text.range(of: #"[0-9][0-9,]*"#, options: .regularExpression) else { return nil }
    return Int(text[match].replacingOccurrences(of: ",", with: ""))
  }

}

private extension View {
  func financeSurface(cornerRadius: CGFloat) -> some View {
    background(
      RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .fill(HomeboardPalette.surface.opacity(0.98))
    )
    .overlay {
      RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
  }
}
