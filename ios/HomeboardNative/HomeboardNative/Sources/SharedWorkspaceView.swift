import MapKit
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
}

private enum SharedCommuteMode: String, CaseIterable, Hashable, Sendable {
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

private enum SharedCommuteRouteLogic {
  static func permits(_ mode: SharedCommuteMode, access: String?) -> Bool {
    guard access != "remote", access != "skip" else { return false }
    if mode == .automobile {
      return access == "car" || access == "flexible"
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
  let score: Double
  let averageMinutes: Int
  let averageEaseMinutes: Int
  let resolvedDestinations: Int
  let requestedDestinations: Int
  let usedWalkingFallback: Bool
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

private struct SharedRouteCoordinate: Sendable {
  let latitude: Double
  let longitude: Double
}

private struct SharedRouteResult: Sendable {
  let minutes: Int
  let stepCount: Int
  let coordinates: [SharedRouteCoordinate]
}

private struct SharedLoadedComparisonRoute: Sendable {
  let targetID: String
  let destination: String
  let memberNames: [String]
  let commuteAccesses: [String]
  let mode: SharedCommuteMode
  let minutes: Int
  let easeMinutes: Int
  let preferredMinutes: Int
  let maximumMinutes: Int
  let coordinates: [SharedRouteCoordinate]
}

private struct SharedComparisonRouteSnapshot: Sendable {
  let targetID: String
  let memberName: String
  let destination: String
  let commuteAccess: String?
  let mode: SharedCommuteMode
  let minutes: Int
  let easeMinutes: Int
  let preferredMinutes: Int
  let maximumMinutes: Int
  let coordinates: [SharedRouteCoordinate]
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
  let minutes: Int
  let easeMinutes: Int
  let preferredMinutes: Int
  let maximumMinutes: Int
  let polyline: MKPolyline

  var tier: SharedCommuteCorridorTier {
    if easeMinutes < preferredMinutes { return .tooClose }
    if easeMinutes <= maximumMinutes {
      return .ideal
    }
    return .tooFar
  }
}

private struct SharedWorkNode: Identifiable {
  let id: String
  let destination: String
  let memberNames: [String]
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
  @State private var resolvedCoordinates: [String: CLLocationCoordinate2D] = [:]
  @State private var preparedMapItems: [SharedListingMapItem] = []
  @State private var filteredMapItems: [SharedListingMapItem] = []
  @State private var renderedClusters: [SharedListingMapCluster] = []
  @State private var visibleRegion: MKCoordinateRegion?
  @State private var expandedClusterListingIDs: Set<String> = []
  @State private var expandedClusterCollapseSpan: Double?
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
  @State private var comparisonCommuteCorridors: [SharedComparisonCommuteCorridor] = []
  @State private var selectedComparisonRouteListingID: String?
  @State private var expandedComparisonListing: ListingPreview?
  @State private var loadingComparisonRouteListingID: String?
  @State private var isLoadingComparisonTransit = false
  @AppStorage("homeboard.map-comparison-priorities") private var storedComparisonPriorities = ""
  @AppStorage("homeboard.map-comparison-city") private var storedComparisonCity = ""
  @AppStorage("homeboard.guide.search.dismissed") private var searchGuideDismissed = false
  @AppStorage("homeboard.guide.first-listing.pending") private var firstListingGuidePending = false

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

  private var mapItems: [SharedListingMapItem] {
    preparedMapItems
  }

  private var visibleMapItems: [SharedListingMapItem] {
    filteredMapItems
  }

  private var currentListing: ListingPreview? {
    if let selectedListing, visibleMapItems.contains(where: { $0.listing.id == selectedListing.id }) {
      return selectedListing
    }
    return renderedClusters.first?.items.first?.listing ?? visibleMapItems.first?.listing
  }

  private var comparisonWorkNodes: [SharedWorkNode] {
    var groups: [String: (
      destination: String,
      names: Set<String>,
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

  private var scoredComparisonRouteCorridors: [SharedComparisonCommuteCorridor] {
    comparisonCommuteCorridors.filter { corridor in
      comparisonScores[corridor.listingID] != nil
        && comparisonCommuteEvidence[corridor.listingID]?.scoredRouteIDs.contains(
          "\(corridor.targetID)|\(corridor.mode.rawValue)"
        ) == true
    }
  }

  private var displayedComparisonRouteCorridors: [SharedComparisonCommuteCorridor] {
    scoredComparisonRouteCorridors.sorted { left, right in
      let leftIsSelected = left.listingID == selectedComparisonRouteListingID
      let rightIsSelected = right.listingID == selectedComparisonRouteListingID
      if leftIsSelected != rightIsSelected {
        return !leftIsSelected && rightIsSelected
      }
      return left.id < right.id
    }
  }

  private var routedComparisonListingCount: Int {
    Set(scoredComparisonRouteCorridors.map(\.listingID)).count
  }

  private func comparisonListingColor(for listingID: String) -> Color {
    let seed = listingID.unicodeScalars.reduce(0) {
      (($0 &* 31) &+ Int($1.value)) & 0x7fffffff
    }
    let position = Double((seed &* 137) % 10_000) / 9_999
    let hue: Double
    if position < 0.40 {
      hue = 0.01 + (position / 0.40) * 0.15 // red through ochre
    } else if position < 0.84 {
      hue = 0.20 + ((position - 0.40) / 0.44) * 0.25 // olive through eucalyptus
    } else {
      hue = 0.92 + ((position - 0.84) / 0.16) * 0.07 // rose through red
    }
    let saturation = 0.54 + Double((seed / 17) % 17) / 100
    let brightness = 0.82 + Double((seed / 29) % 13) / 100
    return Color(hue: hue, saturation: saturation, brightness: brightness)
  }

  private var comparisonIsReady: Bool {
    comparisonScores.count >= 2
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
    let bounds = selectedBounds?.coordinates.map {
      String(format: "%.4f,%.4f", $0.latitude, $0.longitude)
    }.joined(separator: ";") ?? "all"
    return "\(center)|\(filters.maxPrice)|\(filters.minimumBedrooms)|\(filters.locationQuery)|\(bounds)|\(listings)"
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

                ForEach(displayedComparisonRouteCorridors) { corridor in
                  MapPolyline(corridor.polyline)
                    .stroke(
                      comparisonListingColor(for: corridor.listingID).opacity(
                        corridor.listingID == selectedComparisonRouteListingID
                          ? 0.96
                          : selectedComparisonRouteListingID == nil ? 0.76 : 0.46
                      ),
                      style: StrokeStyle(
                        lineWidth: corridor.listingID == selectedComparisonRouteListingID
                          ? 4.8
                          : 2.75,
                        lineCap: .round,
                        lineJoin: .round
                      )
                    )
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
                      style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round)
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
                      SharedPriceMarker(
                        text: isComparisonActive
                          ? comparisonScores[item.listing.id].map { "\($0.total)" } ?? "—"
                          : SharedListingText.compactPrice(item.listing.priceLine),
                        isSelected: selectedListing?.id == item.listing.id,
                        comparisonScore: isComparisonActive ? comparisonScores[item.listing.id] : nil,
                        comparisonColor: isComparisonActive
                          ? comparisonListingColor(for: item.listing.id)
                          : nil
                      )
                    }
                    .buttonStyle(.plain)
                  } else {
                    Button {
                      zoomIntoCluster(cluster)
                    } label: {
                      SharedListingClusterMarker(
                        count: cluster.items.count,
                        comparisonScore: isComparisonActive ? comparisonScore(for: cluster) : nil,
                        comparisonColor: isComparisonActive
                          ? comparisonScore(for: cluster).map {
                              comparisonRegionTier(for: $0.total).color
                            }
                          : nil
                      )
                    }
                    .buttonStyle(.plain)
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
              if let collapseSpan = expandedClusterCollapseSpan,
                 context.region.span.latitudeDelta >= collapseSpan {
                expandedClusterListingIDs = []
                expandedClusterCollapseSpan = nil
              }
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
          listings: visibleMapItems.map(\.listing),
          selectedListingID: selectedListing?.id,
          isLoading: appModel.isListingInventoryLoading,
          hasMore: appModel.listingInventoryHasMore,
          onOpen: {
            selectedListing = $0
            detailListing = $0
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
          resultCount: visibleMapItems.count,
          filterCount: filters.activeCount,
          hasArea: selectedBounds != nil,
          drawingArea: isDrawingArea,
          comparisonActive: isComparisonActive,
          comparisonReady: comparisonIsReady,
          onFilter: { showsFilters = true },
          onCompare: {
            presentation = .map
            if comparisonCityQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              comparisonCityQuery = appModel.board.city
            }
            showsComparisonSettings = true
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

        if !expandedClusterListingIDs.isEmpty {
          SharedExpandedClusterBar(
            count: expandedClusterListingIDs.count,
            onCollapse: collapseExpandedCluster
          )
          .transition(.move(edge: .top).combined(with: .opacity))
        }

        if appModel.isListingInventoryLoading {
          HomeboardSkeletonBlock(width: 92, height: 9, cornerRadius: 5)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
      }
      .padding(.horizontal, 14)
      .padding(.top, 8)
      .padding(.bottom, 8)
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if presentation == .map {
        VStack(spacing: 8) {
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
                listingCount: comparisonScores.count,
                routedListingCount: routedComparisonListingCount,
                isLoadingCommutes: isLoadingComparisonTransit
              )
            }
          } else if let listing = currentListing {
            if commuteRoutes.isEmpty && !isLoadingRoutes {
              Button {
                if hasCommuteDestinations {
                  selectedListing = listing
                  Task {
                    await resolveCommuteRoutes(for: listing)
                  }
                } else {
                  showsSettings = true
                }
              } label: {
                Label(
                  hasCommuteDestinations ? "Compare group commutes" : "Add commute destinations",
                  systemImage: hasCommuteDestinations ? "arrow.triangle.branch" : "mappin.and.ellipse"
                )
                .font(.caption.weight(.bold))
                .foregroundStyle(Color.black)
                .padding(.horizontal, 13)
                .frame(height: 36)
                .background(HomeboardPalette.accent)
                .clipShape(Capsule())
              }
              .buttonStyle(.plain)
              .frame(maxWidth: .infinity, alignment: .trailing)
            }

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
      if !isComparisonActive {
        comparisonCommuteEvidence = [:]
        comparisonCommuteCorridors = []
      }
      rebuildMapPresentation()
      focusMap()
    }
    .task(
      id: "\(isComparisonActive)|\(storedComparisonCity)|\(appModel.board.members.map { "\($0.id):\($0.commuteLine):\($0.commuteAccess ?? "unknown"):\($0.preferredCommuteMinutes ?? 0):\($0.maxCommuteMinutes ?? 0)" }.joined(separator: "|"))|\(comparisonRoutingSignature)"
    ) {
      guard isComparisonActive else { return }
      await resolveComparisonCommuteDestinations()
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
      if !isComparisonActive {
        Task {
          if presentation == .map {
            await loadMapInventory(in: visibleRegion ?? defaultMapRegion())
          } else {
            await loadCardInventory()
          }
        }
      } else if presentation == .list {
        isComparisonActive = false
      }
    }
    .sheet(isPresented: $showsAddListing, onDismiss: {
      appModel.pendingSharedListingImport = nil
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
      if firstListingGuidePending {
        SharedListingShareWorkflowGuide(
          onDismiss: {
            firstListingGuidePending = false
            searchGuideDismissed = true
          }
        )
      } else if !searchGuideDismissed {
        SharedCoachmarkOverlay(
          target: anchors["search-controls"],
          title: "Search the way you think",
          message: "Switch between the map and cards, apply exact filters, draw an area, or rank what matters to turn available listings into a color-coded comparison map.",
          targetLabel: "MAP · CARDS · FILTERS · COMPARE",
          onDismiss: { searchGuideDismissed = true }
        )
      }
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
      return (!isComparisonActive || item.hasReliableCoordinate)
        && (!isComparisonActive || comparisonMetroRegion.contains(item.coordinate, padding: 0))
        && filters.includes(item.listing)
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
    let expandedItems = filtered.filter {
      expandedClusterListingIDs.contains($0.id)
    }
    let regionalItems = visibleItems.filter {
      !expandedClusterListingIDs.contains($0.id)
    }

    renderedClusters = SharedListingMapCluster.build(
      items: regionalItems,
      region: region
    ) + SharedListingMapCluster.spreadExpanded(
      items: expandedItems,
      region: region
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
         commuteEvidence == nil {
        continue
      }
      let commuteValue = comparisonWorkNodes.isEmpty
        ? ratingScore(listing, dimension: "commute")
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
      let criterionValues: [SharedComparisonCriterion: Double?] = [
        .price: blendedComparisonScore(
          analysisScore(listing, dimension: "price"),
          ratingScore(listing, dimension: "value"),
          relativePrice
        ),
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
      var details: [SharedComparisonCriterion: String] = [
        .price: "\(listing.priceLine) compared with the other visible listings and your budget",
        .space: listing.squareFeet.map { "\($0.formatted()) sq ft plus bedroom, bathroom, and layout evidence" }
          ?? "Bedroom, bathroom, layout, and roommate space evidence",
        .neighborhood: "Saved neighborhood preferences, group ratings, and grounded listing insights",
        .features: "Amenities, finishes, light, layout, and risk evidence found in the listing"
      ]
      if let commuteEvidence {
        let walkingNote = commuteEvidence.usedWalkingFallback ? " · walking was the easiest usable route" : ""
        let easeNote = commuteEvidence.averageEaseMinutes == commuteEvidence.averageMinutes
          ? ""
          : " · \(commuteEvidence.averageEaseMinutes) min ease-adjusted"
        details[.commute] = "Live best usable routes · \(commuteEvidence.averageMinutes) min actual average\(easeNote) · \(commuteEvidence.resolvedDestinations)/\(commuteEvidence.requestedDestinations) work destinations\(walkingNote)"
      } else {
        details[.commute] = comparisonWorkNodes.isEmpty
          ? "Group commute rating; add a work destination for live route scoring"
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
      let region = comparisonMetroRegion
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
      comparisonCommuteCorridors = []
      isLoadingComparisonTransit = false
      return
    }

    let candidates = preparedMapItems.filter { item in
      item.hasReliableCoordinate
        && comparisonMetroRegion.contains(item.coordinate, padding: 0)
        && filters.includes(item.listing)
        && (selectedBounds?.contains(item.coordinate) ?? true)
    }
    guard !candidates.isEmpty else {
      comparisonCommuteEvidence = [:]
      comparisonCommuteCorridors = []
      isLoadingComparisonTransit = false
      return
    }

    isLoadingComparisonTransit = true
    defer { isLoadingComparisonTransit = false }
    comparisonCommuteEvidence = [:]
    comparisonCommuteCorridors = []
    selectedComparisonRouteListingID = nil
    loadingComparisonRouteListingID = nil
    rebuildMapPresentation()
    var next: [String: SharedComparisonCommuteEvidence] = [:]
    let batchSize = 3

    for start in stride(from: 0, to: candidates.count, by: batchSize) {
      guard !Task.isCancelled else { return }
      let end = min(start + batchSize, candidates.count)
      let batch = Array(candidates[start..<end])
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
        }
      }
      comparisonCommuteEvidence = next
      rebuildComparisonCommuteCorridors(from: next)
      rebuildMapPresentation()
    }
  }

  private func loadComparisonRouteOptions(
    for item: SharedListingMapItem
  ) async {
    let workNodes = comparisonWorkNodes
    guard isComparisonActive, item.hasReliableCoordinate, !workNodes.isEmpty else {
      return
    }

    let listingID = item.listing.id
    let existingRouteIDs = Set(
      comparisonCommuteCorridors
        .filter { $0.listingID == listingID }
        .map { "\($0.targetID)|\($0.mode.rawValue)" }
    )
    let pendingCount = workNodes.reduce(0) { count, workNode in
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

    let originLatitude = item.coordinate.latitude
    let originLongitude = item.coordinate.longitude
    let loaded = await withTaskGroup(
      of: SharedLoadedComparisonRoute?.self,
      returning: [SharedLoadedComparisonRoute].self
    ) { group in
      for workNode in workNodes {
        for mode in SharedCommuteMode.allCases
          where !existingRouteIDs.contains("\(workNode.id)|\(mode.rawValue)") {
          let targetID = workNode.id
          let destination = workNode.destination
          let memberNames = workNode.memberNames
          let commuteAccesses = workNode.commuteAccesses
          let destinationLatitude = workNode.coordinate.latitude
          let destinationLongitude = workNode.coordinate.longitude
          let preferredMinutes = workNode.preferredMinutes
          let maximumMinutes = workNode.maximumMinutes
          group.addTask {
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
              to: CLLocationCoordinate2D(
                latitude: destinationLatitude,
                longitude: destinationLongitude
              ),
              transportType: transportType
            ) else { return nil }
            let accessValues: [String?] = commuteAccesses.isEmpty
              ? [nil]
              : commuteAccesses.map(Optional.some)
            let easeMinutes = accessValues.map {
              SharedCommuteRouteLogic.easeAdjustedMinutes(
                mode: mode,
                minutes: route.minutes,
                stepCount: route.stepCount,
                access: $0
              )
            }.max() ?? route.minutes
            return SharedLoadedComparisonRoute(
              targetID: targetID,
              destination: destination,
              memberNames: memberNames,
              commuteAccesses: commuteAccesses,
              mode: mode,
              minutes: route.minutes,
              easeMinutes: easeMinutes,
              preferredMinutes: preferredMinutes,
              maximumMinutes: maximumMinutes,
              coordinates: route.coordinates
            )
          }
        }
      }

      var values: [SharedLoadedComparisonRoute] = []
      for await route in group {
        if let route {
          values.append(route)
        }
      }
      return values
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
          minutes: route.minutes,
          easeMinutes: route.easeMinutes,
          preferredMinutes: route.preferredMinutes,
          maximumMinutes: route.maximumMinutes,
          polyline: MKPolyline(
            coordinates: routeCoordinates,
            count: routeCoordinates.count
          )
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
    var usedWalkingFallback = false
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
      async let transitRouteRequest: SharedRouteResult? = routeResult(
        from: origin,
        to: destination,
        transportType: .transit
      )
      async let roadRouteRequest: SharedRouteResult? = routeResult(
        from: origin,
        to: destination,
        transportType: .automobile
      )
      let directDistance = CLLocation(
        latitude: origin.latitude,
        longitude: origin.longitude
      ).distance(
        from: CLLocation(
          latitude: destination.latitude,
          longitude: destination.longitude
        )
      )
      async let walkingRouteRequest: SharedRouteResult? = directDistance <= 3_200
        ? routeResult(
            from: origin,
            to: destination,
            transportType: .walking
          )
        : nil
      let transitRoute = await transitRouteRequest
      let roadRoute = await roadRouteRequest
      let walkingCandidate = await walkingRouteRequest
      let walkingRoute = walkingCandidate.flatMap { $0.minutes <= 30 ? $0 : nil }

      let visibleRoutes: [(SharedCommuteMode, SharedRouteResult)] = [
        transitRoute.map { (.transit, $0) },
        roadRoute.map { (.automobile, $0) },
        walkingRoute.map { (.walking, $0) }
      ].compactMap { $0 }
      routeSnapshots.append(
        contentsOf: visibleRoutes.map { mode, route in
          SharedComparisonRouteSnapshot(
            targetID: target.id,
            memberName: target.memberName,
            destination: target.destination,
            commuteAccess: target.commuteAccess,
            mode: mode,
            minutes: route.minutes,
            easeMinutes: SharedCommuteRouteLogic.easeAdjustedMinutes(
              mode: mode,
              minutes: route.minutes,
              stepCount: route.stepCount,
              access: target.commuteAccess
            ),
            preferredMinutes: preferred,
            maximumMinutes: maximum,
            coordinates: route.coordinates
          )
        }
      )

      let eligibleRoutes = visibleRoutes.filter {
        SharedCommuteRouteLogic.permits($0.0, access: target.commuteAccess)
      }
      guard let primaryRoute = eligibleRoutes.min(by: {
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
      }) else {
        continue
      }
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
      memberScores.append(
        SharedComparisonMath.commuteScore(
          minutes: easeMinutes,
          preferredMinutes: target.preferredMinutes,
          maximumMinutes: target.maximumMinutes
        )
      )
    }

    guard !durations.isEmpty,
          let worstScore = memberScores.min()
    else { return nil }
    let averageScore = memberScores.reduce(0, +) / Double(memberScores.count)
    return SharedComparisonCommuteEvidence(
      score: averageScore * 0.72 + worstScore * 0.28,
      averageMinutes: Int(
        (Double(durations.reduce(0, +)) / Double(durations.count)).rounded()
      ),
      averageEaseMinutes: Int(
        (Double(easeDurations.reduce(0, +)) / Double(easeDurations.count)).rounded()
      ),
      resolvedDestinations: durations.count,
      requestedDestinations: targets.count,
      usedWalkingFallback: usedWalkingFallback,
      scoredRouteIDs: scoredRouteIDs,
      routeSnapshots: routeSnapshots
    )
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
        minutes: minutes,
        easeMinutes: easeMinutes,
        preferredMinutes: preferred,
        maximumMinutes: max(maximum, preferred + 5),
        polyline: MKPolyline(
          coordinates: routeCoordinates,
          count: routeCoordinates.count
        )
      )
    }

  }

  private static func routeResult(
    from origin: CLLocationCoordinate2D,
    to destination: CLLocationCoordinate2D,
    transportType: MKDirectionsTransportType
  ) async -> SharedRouteResult? {
    let request = MKDirections.Request()
    request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin))
    request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination))
    request.transportType = transportType
    request.requestsAlternateRoutes = false
    if transportType == .transit {
      request.departureDate = Date()
    }
    guard let response = try? await MKDirections(request: request).calculate(),
          let route = response.routes.min(by: {
            $0.expectedTravelTime < $1.expectedTravelTime
          })
    else { return nil }
    let points = route.polyline.points()
    let coordinates = (0..<route.polyline.pointCount).map {
      SharedRouteCoordinate(
        latitude: points[$0].coordinate.latitude,
        longitude: points[$0].coordinate.longitude
      )
    }
    guard coordinates.count >= 2 else { return nil }
    return SharedRouteResult(
      minutes: max(1, Int((route.expectedTravelTime / 60).rounded())),
      stepCount: route.steps.count,
      coordinates: coordinates
    )
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

  private func zoomIntoCluster(_ cluster: SharedListingMapCluster) {
    let region = visibleRegion ?? defaultMapRegion()
    expandedClusterListingIDs = Set(cluster.items.map(\.id))
    expandedClusterCollapseSpan = region.span.latitudeDelta * 0.82
    selectedListing = nil
    commuteRoutes = []
    rebuildMapPresentation()

    let latitudes = cluster.items.map(\.coordinate.latitude)
    let longitudes = cluster.items.map(\.coordinate.longitude)
    let latitudeSpread = (latitudes.max() ?? cluster.coordinate.latitude)
      - (latitudes.min() ?? cluster.coordinate.latitude)
    let longitudeSpread = (longitudes.max() ?? cluster.coordinate.longitude)
      - (longitudes.min() ?? cluster.coordinate.longitude)
    let nextLatitudeDelta = max(min(region.span.latitudeDelta * 0.46, latitudeSpread * 1.8 + 0.004), 0.004)
    let nextLongitudeDelta = max(min(region.span.longitudeDelta * 0.46, longitudeSpread * 1.8 + 0.004), 0.004)

    withAnimation(.easeInOut(duration: 0.22)) {
      cameraPosition = .region(
        MKCoordinateRegion(
          center: cluster.coordinate,
          span: MKCoordinateSpan(
            latitudeDelta: nextLatitudeDelta,
            longitudeDelta: nextLongitudeDelta
          )
        )
      )
    }
  }

  private func collapseExpandedCluster() {
    withAnimation(.easeInOut(duration: 0.2)) {
      expandedClusterListingIDs = []
      expandedClusterCollapseSpan = nil
      rebuildMapPresentation()
    }
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
      let region = comparisonMetroRegion
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
    let shortlistedIDs = Set(appModel.board.shortlist.map(\.id))
    let candidates = searchListings
      .filter {
        $0.coordinate == nil
          && next[$0.id] == nil
          && shortlistedIDs.contains($0.id)
      }
      .prefix(40)

    for listing in candidates {
      guard let query = SharedListingLocation.geocodingQuery(for: listing) else {
        continue
      }
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query
      if let response = try? await MKLocalSearch(request: request).start(),
         let coordinate = response.mapItems.first?.placemark.coordinate {
        next[listing.id] = coordinate
      }
    }
    resolvedCoordinates = next
    prepareMapItems()
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
    let request = MKDirections.Request()
    request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin))
    request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination))
    request.transportType = transportType
    request.requestsAlternateRoutes = true
    if transportType == .transit {
      request.departureDate = Date()
    }
    return try? await MKDirections(request: request).calculate().routes.min {
      $0.expectedTravelTime < $1.expectedTravelTime
    }
  }

  private func resolveCoordinate(for destination: String) async -> CLLocationCoordinate2D? {
    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = [destination, appModel.board.city]
      .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
      .joined(separator: ", ")
    guard let response = try? await MKLocalSearch(request: request).start() else { return nil }
    return response.mapItems.first?.placemark.coordinate
  }
}

struct SharedShortlistView: View {
  @Environment(AppModel.self) private var appModel
  @State private var filter = SharedListingFilter.active
  @State private var selectedListing: ListingPreview?
  @State private var showsListingDiscovery = false
  @State private var comparisonSelection: Set<String> = []
  @State private var showsComparison = false
  @State private var showsSettings = false
  @AppStorage("homeboard.guide.shortlist.dismissed") private var shortlistGuideDismissed = false

  private var listings: [ListingPreview] {
    appModel.board.shortlist.filter { listing in
      switch filter {
      case .active:
        return !["passed", "rejected"].contains(listing.status.lowercased()) &&
          listing.workflowStatus != "decided"
      case .touring:
        return listing.status == "toured" || listing.workflowStatus == "viewing"
      case .applied:
        return listing.status == "applied" || listing.workflowStatus == "applying"
      case .passed:
        return listing.status == "rejected"
      case .all:
        return true
      }
    }
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
            title: "The group shortlist",
            subtitle: "Every place still worth a conversation, without the spreadsheet noise."
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
              .buttonStyle(.plain)

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
              .buttonStyle(.plain)
            }
          }

          SharedFilterBar(selection: $filter, counts: statusCounts)

          if appModel.isBoardLoading && appModel.board.shortlist.isEmpty {
            ForEach(0..<3, id: \.self) { _ in
              HomeboardListingSkeletonCard()
            }
          } else if listings.isEmpty {
            SharedShortlistEmptyState(onBrowse: { showsListingDiscovery = true })
          } else {
            ForEach(listings) { listing in
              SharedShortlistRow(
                listing: listing,
                memberCount: max(appModel.board.members.count, 1),
                isSelectedForComparison: comparisonSelection.contains(listing.id),
                onOpen: { selectedListing = listing },
                onCompare: { toggleComparison(listing) }
              )
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, comparisonSelection.count >= 2 ? 120 : 36)
      }
      .scrollBounceBehavior(.basedOnSize, axes: .vertical)
      .refreshable {
        await appModel.refreshCurrentBoard()
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if comparisonSelection.count >= 2 {
        Button {
          appModel.trackComparisonOpened(listingIds: comparisonListings.map(\.id))
          showsComparison = true
        } label: {
          HStack(spacing: 10) {
            Image(systemName: "arrow.left.arrow.right")
            Text("Compare \(comparisonSelection.count) places")
            Spacer()
            Image(systemName: "chevron.up")
          }
          .font(.subheadline.weight(.bold))
          .foregroundStyle(Color.black)
          .padding(.horizontal, 18)
          .frame(height: 54)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
          .padding(.horizontal, 16)
          .padding(.vertical, 10)
          .background(HomeboardPalette.background.opacity(0.96))
        }
        .buttonStyle(.plain)
      }
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
    var counts: [SharedListingFilter: Int] = [:]
    counts[.all] = appModel.board.shortlist.count
    counts[.active] = appModel.board.shortlist.filter {
      !["passed", "rejected"].contains($0.status.lowercased()) && $0.workflowStatus != "decided"
    }.count
    counts[.touring] = appModel.board.shortlist.filter {
      $0.status == "toured" || $0.workflowStatus == "viewing"
    }.count
    counts[.applied] = appModel.board.shortlist.filter {
      $0.status == "applied" || $0.workflowStatus == "applying"
    }.count
    counts[.passed] = appModel.board.shortlist.filter { $0.status == "rejected" }.count
    return counts
  }

  private func toggleComparison(_ listing: ListingPreview) {
    if comparisonSelection.contains(listing.id) {
      comparisonSelection.remove(listing.id)
      return
    }

    guard comparisonSelection.count < 3 else { return }
    comparisonSelection.insert(listing.id)
  }
}

struct SharedGroupView: View {
  @Environment(AppModel.self) private var appModel
  @State private var copiedInvite = false
  @State private var selectedMember: MemberPreferenceCard?
  @State private var showsAddMember = false
  @State private var showsInviteMember = false

  private var pendingInvites: [BoardInvitationSummary] {
    appModel.board.invitations.filter { $0.status == "pending" }
  }

  var body: some View {
    ZStack {
      WorkspaceBackgroundView()

      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          SharedPageHeader(
            eyebrow: "\(appModel.board.members.count) member\(appModel.board.members.count == 1 ? "" : "s")",
            title: "One search, seen together",
            subtitle: "Budgets, commutes, and red lines stay attached to the people who care about them."
          ) {
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
            .buttonStyle(.plain)
          }

          SharedInviteCard(
            board: appModel.board,
            copied: copiedInvite,
            onCopy: {
              UIPasteboard.general.string = appModel.board.inviteCode
              copiedInvite = true
            },
            onInvite: { showsInviteMember = true },
            onAddManually: { showsAddMember = true }
          )

          VStack(alignment: .leading, spacing: 12) {
            SharedSectionTitle(title: "People", trailing: "Tap to see preferences")

            if appModel.board.members.isEmpty {
              SharedInlineEmpty(
                icon: "person.2",
                title: "No profiles yet",
                message: "Add the first member so the board has someone to optimize for."
              )
            } else {
              ForEach(appModel.board.members) { member in
                Button {
                  selectedMember = member
                } label: {
                  SharedMemberRow(member: member)
                }
                .buttonStyle(.plain)
              }
            }
          }

          if !pendingInvites.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              SharedSectionTitle(title: "Pending invites", trailing: "\(pendingInvites.count)")

              ForEach(pendingInvites) { invitation in
                HStack(spacing: 12) {
                  Image(systemName: "envelope.badge")
                    .foregroundStyle(HomeboardPalette.accent)

                  VStack(alignment: .leading, spacing: 3) {
                    Text(invitation.email ?? "Anyone with the code")
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

          VStack(alignment: .leading, spacing: 12) {
            SharedSectionTitle(
              title: "Open decisions",
              trailing: "\(appModel.board.openQuestions.count) unresolved"
            )

            if appModel.board.openQuestions.isEmpty {
              SharedInlineEmpty(
                icon: "checkmark.circle",
                title: "Nothing blocking the group",
                message: "New tradeoffs will appear here as the search gets more specific."
              )
            } else {
              ForEach(appModel.board.openQuestions.prefix(4), id: \.self) { question in
                HStack(alignment: .top, spacing: 12) {
                  Circle()
                    .fill(HomeboardPalette.accent)
                    .frame(width: 7, height: 7)
                    .padding(.top, 7)

                  Text(question)
                    .font(.subheadline)
                    .foregroundStyle(HomeboardPalette.primaryText)
                    .fixedSize(horizontal: false, vertical: true)

                  Spacer(minLength: 8)

                  Button {
                    appModel.resolveOpenQuestion(question, resolution: "Resolved by the group")
                  } label: {
                    Image(systemName: "checkmark")
                      .font(.caption.weight(.bold))
                      .foregroundStyle(HomeboardPalette.success)
                      .frame(width: 30, height: 30)
                      .background(Color.white.opacity(0.05))
                      .clipShape(Circle())
                  }
                  .buttonStyle(.plain)
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
    .sheet(isPresented: $showsAddMember) {
      AddSharedMemberSheet()
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
    let messages = appModel.board.chatMessages.map {
      SharedTimelineItem(
        id: "message-\($0.id)",
        author: $0.authorName?.isEmpty == false ? $0.authorName! : ($0.role == "assistant" ? "Homeboard" : "Member"),
        content: $0.content,
        isSystem: $0.role == "assistant" || $0.role == "system"
      )
    }
    let activity = appModel.board.recentActivity.enumerated().map {
      SharedTimelineItem(id: "activity-\($0.offset)", author: "Board", content: $0.element, isSystem: true)
    }
    return messages.isEmpty ? activity : messages
  }

  var body: some View {
    @Bindable var appModel = appModel

    ZStack {
      WorkspaceBackgroundView()

      ScrollView(.vertical, showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: 14) {
          SharedPageHeader(
            eyebrow: "Shared activity",
            title: "Keep the thread intact",
            subtitle: "Notes, reactions, and decisions from everyone on the board."
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
            .buttonStyle(.plain)
          }

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
              title: "The board is quiet",
              message: "Post the first update so everyone starts from the same context."
            )
          } else {
            ForEach(timeline) { item in
              SharedTimelineRow(item: item)
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 120)
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
            "Add an update for the group",
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
          .buttonStyle(.plain)
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
          title: "Leave decisions here, not in another chat",
          message: "Post what changed, what needs an answer, or why a listing moved. Everyone returns to the same context.",
          targetLabel: "POST A GROUP UPDATE",
          onDismiss: { updatesGuideDismissed = true }
        )
      }
    }
  }

  private func submitUpdate() {
    let message = updateDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !message.isEmpty else { return }
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

struct SharedSetupView: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var showsBriefEditor = false
  @State private var showsAddListing = false
  @State private var showsSafariGuide = false
  @State private var showsJoinBoard = false
  @State private var showsGroup = false
  @State private var titleDraft = ""
  @State private var showsBoardExitConfirmation = false
  @State private var showsAccountDeletionConfirmation = false
  @State private var showsReplayGuidesConfirmation = false

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
            SharedSettingsRow(icon: "person.3.fill", title: "People and invitations", subtitle: "Members, preferences, invite code") {
              showsGroup = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "slider.horizontal.3", title: "Edit search brief", subtitle: "Budget, timing, commute, neighborhoods") {
              showsBriefEditor = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "plus.rectangle.on.rectangle", title: "Add an offline listing", subtitle: "Last resort for a place with no listing page") {
              showsAddListing = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "square.and.arrow.up", title: "Sharing from Safari", subtitle: "Use the familiar Share button to scan a rental page") {
              showsSafariGuide = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "person.crop.circle.badge.plus", title: "Join another board", subtitle: "Use an invite code from another group") {
              showsJoinBoard = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "questionmark.circle", title: "Replay page guides", subtitle: "Show the first-visit tips again") {
              showsReplayGuidesConfirmation = true
            }

            SharedDivider()

            SharedSettingsRow(icon: "bell.badge", title: "Board notifications", subtitle: "Tours, comments, votes, and member updates") {
              appModel.enableNotifications()
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
                .buttonStyle(.plain)
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
          .buttonStyle(.plain)

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
              .buttonStyle(.plain)
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
          .buttonStyle(.plain)

          Button(role: .destructive) {
            showsAccountDeletionConfirmation = true
          } label: {
            HStack {
              Text(appModel.isDevelopmentAccount ? "Wipe account" : "Delete account and data")
              Spacer()
              Image(systemName: "person.crop.circle.badge.xmark")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(HomeboardPalette.danger)
            .padding(.horizontal, 16)
            .frame(height: 52)
            .sharedSurface(cornerRadius: 16)
          }
          .buttonStyle(.plain)
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
      SharedBriefEditorSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsAddListing) {
      AddSharedListingSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HomeboardPalette.background)
    }
    .sheet(isPresented: $showsSafariGuide) {
      SharedSafariSaveGuideSheet()
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
    .confirmationDialog(
      "Replay all page guides?",
      isPresented: $showsReplayGuidesConfirmation,
      titleVisibility: .visible
    ) {
      Button("Replay guides") {
        UserDefaults.standard.set(false, forKey: "homeboard.guide.search.dismissed")
        UserDefaults.standard.set(false, forKey: "homeboard.guide.shortlist.dismissed")
        UserDefaults.standard.set(false, forKey: "homeboard.guide.updates.dismissed")
        appModel.boardFeedback = "Page guides restarted."
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        dismiss()
      }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("Settings will close and the guide for the current tab will appear immediately. The other guides appear when you open their tabs.")
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
      appModel.isDevelopmentAccount
        ? "Wipe the development account?"
        : "Delete your Homeboard account?",
      isPresented: $showsAccountDeletionConfirmation,
      titleVisibility: .visible
    ) {
      Button(
        appModel.isDevelopmentAccount ? "Wipe account data" : "Delete account permanently",
        role: .destructive
      ) { appModel.deleteAccount() }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text(
        appModel.isDevelopmentAccount
          ? "This resets demoaccount to empty. Boards, listings, memberships, cached imports, and onboarding answers are removed, but the login remains available. You’ll restart onboarding."
          : "This removes your account, owned boards, memberships, saved listings, and shared profile data. This cannot be undone."
      )
    }
  }
}

private struct SharedSafariSaveGuideSheet: View {
  @Environment(\.dismiss) private var dismiss

  private let steps: [(icon: String, title: String, detail: String)] = [
    (
      "safari",
      "Open the exact listing",
      "In Safari, open the individual rental or unit page you want to save—not search results or a building-level recommendation card."
    ),
    (
      "square.and.arrow.up",
      "Share to Homeboard",
      "Tap Safari’s Share button—the square with the upward arrow—then choose Homeboard. The Share sheet closes immediately."
    ),
    (
      "highlighter",
      "Watch Follow mode",
      "Safari returns to the normal listing and follows a blue reading line sentence by sentence. Touch scrolling unlocks as soon as the scan finishes."
    ),
    (
      "arrow.clockwise",
      "One automatic second look",
      "If rent, address, bedrooms, or bathrooms are unclear, Homeboard performs one quick broader scan. It then tells you exactly which details are still missing."
    ),
    (
      "building.2",
      "Choose a home in the building",
      "On a building page, Homeboard keeps the shared street address once and separates each unit's rent, beds, baths, size, and availability. Pick the exact option before saving."
    ),
    (
      "checkmark.circle.fill",
      "Review and save",
      "When the scan finishes, tap Review details on the page. Confirm the full address and core facts, then save the source to the active board."
    )
  ]

  var body: some View {
    NavigationStack {
      ZStack {
        WorkspaceBackgroundView()

        ScrollView(.vertical, showsIndicators: false) {
          VStack(alignment: .leading, spacing: 22) {
            SharedPageHeader(
              eyebrow: "Share from mobile Safari",
              title: "Share once. Follow the blue reading line.",
              subtitle: "Homeboard returns you to the listing, follows the scan on-page, and asks for review only when it is finished."
            )

            VStack(alignment: .leading, spacing: 0) {
              HStack(spacing: 14) {
                ZStack {
                  RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(HomeboardPalette.accent.opacity(0.12))
                  Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(HomeboardPalette.accent)
                }
                .frame(width: 58, height: 58)

                VStack(alignment: .leading, spacing: 4) {
                  Text("Share to Homeboard")
                    .font(.headline)
                    .foregroundStyle(HomeboardPalette.primaryText)
                  Text("Included in your iPhone Share sheet")
                    .font(.subheadline)
                    .foregroundStyle(HomeboardPalette.secondaryText)
                }

                Spacer()

                Image(systemName: "checkmark.seal.fill")
                  .font(.title3)
                  .foregroundStyle(HomeboardPalette.success)
              }
              .padding(16)

              ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                SharedDivider()

                HStack(alignment: .top, spacing: 14) {
                  ZStack {
                    Circle()
                      .fill(Color.white.opacity(0.06))
                    Image(systemName: step.icon)
                      .font(.system(size: 15, weight: .bold))
                      .foregroundStyle(HomeboardPalette.accent)
                  }
                  .frame(width: 36, height: 36)

                  VStack(alignment: .leading, spacing: 5) {
                    Text("\(index + 1). \(step.title)")
                      .font(.subheadline.weight(.bold))
                      .foregroundStyle(HomeboardPalette.primaryText)
                    Text(step.detail)
                      .font(.caption)
                      .foregroundStyle(HomeboardPalette.secondaryText)
                      .fixedSize(horizontal: false, vertical: true)
                  }

                  Spacer(minLength: 0)
                }
                .padding(16)
              }
            }
            .sharedSurface(cornerRadius: 22)

            VStack(alignment: .leading, spacing: 10) {
              Label("What stays separated", systemImage: "rectangle.split.3x1")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(HomeboardPalette.primaryText)

              Text("Building address")
                .font(.caption.weight(.bold))
                .foregroundStyle(HomeboardPalette.accent)
              Text("Read once from the page heading and reused for the selected unit.")
                .font(.caption)
                .foregroundStyle(HomeboardPalette.secondaryText)

              Text("Unit facts")
                .font(.caption.weight(.bold))
                .foregroundStyle(HomeboardPalette.accent)
              Text("Rent, bedrooms, bathrooms, square footage, and availability must come from the same unit row. Homeboard will not borrow missing facts from the next option.")
                .font(.caption)
                .foregroundStyle(HomeboardPalette.secondaryText)
            }
            .padding(16)
            .sharedSurface(cornerRadius: 18)

            Button("Got it") {
              dismiss()
            }
            .font(.headline)
            .foregroundStyle(Color.black)
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
              LinearGradient(
                colors: [HomeboardPalette.accent, HomeboardPalette.accentStrong],
                startPoint: .leading,
                endPoint: .trailing
              )
            )
            .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
            .buttonStyle(.plain)
          }
          .padding(.horizontal, 16)
          .padding(.top, 26)
          .padding(.bottom, 36)
        }
      }
      .toolbar(.hidden, for: .navigationBar)
    }
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
      .buttonStyle(.plain)
      .padding(.top, 10)
      .padding(.trailing, 14)
    }
  }
}

// MARK: - Map components

private struct SharedWorkNodeMarker: View {
  let workNode: SharedWorkNode

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 5) {
        Image(systemName: "briefcase.fill")
          .font(.system(size: 9, weight: .bold))
        VStack(alignment: .leading, spacing: 0) {
          Text("Work")
            .font(.caption2.weight(.heavy))
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
      "Work, \(workNode.destination), full commute score from \(workNode.preferredMinutes) to \(workNode.maximumMinutes) minutes"
    )
  }
}

private struct SharedComparisonTierLegend: View {
  let listingCount: Int
  let routedListingCount: Int
  let isLoadingCommutes: Bool

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
          ProgressView()
            .controlSize(.mini)
            .tint(HomeboardPalette.accent)
        } else {
          Text("\(listingCount) scored")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(HomeboardPalette.tertiaryText)
        }
      }

      HStack(spacing: 7) {
        Text("\(routedListingCount)/\(listingCount) routed")
          .foregroundStyle(HomeboardPalette.primaryText)
        Capsule()
          .fill(HomeboardPalette.accent)
          .frame(width: 16, height: 3)
        Text("Each line matches its listing node")
          .foregroundStyle(HomeboardPalette.secondaryText)
        Spacer(minLength: 0)
      }
      .font(.caption2.weight(.semibold))
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
      "Comparison tiers from green best fit to red weakest fit. \(listingCount) listings scored and \(routedListingCount) listings routed. Every route line matches the color of its listing node."
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
        .buttonStyle(.plain)
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
        .buttonStyle(.plain)
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
              Text("Best usable route: \(recommended.mode.label) · \(formattedMinutes(recommended.minutes))")
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
      Image(systemName: route.mode.icon)
        .font(.system(size: 9, weight: .bold))
      Text(route.mode.label)
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
      "\(route.mode.label), \(route.minutes) minutes, \(isRecommended ? "best usable route" : route.tier.accessibilityLabel)"
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
      Image(systemName: route.mode.icon)
        .font(.subheadline.weight(.bold))
        .foregroundStyle(route.tier.color)
        .frame(width: 26, height: 26)
        .background(route.tier.color.opacity(0.12))
        .clipShape(Circle())

      VStack(alignment: .leading, spacing: 2) {
        Text("\(route.mode.label) to \(route.destination)")
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
  let onFilter: () -> Void
  let onCompare: () -> Void
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
          .buttonStyle(.plain)
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
      .buttonStyle(.plain)
      .layoutPriority(2)

      if presentation == .map {
        if comparisonActive {
          Button(action: onCompare) {
            Label("Priorities", systemImage: "slider.horizontal.3")
              .font(.caption.weight(.bold))
              .lineLimit(1)
              .foregroundStyle(HomeboardPalette.buttonText)
              .padding(.horizontal, 11)
              .frame(height: 36)
              .background(HomeboardPalette.accent)
              .clipShape(Capsule())
          }
          .buttonStyle(.plain)
          .layoutPriority(2)
          .accessibilityLabel("Tune comparison map priorities")
        } else {
          Button(action: onCompare) {
            Image(systemName: "chart.bar.fill")
              .font(.caption.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
              .frame(width: 38, height: 36)
              .background(HomeboardPalette.surfaceDeep.opacity(0.88))
              .clipShape(Circle())
          }
          .buttonStyle(.plain)
          .layoutPriority(2)
          .accessibilityLabel("Open comparison map")

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
          .buttonStyle(.plain)
          .layoutPriority(2)
          .accessibilityLabel(hasArea ? "Clear drawn search area" : "Draw a search area")
        }
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

private struct SharedComparisonPrioritySheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var ranks: [SharedComparisonCriterion: Int]
  @Binding var cityQuery: String
  let isActive: Bool
  let listingCount: Int
  let onActivate: () -> Void
  let onDisable: () -> Void

  private func criteria(at rank: Int) -> [SharedComparisonCriterion] {
    SharedComparisonCriterion.allCases
      .filter { ranks[$0] == rank }
      .sorted { $0.rawValue < $1.rawValue }
  }

  private func percentage(for criterion: SharedComparisonCriterion) -> Int {
    let totalWeight = SharedComparisonCriterion.allCases.reduce(0) {
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
                    HStack(spacing: 11) {
                      Image(systemName: criterion.icon)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(HomeboardPalette.buttonText)
                        .frame(width: 34, height: 34)
                        .background(HomeboardPalette.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                      VStack(alignment: .leading, spacing: 2) {
                        Text(criterion.label)
                          .font(.subheadline.weight(.bold))
                          .foregroundStyle(HomeboardPalette.primaryText)
                        Text(criterion.explanation)
                          .font(.caption2)
                          .foregroundStyle(HomeboardPalette.secondaryText)
                          .lineLimit(1)
                      }

                      Spacer(minLength: 4)

                      VStack(spacing: 5) {
                        Text("\(percentage(for: criterion))%")
                          .font(.caption2.weight(.heavy))
                          .foregroundStyle(HomeboardPalette.accent)

                        HStack(spacing: 5) {
                          priorityMoveButton(
                            icon: "chevron.up",
                            label: "Move \(criterion.label) up",
                            disabled: rank == 1
                          ) {
                            move(criterion, to: rank - 1)
                          }

                          priorityMoveButton(
                            icon: "chevron.down",
                            label: "Move \(criterion.label) down",
                            disabled: rank == 4
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
            "Weights are normalized to 100%. Comparison mode calculates a realistic usable route for every listing, then keeps drive, transit, and walking details available on each node. Missing facts stay unknown."
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
          .buttonStyle(.plain)
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
    .buttonStyle(.plain)
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
        .buttonStyle(.plain)
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
  let selectedListingID: String?
  let isLoading: Bool
  let hasMore: Bool
  let onOpen: (ListingPreview) -> Void
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
              Button { onOpen(listing) } label: {
                HStack(spacing: 13) {
                  SharedListingArtwork(listing: listing, height: 106, cornerRadius: 16)
                    .frame(width: 118)

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
                  }
                  Spacer(minLength: 0)
                  Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(HomeboardPalette.tertiaryText)
                }
                .padding(12)
                .sharedSurface(cornerRadius: 20)
                .overlay {
                  if selectedListingID == listing.id {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                      .stroke(HomeboardPalette.accent, lineWidth: 2)
                  }
                }
              }
              .buttonStyle(.plain)
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

private struct SharedExpandedClusterBar: View {
  let count: Int
  let onCollapse: () -> Void

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "point.3.connected.trianglepath.dotted")
      Text("\(count) listings expanded")
      Spacer(minLength: 0)
      Button("Collapse", action: onCollapse)
        .foregroundStyle(HomeboardPalette.accent)
        .buttonStyle(.plain)
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

      SharedAvatarStack(members: board.members, size: 27)

      Button(action: onSettings) {
        Image(systemName: "gearshape.fill")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.secondaryText)
          .frame(width: 34, height: 34)
          .background(Color.white.opacity(0.06))
          .clipShape(Circle())
      }
      .buttonStyle(.plain)

      Button(action: onAdd) {
        Image(systemName: "plus")
          .font(.subheadline.weight(.bold))
          .foregroundStyle(Color.black)
          .frame(width: 36, height: 36)
          .background(HomeboardPalette.accent)
          .clipShape(Circle())
      }
      .buttonStyle(.plain)
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

private struct SharedPriceMarker: View {
  let text: String
  let isSelected: Bool
  let comparisonScore: SharedListingComparisonScore?
  let comparisonColor: Color?

  private var markerColor: Color {
    comparisonColor
      ?? comparisonScore?.color
      ?? (isSelected ? HomeboardPalette.accent : HomeboardPalette.accentStrong)
  }

  var body: some View {
    if comparisonScore != nil {
      Text(text)
        .font(.caption.weight(.heavy))
        .monospacedDigit()
        .foregroundStyle(Color.black)
        .frame(width: 34, height: 34)
        .background(markerColor)
        .clipShape(Circle())
        .overlay {
          Circle().stroke(Color.white.opacity(0.55), lineWidth: 1)
        }
        .scaleEffect(isSelected ? 1.1 : 1)
        .shadow(color: Color.black.opacity(0.26), radius: 4, x: 0, y: 2)
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
    .buttonStyle(.plain)
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
        Text("Find a real listing on any rental website or app, then use Share → Homeboard to bring it into \(city.isEmpty ? "this search" : city).")
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
        .buttonStyle(.plain)
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
            eyebrow: "Find a real listing",
            title: "Search wherever you already look",
            subtitle: "Choose a rental website or app for \(destinationLabel). Open the exact listing, then use Share → Homeboard."
          )

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
              .buttonStyle(.plain)

              if index < sources.count - 1 {
                SharedDivider()
              }
            }
          }
          .sharedSurface(cornerRadius: 19)

          HStack(alignment: .top, spacing: 10) {
            Image(systemName: "square.and.arrow.up")
              .foregroundStyle(HomeboardPalette.accent)
            Text("On the listing page, tap the familiar Share button and choose Homeboard. Homeboard will scan the source and ask you to confirm anything missing.")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)
          }
          .padding(14)
          .sharedSurface(cornerRadius: 16)

          Text("If a place truly has no page online, use Settings → Add an offline listing as the last-resort fallback.")
            .font(.caption2)
            .foregroundStyle(HomeboardPalette.tertiaryText)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .padding(.bottom, 20)
      }
      .background(WorkspaceBackgroundView())
      .navigationTitle("Find listings")
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

// MARK: - Shared list components

private enum SharedListingFilter: String, CaseIterable, Identifiable {
  case active
  case touring
  case applied
  case passed
  case all

  var id: String { rawValue }
  var title: String { rawValue.capitalized }
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
          .buttonStyle(.plain)
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
      .buttonStyle(.plain)

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
        .buttonStyle(.plain)
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
        Text("Find a place on any rental website or app, then share its listing page to Homeboard. Places appear here after someone keeps them in play.")
          .font(.subheadline)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .multilineTextAlignment(.center)
      }

      HStack(spacing: 10) {
        Button("Browse Search") {
          appModel.openBoardTab(.board)
        }
        .font(.subheadline.weight(.bold))
        .foregroundStyle(Color.black)
        .padding(.horizontal, 18)
        .frame(height: 44)
        .background(HomeboardPalette.accent)
        .clipShape(Capsule())
        .buttonStyle(.plain)

        Button("Find listings", action: onBrowse)
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
          .padding(.horizontal, 18)
          .frame(height: 44)
          .background(Color.white.opacity(0.07))
          .clipShape(Capsule())
          .buttonStyle(.plain)
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
            .buttonStyle(.plain)

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
              .buttonStyle(.plain)
            }

            Menu {
              Button(role: .destructive) {
                confirmsRemoval = true
              } label: {
                Label("Remove from board", systemImage: "trash")
              }
            } label: {
              Image(systemName: "ellipsis")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.white)
                .frame(width: 40, height: 40)
                .background(.ultraThinMaterial)
                .clipShape(Circle())
            }
            .buttonStyle(.plain)
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
          HStack(spacing: 10) {
            SharedDetailMetric(icon: "tram.fill", value: listing.commuteLine)
            SharedDetailMetric(icon: "person.3.fill", value: "\(max(appModel.board.members.count, 1)) weighing in")
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
                .buttonStyle(.plain)
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
              .buttonStyle(.plain)
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
                .buttonStyle(.plain)
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
                Text("Remove from board")
                  .font(.subheadline.weight(.semibold))
                  .foregroundStyle(HomeboardPalette.danger)
                  .frame(maxWidth: .infinity)
                  .frame(height: 48)
                  .background(Color.white.opacity(0.045))
                  .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
              }
              .buttonStyle(.plain)
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
    .alert("Remove this listing?", isPresented: $confirmsRemoval) {
      Button("Cancel", role: .cancel) {}
      Button("Remove", role: .destructive) {
        appModel.removeManualListing(id: listing.id)
        dismiss()
      }
    } message: {
      Text("It will be removed from this board for everyone.")
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
          .buttonStyle(.plain)
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
              .buttonStyle(.plain)

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
                  .buttonStyle(.plain)

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
      .buttonStyle(.plain)
    }
    .padding(16)
    .sharedSurface(cornerRadius: 20)
  }
}

private struct SharedListingDecisionPanel: View {
  let listing: ListingPreview
  @Environment(AppModel.self) private var appModel
  @State private var decisionType = "request_viewing"

  private var latestDecision: ListingDecisionSummary? {
    listing.decisions.first(where: { $0.type == decisionType })
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 13) {
      SharedSectionTitle(title: "Next group decision", trailing: listing.workflowStatus.replacingOccurrences(of: "_", with: " ").capitalized)

      Picker("Decision", selection: $decisionType) {
        Text("Shortlist").tag("shortlist")
        Text("View").tag("request_viewing")
        Text("Apply").tag("apply")
      }
      .pickerStyle(.segmented)

      if let decision = latestDecision, !decision.votes.isEmpty {
        Text(decision.votes.map { "\($0.name): \($0.choice)" }.joined(separator: " · "))
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
      } else {
        Text("No votes yet. This vote is about one concrete next step, not a permanent ranking.")
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
      }

      HStack(spacing: 9) {
        ForEach([("yes", "Yes"), ("no", "No"), ("abstain", "Not sure")], id: \.0) { choice, label in
          Button(label) {
            appModel.voteOnListingDecision(id: listing.id, type: decisionType, choice: choice)
          }
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(choice == "yes" ? Color.black : HomeboardPalette.primaryText)
          .frame(maxWidth: .infinity)
          .frame(height: 44)
          .background(choice == "yes" ? HomeboardPalette.accent : Color.white.opacity(0.06))
          .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
          .buttonStyle(.plain)
        }
      }

      Menu {
        ForEach([
          ("considering", "Considering"),
          ("shortlisted", "Shortlisted"),
          ("viewing", "Viewing"),
          ("applying", "Applying"),
          ("decided", "Decision made")
        ], id: \.0) { status, label in
          Button(label) {
            appModel.moveListing(id: listing.id, to: status)
          }
        }
      } label: {
        Label("Move through workflow", systemImage: "arrow.triangle.branch")
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
    return "Different reads — worth discussing"
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
              .buttonStyle(.plain)
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
      .buttonStyle(.plain)
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
            eyebrow: initialImport == nil ? "Offline fallback" : "Collected from Safari",
            title: initialImport == nil ? "Add a place with no listing page" : "Save this rental",
            subtitle: initialImport == nil
              ? "Use this only for an off-market place that cannot be shared from a rental website or app."
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
            .buttonStyle(.plain)
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
              .buttonStyle(.plain)
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
                commuteLine: "Compare group commutes",
                summary: summary,
                fitLabel: "Group contender",
                sourceURL: sourceURL,
                groupNote: note,
                photoURL: photoURL,
                unit: unit,
                bedrooms: bedrooms,
                bathrooms: bathrooms,
                amenities: importedAmenities,
                modelInsights: importedModelInsights,
                address: title,
                latitude: coordinate?.latitude,
                longitude: coordinate?.longitude
              )
              isSaving = false
              if appModel.boardError == nil { dismiss() }
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
          .buttonStyle(.plain)
          .disabled(!hasRequiredFacts || isSaving)
          .opacity(hasRequiredFacts ? 1 : 0.55)

          if !hasRequiredFacts {
            Text("An address, rent, bedroom count, and bathroom count are required. The link and unit can stay blank for a genuinely offline place.")
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
  let onAddManually: () -> Void

  private var inviteURL: URL {
    HomeboardConfig.publicWebBaseURL.appending(path: "invite/\(board.inviteCode)")
  }

  private var activeInvite: BoardInvitationSummary? {
    board.invitations.first {
      $0.status == "pending" && $0.inviteCode == board.inviteCode
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 16) {
        VStack(alignment: .leading, spacing: 7) {
          Text("BRING IN YOUR ROOMMATES")
            .font(.caption2.weight(.bold))
            .tracking(1.5)
            .foregroundStyle(Color.black.opacity(0.56))

          Text(board.inviteCode.isEmpty ? "Invite a roommate" : board.inviteCode)
            .font(board.inviteCode.isEmpty ? .title3.weight(.heavy) : .title2.weight(.heavy).monospaced())
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
          .buttonStyle(.plain)
          .accessibilityLabel("Invite roommate")
        } else {
          VStack(spacing: 9) {
            ShareLink(
              item: inviteURL,
              subject: Text("Join \(board.title) on Homeboard"),
              message: Text("Join our shared rental board. Homeboard code: \(board.inviteCode)")
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
            .buttonStyle(.plain)
          }
        }
      }

      HStack(spacing: 16) {
        Button(
          board.inviteCode.isEmpty
            ? "Create a shareable code"
            : activeInvite?.email == nil ? "Invite options" : "Create an unrestricted code",
          action: onInvite
        )
          .font(.caption.weight(.bold))
          .foregroundStyle(Color.black)
          .buttonStyle(.plain)

        Button("Capture a profile manually", action: onAddManually)
          .font(.caption.weight(.semibold))
          .foregroundStyle(Color.black.opacity(0.62))
          .buttonStyle(.plain)
      }
    }
    .padding(18)
    .background(HomeboardPalette.accent)
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
  }

  private var inviteDescription: String {
    guard !board.inviteCode.isEmpty else {
      return "Create a code, then send it through Messages or any app. No email required."
    }
    if let email = activeInvite?.email {
      return "Only \(email) can use this code. Share it yourself—the app does not send email."
    }
    return "Anyone you text this code or link to can join the board."
  }
}

private struct InviteSharedMemberSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var email = ""

  private var normalizedEmail: String {
    email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  private var restrictedEmail: String? {
    normalizedEmail.isEmpty ? nil : normalizedEmail
  }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 18) {
        SharedPageHeader(
          eyebrow: "Roommate invite",
          title: "Create a shareable code",
          subtitle: "Leave email blank for a code you can text to anyone. Add one only when you want that code locked to a specific person."
        )

        SharedField(title: "Restrict to email (optional)", prompt: "maya@example.com", text: $email, keyboard: .emailAddress)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()

        Label(
          "Homeboard creates the code here. Use the iPhone share button afterward to send it through Messages, Mail, or another app.",
          systemImage: "message.fill"
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
            await appModel.createInvite(email: restrictedEmail)
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
            Text(appModel.isBoardLoading ? "Preparing code" : "Create code")
          }
          .font(.headline.weight(.bold))
          .foregroundStyle(Color.black)
          .frame(maxWidth: .infinity)
          .frame(height: 54)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        }
        .buttonStyle(.plain)
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
              SharedSectionTitle(title: "Your affordability", trailing: "Private to this board")

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
                SharedField(
                  title: "Work or school address",
                  prompt: "350 5th Ave, New York, NY",
                  text: $commuteAddress
                )
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
              .buttonStyle(.plain)
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
      validationError = "Add a full address to include your commute."
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

private struct AddSharedMemberSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var name = ""
  @State private var priorities = ""
  @State private var neighborhoods = ""
  @State private var dealbreakers = ""

  var body: some View {
    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          SharedPageHeader(
            eyebrow: "New member",
            title: "Add their point of view",
            subtitle: "Invites are best, but you can capture a roommate profile manually while they join."
          )

          SharedField(title: "Name", prompt: "Maya", text: $name)
          Text("This creates a placeholder only. When this person joins, they set their own contribution and optionally add a commute address.")
            .font(.subheadline)
            .foregroundStyle(HomeboardPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
          SharedField(title: "Priorities", prompt: "nightlife, natural light", text: $priorities)
          SharedField(title: "Neighborhoods", prompt: "Williamsburg, Fort Greene", text: $neighborhoods)
          SharedField(title: "Dealbreakers", prompt: "over $1,800, poor train access", text: $dealbreakers)

          Button {
            appModel.addManualMember(
              name: name,
              budgetLine: "",
              commuteLine: "",
              priorities: SharedListingText.csv(priorities),
              dealbreakers: SharedListingText.csv(dealbreakers),
              neighborhoods: SharedListingText.csv(neighborhoods),
              status: "profile captured"
            )
            if appModel.boardError == nil {
              dismiss()
            }
          } label: {
            Text("Add member")
              .font(.headline.weight(.bold))
              .foregroundStyle(Color.black)
              .frame(maxWidth: .infinity)
              .frame(height: 54)
              .background(HomeboardPalette.accent)
              .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
          }
          .buttonStyle(.plain)
          .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          .opacity(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.55 : 1)
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

// MARK: - Setup sheets

private struct SharedBriefEditorSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    @Bindable var appModel = appModel

    NavigationStack {
      ScrollView(.vertical, showsIndicators: false) {
        VStack(alignment: .leading, spacing: 18) {
          SharedPageHeader(
            eyebrow: "Group brief",
            title: "Keep the search current",
            subtitle: "These are the constraints that affect every listing on the board."
          )

          SharedField(title: "City", prompt: "New York City", text: $appModel.profile.city)
          SharedField(title: "Move-in", prompt: "August", text: $appModel.profile.moveInDate)

          VStack(alignment: .leading, spacing: 8) {
            Text("Member-owned limits")
              .font(.headline)
              .foregroundStyle(HomeboardPalette.primaryText)
            Text("Budget and commute are no longer set for the whole group here. Each person controls those fields from their member card, and Homeboard derives the group total automatically.")
              .font(.subheadline)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)
          }
          .padding(16)
          .sharedSurface(cornerRadius: 18)

          Button {
            Task {
              await appModel.saveBoardBrief()
              if appModel.boardError == nil {
                dismiss()
              }
            }
          } label: {
            Text("Save group brief")
              .font(.headline.weight(.bold))
              .foregroundStyle(Color.black)
              .frame(maxWidth: .infinity)
              .frame(height: 54)
              .background(HomeboardPalette.accent)
              .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
          }
          .buttonStyle(.plain)
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

private struct SharedJoinBoardSheet: View {
  @Environment(AppModel.self) private var appModel
  @Environment(\.dismiss) private var dismiss
  @State private var inviteCode = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      SharedPageHeader(
        eyebrow: "Invite code",
        title: "Join another search",
        subtitle: "Your account can belong to more than one shared board."
      )

      SharedField(title: "Code", prompt: "NYC-SAM", text: $inviteCode)

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
      .buttonStyle(.plain)

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

  var body: some View {
    ZStack {
      Color.black.opacity(0.78)
        .ignoresSafeArea()

      VStack(alignment: .leading, spacing: 16) {
        HStack(alignment: .top, spacing: 12) {
          Image(systemName: "square.and.arrow.up.fill")
            .font(.title3.weight(.semibold))
            .foregroundStyle(HomeboardPalette.buttonText)
            .frame(width: 44, height: 44)
            .background(HomeboardPalette.accent)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

          VStack(alignment: .leading, spacing: 4) {
            Text("Save listings from wherever you find them")
              .font(.title3.weight(.bold))
              .foregroundStyle(HomeboardPalette.primaryText)
              .fixedSize(horizontal: false, vertical: true)

            Text("Zillow, StreetEasy, Apartments.com, Realtor, Safari, and other rental apps or websites.")
              .font(.caption)
              .foregroundStyle(HomeboardPalette.secondaryText)
              .fixedSize(horizontal: false, vertical: true)
          }
        }

        VStack(spacing: 0) {
          workflowStep(
            number: 1,
            title: "Open the exact listing",
            detail: "Use the individual home or unit page—not search results or a nearby-listings card."
          )
          SharedDivider()
          workflowStep(
            number: 2,
            title: "Tap that app’s normal Share button",
            detail: "In Safari, use the square-with-up-arrow. In a rental app, use Share so it sends the listing link."
          )
          SharedDivider()
          workflowStep(
            number: 3,
            title: "Choose Homeboard",
            detail: "Homeboard scans the shared listing, then asks you to confirm the address, rent, bedrooms, and bathrooms before saving."
          )
        }
        .homeboardInsetSurface(cornerRadius: 18)

        Label("The + button is only a manual backup.", systemImage: "info.circle.fill")
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.secondaryText)

        Button(action: onDismiss) {
          HStack {
            Text("Got it—start browsing")
            Spacer()
            Image(systemName: "arrow.right")
          }
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.buttonText)
          .padding(.horizontal, 16)
          .frame(height: 48)
          .background(HomeboardPalette.accent)
          .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(.plain)
      }
      .padding(18)
      .frame(maxWidth: 370)
      .background(HomeboardPalette.surface.opacity(0.99))
      .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .stroke(HomeboardPalette.borderStrong.opacity(0.55), lineWidth: 1)
      }
      .shadow(color: Color.black.opacity(0.50), radius: 28, x: 0, y: 16)
      .padding(.horizontal, 18)
    }
    .transition(.opacity.combined(with: .scale(scale: 0.97)))
    .zIndex(110)
  }

  private func workflowStep(number: Int, title: String, detail: String) -> some View {
    HStack(alignment: .top, spacing: 12) {
      Text("\(number)")
        .font(.caption.weight(.heavy))
        .foregroundStyle(HomeboardPalette.buttonText)
        .frame(width: 28, height: 28)
        .background(HomeboardPalette.accent)
        .clipShape(Circle())

      VStack(alignment: .leading, spacing: 3) {
        Text(title)
          .font(.subheadline.weight(.bold))
          .foregroundStyle(HomeboardPalette.primaryText)
        Text(detail)
          .font(.caption)
          .foregroundStyle(HomeboardPalette.secondaryText)
          .fixedSize(horizontal: false, vertical: true)
      }

      Spacer(minLength: 0)
    }
    .padding(12)
  }
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
            .buttonStyle(.plain)
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
          .buttonStyle(.plain)
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
            ZStack {
              Circle()
                .fill(HomeboardPalette.accent.opacity(0.18))
                .frame(width: min(height * 0.36, 74), height: min(height * 0.36, 74))
              Image(systemName: "building.2.crop.circle.fill")
                .font(.system(size: min(height * 0.23, 46), weight: .medium))
                .foregroundStyle(HomeboardPalette.accent)
            }

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
    .buttonStyle(.plain)
  }
}

private struct SharedDivider: View {
  var body: some View {
    Divider()
      .overlay(Color.white.opacity(0.07))
      .padding(.leading, 63)
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
    region: MKCoordinateRegion
  ) -> [SharedListingMapCluster] {
    guard !items.isEmpty else { return [] }

    let latitudeCell = max(region.span.latitudeDelta / 8, 0.00035)
    let longitudeCell = max(region.span.longitudeDelta / 6, 0.00035)
    let minimumLatitude = region.center.latitude - region.span.latitudeDelta / 2
    let minimumLongitude = region.center.longitude - region.span.longitudeDelta / 2

    var buckets: [String: [SharedListingMapItem]] = [:]
    for item in items {
      let row = Int(floor((item.coordinate.latitude - minimumLatitude) / latitudeCell))
      let column = Int(floor((item.coordinate.longitude - minimumLongitude) / longitudeCell))
      buckets["\(row):\(column)", default: []].append(item)
    }

    return buckets.keys.sorted().compactMap { key in
      guard let bucket = buckets[key], !bucket.isEmpty else { return nil }
      let latitude = bucket.reduce(0) { $0 + $1.coordinate.latitude } / Double(bucket.count)
      let longitude = bucket.reduce(0) { $0 + $1.coordinate.longitude } / Double(bucket.count)
      return SharedListingMapCluster(
        id: key,
        coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
        items: bucket
      )
    }
  }
}

private struct SharedListingClusterMarker: View {
  let count: Int
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
        Circle().stroke(Color.white.opacity(0.45), lineWidth: 1)
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
        Capsule().stroke(Color.white.opacity(0.22), lineWidth: 1)
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
