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

enum HomeboardSharedImportStore {
  static let appGroup = "group.com.homeboard.native"
  private static let pendingKey = "homeboard.shared.pending-listing"
  private static let pendingQueueKey = "homeboard.shared.pending-listing-queue"
  private static let activeBoardKey = "homeboard.shared.active-board"

  struct PendingImport: Codable {
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

  static func setActiveBoard(_ boardId: String?) {
    defaults?.set(boardId, forKey: activeBoardKey)
  }

  static func save(url: String) {
    let value = url.trimmingCharacters(in: .whitespacesAndNewlines)
    guard URL(string: value) != nil else { return }
    save(PendingImport(
      url: value,
      boardId: defaults?.string(forKey: activeBoardKey),
      createdAt: Date()
    ))
  }

  static func save(_ pendingImport: PendingImport) {
    var payload = pendingImport
    if payload.boardId == nil {
      payload.boardId = defaults?.string(forKey: activeBoardKey)
    }

    var queue = loadQueue()
    queue.removeAll {
      $0.url == payload.url
        && normalizedUnit($0.unit) == normalizedUnit(payload.unit)
        && $0.price == payload.price
        && $0.bedrooms == payload.bedrooms
        && $0.bathrooms == payload.bathrooms
        && abs($0.createdAt.timeIntervalSince(payload.createdAt)) < 2
    }
    queue.append(payload)
    queue = Array(queue.suffix(12))

    guard let data = try? JSONEncoder().encode(queue) else { return }
    defaults?.set(data, forKey: pendingQueueKey)
    defaults?.removeObject(forKey: pendingKey)
    defaults?.synchronize()
  }

  static func consume() -> PendingImport? {
    var queue = loadQueue()
    guard !queue.isEmpty else { return nil }
    let payload = queue.removeFirst()

    if queue.isEmpty {
      defaults?.removeObject(forKey: pendingQueueKey)
    } else if let data = try? JSONEncoder().encode(queue) {
      defaults?.set(data, forKey: pendingQueueKey)
    }
    defaults?.synchronize()

    return payload
  }

  static func consumeAll() -> [PendingImport] {
    let queue = loadQueue()
    guard !queue.isEmpty else { return [] }
    defaults?.removeObject(forKey: pendingQueueKey)
    defaults?.removeObject(forKey: pendingKey)
    defaults?.synchronize()
    return queue
  }

  static func prepend(_ imports: [PendingImport]) {
    guard !imports.isEmpty else { return }
    let queue = Array((imports + loadQueue()).prefix(12))
    guard let data = try? JSONEncoder().encode(queue) else { return }
    defaults?.set(data, forKey: pendingQueueKey)
    defaults?.synchronize()
  }

  static var activeBoardId: String? {
    defaults?.string(forKey: activeBoardKey)
  }

  static func reset() {
    defaults?.removeObject(forKey: pendingKey)
    defaults?.removeObject(forKey: pendingQueueKey)
    defaults?.removeObject(forKey: activeBoardKey)
    defaults?.synchronize()
  }

  private static func loadQueue() -> [PendingImport] {
    if
      let data = defaults?.data(forKey: pendingQueueKey),
      let queue = try? JSONDecoder().decode([PendingImport].self, from: data)
    {
      return queue
    }

    // Migrate the URL-only payload used by the first share-extension pass.
    if
      let data = defaults?.data(forKey: pendingKey),
      let legacy = try? JSONDecoder().decode(LegacyPendingImport.self, from: data)
    {
      defaults?.removeObject(forKey: pendingKey)
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
