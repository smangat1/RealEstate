import Foundation

struct HomeboardListingInsight: Codable, Hashable, Sendable, Identifiable {
  var category: String
  var label: String
  var sentiment: Double
  var confidence: Double
  var evidence: String

  var id: String {
    "\(category.lowercased())|\(label.lowercased())|\(evidence.lowercased())"
  }
}

struct HomeboardShareDiagnosticEntry: Codable, Identifiable, Sendable {
  let id: UUID
  let sessionID: String
  let createdAt: Date
  let stage: String
  let detail: String
  let level: String
}

struct HomeboardShareBootEntry: Identifiable, Sendable {
  let id = UUID()
  let createdAt: Date
  let processID: String
  let stage: String
  let detail: String
}

/// A deliberately small, append-only trace that can be written before SwiftUI,
/// UserDefaults, keychain access, or the share controller is available.
enum HomeboardShareBootDiagnosticStore {
  private static let appGroup = "group.com.homeboard.native"
  private static let fileName = "homeboard-share-boot-v1.log"
  private static let maximumBytes = 64 * 1_024

  private static var fileURL: URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
      .appendingPathComponent(fileName, isDirectory: false)
  }

  @discardableResult
  static func append(stage: String, detail: String) -> Bool {
    guard let fileURL else { return false }
    let safeStage = oneLine(stage, maximumLength: 80)
    let safeDetail = oneLine(detail, maximumLength: 360)
    let timestamp = String(format: "%.6f", Date().timeIntervalSince1970)
    let processID = String(ProcessInfo.processInfo.processIdentifier)
    let line = "\(timestamp)\t\(processID)\t\(safeStage)\t\(safeDetail)\n"
    guard let data = line.data(using: .utf8) else { return false }

    do {
      let resourceValues = try? fileURL.resourceValues(forKeys: [.fileSizeKey])
      let size = resourceValues?.fileSize ?? 0
      if size > maximumBytes || !FileManager.default.fileExists(atPath: fileURL.path) {
        try data.write(to: fileURL, options: .atomic)
      } else {
        let handle = try FileHandle(forWritingTo: fileURL)
        try handle.seekToEnd()
        try handle.write(contentsOf: data)
        try handle.close()
      }
      return true
    } catch {
      return false
    }
  }

  static func entries() -> [HomeboardShareBootEntry] {
    guard
      let fileURL,
      let contents = try? String(contentsOf: fileURL, encoding: .utf8)
    else { return [] }

    return Array(contents.split(separator: "\n").suffix(80)).compactMap { line in
      let parts = line.split(
        separator: "\t",
        maxSplits: 3,
        omittingEmptySubsequences: false
      )
      guard parts.count == 4, let timestamp = TimeInterval(parts[0]) else {
        return nil
      }
      return HomeboardShareBootEntry(
        createdAt: Date(timeIntervalSince1970: timestamp),
        processID: String(parts[1]),
        stage: String(parts[2]),
        detail: String(parts[3])
      )
    }
  }

  static func clear() {
    guard let fileURL else { return }
    try? FileManager.default.removeItem(at: fileURL)
  }

  static func exportText() -> String {
    let formatter = ISO8601DateFormatter()
    return entries().map { entry in
      "\(formatter.string(from: entry.createdAt)) [pid \(entry.processID)] BOOT \(entry.stage): \(entry.detail)"
    }.joined(separator: "\n")
  }

  private static func oneLine(_ value: String, maximumLength: Int) -> String {
    let result = value
      .replacingOccurrences(of: "\t", with: " ")
      .replacingOccurrences(of: "\r", with: " ")
      .replacingOccurrences(of: "\n", with: " ")
      .replacingOccurrences(
        of: #"(?i)bearer\s+[a-z0-9._~-]+"#,
        with: "Bearer [redacted]",
        options: .regularExpression
      )
      .replacingOccurrences(
        of: #"(?i)(access|refresh|token|secret)=([^\s&]+)"#,
        with: "$1=[redacted]",
        options: .regularExpression
      )
    return result.count > maximumLength
      ? String(result.prefix(maximumLength)) + "…"
      : result
  }
}

enum HomeboardShareDiagnosticStore {
  static let appGroup = "group.com.homeboard.native"
  private static let entriesKey = "homeboard.share.diagnostic-entries-v1"
  private static let maximumEntryCount = 80
  private static let accessLock = NSLock()

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroup)
  }

  @discardableResult
  static func append(
    sessionID: String,
    stage: String,
    detail: String,
    level: String = "info"
  ) -> Bool {
    accessLock.lock()
    defer { accessLock.unlock() }
    guard let defaults else { return false }
    var values = entries(defaults: defaults)
    values.append(
      HomeboardShareDiagnosticEntry(
        id: UUID(),
        sessionID: sessionID,
        createdAt: Date(),
        stage: stage,
        detail: sanitized(detail),
        level: level
      )
    )
    values = Array(values.suffix(maximumEntryCount))
    guard let data = try? JSONEncoder().encode(values) else { return false }
    defaults.set(data, forKey: entriesKey)
    return defaults.synchronize()
  }

  static func entries() -> [HomeboardShareDiagnosticEntry] {
    accessLock.lock()
    defer { accessLock.unlock() }
    guard let defaults else { return [] }
    return entries(defaults: defaults)
  }

  static func clear() {
    accessLock.lock()
    defer { accessLock.unlock() }
    defaults?.removeObject(forKey: entriesKey)
    defaults?.synchronize()
  }

  static func exportText() -> String {
    let formatter = ISO8601DateFormatter()
    return entries().map { entry in
      "\(formatter.string(from: entry.createdAt)) [\(entry.sessionID)] \(entry.level.uppercased()) \(entry.stage): \(entry.detail)"
    }.joined(separator: "\n")
  }

  private static func entries(
    defaults: UserDefaults
  ) -> [HomeboardShareDiagnosticEntry] {
    guard let data = defaults.data(forKey: entriesKey) else { return [] }
    return (try? JSONDecoder().decode(
      [HomeboardShareDiagnosticEntry].self,
      from: data
    )) ?? []
  }

  private static func sanitized(_ value: String) -> String {
    var result = value
      .replacingOccurrences(
        of: #"(?i)bearer\s+[a-z0-9._~-]+"#,
        with: "Bearer [redacted]",
        options: .regularExpression
      )
      .replacingOccurrences(
        of: #"(?i)(access|refresh|token|secret)=([^\s&]+)"#,
        with: "$1=[redacted]",
        options: .regularExpression
      )
    if result.count > 360 {
      result = String(result.prefix(360)) + "…"
    }
    return result
  }
}

enum HomeboardShareReportDiagnostics {
  private static let maximumLength = 60_000

  static func exportText() -> String {
    let bootTrace = HomeboardShareBootDiagnosticStore.exportText()
    let shareTrace = HomeboardShareDiagnosticStore.exportText()
    let combined = [
      bootTrace.isEmpty ? nil : "SHARE BOOT TRACE\n\(bootTrace)",
      shareTrace.isEmpty ? nil : "SHARE WORKFLOW TRACE\n\(shareTrace)"
    ]
      .compactMap { $0 }
      .joined(separator: "\n\n")

    guard !combined.isEmpty else {
      return "No share-extension diagnostics were recorded on this device."
    }
    guard combined.count > maximumLength else { return combined }
    return "[Older share diagnostics omitted]\n" + combined.suffix(maximumLength)
  }
}

enum HomeboardSharedImportStore {
  static let appGroup = "group.com.homeboard.native"
  private static let pendingKey = "homeboard.shared.pending-listing"
  private static let pendingQueueKey = "homeboard.shared.pending-listing-queue"
  private static let activeBoardKey = "homeboard.shared.active-board"
  private static let queueDirectoryName = "homeboard-pending-listings-v2"
  private static let maximumPendingImports = 100
  private static let maximumPreviewImageBytes = 2_000_000
  private static let previewImageReferenceScheme = "homeboard-share-preview"

  struct PendingImport: Codable, Sendable {
    var id: UUID
    var url: String
    var canonicalURL: String?
    var boardId: String?
    var createdAt: Date
    var sourceName: String?
    var pageTitle: String?
    var address: String?
    var unit: String?
    var city: String?
    var neighborhood: String?
    var latitude: Double?
    var longitude: Double?
    var price: Double?
    var bedrooms: Double?
    var bathrooms: Double?
    var squareFeet: Int?
    var availableDate: String?
    var imageURL: String?
    var summary: String?
    var amenities: [String]
    var modelInsights: [HomeboardListingInsight]
    var listingScope: String?
    var extractionConfidence: String?

    var requiresReview: Bool {
      extractionConfidence?.lowercased() == "needs-review"
    }

    init(
      id: UUID = UUID(),
      url: String,
      canonicalURL: String? = nil,
      boardId: String? = nil,
      createdAt: Date = Date(),
      sourceName: String? = nil,
      pageTitle: String? = nil,
      address: String? = nil,
      unit: String? = nil,
      city: String? = nil,
      neighborhood: String? = nil,
      latitude: Double? = nil,
      longitude: Double? = nil,
      price: Double? = nil,
      bedrooms: Double? = nil,
      bathrooms: Double? = nil,
      squareFeet: Int? = nil,
      availableDate: String? = nil,
      imageURL: String? = nil,
      summary: String? = nil,
      amenities: [String] = [],
      modelInsights: [HomeboardListingInsight] = [],
      listingScope: String? = nil,
      extractionConfidence: String? = nil
    ) {
      self.id = id
      self.url = url
      self.canonicalURL = canonicalURL
      self.boardId = boardId
      self.createdAt = createdAt
      self.sourceName = sourceName
      self.pageTitle = pageTitle
      self.address = address
      self.unit = unit
      self.city = city
      self.neighborhood = neighborhood
      self.latitude = latitude
      self.longitude = longitude
      self.price = price
      self.bedrooms = bedrooms
      self.bathrooms = bathrooms
      self.squareFeet = squareFeet
      self.availableDate = availableDate
      self.imageURL = imageURL
      self.summary = summary
      self.amenities = amenities
      self.modelInsights = modelInsights
      self.listingScope = listingScope
      self.extractionConfidence = extractionConfidence
    }

    init?(message: [String: Any], boardId: String?) {
      guard
        let rawURL = message["url"] as? String,
        let parsedURL = URL(string: rawURL),
        ["http", "https"].contains(parsedURL.scheme?.lowercased() ?? "")
      else {
        return nil
      }

      func cleaned(_ key: String) -> String? {
        guard let value = message[key] as? String else { return nil }
        let result = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return result.isEmpty ? nil : result
      }

      func number(_ key: String) -> Double? {
        if let value = message[key] as? NSNumber {
          return value.doubleValue
        }
        if let value = message[key] as? String {
          return Double(value.filter { $0.isNumber || $0 == "." })
        }
        return nil
      }

      let squareFeetValue = number("squareFeet")
      self.init(
        url: rawURL,
        canonicalURL: cleaned("canonicalURL"),
        boardId: boardId,
        sourceName: cleaned("sourceName"),
        pageTitle: cleaned("pageTitle"),
        address: cleaned("address"),
        unit: cleaned("unit"),
        city: cleaned("city"),
        neighborhood: cleaned("neighborhood"),
        latitude: number("latitude"),
        longitude: number("longitude"),
        price: number("price"),
        bedrooms: number("bedrooms"),
        bathrooms: number("bathrooms"),
        squareFeet: squareFeetValue.map { Int($0.rounded()) },
        availableDate: cleaned("availableDate"),
        imageURL: cleaned("imageURL"),
        summary: cleaned("summary"),
        amenities: (message["amenities"] as? [String]) ?? [],
        modelInsights: Self.decodeInsights(message["modelInsights"]),
        listingScope: cleaned("listingScope"),
        extractionConfidence: cleaned("extractionConfidence")
      )
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
      url = try container.decode(String.self, forKey: .url)
      canonicalURL = try container.decodeIfPresent(String.self, forKey: .canonicalURL)
      boardId = try container.decodeIfPresent(String.self, forKey: .boardId)
      createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
      sourceName = try container.decodeIfPresent(String.self, forKey: .sourceName)
      pageTitle = try container.decodeIfPresent(String.self, forKey: .pageTitle)
      address = try container.decodeIfPresent(String.self, forKey: .address)
      unit = try container.decodeIfPresent(String.self, forKey: .unit)
      city = try container.decodeIfPresent(String.self, forKey: .city)
      neighborhood = try container.decodeIfPresent(String.self, forKey: .neighborhood)
      latitude = try container.decodeIfPresent(Double.self, forKey: .latitude)
      longitude = try container.decodeIfPresent(Double.self, forKey: .longitude)
      price = try container.decodeIfPresent(Double.self, forKey: .price)
      bedrooms = try container.decodeIfPresent(Double.self, forKey: .bedrooms)
      bathrooms = try container.decodeIfPresent(Double.self, forKey: .bathrooms)
      squareFeet = try container.decodeIfPresent(Int.self, forKey: .squareFeet)
      availableDate = try container.decodeIfPresent(String.self, forKey: .availableDate)
      imageURL = try container.decodeIfPresent(String.self, forKey: .imageURL)
      summary = try container.decodeIfPresent(String.self, forKey: .summary)
      amenities = try container.decodeIfPresent([String].self, forKey: .amenities) ?? []
      modelInsights = try container.decodeIfPresent([HomeboardListingInsight].self, forKey: .modelInsights) ?? []
      listingScope = try container.decodeIfPresent(String.self, forKey: .listingScope)
      extractionConfidence = try container.decodeIfPresent(String.self, forKey: .extractionConfidence)
    }

    private static func decodeInsights(_ value: Any?) -> [HomeboardListingInsight] {
      guard JSONSerialization.isValidJSONObject(value ?? NSNull()),
            let value,
            let data = try? JSONSerialization.data(withJSONObject: value),
            let insights = try? JSONDecoder().decode([HomeboardListingInsight].self, from: data)
      else { return [] }
      return insights
    }
  }

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroup)
  }

  private static var queueDirectoryURL: URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
      .appendingPathComponent(queueDirectoryName, isDirectory: true)
  }

  private static func queueFileURL(for id: UUID) -> URL? {
    queueDirectoryURL?.appendingPathComponent("\(id.uuidString).json")
  }

  private static func previewImageFileURL(for id: UUID) -> URL? {
    queueDirectoryURL?.appendingPathComponent("\(id.uuidString).preview.jpg")
  }

  /// Keeps a share-sheet thumbnail next to its queued import. The extension
  /// only writes normalized JPEG data here; the main app uploads it after the
  /// sheet has dismissed so tapping Save never waits on the network.
  @discardableResult
  static func savePreviewImage(_ data: Data, for id: UUID) -> Bool {
    guard
      data.count >= 4,
      data.count <= maximumPreviewImageBytes,
      data.starts(with: [0xFF, 0xD8, 0xFF]),
      let directoryURL = queueDirectoryURL,
      let fileURL = previewImageFileURL(for: id)
    else { return false }

    do {
      try FileManager.default.createDirectory(
        at: directoryURL,
        withIntermediateDirectories: true
      )
      try data.write(to: fileURL, options: [.atomic])
      return FileManager.default.fileExists(atPath: fileURL.path)
    } catch {
      return false
    }
  }

  static func previewImageData(for id: UUID) -> Data? {
    guard
      let fileURL = previewImageFileURL(for: id),
      let values = try? fileURL.resourceValues(forKeys: [.fileSizeKey]),
      let fileSize = values.fileSize,
      fileSize >= 4,
      fileSize <= maximumPreviewImageBytes,
      let data = try? Data(contentsOf: fileURL, options: [.mappedIfSafe]),
      data.count == fileSize,
      data.starts(with: [0xFF, 0xD8, 0xFF])
    else { return nil }
    return data
  }

  static func hasPreviewImage(for id: UUID) -> Bool {
    guard
      let fileURL = previewImageFileURL(for: id),
      let values = try? fileURL.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
      values.isRegularFile == true,
      let fileSize = values.fileSize
    else { return false }
    return fileSize >= 4 && fileSize <= maximumPreviewImageBytes
  }

  static func previewImageReference(for id: UUID) -> String {
    "\(previewImageReferenceScheme)://\(id.uuidString)"
  }

  static func previewImageID(from reference: String) -> UUID? {
    guard
      let components = URLComponents(string: reference),
      components.scheme == previewImageReferenceScheme,
      let host = components.host
    else { return nil }
    return UUID(uuidString: host)
  }

  static func discardPreviewImage(for id: UUID) {
    guard let fileURL = previewImageFileURL(for: id) else { return }
    try? FileManager.default.removeItem(at: fileURL)
  }

  static func setActiveBoard(_ boardId: String?) {
    defaults?.set(boardId, forKey: activeBoardKey)
  }

  static func clearAccountData() {
    defaults?.removeObject(forKey: pendingKey)
    defaults?.removeObject(forKey: pendingQueueKey)
    defaults?.removeObject(forKey: activeBoardKey)
    defaults?.synchronize()
    if let queueDirectoryURL {
      try? FileManager.default.removeItem(at: queueDirectoryURL)
    }
  }

  static func save(url: String) {
    let value = url.trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      let parsedURL = URL(string: value),
      ["http", "https"].contains(parsedURL.scheme?.lowercased() ?? "")
    else { return }
    save(PendingImport(
      url: value,
      boardId: defaults?.string(forKey: activeBoardKey),
      createdAt: Date()
    ))
  }

  @discardableResult
  static func save(_ pendingImport: PendingImport) -> Bool {
    var payload = pendingImport
    guard
      let parsedURL = URL(string: payload.url),
      ["http", "https"].contains(parsedURL.scheme?.lowercased() ?? "")
    else { return false }
    if payload.boardId == nil {
      payload.boardId = defaults?.string(forKey: activeBoardKey)
    }

    let queue = loadQueue()
    let duplicate = queue.first {
      $0.url == payload.url
        && normalizedUnit($0.unit) == normalizedUnit(payload.unit)
        && $0.price == payload.price
        && $0.bedrooms == payload.bedrooms
        && $0.bathrooms == payload.bathrooms
        && abs($0.createdAt.timeIntervalSince(payload.createdAt)) < 2
    }
    if let duplicate { remove(id: duplicate.id) }
    guard queue.count < maximumPendingImports || duplicate != nil else { return false }
    guard
      let directoryURL = queueDirectoryURL,
      let fileURL = queueFileURL(for: payload.id),
      let data = try? JSONEncoder().encode(payload)
    else { return false }
    do {
      try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
      try data.write(to: fileURL, options: [.atomic])
      return FileManager.default.fileExists(atPath: fileURL.path)
    } catch {
      return false
    }
  }

  static func remove(id: UUID) {
    remove(id: id, preservingPreviewImage: false)
  }

  static func remove(id: UUID, preservingPreviewImage: Bool) {
    if let fileURL = queueFileURL(for: id) {
      try? FileManager.default.removeItem(at: fileURL)
    }
    if !preservingPreviewImage {
      discardPreviewImage(for: id)
    }
    guard let defaults else { return }
    let queue = loadLegacyQueue().filter { $0.id != id }
    if queue.isEmpty {
      defaults.removeObject(forKey: pendingQueueKey)
    } else if let data = try? JSONEncoder().encode(queue) {
      defaults.set(data, forKey: pendingQueueKey)
    }
    defaults.synchronize()
  }

  static func consume() -> PendingImport? {
    let queue = loadQueue()
    guard !queue.isEmpty else { return nil }
    let payload = queue[0]
    remove(id: payload.id)
    return payload
  }

  static func consumeAll() -> [PendingImport] {
    let queue = loadQueue()
    guard !queue.isEmpty else { return [] }
    queue.forEach { remove(id: $0.id) }
    return queue
  }

  static func all() -> [PendingImport] {
    loadQueue()
  }

  static func prepend(_ imports: [PendingImport]) {
    guard !imports.isEmpty else { return }
    imports.forEach { _ = save($0) }
  }

  static var activeBoardId: String? {
    defaults?.string(forKey: activeBoardKey)
  }

  static func reset() {
    defaults?.removeObject(forKey: pendingKey)
    defaults?.removeObject(forKey: pendingQueueKey)
    defaults?.removeObject(forKey: activeBoardKey)
    defaults?.synchronize()
    if let queueDirectoryURL {
      try? FileManager.default.removeItem(at: queueDirectoryURL)
    }
  }

  private static func loadQueue() -> [PendingImport] {
    var queue: [PendingImport] = []
    if let directoryURL = queueDirectoryURL,
       let fileURLs = try? FileManager.default.contentsOfDirectory(
         at: directoryURL,
         includingPropertiesForKeys: nil,
         options: [.skipsHiddenFiles]
       ) {
      queue = fileURLs.compactMap { fileURL in
        guard
          fileURL.pathExtension == "json",
          let data = try? Data(contentsOf: fileURL),
          let pending = try? JSONDecoder().decode(PendingImport.self, from: data)
        else { return nil }
        return pending
      }
    }

    let knownIDs = Set(queue.map(\.id))
    let legacy = loadLegacyQueue().filter { !knownIDs.contains($0.id) }
    var migratedEveryLegacyImport = true
    for pending in legacy {
      guard
        let directoryURL = queueDirectoryURL,
        let fileURL = queueFileURL(for: pending.id),
        let data = try? JSONEncoder().encode(pending)
      else {
        migratedEveryLegacyImport = false
        continue
      }
      do {
        try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        try data.write(to: fileURL, options: [.atomic])
        queue.append(pending)
      } catch {
        migratedEveryLegacyImport = false
      }
    }
    if !legacy.isEmpty && migratedEveryLegacyImport {
      defaults?.removeObject(forKey: pendingQueueKey)
      defaults?.removeObject(forKey: pendingKey)
      defaults?.synchronize()
    }
    return queue.sorted { $0.createdAt < $1.createdAt }
  }

  private static func loadLegacyQueue() -> [PendingImport] {
    if let data = defaults?.data(forKey: pendingQueueKey),
       let queue = try? JSONDecoder().decode([PendingImport].self, from: data) {
      return queue
    }

    // Migrate the URL-only payload used by the first share-extension pass.
    if
      let data = defaults?.data(forKey: pendingKey),
      let legacy = try? JSONDecoder().decode(LegacyPendingImport.self, from: data)
    {
      return [
        PendingImport(
          url: legacy.url,
          boardId: legacy.boardId,
          createdAt: legacy.createdAt
        )
      ]
    }
    return []
  }

  private static func normalizedUnit(_ value: String?) -> String {
    value?
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .uppercased() ?? ""
  }

  private struct LegacyPendingImport: Codable {
    var url: String
    var boardId: String?
    var createdAt: Date
  }
}
