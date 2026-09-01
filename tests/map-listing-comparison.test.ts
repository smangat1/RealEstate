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

test("empty listing states send users to rental sources before manual entry", () => {
  assert.match(mapSource, /struct SharedListingDiscoverySheet/);
  assert.match(mapSource, /Search wherever you already look/);
  assert.match(mapSource, /use Share → Homeboard/);
  assert.match(mapSource, /Button\("Find listings", action: onBrowse\)/);
  assert.match(mapSource, /Add an offline listing/);
  assert.match(mapSource, /Last resort for a place with no listing page/);
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
  assert.match(mapSource, /Replay all page guides\?/);
  assert.match(mapSource, /Button\("Replay guides"\)/);
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
  assert.match(mapSource, /Text\("\\\(percentage\(for: criterion\)\)%"\)/);
  assert.match(mapSource, /knownCriteria: Set\(values\.keys\)/);
  assert.match(mapSource, /modelInsightScore/);
  assert.match(mapSource, /confidence >= 0\.55/);
  assert.match(mapSource, /Listing evidence/);
  assert.match(mapSource, /homeboard\.map-comparison-priorities/);
});

test("comparison uses tiered score regions and shows scored routes to work", () => {
  assert.match(mapSource, /private var savedListingKeys: Set<String>/);
  assert.match(
    mapSource,
    /return \(!isComparisonActive \|\| item\.hasReliableCoordinate\)/,
  );
  assert.doesNotMatch(
    mapSource,
    /return \(!isComparisonActive \|\| savedListingKeys\.contains\(key\)\)/,
  );
  assert.match(mapSource, /item\.hasReliableCoordinate/);
  assert.match(mapSource, /MapCircle\(/);
  assert.match(mapSource, /ForEach\(displayedComparisonRouteCorridors\)/);
  assert.match(mapSource, /MapPolyline\(corridor\.polyline\)/);
  assert.match(mapSource, /comparisonListingColor\(for: corridor\.listingID\)/);
  assert.match(mapSource, /comparisonListingColor\(for: item\.listing\.id\)/);
  assert.match(mapSource, /Each line matches its listing node/);
  assert.match(mapSource, /selectedComparisonRouteListingID == nil \? 0\.76 : 0\.46/);
  assert.match(mapSource, /corridor\.listingID == selectedComparisonRouteListingID/);
  assert.match(mapSource, /SharedComparisonCommuteCorridor/);
  assert.match(mapSource, /SharedWorkNodeMarker/);
  assert.match(mapSource, /Text\("Work"\)/);
  assert.match(mapSource, /briefcase\.fill/);
  assert.match(mapSource, /SharedComparisonRegionTier/);
  assert.match(mapSource, /case best/);
  assert.match(mapSource, /case weak/);
  assert.match(mapSource, /comparisonRegionTier\(for: score\.total\)/);
  assert.match(mapSource, /Text\("\\\(routedListingCount\)\/\\\(listingCount\) routed"\)/);
  assert.match(mapSource, /Set\(scoredComparisonRouteCorridors\.map\(\\\.listingID\)\)\.count/);
  assert.match(mapSource, /comparisonScores\[corridor\.listingID\] != nil/);
  assert.match(mapSource, /case tooClose/);
  assert.match(mapSource, /case ideal/);
  assert.match(mapSource, /case tooFar/);
  assert.doesNotMatch(mapSource, /MapPolygon\(/);
  assert.doesNotMatch(mapSource, /MKGeoJSONDecoder/);
  assert.doesNotMatch(mapSource, /comparisonRegionCells/);
  assert.match(mapSource, /route\.polyline\.points\(\)/);
  assert.match(mapSource, /MKPolyline\([\s\S]*coordinates: routeCoordinates/);
  assert.doesNotMatch(mapSource, /SharedRecommendedRegionMarker/);
  assert.doesNotMatch(mapSource, /SharedComparisonMapLegend/);
  assert.match(mapSource, /maximum - minimum >= 2/);
  assert.doesNotMatch(mapSource, /Save one more listing before Homeboard ranks areas/);
  assert.doesNotMatch(mapSource, /solid transit · dashed road/);
  assert.match(mapSource, /if !isComparisonActive \{[\s\S]*loadMapInventory/);
  assert.match(mapSource, /missing facts stay unknown/i);
});

test("node route cards load drive, transit, and walk times on demand", () => {
  assert.match(mapSource, /transportType: \.transit/);
  assert.match(mapSource, /transportType: \.walking/);
  assert.match(mapSource, /transportType: \.automobile/);
  assert.match(mapSource, /pointsOfInterest: \.excludingAll/);
  assert.match(mapSource, /preferredMinutes: member\.preferredCommuteMinutes/);
  assert.match(mapSource, /maximumMinutes: member\.maxCommuteMinutes/);
  assert.match(mapSource, /commuteAccess: member\.commuteAccess/);
  assert.match(mapSource, /averageScore \* 0\.72 \+ worstScore \* 0\.28/);
  assert.match(mapSource, /let commuteEvidence = comparisonCommuteEvidence\[listing\.id\]/);
  assert.match(mapSource, /let commuteValue = comparisonWorkNodes\.isEmpty/);
  assert.match(mapSource, /: commuteEvidence\?\.score/);
  assert.match(mapSource, /SharedCommuteRouteLogic\.permits/);
  assert.match(mapSource, /easeAdjustedMinutes/);
  assert.match(mapSource, /stepCount: route\.steps\.count/);
  assert.match(mapSource, /access == "car" \|\| access == "flexible"/);
  assert.match(mapSource, /let eligibleRoutes = visibleRoutes\.filter/);
  assert.match(mapSource, /eligibleRoutes\.min\(by:/);
  assert.match(mapSource, /directDistance <= 3_200/);
  assert.match(mapSource, /walkingCandidate\.flatMap \{ \$0\.minutes <= 30/);
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
  assert.match(mapSource, /No usable live route was returned, so commute remains unscored/);
  assert.doesNotMatch(mapSource, /comparisonCommuteDistance/);
  assert.match(mapSource, /SharedComparisonNodeDetailSheet/);
  assert.match(mapSource, /Why it scored/);
  assert.match(mapSource, /Routes to work/);
  assert.match(mapSource, /requestsAlternateRoutes = false/);
  assert.match(mapSource, /comparisonRoutingSignature/);
  assert.match(mapSource, /batchSize = 3/);

  const comparisonRouting = mapSource.slice(
    mapSource.indexOf("private static func comparisonCommuteEvidence"),
    mapSource.indexOf("private func zoomIntoCluster"),
  );
  assert.match(comparisonRouting, /\.automobile/);
  assert.match(mobilePayloadSource, /min driving estimate/);
  assert.doesNotMatch(mobilePayloadSource, /min best route/);
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

test("comparison selects a city metro and includes its surrounding region", () => {
  assert.match(mapSource, /TextField\("City or metro area"/);
  assert.match(mapSource, /homeboard\.map-comparison-city/);
  assert.match(mapSource, /private var comparisonMetroRegion: MKCoordinateRegion/);
  assert.match(mapSource, /latitudeDelta: 1\.0, longitudeDelta: 1\.18/);
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
