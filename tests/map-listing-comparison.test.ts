import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const mapSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift",
  ),
  "utf8",
);

const paletteSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Sources/HomeboardPalette.swift",
  ),
  "utf8",
);

const rootSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Sources/RootView.swift",
  ),
  "utf8",
);

const listingModelSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Sources/HomeboardModels.swift",
  ),
  "utf8",
);

const mobilePayloadSource = readFileSync(
  resolve(process.cwd(), "lib/mobile-payloads.ts"),
  "utf8",
);

const boardDataSource = readFileSync(
  resolve(process.cwd(), "lib/board-data.ts"),
  "utf8",
);

const mobileListingRouteSource = readFileSync(
  resolve(process.cwd(), "app/api/mobile/boards/[id]/listings/route.ts"),
  "utf8",
);

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex.match(/.{2}/g)!.map((channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("native UI uses one neutral dark palette and skeleton-loads async content", () => {
  assert.match(paletteSource, /background = color\(0x3D504A\)/);
  assert.match(paletteSource, /surface = color\(0x4B6159\)/);
  assert.match(paletteSource, /accent = color\(0xF9E2CD\)/);
  assert.doesNotMatch(paletteSource, /B1D6FC|82B7EB|94BFE8|80A8B2|accentPurple/);
  assert.doesNotMatch(paletteSource, /adaptive\(light:|enum HomeboardAppearance/);
  assert.doesNotMatch(rootSource, /@AppStorage\(HomeboardAppearance\.storageKey\)/);
  assert.match(rootSource, /preferredColorScheme\(\.dark\)/);
  assert.doesNotMatch(mapSource, /SharedAppearanceSelector/);
  assert.match(paletteSource, /struct HomeboardSkeletonBlock/);
  assert.match(paletteSource, /accessibilityReduceMotion/);
  assert.match(paletteSource, /struct HomeboardListingSkeletonCard/);
  assert.match(paletteSource, /struct HomeboardScreenSkeleton/);
  assert.match(paletteSource, /struct HomeboardBoardSkeleton/);
  assert.match(paletteSource, /struct HomeboardMapSkeletonCanvas/);
  assert.match(paletteSource, /\.frame\(minHeight: 270\)/);
  assert.match(paletteSource, /Text\("Loading map"\)/);
  assert.match(paletteSource, /ProgressView\(\)[\s\S]*controlSize\(\.large\)/);
  assert.doesNotMatch(paletteSource, /mapPinPositions|path\.addCurve/);
  assert.match(rootSource, /if appModel\.isBootstrapping/);
  assert.match(rootSource, /appModel\.currentScreen == \.board[\s\S]*HomeboardBoardSkeleton\(\)/);
  assert.match(rootSource, /HomeboardScreenSkeleton\(\)/);
  assert.match(mapSource, /listings\.isEmpty && isLoading/);
  assert.match(mapSource, /\.mapControlVisibility\(\.hidden\)/);
  assert.match(mapSource, /HomeboardListingSkeletonCard\(\)/);
  assert.match(mapSource, /HomeboardSkeletonBlock\([\s\S]*Checking drive, transit, and walking times/);
  assert.ok(contrastRatio("FFF3E5", "4B6159") >= 4.5);
  assert.ok(contrastRatio("E7DACE", "4B6159") >= 4.5);
  assert.ok(contrastRatio("243129", "F9E2CD") >= 4.5);
});

test("empty listing states send users to sourced rentals without an offline-entry setting", () => {
  assert.match(mapSource, /struct SharedListingDiscoverySheet/);
  assert.match(mapSource, /Open a listing in Safari, then tap its Homeboard pill to save/);
  assert.match(mapSource, /Button\("Find listings", action: onBrowse\)/);
  assert.doesNotMatch(mapSource, /Add an offline listing/);
  assert.doesNotMatch(mapSource, /Add a place with no listing page/);
  assert.doesNotMatch(mapSource, /Offline fallback/);
  assert.match(mapSource, /Listing link \(optional\)/);
  assert.doesNotMatch(mapSource, /No matching suggestions loaded/);

  const emptyState = mapSource.slice(
    mapSource.indexOf("private struct SharedMapEmptyCard"),
    mapSource.indexOf("private struct SharedRentalSource"),
  );
  assert.doesNotMatch(emptyState, /showsAddListing|AddSharedListingSheet/);

  const requiredFacts = mapSource.slice(
    mapSource.indexOf("private var hasRequiredFacts"),
    mapSource.indexOf("var body: some View", mapSource.indexOf("private var hasRequiredFacts")),
  );
  assert.doesNotMatch(requiredFacts, /sourceURL/);
});

test("page guides replay explicitly and dim through the status-bar safe area", () => {
  assert.match(mapSource, /title: "Help & tutorials"/);
  assert.match(mapSource, /SharedHelpTutorialsSheet/);
  assert.match(mapSource, /Label\("Replay page guides"/);
  assert.match(mapSource, /private func replayPageGuides\(\)/);
  assert.match(mapSource, /Page guides restarted/);
  assert.match(mapSource, /UINotificationFeedbackGenerator/);
  assert.match(mapSource, /dismiss\(\)/);
  assert.match(mapSource, /let topOverflow = max\(geometry\.safeAreaInsets\.top, 80\)/);
  assert.match(mapSource, /y: -\(topOverflow \/ 2\) \+ 0\.5/);
  const searchGuideFlow = mapSource.slice(
    mapSource.indexOf("if firstListingGuidePending"),
    mapSource.indexOf("private func defaultMapRegion"),
  );
  assert.match(searchGuideFlow, /firstListingGuidePending = false/);
  assert.doesNotMatch(
    searchGuideFlow.slice(0, searchGuideFlow.indexOf("else if !searchGuideDismissed")),
    /searchGuideDismissed = true/,
  );
  assert.match(searchGuideFlow, /Use the top bar to work with listings/);
  assert.match(searchGuideFlow, /Map and Cards change the view/);
  assert.match(searchGuideFlow, /Tap a numbered map cluster to filter Cards/);
});

test("comparison map ranks core priorities plus grounded home features and allows tied levels", () => {
  assert.match(mapSource, /case price/);
  assert.match(mapSource, /case commute/);
  assert.match(mapSource, /case space/);
  assert.match(mapSource, /case neighborhood/);
  assert.match(mapSource, /case features/);
  assert.match(mapSource, /SharedComparisonMath\.priorityWeight\(for: rank\)/);
  assert.match(mapSource, /case 1: 8/);
  assert.match(mapSource, /Factors can share a level when they matter equally/);
  assert.match(mapSource, /priorityMoveButton/);
  assert.match(mapSource, /ranks\[criterion\] = min\(max\(rank, 1\), 4\)/);
  assert.doesNotMatch(mapSource, /\.dropDestination\(for: String\.self\)/);
  assert.doesNotMatch(mapSource, /\.draggable\(criterion\.rawValue\)/);
  assert.match(mapSource, /commuteDisabled \? "Off" : "\\\(percentage\(for: criterion\)\)%"/);
  assert.match(mapSource, /knownCriteria: Set\(values\.keys\)/);
  assert.match(mapSource, /modelInsightScore/);
  assert.match(mapSource, /confidence >= 0\.55/);
  assert.match(mapSource, /Listing evidence/);
  assert.match(mapSource, /homeboard\.map-comparison-priorities/);
});

test("comparison uses tiered score regions and shows scored routes to work", () => {
  assert.match(mapSource, /private var savedListingKeys: Set<String>/);
  const comparisonFiltering = mapSource.slice(
    mapSource.indexOf("private func rebuildMapPresentation"),
    mapSource.indexOf("private var comparisonMetroRegion"),
  );
  assert.match(comparisonFiltering, /return filters\.includes\(item\.listing\)/);
  assert.doesNotMatch(comparisonFiltering, /comparisonMetroRegion\.contains/);
  assert.match(mapSource, /buildComparisonScores\(for: filtered\)/);
  assert.match(mapSource, /item\.hasReliableCoordinate,\s*commuteEvidence == nil/);
  assert.doesNotMatch(
    mapSource,
    /return \(!isComparisonActive \|\| savedListingKeys\.contains\(key\)\)/,
  );
  assert.match(mapSource, /item\.hasReliableCoordinate/);
  assert.match(mapSource, /MapCircle\(/);
  assert.match(mapSource, /ForEach\(displayedComparisonRouteCorridors\.filter/);
  assert.match(mapSource, /MapPolyline\(corridor\.polyline\)/);
  assert.match(mapSource, /ForEach\(selectedComparisonRouteCorridors\)/);
  assert.doesNotMatch(mapSource, /MapPolyline\(leg\.polyline\)/);
  assert.match(mapSource, /SharedRouteLegCallout/);
  assert.match(mapSource, /approximately \\\(leg\.minutes\) minutes/);
  assert.match(mapSource, /comparisonRouteColor\(for: corridor\)/);
  assert.match(
    mapSource,
    /comparisonScores\[item\.listing\.id\]\.map[\s\S]*?comparisonRegionTier\(for: \$0\.total\)\.color/,
  );
  assert.doesNotMatch(mapSource, /Each line matches its listing node/);
  assert.match(mapSource, /selectedComparisonRouteListingID == nil \? 0\.76 : 0\.46/);
  assert.match(mapSource, /selectedComparisonRouteListingID == nil \? 0\.76 : 0\.46/);
  assert.match(mapSource, /SharedComparisonCommuteCorridor/);
  assert.match(mapSource, /SharedWorkNodeMarker/);
  assert.match(mapSource, /people’s work/);
  assert.match(mapSource, /Additional commute point/);
  assert.match(mapSource, /for \\\(workNode\.memberNames\.joined/);
  assert.match(mapSource, /briefcase\.fill/);
  assert.match(mapSource, /SharedComparisonRegionTier/);
  assert.match(mapSource, /case best/);
  assert.match(mapSource, /case weak/);
  assert.match(mapSource, /comparisonRegionTier\(for: score\.total\)/);
  assert.match(mapSource, /homes · \\\(routedWorkMemberCount\) commute route/);
  assert.match(mapSource, /let routedIDs = Set\(primaryComparisonRouteCorridors\.map\(\\\.listingID\)\)/);
  assert.match(mapSource, /comparisonScores\[corridor\.listingID\] != nil/);
  assert.match(mapSource, /case tooClose/);
  assert.match(mapSource, /case ideal/);
  assert.match(mapSource, /case tooFar/);
  assert.doesNotMatch(mapSource, /MapPolygon\(/);
  assert.doesNotMatch(mapSource, /MKGeoJSONDecoder/);
  assert.doesNotMatch(mapSource, /comparisonRegionCells/);
  assert.match(mapSource, /let points = polyline\.points\(\)/);
  assert.match(mapSource, /MKPolyline\([\s\S]*coordinates: routeCoordinates/);
  assert.doesNotMatch(mapSource, /SharedRecommendedRegionMarker/);
  assert.doesNotMatch(mapSource, /SharedComparisonMapLegend/);
  assert.match(mapSource, /maximum - minimum >= 2/);
  assert.doesNotMatch(mapSource, /Save one more listing before Homeboard ranks areas/);
  assert.doesNotMatch(mapSource, /solid transit · dashed road/);
  assert.match(mapSource, /if !isComparisonActive \{[\s\S]*loadMapInventory/);
  assert.match(mapSource, /missing facts stay unknown/i);
  assert.match(mapSource, /suppressedLongRouteDestinations/);
  assert.match(mapSource, /if displayScore > 0/);
  assert.match(mapSource, /optimisticMetersPerMinute = 120\.0/);
});

test("route finding uses uniform solid paths, live fallbacks, and transport labels", () => {
  assert.match(mapSource, /transportType: \.transit/);
  assert.match(mapSource, /transportType: \.walking/);
  assert.match(mapSource, /transportType: \.automobile/);
  assert.match(mapSource, /pointsOfInterest: \.excludingAll/);
  assert.match(mapSource, /preferredMinutes: member\.preferredCommuteMinutes/);
  assert.match(mapSource, /maximumMinutes: member\.maxCommuteMinutes/);
  assert.match(mapSource, /commuteAccess: member\.commuteAccess/);
  assert.match(mapSource, /averageScore \* 0\.72 \+ worstScore \* 0\.28/);
  assert.match(mapSource, /let commuteEvidence = comparisonCommuteEvidence\[listing\.id\]/);
  assert.match(
    mapSource,
    /let commuteValue = comparisonWorkNodes\.isEmpty\s*\? nil\s*: commuteEvidence\?\.score/,
  );
  assert.match(mapSource, /SharedCommuteRouteLogic\.permits/);
  assert.match(mapSource, /easeAdjustedMinutes/);
  assert.match(mapSource, /stepCount: route\.steps\.count/);
  assert.match(mapSource, /access == nil \|\| access == "car" \|\| access == "flexible"/);
  assert.match(mapSource, /let eligibleRoutes = visibleRoutes\.filter/);
  assert.match(mapSource, /eligibleRoutes\.min\(by:/);
  assert.match(mapSource, /backgroundRouteModes\(for: target\.commuteAccess\)/);
  assert.match(mapSource, /return \[\.automobile, \.transit, \.walking\]/);
  assert.match(mapSource, /return \[\.transit, \.walking, \.automobile\]/);
  assert.doesNotMatch(mapSource, /transitRoute \?\? walkingRoute \?\? roadRoute/);
  assert.match(mapSource, /maximumMinutes: max\(maximum, preferred \+ 5\)/);
  assert.match(mapSource, /SharedComparisonNodeRouteCard/);
  assert.match(mapSource, /SharedCommuteMode\.allCases/);
  assert.match(mapSource, /Checking drive, transit, and walking times/);
  assert.match(mapSource, /Dismiss route details/);
  assert.match(mapSource, /Best usable route/);
  assert.match(mapSource, /route\.mode == \.walking && route\.minutes > 30/);
  assert.match(mapSource, /case \.automobile: 0/);
  assert.match(mapSource, /case \.transit: 1/);
  assert.match(mapSource, /case \.walking: 2/);
  assert.doesNotMatch(mapSource, /estimatedComparisonCommuteScore/);
  assert.doesNotMatch(mapSource, /estimatedRouteResult/);
  assert.doesNotMatch(mapSource, /usedEstimatedFallback|isEstimated/);
  assert.doesNotMatch(mapSource, /Estimated direct path/);
  assert.match(
    mapSource,
    /private var comparisonRouteStrokeStyle: StrokeStyle[\s\S]*?lineWidth: 2\.5/,
  );
  const renderedRoutes = mapSource.slice(
    mapSource.indexOf("ForEach(displayedComparisonRouteCorridors.filter"),
    mapSource.indexOf("ForEach(renderedClusters)", mapSource.indexOf("ForEach(displayedComparisonRouteCorridors.filter")),
  );
  assert.doesNotMatch(renderedRoutes, /lineWidth:|dash:|MapPolyline\(leg\.polyline\)/);
  assert.match(renderedRoutes, /style: comparisonRouteStrokeStyle/g);
  assert.match(mapSource, /SharedSelectedTransportPopup/);
  assert.match(mapSource, /routes: comparisonCommuteCorridors\.filter/);
  assert.match(mapSource, /private func comparisonRouteColor/);
  assert.match(mapSource, /inferredTransitKind/);
  assert.match(mapSource, /case \.bus: "bus\.fill"/);
  assert.match(mapSource, /case \.train: "tram\.fill"/);
  assert.match(mapSource, /case \.automobile: "car\.fill"/);
  assert.doesNotMatch(mapSource, /comparisonCommuteDistance/);
  assert.match(mapSource, /SharedComparisonNodeDetailSheet/);
  assert.match(mapSource, /Why it scored/);
  assert.match(mapSource, /Routes to work/);
  assert.match(mapSource, /requestsAlternateRoutes = false/);
  assert.match(mapSource, /comparisonRoutingSignature/);
  assert.match(mapSource, /batchSize = 3/);
  assert.match(mapSource, /SharedComparisonRouteCache\.shared\.value/);
  assert.match(mapSource, /comparison-routes-v1\.json/);
  assert.match(mapSource, /SharedComparisonRouteCachePayload: Codable/);
  assert.match(mapSource, /Data\(contentsOf: cacheURL\)/);
  assert.match(mapSource, /data\.write\(to: cacheURL, options: \.atomic\)/);
  assert.match(mapSource, /maximumAttempts = 3/);
  assert.match(mapSource, /Task\.sleep\(nanoseconds: delay\)/);
  assert.match(mapSource, /case \.terminalFailure:\s*return nil/);
  assert.match(mapSource, /case \.unknown, \.serverFailure, \.loadingThrottled:/);
  assert.match(mapSource, /routeLegResults/);
  assert.match(mapSource, /step\.transportType/);
  assert.match(mapSource, /step\.polyline/);
  assert.match(mapSource, /routingCompletedCount/);
  assert.match(mapSource, /requesting the rest/);
  assert.match(mapSource, /for target in targets/);
  assert.match(mapSource, /guard !memberScores\.isEmpty \|\| !routeSnapshots\.isEmpty/);
  assert.match(mapSource, /let resolvedEveryDestination = evaluatedDestinationCount == targets\.count/);
  assert.match(mapSource, /score = nil/);
  assert.match(mapSource, /displayedRouteIDs/);
  assert.match(mapSource, /Commute stays unscored until every destination resolves/);
  assert.match(mapSource, /queues live Apple routes for every listing and saved workplace/);

  const coordinateRecovery = mapSource.slice(
    mapSource.indexOf("private func resolveListingCoordinates"),
    mapSource.indexOf("private func resolveCommuteRoutes"),
  );
  assert.match(coordinateRecovery, /for listing in candidates/);
  assert.match(coordinateRecovery, /await resolveCoordinate\(for: query\)/);
  assert.doesNotMatch(coordinateRecovery, /shortlistedIDs|\.prefix\(/);
  const destinationRecovery = mapSource.slice(
    mapSource.indexOf("private func resolveCoordinate(for destination: String)"),
    mapSource.indexOf("\n}", mapSource.indexOf("private func resolveCoordinate(for destination: String)")),
  );
  assert.match(destinationRecovery, /for attempt in 0\.\.<3/);

  const comparisonRouting = mapSource.slice(
    mapSource.indexOf("private static func comparisonCommuteEvidence"),
    mapSource.indexOf("private func filterCardsToCluster"),
  );
  const routeBatching = mapSource.slice(
    mapSource.indexOf("private func resolveComparisonCommuteEvidence"),
    mapSource.indexOf("private static func comparisonCommuteEvidence"),
  );
  assert.match(comparisonRouting, /\.automobile/);
  assert.doesNotMatch(comparisonRouting, /route\.minutes > 30/);
  assert.match(comparisonRouting, /let directDistance = CLLocation/);
  assert.match(comparisonRouting, /impossible best case scores zero/);
  assert.match(routeBatching, /for start in stride\(from: 0, to: pendingCandidates\.count/);
  assert.doesNotMatch(routeBatching, /candidates\.prefix/);
  assert.match(routeBatching, /comparisonEvidenceSignatures/);
  assert.match(routeBatching, /nextSignatures\[item\.listing\.id\] != signatures\[item\.listing\.id\]/);
  assert.doesNotMatch(
    mapSource.slice(
      mapSource.indexOf("private var comparisonRoutingSignature"),
      mapSource.indexOf("var body: some View"),
    ),
    /filters\.|selectedBounds/,
  );
  assert.match(mobilePayloadSource, /min driving estimate/);
  assert.doesNotMatch(mobilePayloadSource, /min best route/);
});

test("commute controls disable without a saved office area and explain the privacy-safe option", () => {
  assert.match(mapSource, /commuteAvailable: hasCommuteDestinations/);
  assert.match(mapSource, /criterion == \.commute && !commuteAvailable/);
  assert.match(mapSource, /disabled: rank == 1 \|\| commuteDisabled/);
  assert.match(mapSource, /disabled: rank == 4 \|\| commuteDisabled/);
  assert.doesNotMatch(mapSource, /Commute unavailable/);
  assert.match(mapSource, /Add an office neighborhood to enable commute grading/);
  assert.match(mapSource, /Weights are normalized to 100% without commute/);
});

test("comparison mode elevates top homes and keeps scores in Cards", () => {
  assert.match(mapSource, /private var topComparisonListingIDs: Set<String>/);
  assert.match(mapSource, /\.prefix\(5\)/);
  assert.match(mapSource, /priorityListingIDs: topComparisonListingIDs/);
  assert.match(mapSource, /let priorityItems = items\.filter/);
  assert.match(mapSource, /return clusters \+ priorityItems\.map \{ expanded\(\$0\) \}/);
  assert.match(mapSource, /isHighlighted: topComparisonListingIDs\.contains/);
  assert.match(mapSource, /One of the five highest comparison scores/);
  assert.match(mapSource, /return leftScore > rightScore/);
  assert.match(mapSource, /SharedComparisonScoreArtwork/);
  assert.match(mapSource, /Label\("TOP MATCH", systemImage: "sparkles"\)/);
  assert.match(mapSource, /comparisonScores: isComparisonActive \? comparisonScores : \[:\]/);
  assert.doesNotMatch(
    mapSource,
    /else if presentation == \.list \{\s*isComparisonActive = false/,
  );
  assert.match(mapSource, /SharedGroupCommuteComparisonButton/);
  assert.match(mapSource, /Label\("Compare group commutes", systemImage: "arrow\.triangle\.branch"\)/);
  const topControlBar = mapSource.slice(
    mapSource.indexOf("private struct SharedSearchControlBar"),
    mapSource.indexOf("private struct SharedGroupCommuteComparisonButton"),
  );
  assert.doesNotMatch(topControlBar, /onCompare|Compare map|Text\("Compare"\)/);
  assert.doesNotMatch(mapSource, /Label\("Priorities"/);
});

test("tapping a map cluster prepares Cards without leaving the map or hiding other nodes", () => {
  assert.match(mapSource, /@State private var cardClusterListingIDs: Set<String> = \[\]/);
  assert.match(mapSource, /filterCardsToCluster\(cluster\)/);
  assert.match(mapSource, /let selectedIDs = Set\(cluster\.items\.map \{ \$0\.listing\.id \}\)/);
  assert.match(mapSource, /selectedIDs == cardClusterListingIDs \? \[\] : selectedIDs/);
  assert.match(mapSource, /private var visibleCardItems/);
  assert.match(mapSource, /private var displayedResultCount: Int \{\s*visibleCardItems\.count/);
  assert.match(mapSource, /displayedComparisonScoreCount/);
  assert.match(mapSource, /intersection\(cardClusterListingIDs\)/);
  assert.match(mapSource, /filters\.activeCount \+ \(cardClusterListingIDs\.isEmpty \? 0 : 1\)/);
  assert.match(mapSource, /SharedClusterCardFilterBar/);
  assert.match(mapSource, /Filtered to selected cluster · \\\(count\)/);
  assert.doesNotMatch(mapSource, /Text\("Show all"\)/);
  assert.match(mapSource, /Clear selected cluster filter/);
  assert.match(mapSource, /isSelected: Set\(cluster\.items\.map/);
  const clusterSelection = mapSource.slice(
    mapSource.indexOf("private func filterCardsToCluster"),
    mapSource.indexOf("private func loadMapInventory"),
  );
  assert.doesNotMatch(clusterSelection, /presentation = \.list/);
  assert.doesNotMatch(
    mapSource,
    /if presentation == \.map \{\s*cardClusterListingIDs = \[\]/,
  );
});

test("commute preference is a persisted two-handle equal-score band", () => {
  assert.match(paletteSource, /struct HomeboardCommuteRangeControl/);
  assert.match(paletteSource, /@Binding var minimumMinutes: Int/);
  assert.match(paletteSource, /@Binding var maximumMinutes: Int/);
  assert.match(paletteSource, /case minimum/);
  assert.match(paletteSource, /case maximum/);
  assert.match(paletteSource, /FULL SCORE/);
  assert.match(mapSource, /if \(minimum\.\.\.maximum\)\.contains\(minutes\)/);
  assert.match(mapSource, /return 100/);
  assert.match(mapSource, /minutes < minimum/);
  assert.match(boardDataSource, /preferredCommuteMinutes: finalizedProfile\.minCommuteMinutes/);
});

test("comparison keeps its city fallback but frames and scores listings outside that metro", () => {
  assert.match(mapSource, /TextField\("City or metro area"/);
  assert.match(mapSource, /homeboard\.map-comparison-city/);
  assert.match(mapSource, /private var comparisonMetroRegion: MKCoordinateRegion/);
  assert.match(mapSource, /latitudeDelta: 1\.0, longitudeDelta: 1\.18/);
  assert.match(mapSource, /private var comparisonFocusRegion: MKCoordinateRegion/);
  assert.match(mapSource, /preparedMapItems\.map\(\\\.coordinate\)[\s\S]*comparisonWorkNodes\.map\(\\\.coordinate\)/);
  assert.match(mapSource, /let candidates = preparedMapItems\.filter\(\\\.hasReliableCoordinate\)/);
  assert.match(mapSource, /resolveComparisonCity\(focus: true\)/);
});

test("space comparison preserves square footage across the mobile data path", () => {
  assert.match(listingModelSource, /var squareFeet: Int\?/);
  assert.match(mobilePayloadSource, /squareFeet: number \| null/);
  assert.match(mobilePayloadSource, /squareFeet: listing\.squareFeet/);
  assert.match(
    mobileListingRouteSource,
    /squareFeet: z\.number\(\)\.int\(\)\.positive\(\)/,
  );
  assert.match(mapSource, /if let squareFeet = listing\.squareFeet/);
});

test("listing titles and verified addresses stay separate through scanning and map geocoding", () => {
  assert.match(listingModelSource, /var address: String = ""/);
  assert.match(mobilePayloadSource, /address: listing\.address \?\? ""/);
  assert.match(mobilePayloadSource, /homeboardListingTitle/);
  assert.match(mobileListingRouteSource, /address: z\.string\(\)\.trim\(\)\.max\(300\)/);
  assert.match(mapSource, /SharedListingLocation\.geocodingQuery\(for: listing\)/);
  assert.match(mapSource, /return verifiedAddress/);
  assert.doesNotMatch(
    mapSource,
    /\[listing\.title, listing\.location, appModel\.board\.city\]/,
  );
});

test("captured listing photos survive the mobile payload and render with a graceful fallback", () => {
  assert.match(mobilePayloadSource, /function listingPhotoUrl/);
  assert.match(mobilePayloadSource, /photoUrl: listingPhotoUrl\(listing\)/);
  assert.match(mobilePayloadSource, /photoUrl: listingPhotoUrl\(entry\.listing\)/);
  assert.match(mapSource, /let value = listing\.photoURL\.trimmingCharacters/);
  assert.match(mapSource, /AsyncImage\(/);
  assert.match(mapSource, /case \.success\(let image\):[\s\S]*?\.scaledToFill\(\)/);
  assert.match(mapSource, /case \.failure:[\s\S]*?placeholderArtwork/);
  assert.match(boardDataSource, /const capturedImageUrl = input\.imageUrl\?\.trim\(\)/);
  assert.match(boardDataSource, /capturedImageUrl \? \{ images: json\(\[capturedImageUrl\]\) \} : \{\}/);
});
