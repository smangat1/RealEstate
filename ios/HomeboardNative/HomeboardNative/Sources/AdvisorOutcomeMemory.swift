import Foundation

enum AdvisorDraftOutcome: String, Codable, CaseIterable {
  case accepted
  case sent
  case replied
  case stale
  case rejected
  case revised
}

struct AdvisorDraftOutcomeRecord: Codable, Hashable {
  var userId: String
  var boardId: String
  var listingId: String?
  var messageId: String
  var templateId: String
  var tone: String
  var outcome: AdvisorDraftOutcome
  var outreachId: String? = nil
  var reasonCode: String?
  var timestamp: Date
}

struct AdvisorMemorySelection: Equatable {
  var tone: String
  var templateId: String
  var reason: String?
  var promptSummary: String?
  var sampleCount: Int
}

/// Separate, versioned and fail-soft storage for non-sensitive draft metadata.
/// Draft text, broker messages, screenshots and financial values are never stored here.
final class AdvisorOutcomeMemory {
  private struct Envelope: Codable {
    var schemaVersion: Int
    var records: [AdvisorDraftOutcomeRecord]
  }

  static let shared = AdvisorOutcomeMemory()
  static let minimumSamples = 3
  static let standardTemplate = "availability_standard"
  static let conciseTemplate = "availability_concise"

  private let defaults: UserDefaults
  private let key: String
  private let maximumRecords = 240
  private let maximumRecordsPerBoard = 120

  init(defaults: UserDefaults = .standard, key: String = "homeboard.native.advisor-outcome-memory.v1") {
    self.defaults = defaults
    self.key = key
  }

  func record(_ record: AdvisorDraftOutcomeRecord) {
    var records = load()
    records.removeAll(where: {
      $0.userId == record.userId && $0.boardId == record.boardId && $0.messageId == record.messageId
        && $0.outcome == record.outcome && $0.tone == record.tone
        && $0.templateId == record.templateId
    })
    records.append(record)
    records.sort { $0.timestamp > $1.timestamp }
    var perBoard: [String: Int] = [:]
    records = records.filter { item in
      let scope = "\(item.userId):\(item.boardId)"
      let count = perBoard[scope, default: 0]
      guard count < maximumRecordsPerBoard else { return false }
      perBoard[scope] = count + 1
      return true
    }
    persist(Array(records.prefix(maximumRecords)))
  }

  func records(userId: String, boardId: String) -> [AdvisorDraftOutcomeRecord] {
    load().filter { $0.userId == userId && $0.boardId == boardId }
  }

  func clear(userId: String? = nil, boardId: String? = nil) {
    guard userId != nil || boardId != nil else {
      defaults.removeObject(forKey: key)
      return
    }
    persist(load().filter { record in
      if let userId, record.userId != userId { return true }
      if let boardId, record.boardId != boardId { return true }
      return false
    })
  }

  func recordDerivedOutcome(
    userId: String,
    boardId: String,
    listingId: String,
    outreachId: String,
    advisorMessageId: String?,
    outcome: AdvisorDraftOutcome,
    at timestamp: Date = Date()
  ) {
    let sentRecords = records(userId: userId, boardId: boardId).filter {
      $0.listingId == listingId && $0.outcome == .sent
    }
    let source = sentRecords.first(where: { $0.outreachId == outreachId })
      ?? advisorMessageId.flatMap { messageId in
        sentRecords.first(where: { $0.messageId == messageId })
      }
    guard let source else { return }
    record(AdvisorDraftOutcomeRecord(
      userId: userId,
      boardId: boardId,
      listingId: listingId,
      messageId: source.messageId,
      templateId: source.templateId,
      tone: source.tone,
      outcome: outcome,
      outreachId: outreachId,
      reasonCode: nil,
      timestamp: timestamp
    ))
  }

  func selection(
    userId: String,
    boardId: String,
    listingId: String?,
    fallbackTone: String,
    explicitTone: String?,
    boardFeedback: AdvisorFeedbackMemorySummary?
  ) -> AdvisorMemorySelection {
    let boardRecords = records(userId: userId, boardId: boardId)
    let listingRecords = listingId.map { id in boardRecords.filter { $0.listingId == id } } ?? []
    let uniqueSamples: ([AdvisorDraftOutcomeRecord]) -> Int = { Set($0.map(\.messageId)).count }
    let relevant = uniqueSamples(listingRecords) >= Self.minimumSamples ? listingRecords : boardRecords
    let localSampleCount = uniqueSamples(relevant)
    let fallback = AdvisorMemorySelection(
      tone: explicitTone ?? fallbackTone,
      templateId: Self.standardTemplate,
      reason: nil,
      promptSummary: nil,
      sampleCount: localSampleCount
    )
    let aggregateCount = boardFeedback?.sampleSize ?? 0
    guard localSampleCount + aggregateCount >= Self.minimumSamples else { return fallback }

    var latestByVariant: [String: AdvisorDraftOutcomeRecord] = [:]
    for record in relevant {
      let key = "\(record.messageId):\(record.tone):\(record.templateId)"
      if latestByVariant[key].map({ $0.timestamp < record.timestamp }) ?? true {
        latestByVariant[key] = record
      }
    }
    let scoredRecords = Array(latestByVariant.values)

    let allowedTones = ["Professional", "Casual", "Stern", "Passive-Aggressive"]
    let allowedTemplates = [Self.standardTemplate, Self.conciseTemplate]
    var toneScores = Dictionary(uniqueKeysWithValues: allowedTones.map { ($0, 0) })
    var templateScores = Dictionary(uniqueKeysWithValues: allowedTemplates.map { ($0, 0) })
    var sentMessageIDs = Dictionary(uniqueKeysWithValues: allowedTones.map { ($0, Set<String>()) })
    for record in scoredRecords {
      let score: Int
      switch record.outcome {
      case .accepted: score = 1
      case .sent: score = 3
      case .replied: score = 6
      case .stale: score = -3
      case .rejected: score = -5
      case .revised: score = -2
      }
      toneScores[record.tone, default: 0] += score
      templateScores[record.templateId, default: 0] += score
      if record.outcome == .sent || record.outcome == .replied {
        sentMessageIDs[record.tone, default: []].insert(record.messageId)
      }
      if record.reasonCode == "bad_tone" {
        toneScores[record.tone, default: 0] -= 3
      }
    }
    for signal in boardFeedback?.signals ?? [] {
      let multiplier: Int
      switch signal.signal {
      case "confirmed": multiplier = 1
      case "rejected": multiplier = -2
      case "revised": multiplier = -1
      default: continue
      }
      if let tone = signal.tone { toneScores[tone, default: 0] += multiplier * signal.count }
      if let template = signal.templateId { templateScores[template, default: 0] += multiplier * signal.count }
      if signal.reasonCode == "bad_tone", let tone = signal.tone {
        toneScores[tone, default: 0] -= signal.count
      }
    }

    func best(_ candidates: [String], scores: [String: Int], fallback: String) -> String {
      candidates.sorted {
        let left = scores[$0, default: 0]
        let right = scores[$1, default: 0]
        return left == right ? candidates.firstIndex(of: $0)! < candidates.firstIndex(of: $1)! : left > right
      }.first ?? fallback
    }
    let rankedTone = best(allowedTones, scores: toneScores, fallback: fallbackTone)
    let tone = explicitTone ?? rankedTone
    let template = best(allowedTemplates, scores: templateScores, fallback: Self.standardTemplate)
    let count = sentMessageIDs[tone, default: []].count
    let reason = explicitTone == nil && tone != fallbackTone
      ? count > 0
        ? "Using \(tone.lowercased()): you sent it the last \(count) time\(count == 1 ? "" : "s")."
        : "Using \(tone.lowercased()): this board preferred it in recent reviewed drafts."
      : template != Self.standardTemplate
        ? "Using a shorter opener based on this board's reported outcomes."
        : nil
    let stageSummary = relevant.prefix(12).map { "\($0.outcome.rawValue):\($0.tone.lowercased()):\($0.templateId)" }
      .joined(separator: ", ")
    return AdvisorMemorySelection(
      tone: tone,
      templateId: template,
      reason: reason,
      promptSummary: stageSummary.isEmpty ? nil : "Reported draft outcomes: \(stageSummary)",
      sampleCount: localSampleCount + aggregateCount
    )
  }

  private func load() -> [AdvisorDraftOutcomeRecord] {
    guard let data = defaults.data(forKey: key),
          let envelope = try? JSONDecoder().decode(Envelope.self, from: data),
          envelope.schemaVersion == 1 else { return [] }
    return envelope.records
  }

  private func persist(_ records: [AdvisorDraftOutcomeRecord]) {
    guard let data = try? JSONEncoder().encode(Envelope(schemaVersion: 1, records: records)) else { return }
    defaults.set(data, forKey: key)
  }
}
