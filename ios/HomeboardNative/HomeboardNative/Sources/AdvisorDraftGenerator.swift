import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

struct AdvisorDraftGeneration {
  var text: String
  var source: String
}

enum AdvisorDraftGenerator {
  static func generate(
    payload: AdvisorMessagePayload,
    tone: String,
    toggles: [AdvisorToggleOption],
    financialSentence: String?,
    senderName: String
  ) async -> AdvisorDraftGeneration {
    let includedFinancialSentence = financialToggleEnabled(toggles) ? financialSentence : nil
    let fallback = templateDraft(
      payload: payload,
      tone: tone,
      toggles: toggles,
      financialSentence: includedFinancialSentence,
      senderName: senderName
    )

    #if canImport(FoundationModels)
    if #available(iOS 26.0, *),
       SystemLanguageModel.default.isAvailable,
       let generated = await generateWithAppleIntelligence(
         payload: payload,
         tone: tone,
         toggles: toggles,
         financialSentence: includedFinancialSentence,
         senderName: senderName
       ) {
      return AdvisorDraftGeneration(text: generated, source: "apple_intelligence")
    }
    #endif

    return AdvisorDraftGeneration(text: fallback, source: "device_template")
  }

  static func financialSentence(
    mode: String,
    group _: AdvisorGroupFinancialStatus?
  ) -> String? {
    switch mode {
    case "omit":
      return nil
    case "combined_range":
      return "Financial information is available on request."
    default:
      return "Financial information is available on request."
    }
  }

  private static func templateDraft(
    payload: AdvisorMessagePayload,
    tone: String,
    toggles: [AdvisorToggleOption],
    financialSentence: String?,
    senderName: String
  ) -> String {
    let listing = targetListing(payload)
    let firstName = payload.contact?.agentName?
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .split(separator: " ")
      .first
      .map(String.init)
    let greeting = firstName.map { "Hi \($0)," } ?? "Hello,"
    let requirements = payload.context?.requirements
    let moveIn = enabled("Group requirements", toggles: toggles)
      ? requirements?.moveIn?.trimmingCharacters(in: .whitespacesAndNewlines)
      : nil
    let moveSentence = moveIn.flatMap { $0.isEmpty ? nil : "We are targeting \($0)." }
    let commute = enabled("Commute fit", toggles: toggles)
      ? requirements?.commuteDestinations?.first
      : nil
    let commuteSentence = commute.map { "The location also works well for our commute to \($0)." }
    let finance = financialToggleEnabled(toggles) ? financialSentence : nil
    let tour = enabled("Request a tour", toggles: toggles)
      ? "Could you confirm availability and the next opportunity to tour?"
      : "Could you confirm current availability?"
    let facts = [moveSentence, commuteSentence, finance].compactMap { $0 }.joined(separator: " ")
    let isFollowUp = payload.originalCommand?
      .range(of: #"follow[ -]?up"#, options: [.regularExpression, .caseInsensitive]) != nil

    switch tone {
    case "Casual":
      return [
        greeting,
        isFollowUp ? "Checking back on my earlier message about \(listing)." : "Checking in about \(listing).",
        facts,
        tour,
        "Thanks, \(senderName)",
      ]
        .filter { !$0.isEmpty }
        .joined(separator: " ")
    case "Stern":
      return [
        greeting,
        "",
        isFollowUp
          ? "Following up on our earlier message, we need a current status on \(listing). \(facts)".trimmingCharacters(in: .whitespaces)
          : "We need a current status on \(listing). \(facts)".trimmingCharacters(in: .whitespaces),
        "",
        tour,
        "",
        senderName,
      ].joined(separator: "\n")
    case "Passive-Aggressive":
      return [
        greeting,
        "",
        isFollowUp
          ? "I am following up because our earlier message about \(listing) has not received a response. \(facts)".trimmingCharacters(in: .whitespaces)
          : "I am checking for a clear status on \(listing). \(facts)".trimmingCharacters(in: .whitespaces),
        "",
        "Please let us know whether it remains available so we can plan accordingly.",
        "",
        "Thank you,\n\(senderName)",
      ].joined(separator: "\n")
    default:
      return [
        greeting,
        "",
        isFollowUp
          ? "I am following up on my earlier message regarding \(listing). \(facts)".trimmingCharacters(in: .whitespaces)
          : "I am reaching out regarding \(listing). \(facts)".trimmingCharacters(in: .whitespaces),
        "",
        tour,
        "",
        "Best regards,\n\(senderName)",
      ].joined(separator: "\n")
    }
  }

  private static func targetListing(_ payload: AdvisorMessagePayload) -> String {
    payload.context?.leverage?.strongestListings?
      .first(where: { $0.boardListingId == payload.targetListingBoardId })?
      .listing
      ?? payload.context?.leverage?.strongestListings?.first?.listing
      ?? "the rental"
  }

  private static func enabled(_ label: String, toggles: [AdvisorToggleOption]) -> Bool {
    guard let option = toggles.first(where: {
      $0.label.caseInsensitiveCompare(label) == .orderedSame
    }) else { return false }
    return option.enabled
  }

  private static func financialToggleEnabled(_ toggles: [AdvisorToggleOption]) -> Bool {
    let financialOptions = toggles.filter {
      let label = $0.label.lowercased()
      return label.contains("financial") || label.contains("income") || label.contains("credit")
    }
    return financialOptions.isEmpty || financialOptions.contains(where: \.enabled)
  }

  private static func currency(_ value: Int) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.maximumFractionDigits = 0
    formatter.currencyCode = "USD"
    return formatter.string(from: NSNumber(value: value)) ?? "$\(value)"
  }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
private extension AdvisorDraftGenerator {
  static func generateWithAppleIntelligence(
    payload: AdvisorMessagePayload,
    tone: String,
    toggles: [AdvisorToggleOption],
    financialSentence: String?,
    senderName: String
  ) async -> String? {
    let session = LanguageModelSession(
      model: .default,
      instructions: """
      You draft concise rental outreach on the user's device.
      Use only facts in the bounded Homeboard context. Never invent availability,
      prior contact, financial strength, application readiness, or listing details.
      Write in the requested tone. Return only the recipient-facing message.
      Never output bracketed placeholders. Never ask the recipient to fill anything in.
      If an exact financial sentence is supplied, copy it verbatim. If none is supplied,
      do not mention income, credit, finances, or qualifications.
      """
    )
    let contextData = try? JSONEncoder().encode(payload.context)
    let context = contextData.flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    let enabledLabels = toggles.filter(\.enabled).map(\.label).joined(separator: ", ")
    let prompt = """
    USER REQUEST START
    \(payload.originalCommand ?? "Draft outreach for the selected rental.")
    USER REQUEST END

    Selected tone: \(tone)
    Included details: \(enabledLabels.isEmpty ? "none" : enabledLabels)
    Exact financial sentence: \(financialSentence ?? "NONE")
    Sender name: \(senderName)

    HOMEBOARD CONTEXT START
    \(String(context.prefix(12_000)))
    HOMEBOARD CONTEXT END
    """
    do {
      let response = try await session.respond(to: prompt)
      let draft = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !draft.isEmpty,
            draft.count <= 4_000,
            draft.range(of: #"\[(?:income|credit)[^\]]*\]"#, options: .regularExpression) == nil else {
        return nil
      }
      if let financialSentence, financialToggleEnabled(toggles), !draft.contains(financialSentence) {
        return nil
      }
      if financialSentence == nil,
         draft.range(of: #"\b(income|credit score|financial information)\b"#, options: [.regularExpression, .caseInsensitive]) != nil {
        return nil
      }
      return draft
    } catch {
      return nil
    }
  }
}
#endif
