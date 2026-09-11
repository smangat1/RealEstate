import SwiftUI
import Foundation

enum SharedOfferKind: Hashable, Codable, Sendable {
  case monthsFree(count: Double)
  case noBrokerFee
  case moveInCredit(amount: Int)
  case waivedDeposit
  case special(label: String)

  var baseBonusPoints: Int {
    switch self {
    case .monthsFree(let count):
      if count >= 3.0 { return 25 }
      if count >= 2.0 { return 18 }
      if count >= 1.5 { return 14 }
      if count >= 1.0 { return 10 }
      if count >= 0.5 { return 6 }
      return 4
    case .noBrokerFee:
      return 8
    case .moveInCredit(let amount):
      if amount >= 1500 { return 8 }
      if amount >= 500 { return 5 }
      return 3
    case .waivedDeposit:
      return 5
    case .special:
      return 6
    }
  }

  var label: String {
    switch self {
    case .monthsFree(let count):
      if count == 1.0 { return "1 Month Free" }
      if count == 0.5 { return "2 Weeks Free" }
      if count == count.rounded() {
        return "\(Int(count)) Months Free"
      }
      return "\(count) Months Free"
    case .noBrokerFee:
      return "No Broker Fee"
    case .moveInCredit(let amount):
      return "$\(amount.formatted()) Move-in Credit"
    case .waivedDeposit:
      return "Waived Deposit"
    case .special(let label):
      return label
    }
  }
}

struct SharedListingActiveOffer: Hashable, Codable, Sendable {
  let kinds: [SharedOfferKind]
  let bonusPoints: Int
  let title: String
  let badgeLabel: String
  let callout: String
  let rawEvidence: String

  init(kinds: [SharedOfferKind], rawEvidence: String) {
    self.kinds = kinds
    self.rawEvidence = rawEvidence

    let rawPoints = kinds.reduce(0) { $0 + $1.baseBonusPoints }
    self.bonusPoints = min(25, max(1, rawPoints))

    if kinds.count == 1, let first = kinds.first {
      switch first {
      case .monthsFree(let count):
        if count == 1.0 {
          self.title = "1 Month Free Special"
          self.badgeLabel = "1 Mo Free"
        } else if count == 0.5 {
          self.title = "2 Weeks Free Special"
          self.badgeLabel = "2 Wks Free"
        } else if count == count.rounded() {
          self.title = "\(Int(count)) Months Free Special"
          self.badgeLabel = "\(Int(count)) Mos Free"
        } else {
          self.title = "\(count) Months Free Special"
          self.badgeLabel = "\(count) Mos Free"
        }
      case .noBrokerFee:
        self.title = "No Broker Fee"
        self.badgeLabel = "No Fee"
      case .moveInCredit(let amount):
        self.title = "$\(amount.formatted()) Move-in Credit"
        self.badgeLabel = "$\(amount.formatted()) Credit"
      case .waivedDeposit:
        self.title = "Waived Security Deposit"
        self.badgeLabel = "No Deposit"
      case .special(let label):
        self.title = label.capitalized
        self.badgeLabel = "Special Offer"
      }
    } else if kinds.count > 1 {
      let labels = kinds.prefix(2).map(\.label)
      self.title = labels.joined(separator: " + ")
      self.badgeLabel = "Special Offer"
    } else {
      self.title = "Active Move-in Special"
      self.badgeLabel = "Special"
    }

    self.callout = "Active offer adds +\(self.bonusPoints) pts to Price score"
  }

  static func detect(
    highlights: [String],
    summary: String,
    fitLabel: String,
    priceLine: String,
    amenities: [String],
    title: String,
    modelInsights: [HomeboardListingInsight] = []
  ) -> SharedListingActiveOffer? {
    var detectedKinds: [SharedOfferKind] = []
    var matchedEvidence: [String] = []

    // Collect all candidate text sources
    var textSources: [String] = []
    textSources.append(contentsOf: highlights)
    if !summary.isEmpty { textSources.append(summary) }
    if !fitLabel.isEmpty { textSources.append(fitLabel) }
    if !priceLine.isEmpty { textSources.append(priceLine) }
    textSources.append(contentsOf: amenities)
    if !title.isEmpty { textSources.append(title) }
    for insight in modelInsights {
      if !insight.label.isEmpty { textSources.append(insight.label) }
      if !insight.evidence.isEmpty { textSources.append(insight.evidence) }
    }

    // 1. Check for months free
    var foundMonthsFree = false
    for text in textSources {
      if foundMonthsFree { break }

      if text.range(of: #"(?i)first\s*month(?:\s*is)?\s*free"#, options: .regularExpression) != nil ||
         text.range(of: #"(?i)free\s*month"#, options: .regularExpression) != nil {
        detectedKinds.append(.monthsFree(count: 1.0))
        matchedEvidence.append(text)
        foundMonthsFree = true
        break
      }

      if let range = text.range(of: #"(?i)(\d+(?:\.\d+)?|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bhalf\b)\s*(?:month|mo)s?\s*(?:free|off|concession|rent\s*free)"#, options: .regularExpression) {
        let matchStr = String(text[range]).lowercased()
        let count: Double
        if matchStr.contains("half") {
          count = 0.5
        } else if matchStr.contains("one") {
          count = 1.0
        } else if matchStr.contains("two") {
          count = 2.0
        } else if matchStr.contains("three") {
          count = 3.0
        } else if matchStr.contains("four") {
          count = 4.0
        } else if let num = extractFirstDouble(from: matchStr) {
          count = num
        } else {
          count = 1.0
        }
        detectedKinds.append(.monthsFree(count: count))
        matchedEvidence.append(text)
        foundMonthsFree = true
        break
      }

      if let range = text.range(of: #"(?i)(\d+)\s*(?:weeks?|wks?)\s*free"#, options: .regularExpression) {
        let matchStr = String(text[range]).lowercased()
        if let weeks = extractFirstDouble(from: matchStr) {
          let count = weeks / 4.0
          detectedKinds.append(.monthsFree(count: count))
          matchedEvidence.append(text)
          foundMonthsFree = true
          break
        }
      }
    }

    // 2. No broker fee
    let noFeeRegex = #"(?i)\b(?:no\s*fee|no\s*broker\s*fee|zero\s*broker\s*fee|fee\s*waived|waived\s*fee|owner\s*pays\s*(?:the\s*)?fee|op\s*fee|no\s*brokerage\s*fee)\b"#
    for text in textSources {
      if text.range(of: noFeeRegex, options: .regularExpression) != nil {
        detectedKinds.append(.noBrokerFee)
        matchedEvidence.append(text)
        break
      }
    }

    // 3. Move-in cash credit
    let creditRegex = #"(?i)(?:\$|usd\s*)(\d[\d,]*)\s*(?:off|credit|move-in\s*bonus|signing\s*bonus|welcome\s*credit|cash\s*concession|gift\s*card)"#
    for text in textSources {
      if let range = text.range(of: creditRegex, options: .regularExpression) {
        let matchStr = String(text[range])
        if let amount = extractFirstInt(from: matchStr) {
          detectedKinds.append(.moveInCredit(amount: amount))
          matchedEvidence.append(text)
          break
        }
      }
    }

    // 4. Waived deposit
    let depositRegex = #"(?i)\b(?:no\s*deposit|zero\s*deposit|waived\s*deposit|deposit\s*waived|deposit\s*free|0\s*deposit|\$0\s*deposit)\b"#
    for text in textSources {
      if text.range(of: depositRegex, options: .regularExpression) != nil {
        detectedKinds.append(.waivedDeposit)
        matchedEvidence.append(text)
        break
      }
    }

    // 5. General special if nothing else matched
    if detectedKinds.isEmpty {
      let specialRegex = #"(?i)\b(?:move-in\s*special|limited\s*time\s*offer|special\s*promotion|concession\s*available|signing\s*incentive|special\s*offer)\b"#
      for text in textSources {
        if text.range(of: specialRegex, options: .regularExpression) != nil {
          detectedKinds.append(.special(label: "Move-in Special"))
          matchedEvidence.append(text)
          break
        }
      }
    }

    guard !detectedKinds.isEmpty else { return nil }
    return SharedListingActiveOffer(kinds: detectedKinds, rawEvidence: matchedEvidence.first ?? "")
  }

  private static func extractFirstDouble(from text: String) -> Double? {
    let pattern = #"\d+(?:\.\d+)?"#
    guard let range = text.range(of: pattern, options: .regularExpression) else { return nil }
    return Double(text[range])
  }

  private static func extractFirstInt(from text: String) -> Int? {
    let clean = text.replacingOccurrences(of: ",", with: "")
    let pattern = #"\d+"#
    guard let range = clean.range(of: pattern, options: .regularExpression) else { return nil }
    return Int(clean[range])
  }
}

struct SharedActiveOfferBanner: View {
  let offer: SharedListingActiveOffer
  var compact: Bool = false

  var body: some View {
    if compact {
      compactView
    } else {
      fullView
    }
  }

  private var fullView: some View {
    HStack(alignment: .center, spacing: 14) {
      ZStack {
        Circle()
          .fill(Color(red: 0.98, green: 0.72, blue: 0.42).opacity(0.18))
          .frame(width: 44, height: 44)

        Image(systemName: "tag.fill")
          .font(.system(size: 20, weight: .bold))
          .foregroundStyle(Color(red: 0.99, green: 0.76, blue: 0.45))
      }

      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 8) {
          Text(offer.title)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)

          Text("+\(offer.bonusPoints) pts Price")
            .font(.caption2.weight(.bold))
            .foregroundStyle(Color(red: 0.16, green: 0.28, blue: 0.22))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Color(red: 0.98, green: 0.78, blue: 0.48))
            .clipShape(Capsule())
        }

        Text(offer.callout)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }

      Spacer(minLength: 0)
    }
    .padding(14)
    .background(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(Color(red: 0.98, green: 0.72, blue: 0.42).opacity(0.10))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(Color(red: 0.98, green: 0.72, blue: 0.42).opacity(0.32), lineWidth: 1)
    )
  }

  private var compactView: some View {
    HStack(spacing: 6) {
      Image(systemName: "tag.fill")
        .font(.system(size: 10, weight: .bold))
        .foregroundStyle(Color(red: 0.99, green: 0.76, blue: 0.45))

      Text(offer.title)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)
        .lineLimit(1)

      Spacer(minLength: 0)

      Text("+\(offer.bonusPoints) pts")
        .font(.system(size: 10, weight: .bold))
        .foregroundStyle(Color(red: 0.16, green: 0.28, blue: 0.22))
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Color(red: 0.98, green: 0.78, blue: 0.48))
        .clipShape(Capsule())
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(Color(red: 0.98, green: 0.72, blue: 0.42).opacity(0.12))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .stroke(Color(red: 0.98, green: 0.72, blue: 0.42).opacity(0.28), lineWidth: 1)
    )
  }
}
