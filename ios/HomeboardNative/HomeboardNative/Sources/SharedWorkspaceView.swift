import Foundation
import MapKit
import SafariServices
import SwiftUI
import UIKit

private enum SharedSearchPresentation: String, CaseIterable {
  case map
  case list
}

private enum SharedComparisonCriterion: String, CaseIterable, Identifiable {
  case price
  case commute
  case space
  case neighborhood
  case features

  var id: String { rawValue }

  var label: String {
    switch self {
    case .price: "Price"
    case .commute: "Commute"
    case .space: "Space"
    case .neighborhood: "Neighborhood vibe"
    case .features: "Home features"
    }
  }

  var shortLabel: String {
    self == .neighborhood ? "Vibe" : label
  }

  var icon: String {
    switch self {
    case .price: "dollarsign.circle.fill"
    case .commute: "tram.fill"
    case .space: "arrow.up.left.and.arrow.down.right"
    case .neighborhood: "sparkles"
    case .features: "wand.and.stars"
    }
  }

  var explanation: String {
    switch self {
    case .price: "Lower rent and roommate affordability"
    case .commute: "Access-aware time with driving, transit complexity, and walking effort"
    case .space: "Square footage, rooms, and group impressions"
    case .neighborhood: "Preferred areas and roommate ratings"
    case .features: "Grounded finishes, amenities, light, layout, and risks"
    }
  }
}

enum SharedComparisonMath {
  static func priorityWeight(for rank: Int) -> Double {
    switch min(max(rank, 1), 4) {
    case 1: 8
    case 2: 4
    case 3: 2
    default: 1
    }
  }

  static func commuteScore(
    minutes: Int,
    preferredMinutes: Int?,
    maximumMinutes: Int?
  ) -> Double {
    let minimum = max(preferredMinutes ?? 0, 0)
    let maximum = max(maximumMinutes ?? 45, minimum + 5)
    if (minimum...maximum).contains(minutes) {
      return 100
    }
    if minutes < minimum {
      return max(0, 100 - Double(minimum - minutes) * 6)
    }
    return max(0, 100 - Double(minutes - maximum) * 4)
  }

  static func offerBonusPoints(for offer: SharedListingActiveOffer) -> Int {
    offer.bonusPoints
  }

  static func adjustedPriceScore(baseScore: Double, bonusPoints: Int) -> Double {
    min(100, baseScore + Double(bonusPoints))
  }
}

private enum SharedCommuteMode: String, CaseIterable, Hashable, Codable, Sendable {
  case transit
  case walking
  case automobile

  var label: String {
    switch self {
    case .transit: "Transit"
    case .walking: "Walk"
    case .automobile: "Drive"
    }
  }

  var icon: String {
    switch self {
    case .transit: "tram.fill"
    case .walking: "figure.walk"
    case .automobile: "car.fill"
    }
  }

  var cardOrder: Int {
    switch self {
    case .automobile: 0
    case .transit: 1
    case .walking: 2
    }
  }
}

private enum SharedTransitKind: String, Codable, Sendable {
  case bus
  case train
  case ferry
  case transit

  var label: String {
    switch self {
    case .bus: "Bus"
    case .train: "Train"
    case .ferry: "Ferry"
    case .transit: "Transit"
    }
  }

  var icon: String {
    switch self {
    case .bus: "bus.fill"
    case .train: "tram.fill"
    case .ferry: "ferry.fill"
    case .transit: "tram.fill"
    }
  }
}

private enum SharedCommuteRouteLogic {
  static func permits(_ mode: SharedCommuteMode, access: String?) -> Bool {
    guard access != "remote", access != "skip" else { return false }
    if mode == .automobile {
      return access == nil || access == "car" || access == "flexible"
    }
    return true
  }

  static func easeAdjustedMinutes(
    mode: SharedCommuteMode,
    minutes: Int,
    stepCount: Int,
    access: String?
  ) -> Int {
    guard permits(mode, access: access) else { return 999 }
    let base = Double(max(minutes, 1))
    let adjustment: Double
    switch mode {
    case .automobile:
      adjustment = access == "flexible" ? 2 : 0
    case .transit:
      let preferencePenalty = access == "car" ? 6.0 : access == "flexible" ? 2.0 : 1.0
      let complexityPenalty = min(Double(max(stepCount - 2, 0)) * 1.5, 9)
      adjustment = preferencePenalty + complexityPenalty
    case .walking:
      let longWalkPenalty = Double(max(minutes - 10, 0)) * 0.75
      let preferencePenalty = access == "car" ? 4.0 : 0
      adjustment = longWalkPenalty + preferencePenalty
    }
    return min(Int((base + adjustment).rounded()), 999)
  }
}

private struct SharedComparisonCommuteEvidence: Sendable {
  let score: Double?
  let averageMinutes: Int
  let averageEaseMinutes: Int
  let resolvedDestinations: Int
  let requestedDestinations: Int
  let suppressedLongRouteDestinations: Int
  let usedWalkingFallback: Bool
  let displayedRouteIDs: Set<String>
  let scoredRouteIDs: Set<String>
  let routeSnapshots: [SharedComparisonRouteSnapshot]
}

private struct SharedComparisonCommuteTarget: Sendable {
  let id: String
  let memberName: String
  let destination: String
  let latitude: Double
  let longitude: Double
  let commuteAccess: String?
  let preferredMinutes: Int?
  let maximumMinutes: Int?
}

private struct SharedRouteCoordinate: Codable, Sendable {
  let latitude: Double
  let longitude: Double
}

private struct SharedRouteLegResult: Codable, Sendable {
  let mode: SharedCommuteMode
  let transitKind: SharedTransitKind?
  let minutes: Int
  let coordinates: [SharedRouteCoordinate]
}

private struct SharedRouteResult: Codable, Sendable {
  let minutes: Int
  let stepCount: Int
  let transitKind: SharedTransitKind?
  let coordinates: [SharedRouteCoordinate]
  let legs: [SharedRouteLegResult]
}

private struct SharedComparisonRouteCacheEntry: Codable, Sendable {
  let result: SharedRouteResult
  let savedAt: Date
}

private struct SharedComparisonRouteCachePayload: Codable, Sendable {
  let version: Int
  let entries: [String: SharedComparisonRouteCacheEntry]
}

private actor SharedComparisonRouteCache {
  static let shared = SharedComparisonRouteCache()

  private static let cacheVersion = 1
  private static let maximumEntryCount = 1_200

  private let cacheURL: URL
  private var values: [String: SharedComparisonRouteCacheEntry]
  private var inFlight: [String: Task<SharedRouteResult?, Never>] = [:]
  private var persistenceTask: Task<Void, Never>?

  init(fileManager: FileManager = .default) {
    let baseURL = fileManager.urls(
      for: .cachesDirectory,
      in: .userDomainMask
    ).first ?? fileManager.temporaryDirectory
    let directoryURL = baseURL.appendingPathComponent(
      "HomeboardRouteCache",
      isDirectory: true
    )
    try? fileManager.createDirectory(
      at: directoryURL,
      withIntermediateDirectories: true
    )
    let cacheURL = directoryURL.appendingPathComponent(
      "comparison-routes-v1.json",
      isDirectory: false
    )
    self.cacheURL = cacheURL

    if let data = try? Data(contentsOf: cacheURL),
       let payload = try? JSONDecoder().decode(
         SharedComparisonRouteCachePayload.self,
         from: data
       ),
       payload.version == Self.cacheVersion {
      values = payload.entries
    } else {
      values = [:]
    }
  }

  func value(
    for key: String,
    operation: @escaping @Sendable () async -> SharedRouteResult?
  ) async -> SharedRouteResult? {
    if let cached = values[key] {
      return cached.result
    }
    if let existing = inFlight[key] {
      return await existing.value
    }

    let task = Task { await operation() }
    inFlight[key] = task
    let result = await task.value
    inFlight[key] = nil
    if let result {
      values[key] = SharedComparisonRouteCacheEntry(
        result: result,
        savedAt: Date()
      )
      trimIfNeeded()
      schedulePersistence()
    }
    return result
  }

  private func trimIfNeeded() {
    let overflow = values.count - Self.maximumEntryCount
    guard overflow > 0 else { return }
    let oldestKeys = values
      .sorted { $0.value.savedAt < $1.value.savedAt }
      .prefix(overflow)
      .map(\.key)
    for key in oldestKeys {
      values[key] = nil
    }
  }

  private func schedulePersistence() {
    persistenceTask?.cancel()
    persistenceTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 400_000_000)
      guard !Task.isCancelled else { return }
      await self?.persist()
    }
  }

  private func persist() {
    let payload = SharedComparisonRouteCachePayload(
      version: Self.cacheVersion,
      entries: values
    )
    guard let data = try? JSONEncoder().encode(payload) else { return }
    try? data.write(to: cacheURL, options: .atomic)
  }
}

private enum SharedRouteAttemptResult: Sendable {
  case success(SharedRouteResult)
  case retryableFailure
  case terminalFailure
}

private struct SharedLoadedComparisonRoute: Sendable {
  let targetID: String
  let destination: String
  let memberNames: [String]
  let commuteAccesses: [String]
  let mode: SharedCommuteMode
  let transitKind: SharedTransitKind?
  let minutes: Int
  let easeMinutes: Int
  let preferredMinutes: Int
  let maximumMinutes: Int
  let coordinates: [SharedRouteCoordinate]
  let legs: [SharedRouteLegResult]
}

private struct SharedComparisonRouteSnapshot: Sendable {
  let targetID: String
  let memberName: String
  let destination: String
  let commuteAccess: String?
  let mode: SharedCommuteMode
  let transitKind: SharedTransitKind?
  let minutes: Int
  let easeMinutes: Int
  let preferredMinutes: Int
  let maximumMinutes: Int
  let coordinates: [SharedRouteCoordinate]
  let legs: [SharedRouteLegResult]
}

private enum SharedComparisonRegionTier: CaseIterable, Identifiable {
  case best
  case strong
  case tradeoffs
  case weak

  var id: Self { self }

  var label: String {
    switch self {
    case .best: "Best"
    case .strong: "Strong"
    case .tradeoffs: "Tradeoffs"
    case .weak: "Weak"
    }
  }

  var color: Color {
    switch self {
    case .best: HomeboardPalette.success
    case .strong: HomeboardPalette.accent
    case .tradeoffs: Color(red: 0.98, green: 0.70, blue: 0.34)
    case .weak: HomeboardPalette.danger
    }
  }

}

private enum SharedCommuteCorridorTier {
  case tooClose
  case ideal
  case tooFar

  var color: Color {
    switch self {
    case .tooClose: Color(red: 0.98, green: 0.70, blue: 0.34)
    case .ideal: HomeboardPalette.success
    case .tooFar: HomeboardPalette.danger
    }
  }

  var accessibilityLabel: String {
    switch self {
    case .tooClose: "closer to work than desired"
    case .ideal: "inside the full-score commute range"
    case .tooFar: "farther from work than desired"
    }
  }
}

private struct SharedComparisonCommuteCorridor: Identifiable {
  let id: String
  let listingID: String
  let targetID: String
  let memberNames: [String]
  let destination: String
  let commuteAccesses: [String]
  let mode: SharedCommuteMode
  let transitKind: SharedTransitKind?
  let minutes: Int
  let easeMinutes: Int
  let preferredMinutes: Int
  let maximumMinutes: Int
  let polyline: MKPolyline
  let legs: [SharedComparisonRouteLeg]

  var transportLabel: String {
    switch mode {
    case .automobile: "Car"
    case .walking: "Walk"
    case .transit: transitKind?.label ?? "Transit"
    }
  }

  var transportIcon: String {
    switch mode {
    case .automobile: "car.fill"
    case .walking: "figure.walk"
    case .transit: transitKind?.icon ?? "tram.fill"
    }
  }

  var tier: SharedCommuteCorridorTier {
    if easeMinutes < preferredMinutes { return .tooClose }
    if easeMinutes <= maximumMinutes {
      return .ideal
    }
    return .tooFar
  }
}

private struct SharedComparisonRouteLeg: Identifiable {
  let id: String
  let mode: SharedCommuteMode
  let transitKind: SharedTransitKind?
  let minutes: Int
  let calloutCoordinate: CLLocationCoordinate2D

  var transportLabel: String {
    switch mode {
    case .automobile: "Car"
    case .walking: "Walk"
    case .transit: transitKind?.label ?? "Transit"
    }
  }

  var transportIcon: String {
    switch mode {
    case .automobile: "car.fill"
    case .walking: "figure.walk"
    case .transit: transitKind?.icon ?? "tram.fill"
    }
  }
}

private struct SharedRouteLegDraft {
  let mode: SharedCommuteMode
  let transitKind: SharedTransitKind?
  var distance: CLLocationDistance
  var coordinates: [SharedRouteCoordinate]
}

private struct SharedWorkNode: Identifiable {
  let id: String
  let destination: String
  let memberNames: [String]
  let isAdditionalPoint: Bool
  let commuteAccesses: [String]
  let coordinate: CLLocationCoordinate2D
  let preferredMinutes: Int
  let maximumMinutes: Int
}

private struct SharedListingComparisonScore {
  let total: Int
  let values: [SharedComparisonCriterion: Int]
  let weights: [SharedComparisonCriterion: Double]
  let knownCriteria: Set<SharedComparisonCriterion>
  let details: [SharedComparisonCriterion: String]
  let modelEvidence: [String]

  var color: Color {
    Self.color(for: total)
  }

  static func color(for total: Int) -> Color {
    let value = min(max(Double(total), 0), 100)
    let stops: [(Double, (Double, Double, Double))] = [
      (0, (0.94, 0.28, 0.35)),
      (50, (0.98, 0.72, 0.42)),
      (72, (0.31, 0.74, 0.96)),
      (100, (0.40, 0.90, 0.60))
    ]
    for index in 1..<stops.count where value <= stops[index].0 {
      let lower = stops[index - 1]
      let upper = stops[index]
      let fraction = (value - lower.0) / (upper.0 - lower.0)
      return Color(
        red: lower.1.0 + (upper.1.0 - lower.1.0) * fraction,
        green: lower.1.1 + (upper.1.1 - lower.1.1) * fraction,
        blue: lower.1.2 + (upper.1.2 - lower.1.2) * fraction
      )
    }
    return Color(red: 0.40, green: 0.90, blue: 0.60)
  }

  var label: String {
    switch total {
    case 80...100: "Strong fit"
    case 65..<80: "Promising"
    case 50..<65: "Tradeoffs"
    default: "Weak fit"
    }
  }
}

private struct SharedSearchFilters: Equatable {
  var maxPrice = ""
  var minimumBedrooms = ""
  var locationQuery = ""

  var activeCount: Int {
    [maxPrice, minimumBedrooms, locationQuery]
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .count
  }

  var maximumPrice: Double? {
    numericValue(maxPrice)
  }

  var minimumBedroomCount: Double? {
    Double(minimumBedrooms)
  }

  var normalizedLocationQuery: String? {
    let value = locationQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }

  func includes(_ listing: ListingPreview) -> Bool {
    if let maximum = numericValue(maxPrice), let price = numericValue(listing.priceLine), price > maximum {
      return false
    }
    if let minimum = Double(minimumBedrooms), let bedrooms = Double(listing.bedrooms), bedrooms < minimum {
      return false
    }
    let query = locationQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if !query.isEmpty && !"\(listing.title) \(listing.location)".lowercased().contains(query) {
      return false
    }
    return true
  }

  private func numericValue(_ input: String) -> Double? {
    let digits = input.filter { $0.isNumber || $0 == "." }
    return Double(digits)
  }
}

private struct SharedCoordinateBounds: Equatable {
  let coordinates: [CLLocationCoordinate2D]

  init?(_ coordinates: [CLLocationCoordinate2D]) {
    guard coordinates.count >= 3 else { return nil }
    self.coordinates = coordinates
  }

  static func == (lhs: SharedCoordinateBounds, rhs: SharedCoordinateBounds) -> Bool {
    guard lhs.coordinates.count == rhs.coordinates.count else { return false }
    return zip(lhs.coordinates, rhs.coordinates).allSatisfy { left, right in
      left.latitude == right.latitude && left.longitude == right.longitude
    }
  }

  func contains(_ coordinate: CLLocationCoordinate2D) -> Bool {
    guard coordinates.count >= 3 else { return false }
    let x = coordinate.longitude
    let y = coordinate.latitude
    var isInside = false
    var previousIndex = coordinates.count - 1

    for index in coordinates.indices {
      let current = coordinates[index]
      let previous = coordinates[previousIndex]
      let crossesLatitude = (current.latitude > y) != (previous.latitude > y)

      if crossesLatitude {
        let crossingLongitude =
          (previous.longitude - current.longitude)
          * (y - current.latitude)
          / (previous.latitude - current.latitude)
          + current.longitude
        if x < crossingLongitude {
          isInside.toggle()
        }
      }
      previousIndex = index
    }

    return isInside
  }
}

private struct SharedCommuteRoute: Identifiable {
  let id = UUID()
  let memberName: String
  let destination: String
  let route: MKRoute
  let color: Color
  let mode: SharedCommuteMode

  var duration: String {
    "\(max(Int((route.expectedTravelTime / 60).rounded()), 1)) min"
  }

  var distance: String {
    let miles = route.distance / 1609.344
    return miles < 10 ? String(format: "%.1f mi", miles) : String(format: "%.0f mi", miles)
  }
}

struct SharedSearchMapView: View {
  @Environment(AppModel.self) private var appModel
  @State private var cameraPosition: MapCameraPosition = .automatic
  @State private var presentation = SharedSearchPresentation.map
  @State private var filters = SharedSearchFilters()
  @State private var showsFilters = false
  @State private var isDrawingArea = false
  @State private var selectedBounds: SharedCoordinateBounds?
  @State private var selectedScreenRectangle: CGRect?
  @State private var dragStart: CGPoint?
  @State private var dragEnd: CGPoint?
  @State private var selectedListing: ListingPreview?
  @State private var detailListing: ListingPreview?
  @State private var showsAddListing = false
  @State private var showsListingDiscovery = false
  @State private var showsSettings = false
  @State private var isCleaningListings = false
  @State private var cleanListingSelection = Set<ListingPreview.ID>()
  @State private var confirmsCleaningListings = false
  @State private var resolvedCoordinates: [String: CLLocationCoordinate2D] = [:]
  @State private var preparedMapItems: [SharedListingMapItem] = []
  @State private var filteredMapItems: [SharedListingMapItem] = []
  @State private var renderedClusters: [SharedListingMapCluster] = []
  @State private var visibleRegion: MKCoordinateRegion?
  @State private var cardClusterListingIDs: Set<String> = []
  @State private var commuteRoutes: [SharedCommuteRoute] = []
  @State private var isLoadingRoutes = false
  @State private var isComparisonActive = false
  @State private var showsComparisonSettings = false
  @State private var comparisonRanks = Dictionary(
    uniqueKeysWithValues: SharedComparisonCriterion.allCases.enumerated().map {
      ($0.element, min($0.offset + 1, 4))
    }
  )
  @State private var comparisonScores: [String: SharedListingComparisonScore] = [:]
  @State private var comparisonCityQuery = ""
  @State private var comparisonCityCenter: CLLocationCoordinate2D?
  @State private var commuteDestinationCoordinates: [String: CLLocationCoordinate2D] = [:]
  @State private var comparisonCommuteEvidence: [String: SharedComparisonCommuteEvidence] = [:]
  @State private var comparisonEvidenceSignatures: [String: String] = [:]
  @State private var comparisonCommuteCorridors: [SharedComparisonCommuteCorridor] = []
  @State private var selectedComparisonRouteListingID: String?
  @State private var expandedComparisonListing: ListingPreview?
  @State private var loadingComparisonRouteListingID: String?
  @State private var isLoadingComparisonTransit = false
  @State private var comparisonRoutingCompletedCount = 0
  @State private var comparisonRoutingTotalCount = 0
  @State private var comparisonRoutingFailedCount = 0
  @AppStorage("homeboard.map-comparison-priorities") private var storedComparisonPriorities = ""
  @AppStorage("homeboard.map-comparison-city") private var storedComparisonCity = ""
  @AppStorage("homeboard.guide.search.dismissed") private var searchGuideDismissed = false
  @AppStorage("homeboard.guide.first-listing.pending") private var firstListingGuidePending = false
  @AppStorage("homeboard.guide.safari-extension-v1.dismissed") private var safariExtensionGuideDismissed = false

  private var searchListings: [ListingPreview] {
    var seen = Set<String>()
    var listings =
      appModel.board.shortlist
      + appModel.listingInventory
      + (appModel.board.suggestions ?? [])
    if let selectedListing {
      listings.append(selectedListing)
    }
    return listings.filter { listing in
      let key = listing.listingId.isEmpty ? listing.id : listing.listingId
      return seen.insert(key).inserted
    }
  }

  private var savedListingKeys: Set<String> {
    Set(appModel.board.shortlist.map {
      $0.listingId.isEmpty ? $0.id : $0.listingId
    })
  }

  private var cleanableListingIDs: Set<ListingPreview.ID> {
    Set(appModel.board.shortlist.map(\.id))
  }

  private var mapItems: [SharedListingMapItem] {
    preparedMapItems
  }

  private var visibleMapItems: [SharedListingMapItem] {
    filteredMapItems
  }

  private var visibleCardItems: [SharedListingMapItem] {
    let clusterFiltered = cardClusterListingIDs.isEmpty
      ? filteredMapItems
      : filteredMapItems.filter { cardClusterListingIDs.contains($0.listing.id) }
    guard isComparisonActive else { return clusterFiltered }
    return clusterFiltered.sorted { left, right in
      let leftScore = comparisonScores[left.listing.id]?.total ?? Int.min
      let rightScore = comparisonScores[right.listing.id]?.total ?? Int.min
      if leftScore != rightScore { return leftScore > rightScore }
      return left.listing.id < right.listing.id
    }
  }

  private var displayedResultCount: Int {
    visibleCardItems.count
  }

  private var activeFilterCount: Int {
    filters.activeCount + (cardClusterListingIDs.isEmpty ? 0 : 1)
  }

  private var routableWorkMemberCount: Int {
    appModel.board.members.filter {
      $0.commuteAccess != "remote"
        && $0.commuteAccess != "skip"
        && !SharedListingText.commuteDestination($0.commuteLine).isEmpty
    }.count
  }

  private var currentListing: ListingPreview? {
    if let selectedListing, visibleMapItems.contains(where: { $0.listing.id == selectedListing.id }) {
      return selectedListing
    }
    if let offerItem = visibleMapItems.first(where: { $0.listing.activeOffer != nil }) {
      return offerItem.listing
    }
    return renderedClusters.first?.items.first?.listing ?? visibleMapItems.first?.listing
  }

  private var comparisonWorkNodes: [SharedWorkNode] {
    var groups: [String: (
      destination: String,
      names: Set<String>,
      additionalPointNames: Set<String>,
      commuteAccesses: Set<String>,
      coordinate: CLLocationCoordinate2D,
      preferredMinutes: Int,
      maximumMinutes: Int
    )] = [:]
    for member in appModel.board.members {
      guard member.commuteAccess != "remote", member.commuteAccess != "skip" else {
        continue
      }
      let destination = SharedListingText.commuteDestination(member.commuteLine)
      guard !destination.isEmpty,
            let coordinate = commuteDestinationCoordinates[destination]
      else { continue }
      let preferred = max(member.preferredCommuteMinutes ?? 0, 0)
      let maximum = max(
        member.maxCommuteMinutes ?? 45,
        preferred + 5
      )
      let key = destination.lowercased()
      if var existing = groups[key] {
        existing.names.insert(member.name)
        if member.status == "commute point" {
          existing.additionalPointNames.insert(member.name)
        }
        if let commuteAccess = member.commuteAccess {
          existing.commuteAccesses.insert(commuteAccess)
        }
        existing.preferredMinutes = min(existing.preferredMinutes, preferred)
        existing.maximumMinutes = min(existing.maximumMinutes, maximum)
        groups[key] = existing
      } else {
        groups[key] = (
          destination: destination,
          names: [member.name],
          additionalPointNames: member.status == "commute point" ? [member.name] : [],
          commuteAccesses: Set([member.commuteAccess].compactMap { $0 }),
          coordinate: coordinate,
          preferredMinutes: preferred,
          maximumMinutes: maximum
        )
      }
    }
    return groups.keys.sorted().compactMap { key in
      guard let group = groups[key] else { return nil }
      return SharedWorkNode(
        id: key,
        destination: group.destination,
        memberNames: group.names.sorted(),
        isAdditionalPoint: group.additionalPointNames.count == group.names.count,
        commuteAccesses: group.commuteAccesses.sorted(),
        coordinate: group.coordinate,
        preferredMinutes: group.preferredMinutes,
        maximumMinutes: group.maximumMinutes
      )
    }
  }

  private var selectedComparisonRouteListing: ListingPreview? {
    guard let selectedComparisonRouteListingID else { return nil }
    return searchListings.first { $0.id == selectedComparisonRouteListingID }
  }

  private var selectedComparisonRouteOptions: [SharedComparisonCommuteCorridor] {
    guard let selectedComparisonRouteListingID else { return [] }
    return comparisonCommuteCorridors
      .filter { $0.listingID == selectedComparisonRouteListingID }
      .sorted {
        if $0.targetID == $1.targetID {
          return $0.mode.cardOrder < $1.mode.cardOrder
        }
        return $0.targetID < $1.targetID
      }
  }

  private var primaryComparisonRouteCorridors: [SharedComparisonCommuteCorridor] {
    comparisonCommuteCorridors.filter { corridor in
      comparisonScores[corridor.listingID] != nil
        && comparisonCommuteEvidence[corridor.listingID]?.displayedRouteIDs.contains(
          "\(corridor.targetID)|\(corridor.mode.rawValue)"
        ) == true
    }
  }

  private var displayedComparisonRouteCorridors: [SharedComparisonCommuteCorridor] {
    primaryComparisonRouteCorridors.sorted { left, right in
      let leftIsSelected = left.listingID == selectedComparisonRouteListingID
      let rightIsSelected = right.listingID == selectedComparisonRouteListingID
      if leftIsSelected != rightIsSelected {
        return !leftIsSelected && rightIsSelected
      }
      return left.id < right.id
    }
  }

  private var selectedComparisonRouteCorridors: [SharedComparisonCommuteCorridor] {
    guard let selectedComparisonRouteListingID else { return [] }
    return primaryComparisonRouteCorridors.filter {
      $0.listingID == selectedComparisonRouteListingID
    }
  }

  private var selectedComparisonRouteLegs: [SharedComparisonRouteLeg] {
    selectedComparisonRouteCorridors.flatMap(\.legs)
  }

  private var topComparisonListingIDs: Set<String> {
    guard isComparisonActive else { return [] }
    return Set(
      comparisonScores
        .sorted {
          if $0.value.total != $1.value.total {
            return $0.value.total > $1.value.total
          }
          return $0.key < $1.key
        }
        .prefix(5)
        .map(\.key)
    )
  }

  private var routedComparisonListingCount: Int {
    let routedIDs = Set(primaryComparisonRouteCorridors.map(\.listingID))
    guard !cardClusterListingIDs.isEmpty else { return routedIDs.count }
    return routedIDs.intersection(cardClusterListingIDs).count
  }

  private var displayedComparisonScoreCount: Int {
    guard !cardClusterListingIDs.isEmpty else { return comparisonScores.count }
    return Set(comparisonScores.keys).intersection(cardClusterListingIDs).count
  }

  private var displayedComparisonRoutingTotalCount: Int {
    cardClusterListingIDs.isEmpty
      ? comparisonRoutingTotalCount
      : visibleCardItems.count
  }

  private var displayedComparisonRoutingCompletedCount: Int {
    guard !cardClusterListingIDs.isEmpty else {
      return comparisonRoutingCompletedCount
    }
    return cardClusterListingIDs.reduce(into: 0) { count, listingID in
      if comparisonEvidenceSignatures[listingID] != nil {
        count += 1
      }
    }
  }

  private var comparisonRouteStrokeStyle: StrokeStyle {
    StrokeStyle(
      lineWidth: 2.5,
      lineCap: .round,
      lineJoin: .round
    )
  }

  private func comparisonRouteLegColor(
    for leg: SharedComparisonRouteLeg
  ) -> Color {
    switch leg.mode {
    case .automobile:
      return Color(red: 0.98, green: 0.62, blue: 0.30)
    case .walking:
      return HomeboardPalette.success
    case .transit:
      switch leg.transitKind {
      case .bus:
        return Color(red: 0.32, green: 0.70, blue: 0.96)
      case .train:
        return Color(red: 0.70, green: 0.56, blue: 0.98)
      case .ferry:
        return Color(red: 0.28, green: 0.82, blue: 0.86)
      case .transit, nil:
        return HomeboardPalette.accent
      }
    }
  }

  private func comparisonRouteColor(
    for corridor: SharedComparisonCommuteCorridor
  ) -> Color {
    switch corridor.mode {
    case .automobile:
      return Color(red: 0.98, green: 0.62, blue: 0.30)
    case .walking:
      return HomeboardPalette.success
    case .transit:
      return Color(red: 0.45, green: 0.70, blue: 0.96)
    }
  }

  private var comparisonIsReady: Bool {
    comparisonScores.count >= 2
  }

  private func openComparisonSettings() {
    presentation = .map
    if comparisonCityQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      comparisonCityQuery = appModel.board.city
    }
    showsComparisonSettings = true
  }

  private var hasCommuteDestinations: Bool {
    appModel.board.members.contains {
      $0.commuteAccess != "remote"
        && $0.commuteAccess != "skip"
        && !SharedListingText.commuteDestination($0.commuteLine).isEmpty
    }
  }

  private var comparisonRoutingSignature: String {
    let center = comparisonCityCenter
      .map { String(format: "%.4f,%.4f", $0.latitude, $0.longitude) }
      ?? "unresolved"
    let listings = preparedMapItems
      .filter(\.hasReliableCoordinate)
      .map {
        "\($0.listing.id):\(String(format: "%.4f", $0.coordinate.latitude)),\(String(format: "%.4f", $0.coordinate.longitude))"
      }
      .sorted()
      .joined(separator: "|")
    return "\(center)|\(listings)"
  }

  var body: some View {
    ZStack {
      if presentation == .map {
        MapReader { mapProxy in
          ZStack {
            Map(
              position: $cameraPosition,
              interactionModes: selectedScreenRectangle == nil ? [.pan, .zoom] : []
            ) {
              if isComparisonActive {
                ForEach(renderedClusters) { cluster in
                  if let score = comparisonScore(for: cluster) {
                    MapCircle(
                      center: cluster.coordinate,
                      radius: comparisonZoneRadius(for: cluster) * 1.24
                    )
                    .foregroundStyle(
                      comparisonRegionTier(for: score.total).color.opacity(0.07)
                    )

                    MapCircle(
                      center: cluster.coordinate,
                      radius: comparisonZoneRadius(for: cluster)
                    )
                    .foregroundStyle(
                      comparisonRegionTier(for: score.total).color.opacity(0.18)
                    )
                  }
                }

                ForEach(displayedComparisonRouteCorridors.filter {
                  $0.listingID != selectedComparisonRouteListingID
                }) { corridor in
                  MapPolyline(corridor.polyline)
                    .stroke(
                      comparisonRouteColor(for: corridor).opacity(
                        selectedComparisonRouteListingID == nil ? 0.76 : 0.46
                      ),
                      style: comparisonRouteStrokeStyle
                    )
                }

                ForEach(selectedComparisonRouteCorridors) { corridor in
                  MapPolyline(corridor.polyline)
                    .stroke(
                      comparisonRouteColor(for: corridor),
                      style: comparisonRouteStrokeStyle
                    )
                }

                ForEach(selectedComparisonRouteLegs) { leg in
                  Annotation(
                    "\(leg.transportLabel), about \(leg.minutes) minutes",
                    coordinate: leg.calloutCoordinate,
                    anchor: .center
                  ) {
                    SharedRouteLegCallout(
                      leg: leg,
                      color: comparisonRouteLegColor(for: leg)
                    )
                  }
                }

                ForEach(comparisonWorkNodes) { workNode in
                  Annotation(
                    "Work",
                    coordinate: workNode.coordinate,
                    anchor: .bottom
                  ) {
                    SharedWorkNodeMarker(workNode: workNode)
                  }
                }
              }

              if !isComparisonActive {
                ForEach(commuteRoutes) { commute in
                  MapPolyline(commute.route.polyline)
                    .stroke(
                      commute.color.opacity(0.82),
                      style: comparisonRouteStrokeStyle
                    )
                }
              }

              ForEach(renderedClusters) { cluster in
                Annotation(cluster.accessibilityLabel, coordinate: cluster.coordinate, anchor: .bottom) {
                  if let item = cluster.singleItem {
                    Button {
                      withAnimation(.snappy(duration: 0.24)) {
                        selectedListing = item.listing
                        if isComparisonActive {
                          selectedComparisonRouteListingID = item.listing.id
                        }
                      }
                      if isComparisonActive {
                        Task {
                          await loadComparisonRouteOptions(for: item)
                        }
                      }
                    } label: {
                      VStack(spacing: 4) {
                        if isComparisonActive,
                           selectedComparisonRouteListingID == item.listing.id {
                          SharedSelectedTransportPopup(
                            routes: comparisonCommuteCorridors.filter {
                              $0.listingID == item.listing.id
                            },
                            isLoading: loadingComparisonRouteListingID == item.listing.id
                          )
                        }

                        SharedPriceMarker(
                          text: isComparisonActive
                            ? comparisonScores[item.listing.id].map { "\($0.total)" } ?? "Not scored"
                            : SharedListingText.compactPrice(item.listing.priceLine),
                          isSelected: selectedListing?.id == item.listing.id,
                          comparisonScore: isComparisonActive ? comparisonScores[item.listing.id] : nil,
                          comparisonColor: isComparisonActive
                            ? comparisonScores[item.listing.id].map {
                                comparisonRegionTier(for: $0.total).color
                              }
                            : nil,
                          isHighlighted: topComparisonListingIDs.contains(item.listing.id)
                        )
                      }
                    }
                    .buttonStyle(HomeboardAreaButtonStyle())
                  } else {
                    Button {
                      filterCardsToCluster(cluster)
                    } label: {
                      SharedListingClusterMarker(
                        count: cluster.items.count,
                        isSelected: Set(cluster.items.map { $0.listing.id }) == cardClusterListingIDs,
                        comparisonScore: isComparisonActive ? comparisonScore(for: cluster) : nil,
                        comparisonColor: isComparisonActive
                          ? comparisonScore(for: cluster).map {
                              comparisonRegionTier(for: $0.total).color
                            }
                          : nil
                      )
                    }
                    .buttonStyle(HomeboardAreaButtonStyle())
                  }
                }
              }
            }
            .mapStyle(
              .standard(
                elevation: .flat,
                pointsOfInterest: .excludingAll,
                showsTraffic: false
              )
            )
            .mapControlVisibility(.hidden)
            .ignoresSafeArea(edges: .top)
            .onMapCameraChange(frequency: .onEnd) { context in
              visibleRegion = context.region
              rebuildMapPresentation()
              if !isComparisonActive {
                Task {
                  await loadMapInventory(in: context.region)
                }
              }
            }

            if let selectedScreenRectangle {
              Rectangle()
                .fill(HomeboardPalette.accent.opacity(0.14))
                .stroke(HomeboardPalette.accent, lineWidth: 2)
                .frame(
                  width: selectedScreenRectangle.width,
                  height: selectedScreenRectangle.height
                )
                .position(
                  x: selectedScreenRectangle.midX,
                  y: selectedScreenRectangle.midY
                )
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }

            if isDrawingArea {
              GeometryReader { _ in
                ZStack {
                  Color.black.opacity(0.08)

                  if let dragStart, let dragEnd {
                    Rectangle()
                      .fill(HomeboardPalette.accent.opacity(0.14))
                      .stroke(HomeboardPalette.accent, style: StrokeStyle(lineWidth: 2, dash: [7, 5]))
                      .frame(
                        width: abs(dragEnd.x - dragStart.x),
                        height: abs(dragEnd.y - dragStart.y)
                      )
                      .position(
                        x: (dragStart.x + dragEnd.x) / 2,
                        y: (dragStart.y + dragEnd.y) / 2
                      )
                  }
                }
                .contentShape(Rectangle())
                .gesture(
                  DragGesture(
                    minimumDistance: 8,
                    coordinateSpace: .named("shared-search-map")
                  )
                    .onChanged { value in
                      dragStart = value.startLocation
                      dragEnd = value.location
                    }
                    .onEnded { value in
                      defer {
                        dragStart = nil
                        dragEnd = nil
                        isDrawingArea = false
                      }
                      let rectangle = CGRect(
                        x: min(value.startLocation.x, value.location.x),
                        y: min(value.startLocation.y, value.location.y),
                        width: abs(value.location.x - value.startLocation.x),
                        height: abs(value.location.y - value.startLocation.y)
                      )
                      guard rectangle.width >= 12, rectangle.height >= 12 else { return }

                      let screenCorners = [
                        CGPoint(x: rectangle.minX, y: rectangle.minY),
                        CGPoint(x: rectangle.maxX, y: rectangle.minY),
                        CGPoint(x: rectangle.maxX, y: rectangle.maxY),
                        CGPoint(x: rectangle.minX, y: rectangle.maxY)
                      ]
                      let mapCorners = screenCorners.compactMap {
                        mapProxy.convert($0, from: .named("shared-search-map"))
                      }
                      guard let bounds = SharedCoordinateBounds(mapCorners) else { return }
                      selectedBounds = bounds
                      selectedScreenRectangle = rectangle
                      selectedListing = nil
                    }
                )
                .overlay(alignment: .top) {
                  Text("Drag over the area you want to search")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.black)
                    .padding(.horizontal, 14)
                    .frame(height: 34)
                    .background(HomeboardPalette.accent)
                    .clipShape(Capsule())
                    .padding(.top, 82)
                }
              }
            }
          }
          .coordinateSpace(name: "shared-search-map")
        }
      } else {
        SharedSearchListSurface(
          listings: visibleCardItems.map(\.listing),
          comparisonScores: isComparisonActive ? comparisonScores : [:],
          topListingIDs: topComparisonListingIDs,
          selectedListingID: selectedListing?.id,
          cleanableListingIDs: cleanableListingIDs,
          cleanSelection: cleanListingSelection,
          isCleaning: isCleaningListings,
          isLoading: appModel.isListingInventoryLoading,
          hasMore: appModel.listingInventoryHasMore,
          onOpen: selectListingFromCards,
          onToggleCleanSelection: { listing in
            guard cleanableListingIDs.contains(listing.id) else { return }
            if cleanListingSelection.contains(listing.id) {
              cleanListingSelection.remove(listing.id)
            } else {
              cleanListingSelection.insert(listing.id)
            }
          },
          onBrowse: { showsListingDiscovery = true },
          onLoadMore: {
            Task {
              await loadCardInventory(append: true)
            }
          }
        )
      }
    }
    .safeAreaInset(edge: .top, spacing: 0) {
      VStack(spacing: 8) {
        SharedSearchHeader(
          board: appModel.board,
          onAdd: { showsListingDiscovery = true },
          onSettings: { showsSettings = true }
        )

        SharedSearchControlBar(
          presentation: $presentation,
          resultCount: displayedResultCount,
          filterCount: activeFilterCount,
          hasArea: selectedBounds != nil,
          drawingArea: isDrawingArea,
          comparisonActive: isComparisonActive,
          comparisonReady: comparisonIsReady,
          cleanableCount: cleanableListingIDs.count,
          isCleaning: isCleaningListings,
          onFilter: { showsFilters = true },
          onClean: {
            withAnimation(.easeInOut(duration: 0.18)) {
              isCleaningListings.toggle()
              cleanListingSelection.removeAll()
            }
          },
          onDraw: {
            presentation = .map
            isDrawingArea.toggle()
          },
          onClearArea: {
            selectedBounds = nil
            selectedScreenRectangle = nil
            isDrawingArea = false
            focusMap()
          }
        )

        if !cardClusterListingIDs.isEmpty {
          SharedClusterCardFilterBar(
            count: visibleCardItems.count,
            onClear: { cardClusterListingIDs = [] }
          )
          .transition(.move(edge: .top).combined(with: .opacity))
        }

        if presentation == .list, isCleaningListings {
          SharedCleanListingsActionBar(
            selectedCount: cleanListingSelection.count,
            onCancel: {
              withAnimation(.easeInOut(duration: 0.18)) {
                isCleaningListings = false
                cleanListingSelection.removeAll()
              }
            },
            onMove: { confirmsCleaningListings = true }
          )
          .transition(.move(edge: .top).combined(with: .opacity))
        }

        if appModel.isListingInventoryLoading || appModel.isRestoredBoardRefreshing {
          HomeboardSkeletonBlock(width: 92, height: 9, cornerRadius: 5)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .accessibilityLabel("Refreshing map data")
        }
      }
      .padding(.horizontal, 14)
      .padding(.top, 8)
      .padding(.bottom, 8)
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if presentation == .map {
        VStack(spacing: 8) {
          if !visibleMapItems.isEmpty || isComparisonActive {
            SharedGroupCommuteComparisonButton(
              isActive: isComparisonActive,
              action: openComparisonSettings
            )
          }

          if isComparisonActive {
            if let listing = selectedComparisonRouteListing,
               let score = comparisonScores[listing.id] {
              SharedComparisonNodeRouteCard(
                listing: listing,
                score: score,
                tier: comparisonRegionTier(for: score.total),
                routes: selectedComparisonRouteOptions,
                isLoading: loadingComparisonRouteListingID == listing.id,
                onOpen: { expandedComparisonListing = listing },
                onDismiss: {
                  withAnimation(.easeInOut(duration: 0.18)) {
                    selectedComparisonRouteListingID = nil
                    selectedListing = nil
                  }
                }
              )
            } else {
              SharedComparisonTierLegend(
                listingCount: displayedComparisonScoreCount,
                routedListingCount: routedComparisonListingCount,
                routedWorkMemberCount: routableWorkMemberCount,
                isLoadingCommutes: isLoadingComparisonTransit,
                routingCompletedCount: displayedComparisonRoutingCompletedCount,
                routingTotalCount: displayedComparisonRoutingTotalCount,
                routingFailedCount: comparisonRoutingFailedCount,
                commuteAvailable: hasCommuteDestinations
              )
            }
          } else if let listing = currentListing {
            if !commuteRoutes.isEmpty || isLoadingRoutes {
              SharedCommuteRouteStrip(routes: commuteRoutes, isLoading: isLoadingRoutes)
            }

            SharedMapPreviewCard(listing: listing) {
              detailListing = listing
            }
          } else if !isComparisonActive {
            SharedMapEmptyCard(
              city: appModel.board.city,
              onBrowse: { showsListingDiscovery = true }
            )
          }
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(
          LinearGradient(
            colors: [
              .clear,
              HomeboardPalette.background.opacity(0.72),
              HomeboardPalette.background.opacity(0.96)
            ],
            startPoint: .top,
            endPoint: .bottom
          )
          .ignoresSafeArea()
        )
      }
    }
    .toolbar(.hidden, for: .navigationBar)
    .onAppear {
      restoreComparisonSettings()
      prepareMapItems()
      focusMap()
      let region = visibleRegion ?? defaultMapRegion()
      Task {
        await loadMapInventory(in: region)
      }
    }
    .onChange(of: searchListings.map(\.id)) {
      prepareMapItems()
    }
    .onChange(of: filters) {
      rebuildMapPresentation()
      if !isComparisonActive {
        Task {
          if presentation == .map {
            await loadMapInventory(in: visibleRegion ?? defaultMapRegion())
          } else {
            await loadCardInventory()
          }
        }
      }
    }
    .onChange(of: comparisonRanks) {
      storedComparisonPriorities = SharedComparisonCriterion.allCases
        .map { "\($0.rawValue):\(comparisonRanks[$0] ?? 4)" }
        .joined(separator: ",")
      rebuildMapPresentation()
    }
    .onChange(of: isComparisonActive) {
      selectedListing = nil
      commuteRoutes = []
      selectedComparisonRouteListingID = nil
      loadingComparisonRouteListingID = nil
      rebuildMapPresentation()
      focusMap()
    }
    .task(
      id: "\(isComparisonActive)|\(storedComparisonCity)|\(appModel.board.members.map { "\($0.id):\($0.commuteLine):\($0.commuteAccess ?? "unknown"):\($0.preferredCommuteMinutes ?? 0):\($0.maxCommuteMinutes ?? 0)" }.joined(separator: "|"))|\(comparisonRoutingSignature)"
    ) {
      guard isComparisonActive else { return }
      await resolveComparisonCommuteDestinations()
      focusMap()
      await resolveComparisonCommuteEvidence()
      rebuildMapPresentation()
    }
    .onChange(of: selectedBounds) {
      rebuildMapPresentation()
    }
    .task(id: searchListings.map(\.id).joined(separator: "|")) {
      prepareMapItems()
      await resolveListingCoordinates()
    }
    .task(id: "\(currentListing?.id ?? "none")|\(resolvedCoordinates.count)") {
      if !isComparisonActive {
        await resolveCommuteRoutes()
      }
    }
    .onChange(of: presentation) {
      if presentation != .list {
        isCleaningListings = false
        cleanListingSelection.removeAll()
      }
      if !isComparisonActive {
        Task {
          if presentation == .map {
            await loadMapInventory(in: visibleRegion ?? defaultMapRegion())
          } else {
            await loadCardInventory()
          }
        }
      }
    }
    .confirmationDialog(
      "Move selected listings?",
      isPresented: $confirmsCleaningListings,
      titleVisibility: .visible
    ) {
      Button("Move to Recently Deleted", role: .destructive) {
        appModel.moveListingsToRecentlyDeleted(ids: cleanListingSelection)
        cleanListingSelection.removeAll()
        isCleaningListings = false
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("This removes the selected listings from the shared board for everyone. They can be restored from Settings for seven days.")
    }
    .sheet(isPresented: $showsAddListing, onDismiss: {
      appModel.resolvePendingSharedListingImport()
      appModel.consumeSharedListingImport()
    }) {
      AddSharedListingSheet(initialImport: appModel.pendingSharedListingImport)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsListingDiscovery) {
      SharedListingDiscoverySheet(city: appModel.board.city)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(item: $detailListing) { listing in
      SharedListingDetailView(listing: listing)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(item: $expandedComparisonListing) { listing in
      if let score = comparisonScores[listing.id] {
        SharedComparisonNodeDetailSheet(
          listing: listing,
          score: score,
          tier: comparisonRegionTier(for: score.total),
          routes: comparisonCommuteCorridors
            .filter { $0.listingID == listing.id }
            .sorted {
              if $0.targetID == $1.targetID {
                return $0.mode.cardOrder < $1.mode.cardOrder
              }
              return $0.targetID < $1.targetID
            },
          scoredRouteIDs: comparisonCommuteEvidence[listing.id]?.scoredRouteIDs ?? [],
          isLoading: isLoadingComparisonTransit
            || loadingComparisonRouteListingID == listing.id
        )
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
      }
    }
    .sheet(isPresented: $showsSettings) {
      SharedSettingsSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsFilters) {
      SharedSearchFilterSheet(filters: $filters)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsComparisonSettings) {
      SharedComparisonPrioritySheet(
        ranks: $comparisonRanks,
        cityQuery: $comparisonCityQuery,
        isActive: isComparisonActive,
        listingCount: searchListings.count,
        commuteAvailable: hasCommuteDestinations,
        onActivate: {
          storedComparisonCity = comparisonCityQuery
            .trimmingCharacters(in: .whitespacesAndNewlines)
          isComparisonActive = true
          Task {
            await resolveComparisonCity(focus: true)
          }
        },
        onDisable: { isComparisonActive = false }
      )
      .presentationDetents([.large])
      .presentationDragIndicator(.visible)
      .presentationBackground(HomeboardPalette.background)
    }
    .onChange(of: appModel.pendingSharedListingURL) { _, url in
      if url != nil {
        showsAddListing = true
      }
    }
    .onAppear {
      if appModel.pendingSharedListingImport != nil {
        showsAddListing = true
      }
    }
    .overlayPreferenceValue(SharedCoachmarkAnchorKey.self) { anchors in
      if !appModel.isGuestPreview {
        if firstListingGuidePending || !safariExtensionGuideDismissed {
          SharedListingShareWorkflowGuide(
            onDismiss: {
              firstListingGuidePending = false
              safariExtensionGuideDismissed = true
            }
          )
        } else if !searchGuideDismissed {
          SharedCoachmarkOverlay(
            target: anchors["search-controls"],
            title: "Use the top bar to work with listings",
            message: "Map and Cards change the view. Tap a numbered map cluster to filter Cards to those homes. Filters narrow the results, Area limits the map, and Compare ranks homes by price, commute, space, neighborhood, and features.",
            targetLabel: "MAP · CARDS · FILTERS · COMPARE",
            onDismiss: { searchGuideDismissed = true }
          )
        }
      }
    }
  }

  private func selectListingFromCards(_ listing: ListingPreview) {
    selectedListing = listing
    if isComparisonActive,
       let item = preparedMapItems.first(where: { $0.listing.id == listing.id }) {
      selectedComparisonRouteListingID = listing.id
      Task {
        await loadComparisonRouteOptions(for: item)
      }
    } else {
      detailListing = listing
    }
  }

  private func defaultMapRegion() -> MKCoordinateRegion {
    MKCoordinateRegion(
      center: SharedListingLocation.boardCenter(appModel.board.city),
      span: MKCoordinateSpan(latitudeDelta: 0.16, longitudeDelta: 0.16)
    )
  }

  private func prepareMapItems() {
    preparedMapItems = searchListings.enumerated().map { index, listing in
      let resolvedCoordinate = listing.coordinate ?? resolvedCoordinates[listing.id]
      return SharedListingMapItem(
        listing: listing,
        coordinate: resolvedCoordinate
          ?? SharedListingLocation.coordinate(
            for: listing,
            boardCity: appModel.board.city,
            index: index
          ),
        hasReliableCoordinate: resolvedCoordinate != nil
      )
    }
    rebuildMapPresentation()
  }

  private func rebuildMapPresentation() {
    let filtered = preparedMapItems.filter { item in
      return filters.includes(item.listing)
        && (selectedBounds?.contains(item.coordinate) ?? true)
    }
    filteredMapItems = filtered
    comparisonScores = isComparisonActive
      ? buildComparisonScores(for: filtered)
      : [:]

    if let selectedListing,
       !filtered.contains(where: { $0.listing.id == selectedListing.id }) {
      self.selectedListing = nil
      commuteRoutes = []
    }
    if let selectedComparisonRouteListingID,
       !filtered.contains(where: { $0.listing.id == selectedComparisonRouteListingID }) {
      self.selectedComparisonRouteListingID = nil
    }

    let region = visibleRegion ?? defaultMapRegion()
    let viewportItems = filtered.filter {
      region.contains($0.coordinate, padding: 0.28)
    }
    let visibleItems = viewportItems.isEmpty ? filtered : viewportItems
    renderedClusters = SharedListingMapCluster.build(
      items: visibleItems,
      region: region,
      priorityListingIDs: topComparisonListingIDs
    )
  }

  private var comparisonMetroRegion: MKCoordinateRegion {
    MKCoordinateRegion(
      center: comparisonCityCenter
        ?? SharedListingLocation.boardCenter(
          comparisonCityQuery.isEmpty ? appModel.board.city : comparisonCityQuery
        ),
      span: MKCoordinateSpan(latitudeDelta: 1.0, longitudeDelta: 1.18)
    )
  }

  private var comparisonFocusRegion: MKCoordinateRegion {
    let coordinates = preparedMapItems.map(\.coordinate)
      + comparisonWorkNodes.map(\.coordinate)
    guard let first = coordinates.first else { return comparisonMetroRegion }

    let bounds = coordinates.dropFirst().reduce(
      into: (
        minimumLatitude: first.latitude,
        maximumLatitude: first.latitude,
        minimumLongitude: first.longitude,
        maximumLongitude: first.longitude
      )
    ) { result, coordinate in
      result.minimumLatitude = min(result.minimumLatitude, coordinate.latitude)
      result.maximumLatitude = max(result.maximumLatitude, coordinate.latitude)
      result.minimumLongitude = min(result.minimumLongitude, coordinate.longitude)
      result.maximumLongitude = max(result.maximumLongitude, coordinate.longitude)
    }
    let latitudeDelta = min(
      max((bounds.maximumLatitude - bounds.minimumLatitude) * 1.30, 0.16),
      160
    )
    let longitudeDelta = min(
      max((bounds.maximumLongitude - bounds.minimumLongitude) * 1.30, 0.18),
      340
    )
    return MKCoordinateRegion(
      center: CLLocationCoordinate2D(
        latitude: (bounds.minimumLatitude + bounds.maximumLatitude) / 2,
        longitude: (bounds.minimumLongitude + bounds.maximumLongitude) / 2
      ),
      span: MKCoordinateSpan(
        latitudeDelta: latitudeDelta,
        longitudeDelta: longitudeDelta
      )
    )
  }

  private func comparisonScore(
    for cluster: SharedListingMapCluster
  ) -> SharedListingComparisonScore? {
    let scores = cluster.items.compactMap { comparisonScores[$0.listing.id] }
    guard !scores.isEmpty else { return nil }

    var values: [SharedComparisonCriterion: Int] = [:]
    var weights: [SharedComparisonCriterion: Double] = [:]
    for criterion in SharedComparisonCriterion.allCases {
      let known = scores.compactMap { score in
        score.knownCriteria.contains(criterion) ? score.values[criterion] : nil
      }
      guard !known.isEmpty else { continue }
      values[criterion] = Int(
        (Double(known.reduce(0, +)) / Double(known.count)).rounded()
      )
      let knownWeights = scores.compactMap { $0.weights[criterion] }
      if !knownWeights.isEmpty {
        weights[criterion] = knownWeights.reduce(0, +) / Double(knownWeights.count)
      }
    }

    return SharedListingComparisonScore(
      total: Int(
        (Double(scores.reduce(0) { $0 + $1.total }) / Double(scores.count)).rounded()
      ),
      values: values,
      weights: weights,
      knownCriteria: Set(values.keys),
      details: Dictionary(uniqueKeysWithValues: values.keys.map {
        ($0, "Average across \(scores.count) listings in this map cluster")
      }),
      modelEvidence: Array(
        scores.flatMap(\.modelEvidence).reduce(into: [String]()) { result, item in
          if !result.contains(item) { result.append(item) }
        }.prefix(3)
      )
    )
  }

  private func comparisonRegionTier(for total: Int) -> SharedComparisonRegionTier {
    let totals = comparisonScores.values.map(\.total)
    guard let minimum = totals.min(),
          let maximum = totals.max(),
          maximum - minimum >= 2
    else { return .strong }

    let position = Double(total - minimum) / Double(maximum - minimum)
    switch position {
    case 0.75...: return .best
    case 0.50..<0.75: return .strong
    case 0.25..<0.50: return .tradeoffs
    default: return .weak
    }
  }

  private func comparisonZoneRadius(
    for cluster: SharedListingMapCluster
  ) -> CLLocationDistance {
    let region = visibleRegion ?? comparisonMetroRegion
    let latitudeMeters = region.span.latitudeDelta * 111_000
    let longitudeMeters = region.span.longitudeDelta
      * 111_000
      * max(cos(region.center.latitude * .pi / 180), 0.25)
    let cellRadius = min(latitudeMeters / 8, longitudeMeters / 6) * 0.46
    let densityScale = min(1.28, 1 + log2(Double(max(cluster.items.count, 1))) * 0.08)
    return min(max(cellRadius * densityScale, 320), 12_000)
  }

  private func buildComparisonScores(
    for items: [SharedListingMapItem]
  ) -> [String: SharedListingComparisonScore] {
    guard !items.isEmpty else { return [:] }

    let prices = items.compactMap {
      SharedListingText.numericValue($0.listing.priceLine)
    }
    let spaces = items.compactMap { comparisonSpaceValue($0.listing) }

    var result: [String: SharedListingComparisonScore] = [:]
    for item in items {
      let listing = item.listing
      let commuteEvidence = comparisonCommuteEvidence[listing.id]
      if isLoadingComparisonTransit,
         !comparisonWorkNodes.isEmpty,
         item.hasReliableCoordinate,
         commuteEvidence == nil {
        continue
      }
      let commuteValue = comparisonWorkNodes.isEmpty
        ? nil
        : commuteEvidence?.score
      let relativePrice = SharedListingText.numericValue(listing.priceLine).map {
        relativeComparisonScore(
          $0,
          values: prices,
          higherIsBetter: false
        )
      }
      let relativeSpace = comparisonSpaceValue(listing).map {
        relativeComparisonScore(
          $0,
          values: spaces,
          higherIsBetter: true
        )
      }
      let rawPrice = blendedComparisonScore(
        analysisScore(listing, dimension: "price"),
        ratingScore(listing, dimension: "value"),
        relativePrice
      )
      let activeOffer = listing.activeOffer
      let offerBonus = activeOffer.map { SharedComparisonMath.offerBonusPoints(for: $0) } ?? 0
      let adjustedPrice = rawPrice.map {
        SharedComparisonMath.adjustedPriceScore(baseScore: $0, bonusPoints: offerBonus)
      }

      let criterionValues: [SharedComparisonCriterion: Double?] = [
        .price: adjustedPrice,
        .commute: commuteValue,
        .space: blendedComparisonScore(
          analysisScore(listing, dimension: "space"),
          ratingScore(listing, dimension: "space"),
          relativeSpace,
          modelInsightScore(
            listing,
            categories: ["space", "layout", "storage", "light"]
          )
        ),
        .neighborhood: blendedComparisonScore(
          analysisScore(listing, dimension: "location"),
          ratingScore(listing, dimension: "neighborhood"),
          neighborhoodPreferenceScore(listing),
          modelInsightScore(
            listing,
            categories: ["neighborhood", "noise", "transit", "outdoor"]
          )
        ),
        .features: blendedComparisonScore(
          nil,
          ratingScore(listing, dimension: "amenities"),
          modelPreferenceScore(listing),
          modelInsightScore(
            listing,
            categories: ["amenity", "interior", "building", "light", "layout", "storage", "outdoor", "fee", "risk"]
          )
        )
      ]

      var weightedTotal = 0.0
      var knownWeight = 0.0
      var values: [SharedComparisonCriterion: Int] = [:]
      var rawWeights: [SharedComparisonCriterion: Double] = [:]
      for criterion in SharedComparisonCriterion.allCases {
        guard let optionalValue = criterionValues[criterion],
              let value = optionalValue
        else { continue }
        let rank = min(max(comparisonRanks[criterion] ?? 4, 1), 4)
        let weight = SharedComparisonMath.priorityWeight(for: rank)
        weightedTotal += value * weight
        knownWeight += weight
        values[criterion] = Int(value.rounded())
        rawWeights[criterion] = weight
      }

      guard knownWeight > 0 else { continue }
      let weights = rawWeights.mapValues { $0 / knownWeight }
      let priceDetail: String
      if let activeOffer, offerBonus > 0 {
        priceDetail = "\(listing.priceLine) · includes +\(offerBonus) pts for active offer (\(activeOffer.badgeLabel))"
      } else {
        priceDetail = "\(listing.priceLine) compared with the other visible listings and your budget"
      }
      var details: [SharedComparisonCriterion: String] = [
        .price: priceDetail,
        .space: listing.squareFeet.map { "\($0.formatted()) sq ft plus bedroom, bathroom, and layout evidence" }
          ?? "Bedroom, bathroom, layout, and roommate space evidence",
        .neighborhood: "Saved neighborhood preferences, group ratings, and grounded listing insights",
        .features: "Amenities, finishes, light, layout, and risk evidence found in the listing"
      ]
      if let commuteEvidence,
         commuteEvidence.suppressedLongRouteDestinations > 0,
         commuteEvidence.resolvedDestinations == commuteEvidence.requestedDestinations {
        let count = commuteEvidence.suppressedLongRouteDestinations
        let noun = count == 1 ? "destination is" : "destinations are"
        let routedNote = commuteEvidence.averageMinutes > 0
          ? " Other live routes average \(commuteEvidence.averageMinutes) min."
          : ""
        details[.commute] = "\(count) work \(noun) certainly outside the saved commute range and scored 0. Extreme route lines are omitted.\(routedNote)"
      } else if let commuteEvidence,
         commuteEvidence.resolvedDestinations == commuteEvidence.requestedDestinations {
        let walkingNote = commuteEvidence.usedWalkingFallback ? " · walking was the easiest usable route" : ""
        let easeNote = commuteEvidence.averageEaseMinutes == commuteEvidence.averageMinutes
          ? ""
          : " · \(commuteEvidence.averageEaseMinutes) min ease-adjusted"
        details[.commute] = "Best usable live routes · \(commuteEvidence.averageMinutes) min average\(easeNote) · \(commuteEvidence.resolvedDestinations)/\(commuteEvidence.requestedDestinations) work destinations\(walkingNote)"
      } else if let commuteEvidence {
        details[.commute] = "Live Apple routes found for \(commuteEvidence.resolvedDestinations)/\(commuteEvidence.requestedDestinations) work destinations. Commute stays unscored until every destination resolves."
      } else {
        details[.commute] = comparisonWorkNodes.isEmpty
          ? "Commute excluded because no routable office area is saved"
          : "No usable live route was returned, so commute remains unscored"
      }
      result[listing.id] = SharedListingComparisonScore(
        total: Int((weightedTotal / knownWeight).rounded()),
        values: values,
        weights: weights,
        knownCriteria: Set(values.keys),
        details: details,
        modelEvidence: modelEvidenceLabels(listing)
      )
    }
    return result
  }

  private func analysisScore(
    _ listing: ListingPreview,
    dimension: String
  ) -> Double? {
    let values = listing.analysis?.members.compactMap {
      $0.dimensions[dimension]?.score
    } ?? []
    guard !values.isEmpty else { return nil }
    return values.reduce(0, +) / Double(values.count)
  }

  private func ratingScore(
    _ listing: ListingPreview,
    dimension: String
  ) -> Double? {
    let values = listing.ratings.compactMap { rating -> Double? in
      guard let value = rating.values[dimension] else { return nil }
      return Double(min(max(value, 1), 5) - 1) * 25
    }
    guard !values.isEmpty else { return nil }
    return values.reduce(0, +) / Double(values.count)
  }

  private func blendedComparisonScore(
    _ analysis: Double?,
    _ rating: Double?,
    _ fallback: Double?,
    _ modelEvidence: Double? = nil
  ) -> Double? {
    let parts: [(Double?, Double)] = [
      (analysis, 0.48),
      (rating, 0.27),
      (fallback, 0.18),
      (modelEvidence, 0.07)
    ]
    let known = parts.compactMap { value, weight in
      value.map { ($0, weight) }
    }
    guard !known.isEmpty else { return nil }
    let weight = known.reduce(0) { $0 + $1.1 }
    return known.reduce(0) { $0 + $1.0 * $1.1 } / weight
  }

  private func relativeComparisonScore(
    _ value: Double,
    values: [Double],
    higherIsBetter: Bool
  ) -> Double {
    guard let minimum = values.min(),
          let maximum = values.max(),
          maximum > minimum
    else { return 75 }
    let normalized = (value - minimum) / (maximum - minimum)
    let direction = higherIsBetter ? normalized : 1 - normalized
    return 30 + direction * 70
  }

  private func comparisonSpaceValue(_ listing: ListingPreview) -> Double? {
    if let squareFeet = listing.squareFeet, squareFeet > 0 {
      return Double(squareFeet)
    }
    let bedrooms = Double(listing.bedrooms)
    let bathrooms = Double(listing.bathrooms)
    guard bedrooms != nil || bathrooms != nil else { return nil }
    return (bedrooms ?? 0) * 100 + (bathrooms ?? 0) * 24
  }

  private func modelInsightScore(
    _ listing: ListingPreview,
    categories: Set<String>
  ) -> Double? {
    let evidence = listing.modelInsights.filter {
      $0.confidence >= 0.55 && categories.contains($0.category.lowercased())
    }
    guard !evidence.isEmpty else { return nil }
    let weighted = evidence.reduce(into: (total: 0.0, weight: 0.0)) { result, insight in
      let confidence = min(max(insight.confidence, 0), 1)
      let boundedSentiment = min(max(insight.sentiment, -1), 1)
      result.total += (50 + boundedSentiment * 42) * confidence
      result.weight += confidence
    }
    guard weighted.weight > 0 else { return nil }
    return min(max(weighted.total / weighted.weight, 0), 100)
  }

  private func modelPreferenceScore(_ listing: ListingPreview) -> Double? {
    let searchable = (
      listing.amenities
        + listing.modelInsights.filter { $0.confidence >= 0.55 }.flatMap {
          [$0.label, $0.evidence]
        }
    ).joined(separator: " ").lowercased()
    guard !searchable.isEmpty else { return nil }

    var observations: [Double] = []
    for member in appModel.board.members {
      for value in member.mustHaves ?? [] {
        let token = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard token.count >= 3, searchable.contains(token) else { continue }
        observations.append(92)
      }
      for value in member.dealbreakers {
        let token = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard token.count >= 3, searchable.contains(token) else { continue }
        observations.append(8)
      }
    }
    guard !observations.isEmpty else { return nil }
    return observations.reduce(0, +) / Double(observations.count)
  }

  private func modelEvidenceLabels(_ listing: ListingPreview) -> [String] {
    listing.modelInsights
      .filter { $0.confidence >= 0.55 }
      .sorted {
        if $0.confidence != $1.confidence { return $0.confidence > $1.confidence }
        return abs($0.sentiment) > abs($1.sentiment)
      }
      .prefix(3)
      .map { $0.sentiment < -0.15 ? "Watch: \($0.label)" : $0.label }
  }

  private func neighborhoodPreferenceScore(
    _ listing: ListingPreview
  ) -> Double? {
    let searchable = "\(listing.title) \(listing.location)".lowercased()
    let memberScores = appModel.board.members.compactMap { member -> Double? in
      let preferences = member.neighborhoods
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        .filter { !$0.isEmpty }
      guard !preferences.isEmpty else { return nil }
      return preferences.contains(where: {
        searchable.contains($0) || $0.contains(searchable)
      }) ? 100 : 40
    }
    guard !memberScores.isEmpty else { return nil }
    return memberScores.reduce(0, +) / Double(memberScores.count)
  }

  private func restoreComparisonSettings() {
    let savedParts = storedComparisonPriorities.split(separator: ",")
    let rankedPairs = savedParts.compactMap { part -> (SharedComparisonCriterion, Int)? in
      let components = part.split(separator: ":", maxSplits: 1)
      guard components.count == 2,
            let criterion = SharedComparisonCriterion(rawValue: String(components[0])),
            let rank = Int(components[1]),
            (1...4).contains(rank)
      else { return nil }
      return (criterion, rank)
    }
    if rankedPairs.count == SharedComparisonCriterion.allCases.count {
      comparisonRanks = Dictionary(uniqueKeysWithValues: rankedPairs)
    } else {
      let oldOrder = savedParts.compactMap {
        SharedComparisonCriterion(rawValue: String($0))
      }
      if oldOrder.count == SharedComparisonCriterion.allCases.count,
         Set(oldOrder) == Set(SharedComparisonCriterion.allCases) {
        comparisonRanks = Dictionary(
          uniqueKeysWithValues: oldOrder.enumerated().map {
            ($0.element, min($0.offset + 1, 4))
          }
        )
      }
    }

    comparisonCityQuery = storedComparisonCity
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if comparisonCityQuery.isEmpty {
      comparisonCityQuery = appModel.board.city
    }
    comparisonCityCenter = SharedListingLocation.boardCenter(comparisonCityQuery)
  }

  private func resolveComparisonCity(focus: Bool) async {
    let query = comparisonCityQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return }

    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = query
    let resolved = try? await MKLocalSearch(request: request).start()
    comparisonCityCenter = resolved?.mapItems.first?.placemark.coordinate
      ?? SharedListingLocation.boardCenter(query)
    storedComparisonCity = query
    rebuildMapPresentation()

    if focus {
      let region = comparisonFocusRegion
      visibleRegion = region
      withAnimation(.easeInOut(duration: 0.24)) {
        cameraPosition = .region(region)
      }
    }
  }

  private func resolveComparisonCommuteDestinations() async {
    let destinations = Set(
      appModel.board.members.compactMap { member -> String? in
        guard member.commuteAccess != "remote", member.commuteAccess != "skip" else {
          return nil
        }
        let target = SharedListingText.commuteDestination(member.commuteLine)
        return target.isEmpty ? nil : target
      }
    )
    var next = commuteDestinationCoordinates.filter {
      destinations.contains($0.key)
    }
    for destination in destinations.sorted() where next[destination] == nil {
      if let coordinate = await resolveCoordinate(for: destination) {
        next[destination] = coordinate
      }
    }
    commuteDestinationCoordinates = next
  }

  private func resolveComparisonCommuteEvidence() async {
    let targets = appModel.board.members.compactMap {
      member -> SharedComparisonCommuteTarget? in
      guard member.commuteAccess != "remote", member.commuteAccess != "skip" else {
        return nil
      }
      let destination = SharedListingText.commuteDestination(member.commuteLine)
      guard let coordinate = commuteDestinationCoordinates[destination] else {
        return nil
      }
      return SharedComparisonCommuteTarget(
        id: destination.lowercased(),
        memberName: member.name,
        destination: destination,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        commuteAccess: member.commuteAccess,
        preferredMinutes: member.preferredCommuteMinutes,
        maximumMinutes: member.maxCommuteMinutes
      )
    }
    guard !targets.isEmpty else {
      comparisonCommuteEvidence = [:]
      comparisonEvidenceSignatures = [:]
      comparisonCommuteCorridors = []
      isLoadingComparisonTransit = false
      comparisonRoutingCompletedCount = 0
      comparisonRoutingTotalCount = 0
      comparisonRoutingFailedCount = 0
      return
    }

    let candidates = preparedMapItems.filter(\.hasReliableCoordinate)
    guard !candidates.isEmpty else {
      isLoadingComparisonTransit = false
      comparisonRoutingCompletedCount = 0
      comparisonRoutingTotalCount = 0
      comparisonRoutingFailedCount = 0
      return
    }

    let candidateIDs = Set(candidates.map { $0.listing.id })
    var next = comparisonCommuteEvidence.filter {
      candidateIDs.contains($0.key)
    }
    var nextSignatures = comparisonEvidenceSignatures.filter {
      candidateIDs.contains($0.key)
    }
    let signatures = Dictionary(uniqueKeysWithValues: candidates.map { item in
      (
        item.listing.id,
        Self.comparisonEvidenceSignature(
          originLatitude: item.coordinate.latitude,
          originLongitude: item.coordinate.longitude,
          targets: targets
        )
      )
    })
    let pendingCandidates = candidates.filter { item in
      next[item.listing.id] == nil
        || nextSignatures[item.listing.id] != signatures[item.listing.id]
    }

    comparisonCommuteEvidence = next
    comparisonEvidenceSignatures = nextSignatures
    rebuildComparisonCommuteCorridors(from: next)
    comparisonRoutingTotalCount = candidates.count
    comparisonRoutingCompletedCount = candidates.count - pendingCandidates.count
    comparisonRoutingFailedCount = next.values.filter {
      $0.resolvedDestinations < $0.requestedDestinations
    }.count
    rebuildMapPresentation()

    guard !pendingCandidates.isEmpty else {
      isLoadingComparisonTransit = false
      return
    }

    isLoadingComparisonTransit = true
    defer { isLoadingComparisonTransit = false }
    let batchSize = 3

    for start in stride(from: 0, to: pendingCandidates.count, by: batchSize) {
      guard !Task.isCancelled else { return }
      let end = min(start + batchSize, pendingCandidates.count)
      let batch = Array(pendingCandidates[start..<end])
      let results = await withTaskGroup(
        of: (String, SharedComparisonCommuteEvidence?).self,
        returning: [(String, SharedComparisonCommuteEvidence?)].self
      ) { group in
        for item in batch {
          let listingID = item.listing.id
          let latitude = item.coordinate.latitude
          let longitude = item.coordinate.longitude
          group.addTask {
            let evidence = await Self.comparisonCommuteEvidence(
              originLatitude: latitude,
              originLongitude: longitude,
              targets: targets
            )
            return (listingID, evidence)
          }
        }

        var values: [(String, SharedComparisonCommuteEvidence?)] = []
        for await result in group {
          values.append(result)
        }
        return values
      }

      for (listingID, evidence) in results {
        if let evidence {
          next[listingID] = evidence
          nextSignatures[listingID] = signatures[listingID]
          if evidence.resolvedDestinations < evidence.requestedDestinations {
            comparisonRoutingFailedCount += 1
          }
        } else {
          comparisonRoutingFailedCount += 1
          if nextSignatures[listingID] != signatures[listingID] {
            next[listingID] = nil
            nextSignatures[listingID] = nil
          }
        }
      }
      comparisonRoutingCompletedCount += results.count
      comparisonCommuteEvidence = next
      comparisonEvidenceSignatures = nextSignatures
      rebuildComparisonCommuteCorridors(from: next)
      rebuildMapPresentation()
    }
  }

  private static func comparisonEvidenceSignature(
    originLatitude: Double,
    originLongitude: Double,
    targets: [SharedComparisonCommuteTarget]
  ) -> String {
    let origin = String(
      format: "%.5f,%.5f",
      originLatitude,
      originLongitude
    )
    let destinations = targets.map { target in
      [
        target.id,
        target.memberName,
        String(format: "%.5f,%.5f", target.latitude, target.longitude),
        target.commuteAccess ?? "unknown",
        String(target.preferredMinutes ?? 0),
        String(target.maximumMinutes ?? 45),
      ].joined(separator: "|")
    }
    .sorted()
    .joined(separator: ";")
    return "\(origin)>\(destinations)"
  }

  private func loadComparisonRouteOptions(
    for item: SharedListingMapItem
  ) async {
    let workNodes = comparisonWorkNodes
    guard isComparisonActive, item.hasReliableCoordinate, !workNodes.isEmpty else {
      return
    }

    let listingID = item.listing.id
    let origin = item.coordinate
    let routableWorkNodes = workNodes.filter { workNode in
      !Self.commuteIsCertainlyZero(
        from: origin,
        to: workNode.coordinate,
        preferredMinutes: workNode.preferredMinutes,
        maximumMinutes: workNode.maximumMinutes
      )
    }
    guard !routableWorkNodes.isEmpty else { return }
    let existingRouteIDs = Set(
      comparisonCommuteCorridors
        .filter { $0.listingID == listingID }
        .map { "\($0.targetID)|\($0.mode.rawValue)" }
    )
    let pendingCount = routableWorkNodes.reduce(0) { count, workNode in
      count + SharedCommuteMode.allCases.filter {
        !existingRouteIDs.contains("\(workNode.id)|\($0.rawValue)")
      }.count
    }
    guard pendingCount > 0 else { return }

    loadingComparisonRouteListingID = listingID
    defer {
      if loadingComparisonRouteListingID == listingID {
        loadingComparisonRouteListingID = nil
      }
    }

    let originLatitude = origin.latitude
    let originLongitude = origin.longitude
    var loaded: [SharedLoadedComparisonRoute] = []
    for workNode in routableWorkNodes {
      for mode in SharedCommuteMode.allCases
        where !existingRouteIDs.contains("\(workNode.id)|\(mode.rawValue)") {
        guard !Task.isCancelled else { return }
        let transportType: MKDirectionsTransportType = switch mode {
        case .transit: .transit
        case .walking: .walking
        case .automobile: .automobile
        }
        guard let route = await Self.routeResult(
          from: CLLocationCoordinate2D(
            latitude: originLatitude,
            longitude: originLongitude
          ),
          to: workNode.coordinate,
          transportType: transportType
        ) else { continue }
        let accessValues: [String?] = workNode.commuteAccesses.isEmpty
          ? [nil]
          : workNode.commuteAccesses.map(Optional.some)
        let easeMinutes = accessValues.map {
          SharedCommuteRouteLogic.easeAdjustedMinutes(
            mode: mode,
            minutes: route.minutes,
            stepCount: route.stepCount,
            access: $0
          )
        }.max() ?? route.minutes
        loaded.append(
          SharedLoadedComparisonRoute(
            targetID: workNode.id,
            destination: workNode.destination,
            memberNames: workNode.memberNames,
            commuteAccesses: workNode.commuteAccesses,
            mode: mode,
            transitKind: route.transitKind,
            minutes: route.minutes,
            easeMinutes: easeMinutes,
            preferredMinutes: workNode.preferredMinutes,
            maximumMinutes: workNode.maximumMinutes,
            coordinates: route.coordinates,
            legs: route.legs
          )
        )
      }
    }

    var next = comparisonCommuteCorridors
    for route in loaded {
      let id = "\(listingID)|\(route.targetID)|\(route.mode.rawValue)"
      let routeCoordinates = route.coordinates.map {
        CLLocationCoordinate2D(
          latitude: $0.latitude,
          longitude: $0.longitude
        )
      }
      guard routeCoordinates.count >= 2 else { continue }
      let routeLegs = Self.comparisonRouteLegs(
        routeID: id,
        from: route.legs
      )
      next.removeAll { $0.id == id }
      next.append(
        SharedComparisonCommuteCorridor(
          id: id,
          listingID: listingID,
          targetID: route.targetID,
          memberNames: route.memberNames,
          destination: route.destination,
          commuteAccesses: route.commuteAccesses,
          mode: route.mode,
          transitKind: route.transitKind,
          minutes: route.minutes,
          easeMinutes: route.easeMinutes,
          preferredMinutes: route.preferredMinutes,
          maximumMinutes: route.maximumMinutes,
          polyline: MKPolyline(
            coordinates: routeCoordinates,
            count: routeCoordinates.count
          ),
          legs: routeLegs
        )
      )
    }
    comparisonCommuteCorridors = next
  }

  private static func comparisonCommuteEvidence(
    originLatitude: Double,
    originLongitude: Double,
    targets: [SharedComparisonCommuteTarget]
  ) async -> SharedComparisonCommuteEvidence? {
    let origin = CLLocationCoordinate2D(
      latitude: originLatitude,
      longitude: originLongitude
    )
    var durations: [Int] = []
    var easeDurations: [Int] = []
    var memberScores: [Double] = []
    var evaluatedDestinationCount = 0
    var suppressedLongRouteDestinations = 0
    var usedWalkingFallback = false
    var displayedRouteIDs = Set<String>()
    var scoredRouteIDs = Set<String>()
    var routeSnapshots: [SharedComparisonRouteSnapshot] = []

    for target in targets {
      guard !Task.isCancelled else { return nil }
      let destination = CLLocationCoordinate2D(
        latitude: target.latitude,
        longitude: target.longitude
      )
      let preferred = max(target.preferredMinutes ?? 0, 0)
      let maximum = max(
        target.maximumMinutes ?? 45,
        preferred + 5
      )
      if commuteIsCertainlyZero(
        from: origin,
        to: destination,
        preferredMinutes: target.preferredMinutes,
        maximumMinutes: target.maximumMinutes
      ) {
        evaluatedDestinationCount += 1
        suppressedLongRouteDestinations += 1
        memberScores.append(0)
        continue
      }
      let requestedModes = backgroundRouteModes(for: target.commuteAccess)

      var visibleRoutes: [(SharedCommuteMode, SharedRouteResult)] = []
      for mode in requestedModes {
        guard !Task.isCancelled else { return nil }
        let transportType: MKDirectionsTransportType = switch mode {
        case .transit: .transit
        case .walking: .walking
        case .automobile: .automobile
        }
        guard let route = await routeResult(
          from: origin,
          to: destination,
          transportType: transportType
        ) else { continue }
        visibleRoutes.append((mode, route))
        if SharedCommuteRouteLogic.permits(mode, access: target.commuteAccess) {
          break
        }
      }
      routeSnapshots.append(
        contentsOf: visibleRoutes.map { mode, route in
          SharedComparisonRouteSnapshot(
            targetID: target.id,
            memberName: target.memberName,
            destination: target.destination,
            commuteAccess: target.commuteAccess,
            mode: mode,
            transitKind: route.transitKind,
            minutes: route.minutes,
            easeMinutes: SharedCommuteRouteLogic.easeAdjustedMinutes(
              mode: mode,
              minutes: route.minutes,
              stepCount: route.stepCount,
              access: target.commuteAccess
            ),
            preferredMinutes: preferred,
            maximumMinutes: maximum,
            coordinates: route.coordinates,
            legs: route.legs
          )
        }
      )

      let eligibleRoutes = visibleRoutes.filter {
        SharedCommuteRouteLogic.permits($0.0, access: target.commuteAccess)
      }
      let primaryRoute = eligibleRoutes.min(by: {
        SharedCommuteRouteLogic.easeAdjustedMinutes(
          mode: $0.0,
          minutes: $0.1.minutes,
          stepCount: $0.1.stepCount,
          access: target.commuteAccess
        ) < SharedCommuteRouteLogic.easeAdjustedMinutes(
          mode: $1.0,
          minutes: $1.1.minutes,
          stepCount: $1.1.stepCount,
          access: target.commuteAccess
        )
      })
      if let routeToDisplay = primaryRoute ?? visibleRoutes.first {
        let displayEaseMinutes = SharedCommuteRouteLogic.easeAdjustedMinutes(
          mode: routeToDisplay.0,
          minutes: routeToDisplay.1.minutes,
          stepCount: routeToDisplay.1.stepCount,
          access: target.commuteAccess
        )
        let displayScore = SharedComparisonMath.commuteScore(
          minutes: displayEaseMinutes,
          preferredMinutes: target.preferredMinutes,
          maximumMinutes: target.maximumMinutes
        )
        if displayScore > 0 {
          displayedRouteIDs.insert("\(target.id)|\(routeToDisplay.0.rawValue)")
        }
      }
      guard let primaryRoute else {
        continue
      }
      evaluatedDestinationCount += 1
      if primaryRoute.0 == .walking {
        usedWalkingFallback = true
      }
      scoredRouteIDs.insert("\(target.id)|\(primaryRoute.0.rawValue)")
      durations.append(primaryRoute.1.minutes)
      let easeMinutes = SharedCommuteRouteLogic.easeAdjustedMinutes(
        mode: primaryRoute.0,
        minutes: primaryRoute.1.minutes,
        stepCount: primaryRoute.1.stepCount,
        access: target.commuteAccess
      )
      easeDurations.append(easeMinutes)
      memberScores.append(SharedComparisonMath.commuteScore(
        minutes: easeMinutes,
        preferredMinutes: target.preferredMinutes,
        maximumMinutes: target.maximumMinutes
      ))
    }

    guard !memberScores.isEmpty || !routeSnapshots.isEmpty else { return nil }
    let resolvedEveryDestination = evaluatedDestinationCount == targets.count
    let score: Double?
    if resolvedEveryDestination,
       let worstScore = memberScores.min() {
      let averageScore = memberScores.reduce(0, +) / Double(memberScores.count)
      score = averageScore * 0.72 + worstScore * 0.28
    } else {
      score = nil
    }
    let averageMinutes = durations.isEmpty
      ? 0
      : Int((Double(durations.reduce(0, +)) / Double(durations.count)).rounded())
    let averageEaseMinutes = easeDurations.isEmpty
      ? 0
      : Int((Double(easeDurations.reduce(0, +)) / Double(easeDurations.count)).rounded())
    return SharedComparisonCommuteEvidence(
      score: score,
      averageMinutes: averageMinutes,
      averageEaseMinutes: averageEaseMinutes,
      resolvedDestinations: evaluatedDestinationCount,
      requestedDestinations: targets.count,
      suppressedLongRouteDestinations: suppressedLongRouteDestinations,
      usedWalkingFallback: usedWalkingFallback,
      displayedRouteIDs: displayedRouteIDs,
      scoredRouteIDs: scoredRouteIDs,
      routeSnapshots: routeSnapshots
    )
  }

  private static func commuteIsCertainlyZero(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    preferredMinutes: Int?,
    maximumMinutes: Int?
  ) -> Bool {
    let directDistance = CLLocation(
      latitude: origin.latitude,
      longitude: origin.longitude
    ).distance(from: CLLocation(
      latitude: destination.latitude,
      longitude: destination.longitude
    ))
    // Use an intentionally generous 120 mph lower bound. If even that
    // impossible best case scores zero, a real ground route can safely score
    // zero without asking MapKit to draw a cross-country polyline.
    let optimisticMetersPerMinute = 120.0 * 1_609.344 / 60.0
    let optimisticMinutes = max(
      Int(ceil(directDistance / optimisticMetersPerMinute)),
      1
    )
    return SharedComparisonMath.commuteScore(
      minutes: optimisticMinutes,
      preferredMinutes: preferredMinutes,
      maximumMinutes: maximumMinutes
    ) == 0
  }

  private static func backgroundRouteModes(
    for commuteAccess: String?
  ) -> [SharedCommuteMode] {
    switch commuteAccess {
    case "car":
      return [.automobile, .transit, .walking]
    case "transit":
      return [.transit, .walking, .automobile]
    default:
      return [.transit, .automobile, .walking]
    }
  }

  private func rebuildComparisonCommuteCorridors(
    from evidence: [String: SharedComparisonCommuteEvidence]
  ) {
    var grouped: [String: [(
      listingID: String,
      snapshot: SharedComparisonRouteSnapshot
    )]] = [:]
    for (listingID, value) in evidence {
      for snapshot in value.routeSnapshots {
        let key = "\(listingID)|\(snapshot.targetID)|\(snapshot.mode.rawValue)"
        grouped[key, default: []].append((listingID, snapshot))
      }
    }

    comparisonCommuteCorridors = grouped.keys.sorted().compactMap { key in
      guard let routes = grouped[key],
            let first = routes.first
      else { return nil }
      let snapshot = first.snapshot
      let routeCoordinates = snapshot.coordinates.map {
        CLLocationCoordinate2D(
          latitude: $0.latitude,
          longitude: $0.longitude
        )
      }
      guard routeCoordinates.count >= 2 else { return nil }
      let preferred = routes.map { $0.snapshot.preferredMinutes }.min()
        ?? snapshot.preferredMinutes
      let maximum = routes.map { $0.snapshot.maximumMinutes }.min()
        ?? snapshot.maximumMinutes
      let minutes = routes.map { $0.snapshot.minutes }.max()
        ?? snapshot.minutes
      let easeMinutes = routes.map { $0.snapshot.easeMinutes }.max()
        ?? snapshot.easeMinutes
      return SharedComparisonCommuteCorridor(
        id: key,
        listingID: first.listingID,
        targetID: snapshot.targetID,
        memberNames: Array(Set(routes.map { $0.snapshot.memberName })).sorted(),
        destination: snapshot.destination,
        commuteAccesses: Array(Set(routes.compactMap { $0.snapshot.commuteAccess })).sorted(),
        mode: snapshot.mode,
        transitKind: routes.compactMap { $0.snapshot.transitKind }.first,
        minutes: minutes,
        easeMinutes: easeMinutes,
        preferredMinutes: preferred,
        maximumMinutes: max(maximum, preferred + 5),
        polyline: MKPolyline(
          coordinates: routeCoordinates,
          count: routeCoordinates.count
        ),
        legs: Self.comparisonRouteLegs(
          routeID: key,
          from: snapshot.legs
        )
      )
    }

  }

  private static func comparisonRouteLegs(
    routeID: String,
    from legs: [SharedRouteLegResult]
  ) -> [SharedComparisonRouteLeg] {
    legs.enumerated().compactMap { index, leg in
      let coordinates = leg.coordinates.map {
        CLLocationCoordinate2D(
          latitude: $0.latitude,
          longitude: $0.longitude
        )
      }
      guard coordinates.count >= 2 else { return nil }
      return SharedComparisonRouteLeg(
        id: "\(routeID)|leg-\(index)",
        mode: leg.mode,
        transitKind: leg.transitKind,
        minutes: leg.minutes,
        calloutCoordinate: coordinates[coordinates.count / 2]
      )
    }
  }

  private static func routeResult(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    transportType: MKDirectionsTransportType
  ) async -> SharedRouteResult? {
    let cacheKey = String(
      format: "%.5f,%.5f|%.5f,%.5f|%lu",
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
      transportType.rawValue
    )
    return await SharedComparisonRouteCache.shared.value(for: cacheKey) {
      await routeResultWithRetries(
        from: origin,
        to: destination,
        transportType: transportType
      )
    }
  }

  private static func routeResultWithRetries(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    transportType: MKDirectionsTransportType
  ) async -> SharedRouteResult? {
    let maximumAttempts = 3
    for attempt in 0..<maximumAttempts {
      guard !Task.isCancelled else { return nil }
      let attemptResult = await uncachedRouteResult(
        from: origin,
        to: destination,
        transportType: transportType
      )
      switch attemptResult {
      case .success(let result):
        return result
      case .terminalFailure:
        return nil
      case .retryableFailure:
        break
      }
      guard attempt < maximumAttempts - 1 else { break }
      let delay = UInt64(350_000_000 * (1 << attempt))
      try? await Task.sleep(nanoseconds: delay)
    }
    return nil
  }

  private static func uncachedRouteResult(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    transportType: MKDirectionsTransportType
  ) async -> SharedRouteAttemptResult {
    let request = MKDirections.Request()
    request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin))
    request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination))
    request.transportType = transportType
    request.requestsAlternateRoutes = false
    if transportType == .transit {
      request.departureDate = Date()
    }
    let response: MKDirections.Response
    do {
      response = try await MKDirections(request: request).calculate()
    } catch {
      return routeFailureIsRetryable(error)
        ? .retryableFailure
        : .terminalFailure
    }
    guard let route = response.routes.min(by: {
      $0.expectedTravelTime < $1.expectedTravelTime
    }) else { return .terminalFailure }
    let coordinates = routeCoordinates(from: route.polyline)
    guard coordinates.count >= 2 else { return .terminalFailure }
    let fallbackMode = commuteMode(
      for: route.transportType,
      fallback: commuteMode(for: transportType, fallback: .transit)
    )
    let legs = routeLegResults(
      for: route,
      fallbackMode: fallbackMode
    )
    let primaryTransitKind = legs
      .filter { $0.mode == .transit }
      .max { $0.coordinates.count < $1.coordinates.count }?
      .transitKind
    return .success(
      SharedRouteResult(
        minutes: max(1, Int((route.expectedTravelTime / 60).rounded())),
        stepCount: route.steps.count,
        transitKind: primaryTransitKind,
        coordinates: coordinates,
        legs: legs
      )
    )
  }

  private static func routeFailureIsRetryable(_ error: Error) -> Bool {
    if error is CancellationError {
      return false
    }
    if let mapError = error as? MKError {
      switch mapError.code {
      case .unknown, .serverFailure, .loadingThrottled:
        return true
      case .placemarkNotFound, .directionsNotFound, .decodingFailed:
        return false
      @unknown default:
        return false
      }
    }
    if let urlError = error as? URLError {
      switch urlError.code {
      case .timedOut,
           .cannotFindHost,
           .cannotConnectToHost,
           .networkConnectionLost,
           .dnsLookupFailed,
           .notConnectedToInternet,
           .resourceUnavailable:
        return true
      default:
        return false
      }
    }
    return true
  }

  private static func routeLegResults(
    for route: MKRoute,
    fallbackMode: SharedCommuteMode
  ) -> [SharedRouteLegResult] {
    var drafts: [SharedRouteLegDraft] = []
    for step in route.steps {
      let coordinates = routeCoordinates(from: step.polyline)
      guard coordinates.count >= 2 else { continue }
      let mode = commuteMode(
        for: step.transportType,
        fallback: fallbackMode,
        instructions: step.instructions
      )
      let transitKind = mode == .transit
        ? inferredTransitKind(from: [step])
        : nil
      if let lastIndex = drafts.indices.last,
         drafts[lastIndex].mode == mode,
         drafts[lastIndex].transitKind == transitKind {
        drafts[lastIndex].distance += max(step.distance, 0)
        drafts[lastIndex].coordinates = joinedRouteCoordinates(
          drafts[lastIndex].coordinates,
          coordinates
        )
      } else {
        drafts.append(
          SharedRouteLegDraft(
            mode: mode,
            transitKind: transitKind,
            distance: max(step.distance, 0),
            coordinates: coordinates
          )
        )
      }
    }

    if drafts.isEmpty {
      let coordinates = routeCoordinates(from: route.polyline)
      guard coordinates.count >= 2 else { return [] }
      drafts = [
        SharedRouteLegDraft(
          mode: fallbackMode,
          transitKind: fallbackMode == .transit
            ? inferredTransitKind(from: route.steps)
            : nil,
          distance: max(route.distance, 1),
          coordinates: coordinates
        )
      ]
    }

    let weights = drafts.map { draft -> Double in
      let metersPerSecond: Double = switch draft.mode {
      case .walking: 1.3
      case .automobile: 8.5
      case .transit:
        switch draft.transitKind {
        case .bus: 5.5
        case .train: 11.0
        case .ferry: 8.0
        case .transit, nil: 7.0
        }
      }
      return max(draft.distance, 25) / metersPerSecond
    }
    let totalWeight = max(weights.reduce(0, +), 1)
    let totalSeconds = max(route.expectedTravelTime, 60)

    return drafts.enumerated().map { index, draft in
      SharedRouteLegResult(
        mode: draft.mode,
        transitKind: draft.transitKind,
        minutes: max(
          1,
          Int((totalSeconds * weights[index] / totalWeight / 60).rounded())
        ),
        coordinates: draft.coordinates
      )
    }
  }

  private static func commuteMode(
    for transportType: MKDirectionsTransportType,
    fallback: SharedCommuteMode,
    instructions: String = ""
  ) -> SharedCommuteMode {
    if transportType == .walking
      || instructions.localizedCaseInsensitiveContains("walk") {
      return .walking
    }
    if transportType == .automobile {
      return .automobile
    }
    if transportType == .transit {
      return .transit
    }
    return fallback
  }

  private static func routeCoordinates(
    from polyline: MKPolyline
  ) -> [SharedRouteCoordinate] {
    let points = polyline.points()
    return (0..<polyline.pointCount).map {
      SharedRouteCoordinate(
        latitude: points[$0].coordinate.latitude,
        longitude: points[$0].coordinate.longitude
      )
    }
  }

  private static func joinedRouteCoordinates(
    _ leading: [SharedRouteCoordinate],
    _ trailing: [SharedRouteCoordinate]
  ) -> [SharedRouteCoordinate] {
    guard let last = leading.last,
          let first = trailing.first,
          abs(last.latitude - first.latitude) < 0.000_001,
          abs(last.longitude - first.longitude) < 0.000_001
    else { return leading + trailing }
    return leading + trailing.dropFirst()
  }

  private static func inferredTransitKind(
    from steps: [MKRoute.Step]
  ) -> SharedTransitKind {
    let routeText = steps
      .flatMap { step in [step.instructions, step.notice ?? ""] }
      .joined(separator: " ")
      .lowercased()

    if routeText.contains("bus") || routeText.contains("coach") {
      return .bus
    }
    if routeText.contains("ferry") || routeText.contains("boat") {
      return .ferry
    }
    if routeText.contains("train")
      || routeText.contains("rail")
      || routeText.contains("subway")
      || routeText.contains("metro")
      || routeText.contains("tram") {
      return .train
    }
    return .transit
  }

  private static func commuteScore(
    minutes: Int,
    preferredMinutes: Int?,
    maximumMinutes: Int?
  ) -> Double {
    SharedComparisonMath.commuteScore(
      minutes: minutes,
      preferredMinutes: preferredMinutes,
      maximumMinutes: maximumMinutes
    )
  }

  private func filterCardsToCluster(_ cluster: SharedListingMapCluster) {
    let selectedIDs = Set(cluster.items.map { $0.listing.id })
    cardClusterListingIDs = selectedIDs == cardClusterListingIDs ? [] : selectedIDs
    selectedListing = nil
    commuteRoutes = []
  }

  private func loadMapInventory(in region: MKCoordinateRegion) async {
    let latitudePadding = region.span.latitudeDelta * 0.2
    let longitudePadding = region.span.longitudeDelta * 0.2
    await appModel.loadListingInventory(
      view: "map",
      minimumLatitude: region.center.latitude - region.span.latitudeDelta / 2 - latitudePadding,
      maximumLatitude: region.center.latitude + region.span.latitudeDelta / 2 + latitudePadding,
      minimumLongitude: region.center.longitude - region.span.longitudeDelta / 2 - longitudePadding,
      maximumLongitude: region.center.longitude + region.span.longitudeDelta / 2 + longitudePadding,
      maximumPrice: filters.maximumPrice,
      minimumBedrooms: filters.minimumBedroomCount,
      query: filters.normalizedLocationQuery
    )
  }

  private func loadCardInventory(append: Bool = false) async {
    await appModel.loadListingInventory(
      view: "cards",
      maximumPrice: filters.maximumPrice,
      minimumBedrooms: filters.minimumBedroomCount,
      query: filters.normalizedLocationQuery,
      append: append
    )
  }

  private func focusMap() {
    if isComparisonActive {
      let region = comparisonFocusRegion
      visibleRegion = region
      cameraPosition = .region(region)
      rebuildMapPresentation()
      return
    }

    let focusItems = isComparisonActive
      ? preparedMapItems.filter { item in
          let key = item.listing.listingId.isEmpty
            ? item.listing.id
            : item.listing.listingId
          return savedListingKeys.contains(key)
        }
      : preparedMapItems
    let center = focusItems.first?.coordinate
      ?? searchListings.compactMap { resolvedCoordinates[$0.id] }.first
      ?? SharedListingLocation.boardCenter(appModel.board.city)
    let span = focusItems.isEmpty ? 0.16 : 0.095
    let region = MKCoordinateRegion(
      center: center,
      span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
    )
    visibleRegion = region
    cameraPosition = .region(region)
    rebuildMapPresentation()
  }

  private func resolveListingCoordinates() async {
    var next = resolvedCoordinates
    let candidates = searchListings
      .filter {
        $0.coordinate == nil
          && next[$0.id] == nil
      }

    for listing in candidates {
      guard !Task.isCancelled else { return }
      guard let query = SharedListingLocation.geocodingQuery(for: listing) else {
        continue
      }
      if let coordinate = await resolveCoordinate(for: query) {
        next[listing.id] = coordinate
        resolvedCoordinates = next
        prepareMapItems()
      }
    }
  }

  private func resolveCommuteRoutes(for requestedListing: ListingPreview? = nil) async {
    guard let listing = requestedListing ?? selectedListing,
          let origin = mapItems.first(where: { $0.listing.id == listing.id })?.coordinate
    else {
      commuteRoutes = []
      return
    }

    let destinations = appModel.board.members.compactMap {
      member -> (name: String, target: String, colorKey: String, access: String?)? in
      guard member.commuteAccess != "remote", member.commuteAccess != "skip" else {
        return nil
      }
      let target = SharedListingText.commuteDestination(member.commuteLine)
      guard !target.isEmpty else { return nil }
      return (
        member.name,
        target,
        member.userId.isEmpty ? member.name : member.userId,
        member.commuteAccess
      )
    }
    guard !destinations.isEmpty else {
      commuteRoutes = []
      return
    }

    isLoadingRoutes = true
    defer { isLoadingRoutes = false }
    var next: [SharedCommuteRoute] = []
    for destination in destinations {
      guard let target = await resolveCoordinate(for: destination.target) else { continue }
      async let transitRequest = Self.mapRoute(
        from: origin,
        to: target,
        transportType: .transit
      )
      async let automobileRequest = destination.access == "transit"
        ? nil
        : Self.mapRoute(from: origin, to: target, transportType: .automobile)
      let directDistance = CLLocation(
        latitude: origin.latitude,
        longitude: origin.longitude
      ).distance(from: CLLocation(latitude: target.latitude, longitude: target.longitude))
      async let walkingRequest = directDistance <= 3_200
        ? Self.mapRoute(from: origin, to: target, transportType: .walking)
        : nil

      let transitRoute = await transitRequest
      let automobileRoute = await automobileRequest
      let walkingCandidate = await walkingRequest
      let walkingRoute = walkingCandidate.flatMap {
        $0.expectedTravelTime <= 30 * 60 ? $0 : nil
      }
      let usableRoutes: [(SharedCommuteMode, MKRoute)] = [
        transitRoute.map { (.transit, $0) },
        automobileRoute.map { (.automobile, $0) },
        walkingRoute.map { (.walking, $0) }
      ].compactMap { $0 }
      guard let fastest = usableRoutes.min(by: {
        $0.1.expectedTravelTime < $1.1.expectedTravelTime
      }) else { continue }
      next.append(
        SharedCommuteRoute(
          memberName: destination.name,
          destination: destination.target,
          route: fastest.1,
          color: SharedMemberColors.color(for: destination.colorKey),
          mode: fastest.0
        )
      )
    }
    commuteRoutes = next
  }

  private static func mapRoute(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    transportType: MKDirectionsTransportType
  ) async -> MKRoute? {
    for attempt in 0..<3 {
      guard !Task.isCancelled else { return nil }
      let request = MKDirections.Request()
      request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin))
      request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination))
      request.transportType = transportType
      request.requestsAlternateRoutes = false
      if transportType == .transit {
        request.departureDate = Date()
      }
      do {
        let routes = try await MKDirections(request: request).calculate().routes
        if let route = routes.min(by: {
          $0.expectedTravelTime < $1.expectedTravelTime
        }) {
          return route
        }
      } catch {
        guard routeFailureIsRetryable(error) else { return nil }
      }
      if attempt < 2 {
        try? await Task.sleep(nanoseconds: UInt64(350_000_000 * (1 << attempt)))
      }
    }
    return nil
  }

  private func resolveCoordinate(for destination: String) async -> CLLocationCoordinate2D? {
    let query = [destination, appModel.board.city]
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .joined(separator: ", ")
    for attempt in 0..<3 {
      guard !Task.isCancelled else { return nil }
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query
      if let response = try? await MKLocalSearch(request: request).start(),
         let coordinate = response.mapItems.first?.placemark.coordinate {
        return coordinate
      }
      if attempt < 2 {
        try? await Task.sleep(nanoseconds: UInt64(250_000_000 * (attempt + 1)))
      }
    }
    return nil
  }
}

struct SharedShortlistView: View {
  @Environment(AppModel.self) private var appModel
  @State private var filter = SharedListingFilter.active
  @State private var selectedListing: ListingPreview?
  @State private var showsListingDiscovery = false
  @State private var comparisonSelection: Set<String> = []
  @State private var showsComparison = false
  @State private var showsComparisonLimit = false
  @State private var showsSettings = false
  @State private var showsRecentlyDeleted = false
  @AppStorage("homeboard.guide.shortlist.dismissed") private var shortlistGuideDismissed = false

  private var listings: [ListingPreview] {
    appModel.board.shortlist.filter(filter.includes)
  }

  private var comparisonListings: [ListingPreview] {
    appModel.board.shortlist.filter { comparisonSelection.contains($0.id) }
  }

  var body: some View {
    ZStack {
      WorkspaceBackgroundView()

      ScrollView(.vertical, showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 14) {
          SharedPageHeader(
            eyebrow: appModel.board.city,
            title: "Shortlist",
            subtitle: "Saved places, group votes, and your next move."
          ) {
            HStack(spacing: 8) {
              Button {
                showsSettings = true
              } label: {
                Image(systemName: "gearshape.fill")
                  .font(.subheadline.weight(.bold))
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .frame(width: 40, height: 40)
                  .background(Color.white.opacity(0.06))
                  .clipShape(Circle())
              }
              .buttonStyle(HomeboardAreaButtonStyle())
              .accessibilityLabel("Board settings")

              Button {
                showsListingDiscovery = true
              } label: {
                Image(systemName: "plus")
                  .font(.headline.weight(.bold))
                  .foregroundStyle(Color.black)
                  .frame(width: 40, height: 40)
                  .background(HomeboardPalette.accent)
                  .clipShape(Circle())
              }
              .buttonStyle(HomeboardAreaButtonStyle())
              .accessibilityLabel("Add a listing")
            }
          }

          SharedFilterBar(selection: $filter, counts: statusCounts)

          if !appModel.recentlyDeletedListings.isEmpty {
            HStack(spacing: 8) {
              Image(systemName: "trash.fill")
                .font(.caption)
                .foregroundStyle(HomeboardPalette.danger)
              Text("\(appModel.recentlyDeletedListings.count) recently deleted listing\(appModel.recentlyDeletedListings.count == 1 ? "" : "s")")
                .font(.caption.weight(.semibold))
                .foregroundStyle(HomeboardPalette.secondaryText)
              Spacer()
              Button("Review / Restore") {
                showsRecentlyDeleted = true
              }
              .font(.caption.weight(.bold))
              .foregroundStyle(HomeboardPalette.accent)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Color.white.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          }
          // ── Scout Crowdfunder Banner ──
          ScoutBannerView(subscription: appModel.board.scoutSubscription)

          if appModel.isBoardLoading && appModel.board.shortlist.isEmpty {

            ForEach(0..<3, id: \.self) { _ in
              HomeboardListingSkeletonCard()
            }
          } else if listings.isEmpty {
            if appModel.board.shortlist.isEmpty {
              SharedShortlistEmptyState(onBrowse: { showsListingDiscovery = true })
            } else {
              VStack(spacing: 14) {
                SharedInlineEmpty(
                  icon: "line.3.horizontal.decrease.circle",
                  title: "No \(filter.title.lowercased()) places",
                  message: "Your saved places are still here. Try another stage."
                )
                Button("Show all saved places") { filter = .all }
                  .font(.subheadline.weight(.bold))
                  .foregroundStyle(HomeboardPalette.accent)
                  .frame(maxWidth: .infinity, minHeight: 44)
                  .buttonStyle(HomeboardAreaButtonStyle())
              }
            }
          } else {
            ForEach(listings) { listing in
              SharedShortlistRow(
                listing: listing,
                memberCount: max(appModel.board.members.filter { $0.status != "commute point" }.count, 1),
                isSelectedForComparison: comparisonSelection.contains(listing.id),
                onOpen: { selectedListing = listing },
                onCompare: { toggleComparison(listing) }
              )
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 24)
      }
      .scrollBounceBehavior(.basedOnSize, axes: .vertical)
      .refreshable {
        await appModel.refreshCurrentBoard()
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if !comparisonSelection.isEmpty {
        HStack(spacing: 12) {
          Button {
            appModel.trackComparisonOpened(listingIds: comparisonListings.map(\.id))
            showsComparison = true
          } label: {
            Label(
              comparisonSelection.count == 1 ? "Select one more place" : "Compare \(comparisonSelection.count) places",
              systemImage: "arrow.left.arrow.right"
            )
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.buttonText)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(HomeboardPalette.accent.opacity(comparisonSelection.count == 1 ? 0.65 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
          .disabled(comparisonSelection.count < 2)

          Button("Clear") { comparisonSelection.removeAll() }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.accent)
            .frame(minWidth: 44, minHeight: 44)
            .buttonStyle(HomeboardAreaButtonStyle())
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(HomeboardPalette.background)
      }
    }
    .onChange(of: appModel.board.shortlist.map(\.id)) { _, ids in
      comparisonSelection.formIntersection(Set(ids))
    }
    .alert("Compare up to 3 places", isPresented: $showsComparisonLimit) {
      Button("Got it", role: .cancel) { }
    } message: {
      Text("Deselect a place before adding another, or tap Clear to start again.")
    }
    .toolbar(.hidden, for: .navigationBar)
    .sheet(isPresented: $showsListingDiscovery) {
      SharedListingDiscoverySheet(city: appModel.board.city)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(item: $selectedListing) { listing in
      SharedListingDetailView(listing: listing)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsComparison) {
      SharedComparisonSheet(listings: comparisonListings)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsSettings) {
      SharedSettingsSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsRecentlyDeleted) {
      SharedRecentlyDeletedSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .overlayPreferenceValue(SharedCoachmarkAnchorKey.self) { anchors in
      if !shortlistGuideDismissed {
        SharedCoachmarkOverlay(
          target: anchors["shortlist-filters"],
          title: "This is the group’s shared memory",
          message: "Use stages to keep active places separate from tours, applications, and passes. Open any card to add the group note.",
          targetLabel: "FILTER BY STAGE",
          onDismiss: { shortlistGuideDismissed = true }
        )
      }
    }
  }

  private var statusCounts: [SharedListingFilter: Int] {
    Dictionary(uniqueKeysWithValues: SharedListingFilter.allCases.map { stage in
      (stage, appModel.board.shortlist.filter(stage.includes).count)
    })
  }

  private func toggleComparison(_ listing: ListingPreview) {
    if comparisonSelection.contains(listing.id) {
      comparisonSelection.remove(listing.id)
      return
    }

    guard comparisonSelection.count < 3 else {
      showsComparisonLimit = true
      return
    }
    comparisonSelection.insert(listing.id)
  }
}

struct SharedGroupView: View {
  @Environment(AppModel.self) private var appModel
  @State private var copiedInvite = false
  @State private var selectedMember: MemberPreferenceCard?
  @State private var selectedCommutePoint: MemberPreferenceCard?
  @State private var showsAddCommutePoint = false
  @State private var showsInviteMember = false
  @AppStorage("homeboard.guide.commute-points.dismissed") private var commutePointGuideDismissed = false

  private var pendingInvites: [BoardInvitationSummary] {
    appModel.board.invitations.filter { $0.status == "pending" }
  }

  private var isCurrentUserOwner: Bool {
    guard let userId = appModel.account?.id else { return false }
    return appModel.board.members.first(where: { $0.userId == userId })?.role == "owner"
  }

  private var people: [MemberPreferenceCard] {
    appModel.board.members.filter { $0.status != "commute point" }
  }

  private var commutePoints: [MemberPreferenceCard] {
    appModel.board.members.filter { $0.status == "commute point" }
  }

  var body: some View {
    ZStack {
      WorkspaceBackgroundView()

      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          SharedPageHeader(
            eyebrow: "\(people.count) member\(people.count == 1 ? "" : "s")",
            title: "One search, seen together",
            subtitle: "Budgets, commutes, and red lines stay attached to the people who care about them."
          ) {
            if isCurrentUserOwner {
              Button {
                showsInviteMember = true
              } label: {
                Image(systemName: "person.badge.plus")
                  .font(.headline.weight(.bold))
                  .foregroundStyle(Color.black)
                  .frame(width: 42, height: 42)
                  .background(HomeboardPalette.accent)
                  .clipShape(Circle())
              }
              .buttonStyle(HomeboardAreaButtonStyle())
            }
          }

          if isCurrentUserOwner {
            SharedInviteCard(
              board: appModel.board,
              copied: copiedInvite,
              onCopy: {
                UIPasteboard.general.string = HomeboardConfig.publicWebBaseURL
                  .appending(path: "invite/\(appModel.board.inviteCode)")
                  .absoluteString
                copiedInvite = true
              },
              onInvite: { showsInviteMember = true },
              onAddCommutePoint: { showsAddCommutePoint = true }
            )
          }

          if !commutePointGuideDismissed {
            SharedCommutePointTutorialCard {
              commutePointGuideDismissed = true
            }
          }

          VStack(alignment: .leading, spacing: 12) {
            SharedSectionTitle(title: "People", trailing: "Tap to see preferences")

            if people.isEmpty {
              SharedInlineEmpty(
                icon: "person.2",
                title: "No profiles yet",
                message: "Invite the first person so the board has someone to optimize for."
              )
            } else {
              ForEach(people) { member in
                Button {
                  selectedMember = member
                } label: {
                  SharedMemberRow(member: member)
                }
                .buttonStyle(HomeboardAreaButtonStyle())
              }
            }
          }


          if isCurrentUserOwner || !commutePoints.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              SharedSectionTitle(
                title: "Additional commute points",
                trailing: commutePoints.isEmpty ? nil : "\(commutePoints.count)"
              )

              if commutePoints.isEmpty {
                Button {
                  showsAddCommutePoint = true
                } label: {
                  Label("Add a commute point", systemImage: "mappin.and.ellipse")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(HomeboardPalette.buttonText)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(HomeboardPalette.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(HomeboardAreaButtonStyle())
              } else {
                ForEach(commutePoints) { point in
                  Button {
                    selectedCommutePoint = point
                  } label: {
                    SharedCommutePointRow(point: point)
                  }
                  .buttonStyle(HomeboardAreaButtonStyle())
                }

                if isCurrentUserOwner {
                  Button {
                    showsAddCommutePoint = true
                  } label: {
                    Label("Add another commute point", systemImage: "plus.circle.fill")
                      .font(.subheadline.weight(.bold))
                      .foregroundStyle(HomeboardPalette.accent)
                      .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                      .contentShape(Rectangle())
                  }
                  .buttonStyle(HomeboardAreaButtonStyle())
                }
              }
            }
          }

          if isCurrentUserOwner && !pendingInvites.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              SharedSectionTitle(title: "Pending invites", trailing: "\(pendingInvites.count)")

              ForEach(pendingInvites) { invitation in
                HStack(spacing: 12) {
                  Image(systemName: "link.badge.plus")
                    .foregroundStyle(HomeboardPalette.accent)

                  VStack(alignment: .leading, spacing: 3) {
                    Text("Single-use invite link")
                      .font(.subheadline.weight(.semibold))
                      .foregroundStyle(HomeboardPalette.primaryText)
                      .lineLimit(1)
                    Text("Waiting to join")
                      .font(.caption)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                  }

                  Spacer()

                  Button("Cancel", role: .destructive) {
                    appModel.revokeInvite(invitation)
                  }
                  .font(.caption.weight(.bold))
                }
                .padding(14)
                .sharedSurface(cornerRadius: 16)
              }
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 38)
      }
      .refreshable {
        await appModel.refreshCurrentBoard()
      }
    }
    .toolbar(.hidden, for: .navigationBar)
    .sheet(item: $selectedMember) { member in
      SharedMemberDetailSheet(member: member)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(item: $selectedCommutePoint) { point in
      SharedCommutePointDetailSheet(point: point)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsAddCommutePoint) {
      AddSharedCommutePointSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsInviteMember) {
      InviteSharedMemberSheet()
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
  }
}

struct SharedUpdatesView: View {
  @Environment(AppModel.self) private var appModel
  @State private var updateDraft = ""
  @State private var showsSettings = false
  @FocusState private var updateFieldFocused: Bool
  @AppStorage("homeboard.guide.updates.dismissed") private var updatesGuideDismissed = false

  private var timeline: [SharedTimelineItem] {
    appModel.board.chatMessages.map {
      SharedTimelineItem(
        id: "message-\($0.id)",
        author: $0.authorName?.isEmpty == false ? $0.authorName! : ($0.role == "assistant" ? "Homeboard" : "Member"),
        content: $0.content,
        isSystem: $0.role == "assistant" || $0.role == "system"
      )
    }
  }

  var body: some View {
    @Bindable var appModel = appModel

    ZStack {
      WorkspaceBackgroundView()

      ScrollView(.vertical, showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 14) {
          SharedPageHeader(
            eyebrow: "Shared space",
            title: "Group",
            subtitle: "One conversation. Every decision answered together."
          ) {
            Button {
              showsSettings = true
            } label: {
              Image(systemName: "gearshape.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(HomeboardPalette.secondaryText)
                .frame(width: 40, height: 40)
                .background(Color.white.opacity(0.06))
                .clipShape(Circle())
            }
            .buttonStyle(HomeboardAreaButtonStyle())
            .accessibilityLabel("Board settings")
          }

          SharedDecisionHub()

          SharedSectionTitle(
            title: "Conversation",
            trailing: timeline.isEmpty ? "No messages yet" : "\(timeline.count) message\(timeline.count == 1 ? "" : "s")"
          )

          if appModel.isBoardLoading && timeline.isEmpty {
            VStack(spacing: 12) {
              ForEach(0..<3, id: \.self) { _ in
                HStack(alignment: .top, spacing: 12) {
                  HomeboardSkeletonBlock(width: 38, height: 38, cornerRadius: 19)
                  VStack(alignment: .leading, spacing: 8) {
                    HomeboardSkeletonBlock(width: 112, height: 12, cornerRadius: 5)
                    HomeboardSkeletonBlock(height: 13, cornerRadius: 5)
                    HomeboardSkeletonBlock(width: 196, height: 13, cornerRadius: 5)
                  }
                }
                .padding(14)
                .sharedSurface(cornerRadius: 18)
              }
            }
          } else if timeline.isEmpty {
            SharedInlineEmpty(
              icon: "bubble.left.and.bubble.right",
              title: "Start the group conversation",
              message: "Send the first message so everyone starts with the same context."
            )
          } else {
            ForEach(timeline) { item in
              SharedTimelineRow(item: item)
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 24)
      }
      .scrollBounceBehavior(.basedOnSize, axes: .vertical)
      .scrollDismissesKeyboard(.interactively)
      .refreshable {
        await appModel.refreshCurrentBoard()
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      VStack(alignment: .leading, spacing: 7) {
        if let error = appModel.boardError {
          Text(error)
            .font(.caption.weight(.semibold))
            .foregroundStyle(HomeboardPalette.danger)
            .fixedSize(horizontal: false, vertical: true)
        }

        HStack(alignment: .bottom, spacing: 10) {
          TextField(
            "Message the group",
            text: $updateDraft,
            axis: .vertical
          )
          .lineLimit(1...4)
          .focused($updateFieldFocused)
          .submitLabel(.send)
          .onSubmit(submitUpdate)
          .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
              Spacer()
              Button("Done") {
                updateFieldFocused = false
              }
            }
          }
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.primaryText)
          .padding(.horizontal, 15)
          .padding(.vertical, 13)
          .background(Color.white.opacity(0.07))
          .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))

          Button {
            submitUpdate()
          } label: {
            Group {
              if appModel.isPostingBoardUpdate {
                ProgressView()
                  .tint(Color.black)
              } else {
                Image(systemName: "arrow.up")
                  .font(.headline.weight(.bold))
                  .foregroundStyle(Color.black)
              }
            }
            .frame(width: 48, height: 48)
            .background(HomeboardPalette.accent)
            .clipShape(Circle())
          }
          .buttonStyle(HomeboardAreaButtonStyle())
          .accessibilityLabel("Send group message")
          .disabled(
            updateDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              || appModel.isPostingBoardUpdate
          )
          .opacity(updateDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
        }
      }
      .padding(.horizontal, 14)
      .padding(.top, 10)
      .padding(.bottom, 8)
      .background(.ultraThinMaterial)
      .sharedCoachmarkTarget("updates-composer")
    }
    .toolbar(.hidden, for: .navigationBar)
    .sheet(isPresented: $showsSettings) {
      SharedSettingsSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .overlayPreferenceValue(SharedCoachmarkAnchorKey.self) { anchors in
      if !updatesGuideDismissed {
        SharedCoachmarkOverlay(
          target: anchors["updates-composer"],
          title: "Talk it through together",
          message: "Use messages for discussion. Start a group decision above when everyone needs to answer.",
          targetLabel: "MESSAGE THE GROUP",
          onDismiss: { updatesGuideDismissed = true }
        )
      }
    }
  }

  private func submitUpdate() {
    let message = updateDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !message.isEmpty, !appModel.isPostingBoardUpdate else { return }
    updateDraft = ""
    updateFieldFocused = false

    Task {
      let posted = await appModel.addBoardUpdate(message)
      if !posted {
        updateDraft = message
        updateFieldFocused = true
      }
    }
  }
}

// MARK: - Group decisions

private enum SharedDecisionDestination: Identifiable {
  case poll
  case vote(String, ListingPollType)

  var id: String {
    switch self {
    case .poll: return "poll"
    case .vote(let listingID, let type): return "vote-\(listingID)-\(type.rawValue)"
    }
  }
}

private struct SharedOpenListingPoll: Identifiable {
  let listing: ListingPreview
  let type: ListingPollType
  let decision: ListingDecisionSummary
  var id: String { decision.id }
}

private struct SharedDecisionHub: View {
  @Environment(AppModel.self) private var appModel
  @State private var destination: SharedDecisionDestination?
  @State private var showsAll = false

  private var polls: [SharedOpenListingPoll] {
    appModel.board.shortlist.flatMap { listing in
      ListingPollType.allCases.compactMap { type in
        listing.openDecision(for: type).map {
          SharedOpenListingPoll(listing: listing, type: type, decision: $0)
        }
      }
    }
  }

  private var pendingCount: Int { polls.filter { !$0.decision.isGroupResolved }.count }

  private var statusLine: String {
    if polls.isEmpty { return "None yet" }
    if pendingCount == 0 { return "All responded" }
    return "\(pendingCount) waiting"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      SharedSectionTitle(title: "Group decisions", trailing: statusLine)

      actions

      if polls.isEmpty {
        Text("Turn a saved place into one clear question everyone answers.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
      } else {
        ForEach(Array(polls.prefix(showsAll ? polls.count : 3))) { poll in
          Button {
            destination = .vote(poll.listing.id, poll.type)
          } label: {
            HStack(spacing: 12) {
              Image(systemName: "chart.bar.xaxis")
                .foregroundStyle(HomeboardPalette.accent)
              VStack(alignment: .leading, spacing: 4) {
                Text(poll.type.question)
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.primaryText)
                Text(poll.listing.title)
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .lineLimit(1)
                Text("Resolved \(poll.decision.groupResolvedCount)/\(poll.decision.groupRequiredCount)")
                  .font(.caption2.weight(.medium))
                  .foregroundStyle(HomeboardPalette.accent)
                Text(waitingLine(for: poll.decision))
                  .font(.caption2)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .lineLimit(1)
              }
              Spacer(minLength: 0)
              Image(systemName: poll.decision.isGroupResolved ? "checkmark.circle.fill" : "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(poll.decision.isGroupResolved ? HomeboardPalette.success : HomeboardPalette.secondaryText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
        }

        if polls.count > 3 {
          Button(showsAll ? "Show less" : "Show all \(polls.count) decisions") { showsAll.toggle() }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.accent)
            .frame(maxWidth: .infinity, minHeight: 44)
            .buttonStyle(HomeboardAreaButtonStyle())
        }
      }
    }
    .padding(16)
    .sharedSurface(cornerRadius: 20)
    .sheet(item: $destination) { destination in
      Group {
        switch destination {
        case .poll: SharedListingPollSheet()
        case .vote(let listingID, let type): SharedListingPollSheet(initialListingID: listingID, initialType: type)
        }
      }
      .presentationDetents([.large])
      .presentationDragIndicator(.visible)
      .presentationBackground(HomeboardPalette.background)
    }
  }

  @ViewBuilder private var actions: some View {
    Button { destination = .poll } label: {
      Label("Start group decision", systemImage: "person.3.sequence.fill")
        .font(.subheadline.weight(.bold))
        .foregroundStyle(HomeboardPalette.buttonText)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(HomeboardPalette.accent, in: RoundedRectangle(cornerRadius: 14))
    }
    .buttonStyle(HomeboardAreaButtonStyle())
  }

  private func waitingLine(for decision: ListingDecisionSummary) -> String {
    if decision.isGroupResolved { return "Everyone responded" }
    let names = decision.remainingMemberNames ?? []
    if names.isEmpty { return "Waiting for the rest of the group" }
    return "Waiting on \(names.joined(separator: ", "))"
  }
}

private struct SharedListingPollSheet: View {
  var initialListingID: String? = nil
  var initialType: ListingPollType = .requestViewing
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var listingID = ""
  @State private var type = ListingPollType.requestViewing
  @State private var choice: String?
  @State private var isSubmitting = false
  @State private var error: String?

  private var listing: ListingPreview? { appModel.board.shortlist.first { $0.id == listingID } }
  private var decision: ListingDecisionSummary? { listing?.openDecision(for: type) }
  private var groupMemberCount: Int {
    appModel.board.members.filter { !$0.userId.isEmpty && $0.status != "commute point" }.count
  }
  private var canUseGroupDecision: Bool { groupMemberCount >= 2 }

  var body: some View {
    NavigationStack {
      Form {
        if appModel.board.shortlist.isEmpty {
          Section {
            Text("Save a place to start a group decision.").font(.headline)
            Text("Browse Search or save a listing from Safari, then let everyone answer the same question.")
              .foregroundStyle(HomeboardPalette.secondaryText)
            Button("Go to Search") {
              appModel.openBoardTab(.board)
              dismiss()
            }
          }
          .listRowBackground(HomeboardPalette.surface)
        } else {
          Section("Saved place") {
            Picker("Listing", selection: $listingID) {
              Text("Choose a saved place").tag("")
              ForEach(appModel.board.shortlist) { listing in
                Text("\(listing.title) · \(listing.priceLine)").tag(listing.id)
              }
            }
            .pickerStyle(.menu)
            .disabled(initialListingID != nil)
          }
          .listRowBackground(HomeboardPalette.surface)
          if !canUseGroupDecision {
            Section {
              Label("Invite at least one other member", systemImage: "person.badge.plus")
                .font(.subheadline.weight(.semibold))
              Text("A group decision needs responses from at least two account-backed members, so one person cannot decide for everyone.")
                .font(.caption)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
            .listRowBackground(HomeboardPalette.surface)
          }
          Section("What should the group decide?") {
            Picker("Next step", selection: $type) {
              ForEach(ListingPollType.allCases) { type in Text(type.title).tag(type) }
            }
            .pickerStyle(.segmented)
            Text(type.question).font(.headline)
            if let decision {
              SharedPollResults(decision: decision)
            }
          }
          .listRowBackground(HomeboardPalette.surface)
          Section {
            SharedPollChoices(selected: choice) { choice = $0 }
              .disabled(!canUseGroupDecision)
          } header: {
            Text("Your response")
          } footer: {
            Text(decision == nil
              ? "Your response starts the decision in Group. It stays open until every member responds."
              : "Your response counts toward Resolved \(decision?.groupResolvedCount ?? 0)/\(decision?.groupRequiredCount ?? max(2, groupMemberCount)). You can change it later; no one can close this alone.")
          }
          .listRowBackground(HomeboardPalette.surface)
          if let error {
            Text(error).foregroundStyle(HomeboardPalette.danger)
              .listRowBackground(HomeboardPalette.surface)
          }
          Section {
            Button {
              guard let choice, let listing, !isSubmitting else { return }
              isSubmitting = true
              error = nil
              Task {
                let posted = await appModel.voteOnListingDecision(id: listing.id, type: type.rawValue, choice: choice)
                isSubmitting = false
                if posted { dismiss() }
                else { error = appModel.boardError ?? "Couldn’t save your vote. Please try again." }
              }
            } label: {
              HStack {
                if isSubmitting { ProgressView() }
                Text(decision == nil ? "Start decision & respond" : "Update my response").fontWeight(.semibold)
              }
              .frame(maxWidth: .infinity, minHeight: 44)
            }
            .disabled(listing == nil || choice == nil || isSubmitting || !canUseGroupDecision)
          }
          .listRowBackground(HomeboardPalette.surface)
        }
      }
      .scrollContentBackground(.hidden)
      .background(HomeboardPalette.background)
      .foregroundStyle(HomeboardPalette.primaryText)
      .tint(HomeboardPalette.accent)
      .navigationTitle("Group decision")
      .navigationBarTitleDisplayMode(.inline)
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }.disabled(isSubmitting)
        }
      }
      .disabled(isSubmitting)
    }
    .onAppear {
      listingID = initialListingID ?? ""
      type = initialType
      choice = decision?.choice(for: appModel.account?.id)
    }
    .onChange(of: listingID) { _, _ in resetVote() }
    .onChange(of: type) { _, _ in resetVote() }
    .interactiveDismissDisabled(isSubmitting)
  }

  private func resetVote() {
    choice = decision?.choice(for: appModel.account?.id)
    error = nil
  }
}

private struct SharedPollChoices: View {
  let selected: String?
  let onSelect: (String) -> Void

  var body: some View {
    HStack(spacing: 8) {
      ForEach([("yes", "Yes"), ("no", "No"), ("abstain", "Not sure")], id: \.0) { value, title in
        Button { onSelect(value) } label: {
          Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(selected == value ? HomeboardPalette.buttonText : HomeboardPalette.primaryText)
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(selected == value ? HomeboardPalette.accent : Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 13))
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .accessibilityAddTraits(selected == value ? [.isSelected] : [])
      }
    }
  }
}

private struct SharedPollResults: View {
  let decision: ListingDecisionSummary

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Text("Resolved \(decision.groupResolvedCount)/\(decision.groupRequiredCount)")
          .font(.subheadline.weight(.bold))
        if decision.isGroupResolved {
          Image(systemName: "checkmark.circle.fill")
        }
      }
      .foregroundStyle(decision.isGroupResolved ? HomeboardPalette.success : HomeboardPalette.accent)

      Text("\(count("yes")) yes · \(count("no")) no · \(count("abstain")) not sure")
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.secondaryText)

      if !decision.isGroupResolved {
        Text(waitingLine)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }

      DisclosureGroup("See group responses") {
        ForEach(Array(decision.votes.enumerated()), id: \.offset) { _, vote in
          HStack {
            Text(vote.name)
            Spacer()
            Text(vote.choice == "abstain" ? "Not sure" : vote.choice.capitalized)
          }
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
        }
      }
      .font(.caption)
      .tint(HomeboardPalette.accent)
    }
  }

  private func count(_ choice: String) -> Int {
    decision.votes.filter { $0.choice == choice }.count
  }

  private var waitingLine: String {
    let names = decision.remainingMemberNames ?? []
    if names.isEmpty { return "Waiting for the rest of the group" }
    return "Waiting on \(names.joined(separator: ", "))"
  }
}

struct SharedSetupView: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var showsBriefEditor = false
  @State private var showsSafariSetup = false
  @State private var showsHelp = false
  @State private var showsMacPairing = false
  @State private var showsJoinBoard = false
  @State private var showsGroup = false
  @State private var showsRecentlyDeleted = false
  @State private var titleDraft = ""
  @State private var showsBoardExitConfirmation = false
  @State private var showsAccountDeletionConfirmation = false
  @State private var showsBugReport = false

  private var isCurrentUserOwner: Bool {
    guard let userId = appModel.account?.id else { return false }
    return appModel.board.members.first(where: { $0.userId == userId })?.role == "owner"
  }

  var body: some View {
    ZStack {
      WorkspaceBackgroundView()

      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          SharedPageHeader(
            eyebrow: "Workspace",
            title: appModel.board.title,
            subtitle: "The essentials for this search. Everything else lives with the listing or person it belongs to."
          )

          SharedBriefCard(board: appModel.board)

          VStack(spacing: 0) {
            SharedSettingsRow(icon: "person.3.fill", title: "People and invitations", subtitle: "Members, preferences, invite links") {
              showsGroup = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "slider.horizontal.3", title: "Edit search brief", subtitle: "Your city, timing, budget, commute, and priorities") {
              appModel.prepareSearchBriefEditing()
              showsBriefEditor = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "safari.fill", title: "Safari capture", subtitle: "Enable once, then listing pills appear automatically") {
              showsSafariSetup = true
            }

            SharedDivider()

            SharedSettingsRow(
              icon: "trash.fill",
              title: "Recently Deleted",
              subtitle: appModel.recentlyDeletedListings.isEmpty
                ? "Deleted listings stay here for seven days"
                : "\(appModel.recentlyDeletedListings.count) recoverable for seven days"
            ) {
              showsRecentlyDeleted = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "questionmark.circle.fill", title: "Help & tutorials", subtitle: "Save listings, learn each page, or replay the guides") {
              showsHelp = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "laptopcomputer.and.iphone", title: "Connect a Mac", subtitle: "Scan the secure QR code shown by the Mac app") {
              showsMacPairing = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "person.crop.circle.badge.plus", title: "Join another board", subtitle: "Open a shared link or paste its token") {
              showsJoinBoard = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "ladybug.fill", title: "Saw a bug?", subtitle: "Send the details and keep the tracking ID") {
              showsBugReport = true
            }

          }
          .sharedSurface(cornerRadius: 20)

          if !appModel.availableBoards.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              SharedSectionTitle(title: "Your boards", trailing: "\(appModel.availableBoards.count)")

              ForEach(appModel.availableBoards.prefix(5)) { board in
                Button {
                  Task {
                    await appModel.openBoard(id: board.id)
                  }
                } label: {
                  HStack(spacing: 12) {
                    Image(systemName: appModel.board.id == board.id ? "checkmark.circle.fill" : "circle")
                      .foregroundStyle(appModel.board.id == board.id ? HomeboardPalette.success : HomeboardPalette.tertiaryText)

                    VStack(alignment: .leading, spacing: 3) {
                      Text(board.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(HomeboardPalette.primaryText)
                      Text(board.city.isEmpty ? "City still open" : board.city)
                        .font(.caption)
                        .foregroundStyle(HomeboardPalette.secondaryText)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                      .font(.caption.weight(.bold))
                      .foregroundStyle(HomeboardPalette.tertiaryText)
                  }
                  .padding(.horizontal, 14)
                  .padding(.vertical, 13)
                  .sharedSurface(cornerRadius: 15)
                }
                .buttonStyle(HomeboardAreaButtonStyle())
              }
            }
          }

          Button(role: .destructive) {
            showsBoardExitConfirmation = true
          } label: {
            HStack {
              Text(isCurrentUserOwner ? "Delete this board" : "Leave this board")
              Spacer()
              Image(systemName: isCurrentUserOwner ? "trash" : "rectangle.portrait.and.arrow.right")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.danger)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .sharedSurface(cornerRadius: 16)
          }
          .buttonStyle(HomeboardAreaButtonStyle())

          VStack(alignment: .leading, spacing: 12) {
            SharedSectionTitle(title: "Board name", trailing: nil)

            HStack(spacing: 10) {
              TextField("Board name", text: $titleDraft)
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(.horizontal, 14)
                .frame(height: 48)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

              Button("Save") {
                appModel.renameCurrentBoard(titleDraft)
              }
              .font(.subheadline.weight(.bold))
              .foregroundStyle(Color.black)
              .frame(width: 72, height: 48)
              .background(HomeboardPalette.accent)
              .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
              .buttonStyle(HomeboardAreaButtonStyle())
            }
          }

          Button(role: .destructive) {
            appModel.signOut()
          } label: {
            HStack {
              Text("Sign out")
              Spacer()
              Image(systemName: "rectangle.portrait.and.arrow.right")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.danger)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .sharedSurface(cornerRadius: 16)
          }
          .buttonStyle(HomeboardAreaButtonStyle())

          Button(role: .destructive) {
            showsAccountDeletionConfirmation = true
          } label: {
            HStack {
              Text("Delete account and data")
              Spacer()
              Image(systemName: "person.crop.circle.badge.xmark")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.danger)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .sharedSurface(cornerRadius: 16)
          }
          .buttonStyle(HomeboardAreaButtonStyle())
        }
        .padding(.horizontal, 16)
        .padding(.top, 30)
        .padding(.bottom, 38)
      }
      .scrollBounceBehavior(.basedOnSize, axes: .vertical)
    }
    .toolbar(.hidden, for: .navigationBar)
    .onAppear {
      titleDraft = appModel.board.title
    }
    .sheet(isPresented: $showsBriefEditor) {
      OnboardingView(
        purpose: .editSearchBrief,
        onComplete: { showsBriefEditor = false },
        onCancel: { showsBriefEditor = false }
      )
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsHelp) {
      SharedHelpTutorialsSheet(onReplayPageGuides: replayPageGuides)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsSafariSetup) {
      SharedSafariSaveGuideSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsRecentlyDeleted) {
      SharedRecentlyDeletedSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsMacPairing) {
      MacDevicePairingFlowView()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsJoinBoard) {
      SharedJoinBoardSheet()
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsGroup) {
      SharedGroupView()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsBugReport) {
      SharedBugReportSheet(
        currentScreen: appModel.boardTab.rawValue
      )
      .presentationDetents([.large])
      .presentationDragIndicator(.visible)
      .presentationBackground(HomeboardPalette.background)
    }
    .confirmationDialog(
      isCurrentUserOwner ? "Delete this board for everyone?" : "Leave this board?",
      isPresented: $showsBoardExitConfirmation,
      titleVisibility: .visible
    ) {
      Button(isCurrentUserOwner ? "Delete board" : "Leave board", role: .destructive) {
        if isCurrentUserOwner { appModel.deleteCurrentBoard() }
        else { appModel.leaveCurrentBoard() }
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text(isCurrentUserOwner ? "This permanently removes the shared workspace and all of its board data." : "The board stays available to the remaining members.")
    }
    .confirmationDialog(
      "Delete your Homeboard account?",
      isPresented: $showsAccountDeletionConfirmation,
      titleVisibility: .visible
    ) {
      Button("Delete account permanently", role: .destructive) { appModel.deleteAccount() }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("This removes your account, owned boards, memberships, saved listings, and shared profile data. This cannot be undone.")
    }
  }

  private func replayPageGuides() {
    UserDefaults.standard.set(false, forKey: "homeboard.guide.search.dismissed")
    UserDefaults.standard.set(false, forKey: "homeboard.guide.shortlist.dismissed")
    UserDefaults.standard.set(false, forKey: "homeboard.guide.updates.dismissed")
    appModel.boardFeedback = "Page guides restarted."
    UINotificationFeedbackGenerator().notificationOccurred(.success)
    showsHelp = false
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
      dismiss()
    }
  }
}

private enum SharedSafariExtensionSetupStatus: Equatable {
  case checking
  case enabled
  case disabled
  case manual
}

private struct SharedSafariExtensionSetupCard: View {
  private static let extensionIdentifier = "com.homeboard.native.safari"

  @Environment(\.scenePhase) private var scenePhase
  @State private var status: SharedSafariExtensionSetupStatus = .checking
  @State private var isOpeningSettings = false
  @State private var setupError: String?
  let compact: Bool

  init(compact: Bool = false) {
    self.compact = compact
  }

  private var supportsDirectSettings: Bool {
    if #available(iOS 26.2, *) { return true }
    return false
  }

  var body: some View {
    VStack(alignment: .leading, spacing: compact ? 10 : 14) {
      HStack(spacing: 12) {
        ZStack {
          Circle()
            .fill(status == .enabled ? HomeboardPalette.success.opacity(0.14) : HomeboardPalette.accent.opacity(0.12))
          Image(systemName: status == .enabled ? "checkmark" : "puzzlepiece.extension")
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(status == .enabled ? HomeboardPalette.success : HomeboardPalette.accent)
        }
        .frame(width: 40, height: 40)

        VStack(alignment: .leading, spacing: 3) {
          Text(status == .enabled ? "Safari extension is on" : "Enable Safari capture once")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text(statusMessage)
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .lineLimit(compact ? 2 : nil)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 0)

        if status == .checking {
          ProgressView()
            .tint(HomeboardPalette.accent)
        }
      }

      if supportsDirectSettings {
        Button {
          Task { await openExtensionSettings() }
        } label: {
          HStack {
            Text(
              isOpeningSettings
                ? "Opening Settings…"
                : (status == .enabled ? "Review website access" : "Enable in Safari")
            )
            Spacer()
            Image(systemName: "arrow.up.forward.app.fill")
          }
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.buttonText)
          .padding(.horizontal, 15)
          .frame(height: compact ? 44 : 48)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: compact ? 14 : 15, style: .continuous))
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .disabled(isOpeningSettings || status == .checking)
      } else if status != .enabled {
        if compact {
          Label("Settings → Safari → Extensions → Homeboard", systemImage: "gearshape.fill")
            .font(.caption.weight(.semibold))
            .foregroundStyle(HomeboardPalette.secondaryText)
        } else {
          VStack(alignment: .leading, spacing: 7) {
            Label("Open Settings → Apps → Safari", systemImage: "1.circle.fill")
            Label("Tap Extensions → Save to Homeboard", systemImage: "2.circle.fill")
            Label("Turn on Allow Extension and allow website access", systemImage: "3.circle.fill")
          }
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.secondaryText)
        }
      }

      if !compact {
        SharedDivider()

        VStack(alignment: .leading, spacing: 7) {
          Label("Choose Allow under Website Access", systemImage: "lock.open.fill")
          Label("Open a listing; its pill appears", systemImage: "sparkles")
          Label("No pill? Use Page Menu → Save to Homeboard", systemImage: "hand.tap.fill")
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.secondaryText)
      }

      if let setupError {
        Text(setupError)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.danger)
      }
    }
    .padding(compact ? 13 : 16)
    .sharedSurface(cornerRadius: compact ? 18 : 20)
    .task {
      await refreshStatus()
    }
    .onChange(of: scenePhase) { _, nextPhase in
      guard nextPhase == .active else { return }
      Task { await refreshStatus() }
    }
  }

  private var statusMessage: String {
    if compact {
      switch status {
      case .checking:
        return "Checking Safari…"
      case .enabled:
        return "Ready. Keep Website Access set to Allow."
      case .disabled:
        return "Turn it on and choose Allow."
      case .manual:
        return "Use the short Settings path below."
      }
    }

    switch status {
    case .checking:
      return "Checking Safari…"
    case .enabled:
      return "Set Website Access to Allow once. Homeboard will then recognize supported listing pages automatically."
    case .disabled:
      return "Homeboard is installed, but Safari still needs extension and website access approval."
    case .manual:
      return "This iOS version requires the short manual path below."
    }
  }

  @MainActor
  private func refreshStatus() async {
    setupError = nil
    guard #available(iOS 26.2, *) else {
      status = .manual
      return
    }

    status = .checking
    do {
      let extensionState = try await SFSafariExtensionManager.stateOfExtension(
        withIdentifier: Self.extensionIdentifier
      )
      status = extensionState.isEnabled ? .enabled : .disabled
    } catch {
      status = .disabled
      setupError = "Homeboard could not check Safari yet. You can still open Settings below."
    }
  }

  @MainActor
  private func openExtensionSettings() async {
    guard #available(iOS 26.2, *) else { return }
    isOpeningSettings = true
    setupError = nil
    defer { isOpeningSettings = false }
    do {
      try await SFSafariSettings.openExtensionsSettings(
        forIdentifiers: [Self.extensionIdentifier]
      )
    } catch {
      setupError = "Settings did not open. Keep Homeboard in the foreground and try again."
    }
  }
}

private struct SharedHelpTutorialsSheet: View {
  @Environment(\.dismiss) private var dismiss

  let onReplayPageGuides: () -> Void

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 20) {
          VStack(alignment: .leading, spacing: 7) {
            Text("Help & tutorials")
              .font(.title2.bold())
              .foregroundStyle(HomeboardPalette.primaryText)
            Text("A quick guide to the shared search workflow.")
              .font(.subheadline)
              .foregroundStyle(HomeboardPalette.secondaryText)
          }

          SharedSafariExtensionSetupCard()

          VStack(alignment: .leading, spacing: 12) {
            SharedSectionTitle(title: "Save a listing", trailing: nil)
            Label("Open the exact listing page in Safari.", systemImage: "safari")
            Label("Homeboard recognizes supported listing pages and shows the available pills.", systemImage: "sparkles")
            Label("Tap the listing or unit pill that you want to save.", systemImage: "capsule")
          }
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .padding(16)
          .sharedSurface(cornerRadius: 18)

          VStack(alignment: .leading, spacing: 12) {
            SharedSectionTitle(title: "Pages at a glance", trailing: nil)
            Label("Search: find, filter, map, and compare homes.", systemImage: "map")
            Label("Shortlist: review the places your group saved.", systemImage: "rectangle.stack")
            Label("Group: talk together and answer decisions.", systemImage: "bubble.left.and.bubble.right")
          }
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .padding(16)
          .sharedSurface(cornerRadius: 18)

          Button {
            onReplayPageGuides()
          } label: {
            Label("Replay page guides", systemImage: "arrow.counterclockwise")
              .font(.headline)
              .foregroundStyle(Color.black)
              .frame(maxWidth: .infinity, minHeight: 52)
              .background(HomeboardPalette.accent)
              .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
        }
        .padding(20)
      }
      .background(HomeboardPalette.background.ignoresSafeArea())
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
    }
  }
}

private struct SharedBugReportSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var feedback = ""
  @State private var isSubmitting = false
  @State private var submission: MobileBugReportResponse?
  @State private var errorMessage: String?

  let currentScreen: String

  private var trimmedFeedback: String {
    feedback.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var deviceKind: String {
    switch UIDevice.current.userInterfaceIdiom {
    case .phone: "iPhone"
    case .pad: "iPad"
    case .mac: "Mac"
    default: "Apple device"
    }
  }

  private func receivedAtLine(_ rawValue: String) -> String {
    guard let date = ISO8601DateFormatter().date(from: rawValue) else {
      return "Report received"
    }
    return "Received \(date.formatted(date: .abbreviated, time: .omitted))"
  }

  var body: some View {
    NavigationStack {
      Group {
        if let submission {
          VStack(spacing: 18) {
            Spacer(minLength: 24)

            Image(systemName: "checkmark.circle.fill")
              .font(.system(size: 58, weight: .semibold))
              .foregroundStyle(HomeboardPalette.success)

            VStack(spacing: 8) {
              Text("Bug report received")
                .font(.title2.bold())
                .foregroundStyle(HomeboardPalette.primaryText)
              Text("Keep the tracking ID below if you need to follow up.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }

            VStack(spacing: 4) {
              Text(receivedAtLine(submission.promisedBy))
              Text("Tracking ID \(submission.reportId.suffix(8).uppercased())")
            }
            .font(.caption.monospaced())
            .foregroundStyle(HomeboardPalette.tertiaryText)

            Button("Done") { dismiss() }
              .font(.headline)
              .foregroundStyle(Color.black)
              .frame(maxWidth: .infinity, minHeight: 52)
              .background(HomeboardPalette.accent)
              .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
              .buttonStyle(HomeboardAreaButtonStyle())

            Spacer()
          }
          .padding(20)
        } else {
          VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
              Text("Saw a bug?")
                .font(.title2.bold())
                .foregroundStyle(HomeboardPalette.primaryText)
              Text("Leave the details here and Homeboard will attach a tracking ID.")
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }

            ZStack(alignment: .topLeading) {
              if feedback.isEmpty {
                Text("What happened? What did you expect instead?")
                  .font(.body)
                  .foregroundStyle(HomeboardPalette.tertiaryText)
                  .padding(.horizontal, 17)
                  .padding(.vertical, 20)
                  .allowsHitTesting(false)
              }

              TextEditor(text: $feedback)
                .font(.body)
                .foregroundStyle(HomeboardPalette.primaryText)
                .scrollContentBackground(.hidden)
                .padding(12)
            }
            .frame(minHeight: 210)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            Label(
              "Homeboard includes the app version, device, current screen, item counts, and a privacy-filtered share-extension trace. It does not send your email, listing addresses, page contents, comments, preferences, or access tokens.",
              systemImage: "hand.raised.fill"
            )
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)

            if let errorMessage {
              Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                .font(.caption)
                .foregroundStyle(HomeboardPalette.danger)
            }

            Button {
              submit()
            } label: {
              HStack(spacing: 9) {
                if isSubmitting {
                  ProgressView()
                    .tint(Color.black)
                } else {
                  Image(systemName: "paperplane.fill")
                }
                Text(isSubmitting ? "Sending…" : "Send bug report")
              }
              .font(.headline)
              .foregroundStyle(Color.black)
              .frame(maxWidth: .infinity, minHeight: 52)
              .background(HomeboardPalette.accent)
              .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(HomeboardAreaButtonStyle())
            .disabled(trimmedFeedback.count < 5 || isSubmitting)
            .opacity(trimmedFeedback.count < 5 || isSubmitting ? 0.5 : 1)

            Spacer(minLength: 0)
          }
          .padding(20)
        }
      }
      .background(HomeboardPalette.background.ignoresSafeArea())
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
    }
  }

  private func submit() {
    guard trimmedFeedback.count >= 5, !isSubmitting else { return }
    isSubmitting = true
    errorMessage = nil

    Task {
      do {
        submission = try await appModel.submitBugReport(
          description: trimmedFeedback,
          currentScreen: currentScreen,
          deviceKind: deviceKind
        )
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      } catch {
        errorMessage = error.localizedDescription
        UINotificationFeedbackGenerator().notificationOccurred(.error)
      }
      isSubmitting = false
    }
  }
}

private struct SharedSafariSaveGuideSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var practiceComplete = false

  var body: some View {
    NavigationStack {
      ZStack {
        WorkspaceBackgroundView()

        VStack(alignment: .leading, spacing: 14) {
          SharedPageHeader(
            eyebrow: "Safari capture",
            title: "Enable once. Tap to save.",
            subtitle: "Open a listing and Homeboard appears."
          )

          SharedSafariExtensionSetupCard(compact: true)

          SharedSafariActionPreview { practiceComplete = true }

          Label("Scroll to tuck away · tap the tab to reopen", systemImage: "rectangle.compress.vertical")
            .font(.caption.weight(.semibold))
            .foregroundStyle(HomeboardPalette.secondaryText)

          Button("Got it") {
            dismiss()
          }
          .font(.headline)
          .foregroundStyle(Color.black)
          .frame(maxWidth: .infinity)
          .frame(height: 50)
          .background(
            LinearGradient(
              colors: [HomeboardPalette.accent, HomeboardPalette.accentStrong],
              startPoint: .leading,
              endPoint: .trailing
            )
          )
          .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
          .buttonStyle(HomeboardAreaButtonStyle())
          .disabled(!practiceComplete)
          .opacity(practiceComplete ? 1 : 0.4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
      }
      .toolbar(.hidden, for: .navigationBar)
    }
    .interactiveDismissDisabled(!practiceComplete)
  }
}

private struct SharedSettingsSheet: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    ZStack(alignment: .topTrailing) {
      SharedSetupView()

      Button {
        dismiss()
      } label: {
        Image(systemName: "xmark")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .frame(width: 34, height: 34)
          .background(HomeboardPalette.surfaceDeep.opacity(0.90))
          .clipShape(Circle())
          .overlay {
            Circle().stroke(HomeboardPalette.border, lineWidth: 1)
          }
      }
      .buttonStyle(HomeboardAreaButtonStyle())
      .padding(.top, 10)
      .padding(.trailing, 14)
    }
  }
}

private struct SharedRecentlyDeletedSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var restoringListingID: ListingPreview.ID?
  @State private var isClearing = false
  @State private var confirmsClear = false

  private var listings: [ListingPreview] {
    appModel.recentlyDeletedListings
  }

  var body: some View {
    NavigationStack {
      ZStack {
        WorkspaceBackgroundView()

        ScrollView(.vertical, showsIndicators: false) {
          VStack(alignment: .leading, spacing: 16) {
            SharedPageHeader(
              eyebrow: "Recovery",
              title: "Recently Deleted",
              subtitle: "Listings stay here for seven days, then Homeboard removes them automatically. Restoring puts a listing back for the whole group."
            )

            if listings.isEmpty {
              VStack(spacing: 12) {
                Image(systemName: "trash.slash.fill")
                  .font(.system(size: 28, weight: .semibold))
                  .foregroundStyle(HomeboardPalette.accent)
                Text("Nothing waiting to be deleted")
                  .font(.headline)
                  .foregroundStyle(HomeboardPalette.primaryText)
                Text("Use Clean listings in Cards to move saved places here.")
                  .font(.subheadline)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .multilineTextAlignment(.center)
              }
              .frame(maxWidth: .infinity)
              .padding(.horizontal, 24)
              .padding(.vertical, 34)
              .sharedSurface(cornerRadius: 20)
            } else {
              LazyVStack(spacing: 12) {
                ForEach(listings) { listing in
                  HStack(spacing: 12) {
                    SharedListingArtwork(listing: listing, height: 82, cornerRadius: 14)
                      .frame(width: 96)

                    VStack(alignment: .leading, spacing: 4) {
                      Text(listing.title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(HomeboardPalette.primaryText)
                        .lineLimit(2)
                      Text([listing.priceLine, SharedListingText.detailLine(listing)]
                        .filter { !$0.isEmpty }
                        .joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(HomeboardPalette.secondaryText)
                        .lineLimit(2)
                      Text(retentionLine(for: listing.deletedAt))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(HomeboardPalette.danger)
                    }

                    Spacer(minLength: 2)

                    Button {
                      restoringListingID = listing.id
                      Task {
                        _ = await appModel.restoreRecentlyDeletedListing(id: listing.id)
                        restoringListingID = nil
                      }
                    } label: {
                      if restoringListingID == listing.id {
                        ProgressView()
                          .tint(HomeboardPalette.buttonText)
                          .frame(width: 68, height: 36)
                      } else {
                        Text("Restore")
                          .font(.caption.weight(.bold))
                          .foregroundStyle(HomeboardPalette.buttonText)
                          .frame(width: 68, height: 36)
                      }
                    }
                    .background(HomeboardPalette.accent)
                    .clipShape(Capsule())
                    .buttonStyle(HomeboardAreaButtonStyle())
                    .disabled(restoringListingID != nil || isClearing)
                  }
                  .padding(12)
                  .sharedSurface(cornerRadius: 18)
                }
              }

              if appModel.canPermanentlyClearRecentlyDeleted {
                Button(role: .destructive) {
                  confirmsClear = true
                } label: {
                  HStack {
                    if isClearing {
                      ProgressView()
                        .tint(HomeboardPalette.danger)
                    } else {
                      Image(systemName: "trash.fill")
                    }
                    Text(isClearing ? "Clearing…" : "Clear Recently Deleted now")
                    Spacer()
                  }
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.danger)
                  .padding(.horizontal, 16)
                  .frame(height: 52)
                  .sharedSurface(cornerRadius: 16)
                }
                .buttonStyle(HomeboardAreaButtonStyle())
                .disabled(isClearing || restoringListingID != nil)
              } else {
                Label(
                  "Only the board owner can permanently clear these before seven days.",
                  systemImage: "lock.fill"
                )
                .font(.caption)
                .foregroundStyle(HomeboardPalette.secondaryText)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .sharedSurface(cornerRadius: 16)
              }
            }
          }
          .padding(.horizontal, 16)
          .padding(.top, 18)
          .padding(.bottom, 34)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .vertical)
      }
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
    }
    .task {
      await appModel.purgeExpiredRecentlyDeletedListings()
    }
    .confirmationDialog(
      "Clear Recently Deleted?",
      isPresented: $confirmsClear,
      titleVisibility: .visible
    ) {
      Button("Clear permanently", role: .destructive) {
        isClearing = true
        Task {
          _ = await appModel.clearRecentlyDeletedListings()
          isClearing = false
        }
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("This permanently deletes every listing here, including its shared notes, votes, and decisions. It cannot be undone.")
    }
  }

  private func retentionLine(for value: String?) -> String {
    guard let value, let deletedAt = parsedDate(value) else {
      return "Deletes within seven days"
    }
    let remaining = max(0, (7 * 24 * 60 * 60) - Date().timeIntervalSince(deletedAt))
    let days = max(1, Int(ceil(remaining / (24 * 60 * 60))))
    return days == 1 ? "Deletes in 1 day" : "Deletes in \(days) days"
  }

  private func parsedDate(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }
}

// MARK: - Map components

private struct SharedWorkNodeMarker: View {
  let workNode: SharedWorkNode

  private var markerTitle: String {
    if workNode.isAdditionalPoint {
      return workNode.memberNames.count == 1
        ? workNode.memberNames[0]
        : "\(workNode.memberNames.count) commute points"
    }
    return workNode.memberNames.count == 1
      ? "\(workNode.memberNames[0])’s work"
      : "\(workNode.memberNames.count) people’s work"
  }

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 5) {
        Image(systemName: workNode.isAdditionalPoint ? "mappin.and.ellipse" : "briefcase.fill")
          .font(.system(size: 9, weight: .bold))
        VStack(alignment: .leading, spacing: 0) {
          Text(markerTitle)
            .font(.caption2.weight(.heavy))
            .lineLimit(1)
          Text("\(workNode.preferredMinutes)–\(workNode.maximumMinutes) min")
            .font(.system(size: 8, weight: .semibold))
            .opacity(0.72)
        }
      }
      .foregroundStyle(Color.black)
      .padding(.horizontal, 9)
      .frame(height: 34)
      .background(HomeboardPalette.success)
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(Color.white.opacity(0.58), lineWidth: 1)
      }

      Triangle()
        .fill(HomeboardPalette.success)
        .frame(width: 11, height: 7)
    }
    .shadow(color: Color.black.opacity(0.28), radius: 5, x: 0, y: 3)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "\(workNode.isAdditionalPoint ? "Additional commute point" : "Work") for \(workNode.memberNames.joined(separator: ", ")), \(workNode.destination), full commute score from \(workNode.preferredMinutes) to \(workNode.maximumMinutes) minutes"
    )
  }
}

private struct SharedRouteLegCallout: View {
  let leg: SharedComparisonRouteLeg
  let color: Color

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: leg.transportIcon)
        .font(.system(size: 8, weight: .heavy))
      Text(leg.transportLabel)
        .font(.system(size: 8, weight: .heavy))
      Text("~\(leg.minutes)m")
        .font(.system(size: 8, weight: .bold))
        .monospacedDigit()
    }
    .foregroundStyle(Color.black)
    .padding(.horizontal, 7)
    .frame(height: 22)
    .background(color)
    .clipShape(Capsule())
    .overlay {
      Capsule().stroke(Color.white.opacity(0.64), lineWidth: 1)
    }
    .shadow(color: Color.black.opacity(0.28), radius: 4, x: 0, y: 2)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "\(leg.transportLabel) leg, approximately \(leg.minutes) minutes"
    )
  }
}

private struct SharedComparisonTierLegend: View {
  let listingCount: Int
  let routedListingCount: Int
  let routedWorkMemberCount: Int
  let isLoadingCommutes: Bool
  let routingCompletedCount: Int
  let routingTotalCount: Int
  let routingFailedCount: Int
  let commuteAvailable: Bool

  var body: some View {
    VStack(spacing: 7) {
      HStack(spacing: 10) {
        ForEach(SharedComparisonRegionTier.allCases) { tier in
          HStack(spacing: 4) {
            Circle()
              .fill(tier.color)
              .frame(width: 7, height: 7)
            Text(tier.label)
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(HomeboardPalette.secondaryText)
          }
        }

        Spacer(minLength: 2)

        if isLoadingCommutes {
          Text("\(routingCompletedCount)/\(routingTotalCount) checked")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(HomeboardPalette.accent)
            .monospacedDigit()
        } else {
          Text("\(listingCount) scored")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(HomeboardPalette.tertiaryText)
        }
      }

      HStack(spacing: 7) {
        if commuteAvailable {
          Text(
            isLoadingCommutes
              ? "\(routedListingCount) live routes ready · requesting the rest"
              : "\(routedListingCount)/\(max(routingTotalCount, listingCount)) homes · \(routedWorkMemberCount) commute route\(routedWorkMemberCount == 1 ? "" : "s") each"
          )
            .foregroundStyle(HomeboardPalette.primaryText)
        } else {
          Image(systemName: "tram.fill")
            .foregroundStyle(HomeboardPalette.tertiaryText)
          Text("Commute excluded · add an office neighborhood to enable routes")
            .foregroundStyle(HomeboardPalette.tertiaryText)
        }
        Spacer(minLength: 0)
      }
      .font(.caption2.weight(.semibold))

      if isLoadingCommutes, routingTotalCount > 0 {
        ProgressView(
          value: Double(routingCompletedCount),
          total: Double(routingTotalCount)
        )
        .tint(HomeboardPalette.accent)
      } else if routingFailedCount > 0 {
        Text("\(routingFailedCount) home\(routingFailedCount == 1 ? "" : "s") had no live Apple route after retries")
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(HomeboardPalette.tertiaryText)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(HomeboardPalette.surface.opacity(0.96))
    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 15, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "Comparison tiers from green best fit to red weakest fit. \(listingCount) listings scored and \(routedListingCount) listings routed."
    )
  }
}

private struct SharedComparisonNodeRouteCard: View {
  private struct DestinationGroup: Identifiable {
    let id: String
    let destination: String
    let memberNames: [String]
    let routes: [SharedComparisonCommuteCorridor]

    var recommendedRoute: SharedComparisonCommuteCorridor? {
      let usable = routes.filter { route in
        if route.mode == .walking && route.minutes > 30 {
          return false
        }
        return route.easeMinutes < 999
      }
      return usable.min { $0.easeMinutes < $1.easeMinutes }
    }
  }

  let listing: ListingPreview
  let score: SharedListingComparisonScore
  let tier: SharedComparisonRegionTier
  let routes: [SharedComparisonCommuteCorridor]
  let isLoading: Bool
  let onOpen: () -> Void
  let onDismiss: () -> Void

  private var destinationGroups: [DestinationGroup] {
    let grouped = Dictionary(grouping: routes, by: \.targetID)
    return grouped.keys.sorted().compactMap { targetID in
      guard let values = grouped[targetID],
            let first = values.first
      else { return nil }
      var routeByMode: [SharedCommuteMode: SharedComparisonCommuteCorridor] = [:]
      for route in values {
        if let existing = routeByMode[route.mode] {
          if route.easeMinutes < existing.easeMinutes {
            routeByMode[route.mode] = route
          }
        } else {
          routeByMode[route.mode] = route
        }
      }
      return DestinationGroup(
        id: targetID,
        destination: first.destination,
        memberNames: Array(Set(values.flatMap(\.memberNames))).sorted(),
        routes: routeByMode.values.sorted {
          $0.mode.cardOrder < $1.mode.cardOrder
        }
      )
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        Button(action: onOpen) {
          HStack(spacing: 10) {
            ZStack {
              Circle()
                .fill(tier.color.opacity(0.16))
              Circle()
                .stroke(tier.color, lineWidth: 2)
              Text(score.total.formatted())
                .font(.subheadline.weight(.heavy))
                .foregroundStyle(tier.color)
            }
            .frame(width: 42, height: 42)

            VStack(alignment: .leading, spacing: 2) {
              Text(listing.title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)
                .lineLimit(1)
              Text("\(tier.label) fit · \(listing.priceLine)")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(HomeboardPalette.secondaryText)
                .lineLimit(1)
            }

            Image(systemName: "chevron.up")
              .font(.caption2.weight(.heavy))
              .foregroundStyle(HomeboardPalette.tertiaryText)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .accessibilityLabel("Open score explanation for \(listing.title)")

        if isLoading {
          ProgressView()
            .controlSize(.small)
            .tint(HomeboardPalette.accent)
        }

        Button(action: onDismiss) {
          Image(systemName: "xmark")
            .font(.caption.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
            .frame(width: 30, height: 30)
            .background(Color.white.opacity(0.08))
            .clipShape(Circle())
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .accessibilityLabel("Dismiss route details")
      }

      if !score.modelEvidence.isEmpty {
        HStack(alignment: .top, spacing: 6) {
          Image(systemName: "sparkles")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(HomeboardPalette.accent)
          Text("Listing evidence · \(score.modelEvidence.prefix(2).joined(separator: " · "))")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(HomeboardPalette.secondaryText)
            .lineLimit(2)
        }
      }

      if destinationGroups.isEmpty {
        if isLoading {
          VStack(alignment: .leading, spacing: 8) {
            HomeboardSkeletonBlock(height: 29, cornerRadius: 14)
            HomeboardSkeletonBlock(width: 218, height: 9, cornerRadius: 5)
          }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel("Checking drive, transit, and walking times")
        } else {
          HStack(spacing: 8) {
            Image(systemName: "briefcase")
              .foregroundStyle(HomeboardPalette.accent)
            Text("Add a work destination to compare routes.")
              .font(.caption.weight(.semibold))
              .foregroundStyle(HomeboardPalette.secondaryText)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      } else {
        ForEach(Array(destinationGroups.prefix(2))) { group in
          VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 5) {
              Image(systemName: "briefcase.fill")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(HomeboardPalette.success)
              Text(group.destination)
                .font(.caption2.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)
                .lineLimit(1)
              if !group.memberNames.isEmpty {
                Text("· \(group.memberNames.joined(separator: ", "))")
                  .font(.caption2)
                  .foregroundStyle(HomeboardPalette.tertiaryText)
                  .lineLimit(1)
              }
            }

            HStack(spacing: 6) {
              ForEach(group.routes) { route in
                routePill(
                  route,
                  isRecommended: route.id == group.recommendedRoute?.id
                )
              }
            }

            if let recommended = group.recommendedRoute {
              Text("Best usable route: \(recommended.transportLabel) · \(formattedMinutes(recommended.minutes))")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(HomeboardPalette.success)
            }
          }
        }

        if destinationGroups.count > 2 {
          Text("+\(destinationGroups.count - 2) more work destinations")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(HomeboardPalette.tertiaryText)
        }
      }
    }
    .padding(12)
    .background(HomeboardPalette.surface.opacity(0.98))
    .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 17, style: .continuous)
        .stroke(tier.color.opacity(0.28), lineWidth: 1)
    }
    .shadow(color: Color.black.opacity(0.30), radius: 12, x: 0, y: 6)
    .transition(.move(edge: .bottom).combined(with: .opacity))
  }

  private func routePill(
    _ route: SharedComparisonCommuteCorridor,
    isRecommended: Bool
  ) -> some View {
    HStack(spacing: 4) {
      if isRecommended {
        Image(systemName: "checkmark")
          .font(.system(size: 8, weight: .heavy))
      }
      Image(systemName: route.transportIcon)
        .font(.system(size: 9, weight: .bold))
      Text(route.transportLabel)
        .font(.system(size: 9, weight: .bold))
      Text(formattedMinutes(route.minutes))
        .font(.system(size: 9, weight: .heavy))
        .monospacedDigit()
    }
    .foregroundStyle(route.tier.color)
    .padding(.horizontal, 8)
    .frame(height: 27)
    .background(
      (isRecommended ? HomeboardPalette.success : route.tier.color)
        .opacity(isRecommended ? 0.20 : 0.12)
    )
    .clipShape(Capsule())
    .overlay {
      Capsule().stroke(
        (isRecommended ? HomeboardPalette.success : route.tier.color).opacity(0.30),
        lineWidth: isRecommended ? 1.5 : 1
      )
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "\(route.transportLabel), \(route.minutes) minutes, \(isRecommended ? "best usable route" : route.tier.accessibilityLabel)"
    )
  }

  private func formattedMinutes(_ minutes: Int) -> String {
    guard minutes >= 60 else { return "\(minutes)m" }
    let hours = minutes / 60
    let remainder = minutes % 60
    return remainder == 0 ? "\(hours)h" : "\(hours)h \(remainder)m"
  }
}

private struct SharedComparisonNodeDetailSheet: View {
  @Environment(\.dismiss) private var dismiss
  let listing: ListingPreview
  let score: SharedListingComparisonScore
  let tier: SharedComparisonRegionTier
  let routes: [SharedComparisonCommuteCorridor]
  let scoredRouteIDs: Set<String>
  let isLoading: Bool

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          HStack(spacing: 14) {
            ZStack {
              Circle().fill(tier.color.opacity(0.16))
              Circle().stroke(tier.color, lineWidth: 2.5)
              Text(score.total.formatted())
                .font(.title3.weight(.heavy))
                .foregroundStyle(tier.color)
            }
            .frame(width: 58, height: 58)

            VStack(alignment: .leading, spacing: 4) {
              Text(listing.title)
                .font(.headline.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)
                .lineLimit(2)
              Text("\(tier.label) fit · \(listing.priceLine)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tier.color)
              if !listing.address.isEmpty {
                Text(listing.address)
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .lineLimit(2)
              }
            }
          }

          VStack(alignment: .leading, spacing: 10) {
            Text("Why it scored \(score.total)")
              .font(.headline.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)

            Text("The contribution shows how much each known factor added to the 100-point total after your priority order was applied.")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)

            ForEach(SharedComparisonCriterion.allCases) { criterion in
              scoreRow(criterion)
            }
          }
          .padding(14)
          .homeboardInsetSurface(cornerRadius: 18)

          if !score.modelEvidence.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
              Label("Listing evidence", systemImage: "sparkles")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(HomeboardPalette.accent)
              Text(score.modelEvidence.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .homeboardInsetSurface(cornerRadius: 18, accent: HomeboardPalette.accent)
          }

          VStack(alignment: .leading, spacing: 10) {
            HStack {
              Text("Routes to work")
                .font(.headline.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)
              Spacer()
              if isLoading {
                ProgressView()
                  .controlSize(.small)
                  .tint(HomeboardPalette.accent)
              }
            }

            if routes.isEmpty {
              if isLoading {
                VStack(spacing: 9) {
                  HomeboardSkeletonBlock(height: 54, cornerRadius: 13)
                  HomeboardSkeletonBlock(height: 54, cornerRadius: 13)
                  HomeboardSkeletonBlock(width: 196, height: 11, cornerRadius: 5)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Calculating drive, transit, and walking routes")
              } else {
                Text("No routable work destination is available yet.")
                  .font(.subheadline)
                  .foregroundStyle(HomeboardPalette.secondaryText)
              }
            } else {
              ForEach(routes) { route in
                routeRow(route)
              }
            }
          }
          .padding(14)
          .homeboardInsetSurface(cornerRadius: 18)
        }
        .padding(18)
        .padding(.bottom, 24)
      }
      .background(WorkspaceBackgroundView())
      .navigationTitle("Comparison details")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
    }
  }

  @ViewBuilder
  private func scoreRow(_ criterion: SharedComparisonCriterion) -> some View {
    let value = score.values[criterion]
    let weight = score.weights[criterion]

    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 9) {
        Image(systemName: criterion.icon)
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
          .frame(width: 20)
        Text(criterion.label)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Spacer()
        if let value, let weight {
          Text("\(value)/100")
            .font(.caption.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
            .monospacedDigit()
          Text("\(Int((weight * 100).rounded()))% · +\(Int((Double(value) * weight).rounded()))")
            .font(.caption2.weight(.bold))
            .foregroundStyle(HomeboardPalette.accent)
            .monospacedDigit()
        } else {
          Text("Not scored")
            .font(.caption.weight(.semibold))
            .foregroundStyle(HomeboardPalette.tertiaryText)
        }
      }

      if let detail = score.details[criterion], value != nil {
        Text(detail)
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.leading, 29)
      }
    }
    .padding(.vertical, 5)
  }

  private func routeRow(_ route: SharedComparisonCommuteCorridor) -> some View {
    let routeID = "\(route.targetID)|\(route.mode.rawValue)"
    let contributed = scoredRouteIDs.contains(routeID)
    return HStack(spacing: 10) {
      Image(systemName: route.transportIcon)
        .font(.subheadline.weight(.bold))
        .foregroundStyle(route.tier.color)
        .frame(width: 26, height: 26)
        .background(route.tier.color.opacity(0.12))
        .clipShape(Circle())

      VStack(alignment: .leading, spacing: 2) {
        Text("\(route.transportLabel) to \(route.destination)")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .lineLimit(2)
        Text("\(route.memberNames.joined(separator: ", ")) · full score \(route.preferredMinutes)–\(route.maximumMinutes) min")
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .lineLimit(2)
      }

      Spacer(minLength: 6)

      VStack(alignment: .trailing, spacing: 2) {
        Text(formattedMinutes(route.minutes))
          .font(.subheadline.weight(.heavy))
          .foregroundStyle(route.tier.color)
          .monospacedDigit()
        if route.easeMinutes >= 999 {
          Text("not usable by all")
            .font(.system(size: 8, weight: .semibold))
            .foregroundStyle(HomeboardPalette.danger)
        } else if abs(route.easeMinutes - route.minutes) >= 3 {
          Text("ease \(formattedMinutes(route.easeMinutes))")
            .font(.system(size: 8, weight: .semibold))
            .foregroundStyle(HomeboardPalette.tertiaryText)
            .monospacedDigit()
        }
        if contributed {
          Text("SCORED")
            .font(.system(size: 8, weight: .heavy))
            .tracking(0.7)
            .foregroundStyle(HomeboardPalette.success)
        }
      }
    }
    .padding(10)
    .background(Color.white.opacity(contributed ? 0.065 : 0.035))
    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 13, style: .continuous)
        .stroke(contributed ? HomeboardPalette.success.opacity(0.26) : Color.white.opacity(0.06), lineWidth: 1)
    }
  }

  private func formattedMinutes(_ minutes: Int) -> String {
    guard minutes >= 60 else { return "\(minutes)m" }
    let hours = minutes / 60
    let remainder = minutes % 60
    return remainder == 0 ? "\(hours)h" : "\(hours)h \(remainder)m"
  }
}

private struct SharedSearchControlBar: View {
  @Binding var presentation: SharedSearchPresentation
  let resultCount: Int
  let filterCount: Int
  let hasArea: Bool
  let drawingArea: Bool
  let comparisonActive: Bool
  let comparisonReady: Bool
  let cleanableCount: Int
  let isCleaning: Bool
  let onFilter: () -> Void
  let onClean: () -> Void
  let onDraw: () -> Void
  let onClearArea: () -> Void

  var body: some View {
    HStack(spacing: 6) {
      HStack(spacing: 3) {
        ForEach(SharedSearchPresentation.allCases, id: \.self) { option in
          Button {
            withAnimation(.easeInOut(duration: 0.18)) { presentation = option }
          } label: {
            Image(systemName: option == .map ? "map.fill" : "rectangle.grid.1x2.fill")
              .font(.caption.weight(.bold))
              .foregroundStyle(presentation == option ? HomeboardPalette.buttonText : HomeboardPalette.secondaryText)
              .frame(width: 34, height: 32)
              .background(presentation == option ? HomeboardPalette.accent : Color.clear)
              .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
        }
      }
      .padding(3)
      .background(HomeboardPalette.surfaceDeep.opacity(0.88))
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

      Label(
        comparisonActive
          ? comparisonReady ? "\(resultCount)" : "\(resultCount)/2"
          : "\(resultCount)",
        systemImage: comparisonActive ? "chart.bar.xaxis" : "house.fill"
      )
        .font(.caption.weight(.semibold))
        .lineLimit(1)
        .fixedSize()
        .foregroundStyle(
          comparisonActive && !comparisonReady
            ? Color(red: 0.98, green: 0.70, blue: 0.34)
            : HomeboardPalette.secondaryText
        )
        .accessibilityLabel(
          comparisonActive
            ? comparisonReady
              ? "\(resultCount) listings compared"
              : "\(resultCount) of 2 listings needed"
            : "\(resultCount) listings"
        )

      Spacer(minLength: 2)

      Button(action: onFilter) {
        Label(filterCount > 0 ? "Filters \(filterCount)" : "Filters", systemImage: "slider.horizontal.3")
          .font(.caption.weight(.bold))
          .lineLimit(1)
          .fixedSize(horizontal: true, vertical: false)
          .foregroundStyle(filterCount > 0 ? HomeboardPalette.buttonText : HomeboardPalette.primaryText)
          .padding(.horizontal, 12)
          .frame(width: filterCount > 0 ? 94 : 86)
          .frame(height: 36)
          .background(filterCount > 0 ? HomeboardPalette.accent : HomeboardPalette.surfaceDeep.opacity(0.88))
          .clipShape(Capsule())
      }
      .buttonStyle(HomeboardAreaButtonStyle())
      .layoutPriority(2)

      if presentation == .map {
        Button(action: hasArea ? onClearArea : onDraw) {
          Label(
            hasArea ? "Clear" : "Area",
            systemImage: hasArea ? "xmark" : drawingArea ? "pencil.and.outline" : "square.dashed"
          )
          .font(.caption.weight(.bold))
          .lineLimit(1)
          .fixedSize(horizontal: true, vertical: false)
          .foregroundStyle((hasArea || drawingArea) ? HomeboardPalette.buttonText : HomeboardPalette.primaryText)
          .padding(.horizontal, 9)
          .frame(width: 76)
          .frame(height: 36)
          .background((hasArea || drawingArea) ? HomeboardPalette.accent : HomeboardPalette.surfaceDeep.opacity(0.88))
          .clipShape(Capsule())
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .layoutPriority(2)
        .accessibilityLabel(hasArea ? "Clear drawn search area" : "Draw a search area")
      } else {
        Button(action: onClean) {
          Text("Clean listings")
            .font(.caption.weight(.bold))
            .lineLimit(1)
            .minimumScaleFactor(0.82)
            .foregroundStyle(
              isCleaning ? HomeboardPalette.buttonText : HomeboardPalette.primaryText
            )
            .padding(.horizontal, 10)
            .frame(width: 104, height: 36)
            .background(
              isCleaning ? HomeboardPalette.accent : HomeboardPalette.surfaceDeep.opacity(0.88)
            )
            .clipShape(Capsule())
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .disabled(cleanableCount == 0)
        .opacity(cleanableCount == 0 ? 0.46 : 1)
        .layoutPriority(2)
        .accessibilityHint(
          cleanableCount == 0
            ? "Save a listing before cleaning the shared board."
            : "Choose saved listings to move to Recently Deleted."
        )
      }
    }
    .padding(.horizontal, 6)
    .frame(height: 46)
    .background(HomeboardPalette.surface.opacity(0.94))
    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 15, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
    .sharedCoachmarkTarget("search-controls")
  }
}

private struct SharedCleanListingsActionBar: View {
  let selectedCount: Int
  let onCancel: () -> Void
  let onMove: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(selectedCount == 0 ? "Choose saved listings" : "\(selectedCount) selected")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text("Only listings already on this board can be moved.")
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .lineLimit(1)
      }

      Spacer(minLength: 4)

      Button("Cancel", action: onCancel)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.secondaryText)
        .buttonStyle(HomeboardAreaButtonStyle())

      Button(action: onMove) {
        Label("Move", systemImage: "trash")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.buttonText)
          .padding(.horizontal, 12)
          .frame(height: 36)
          .background(HomeboardPalette.accent)
          .clipShape(Capsule())
      }
      .buttonStyle(HomeboardAreaButtonStyle())
      .disabled(selectedCount == 0)
      .opacity(selectedCount == 0 ? 0.42 : 1)
    }
    .padding(.horizontal, 12)
    .frame(height: 54)
    .background(HomeboardPalette.surface.opacity(0.97))
    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 15, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
  }
}

private struct SharedGroupCommuteComparisonButton: View {
  let isActive: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Label("Compare group commutes", systemImage: "arrow.triangle.branch")
        .font(.caption.weight(.bold))
        .foregroundStyle(Color.black)
        .padding(.horizontal, 13)
        .frame(height: 36)
        .background(HomeboardPalette.accent)
        .clipShape(Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(HomeboardAreaButtonStyle())
    .frame(maxWidth: .infinity, alignment: .trailing)
    .accessibilityLabel(
      isActive ? "Adjust the group commute comparison map" : "Open the group commute comparison map"
    )
  }
}

private struct SharedComparisonPrioritySheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var ranks: [SharedComparisonCriterion: Int]
  @Binding var cityQuery: String
  let isActive: Bool
  let listingCount: Int
  let commuteAvailable: Bool
  let onActivate: () -> Void
  let onDisable: () -> Void

  private func criteria(at rank: Int) -> [SharedComparisonCriterion] {
    SharedComparisonCriterion.allCases
      .filter { ranks[$0] == rank }
      .sorted { $0.rawValue < $1.rawValue }
  }

  private func percentage(for criterion: SharedComparisonCriterion) -> Int {
    guard criterion != .commute || commuteAvailable else { return 0 }
    let activeCriteria = SharedComparisonCriterion.allCases.filter {
      $0 != .commute || commuteAvailable
    }
    let totalWeight = activeCriteria.reduce(0) {
      $0 + SharedComparisonMath.priorityWeight(for: ranks[$1] ?? 4)
    }
    let criterionWeight = SharedComparisonMath.priorityWeight(for: ranks[criterion] ?? 4)
    return Int((criterionWeight / totalWeight * 100).rounded())
  }

  private func levelLabel(_ rank: Int) -> String {
    switch rank {
    case 1: "Most important"
    case 2: "Very important"
    case 3: "Important"
    default: "Lower priority"
    }
  }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        VStack(alignment: .leading, spacing: 10) {
          Text("Shape the comparison")
            .font(.title3.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text(
            "Use the arrow buttons to move a factor. Factors can share a level when they matter equally."
          )
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)

          HStack(spacing: 9) {
            Image(systemName: "building.2.crop.circle")
              .foregroundStyle(HomeboardPalette.accent)
            TextField("City or metro area", text: $cityQuery)
              .textInputAutocapitalization(.words)
              .autocorrectionDisabled()
              .foregroundStyle(HomeboardPalette.primaryText)
              .submitLabel(.done)
          }
          .padding(.horizontal, 12)
          .frame(height: 44)
          .background(Color.white.opacity(0.06))
          .clipShape(Capsule())
          .overlay {
            Capsule()
              .stroke(Color.white.opacity(0.08), lineWidth: 1)
          }

          if !commuteAvailable {
            Label(
              "Commute is off because everyone skipped it or no office area is saved. Add an office neighborhood to enable commute grading.",
              systemImage: "tram.fill"
            )
            .font(.caption.weight(.semibold))
            .foregroundStyle(HomeboardPalette.tertiaryText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(11)
            .background(HomeboardPalette.surfaceDeep.opacity(0.42))
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.top, 16)
        .padding(.bottom, 10)

        ScrollView(.vertical, showsIndicators: false) {
          LazyVStack(spacing: 12) {
            ForEach(1...4, id: \.self) { rank in
              VStack(alignment: .leading, spacing: 9) {
                HStack {
                  Text("#\(rank)")
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(rank == 1 ? HomeboardPalette.success : HomeboardPalette.accent)
                    .frame(width: 26, alignment: .leading)

                  Text(levelLabel(rank))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(HomeboardPalette.secondaryText)

                  Spacer()

                  Text("\(Int(SharedComparisonMath.priorityWeight(for: rank)))× weight")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(HomeboardPalette.tertiaryText)
                }

                if criteria(at: rank).isEmpty {
                  Text("No factors at this level")
                    .font(.caption)
                    .foregroundStyle(HomeboardPalette.tertiaryText)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(HomeboardPalette.surface.opacity(0.34))
                    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                } else {
                  ForEach(criteria(at: rank)) { criterion in
                    let commuteDisabled = criterion == .commute && !commuteAvailable
                    HStack(spacing: 11) {
                      Image(systemName: criterion.icon)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(commuteDisabled ? HomeboardPalette.tertiaryText : HomeboardPalette.buttonText)
                        .frame(width: 34, height: 34)
                        .background(commuteDisabled ? HomeboardPalette.surfaceDeep : HomeboardPalette.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                      VStack(alignment: .leading, spacing: 2) {
                        Text(criterion.label)
                          .font(.subheadline.weight(.bold))
                          .foregroundStyle(HomeboardPalette.primaryText)
                        Text(commuteDisabled ? "Unavailable until an office area is saved" : criterion.explanation)
                          .font(.caption2)
                          .foregroundStyle(HomeboardPalette.secondaryText)
                          .lineLimit(1)
                      }

                      Spacer(minLength: 4)

                      VStack(spacing: 5) {
                        Text(commuteDisabled ? "Off" : "\(percentage(for: criterion))%")
                          .font(.caption2.weight(.heavy))
                          .foregroundStyle(HomeboardPalette.accent)

                        HStack(spacing: 5) {
                          priorityMoveButton(
                            icon: "chevron.up",
                            label: "Move \(criterion.label) up",
                            disabled: rank == 1 || commuteDisabled
                          ) {
                            move(criterion, to: rank - 1)
                          }

                          priorityMoveButton(
                            icon: "chevron.down",
                            label: "Move \(criterion.label) down",
                            disabled: rank == 4 || commuteDisabled
                          ) {
                            move(criterion, to: rank + 1)
                          }
                        }
                      }
                    }
                    .padding(10)
                    .frame(minHeight: 68)
                    .background(HomeboardPalette.surface.opacity(0.72))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay {
                      RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(HomeboardPalette.border, lineWidth: 1)
                    }
                    .opacity(commuteDisabled ? 0.46 : 1)
                    .accessibilityHint(
                      commuteDisabled
                        ? "Add an office neighborhood or address in Edit search brief to enable commute grading."
                        : criterion.explanation
                    )
                  }
                }
              }
              .padding(12)
              .background(HomeboardPalette.surfaceDeep.opacity(0.48))
              .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
              .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                  .stroke(HomeboardPalette.border, lineWidth: 1)
              }
            }
          }

          Text(
            commuteAvailable
              ? "Weights are normalized to 100%. Comparison mode queues live Apple routes for every listing and saved workplace, retries failures, and keeps completed routes cached until an endpoint changes. Other missing facts stay unknown."
              : "Weights are normalized to 100% without commute. Commute stays excluded until someone saves an office neighborhood or address and does not skip matching."
          )
          .font(.caption2)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.vertical, 12)
        }
        .padding(.horizontal, 18)

        VStack(spacing: 10) {
          Button {
            onActivate()
            dismiss()
          } label: {
            Text(
              listingCount == 0
                ? "No listings available"
                : isActive
                  ? "Update comparison map"
                  : "Show comparison map"
            )
            .font(.subheadline.weight(.bold))
            .foregroundStyle(Color.black)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
              listingCount == 0
                ? HomeboardPalette.tertiaryText
                : HomeboardPalette.success
            )
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
          .disabled(
            listingCount == 0
              || cityQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          )

          if isActive {
            Button("Turn off comparison colors") {
              onDisable()
              dismiss()
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.secondaryText)
          }
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
        .padding(.bottom, 16)
      }
      .navigationTitle("Comparison")
      .navigationBarTitleDisplayMode(.inline)
      .background(HomeboardPalette.background.ignoresSafeArea())
    }
  }

  private func move(
    _ criterion: SharedComparisonCriterion,
    to rank: Int
  ) {
    withAnimation(.snappy(duration: 0.22)) {
      ranks[criterion] = min(max(rank, 1), 4)
    }
  }

  private func priorityMoveButton(
    icon: String,
    label: String,
    disabled: Bool,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: icon)
        .font(.caption.weight(.heavy))
        .foregroundStyle(disabled ? HomeboardPalette.tertiaryText : HomeboardPalette.primaryText)
        .frame(width: 34, height: 34)
        .background(HomeboardPalette.surfaceDeep.opacity(disabled ? 0.30 : 0.82))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    .buttonStyle(HomeboardAreaButtonStyle())
    .disabled(disabled)
    .accessibilityLabel(label)
  }
}

private struct SharedSearchFilterSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var filters: SharedSearchFilters

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 18) {
        Text("Only filters that can be checked against saved listing data are applied.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)

        SharedFilterField(title: "Maximum monthly rent", placeholder: "$5,000", text: $filters.maxPrice, keyboard: .numberPad)
        SharedFilterField(title: "Minimum bedrooms", placeholder: "2", text: $filters.minimumBedrooms, keyboard: .decimalPad)
        SharedFilterField(title: "Neighborhood or address", placeholder: "Astoria", text: $filters.locationQuery, keyboard: .default)

        Spacer()

        HStack(spacing: 10) {
          Button("Clear") {
            filters = SharedSearchFilters()
          }
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .frame(maxWidth: .infinity)
          .frame(height: 48)
          .background(Color.white.opacity(0.06))
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))

          Button("Show results") { dismiss() }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(Color.black)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(HomeboardPalette.accent)
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(HomeboardAreaButtonStyle())
      }
      .padding(18)
      .navigationTitle("Search filters")
      .navigationBarTitleDisplayMode(.inline)
      .background(HomeboardPalette.background.ignoresSafeArea())
    }
  }
}

private struct SharedFilterField: View {
  let title: String
  let placeholder: String
  @Binding var text: String
  let keyboard: UIKeyboardType

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title)
        .font(.caption.weight(.bold))
        .foregroundStyle(HomeboardPalette.secondaryText)
      TextField(placeholder, text: $text)
        .keyboardType(keyboard)
        .textInputAutocapitalization(keyboard == .default ? .words : .never)
        .font(.body)
        .foregroundStyle(HomeboardPalette.primaryText)
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
  }
}

private struct SharedSearchListSurface: View {
  let listings: [ListingPreview]
  let comparisonScores: [String: SharedListingComparisonScore]
  let topListingIDs: Set<String>
  let selectedListingID: String?
  let cleanableListingIDs: Set<ListingPreview.ID>
  let cleanSelection: Set<ListingPreview.ID>
  let isCleaning: Bool
  let isLoading: Bool
  let hasMore: Bool
  let onOpen: (ListingPreview) -> Void
  let onToggleCleanSelection: (ListingPreview) -> Void
  let onBrowse: () -> Void
  let onLoadMore: () -> Void

  var body: some View {
    ZStack {
      WorkspaceBackgroundView()

      if listings.isEmpty && isLoading {
        ScrollView(.vertical, showsIndicators: false) {
          LazyVStack(spacing: 12) {
            ForEach(0..<4, id: \.self) { _ in
              HomeboardListingSkeletonCard()
            }
          }
          .padding(.horizontal, 16)
          .padding(.top, 10)
          .padding(.bottom, 34)
        }
        .scrollDisabled(true)
        .accessibilityLabel("Loading listings")
      } else if listings.isEmpty {
        SharedMapEmptyCard(city: "the selected search", onBrowse: onBrowse)
          .padding(.horizontal, 16)
      } else {
        ScrollView(.vertical, showsIndicators: false) {
          LazyVStack(spacing: 12) {
            ForEach(listings) { listing in
              let canClean = cleanableListingIDs.contains(listing.id)
              let isSelectedForCleaning = cleanSelection.contains(listing.id)
              Button {
                if isCleaning {
                  if canClean { onToggleCleanSelection(listing) }
                } else {
                  onOpen(listing)
                }
              } label: {
                HStack(spacing: 13) {
                  if let score = comparisonScores[listing.id] {
                    SharedComparisonScoreArtwork(
                      score: score,
                      isTopResult: topListingIDs.contains(listing.id)
                    )
                    .frame(width: 118, height: 106)
                  } else {
                    SharedListingArtwork(listing: listing, height: 106, cornerRadius: 16)
                      .frame(width: 118)
                  }

                  VStack(alignment: .leading, spacing: 6) {
                    Text(listing.priceLine)
                      .font(.headline.weight(.bold))
                      .foregroundStyle(HomeboardPalette.primaryText)
                    Text(listing.title)
                      .font(.subheadline.weight(.semibold))
                      .foregroundStyle(HomeboardPalette.primaryText)
                      .lineLimit(2)
                    Text(SharedListingText.detailLine(listing))
                      .font(.caption)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                      .lineLimit(2)
                    Label(listing.commuteLine, systemImage: "tram.fill")
                      .font(.caption2.weight(.semibold))
                      .foregroundStyle(HomeboardPalette.accent)
                      .lineLimit(1)
                    if let offer = listing.activeOffer {
                      SharedActiveOfferBanner(offer: offer, compact: true)
                    }
                  }
                  Spacer(minLength: 0)
                  if isCleaning {
                    if canClean {
                      Image(systemName: isSelectedForCleaning ? "checkmark.circle.fill" : "circle")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(
                          isSelectedForCleaning ? HomeboardPalette.accent : HomeboardPalette.secondaryText
                        )
                    } else {
                      Text("Not saved")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(HomeboardPalette.tertiaryText)
                    }
                  } else {
                    Image(systemName: "chevron.right")
                      .font(.caption.weight(.bold))
                      .foregroundStyle(HomeboardPalette.tertiaryText)
                  }
                }
                .padding(12)
                .sharedSurface(cornerRadius: 20)
                .overlay {
                  if isSelectedForCleaning || (!isCleaning && selectedListingID == listing.id) {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                      .stroke(HomeboardPalette.accent, lineWidth: 2)
                  }
                }
                .opacity(isCleaning && !canClean ? 0.56 : 1)
              }
              .buttonStyle(HomeboardAreaButtonStyle())
              .disabled(isCleaning && !canClean)
              .accessibilityLabel(
                isCleaning
                  ? canClean
                    ? "\(listing.title), \(isSelectedForCleaning ? "selected" : "not selected")"
                    : "\(listing.title), not saved to this board"
                  : listing.title
              )
            }

            if isLoading {
              VStack(spacing: 12) {
                HomeboardListingSkeletonCard()
                HomeboardListingSkeletonCard()
              }
              .padding(.top, 2)
              .accessibilityElement(children: .ignore)
              .accessibilityLabel("Loading more places")
            } else if hasMore {
              Color.clear
                .frame(height: 1)
                .onAppear(perform: onLoadMore)
            }
          }
          .frame(maxWidth: .infinity)
          .padding(.horizontal, 16)
          .padding(.top, 10)
          .padding(.bottom, 34)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .vertical)
      }
    }
  }
}

private struct SharedComparisonScoreArtwork: View {
  let score: SharedListingComparisonScore
  let isTopResult: Bool

  var body: some View {
    ZStack {
      LinearGradient(
        colors: [
          score.color.opacity(isTopResult ? 0.42 : 0.26),
          HomeboardPalette.surfaceDeep
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )

      VStack(spacing: 3) {
        if isTopResult {
          Label("TOP MATCH", systemImage: "sparkles")
            .font(.system(size: 8, weight: .heavy))
            .tracking(0.6)
        } else {
          Text("MATCH")
            .font(.system(size: 8, weight: .heavy))
            .tracking(0.8)
        }

        Text(score.total.formatted())
          .font(.system(size: 34, weight: .black, design: .rounded))
          .monospacedDigit()

        Text(score.label)
          .font(.system(size: 9, weight: .bold))
      }
      .foregroundStyle(score.color)
    }
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(score.color.opacity(isTopResult ? 0.9 : 0.42), lineWidth: 2)
    }
    .shadow(
      color: isTopResult ? score.color.opacity(0.28) : .clear,
      radius: 8,
      x: 0,
      y: 3
    )
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      "\(isTopResult ? "Top match" : "Comparison score"), \(score.total) out of 100"
    )
  }
}

private struct SharedClusterCardFilterBar: View {
  let count: Int
  let onClear: () -> Void

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "point.3.connected.trianglepath.dotted")
      Text("Filtered to selected cluster · \(count)")
      Spacer(minLength: 0)
      Button(action: onClear) {
        Image(systemName: "xmark")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
          .frame(width: 36, height: 36)
          .contentShape(Rectangle())
      }
      .buttonStyle(HomeboardAreaButtonStyle())
      .accessibilityLabel("Clear selected cluster filter")
    }
    .font(.caption.weight(.bold))
    .foregroundStyle(HomeboardPalette.primaryText)
    .padding(.horizontal, 12)
    .frame(height: 38)
    .background(HomeboardPalette.surface.opacity(0.96))
    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 13, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
    .accessibilityLabel("Cards filtered to \(count) listings from the selected map cluster")
  }
}

private struct SharedCommuteRouteStrip: View {
  let routes: [SharedCommuteRoute]
  let isLoading: Bool

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        if isLoading && routes.isEmpty {
          ForEach(0..<3, id: \.self) { index in
            HomeboardSkeletonBlock(
              width: index == 2 ? 96 : 126,
              height: 40,
              cornerRadius: 20
            )
          }
          .accessibilityHidden(true)
        }

        ForEach(routes) { route in
          HStack(spacing: 7) {
            Circle().fill(route.color).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 1) {
              Text(route.memberName)
                .font(.caption2.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)
              Text("\(route.mode.label) · \(route.duration) · \(route.distance)")
                .font(.caption2)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
          }
          .padding(.horizontal, 11)
          .frame(height: 40)
          .background(HomeboardPalette.surfaceDeep.opacity(0.90))
          .clipShape(Capsule())
        }
      }
    }
  }
}

private enum SharedMemberColors {
  static let values: [Color] = [
    HomeboardPalette.accent,
    Color(red: 0.82, green: 0.62, blue: 0.32),
    Color(red: 0.37, green: 0.62, blue: 0.46),
    Color(red: 0.79, green: 0.48, blue: 0.36),
    Color(red: 0.76, green: 0.42, blue: 0.44),
    Color(red: 0.54, green: 0.59, blue: 0.34)
  ]

  static func color(at index: Int) -> Color {
    values[index % values.count]
  }

  static func color(for identifier: String) -> Color {
    let scalarSum = identifier.unicodeScalars.reduce(0) { $0 + Int($1.value) }
    return color(at: scalarSum)
  }
}

private struct SharedSearchHeader: View {
  let board: MobileBoard
  let onAdd: () -> Void
  let onSettings: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(board.title)
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .lineLimit(1)

        Text(board.city.isEmpty ? "Search area still open" : board.city)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .lineLimit(1)
      }

      Spacer(minLength: 6)

      SharedAvatarStack(
        members: board.members.filter { $0.status != "commute point" },
        size: 27
      )

      Button(action: onSettings) {
        Image(systemName: "gearshape.fill")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.secondaryText)
          .frame(width: 34, height: 34)
          .background(Color.white.opacity(0.06))
          .clipShape(Circle())
      }
      .buttonStyle(HomeboardAreaButtonStyle())

      Button(action: onAdd) {
        Image(systemName: "plus")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(Color.black)
          .frame(width: 36, height: 36)
          .background(HomeboardPalette.accent)
          .clipShape(Circle())
      }
      .buttonStyle(HomeboardAreaButtonStyle())
      .sharedCoachmarkTarget("search-add")
    }
    .padding(.leading, 16)
    .padding(.trailing, 8)
    .frame(height: 54)
    .background(HomeboardPalette.surface.opacity(0.96))
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
    .shadow(color: Color.black.opacity(0.22), radius: 10, x: 0, y: 5)
  }
}

private struct SharedSelectedTransportPopup: View {
  private struct Badge: Identifiable {
    let icon: String
    let label: String

    var id: String { "\(icon)|\(label)" }
  }

  let routes: [SharedComparisonCommuteCorridor]
  let isLoading: Bool

  private var badges: [Badge] {
    var seen = Set<String>()
    return routes
      .sorted {
        if $0.mode.cardOrder == $1.mode.cardOrder {
          return $0.transportLabel < $1.transportLabel
        }
        return $0.mode.cardOrder < $1.mode.cardOrder
      }
      .compactMap { route in
        let badge = Badge(icon: route.transportIcon, label: route.transportLabel)
        return seen.insert(badge.id).inserted ? badge : nil
      }
  }

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 7) {
        if badges.isEmpty {
          if isLoading {
            ProgressView()
              .controlSize(.mini)
              .tint(HomeboardPalette.primaryText)
            Text("Finding route")
              .font(.system(size: 9, weight: .bold))
          } else {
            Image(systemName: "exclamationmark.triangle.fill")
              .font(.system(size: 9, weight: .bold))
            Text("Route unavailable")
              .font(.system(size: 9, weight: .bold))
          }
        } else {
          ForEach(Array(badges.prefix(3))) { badge in
            Label(badge.label, systemImage: badge.icon)
              .font(.system(size: 9, weight: .heavy))
              .lineLimit(1)
          }
        }
      }
      .foregroundStyle(HomeboardPalette.primaryText)
      .padding(.horizontal, 9)
      .frame(height: 25)
      .background(HomeboardPalette.surface.opacity(0.98))
      .clipShape(Capsule())
      .overlay {
        Capsule().stroke(Color.white.opacity(0.18), lineWidth: 1)
      }
      .shadow(color: Color.black.opacity(0.28), radius: 5, x: 0, y: 2)

      Triangle()
        .fill(HomeboardPalette.surface.opacity(0.98))
        .frame(width: 10, height: 6)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      badges.isEmpty
        ? (isLoading ? "Finding transport type" : "Route unavailable")
        : "Transport: \(badges.map(\.label).joined(separator: ", "))"
    )
  }
}

private struct SharedPriceMarker: View {
  let text: String
  let isSelected: Bool
  let comparisonScore: SharedListingComparisonScore?
  let comparisonColor: Color?
  let isHighlighted: Bool

  private var markerColor: Color {
    comparisonColor
      ?? comparisonScore?.color
      ?? (isSelected ? HomeboardPalette.accent : HomeboardPalette.accentStrong)
  }

  var body: some View {
    if comparisonScore != nil {
      ZStack {
        if isHighlighted {
          Circle()
            .fill(markerColor.opacity(0.20))
            .frame(width: 48, height: 48)
          Circle()
            .stroke(markerColor.opacity(0.92), lineWidth: 2)
            .frame(width: 43, height: 43)
        }

        Text(text)
          .font(.caption.weight(.heavy))
          .monospacedDigit()
          .foregroundStyle(Color.black)
          .frame(width: isHighlighted ? 37 : 34, height: isHighlighted ? 37 : 34)
          .background(markerColor)
          .clipShape(Circle())
      }
      .scaleEffect(isSelected ? 1.1 : 1)
      .shadow(
        color: isHighlighted ? markerColor.opacity(0.46) : Color.black.opacity(0.26),
        radius: isHighlighted ? 9 : 4,
        x: 0,
        y: isHighlighted ? 4 : 2
      )
      .accessibilityHint(isHighlighted ? "One of the five highest comparison scores" : "")
    } else {
      VStack(spacing: 0) {
        Text(text)
          .font(.caption2.weight(.heavy))
          .foregroundStyle(isSelected ? Color.black : Color.white)
          .padding(.horizontal, 10)
          .frame(height: 30)
          .background(markerColor)
          .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

        Triangle()
          .fill(markerColor)
          .frame(width: 11, height: 7)
      }
      .scaleEffect(isSelected ? 1.08 : 1)
      .shadow(color: Color.black.opacity(0.3), radius: 6, x: 0, y: 3)
    }
  }
}

private struct Triangle: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
    path.closeSubpath()
    return path
  }
}

private struct SharedMapPreviewCard: View {
  let listing: ListingPreview
  let onOpen: () -> Void

  var body: some View {
    Button(action: onOpen) {
      HStack(spacing: 12) {
        SharedListingArtwork(listing: listing, height: 96, cornerRadius: 16)
          .frame(width: 112)

        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .firstTextBaseline) {
            Text(listing.priceLine)
              .font(.headline.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
              .lineLimit(1)

            Spacer(minLength: 6)

            SharedStatusDot(status: listing.status)
          }

          Text(listing.title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.primaryText)
            .lineLimit(1)

          Text(SharedListingText.detailLine(listing))
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .lineLimit(1)

          HStack(spacing: 5) {
            Image(systemName: "tram.fill")
            Text(listing.commuteLine)
              .lineLimit(1)
          }
          .font(.caption2.weight(.semibold))
          .foregroundStyle(HomeboardPalette.accent)

          if let offer = listing.activeOffer {
            SharedActiveOfferBanner(offer: offer, compact: true)
          }
        }

        Image(systemName: "chevron.right")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
      .padding(10)
      .background(.ultraThinMaterial)
      .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(Color.white.opacity(0.1), lineWidth: 1)
      }
      .shadow(color: Color.black.opacity(0.38), radius: 20, x: 0, y: 10)
    }
    .buttonStyle(HomeboardAreaButtonStyle())
  }
}

private struct SharedMapEmptyCard: View {
  let city: String
  let onBrowse: () -> Void

  var body: some View {
    HStack(spacing: 14) {
      Image(systemName: "building.2.crop.circle")
        .font(.title2)
        .foregroundStyle(Color(red: 0.98, green: 0.72, blue: 0.42))
        .frame(width: 50, height: 50)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))

      VStack(alignment: .leading, spacing: 4) {
        Text("No listings match this view")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text("Try a wider map area, or browse in Safari and tap a listing pill to save a place in \(city.isEmpty ? "this search" : city).")
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }

      Spacer(minLength: 4)

      Button("Find listings", action: onBrowse)
        .font(.caption.weight(.bold))
        .foregroundStyle(Color.black)
        .padding(.horizontal, 14)
        .frame(height: 36)
        .background(HomeboardPalette.accent)
        .clipShape(Capsule())
        .buttonStyle(HomeboardAreaButtonStyle())
    }
    .padding(12)
    .background(.ultraThinMaterial)
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(Color.white.opacity(0.1), lineWidth: 1)
    }
  }
}

private struct SharedRentalSource: Identifiable {
  let name: String
  let detail: String
  let systemName: String
  let url: URL

  var id: String { name }
}

private struct SharedListingDiscoverySheet: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openURL) private var openURL
  @State private var showsLinkEntry = false
  @State private var showsSafariSetup = false
  let city: String

  private var destinationLabel: String {
    let cleaned = city.trimmingCharacters(in: .whitespacesAndNewlines)
    return cleaned.isEmpty ? "your search area" : cleaned
  }

  private var sources: [SharedRentalSource] {
    var values = [
      SharedRentalSource(
        name: "Zillow",
        detail: "Open its rental search",
        systemName: "house.fill",
        url: URL(string: "https://www.zillow.com/homes/for_rent/")!
      ),
      SharedRentalSource(
        name: "Apartments.com",
        detail: "Browse apartments and rentals",
        systemName: "building.2.fill",
        url: URL(string: "https://www.apartments.com/")!
      ),
      SharedRentalSource(
        name: "Realtor.com",
        detail: "Open its rental listings",
        systemName: "building.columns.fill",
        url: URL(string: "https://www.realtor.com/apartments/")!
      )
    ]

    let normalizedCity = city.lowercased()
    if normalizedCity.contains("new york") || normalizedCity.contains("nyc") {
      values.append(
        SharedRentalSource(
          name: "StreetEasy",
          detail: "Browse New York City rentals",
          systemName: "tram.fill",
          url: URL(string: "https://streeteasy.com/for-rent/nyc")!
        )
      )
    }

    values.append(
      SharedRentalSource(
        name: "Search the web",
        detail: "Use any rental site you prefer",
        systemName: "safari.fill",
        url: webSearchURL
      )
    )
    return values
  }

  private var webSearchURL: URL {
    var components = URLComponents(string: "https://www.google.com/search")!
    components.queryItems = [
      URLQueryItem(name: "q", value: "rental listings in \(destinationLabel)")
    ]
    return components.url!
  }

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          SharedPageHeader(
            eyebrow: destinationLabel,
            title: "Add a place",
            subtitle: "Open a listing in Safari, then tap its Homeboard pill to save."
          )

          Button { showsLinkEntry = true } label: {
            Label("Paste a listing link", systemImage: "link.badge.plus")
              .font(.subheadline.weight(.bold))
              .foregroundStyle(HomeboardPalette.buttonText)
              .frame(maxWidth: .infinity, minHeight: 50)
              .background(HomeboardPalette.accent, in: RoundedRectangle(cornerRadius: 16))
          }
          .buttonStyle(HomeboardAreaButtonStyle())

          VStack(spacing: 0) {
            ForEach(Array(sources.enumerated()), id: \.element.id) { index, source in
              Button {
                dismiss()
                openURL(source.url)
              } label: {
                HStack(spacing: 13) {
                  Image(systemName: source.systemName)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(HomeboardPalette.accent)
                    .frame(width: 40, height: 40)
                    .background(HomeboardPalette.surfaceDeep.opacity(0.72))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                  VStack(alignment: .leading, spacing: 3) {
                    Text(source.name)
                      .font(.subheadline.weight(.bold))
                      .foregroundStyle(HomeboardPalette.primaryText)
                    Text(source.detail)
                      .font(.caption)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                  }

                  Spacer()

                  Image(systemName: "arrow.up.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(HomeboardPalette.tertiaryText)
                }
                .padding(.horizontal, 13)
                .frame(minHeight: 62)
              }
              .buttonStyle(HomeboardAreaButtonStyle())

              if index < sources.count - 1 {
                SharedDivider()
              }
            }
          }
          .sharedSurface(cornerRadius: 19)

          Button { showsSafariSetup = true } label: {
            HStack(spacing: 12) {
              Image(systemName: "puzzlepiece.extension")
              VStack(alignment: .leading, spacing: 4) {
                Text("Set up Safari capture").font(.subheadline.weight(.semibold))
                Text("Enable once. Save with a tap.")
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.secondaryText)
              }
              Spacer()
              Image(systemName: "chevron.right").font(.caption.weight(.bold))
            }
            .foregroundStyle(HomeboardPalette.accent)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(14)
            .sharedSurface(cornerRadius: 16)
          }
          .buttonStyle(HomeboardAreaButtonStyle())

          Text("Homeboard keeps the original source attached so everyone can verify the listing before the group acts on it.")
            .font(.caption2)
            .foregroundStyle(HomeboardPalette.tertiaryText)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .padding(.bottom, 20)
      }
      .background(WorkspaceBackgroundView())
      .navigationTitle("Add a listing")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
    }
    .sheet(isPresented: $showsLinkEntry) {
      AddSharedListingSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsSafariSetup) {
      SharedSafariSaveGuideSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
  }
}

// MARK: - Shared list components

enum SharedListingFilter: String, CaseIterable, Identifiable {
  case active
  case touring
  case applied
  case passed
  case all

  var id: String { rawValue }
  var title: String { rawValue.capitalized }

  func includes(_ listing: ListingPreview) -> Bool {
    let status = listing.status.lowercased()
    let workflow = listing.workflowStatus.lowercased()
    let passed = ["passed", "rejected"].contains(status)
    switch self {
    case .active: return !passed && workflow != "decided"
    case .touring: return !passed && (status == "toured" || workflow == "viewing")
    case .applied: return !passed && (status == "applied" || workflow == "applying")
    case .passed: return passed
    case .all: return true
    }
  }
}

private struct SharedFilterBar: View {
  @Binding var selection: SharedListingFilter
  let counts: [SharedListingFilter: Int]

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(SharedListingFilter.allCases) { filter in
          Button {
            withAnimation(.snappy(duration: 0.2)) {
              selection = filter
            }
          } label: {
            HStack(spacing: 6) {
              Text(filter.title)
              Text("\(counts[filter, default: 0])")
                .foregroundStyle(selection == filter ? Color.black.opacity(0.58) : HomeboardPalette.tertiaryText)
            }
            .font(.caption.weight(.bold))
            .foregroundStyle(selection == filter ? Color.black : HomeboardPalette.secondaryText)
            .padding(.horizontal, 13)
            .frame(height: 34)
            .background(selection == filter ? HomeboardPalette.accent : Color.white.opacity(0.055))
            .clipShape(Capsule())
          }
          .buttonStyle(HomeboardAreaButtonStyle())
        }
      }
    }
    .sharedCoachmarkTarget("shortlist-filters")
  }
}

private struct SharedShortlistRow: View {
  let listing: ListingPreview
  let memberCount: Int
  let isSelectedForComparison: Bool
  let onOpen: () -> Void
  let onCompare: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      Button(action: onOpen) {
        HStack(alignment: .top, spacing: 12) {
          SharedListingArtwork(listing: listing, height: 112, cornerRadius: 16)
            .frame(width: 118)

          VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top, spacing: 8) {
              Text(listing.priceLine)
                .font(.headline.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)
                .lineLimit(1)
              Spacer(minLength: 0)
              SharedStatusDot(status: listing.workflowStatus)
            }

            Text(listing.title)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.primaryText)
              .lineLimit(2)

            Text(SharedListingText.detailLine(listing))
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .lineLimit(1)

            Label(listing.commuteLine, systemImage: "tram.fill")
              .font(.caption2.weight(.semibold))
              .foregroundStyle(HomeboardPalette.accent)
              .lineLimit(1)

            HStack(spacing: 7) {
              SharedMiniAvatars(count: memberCount)
              Text(listing.groupNote.isEmpty ? "Waiting on group notes" : "Group note added")
                .font(.caption2)
                .foregroundStyle(HomeboardPalette.tertiaryText)
                .lineLimit(1)
            }
          }
        }
        .padding(12)
      }
      .buttonStyle(HomeboardAreaButtonStyle())

      if let offer = listing.activeOffer {
        SharedActiveOfferBanner(offer: offer, compact: true)
          .padding(.horizontal, 12)
          .padding(.bottom, 8)
      }

      Divider()
        .overlay(Color.white.opacity(0.07))

      HStack {
        Text(listing.fitLabel)
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.secondaryText)
          .lineLimit(1)

        Spacer()

        Button(action: onCompare) {
          Label(
            isSelectedForComparison ? "Selected" : "Compare",
            systemImage: isSelectedForComparison ? "checkmark.circle.fill" : "plus.circle"
          )
          .font(.caption.weight(.bold))
          .foregroundStyle(isSelectedForComparison ? HomeboardPalette.success : HomeboardPalette.accent)
        }
        .buttonStyle(HomeboardAreaButtonStyle())
      }
      .padding(.horizontal, 14)
      .frame(height: 42)
    }
    .sharedSurface(cornerRadius: 20)
  }
}

private struct SharedShortlistEmptyState: View {
  let onBrowse: () -> Void
  @Environment(AppModel.self) private var appModel

  var body: some View {
    VStack(spacing: 16) {
      Image(systemName: "building.2")
        .font(.system(size: 34, weight: .light))
        .foregroundStyle(Color(red: 0.98, green: 0.72, blue: 0.42))

      VStack(spacing: 6) {
        Text("Nothing shortlisted yet")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Text("Browse in Safari and tap a Homeboard listing pill to save a place here. You can also add a listing link.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .multilineTextAlignment(.center)
      }

      HStack(spacing: 10) {
        Button("Search") {
          appModel.openBoardTab(.board)
        }
        .font(.subheadline.weight(.bold))
        .foregroundStyle(Color.black)
        .padding(.horizontal, 18)
        .frame(height: 44)
        .background(HomeboardPalette.accent)
        .clipShape(Capsule())
        .buttonStyle(HomeboardAreaButtonStyle())

        Button("Add a listing", action: onBrowse)
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .padding(.horizontal, 18)
          .frame(height: 44)
          .background(Color.white.opacity(0.07))
          .clipShape(Capsule())
          .buttonStyle(HomeboardAreaButtonStyle())
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 48)
    .padding(.horizontal, 24)
    .sharedSurface(cornerRadius: 22)
  }
}

// MARK: - Listing details and editing

struct SharedListingDetailView: View {
  let listing: ListingPreview
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var noteDraft = ""
  @State private var commentDraft = ""
  @State private var ratingDraft = SharedRatingDimension.defaultValues
  @State private var isWritingVeto = false
  @State private var vetoReason = ""
  @State private var showsMoreAboutListing = false
  @State private var confirmsRemoval = false

  private var liveListing: ListingPreview {
    appModel.board.shortlist.first(where: { $0.id == listing.id }) ?? listing
  }

  var body: some View {
    ScrollView(.vertical, showsIndicators: false) {
      VStack(spacing: 0) {
        ZStack(alignment: .top) {
          SharedListingArtwork(listing: listing, height: 318, cornerRadius: 0)

          LinearGradient(
            colors: [Color.black.opacity(0.52), .clear, Color.black.opacity(0.82)],
            startPoint: .top,
            endPoint: .bottom
          )

          HStack {
            Button {
              dismiss()
            } label: {
              Image(systemName: "xmark")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.white)
                .frame(width: 40, height: 40)
                .background(.ultraThinMaterial)
                .clipShape(Circle())
            }
            .buttonStyle(HomeboardAreaButtonStyle())

            Spacer()

            if let sourceURL = URL(string: listing.sourceURL), !listing.sourceURL.isEmpty {
              ShareLink(item: sourceURL) {
                Image(systemName: "square.and.arrow.up")
                  .font(.subheadline.weight(.bold))
                  .foregroundStyle(Color.white)
                  .frame(width: 40, height: 40)
                  .background(.ultraThinMaterial)
                  .clipShape(Circle())
              }
              .buttonStyle(HomeboardAreaButtonStyle())
            }

            Menu {
              Button(role: .destructive) {
                confirmsRemoval = true
              } label: {
                Label("Move to Recently Deleted", systemImage: "trash")
              }
            } label: {
              Image(systemName: "ellipsis")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.white)
                .frame(width: 40, height: 40)
                .background(.ultraThinMaterial)
                .clipShape(Circle())
            }
            .buttonStyle(HomeboardAreaButtonStyle())
          }
          .padding(.horizontal, 16)
          .padding(.top, 12)

          VStack(alignment: .leading, spacing: 5) {
            Spacer()

            Text(listing.priceLine)
              .font(.system(size: 30, weight: .bold, design: .rounded))
              .foregroundStyle(Color.white)

            Text(listing.title)
              .font(.title3.weight(.semibold))
              .foregroundStyle(Color.white)
              .lineLimit(2)

            Text(SharedListingText.detailLine(listing))
              .font(.subheadline)
              .foregroundStyle(Color.white.opacity(0.74))
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 18)
          .padding(.bottom, 18)
        }
        .frame(height: 318)

        VStack(alignment: .leading, spacing: 22) {
          if let offer = liveListing.activeOffer {
            SharedActiveOfferBanner(offer: offer)
          }

          HStack(spacing: 10) {
            SharedDetailMetric(icon: "tram.fill", value: listing.commuteLine)
            SharedDetailMetric(
              icon: "person.3.fill",
              value: "\(max(appModel.board.members.filter { $0.status != "commute point" }.count, 1)) weighing in"
            )
          }

          if let analysis = liveListing.analysis {
            SharedListingAnalysisSummaryPanel(analysis: analysis)
          }

          SharedListingDecisionPanel(listing: liveListing)

          VStack(alignment: .leading, spacing: 12) {
            SharedSectionTitle(title: "Group reaction", trailing: liveListing.reactions.isEmpty ? "Be first" : "\(liveListing.reactions.count) shared")

            HStack(spacing: 8) {
              ForEach([
                ("love", "heart.fill"),
                ("like", "hand.thumbsup.fill"),
                ("maybe", "questionmark"),
                ("pass", "hand.thumbsdown.fill"),
                ("veto", "xmark")
              ], id: \.0) { vote, icon in
                Button {
                  if vote == "veto" {
                    isWritingVeto = true
                  } else {
                    appModel.reactToListing(id: listing.id, vote: vote)
                  }
                } label: {
                  VStack(spacing: 5) {
                    Image(systemName: icon)
                      .font(.subheadline.weight(.bold))
                    Text(vote.capitalized)
                      .font(.caption2.weight(.semibold))
                  }
                  .foregroundStyle(vote == "veto" ? HomeboardPalette.danger : HomeboardPalette.primaryText)
                  .frame(maxWidth: .infinity)
                  .frame(height: 54)
                  .background(Color.white.opacity(0.055))
                  .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(HomeboardAreaButtonStyle())
              }
            }

            if isWritingVeto {
              VStack(alignment: .leading, spacing: 8) {
                TextField("What hard limit does this break?", text: $vetoReason, axis: .vertical)
                  .lineLimit(2...4)
                  .font(.subheadline)
                  .foregroundStyle(HomeboardPalette.primaryText)
                  .padding(12)
                  .background(HomeboardPalette.danger.opacity(0.08))
                  .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))

                HStack {
                  Button("Cancel") {
                    isWritingVeto = false
                    vetoReason = ""
                  }
                  Spacer()
                  Button("Share veto") {
                    appModel.reactToListing(id: listing.id, vote: "veto", note: vetoReason)
                    isWritingVeto = false
                    vetoReason = ""
                  }
                  .disabled(vetoReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .font(.subheadline.weight(.semibold))
              }
            }

            if !liveListing.reactions.isEmpty {
              Text(liveListing.reactions.map { "\($0.name): \($0.vote)" }.joined(separator: " · "))
                .font(.caption)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
          }

          VStack(alignment: .leading, spacing: 10) {
            SharedSectionTitle(title: "Discussion", trailing: liveListing.comments.isEmpty ? nil : "\(liveListing.comments.count) notes")

            ForEach(liveListing.comments) { comment in
              VStack(alignment: .leading, spacing: 4) {
                Text(comment.name)
                  .font(.caption.weight(.bold))
                  .foregroundStyle(HomeboardPalette.accent)
                Text(comment.content)
                  .font(.subheadline)
                  .foregroundStyle(HomeboardPalette.primaryText)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(12)
              .background(Color.white.opacity(0.045))
              .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            }

            HStack(spacing: 8) {
              TextField("Add context for the group", text: $commentDraft)
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(.horizontal, 13)
                .frame(height: 44)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))

              Button {
                let comment = commentDraft
                commentDraft = ""
                appModel.commentOnListing(id: listing.id, content: comment)
              } label: {
                Image(systemName: "arrow.up")
                  .font(.subheadline.weight(.bold))
                  .foregroundStyle(Color.black)
                  .frame(width: 44, height: 44)
                  .background(HomeboardPalette.accent)
                  .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
              }
              .buttonStyle(HomeboardAreaButtonStyle())
              .disabled(commentDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
          }

          DisclosureGroup(isExpanded: $showsMoreAboutListing) {
            VStack(alignment: .leading, spacing: 18) {
              SharedListingSourcePanel(listing: liveListing)

              if let split = liveListing.rentSplit ?? listing.rentSplit {
                SharedRentSplitPanel(split: split)
              }

              if let analysis = liveListing.analysis {
                SharedListingAnalysisPanel(analysis: analysis)
              }

              SharedListingRatingsPanel(
                ratings: liveListing.ratings,
                currentUserId: appModel.account?.id ?? "",
                currentUserName: appModel.account?.name ?? "You",
                draft: $ratingDraft,
                onSave: {
                  appModel.rateListing(id: listing.id, ratings: ratingDraft)
                }
              )

              SharedListingQuickReviewPanel(listing: liveListing)

              SharedDetailSection(title: "Why it made the board", body: listing.summary)

              VStack(alignment: .leading, spacing: 10) {
                SharedSectionTitle(title: "Shared note", trailing: nil)

                TextField(
                  "What is the group actually thinking?",
                  text: $noteDraft,
                  axis: .vertical
                )
                .lineLimit(2...5)
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.primaryText)
                .padding(14)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))

                Button {
                  appModel.updateManualListingNote(id: listing.id, note: noteDraft)
                } label: {
                  Text("Save for everyone")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(HomeboardPalette.accent)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .buttonStyle(HomeboardAreaButtonStyle())
              }

              if !listing.highlights.isEmpty {
                SharedBulletSection(title: "What works", items: listing.highlights, color: HomeboardPalette.success)
              }

              if !listing.openRisks.isEmpty {
                SharedBulletSection(title: "Things to check", items: listing.openRisks, color: HomeboardPalette.danger)
              }

              Button(role: .destructive) {
                confirmsRemoval = true
              } label: {
                Text("Move to Recently Deleted")
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.danger)
                  .frame(maxWidth: .infinity)
                  .frame(height: 48)
                  .background(Color.white.opacity(0.045))
                  .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
              }
              .buttonStyle(HomeboardAreaButtonStyle())
            }
            .padding(.top, 16)
          } label: {
            HStack(spacing: 10) {
              Image(systemName: "slider.horizontal.3")
                .foregroundStyle(HomeboardPalette.accent)
              VStack(alignment: .leading, spacing: 2) {
                Text("More about this place")
                  .font(.headline)
                  .foregroundStyle(HomeboardPalette.primaryText)
                Text("Rent split, ratings, source, notes, and details")
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.secondaryText)
              }
            }
          }
          .tint(HomeboardPalette.accent)
          .padding(16)
          .sharedSurface(cornerRadius: 20)
        }
        .padding(18)
        .padding(.bottom, 28)
      }
    }
    .scrollBounceBehavior(.basedOnSize, axes: .vertical)
    .background(HomeboardPalette.background.ignoresSafeArea())
    .onAppear {
      noteDraft = listing.groupNote
      if let current = liveListing.ratings.first(where: { $0.userId == appModel.account?.id }) {
        ratingDraft = SharedRatingDimension.normalized(current.values)
      }
    }
    .alert("Move this listing?", isPresented: $confirmsRemoval) {
      Button("Cancel", role: .cancel) {}
      Button("Move", role: .destructive) {
        appModel.removeManualListing(id: listing.id)
        dismiss()
      }
    } message: {
      Text("It will leave the shared board for everyone and can be restored from Settings for seven days.")
    }
  }
}

private struct SharedSafariDestination: Identifiable {
  let id = UUID()
  let url: URL
}

private struct SharedListingSourcePanel: View {
  let listing: ListingPreview
  @Environment(AppModel.self) private var appModel
  @State private var sourceDraft = ""
  @State private var safariDestination: SharedSafariDestination?

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      SharedSectionTitle(
        title: "Listing source",
        trailing: listing.exactSources.isEmpty ? "Required" : "Attached"
      )

      if listing.exactSources.isEmpty {
        Text("Attach the original page for this exact unit before the listing can enter shared discovery.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)

        TextField("Paste the exact listing URL", text: $sourceDraft)
          .textInputAutocapitalization(.never)
          .keyboardType(.URL)
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.primaryText)
          .padding(12)
          .background(Color.white.opacity(0.055))
          .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))

        if !sourceDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          Button {
            appModel.confirmListingSource(
              id: listing.id,
              url: sourceDraft,
              label: "Confirmed listing page"
            )
          } label: {
            Label("Confirm the attached source", systemImage: "checkmark.seal")
              .font(.subheadline.weight(.bold))
              .foregroundStyle(HomeboardPalette.accent)
              .frame(maxWidth: .infinity)
              .frame(height: 44)
              .background(HomeboardPalette.accent.opacity(0.09))
              .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
        }
      } else {
        ForEach(listing.exactSources) { source in
          if let url = URL(string: source.url) {
            VStack(alignment: .leading, spacing: 12) {
              Button {
                appModel.openListingSource(source)
                safariDestination = SharedSafariDestination(url: url)
              } label: {
                HStack(spacing: 10) {
                  Image(systemName: source.trustStatus == "verified" ? "checkmark.seal.fill" : "link.circle.fill")
                    .foregroundStyle(source.trustStatus == "verified" ? HomeboardPalette.success : HomeboardPalette.accent)
                  VStack(alignment: .leading, spacing: 3) {
                    Text(source.label)
                      .font(.subheadline.weight(.semibold))
                      .foregroundStyle(HomeboardPalette.primaryText)
                    Text(sourceStatusLine(source))
                      .font(.caption)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                  }
                  Spacer()
                  Image(systemName: "safari")
                    .foregroundStyle(HomeboardPalette.accent)
                }
                .contentShape(Rectangle())
              }
              .buttonStyle(HomeboardAreaButtonStyle())

              if let warning = source.warning, !warning.isEmpty {
                Text(warning)
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .fixedSize(horizontal: false, vertical: true)
              }

              HStack(spacing: 8) {
                if source.catalogSourceId != nil {
                  Button {
                    appModel.attestListingSource(source)
                  } label: {
                    Label("Exact listing", systemImage: "checkmark")
                  }
                  .buttonStyle(HomeboardAreaButtonStyle())

                  Menu {
                    Button("Wrong unit", role: .destructive) {
                      appModel.reportListingSource(source, reason: "incorrect_unit")
                    }
                    Button("No longer available", role: .destructive) {
                      appModel.reportListingSource(source, reason: "unavailable")
                    }
                    Button("Details conflict", role: .destructive) {
                      appModel.reportListingSource(source, reason: "conflicting_details")
                    }
                    Button("Broken link", role: .destructive) {
                      appModel.reportListingSource(source, reason: "broken_link")
                    }
                  } label: {
                    Label("Report", systemImage: "exclamationmark.bubble")
                  }
                }

                ShareLink(item: url) {
                  Label("Share", systemImage: "square.and.arrow.up")
                }
              }
              .font(.caption.weight(.bold))
              .foregroundStyle(HomeboardPalette.accent)
            }
            .padding(13)
            .background(
              (source.trustStatus == "verified" ? HomeboardPalette.success : HomeboardPalette.accent)
                .opacity(0.07)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          }
        }
      }
    }
    .padding(16)
    .sharedSurface(cornerRadius: 20)
    .onAppear {
      sourceDraft = listing.sourceURL
    }
    .sheet(item: $safariDestination) { destination in
      InAppSafariView(url: destination.url)
        .ignoresSafeArea()
    }
  }

  private func sourceStatusLine(_ source: ListingSourceLink) -> String {
    let status = (source.trustStatus ?? "board_only")
      .replacingOccurrences(of: "_", with: " ")
      .capitalized
    let confirmations = source.confirmationCount ?? 0
    let boards = source.boardCount ?? 0
    return "\(status) · \(confirmations) confirmations · \(boards) boards"
  }
}

private struct SharedListingAnalysisSummaryPanel: View {
  let analysis: GroupListingAnalysis

  private var hardFailureCount: Int {
    analysis.members.reduce(0) { $0 + $1.hardFailures.count }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("Group fit")
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Spacer()
        Text(analysis.rankingLabel.capitalized)
          .font(.caption.weight(.bold))
          .foregroundStyle(hardFailureCount == 0 ? HomeboardPalette.success : HomeboardPalette.danger)
      }

      Text(analysis.verdict)
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)

      HStack(spacing: 8) {
        Label(
          "\(analysis.confidence.capitalized) confidence",
          systemImage: analysis.confidence == "high" ? "checkmark.seal.fill" : "questionmark.diamond"
        )
        if hardFailureCount > 0 {
          Label("\(hardFailureCount) hard limit\(hardFailureCount == 1 ? "" : "s")", systemImage: "exclamationmark.octagon.fill")
        }
      }
      .font(.caption.weight(.semibold))
      .foregroundStyle(hardFailureCount == 0 ? HomeboardPalette.accent : HomeboardPalette.danger)
    }
    .padding(16)
    .sharedSurface(cornerRadius: 20)
  }
}

private struct SharedListingAnalysisPanel: View {
  let analysis: GroupListingAnalysis

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      SharedSectionTitle(
        title: "Calculated group fit",
        trailing: analysis.rankingLabel.capitalized
      )

      Text(analysis.verdict)
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.primaryText)
        .fixedSize(horizontal: false, vertical: true)

      Text(analysis.confidenceReason)
        .font(.caption)
        .foregroundStyle(HomeboardPalette.secondaryText)

      Label(
        "\(analysis.confidence.capitalized) confidence",
        systemImage: analysis.confidence == "high" ? "checkmark.seal.fill" : "questionmark.diamond"
      )
      .font(.caption.weight(.bold))
      .foregroundStyle(analysis.confidence == "high" ? HomeboardPalette.success : Color.orange)

      ForEach(analysis.members) { member in
        VStack(alignment: .leading, spacing: 5) {
          HStack {
            Text(member.name)
              .font(.subheadline.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
            Spacer()
            if !member.hardFailures.isEmpty {
              Text("Hard limit")
                .font(.caption.weight(.bold))
                .foregroundStyle(HomeboardPalette.danger)
            }
          }
          Text(member.explanation)
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
          ForEach(member.hardFailures, id: \.self) { failure in
            Label(failure, systemImage: "exclamationmark.octagon.fill")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.danger)
          }
        }
        .padding(12)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
      }
    }
    .padding(16)
    .sharedSurface(cornerRadius: 20)
  }
}

private struct SharedListingQuickReviewPanel: View {
  let listing: ListingPreview
  @Environment(AppModel.self) private var appModel
  @State private var tourIntent = "maybe"
  @State private var interiorAppeal = 3
  @State private var naturalLight = "unknown"
  @State private var mainConcern = ""
  @State private var sourceViewed = false

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      SharedSectionTitle(title: "Quick gallery review", trailing: "\(listing.reviews.count) complete")

      Picker("Would you tour?", selection: $tourIntent) {
        Text("Tour").tag("yes")
        Text("Maybe").tag("maybe")
        Text("No").tag("no")
      }
      .pickerStyle(.segmented)

      HStack {
        Text("Interior appeal")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Spacer()
        Stepper("\(interiorAppeal)/5", value: $interiorAppeal, in: 1...5)
          .labelsHidden()
        Text("\(interiorAppeal)/5")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
      }

      Picker("Natural light", selection: $naturalLight) {
        Text("Unknown").tag("unknown")
        Text("Poor").tag("poor")
        Text("Fair").tag("fair")
        Text("Good").tag("good")
        Text("Excellent").tag("excellent")
      }
      .pickerStyle(.menu)
      .tint(HomeboardPalette.accent)

      TextField("Main concern (optional)", text: $mainConcern, axis: .vertical)
        .lineLimit(2...4)
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.primaryText)
        .padding(12)
        .background(Color.white.opacity(0.055))
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))

      Toggle("I opened the exact source", isOn: $sourceViewed)
        .font(.subheadline)
        .tint(HomeboardPalette.accent)

      Button("Share quick review") {
        appModel.reviewListing(
          id: listing.id,
          tourIntent: tourIntent,
          interiorAppeal: interiorAppeal,
          naturalLight: naturalLight,
          mainConcern: mainConcern,
          sourceViewed: sourceViewed
        )
      }
      .font(.subheadline.weight(.bold))
      .foregroundStyle(Color.black)
      .frame(maxWidth: .infinity)
      .frame(height: 46)
      .background(HomeboardPalette.accent)
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .buttonStyle(HomeboardAreaButtonStyle())
    }
    .padding(16)
    .sharedSurface(cornerRadius: 20)
  }
}

private struct SharedListingDecisionPanel: View {
  let listing: ListingPreview
  @Environment(AppModel.self) private var appModel
  @State private var decisionType = ListingPollType.requestViewing
  @State private var isSubmitting = false
  @State private var error: String?
  @State private var didSaveVote = false

  private var latestDecision: ListingDecisionSummary? {
    listing.openDecision(for: decisionType)
  }

  private var groupMemberCount: Int {
    appModel.board.members.filter { !$0.userId.isEmpty && $0.status != "commute point" }.count
  }

  private var canUseGroupDecision: Bool { groupMemberCount >= 2 }

  private var decisionStatus: String {
    guard let latestDecision else { return "Start together" }
    return "Resolved \(latestDecision.groupResolvedCount)/\(latestDecision.groupRequiredCount)"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      SharedSectionTitle(title: "Group decision", trailing: decisionStatus)

      Picker("Decision", selection: $decisionType) {
        ForEach(ListingPollType.allCases) { type in Text(type.title).tag(type) }
      }
      .pickerStyle(.segmented)

      Text(decisionType.question)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)

      if let decision = latestDecision {
        SharedPollResults(decision: decision)
      } else {
        Text("Tap your response to start. Everyone else answers from Group.")
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
        if let previous = listing.decisions.first(where: { $0.type == decisionType.rawValue && $0.closedAt != nil }) {
          DisclosureGroup("Previous poll · closed") {
            SharedPollResults(decision: previous)
          }
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .tint(HomeboardPalette.accent)
        }
      }

      if !canUseGroupDecision {
        Label("Invite another member before deciding", systemImage: "person.badge.plus")
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.secondaryText)
      }

      SharedPollChoices(selected: latestDecision?.choice(for: appModel.account?.id)) { choice in
        guard !isSubmitting else { return }
        isSubmitting = true
        error = nil
        didSaveVote = false
        Task {
          didSaveVote = await appModel.voteOnListingDecision(id: listing.id, type: decisionType.rawValue, choice: choice)
          if !didSaveVote { error = appModel.boardError ?? "Couldn’t save your vote. Please try again." }
          isSubmitting = false
        }
      }
      .disabled(!canUseGroupDecision)

      if isSubmitting {
        ProgressView("Sharing your vote…").font(.caption).tint(HomeboardPalette.accent)
      } else if let error {
        Text(error).font(.caption).foregroundStyle(HomeboardPalette.danger)
      } else if didSaveVote {
        Label("Vote saved", systemImage: "checkmark.circle.fill")
          .font(.caption).foregroundStyle(HomeboardPalette.success)
      }

      Menu {
        ForEach([
          ("considering", "Considering"),
          ("shortlisted", "Shortlisted"),
          ("viewing", "Viewing"),
          ("applying", "Applying")
        ], id: \.0) { status, label in
          Button(label) {
            appModel.moveListing(id: listing.id, to: status)
          }
        }
      } label: {
        Label("Stage: \(listing.workflowStatus.replacingOccurrences(of: "_", with: " ").capitalized)", systemImage: "arrow.triangle.branch")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .frame(maxWidth: .infinity)
          .frame(height: 46)
          .background(Color.white.opacity(0.06))
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      }
    }
    .padding(16)
    .sharedSurface(cornerRadius: 20)
    .disabled(isSubmitting)
    .onChange(of: decisionType) { _, _ in
      error = nil
      didSaveVote = false
    }
  }
}

private struct SharedRentSplitPanel: View {
  let split: RentSplitPreview

  private var statusLabel: String {
    switch split.status {
    case "ready": return "Comfortable"
    case "stretch": return "Stretch"
    case "over_budget": return "Over group limit"
    default: return "Needs budgets"
    }
  }

  private var statusColor: Color {
    switch split.status {
    case "ready": return HomeboardPalette.success
    case "stretch": return Color.orange
    case "over_budget": return HomeboardPalette.danger
    default: return HomeboardPalette.accent
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text("Fair rent split")
            .font(.headline)
            .foregroundStyle(HomeboardPalette.primaryText)
          Text("Equal relative burden")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
        }
        Spacer()
        Text(statusLabel)
          .font(.caption.weight(.bold))
          .foregroundStyle(statusColor)
      }

      if split.shares.isEmpty {
        Text(split.summary)
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      } else {
        ForEach(split.shares) { share in
          HStack(spacing: 12) {
            SharedAvatar(name: share.name, size: 34)
            VStack(alignment: .leading, spacing: 2) {
              Text(share.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HomeboardPalette.primaryText)
              Text("\(share.percentOfComfortableBudget)% of their comfortable max")
                .font(.caption)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
            Spacer()
            Text("$\(share.amount.formatted())")
              .font(.headline.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
          }
        }

        Text(split.summary)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(16)
    .sharedSurface(cornerRadius: 20)
  }
}

private struct SharedRatingDimension: Identifiable {
  let id: String
  let label: String

  static let all: [SharedRatingDimension] = [
    .init(id: "value", label: "Value"),
    .init(id: "commute", label: "Commute"),
    .init(id: "space", label: "Space"),
    .init(id: "neighborhood", label: "Area"),
    .init(id: "amenities", label: "Amenities"),
    .init(id: "confidence", label: "Confidence")
  ]

  static let defaultValues = Dictionary(uniqueKeysWithValues: all.map { ($0.id, 3) })

  static func normalized(_ values: [String: Int]) -> [String: Int] {
    Dictionary(uniqueKeysWithValues: all.map { dimension in
      (dimension.id, min(max(values[dimension.id] ?? 3, 1), 5))
    })
  }
}

private struct SharedListingRatingsPanel: View {
  let ratings: [ListingDimensionRating]
  let currentUserId: String
  let currentUserName: String
  @Binding var draft: [String: Int]
  let onSave: () -> Void

  private var chartRatings: [ListingDimensionRating] {
    var values = ratings.filter { $0.userId != currentUserId }
    values.append(
      ListingDimensionRating(
        id: "current-draft",
        memberId: "current-draft",
        userId: currentUserId,
        name: currentUserName.isEmpty ? "You" : currentUserName,
        values: SharedRatingDimension.normalized(draft),
        updatedAt: ""
      )
    )
    return values
  }

  private var overlapRead: String {
    guard chartRatings.count > 1 else { return "Waiting for another member’s read" }
    let spreads = SharedRatingDimension.all.map { dimension -> Int in
      let values = chartRatings.map { $0.values[dimension.id] ?? 3 }
      return (values.max() ?? 3) - (values.min() ?? 3)
    }
    let average = Double(spreads.reduce(0, +)) / Double(max(spreads.count, 1))
    if average <= 0.8 { return "Strong group overlap" }
    if average <= 1.6 { return "Mostly aligned, with a few tradeoffs" }
    return "Different reads. Discuss this."
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      SharedSectionTitle(title: "Roommate impressions", trailing: overlapRead)

      Text("Each shape is one person. The closer the shapes overlap, the more similarly the group sees this home.")
        .font(.caption)
        .foregroundStyle(HomeboardPalette.secondaryText)

      SharedRadarChart(ratings: chartRatings)
        .frame(height: 286)

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 12) {
          ForEach(chartRatings) { rating in
            HStack(spacing: 6) {
              Circle()
                .fill(SharedMemberColors.color(for: rating.userId.isEmpty ? rating.name : rating.userId))
                .frame(width: 8, height: 8)
              Text(rating.userId == currentUserId ? "You" : rating.name)
                .font(.caption2.weight(.bold))
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
          }
        }
      }

      Divider().overlay(Color.white.opacity(0.07))

      ForEach(SharedRatingDimension.all) { dimension in
        HStack(spacing: 10) {
          Text(dimension.label)
            .font(.caption.weight(.semibold))
            .foregroundStyle(HomeboardPalette.primaryText)
            .frame(width: 78, alignment: .leading)

          HStack(spacing: 6) {
            ForEach(1...5, id: \.self) { value in
              Button {
                withAnimation(.snappy(duration: 0.16)) { draft[dimension.id] = value }
              } label: {
                Text("\(value)")
                  .font(.caption2.weight(.bold))
                  .foregroundStyle(draft[dimension.id] == value ? Color.black : HomeboardPalette.secondaryText)
                  .frame(maxWidth: .infinity)
                  .frame(height: 30)
                  .background(draft[dimension.id] == value ? HomeboardPalette.accent : Color.white.opacity(0.055))
                  .clipShape(Circle())
              }
              .buttonStyle(HomeboardAreaButtonStyle())
            }
          }
        }
      }

      Button(action: onSave) {
        Text("Share my read with the group")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(Color.black)
          .frame(maxWidth: .infinity)
          .frame(height: 48)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
      }
      .buttonStyle(HomeboardAreaButtonStyle())
    }
    .padding(16)
    .sharedSurface(cornerRadius: 22)
  }
}

private struct SharedRadarChart: View {
  let ratings: [ListingDimensionRating]

  var body: some View {
    Canvas { context, size in
      let center = CGPoint(x: size.width / 2, y: size.height / 2)
      let radius = min(size.width, size.height) * 0.34
      let count = SharedRatingDimension.all.count

      for level in 1...5 {
        var grid = Path()
        for index in 0..<count {
          let point = radarPoint(index: index, value: Double(level) / 5, center: center, radius: radius, count: count)
          index == 0 ? grid.move(to: point) : grid.addLine(to: point)
        }
        grid.closeSubpath()
        context.stroke(grid, with: .color(Color.white.opacity(level == 5 ? 0.22 : 0.09)), lineWidth: level == 5 ? 1.2 : 0.8)
      }

      for index in 0..<count {
        var axis = Path()
        axis.move(to: center)
        axis.addLine(to: radarPoint(index: index, value: 1, center: center, radius: radius, count: count))
        context.stroke(axis, with: .color(Color.white.opacity(0.11)), lineWidth: 0.8)

        let labelPoint = radarPoint(index: index, value: 1.23, center: center, radius: radius, count: count)
        let label = Text(SharedRatingDimension.all[index].label)
          .font(.caption2.weight(.bold))
          .foregroundStyle(HomeboardPalette.secondaryText)
        context.draw(label, at: labelPoint, anchor: .center)
      }

      for rating in ratings {
        var polygon = Path()
        for (index, dimension) in SharedRatingDimension.all.enumerated() {
          let value = Double(min(max(rating.values[dimension.id] ?? 3, 1), 5)) / 5
          let point = radarPoint(index: index, value: value, center: center, radius: radius, count: count)
          index == 0 ? polygon.move(to: point) : polygon.addLine(to: point)
        }
        polygon.closeSubpath()
        let color = SharedMemberColors.color(for: rating.userId.isEmpty ? rating.name : rating.userId)
        context.fill(polygon, with: .color(color.opacity(0.16)))
        context.stroke(polygon, with: .color(color.opacity(0.95)), lineWidth: 2.2)
      }
    }
    .accessibilityLabel("Overlapping group rating chart")
  }

  private func radarPoint(
    index: Int,
    value: Double,
    center: CGPoint,
    radius: CGFloat,
    count: Int
  ) -> CGPoint {
    let angle = (-Double.pi / 2) + (Double(index) * 2 * Double.pi / Double(count))
    return CGPoint(
      x: center.x + cos(angle) * radius * value,
      y: center.y + sin(angle) * radius * value
    )
  }
}

private struct SharedCapturedListingSummary: View {
  let imported: HomeboardSharedImportStore.PendingImport

  private var sourceLabel: String {
    imported.sourceName ?? URL(string: imported.url)?.host ?? "Safari"
  }

  private var facts: [String] {
    [
      imported.price.map { "$\(Int($0.rounded()).formatted()) / mo" },
      imported.bedrooms.map {
        $0 == 0 ? "Studio" : "\($0.formatted(.number.precision(.fractionLength(0...1)))) bd"
      },
      imported.bathrooms.map {
        "\($0.formatted(.number.precision(.fractionLength(0...1)))) ba"
      },
      imported.squareFeet.map { "\($0.formatted()) sq ft" },
      imported.availableDate.map { "Available \($0)" }
    ]
    .compactMap { $0 }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      if let imageURL = imported.imageURL.flatMap(URL.init(string:)) {
        AsyncImage(url: imageURL) { phase in
          switch phase {
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          default:
            LinearGradient(
              colors: [
                HomeboardPalette.accent.opacity(0.18),
                HomeboardPalette.surfaceDeep
              ],
              startPoint: .topLeading,
              endPoint: .bottomTrailing
            )
          }
        }
        .frame(height: 128)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      }

      HStack(spacing: 9) {
        Image(systemName: "safari.fill")
          .foregroundStyle(HomeboardPalette.accent)

        VStack(alignment: .leading, spacing: 2) {
          Text(sourceLabel)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text(
            imported.extractionConfidence == "high"
              ? "Listing facts captured"
              : "Source captured · confirm missing facts"
          )
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
        }

        Spacer()

        Image(systemName: "checkmark.circle.fill")
          .foregroundStyle(HomeboardPalette.success)
      }

      if !facts.isEmpty {
        LazyVGrid(
          columns: [GridItem(.adaptive(minimum: 84), spacing: 7)],
          alignment: .leading,
          spacing: 7
        ) {
          ForEach(facts, id: \.self) { fact in
            Text(fact)
              .font(.caption.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
              .padding(.horizontal, 9)
              .frame(height: 30)
              .frame(maxWidth: .infinity)
              .background(Color.white.opacity(0.055))
              .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
          }
        }
      }
    }
    .padding(14)
    .sharedSurface(cornerRadius: 19)
  }
}

struct AddSharedListingSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var title = ""
  @State private var unit = ""
  @State private var location = ""
  @State private var price = ""
  @State private var bedrooms = ""
  @State private var bathrooms = ""
  @State private var summary = ""
  @State private var note = ""
  @State private var sourceURL: String
  @State private var photoURL: String
  @State private var isSaving = false
  @State private var isInspectingLink = false
  @State private var showsCaptureGuide = false
  @State private var importPreview: ListingImportPreviewResponse?
  @State private var importError: String?
  private let initialImport: HomeboardSharedImportStore.PendingImport?
  private let importedAmenities: [String]
  private let importedModelInsights: [HomeboardListingInsight]

  init(initialImport: HomeboardSharedImportStore.PendingImport? = nil) {
    self.initialImport = initialImport
    importedAmenities = initialImport?.amenities ?? []
    importedModelInsights = initialImport?.modelInsights ?? []
    let formattedNumber: (Double?) -> String = { value in
      guard let value else { return "" }
      return value.rounded() == value
        ? String(Int(value))
        : String(format: "%.1f", value)
    }

    _title = State(initialValue: initialImport?.address ?? initialImport?.pageTitle ?? "")
    _unit = State(initialValue: initialImport?.unit ?? "")
    _location = State(initialValue: initialImport?.neighborhood ?? initialImport?.city ?? "")
    _price = State(initialValue: initialImport?.price.map { "$\(Int($0.rounded())) / month" } ?? "")
    _bedrooms = State(initialValue: formattedNumber(initialImport?.bedrooms))
    _bathrooms = State(initialValue: formattedNumber(initialImport?.bathrooms))
    _summary = State(initialValue: initialImport?.summary ?? "")
    _sourceURL = State(initialValue: initialImport?.canonicalURL ?? initialImport?.url ?? "")
    _photoURL = State(initialValue: initialImport?.imageURL ?? "")
  }

  private var hasRequiredFacts: Bool {
    !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && numericValue(price) != nil
      && Double(bedrooms) != nil
      && Double(bathrooms) != nil
  }

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          SharedPageHeader(
            eyebrow: initialImport == nil ? "Shared listing" : "Collected from Safari",
            title: initialImport == nil ? "Review this rental" : "Save this rental",
            subtitle: initialImport == nil
              ? "Confirm the core facts Homeboard received from the original listing page."
              : "Homeboard brought over everything the source exposed. Confirm only what is still missing."
          )

          if let initialImport {
            SharedCapturedListingSummary(imported: initialImport)

            Button {
              showsCaptureGuide = true
            } label: {
              HStack(spacing: 9) {
                Image(systemName: "info.circle")
                  .foregroundStyle(HomeboardPalette.accent)
                Text("How Homeboard captured these details")
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.secondaryText)
                Spacer()
                Image(systemName: "chevron.right")
                  .font(.caption2.weight(.bold))
                  .foregroundStyle(HomeboardPalette.tertiaryText)
              }
              .padding(.horizontal, 13)
              .frame(height: 42)
              .sharedSurface(cornerRadius: 14)
            }
            .buttonStyle(HomeboardAreaButtonStyle())
          }

          SharedField(title: "Exact street address", prompt: "219 Kent Ave", text: $title)

          HStack(spacing: 10) {
            SharedField(title: "Unit (optional)", prompt: "3B", text: $unit)
            SharedField(title: "Price", prompt: "$4,800 / month", text: $price)
          }

          SharedField(title: "Neighborhood", prompt: "Williamsburg", text: $location)

          HStack(spacing: 10) {
            SharedField(title: "Beds", prompt: "3", text: $bedrooms, keyboard: .decimalPad)
            SharedField(title: "Baths", prompt: "2", text: $bathrooms, keyboard: .decimalPad)
          }

          if !importedAmenities.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
              Text("Good things found")
                .font(.caption.weight(.bold))
                .foregroundStyle(HomeboardPalette.secondaryText)
              Text(importedAmenities.prefix(8).map { "✓ \($0.capitalized)" }.joined(separator: "   "))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HomeboardPalette.accent)
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(13)
            .sharedSurface(cornerRadius: 14)
          }

          let groundedInsights = importedModelInsights.filter { $0.confidence >= 0.55 }
          if !groundedInsights.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
              Text("Details Homeboard noticed")
                .font(.caption.weight(.bold))
                .foregroundStyle(HomeboardPalette.secondaryText)
              Text(
                groundedInsights.prefix(4).map {
                  $0.sentiment < -0.15 ? "△ \($0.label)" : "✓ \($0.label)"
                }.joined(separator: "   ")
              )
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.accent)
              .fixedSize(horizontal: false, vertical: true)
            }
            .padding(13)
            .sharedSurface(cornerRadius: 14)
          }

          HStack(spacing: 10) {
            Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
              .foregroundStyle(HomeboardPalette.accent)
            VStack(alignment: .leading, spacing: 2) {
              Text("Group commutes are calculated for you")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HomeboardPalette.primaryText)
              Text("Homeboard compares this address against each member's saved destination.")
                .font(.caption)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
          }
          .padding(13)
          .sharedSurface(cornerRadius: 14)
          VStack(alignment: .leading, spacing: 10) {
            SharedField(title: "Listing link (optional)", prompt: "Add one only if a page exists", text: $sourceURL, keyboard: .URL)

            if !sourceURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              Button {
                inspectListingLink()
              } label: {
                HStack(spacing: 8) {
                  if isInspectingLink {
                    ProgressView()
                      .tint(HomeboardPalette.accent)
                  } else {
                    Image(systemName: "link.badge.plus")
                  }
                  Text(isInspectingLink ? "Checking link…" : "Confirm link and prefill")
                  Spacer()
                  Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HomeboardPalette.accent)
                .padding(13)
                .sharedSurface(cornerRadius: 14)
              }
              .buttonStyle(HomeboardAreaButtonStyle())
              .disabled(isInspectingLink)
            }

            if let preview = importPreview {
              VStack(alignment: .leading, spacing: 6) {
                Label("\(preview.provider) link ready", systemImage: "checkmark.circle.fill")
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.success)

                Text(preview.notice)
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.secondaryText)

                if !preview.missingEssentialFields.isEmpty {
                  Text("Confirm before saving: \(preview.missingEssentialFields.joined(separator: ", ")).")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.orange)
                }
              }
              .padding(13)
              .background(HomeboardPalette.success.opacity(0.08))
              .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            if let importError {
              Text(importError)
                .font(.caption)
                .foregroundStyle(HomeboardPalette.danger)
            }
          }
          SharedField(title: "Why it is still alive", prompt: "Good train access and light; layout needs checking.", text: $summary, isMultiline: true)
          SharedField(title: "Shared note", prompt: "What should roommates know before reacting?", text: $note, isMultiline: true)

          Button {
            Task {
              isSaving = true
              let coordinate = await resolveListingCoordinate()
              appModel.addManualListing(
                title: title,
                location: location,
                priceLine: price,
                commuteLine: "See comparison map",
                summary: summary,
                fitLabel: "Group contender",
                sourceURL: sourceURL,
                groupNote: note,
                photoURL: photoURL,
                unit: unit,
                bedrooms: bedrooms,
                bathrooms: bathrooms,
                squareFeet: initialImport?.squareFeet,
                availableDate: initialImport?.availableDate,
                amenities: importedAmenities,
                modelInsights: importedModelInsights,
                address: title,
                latitude: coordinate?.latitude,
                longitude: coordinate?.longitude
              )
              isSaving = false
              if appModel.boardError == nil {
                appModel.resolvePendingSharedListingImport()
                dismiss()
              }
            }
          } label: {
            HStack(spacing: 9) {
              if isSaving { ProgressView().tint(.black) }
              Text(isSaving ? "Saving…" : "Add to the group shortlist")
            }
              .font(.headline.weight(.bold))
              .foregroundStyle(Color.black)
              .frame(maxWidth: .infinity)
              .frame(height: 54)
              .background(HomeboardPalette.accent)
              .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
          .disabled(!hasRequiredFacts || isSaving)
          .opacity(hasRequiredFacts ? 1 : 0.55)

          if !hasRequiredFacts {
            Text("An address, rent, bedroom count, and bathroom count are required before this listing can be saved.")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
          }

          if let error = appModel.boardError {
            Text(error)
              .font(.footnote)
              .foregroundStyle(HomeboardPalette.danger)
          }
        }
        .padding(18)
        .padding(.bottom, 30)
      }
      .background(WorkspaceBackgroundView())
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Cancel") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
        ToolbarItemGroup(placement: .keyboard) {
          Spacer()
          Button("Done") {
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
          }
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .sheet(isPresented: $showsCaptureGuide) {
        SharedSafariSaveGuideSheet()
          .presentationDetents([.large])
          .presentationDragIndicator(.visible)
          .presentationBackground(HomeboardPalette.background)
      }
      .onChange(of: sourceURL) {
        importPreview = nil
        importError = nil
      }
    }
  }

  private func inspectListingLink() {
    let value = sourceURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { return }
    isInspectingLink = true
    importError = nil
    Task {
      do {
        let preview = try await appModel.previewExternalListing(
          url: value,
          address: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : title,
          unit: unit.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : unit,
          price: numericValue(price),
          bedrooms: Double(bedrooms),
          bathrooms: Double(bathrooms)
        )
        sourceURL = preview.normalizedUrl
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let suggestedAddress = preview.suggestedAddress {
          title = suggestedAddress
        }
        if unit.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           let suggestedUnit = preview.suggestedUnit {
          unit = suggestedUnit
        }
        importPreview = preview
      } catch {
        importError = error.localizedDescription
      }
      isInspectingLink = false
    }
  }

  private func numericValue(_ input: String) -> Double? {
    Double(input.filter { $0.isNumber || $0 == "." })
  }

  private func resolveListingCoordinate() async -> CLLocationCoordinate2D? {
    if let latitude = initialImport?.latitude,
       let longitude = initialImport?.longitude,
       (-90...90).contains(latitude),
       (-180...180).contains(longitude) {
      return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    let query = [title, location, appModel.board.city]
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .joined(separator: ", ")
    guard !query.isEmpty else { return nil }
    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = query
    return try? await MKLocalSearch(request: request).start().mapItems.first?.placemark.coordinate
  }
}

private struct SharedComparisonSheet: View {
  let listings: [ListingPreview]
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 12) {
          ForEach(listings) { listing in
            VStack(alignment: .leading, spacing: 13) {
              SharedListingArtwork(listing: listing, height: 150, cornerRadius: 16)

              if let offer = listing.activeOffer {
                SharedActiveOfferBanner(offer: offer, compact: true)
              }

              Text(listing.priceLine)
                .font(.title3.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)

              Text(listing.title)
                .font(.headline)
                .foregroundStyle(HomeboardPalette.primaryText)
                .lineLimit(2)

              Label(listing.commuteLine, systemImage: "tram.fill")
                .font(.caption)
                .foregroundStyle(HomeboardPalette.accent)

              Text(listing.summary)
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

              if !listing.openRisks.isEmpty {
                Text("Watch: \(listing.openRisks[0])")
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.danger)
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
            .frame(width: 250, alignment: .topLeading)
            .padding(14)
            .sharedSurface(cornerRadius: 20)
          }
        }
        .padding(16)
      }
      .background(WorkspaceBackgroundView())
      .navigationTitle("Side by side")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
    }
  }

}

// MARK: - Group components

private struct SharedInviteCard: View {
  let board: MobileBoard
  let copied: Bool
  let onCopy: () -> Void
  let onInvite: () -> Void
  let onAddCommutePoint: () -> Void

  private var inviteURL: URL {
    HomeboardConfig.publicWebBaseURL.appending(path: "invite/\(board.inviteCode)")
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 16) {
        VStack(alignment: .leading, spacing: 7) {
          Text("BRING IN YOUR ROOMMATES")
            .font(.caption2.weight(.bold))
            .tracking(1.5)
            .foregroundStyle(Color.black.opacity(0.56))

          Text(board.inviteCode.isEmpty ? "Invite a roommate" : "Invite link ready")
            .font(.title3.weight(.heavy))
            .foregroundStyle(Color.black)

          Text(inviteDescription)
            .font(.caption)
            .foregroundStyle(Color.black.opacity(0.64))
        }

        Spacer(minLength: 8)

        if board.inviteCode.isEmpty {
          Button(action: onInvite) {
            Image(systemName: "paperplane.fill")
              .font(.headline.weight(.bold))
              .foregroundStyle(Color.black)
              .frame(width: 44, height: 44)
              .background(Color.black.opacity(0.1))
              .clipShape(Circle())
          }
          .buttonStyle(HomeboardAreaButtonStyle())
          .accessibilityLabel("Invite roommate")
        } else {
          VStack(spacing: 9) {
            ShareLink(
              item: inviteURL,
              subject: Text("Join \(board.title) on Homeboard"),
              message: Text("Join our shared rental board on Homeboard.")
            ) {
              Image(systemName: "square.and.arrow.up")
                .font(.headline.weight(.bold))
                .foregroundStyle(Color.black)
                .frame(width: 42, height: 42)
                .background(Color.black.opacity(0.1))
                .clipShape(Circle())
            }

            Button(action: onCopy) {
              Text(copied ? "Copied" : "Copy")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.black.opacity(0.7))
            }
            .buttonStyle(HomeboardAreaButtonStyle())
          }
        }
      }

      HStack(spacing: 16) {
        Button(
          board.inviteCode.isEmpty
            ? "Create invite link"
            : "Replace active link",
          action: onInvite
        )
          .font(.caption.weight(.bold))
          .foregroundStyle(Color.black)
          .buttonStyle(HomeboardAreaButtonStyle())

        Button("Add commute point", action: onAddCommutePoint)
          .font(.caption.weight(.semibold))
          .foregroundStyle(Color.black.opacity(0.62))
          .buttonStyle(HomeboardAreaButtonStyle())
      }
    }
    .padding(18)
    .background(HomeboardPalette.accent)
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
  }

  private var inviteDescription: String {
    guard !board.inviteCode.isEmpty else {
      return "Create a secure link, then send it through Messages or any app."
    }
    return "The first signed-in person to accept this expiring link joins the board."
  }
}

private struct InviteSharedMemberSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 18) {
        SharedPageHeader(
          eyebrow: "Roommate invite",
          title: "Create a shareable link",
          subtitle: "The link works with Sign in with Apple, including Hide My Email. No email matching is required."
        )

        Label(
          "Creating a new link replaces any pending link. It expires in 14 days and can be revoked before it is accepted.",
          systemImage: "link.badge.plus"
        )
        .font(.caption)
        .foregroundStyle(HomeboardPalette.secondaryText)

        if let error = appModel.boardError {
          Text(error)
            .font(.footnote)
            .foregroundStyle(HomeboardPalette.danger)
        }

        Button {
          Task {
            await appModel.createInvite()
            if appModel.boardError == nil {
              dismiss()
            }
          }
        } label: {
          HStack(spacing: 9) {
            if appModel.isBoardLoading {
              ProgressView().tint(.black)
            } else {
              Image(systemName: "paperplane.fill")
            }
            Text(appModel.isBoardLoading ? "Preparing link" : "Create invite link")
          }
          .font(.headline.weight(.bold))
          .foregroundStyle(Color.black)
          .frame(maxWidth: .infinity)
          .frame(height: 54)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .disabled(appModel.isBoardLoading)

        Spacer()
      }
      .padding(18)
      .background(WorkspaceBackgroundView())
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Cancel") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
    }
  }
}

private struct SharedMemberRow: View {
  let member: MemberPreferenceCard

  var body: some View {
    HStack(spacing: 13) {
      SharedAvatar(name: member.name, size: 48)

      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 8) {
          Text(member.name)
            .font(.headline)
            .foregroundStyle(HomeboardPalette.primaryText)

          Text(member.status)
            .font(.caption2.weight(.bold))
            .foregroundStyle(HomeboardPalette.success)
            .lineLimit(1)
        }

        Text(member.budgetLine)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.secondaryText)
          .lineLimit(1)

        Text(member.commuteLine)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.tertiaryText)
          .lineLimit(1)
      }

      Spacer(minLength: 6)

      Image(systemName: "chevron.right")
        .font(.caption.weight(.bold))
        .foregroundStyle(HomeboardPalette.tertiaryText)
    }
    .padding(14)
    .sharedSurface(cornerRadius: 18)
  }
}

private struct SharedCommutePointRow: View {
  let point: MemberPreferenceCard

  var body: some View {
    HStack(spacing: 13) {
      Image(systemName: "mappin.and.ellipse")
        .font(.headline.weight(.bold))
        .foregroundStyle(HomeboardPalette.accent)
        .frame(width: 46, height: 46)
        .background(HomeboardPalette.surfaceDeep.opacity(0.78))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

      VStack(alignment: .leading, spacing: 4) {
        Text(point.name)
          .font(.headline)
          .foregroundStyle(HomeboardPalette.primaryText)
        Text(point.commuteDestination ?? SharedListingText.commuteDestination(point.commuteLine))
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .lineLimit(2)
        Text(point.commuteLine.components(separatedBy: " · ").dropFirst().joined(separator: " · "))
          .font(.caption)
          .foregroundStyle(HomeboardPalette.tertiaryText)
          .lineLimit(1)
      }

      Spacer(minLength: 6)
      Image(systemName: "chevron.right")
        .font(.caption.weight(.bold))
        .foregroundStyle(HomeboardPalette.tertiaryText)
    }
    .padding(14)
    .sharedSurface(cornerRadius: 18)
  }
}

private struct SharedCommutePointExplanation: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      Label("Your main commute belongs to you", systemImage: "person.crop.circle.fill")
        .font(.subheadline.weight(.bold))
        .foregroundStyle(HomeboardPalette.primaryText)

      Text("It comes from your onboarding profile. Add a separate point for a child's school neighborhood, another regular destination, or a roommate stand-in before they join the board.")
        .font(.caption)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)

      Label(
        "Use a nearby neighborhood instead of an exact address whenever that feels safer.",
        systemImage: "hand.raised.fill"
      )
      .font(.caption.weight(.semibold))
      .foregroundStyle(HomeboardPalette.accent)
    }
    .padding(14)
    .sharedSurface(cornerRadius: 18)
  }
}

private struct SharedCommutePointTutorialCard: View {
  let onDismiss: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
          .font(.headline.weight(.bold))
          .foregroundStyle(HomeboardPalette.buttonText)
          .frame(width: 38, height: 38)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

        VStack(alignment: .leading, spacing: 3) {
          Text("How commute points work")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text("Your onboarding commute is yours. Extra points let every home account for school, another frequent stop, or a roommate stand-in too.")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 4)
        Button(action: onDismiss) {
          Image(systemName: "xmark")
            .font(.caption.weight(.bold))
            .foregroundStyle(HomeboardPalette.secondaryText)
            .frame(width: 36, height: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .accessibilityLabel("Dismiss commute point tutorial")
      }

      Text("A neighborhood is enough; exact addresses are optional.")
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.accent)
    }
    .padding(14)
    .sharedSurface(cornerRadius: 19)
  }
}

private struct SharedMemberDetailSheet: View {
  let member: MemberPreferenceCard
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var budgetMin = ""
  @State private var idealBudget = ""
  @State private var budgetMax = ""
  @State private var stretchBudget = ""
  @State private var includesCommute = false
  @State private var commuteAddress = ""
  @State private var commuteAccess = "flexible"
  @State private var minimumCommuteMinutes = 5
  @State private var maximumCommuteMinutes = 45
  @State private var priority = "commute"
  @State private var neighborhoods = ""
  @State private var mustHaves = ""
  @State private var dealbreakers = ""
  @State private var petsRequired = false
  @State private var accessibilityNeeds = ""
  @State private var validationError: String?

  private var canEdit: Bool {
    member.userId.isEmpty || member.userId == appModel.account?.id
  }

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          HStack(spacing: 14) {
            SharedAvatar(name: member.name, size: 62)
            VStack(alignment: .leading, spacing: 4) {
              Text(member.name)
                .font(.title2.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)
              Text(member.status.capitalized)
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.success)
            }
          }

          SharedDetailSection(title: "Budget", body: member.budgetLine)
          SharedDetailSection(title: "Commute", body: member.commuteLine)
          SharedTokenSection(title: "Priorities", tokens: member.priorities)
          SharedTokenSection(title: "Neighborhoods", tokens: member.neighborhoods)
          SharedTokenSection(title: "Dealbreakers", tokens: member.dealbreakers)

          if canEdit {
            VStack(alignment: .leading, spacing: 14) {
              SharedSectionTitle(
                title: "Your affordability",
                trailing: "Private to this board"
              )

              Text("Set the monthly share you can personally carry. Homeboard adds everyone’s limits together and suggests splits that use the same percentage of each person’s comfortable maximum.")
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

              SharedField(title: "Ideal monthly share", prompt: "1500", text: $idealBudget, keyboard: .numberPad)

              HStack(spacing: 10) {
                SharedField(title: "Minimum share", prompt: "1200", text: $budgetMin, keyboard: .numberPad)
                SharedField(title: "Absolute max", prompt: "1750", text: $budgetMax, keyboard: .numberPad)
              }

              SharedField(title: "Rare exception ceiling", prompt: "Optional", text: $stretchBudget, keyboard: .numberPad)

              Toggle(isOn: $includesCommute) {
                VStack(alignment: .leading, spacing: 3) {
                  Text("Include my commute")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HomeboardPalette.primaryText)
                  Text("Off means your commute is not scored or routed.")
                    .font(.caption)
                    .foregroundStyle(HomeboardPalette.secondaryText)
                }
              }
              .tint(HomeboardPalette.accent)

              if includesCommute {
                SharedAddressAutocompleteField(
                  title: "Office neighborhood or address",
                  prompt: "Midtown East, New York, NY",
                  text: $commuteAddress,
                  city: appModel.board.city
                )
                Text("A nearby neighborhood is enough if you would rather not save your exact workplace.")
                  .font(.caption)
                  .foregroundStyle(HomeboardPalette.secondaryText)
                  .fixedSize(horizontal: false, vertical: true)
                Picker("Commute access", selection: $commuteAccess) {
                  Text("Car / ride").tag("car")
                  Text("Transit").tag("transit")
                  Text("Either").tag("flexible")
                }
                .pickerStyle(.segmented)
                HomeboardCommuteRangeControl(
                  minimumMinutes: $minimumCommuteMinutes,
                  maximumMinutes: $maximumCommuteMinutes
                )
              }

              Picker("Top priority", selection: $priority) {
                Text("Commute").tag("commute")
                Text("Neighborhood").tag("neighborhood")
                Text("Space").tag("space")
                Text("Privacy").tag("privacy")
              }
              .pickerStyle(.segmented)

              SharedField(
                title: "Preferred neighborhoods",
                prompt: "Astoria, Sunnyside",
                text: $neighborhoods
              )
              SharedField(
                title: "Must-haves",
                prompt: "laundry, elevator",
                text: $mustHaves
              )
              SharedField(
                title: "Hard limits",
                prompt: "private room, no walk-up",
                text: $dealbreakers
              )

              Toggle("This home must allow my pet", isOn: $petsRequired)
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.primaryText)
                .tint(HomeboardPalette.accent)

              SharedField(
                title: "Accessibility needs",
                prompt: "elevator, step-free entry (optional)",
                text: $accessibilityNeeds
              )

              if let validationError {
                Text(validationError)
                  .font(.caption.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.danger)
              }

              Button("Save my limits") {
                save()
              }
              .font(.headline.weight(.bold))
              .foregroundStyle(Color.black)
              .frame(maxWidth: .infinity)
              .frame(height: 52)
              .background(HomeboardPalette.accent)
              .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
              .buttonStyle(HomeboardAreaButtonStyle())
              .disabled(appModel.isBoardLoading)
              .opacity(appModel.isBoardLoading ? 0.58 : 1)
            }
            .padding(16)
            .sharedSurface(cornerRadius: 20)
          }
        }
        .padding(18)
      }
      .background(WorkspaceBackgroundView())
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .onAppear {
        budgetMin = member.budgetMin.map { String(Int($0)) } ?? ""
        idealBudget = member.idealBudget.map { String(Int($0)) } ?? ""
        budgetMax = member.budgetMax.map { String(Int($0)) } ?? ""
        stretchBudget = member.stretchBudget.map { String(Int($0)) } ?? ""
        commuteAddress = member.commuteDestination ?? ""
        commuteAccess = ["car", "transit", "flexible"].contains(member.commuteAccess ?? "")
          ? member.commuteAccess ?? "flexible"
          : "flexible"
        minimumCommuteMinutes = member.preferredCommuteMinutes ?? 5
        maximumCommuteMinutes = max(
          member.maxCommuteMinutes ?? 45,
          minimumCommuteMinutes + 5
        )
        includesCommute = !(member.commuteDestination ?? "").isEmpty
        priority = member.priorities.first ?? "commute"
        neighborhoods = member.neighborhoods.joined(separator: ", ")
        mustHaves = (member.mustHaves ?? []).joined(separator: ", ")
        dealbreakers = member.dealbreakers.joined(separator: ", ")
        petsRequired = member.petsRequired ?? false
        accessibilityNeeds = (member.accessibilityNeeds ?? []).joined(separator: ", ")
      }
    }
  }

  private func save() {
    let min = Double(budgetMin)
    let ideal = Double(idealBudget)
    let max = Double(budgetMax)
    let stretch = Double(stretchBudget)
    if ideal == nil || max == nil {
      validationError = "Add both your ideal share and absolute maximum."
      return
    }
    if let min, let max, min > max {
      validationError = "Your comfortable minimum cannot be higher than your maximum."
      return
    }
    if let stretch, let max, stretch < max {
      validationError = "Your exception ceiling cannot be lower than your absolute maximum."
      return
    }
    if let ideal, let min, ideal < min {
      validationError = "Your ideal share cannot be lower than your minimum contribution."
      return
    }
    if let ideal, let max, ideal > max {
      validationError = "Your ideal share cannot be higher than your absolute maximum."
      return
    }
    if includesCommute && commuteAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      validationError = "Add an office neighborhood or address to include your commute."
      return
    }
    var updated = member
    updated.budgetMin = min
    updated.idealBudget = ideal
    updated.budgetMax = max
    updated.stretchBudget = stretch
    updated.budgetLine = budgetSummary(ideal: ideal, max: max, stretch: stretch)
    updated.commuteDestination = includesCommute
      ? commuteAddress.trimmingCharacters(in: .whitespacesAndNewlines)
      : nil
    updated.commuteAccess = includesCommute ? commuteAccess : "skip"
    updated.preferredCommuteMinutes = includesCommute ? minimumCommuteMinutes : nil
    updated.maxCommuteMinutes = includesCommute ? maximumCommuteMinutes : nil
    updated.commuteLine = includesCommute
      ? "\(updated.commuteDestination ?? "") · ideal \(minimumCommuteMinutes)–\(maximumCommuteMinutes) min"
      : "Commute not included"
    updated.priorities = [priority]
    updated.neighborhoods = SharedListingText.csv(neighborhoods)
    updated.mustHaves = SharedListingText.csv(mustHaves)
    updated.dealbreakers = SharedListingText.csv(dealbreakers)
    updated.petsRequired = petsRequired
    updated.accessibilityNeeds = SharedListingText.csv(accessibilityNeeds)
    updated.status = "profile complete"
    appModel.updateManualMember(updated)
    if appModel.boardError == nil {
      dismiss()
    }
  }

  private func budgetSummary(ideal: Double?, max: Double?, stretch: Double?) -> String {
    guard let ideal, let max else { return "Budget still open" }
    let comfortable = "ideal $\(Int(ideal).formatted()) · hard max $\(Int(max).formatted())"
    if let stretch, stretch > max {
      return "\(comfortable) · stretch $\(Int(stretch).formatted())"
    }
    return comfortable
  }
}

private struct AddSharedCommutePointSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var label = ""
  @State private var destination = ""
  @State private var access = "flexible"
  @State private var preferredMinutes = 5
  @State private var maximumMinutes = 45

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          SharedPageHeader(
            eyebrow: "Additional route",
            title: "Add a commute point",
            subtitle: "Every listing will be routed and graded against this destination too."
          )

          SharedCommutePointExplanation()

          SharedField(
            title: "Label",
            prompt: "Kid's school or roommate stand-in",
            text: $label
          )
          SharedAddressAutocompleteField(
            title: "Neighborhood or address",
            prompt: "Midtown East, New York, NY",
            text: $destination,
            city: appModel.board.city
          )

          Text("A neighborhood is enough. You never need to enter an exact school, home, or office address if that feels too specific.")
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)

          Picker("Travel mode", selection: $access) {
            Text("Car / ride").tag("car")
            Text("Transit").tag("transit")
            Text("Either").tag("flexible")
          }
          .pickerStyle(.segmented)

          HomeboardCommuteRangeControl(
            minimumMinutes: $preferredMinutes,
            maximumMinutes: $maximumMinutes
          )

          Button {
            appModel.addCommutePoint(
              label: label,
              destination: destination,
              access: access,
              preferredMinutes: preferredMinutes,
              maximumMinutes: maximumMinutes
            )
            if appModel.boardError == nil {
              dismiss()
            }
          } label: {
            Text("Add to every comparison")
              .font(.headline.weight(.bold))
              .foregroundStyle(Color.black)
              .frame(maxWidth: .infinity)
              .frame(height: 54)
              .background(HomeboardPalette.accent)
              .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
          .disabled(
            label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              || destination.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          )
          .opacity(
            label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              || destination.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              ? 0.55
              : 1
          )
        }
        .padding(18)
      }
      .background(WorkspaceBackgroundView())
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Cancel") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
    }
  }
}

private struct SharedCommutePointDetailSheet: View {
  let point: MemberPreferenceCard
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var label = ""
  @State private var destination = ""
  @State private var access = "flexible"
  @State private var preferredMinutes = 5
  @State private var maximumMinutes = 45
  @State private var showsDeleteConfirmation = false

  private var canEdit: Bool {
    guard let userId = appModel.account?.id else { return false }
    return appModel.board.members.first(where: { $0.userId == userId })?.role == "owner"
  }

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          SharedPageHeader(
            eyebrow: "Commute point",
            title: point.name,
            subtitle: "This is a destination used for routing, not another person's profile."
          )

          SharedCommutePointExplanation()
          SharedField(title: "Label", prompt: "Kid's school", text: $label)
            .disabled(!canEdit)
          SharedAddressAutocompleteField(
            title: "Neighborhood or address",
            prompt: "Midtown East, New York, NY",
            text: $destination,
            city: appModel.board.city
          )
          .disabled(!canEdit)

          Picker("Travel mode", selection: $access) {
            Text("Car / ride").tag("car")
            Text("Transit").tag("transit")
            Text("Either").tag("flexible")
          }
          .pickerStyle(.segmented)
          .disabled(!canEdit)

          HomeboardCommuteRangeControl(
            minimumMinutes: $preferredMinutes,
            maximumMinutes: $maximumMinutes
          )
          .disabled(!canEdit)

          if canEdit {
            Button("Save commute point") {
              var updated = point
              updated.name = label.trimmingCharacters(in: .whitespacesAndNewlines)
              updated.commuteDestination = destination.trimmingCharacters(in: .whitespacesAndNewlines)
              updated.commuteAccess = access
              updated.preferredCommuteMinutes = preferredMinutes
              updated.maxCommuteMinutes = maximumMinutes
              updated.commuteLine = "\(updated.commuteDestination ?? "") · ideal \(preferredMinutes)–\(maximumMinutes) min"
              updated.priorities = ["commute"]
              updated.status = "commute point"
              appModel.updateManualMember(updated)
              if appModel.boardError == nil { dismiss() }
            }
            .font(.headline.weight(.bold))
            .foregroundStyle(Color.black)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(HomeboardPalette.accent)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .buttonStyle(HomeboardAreaButtonStyle())
            .disabled(
              label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || destination.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            )

            Button("Remove commute point", role: .destructive) {
              showsDeleteConfirmation = true
            }
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
            .buttonStyle(HomeboardAreaButtonStyle())
          }
        }
        .padding(18)
      }
      .background(WorkspaceBackgroundView())
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") { dismiss() }
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
      .toolbarBackground(HomeboardPalette.background, for: .navigationBar)
      .toolbarBackground(.visible, for: .navigationBar)
      .onAppear {
        label = point.name
        destination = point.commuteDestination ?? SharedListingText.commuteDestination(point.commuteLine)
        access = ["car", "transit", "flexible"].contains(point.commuteAccess ?? "")
          ? point.commuteAccess ?? "flexible"
          : "flexible"
        preferredMinutes = point.preferredCommuteMinutes ?? 5
        maximumMinutes = max(point.maxCommuteMinutes ?? 45, preferredMinutes + 5)
      }
      .confirmationDialog(
        "Remove this commute point?",
        isPresented: $showsDeleteConfirmation,
        titleVisibility: .visible
      ) {
        Button("Remove commute point", role: .destructive) {
          appModel.removeManualMember(id: point.id)
          dismiss()
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("Listings will no longer route or grade against this destination.")
      }
    }
  }
}

private struct SharedJoinBoardSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var inviteCode = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      SharedPageHeader(
        eyebrow: "Invite link",
        title: "Join another search",
        subtitle: "Your account can belong to more than one shared board."
      )

      SharedField(title: "Link or token", prompt: "Paste the invitation", text: $inviteCode)

      Button {
        Task {
          await appModel.joinBoardFromWorkspace(code: inviteCode)
          if appModel.boardError == nil {
            dismiss()
          }
        }
      } label: {
        Text("Join board")
          .font(.headline.weight(.bold))
          .foregroundStyle(Color.black)
          .frame(maxWidth: .infinity)
          .frame(height: 54)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
      }
      .buttonStyle(HomeboardAreaButtonStyle())

      if let error = appModel.boardError {
        Text(error)
          .font(.footnote)
          .foregroundStyle(HomeboardPalette.danger)
      }

      Spacer()
    }
    .padding(18)
    .background(WorkspaceBackgroundView())
  }
}

// MARK: - Reusable visual components

private struct SharedPageHeader<Trailing: View>: View {
  let eyebrow: String
  let title: String
  let subtitle: String
  @ViewBuilder let trailing: () -> Trailing

  init(
    eyebrow: String,
    title: String,
    subtitle: String,
    @ViewBuilder trailing: @escaping () -> Trailing
  ) {
    self.eyebrow = eyebrow
    self.title = title
    self.subtitle = subtitle
    self.trailing = trailing
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 6) {
          if !eyebrow.isEmpty {
            Text(eyebrow.uppercased())
              .font(.caption2.weight(.bold))
              .tracking(1.6)
              .foregroundStyle(HomeboardPalette.accent)
          }

          Text(title)
            .font(.system(size: 29, weight: .bold, design: .serif))
            .foregroundStyle(HomeboardPalette.primaryText)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 4)
        trailing()
      }

      Text(subtitle)
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private extension SharedPageHeader where Trailing == EmptyView {
  init(eyebrow: String, title: String, subtitle: String) {
    self.init(eyebrow: eyebrow, title: title, subtitle: subtitle) {
      EmptyView()
    }
  }
}

private struct SharedSectionTitle: View {
  let title: String
  let trailing: String?

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      Spacer()

      if let trailing, !trailing.isEmpty {
        Text(trailing)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
    }
  }
}

private struct SharedListingShareWorkflowGuide: View {
  let onDismiss: () -> Void
  @State private var practiceComplete = false

  var body: some View {
    ZStack {
      Color.black.opacity(0.78)
        .ignoresSafeArea()

      VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 12) {
          ZStack(alignment: .bottomTrailing) {
            SharedHomeboardAppIcon(size: 42)

            Image(systemName: "puzzlepiece.extension.fill")
              .font(.system(size: 9, weight: .bold))
              .foregroundStyle(HomeboardPalette.buttonText)
              .frame(width: 18, height: 18)
              .background(HomeboardPalette.accent)
              .clipShape(Circle())
              .overlay {
                Circle().stroke(HomeboardPalette.surface, lineWidth: 2)
              }
              .offset(x: 3, y: 3)
          }

          VStack(alignment: .leading, spacing: 3) {
            Text("Save from Safari")
              .font(.title3.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
            Text("Enable once. Open a listing. Tap its pill.")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
          }
        }

        SharedSafariExtensionSetupCard(compact: true)
        SharedSafariActionPreview { practiceComplete = true }

        Button(action: onDismiss) {
          HStack {
            Text("Got it")
            Spacer()
            Image(systemName: "checkmark")
          }
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.buttonText)
          .padding(.horizontal, 16)
          .frame(height: 46)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(HomeboardAreaButtonStyle())
        .disabled(!practiceComplete)
        .opacity(practiceComplete ? 1 : 0.4)
      }
      .padding(16)
      .frame(maxWidth: 390)
      .background(HomeboardPalette.surface.opacity(0.99))
      .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .stroke(HomeboardPalette.borderStrong.opacity(0.55), lineWidth: 1)
      }
      .shadow(color: Color.black.opacity(0.50), radius: 28, x: 0, y: 16)
      .padding(.horizontal, 18)
      .padding(.vertical, 20)
    }
    .transition(.opacity.combined(with: .scale(scale: 0.97)))
    .zIndex(110)
  }
}

enum SafariGesturePracticeStep: Int {
  case swipeLeft, swipeRight, swipeDown, complete

  enum Gesture { case left, right, down }

  var instruction: String {
    switch self {
    case .swipeLeft: "Swipe left to the next unit"
    case .swipeRight: "Swipe right to go back"
    case .swipeDown: "Swipe down to dismiss"
    case .complete: "You're ready. Tap a pill to save."
    }
  }

  mutating func record(_ gesture: Gesture) {
    switch (self, gesture) {
    case (.swipeLeft, .left): self = .swipeRight
    case (.swipeRight, .right): self = .swipeDown
    case (.swipeDown, .down): self = .complete
    default: break
    }
  }
}

private struct SharedSafariActionPreview: View {
  let onPracticeComplete: () -> Void
  @State private var centeredUnit: String? = "4B"
  @State private var practiceStep = SafariGesturePracticeStep.swipeLeft
  @GestureState private var downwardOffset: CGFloat = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack {
        Text("TRY IT")
        Spacer()
        Text(practiceStep == .complete ? "Complete" : "\(practiceStep.rawValue + 1) of 3")
      }
      .font(.system(size: 9, weight: .bold))
      .foregroundStyle(HomeboardPalette.tertiaryText)
      .padding(.horizontal, 4)

      GeometryReader { proxy in
        let pillWidth = min(280, max(224, proxy.size.width - 52))
        let units = [
          (id: "4B", title: "Unit 4B", facts: "3 beds · 1 bath", price: "$4,850"),
          (id: "7A", title: "Unit 7A", facts: "2 beds · 2 baths", price: "$4,400"),
          (id: "edit", title: "Edit details", facts: "Change anything", price: "Edit →")
        ]

        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(spacing: 10) {
            ForEach(units, id: \.id) { item in
              safariListingPill(
                place: item.title,
                facts: item.facts,
                price: item.price,
                isCentered: centeredUnit == item.id
              )
              .frame(width: pillWidth)
              .id(item.id)
            }
          }
          .scrollTargetLayout()
          .padding(.horizontal, max(0, (proxy.size.width - pillWidth) / 2))
        }
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $centeredUnit, anchor: .center)
        .onChange(of: centeredUnit) { oldValue, newValue in
          let ids = units.map(\.id)
          guard let oldValue, let newValue,
                let oldIndex = ids.firstIndex(of: oldValue),
                let newIndex = ids.firstIndex(of: newValue), oldIndex != newIndex else { return }
          practiceStep.record(newIndex > oldIndex ? .left : .right)
        }
        .simultaneousGesture(
          DragGesture(minimumDistance: 16)
            .updating($downwardOffset) { value, state, _ in
              if practiceStep == .swipeDown,
                 value.translation.height > abs(value.translation.width) * 1.15 {
                state = max(0, value.translation.height)
              }
            }
            .onEnded { value in
              if value.translation.height > 56,
                 value.translation.height > abs(value.translation.width) * 1.15 {
                finishDismissPractice()
              }
            }
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Practice unit carousel")
        .accessibilityHint(practiceStep.instruction)
        .accessibilityAction(named: Text("Next unit")) { centeredUnit = "7A" }
        .accessibilityAction(named: Text("Previous unit")) { centeredUnit = "4B" }
        .accessibilityAction(named: Text("Dismiss preview")) { finishDismissPractice() }
        .offset(y: practiceStep == .complete ? 75 : downwardOffset)
        .opacity(practiceStep == .complete ? 0 : 1)
        .allowsHitTesting(practiceStep != .complete)
        .accessibilityHidden(practiceStep == .complete)
        .animation(.easeOut(duration: 0.2), value: practiceStep)
      }
      .frame(height: 60)
      .clipped()

      Label(practiceStep.instruction, systemImage: practiceStep == .complete ? "checkmark.circle.fill" : "hand.draw.fill")
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(10)
    .background(Color.black.opacity(0.10))
    .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
  }

  private func finishDismissPractice() {
    guard practiceStep == .swipeDown else { return }
    practiceStep.record(.down)
    onPracticeComplete()
  }

  private func safariListingPill(
    place: String,
    facts: String,
    price: String,
    isCentered: Bool
  ) -> some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(place)
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.accent)
        Text(facts)
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(HomeboardPalette.secondaryText)
      }

      Text(price)
        .font(.caption.weight(.heavy))
        .foregroundStyle(HomeboardPalette.primaryText)
    }
    .padding(.horizontal, 14)
    .frame(height: 56)
    .background(HomeboardPalette.surfaceDeep.opacity(0.98))
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .stroke(HomeboardPalette.accent.opacity(isCentered ? 0.55 : 0.25), lineWidth: 1)
    }
    .shadow(color: Color.black.opacity(isCentered ? 0.22 : 0.08), radius: 10, x: 0, y: 5)
    .scaleEffect(isCentered ? 1 : 0.94)
    .opacity(isCentered ? 1 : 0.58)
    .animation(.easeOut(duration: 0.16), value: isCentered)
  }
}

private struct SharedHomeboardAppIcon: View {
  let size: CGFloat

  var body: some View {
    Group {
      if let image = Self.installedAppIcon {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      } else {
        ZStack {
          HomeboardPalette.backgroundSecondary
          Image(systemName: "building.2.fill")
            .font(.system(size: size * 0.38, weight: .bold))
            .foregroundStyle(HomeboardPalette.accent)
        }
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
    .accessibilityHidden(true)
  }

  private static let installedAppIcon: UIImage? = {
    let iconDictionaries = [
      Bundle.main.infoDictionary?["CFBundleIcons"],
      Bundle.main.infoDictionary?["CFBundleIcons~ipad"]
    ]

    for case let iconDictionary as [String: Any] in iconDictionaries {
      guard
        let primaryIcon = iconDictionary["CFBundlePrimaryIcon"] as? [String: Any],
        let files = primaryIcon["CFBundleIconFiles"] as? [String]
      else { continue }

      for filename in files.reversed() {
        if let image = UIImage(named: filename) {
          return image
        }
        if let path = Bundle.main.path(forResource: filename, ofType: "png"),
           let image = UIImage(contentsOfFile: path) {
          return image
        }
      }
    }

    return nil
  }()
}

private struct SharedCoachmarkAnchorKey: PreferenceKey {
  static var defaultValue: [String: Anchor<CGRect>] = [:]

  static func reduce(
    value: inout [String: Anchor<CGRect>],
    nextValue: () -> [String: Anchor<CGRect>]
  ) {
    value.merge(nextValue(), uniquingKeysWith: { _, next in next })
  }
}

private struct SharedCoachmarkDimmingShape: Shape {
  let spotlightRect: CGRect
  let cornerRadius: CGFloat

  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.addRect(rect)
    path.addRoundedRect(
      in: spotlightRect,
      cornerSize: CGSize(width: cornerRadius, height: cornerRadius)
    )
    return path
  }
}

private struct SharedCoachmarkOverlay: View {
  let target: Anchor<CGRect>?
  let title: String
  let message: String
  let targetLabel: String
  let onDismiss: () -> Void
  @State private var isPulsing = false

  var body: some View {
    GeometryReader { geometry in
      let fallback = CGRect(
        x: geometry.size.width - 76,
        y: geometry.safeAreaInsets.top + 20,
        width: 48,
        height: 48
      )
      let targetRect = target.map { geometry[$0] } ?? fallback
      let spotlightRect = targetRect.insetBy(dx: -10, dy: -9)
      let spotlightCornerRadius = max(spotlightRect.height * 0.36, 16)
      let cardAtTop = targetRect.midY > geometry.size.height * 0.50
      let labelFitsBelow = spotlightRect.maxY + 44 < geometry.size.height - geometry.safeAreaInsets.bottom
      let labelY = labelFitsBelow ? spotlightRect.maxY + 22 : spotlightRect.minY - 22
      let topOverflow = max(geometry.safeAreaInsets.top, 80)

      ZStack {
        Color.black.opacity(0.76)
          .frame(width: geometry.size.width, height: topOverflow)
          .position(
            x: geometry.size.width / 2,
            y: -(topOverflow / 2) + 0.5
          )

        SharedCoachmarkDimmingShape(
          spotlightRect: spotlightRect,
          cornerRadius: spotlightCornerRadius
        )
        .fill(Color.black.opacity(0.76), style: FillStyle(eoFill: true))

        RoundedRectangle(cornerRadius: spotlightCornerRadius, style: .continuous)
          .stroke(HomeboardPalette.accent, lineWidth: 2)
          .frame(width: spotlightRect.width, height: spotlightRect.height)
          .position(x: spotlightRect.midX, y: spotlightRect.midY)
          .shadow(color: HomeboardPalette.accent.opacity(isPulsing ? 0.68 : 0.38), radius: isPulsing ? 15 : 7)

        Text(targetLabel)
          .font(.caption2.weight(.heavy))
          .tracking(1.2)
          .foregroundStyle(HomeboardPalette.accent)
          .padding(.horizontal, 10)
          .frame(height: 27)
          .background(Color.black.opacity(0.9))
          .clipShape(Capsule())
          .overlay {
            Capsule().stroke(HomeboardPalette.accent.opacity(0.35), lineWidth: 1)
          }
          .position(
            x: min(max(spotlightRect.midX, 85), geometry.size.width - 85),
            y: labelY
          )

        VStack(alignment: .leading, spacing: 14) {
          HStack(alignment: .top, spacing: 12) {
            Image(systemName: "sparkles")
              .font(.headline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.accent)
              .frame(width: 38, height: 38)
              .background(HomeboardPalette.accent.opacity(0.11))
              .clipShape(Circle())

            VStack(alignment: .leading, spacing: 5) {
              Text(title)
                .font(.headline)
                .foregroundStyle(HomeboardPalette.primaryText)

              Text(message)
                .font(.subheadline)
                .foregroundStyle(HomeboardPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Button(action: onDismiss) {
              Image(systemName: "xmark")
                .font(.caption.weight(.bold))
                .foregroundStyle(HomeboardPalette.tertiaryText)
                .frame(width: 30, height: 30)
                .background(Color.white.opacity(0.05))
                .clipShape(Circle())
            }
            .buttonStyle(HomeboardAreaButtonStyle())
          }

          Button(action: onDismiss) {
            HStack {
              Text("Got it")
              Spacer()
              Image(systemName: "arrow.right")
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(Color.black)
            .padding(.horizontal, 16)
            .frame(height: 46)
            .background(HomeboardPalette.accent)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          }
          .buttonStyle(HomeboardAreaButtonStyle())
        }
        .padding(17)
        .frame(width: min(geometry.size.width - 32, 380))
        .background(HomeboardPalette.surface.opacity(0.99))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 22, style: .continuous)
            .stroke(Color.white.opacity(0.09), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.55), radius: 26, x: 0, y: 16)
        .position(
          x: geometry.size.width / 2,
          y: cardAtTop
            ? geometry.safeAreaInsets.top + 150
            : geometry.size.height - geometry.safeAreaInsets.bottom - 175
        )
      }
      .onAppear {
        withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
          isPulsing = true
        }
      }
    }
    .transition(.opacity.combined(with: .scale(scale: 0.985)))
    .zIndex(100)
  }
}

private struct SharedInlineEmpty: View {
  let icon: String
  let title: String
  let message: String

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: icon)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.accent)
        .frame(width: 38, height: 38)
        .background(Color.white.opacity(0.05))
        .clipShape(Circle())

      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text(message)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .sharedSurface(cornerRadius: 17)
  }
}

private struct SharedListingArtwork: View {
  let listing: ListingPreview
  let height: CGFloat
  let cornerRadius: CGFloat

  var body: some View {
    GeometryReader { proxy in
      ZStack {
        artwork

        LinearGradient(
          colors: [Color.black.opacity(0.18), .clear, Color.black.opacity(0.64)],
          startPoint: .top,
          endPoint: .bottom
        )

        VStack {
          HStack {
            if let source = listing.exactSources.first {
              Label(
                source.trustStatus == "verified" ? "Verified source" : "Source attached",
                systemImage: source.trustStatus == "verified" ? "checkmark.seal.fill" : "link"
              )
              .font(.caption2.weight(.bold))
              .foregroundStyle(Color.white.opacity(0.88))
              .padding(.horizontal, 9)
              .frame(height: 27)
              .background(Color.black.opacity(0.32))
              .clipShape(Capsule())
            }
            Spacer()
          }

          Spacer()

          HStack(alignment: .bottom) {
            Spacer()

            Text([
              listing.unit.isEmpty ? nil : "Unit \(listing.unit)",
              listing.bedrooms.isEmpty ? nil : "\(listing.bedrooms) bd",
              listing.bathrooms.isEmpty ? nil : "\(listing.bathrooms) ba"
            ].compactMap { $0 }.joined(separator: " · "))
              .font(.caption.weight(.semibold))
              .foregroundStyle(Color.white.opacity(0.82))
              .lineLimit(1)
          }
        }
        .padding(max(min(proxy.size.width * 0.045, 16), 10))
      }
    }
    .frame(maxWidth: .infinity)
    .frame(height: height)
    .clipped()
    .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
  }

  @ViewBuilder
  private var artwork: some View {
    if let remotePhotoURL {
      AsyncImage(
        url: remotePhotoURL,
        transaction: Transaction(animation: .easeInOut(duration: 0.2))
      ) { phase in
        switch phase {
        case .empty:
          placeholderArtwork
            .overlay {
              ProgressView()
                .tint(Color.white.opacity(0.82))
            }
        case .success(let image):
          image
            .resizable()
            .scaledToFill()
        case .failure:
          placeholderArtwork
        @unknown default:
          placeholderArtwork
        }
      }
      .accessibilityLabel("Listing photo")
    } else {
      placeholderArtwork
    }
  }

  private var remotePhotoURL: URL? {
    let value = listing.photoURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      let url = URL(string: value),
      ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    else { return nil }
    return url
  }

  private var placeholderArtwork: some View {
    ZStack {
      LinearGradient(
        colors: [
          Color(red: 0.055, green: 0.085, blue: 0.12),
          Color(red: 0.08, green: 0.16, blue: 0.21),
          HomeboardPalette.accentStrong.opacity(0.42)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )

      Canvas { context, size in
        let spacing = max(min(size.width / 7, 58), 28)
        var grid = Path()
        stride(from: -spacing, through: size.width + spacing, by: spacing).forEach { x in
          grid.move(to: CGPoint(x: x, y: 0))
          grid.addLine(to: CGPoint(x: x + spacing * 0.7, y: size.height))
        }
        stride(from: CGFloat.zero, through: size.height + spacing, by: spacing).forEach { y in
          grid.move(to: CGPoint(x: 0, y: y))
          grid.addLine(to: CGPoint(x: size.width, y: y - spacing * 0.35))
        }
        context.stroke(
          grid,
          with: .color(Color.white.opacity(0.075)),
          lineWidth: 1
        )

        var route = Path()
        route.move(to: CGPoint(x: -8, y: size.height * 0.74))
        route.addCurve(
          to: CGPoint(x: size.width + 8, y: size.height * 0.28),
          control1: CGPoint(x: size.width * 0.28, y: size.height * 0.82),
          control2: CGPoint(x: size.width * 0.58, y: size.height * 0.16)
        )
        context.stroke(
          route,
          with: .color(HomeboardPalette.accent.opacity(0.62)),
          style: StrokeStyle(lineWidth: 3, lineCap: .round)
        )
      }

      ZStack {
        Circle()
          .fill(HomeboardPalette.accent.opacity(0.18))
          .frame(width: min(height * 0.36, 74), height: min(height * 0.36, 74))
        Image(systemName: "building.2.crop.circle.fill")
          .font(.system(size: min(height * 0.23, 46), weight: .medium))
          .foregroundStyle(HomeboardPalette.accent)
      }
    }
  }
}

private struct SharedStatusDot: View {
  let status: String

  var body: some View {
    HStack(spacing: 5) {
      Circle()
        .fill(color)
        .frame(width: 6, height: 6)
      Text(status.capitalized)
        .font(.caption2.weight(.bold))
        .foregroundStyle(HomeboardPalette.secondaryText)
    }
  }

  private var color: Color {
    switch status.lowercased() {
    case "touring": return HomeboardPalette.accent
    case "applied": return HomeboardPalette.success
    case "passed", "rejected": return HomeboardPalette.danger
    default: return HomeboardPalette.accentStrong
    }
  }
}

private struct SharedAvatarStack: View {
  let members: [MemberPreferenceCard]
  let size: CGFloat

  var body: some View {
    HStack(spacing: -8) {
      ForEach(Array(members.prefix(3))) { member in
        SharedAvatar(name: member.name, size: size)
          .overlay(Circle().stroke(Color.black.opacity(0.82), lineWidth: 2))
      }

      if members.isEmpty {
        SharedAvatar(name: "You", size: size)
      }

      if members.count > 3 {
        Text("+\(members.count - 3)")
          .font(.caption2.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .frame(width: size, height: size)
          .background(HomeboardPalette.surface)
          .clipShape(Circle())
          .overlay(Circle().stroke(Color.black.opacity(0.82), lineWidth: 2))
      }
    }
  }
}

private struct SharedAvatar: View {
  let name: String
  let size: CGFloat

  var body: some View {
    Text(String(name.trimmingCharacters(in: .whitespacesAndNewlines).first ?? "H").uppercased())
      .font(.system(size: size * 0.36, weight: .bold, design: .rounded))
      .foregroundStyle(Color.black)
      .frame(width: size, height: size)
      .background(SharedListingText.avatarColor(name))
      .clipShape(Circle())
  }
}

private struct SharedMiniAvatars: View {
  let count: Int

  var body: some View {
    HStack(spacing: -4) {
      ForEach(0..<min(max(count, 1), 3), id: \.self) { index in
        Circle()
          .fill(index == 0 ? HomeboardPalette.accent : HomeboardPalette.accentStrong.opacity(0.8))
          .frame(width: 15, height: 15)
          .overlay(Circle().stroke(HomeboardPalette.surfaceDeep, lineWidth: 1.5))
      }
    }
  }
}

private struct SharedTimelineItem: Identifiable {
  let id: String
  let author: String
  let content: String
  let isSystem: Bool
}

private struct SharedTimelineRow: View {
  let item: SharedTimelineItem

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      SharedAvatar(name: item.author, size: 40)

      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text(item.author)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Spacer()
          Text(item.isSystem ? "Board update" : "Member note")
            .font(.caption2)
            .foregroundStyle(HomeboardPalette.tertiaryText)
        }

        Text(item.content)
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(14)
    .sharedSurface(cornerRadius: 18)
  }
}

private struct SharedBriefCard: View {
  let board: MobileBoard

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        SharedSectionTitle(title: "Group brief", trailing: board.readiness)
      }

      HStack(spacing: 10) {
        SharedBriefMetric(label: "MOVE", value: board.moveInTimeline)
        SharedBriefMetric(label: "GROUP", value: board.groupSize)
      }

      HStack(spacing: 10) {
        SharedBriefMetric(label: "BUDGET", value: board.budgetLine)
        SharedBriefMetric(label: "COMMUTE", value: board.commuteTargets.first ?? "Still open")
      }
    }
    .padding(16)
    .sharedSurface(cornerRadius: 20)
  }
}

private struct SharedBriefMetric: View {
  let label: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(label)
        .font(.caption2.weight(.bold))
        .tracking(1.2)
        .foregroundStyle(HomeboardPalette.tertiaryText)
      Text(value)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(HomeboardPalette.primaryText)
        .lineLimit(2)
        .minimumScaleFactor(0.82)
    }
    .frame(maxWidth: .infinity, minHeight: 62, alignment: .topLeading)
    .padding(12)
    .background(Color.white.opacity(0.045))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

private struct SharedSettingsRow: View {
  let icon: String
  let title: String
  let subtitle: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 13) {
        Image(systemName: icon)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(HomeboardPalette.accent)
          .frame(width: 36, height: 36)
          .background(Color.white.opacity(0.05))
          .clipShape(Circle())

        VStack(alignment: .leading, spacing: 3) {
          Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.primaryText)
          Text(subtitle)
            .font(.caption)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .lineLimit(1)
        }

        Spacer()

        Image(systemName: "chevron.right")
          .font(.caption.weight(.bold))
          .foregroundStyle(HomeboardPalette.tertiaryText)
      }
      .padding(.horizontal, 14)
      .frame(height: 66)
    }
    .buttonStyle(HomeboardAreaButtonStyle())
  }
}

private struct SharedDivider: View {
  var body: some View {
    Divider()
      .overlay(Color.white.opacity(0.07))
      .padding(.leading, 63)
  }
}

private struct SharedAddressAutocompleteField: View {
  let title: String
  let prompt: String
  @Binding var text: String
  let city: String

  @StateObject private var addressSearch = OnboardingAddressSearch()
  @FocusState private var isFocused: Bool
  @State private var isResolving = false

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.secondaryText)

      HStack(spacing: 8) {
        TextField(prompt, text: $text)
          .textContentType(.fullStreetAddress)
          .textInputAutocapitalization(.words)
          .autocorrectionDisabled()
          .focused($isFocused)
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.primaryText)

        if isResolving {
          ProgressView()
            .controlSize(.small)
            .tint(HomeboardPalette.accent)
        } else {
          Image(systemName: "apple.logo")
            .font(.caption.weight(.semibold))
            .foregroundStyle(HomeboardPalette.tertiaryText)
            .accessibilityHidden(true)
        }
      }
      .padding(.horizontal, 12)
      .frame(height: 46)
      .background(Color.white.opacity(0.06))
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(
            isFocused ? HomeboardPalette.accent.opacity(0.72) : Color.white.opacity(0.07),
            lineWidth: isFocused ? 1.5 : 1
          )
      }

      if isFocused && !addressSearch.suggestions.isEmpty {
        VStack(spacing: 0) {
          ForEach(Array(addressSearch.suggestions.enumerated()), id: \.offset) { index, suggestion in
            Button {
              select(suggestion)
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
              .frame(maxWidth: .infinity, alignment: .leading)
              .frame(height: 54)
              .contentShape(Rectangle())
            }
            .buttonStyle(HomeboardAreaButtonStyle())
            .frame(maxWidth: .infinity)

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

      Label("Suggestions from Apple Maps", systemImage: "map.fill")
        .font(.caption2.weight(.medium))
        .foregroundStyle(HomeboardPalette.tertiaryText)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .onAppear {
      addressSearch.primeRegion(city: city)
    }
    .onChange(of: city) { _, nextCity in
      addressSearch.primeRegion(city: nextCity)
      if isFocused {
        addressSearch.update(query: text, city: nextCity)
      }
    }
    .onChange(of: text) { _, value in
      guard isFocused else { return }
      addressSearch.update(query: value, city: city)
    }
    .onChange(of: isFocused) { _, focused in
      if focused {
        addressSearch.update(query: text, city: city)
      } else {
        addressSearch.clear()
      }
    }
    .onDisappear {
      addressSearch.clear()
    }
  }

  private func select(_ suggestion: MKLocalSearchCompletion) {
    isFocused = false
    isResolving = true
    addressSearch.clear()
    Task {
      text = await addressSearch.resolvedAddress(for: suggestion)
      isResolving = false
    }
  }
}

private struct SharedField: View {
  let title: String
  let prompt: String
  @Binding var text: String
  var keyboard: UIKeyboardType = .default
  var isMultiline = false

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(HomeboardPalette.secondaryText)

      TextField(prompt, text: $text, axis: isMultiline ? .vertical : .horizontal)
        .lineLimit(isMultiline ? 3...6 : 1...1)
        .keyboardType(keyboard)
        .textInputAutocapitalization(keyboard == .emailAddress || keyboard == .URL ? .never : .sentences)
        .autocorrectionDisabled(keyboard == .emailAddress || keyboard == .URL)
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.primaryText)
        .padding(.horizontal, 12)
        .padding(.vertical, isMultiline ? 12 : 0)
        .frame(height: isMultiline ? 86 : 44, alignment: isMultiline ? .topLeading : .center)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Color.white.opacity(0.07), lineWidth: 1)
        }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct SharedDetailMetric: View {
  let icon: String
  let value: String

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: icon)
        .foregroundStyle(HomeboardPalette.accent)
      Text(value)
        .lineLimit(2)
    }
    .font(.caption.weight(.semibold))
    .foregroundStyle(HomeboardPalette.secondaryText)
    .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
    .padding(.horizontal, 12)
    .background(Color.white.opacity(0.05))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

private struct SharedDetailSection: View {
  let title: String
  let detail: String

  init(title: String, body: String) {
    self.title = title
    self.detail = body
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(title)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)
      Text(detail)
        .font(.subheadline)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct SharedBulletSection: View {
  let title: String
  let items: [String]
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      ForEach(items, id: \.self) { item in
        HStack(alignment: .top, spacing: 10) {
          Circle()
            .fill(color)
            .frame(width: 6, height: 6)
            .padding(.top, 6)
          Text(item)
            .font(.subheadline)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }
}

private struct SharedTokenSection: View {
  let title: String
  let tokens: [String]

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      Text(title)
        .font(.headline)
        .foregroundStyle(HomeboardPalette.primaryText)

      if tokens.isEmpty {
        Text("Nothing recorded yet")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.tertiaryText)
      } else {
        SharedFlowLayout(spacing: 7) {
          ForEach(tokens, id: \.self) { token in
            Text(token)
              .font(.caption.weight(.semibold))
              .foregroundStyle(HomeboardPalette.secondaryText)
              .padding(.horizontal, 11)
              .frame(height: 30)
              .background(Color.white.opacity(0.055))
              .clipShape(Capsule())
          }
        }
      }
    }
  }
}

private struct SharedFlowLayout: Layout {
  let spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? 0
    var x: CGFloat = 0
    var y: CGFloat = 0
    var lineHeight: CGFloat = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        x = 0
        y += lineHeight + spacing
        lineHeight = 0
      }
      x += size.width + spacing
      lineHeight = max(lineHeight, size.height)
    }

    return CGSize(width: width, height: y + lineHeight)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var x = bounds.minX
    var y = bounds.minY
    var lineHeight: CGFloat = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if x > bounds.minX, x + size.width > bounds.maxX {
        x = bounds.minX
        y += lineHeight + spacing
        lineHeight = 0
      }
      subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
      x += size.width + spacing
      lineHeight = max(lineHeight, size.height)
    }
  }
}

private struct SharedListingMapItem: Identifiable {
  let listing: ListingPreview
  let coordinate: CLLocationCoordinate2D
  let hasReliableCoordinate: Bool
  var id: String { listing.id }
}

private struct SharedListingMapCluster: Identifiable {
  let id: String
  let coordinate: CLLocationCoordinate2D
  let items: [SharedListingMapItem]

  var singleItem: SharedListingMapItem? {
    items.count == 1 ? items[0] : nil
  }

  var accessibilityLabel: String {
    singleItem?.listing.title ?? "\(items.count) listings"
  }

  static func expanded(
    _ item: SharedListingMapItem,
    coordinate: CLLocationCoordinate2D? = nil
  ) -> SharedListingMapCluster {
    SharedListingMapCluster(
      id: "expanded:\(item.id)",
      coordinate: coordinate ?? item.coordinate,
      items: [item]
    )
  }

  static func spreadExpanded(
    items: [SharedListingMapItem],
    region: MKCoordinateRegion
  ) -> [SharedListingMapCluster] {
    let groups = Dictionary(grouping: items) { item in
      let latitude = Int((item.coordinate.latitude * 100_000).rounded())
      let longitude = Int((item.coordinate.longitude * 100_000).rounded())
      return "\(latitude):\(longitude)"
    }

    return groups.keys.sorted().flatMap { key -> [SharedListingMapCluster] in
      guard let group = groups[key] else { return [] }
      guard group.count > 1 else {
        return group.map { expanded($0) }
      }

      let latitudeRadius = max(region.span.latitudeDelta * 0.035, 0.00018)
      let longitudeRadius = max(region.span.longitudeDelta * 0.035, 0.00018)
      return group.enumerated().map { index, item in
        let angle = (Double(index) / Double(group.count)) * 2 * Double.pi
        let coordinate = CLLocationCoordinate2D(
          latitude: item.coordinate.latitude + cos(angle) * latitudeRadius,
          longitude: item.coordinate.longitude + sin(angle) * longitudeRadius
        )
        return expanded(item, coordinate: coordinate)
      }
    }
  }

  static func build(
    items: [SharedListingMapItem],
    region: MKCoordinateRegion,
    priorityListingIDs: Set<String> = []
  ) -> [SharedListingMapCluster] {
    guard !items.isEmpty else { return [] }

    let priorityItems = items.filter {
      priorityListingIDs.contains($0.listing.id)
    }
    let clusteredItems = items.filter {
      !priorityListingIDs.contains($0.listing.id)
    }

    let latitudeCell = max(region.span.latitudeDelta / 8, 0.00035)
    let longitudeCell = max(region.span.longitudeDelta / 6, 0.00035)
    let minimumLatitude = region.center.latitude - region.span.latitudeDelta / 2
    let minimumLongitude = region.center.longitude - region.span.longitudeDelta / 2

    var buckets: [String: [SharedListingMapItem]] = [:]
    for item in clusteredItems {
      let row = Int(floor((item.coordinate.latitude - minimumLatitude) / latitudeCell))
      let column = Int(floor((item.coordinate.longitude - minimumLongitude) / longitudeCell))
      buckets["\(row):\(column)", default: []].append(item)
    }

    let clusters: [SharedListingMapCluster] = buckets.keys.sorted().compactMap {
      key -> SharedListingMapCluster? in
      guard let bucket = buckets[key], !bucket.isEmpty else { return nil }
      let latitude = bucket.reduce(0) { $0 + $1.coordinate.latitude } / Double(bucket.count)
      let longitude = bucket.reduce(0) { $0 + $1.coordinate.longitude } / Double(bucket.count)
      return SharedListingMapCluster(
        id: key,
        coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
        items: bucket
      )
    }
    return clusters + priorityItems.map { expanded($0) }
  }
}

private struct SharedListingClusterMarker: View {
  let count: Int
  let isSelected: Bool
  let comparisonScore: SharedListingComparisonScore?
  let comparisonColor: Color?

  private var markerColor: Color {
    comparisonColor ?? comparisonScore?.color ?? HomeboardPalette.accentStrong
  }

  var body: some View {
    if comparisonScore != nil {
      HStack(spacing: 3) {
        Image(systemName: "building.2.fill")
          .font(.system(size: 8, weight: .bold))
        Text(count.formatted())
          .font(.caption.weight(.heavy))
          .monospacedDigit()
      }
      .foregroundStyle(Color.black)
      .frame(width: 36, height: 36)
      .background(markerColor)
      .clipShape(Circle())
      .overlay {
        Circle().stroke(
          isSelected ? HomeboardPalette.success : Color.white.opacity(0.45),
          lineWidth: isSelected ? 3 : 1
        )
      }
      .shadow(color: Color.black.opacity(0.24), radius: 4, x: 0, y: 2)
    } else {
      HStack(spacing: 5) {
        Image(systemName: "building.2.fill")
          .font(.caption2.weight(.bold))
        Text(count.formatted())
          .font(.caption.weight(.heavy))
          .monospacedDigit()
      }
      .foregroundStyle(Color.white)
      .padding(.horizontal, 11)
      .frame(height: 34)
      .background(markerColor)
      .clipShape(Capsule())
      .overlay {
        Capsule().stroke(
          isSelected ? HomeboardPalette.success : Color.white.opacity(0.22),
          lineWidth: isSelected ? 3 : 1
        )
      }
      .shadow(color: markerColor.opacity(0.34), radius: 8, x: 0, y: 4)
    }
  }
}

private extension MKCoordinateRegion {
  func contains(_ coordinate: CLLocationCoordinate2D, padding: Double) -> Bool {
    let latitudePadding = span.latitudeDelta * padding
    let longitudePadding = span.longitudeDelta * padding
    let minimumLatitude = center.latitude - span.latitudeDelta / 2 - latitudePadding
    let maximumLatitude = center.latitude + span.latitudeDelta / 2 + latitudePadding
    let minimumLongitude = center.longitude - span.longitudeDelta / 2 - longitudePadding
    let maximumLongitude = center.longitude + span.longitudeDelta / 2 + longitudePadding
    return (minimumLatitude...maximumLatitude).contains(coordinate.latitude)
      && (minimumLongitude...maximumLongitude).contains(coordinate.longitude)
  }
}

private extension ListingPreview {
  var coordinate: CLLocationCoordinate2D? {
    guard let latitude, let longitude,
          (-90...90).contains(latitude),
          (-180...180).contains(longitude)
    else { return nil }
    return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
  }
}

enum SharedListingLocation {
  static func boardCenter(_ city: String) -> CLLocationCoordinate2D {
    coordinate(named: city) ?? CLLocationCoordinate2D(latitude: 40.7128, longitude: -74.0060)
  }

  static func coordinate(for listing: ListingPreview, boardCity: String, index: Int) -> CLLocationCoordinate2D {
    if let exact = coordinate(named: listing.address) ?? coordinate(named: listing.location) {
      return exact
    }

    let center = boardCenter(boardCity)
    let angle = Double(index) * 1.87
    let radius = 0.012 + Double(index % 4) * 0.006
    return CLLocationCoordinate2D(
      latitude: center.latitude + cos(angle) * radius,
      longitude: center.longitude + sin(angle) * radius
    )
  }

  static func geocodingQuery(for listing: ListingPreview) -> String? {
    let verifiedAddress = listing.address.trimmingCharacters(in: .whitespacesAndNewlines)
    if !verifiedAddress.isEmpty {
      return verifiedAddress
    }

    for candidate in [listing.title, listing.location] {
      let cleaned = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
      if looksLikeStreetAddress(cleaned) {
        return cleaned
      }
    }
    return nil
  }

  private static func looksLikeStreetAddress(_ value: String) -> Bool {
    value.range(
      of: #"\b\d{1,6}(?:-\d{1,6})?\s+.+\b(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Parkway|Pkwy|Terrace|Ter|Circle|Cir|Crescent|Cres|Plaza|Highway|Hwy|Broadway)\b"#,
      options: [.regularExpression, .caseInsensitive]
    ) != nil
  }

  private static func coordinate(named rawValue: String) -> CLLocationCoordinate2D? {
    let value = rawValue.lowercased()
    let known: [(String, CLLocationCoordinate2D)] = [
      ("williamsburg", .init(latitude: 40.7081, longitude: -73.9571)),
      ("bushwick", .init(latitude: 40.6944, longitude: -73.9213)),
      ("fort greene", .init(latitude: 40.6921, longitude: -73.9742)),
      ("astoria", .init(latitude: 40.7644, longitude: -73.9235)),
      ("midtown", .init(latitude: 40.7549, longitude: -73.9840)),
      ("chelsea", .init(latitude: 40.7465, longitude: -74.0014)),
      ("lower east side", .init(latitude: 40.7150, longitude: -73.9843)),
      ("jersey city", .init(latitude: 40.7178, longitude: -74.0431)),
      ("hoboken", .init(latitude: 40.7430, longitude: -74.0324)),
      ("brooklyn", .init(latitude: 40.6782, longitude: -73.9442)),
      ("new york", .init(latitude: 40.7128, longitude: -74.0060)),
      ("nyc", .init(latitude: 40.7128, longitude: -74.0060)),
      ("los angeles", .init(latitude: 34.0522, longitude: -118.2437)),
      ("san francisco", .init(latitude: 37.7749, longitude: -122.4194)),
      ("chicago", .init(latitude: 41.8781, longitude: -87.6298)),
      ("boston", .init(latitude: 42.3601, longitude: -71.0589))
    ]
    return known.first(where: { value.contains($0.0) })?.1
  }
}

private enum SharedListingText {
  static func numericValue(_ raw: String) -> Double? {
    let digits = raw.filter { $0.isNumber || $0 == "." }
    return Double(digits)
  }

  static func compactPrice(_ raw: String) -> String {
    let clean = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !clean.isEmpty else { return "Saved" }

    let digits = clean.filter(\.isNumber)
    if let amount = Int(digits), amount >= 1000 {
      if amount >= 10_000 {
        return "$\(amount / 1000)k"
      }
      return "$\(amount.formatted())"
    }

    return String(clean.prefix(9))
  }

  static func detailLine(_ listing: ListingPreview) -> String {
    var parts: [String] = []
    if !listing.bedrooms.isEmpty { parts.append("\(listing.bedrooms) bd") }
    if !listing.bathrooms.isEmpty { parts.append("\(listing.bathrooms) ba") }
    if !listing.location.isEmpty { parts.append(listing.location) }
    return parts.isEmpty ? "Details still being verified" : parts.joined(separator: " · ")
  }

  static func commuteDestination(_ raw: String) -> String {
    let clean = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !clean.isEmpty else { return "" }
    let lower = clean.lowercased()
    if lower.contains("still open")
      || lower.contains("no commute")
      || lower.contains("not included")
      || lower.contains("work remotely")
      || lower == "commute" {
      return ""
    }
    return clean
      .components(separatedBy: "·").first?
      .components(separatedBy: ", max").first?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? clean
  }

  static func csv(_ raw: String) -> [String] {
    raw.split(separator: ",")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }

  static func avatarColor(_ name: String) -> Color {
    let colors = [
      HomeboardPalette.accent,
      HomeboardPalette.success,
      Color(red: 0.98, green: 0.72, blue: 0.42),
      Color(red: 0.79, green: 0.48, blue: 0.36)
    ]
    let scalarSum = name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
    return colors[scalarSum % colors.count]
  }
}

private extension View {
  func sharedCoachmarkTarget(_ id: String) -> some View {
    anchorPreference(key: SharedCoachmarkAnchorKey.self, value: .bounds) { anchor in
      [id: anchor]
    }
  }

  func sharedSurface(cornerRadius: CGFloat) -> some View {
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

// ──────────────────────────────────────────────────
// MARK: - Scout Crowdfunder Banner
// ──────────────────────────────────────────────────

private struct ScoutBannerView: View {
  let subscription: ScoutSubscription?
  @Environment(AppModel.self) private var appModel
  @State private var isScanning = false

  var body: some View {
    let isActive = subscription?.isActive == true
    let isPending = subscription?.isPending == true
    let isExpired = subscription?.isExpired == true

    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .top, spacing: 10) {
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 6) {
            Text(isActive ? "🛰️ Scout Active" : isExpired ? "⏰ Scout Paused" : "🛰️ Homeboard Scout")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(HomeboardPalette.primaryText)
            Spacer()
            if isActive {
              Button {
                guard let boardId = appModel.board.id else { return }
                isScanning = true
                Task {
                  await appModel.triggerScoutScan(boardId: boardId)
                  isScanning = false
                }
              } label: {
                Text(isScanning ? "Scanning…" : "⚡ Check / Scan")
                  .font(.caption2.weight(.bold))
                  .foregroundStyle(HomeboardPalette.accent)
                  .padding(.horizontal, 8)
                  .padding(.vertical, 3)
                  .background(Color.white.opacity(0.08))
                  .clipShape(Capsule())
              }
              .disabled(isScanning)
            } else {
              Text(isPending ? "Pay your share" : isExpired ? "Renew" : "Start split")
                .font(.caption2.weight(.bold))
                .foregroundStyle(HomeboardPalette.secondaryText)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .overlay(
                  Capsule().stroke(HomeboardPalette.border, lineWidth: 1)
                )
            }
          }

          Group {
            if isActive, let sub = subscription {
              Text("Price monitoring + lead radar active · \(sub.daysRemaining)d remaining")
            } else if isExpired {
              Text("Scout paused — renew to resume monitoring for 7 more days.")
            } else if isPending, let sub = subscription {
              let pct = Int(sub.fundedPercent * 100)
              Text("Split in progress · \(pct)% funded — your share: \(sub.perRoommateFormatted)")
            } else {
              Text("Price drops, concession alerts & daily lead radar — split $4.99/week.")
            }
          }
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
        }
      }

      if isPending, let sub = subscription {
        GeometryReader { geo in
          ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(Color.white.opacity(0.08))
              .frame(height: 4)
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(HomeboardPalette.accent)
              .frame(width: geo.size.width * sub.fundedPercent, height: 4)
          }
        }
        .frame(height: 4)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 11)
    .background(
      isActive
        ? Color(red: 99 / 255, green: 179 / 255, blue: 237 / 255).opacity(0.07)
        : Color.white.opacity(0.025)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(
          isActive
            ? Color(red: 99 / 255, green: 179 / 255, blue: 237 / 255).opacity(0.35)
            : Color.white.opacity(0.1),
          lineWidth: 1
        )
    )
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}
