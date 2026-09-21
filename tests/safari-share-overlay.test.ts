import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const preprocessorSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardShareExtension/SharePreprocessor.js",
  ),
  "utf8",
);

const shareExtensionInfoPlist = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardShareExtension/Info.plist",
  ),
  "utf8",
).replace(/\s+/g, "");

const actionExtensionInfoPlist = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardActionExtension/Info.plist",
  ),
  "utf8",
).replace(/\s+/g, "");

const shareViewControllerSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardShareExtension/ShareViewController.swift",
  ),
  "utf8",
);

const compactShareViewControllerSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardShareExtension/CompactShareViewController.swift",
  ),
  "utf8",
);

const shareBootProbeSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardShareExtension/ShareBootProbe.m",
  ),
  "utf8",
);

const listingIntelligenceSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Shared/HomeboardListingIntelligence.swift",
  ),
  "utf8",
);

const extensionSyncSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Shared/HomeboardExtensionSync.swift",
  ),
  "utf8",
);

const sharedImportStoreSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Shared/HomeboardSharedImportStore.swift",
  ),
  "utf8",
);

const sharedWorkspaceSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift",
  ),
  "utf8",
);

const appModelSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift",
  ),
  "utf8",
);

const safariHandlerSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardSafariExtension/SafariWebExtensionHandler.swift",
  ),
  "utf8",
);

const safariContentSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardSafariExtension/Resources/content.js",
  ),
  "utf8",
);

const macAppSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardMac/HomeboardMacApp.swift",
  ),
  "utf8",
);

const mobileListingRouteSource = readFileSync(
  resolve(
    process.cwd(),
    "app/api/mobile/boards/[id]/listings/route.ts",
  ),
  "utf8",
);

const boardDataSource = readFileSync(
  resolve(process.cwd(), "lib/board-data.ts"),
  "utf8",
);

const xcodeProjectSpec = readFileSync(
  resolve(process.cwd(), "ios/HomeboardNative/project.yml"),
  "utf8",
);

const xcodeProjectSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative.xcodeproj/project.pbxproj",
  ),
  "utf8",
);

test("mobile Safari Share hands back to a sentence-following page scan", () => {
  assert.match(preprocessorSource, /safariPageCapture:\s*true/);
  assert.match(preprocessorSource, /secondaryPageEvidence/);
  assert.match(preprocessorSource, /__homeboardStartSharePageScan/);
  assert.match(preprocessorSource, /Following/);
  assert.match(preprocessorSource, /touchmove/);
  assert.match(preprocessorSource, /Taking one quick second look/);
  assert.match(preprocessorSource, /Still missing:/);
  assert.match(preprocessorSource, /Review details/);
  assert.match(preprocessorSource, /const propertyListValue =/);
  assert.match(preprocessorSource, /latitude: coordinate\?\.latitude/);
  assert.match(preprocessorSource, /longitude: coordinate\?\.longitude/);
  assert.match(preprocessorSource, /node\.location\?\.geo/);
  assert.match(preprocessorSource, /completionFunction\(result\)/);
  assert.match(preprocessorSource, /og:image:secure_url/);
  assert.match(preprocessorSource, /twitter:image/);
  assert.match(preprocessorSource, /link\[rel~="image_src"\]/);
  assert.match(preprocessorSource, /structuredImageURL\(best\(\["image"/);
  assert.match(preprocessorSource, /visibleListingImageURL/);
  assert.match(preprocessorSource, /data-testid\*="gallery"/);
  assert.match(preprocessorSource, /image\.naturalWidth \|\| rect\.width/);
  assert.match(
    preprocessorSource,
    /HomeboardSharePreprocessor\.prototype\.finalize/,
  );
});

test("the iPhone scanner preserves Safari's preview image through later model analysis", () => {
  assert.match(shareViewControllerSource, /meta\('og:image:secure_url'\)/);
  assert.match(shareViewControllerSource, /meta\('twitter:image'\)/);
  assert.match(
    shareViewControllerSource,
    /if let imageURL = facts\.imageURL\?\.trimmingCharacters[\s\S]*?extractedValues\["imageURL"\] = imageURL/,
  );
  assert.doesNotMatch(
    shareViewControllerSource,
    /extractedValues\["imageURL"\] = facts\.imageURL/,
  );
});

test("the share window follows branded sentence highlights and skips recommendation cards", () => {
  assert.match(shareViewControllerSource, /runHighlightedPageScan/);
  assert.match(shareViewControllerSource, /scrollIntoView/);
  assert.match(shareViewControllerSource, /HOMEBOARD · Reading/);
  assert.match(shareViewControllerSource, /similar homes\|similar listings/);
  assert.match(shareViewControllerSource, /nearby homes\|nearby rentals/);
  assert.match(shareViewControllerSource, /webView\.scrollView\.isScrollEnabled = false/);
  assert.match(shareViewControllerSource, /Capturing a stable snapshot/);
  assert.match(shareViewControllerSource, /Still missing:/);
  assert.match(shareViewControllerSource, /scan\.overlay\?\.replaceChildren/);
  assert.match(shareViewControllerSource, /latitude: number\("latitude"\)/);
  assert.match(shareViewControllerSource, /longitude: number\("longitude"\)/);

  const preprocessedFlow = shareViewControllerSource.slice(
    shareViewControllerSource.indexOf(
      "private func openPreprocessedSafariPage",
    ),
    shareViewControllerSource.indexOf("private func openSharedPage"),
  );
  assert.match(preprocessedFlow, /openSharedPage\(\)/);
  assert.doesNotMatch(preprocessedFlow, /completeShareRequest/);
});

test("the mobile share workflow uses the neutral Homeboard palette", () => {
  assert.match(shareViewControllerSource, /HomeboardSharePalette/);
  assert.match(shareViewControllerSource, /static let background = UIColor\(red: 61 \/ 255, green: 80 \/ 255, blue: 74 \/ 255/);
  assert.match(shareViewControllerSource, /static let accent = UIColor\(red: 249 \/ 255, green: 226 \/ 255, blue: 205 \/ 255/);
  assert.match(preprocessorSource, /#F9E2CD/i);
  assert.doesNotMatch(
    preprocessorSource,
    /#(?:8addff|4a8ff5|76c8f5|0c1017)|74,\s*143,\s*245|138,\s*221,\s*255|12,\s*16,\s*23/i,
  );
});

test("the on-device model uses frozen evidence independently from the animation", () => {
  assert.match(shareViewControllerSource, /let frozenValues = extractedValues/);
  assert.match(shareViewControllerSource, /modelAnalysisTask = Task/);
  assert.match(shareViewControllerSource, /highlightAnimationTask = Task/);
  assert.match(shareViewControllerSource, /allowSystemModel: true/);
  assert.match(shareViewControllerSource, /On-device model assisted/);

  const animationFlow = shareViewControllerSource.slice(
    shareViewControllerSource.indexOf(
      "private func animatePageHighlights",
    ),
    shareViewControllerSource.indexOf(
      "private func installPageHighlightScanner",
    ),
  );
  assert.doesNotMatch(animationFlow, /absorbEvidence/);
  assert.doesNotMatch(animationFlow, /extractedValues/);

  assert.match(listingIntelligenceSource, /modelPlan\.shouldRun/);
  assert.match(listingIntelligenceSource, /systemModelResolutionPlan/);
  assert.match(listingIntelligenceSource, /resolutionFields/);
  assert.match(
    listingIntelligenceSource,
    /Resolve only these missing or conflicting fields/,
  );
});

test("iOS Share admits every nonempty host share item and validates its URL in Swift", () => {
  assert.match(
    shareExtensionInfoPlist,
    /NSExtensionActivationRule<\/key>[\s\S]*?<string>\$\(HOMEBOARD_EXTENSION_ACTIVATION_RULE\)<\/string>/,
  );
  assert.doesNotMatch(shareExtensionInfoPlist, /TRUEPREDICATE/);
  assert.match(
    xcodeProjectSpec,
    /HomeboardShareExtension:[\s\S]*?HOMEBOARD_EXTENSION_ACTIVATION_RULE:\s*"extensionItems\.@count > 0"[\s\S]*?Debug:[\s\S]*?HOMEBOARD_EXTENSION_ACTIVATION_RULE:\s*TRUEPREDICATE/,
  );
  assert.match(
    shareExtensionInfoPlist,
    /NSExtensionJavaScriptPreprocessingFile<\/key><string>SharePreprocessor<\/string>/,
  );
  assert.match(xcodeProjectSpec, /HomeboardShareExtension\/SharePreprocessor\.js[\s\S]*?buildPhase: resources/);
  assert.match(xcodeProjectSource, /SharePreprocessor\.js in Resources/);
  assert.match(compactShareViewControllerSource, /import LinkPresentation/);
  assert.match(compactShareViewControllerSource, /com\.apple\.linkpresentation\.metadata/);
  assert.match(compactShareViewControllerSource, /item as\? LPLinkMetadata/);
  assert.match(compactShareViewControllerSource, /metadata\.originalURL/);
  assert.match(compactShareViewControllerSource, /validatedWebURL/);
  assert.match(compactShareViewControllerSource, /Homeboard needs the listing link from this app/);
  assert.match(shareViewControllerSource, /private func startAutomaticPageScan\(\)/);
  assert.match(shareViewControllerSource, /scan\.automaticStarted/);
  assert.match(shareViewControllerSource, /await self\.runHighlightedPageScan\(\)/);
  assert.match(shareViewControllerSource, /await self\.quickScanPage\(\)/);

  const navigationFinishedFlow = shareViewControllerSource.slice(
    shareViewControllerSource.indexOf("func webView(_ webView: WKWebView, didFinish"),
    shareViewControllerSource.indexOf("didFailProvisionalNavigation"),
  );
  assert.match(navigationFinishedFlow, /startAutomaticPageScan\(\)/);
});

test("native apps also expose Homeboard in the vertical Edit Actions list", () => {
  assert.match(
    actionExtensionInfoPlist,
    /NSExtensionPointIdentifier<\/key><string>com\.apple\.ui-services<\/string>/,
  );
  assert.match(
    actionExtensionInfoPlist,
    /NSExtensionPrincipalClass<\/key><string>\$\(PRODUCT_MODULE_NAME\)\.CompactShareViewController<\/string>/,
  );
  assert.match(
    actionExtensionInfoPlist,
    /NSExtensionActivationRule<\/key><string>\$\(HOMEBOARD_EXTENSION_ACTIVATION_RULE\)<\/string>/,
  );
  assert.match(
    xcodeProjectSpec,
    /HomeboardNative:[\s\S]*?dependencies:[\s\S]*?- target: HomeboardActionExtension/,
  );
  assert.match(
    xcodeProjectSpec,
    /HomeboardActionExtension:[\s\S]*?PRODUCT_BUNDLE_IDENTIFIER:\s*com\.homeboard\.native\.action[\s\S]*?Debug:[\s\S]*?HOMEBOARD_EXTENSION_ACTIVATION_RULE:\s*TRUEPREDICATE/,
  );
  assert.match(
    xcodeProjectSource,
    /HomeboardActionExtension\.appex in Embed Foundation Extensions/,
  );
});

test("share diagnostics identify failures before Swift or the controller starts", () => {
  assert.match(shareBootProbeSource, /__attribute__\(\(constructor\)\)/);
  assert.match(shareBootProbeSource, /binary\.constructor/);
  assert.match(shareBootProbeSource, /group\.com\.homeboard\.native/);
  assert.match(shareBootProbeSource, /homeboard-share-boot-v1\.log/);
  assert.match(xcodeProjectSpec, /HomeboardShareExtension\/ShareBootProbe\.m/);
  assert.match(
    xcodeProjectSpec,
    /HomeboardShareExtension:[\s\S]*?configs:[\s\S]*?Debug:[\s\S]*?ENABLE_DEBUG_DYLIB: NO/,
  );

  assert.match(sharedImportStoreSource, /enum HomeboardShareBootDiagnosticStore/);
  assert.match(sharedImportStoreSource, /static func entries\(\) -> \[HomeboardShareBootEntry\]/);
  assert.match(shareViewControllerSource, /controller\.init\.nib/);
  assert.match(shareViewControllerSource, /controller\.init\.coder/);
  assert.match(shareViewControllerSource, /controller\.loadView\.begin/);
  assert.match(shareViewControllerSource, /controller\.firstFrame\.ready/);
  assert.match(shareViewControllerSource, /payload\.loadStarted/);
  assert.match(shareViewControllerSource, /payload\.deadlineReached/);
  assert.match(shareViewControllerSource, /payload\.preprocessorReport/);

  assert.match(sharedImportStoreSource, /HomeboardShareReportDiagnostics/);
  assert.doesNotMatch(sharedWorkspaceSource, /Share diagnostics|Low-level boot trail/);
});

test("share diagnostics have no tester-facing refresh or copy controls", () => {
  assert.doesNotMatch(sharedWorkspaceSource, /Refresh trace|lastRefreshedAt/);
  assert.doesNotMatch(sharedWorkspaceSource, /Copy full trace|screenshot this page/);
});

test("the mobile share window launches the compact pill controller", () => {
  const launchFlow = shareViewControllerSource.slice(
    shareViewControllerSource.indexOf("override func viewDidLoad"),
    shareViewControllerSource.indexOf("deinit"),
  );
  assert.match(launchFlow, /showInteractiveInterface\(\)/);
  assert.match(launchFlow, /override func viewDidAppear/);
  assert.match(launchFlow, /hasStartedShareFlow/);
  assert.match(shareViewControllerSource, /sharedPayloadDeadline/);
  assert.doesNotMatch(launchFlow, /HomeboardSharedAuthStore\.load/);
  assert.doesNotMatch(shareViewControllerSource, /class ShareEntryViewController/);
  assert.match(
    shareExtensionInfoPlist,
    /NSExtensionPrincipalClass<\/key><string>\$\(PRODUCT_MODULE_NAME\)\.CompactShareViewController/,
  );
  assert.match(
    shareViewControllerSource,
    /else if[\s\S]*let sharedURL[\s\S]*openSharedPage\(\)/,
  );
  assert.match(
    xcodeProjectSpec,
    /SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD:\s*NO/,
  );
});

test("native-app Zillow shares reveal exact units while the model confirms each field", () => {
  assert.match(compactShareViewControllerSource, /NSCollectionLayoutGroup\.vertical/);
  assert.doesNotMatch(compactShareViewControllerSource, /groupPagingCentered/);
  assert.match(compactShareViewControllerSource, /showsVerticalScrollIndicator = true/);
  assert.match(compactShareViewControllerSource, /choicesBottomConstraint/);
  assert.match(
    compactShareViewControllerSource,
    /choicesContainer\.bottomAnchor\.constraint\([\s\S]*?equalTo: view\.safeAreaLayoutGuide\.bottomAnchor/,
  );
  assert.doesNotMatch(compactShareViewControllerSource, /visibleRows \* 94/);
  assert.doesNotMatch(compactShareViewControllerSource, /choicesHeightConstraint/);
  assert.match(compactShareViewControllerSource, /height: 720/);
  assert.match(compactShareViewControllerSource, /case edit/);
  assert.match(compactShareViewControllerSource, /Edit details/);
  assert.match(compactShareViewControllerSource, /Fix or add anything Homeboard missed/);
  assert.match(compactShareViewControllerSource, /SharePreprocessor/);
  assert.match(compactShareViewControllerSource, /analyzeWithOneRescan/);
  assert.match(compactShareViewControllerSource, /HomeboardListingSavePipeline\.enqueue\(pending\)/);
  assert.match(compactShareViewControllerSource, /deadline: \.now\(\) \+ 0\.9/);
  assert.match(compactShareViewControllerSource, /webView\.stopLoading\(\)/);
  assert.match(compactShareViewControllerSource, /webView\.navigationDelegate = nil/);
  assert.match(compactShareViewControllerSource, /completeRequest\(returningItems: \[\]/);
  assert.match(compactShareViewControllerSource, /completeRequest\(\)/);
  assert.doesNotMatch(compactShareViewControllerSource, /browserContainer/);

  const payloadFlow = compactShareViewControllerSource.slice(
    compactShareViewControllerSource.indexOf("private func loadSharedPayload"),
    compactShareViewControllerSource.indexOf("private func readableTypeIdentifiers"),
  );
  assert.match(payloadFlow, /payload\.url != nil \|\| payload\.preprocessedValues != nil/);
  assert.match(payloadFlow, /deadline: \.now\(\) \+ 0\.12/);

  const extractionFlow = compactShareViewControllerSource.slice(
    compactShareViewControllerSource.indexOf("private func extractLoadedPage"),
    compactShareViewControllerSource.indexOf("private func evaluatePageExtraction"),
  );
  assert.doesNotMatch(extractionFlow, /milliseconds\(550\)/);
  assert.match(extractionFlow, /milliseconds\(350\)/);

  const analysisFlow = compactShareViewControllerSource.slice(
    compactShareViewControllerSource.indexOf("private func beginAnalysis"),
    compactShareViewControllerSource.indexOf("private func show("),
  );
  assert.doesNotMatch(analysisFlow, /allowSystemModel: false/);
  assert.match(analysisFlow, /allowSystemModel: true/);

  assert.match(compactShareViewControllerSource, /CompactZillowSnapshotLoader\.load/);
  assert.match(compactShareViewControllerSource, /URLSession\.shared\.data\(for: request\)/);
  assert.match(compactShareViewControllerSource, /__NEXT_DATA__/);
  assert.match(compactShareViewControllerSource, /rentalUnitsSummary/);
  assert.match(compactShareViewControllerSource, /options\.count != declaredCount/);
  assert.match(compactShareViewControllerSource, /hasStartedModelAnalysis/);
  assert.match(compactShareViewControllerSource, /previewImageURL\(in: html, relativeTo: url\)/);
  assert.match(compactShareViewControllerSource, /og:image/);
  assert.match(compactShareViewControllerSource, /twitter:image/);
  assert.match(compactShareViewControllerSource, /image_src/);
  const snapshotFlow = compactShareViewControllerSource.slice(
    compactShareViewControllerSource.indexOf("private func startFastZillowSnapshot"),
    compactShareViewControllerSource.indexOf("private func extractLoadedPage"),
  );
  assert.ok(
    snapshotFlow.indexOf("showPendingSnapshot(snapshot)")
      < snapshotFlow.indexOf("beginAnalysis("),
  );
  assert.match(snapshotFlow, /if snapshot\.values\["imageURL"\] != nil/);
  assert.match(snapshotFlow, /Confirming the homes and photo/);

  assert.match(extractionFlow, /var values = self\.extractedValues/);
  assert.match(extractionFlow, /let firstImageURL = best\?\["imageURL"\]/);
  assert.match(extractionFlow, /firstImageURL \?\? second\["imageURL"\]/);
  assert.match(extractionFlow, /snapshotUnitKeys/);
  assert.match(extractionFlow, /values\[key\] = value/);

  const pendingChoicesFlow = compactShareViewControllerSource.slice(
    compactShareViewControllerSource.indexOf("private func showPendingSnapshot"),
    compactShareViewControllerSource.indexOf("private func show(_ analysis"),
  );
  assert.match(pendingChoicesFlow, /pendingImport: nil/);
  assert.match(pendingChoicesFlow, /isConfirmed: false/);
  assert.match(pendingChoicesFlow, /Confirming \\\(snapshot\.unitCount\) homes/);

  assert.match(compactShareViewControllerSource, /loadingFieldsStack/);
  assert.match(compactShareViewControllerSource, /bedroomsLoadingView/);
  assert.match(compactShareViewControllerSource, /bathroomsLoadingView/);
  assert.match(compactShareViewControllerSource, /squareFeetLoadingView/);
  assert.match(compactShareViewControllerSource, /priceLoadingView/);
  assert.match(compactShareViewControllerSource, /if isLoading \{[\s\S]*loadingView\.startAnimating/);
  assert.match(
    compactShareViewControllerSource,
    /guard choice\.isConfirmed, let pendingImport = choice\.pendingImport/,
  );
  assert.match(
    safariContentSource,
    /allowSystemModel: visualTracking \|\| mobilePillPicker/,
  );

  const compactSaveFlow = compactShareViewControllerSource.slice(
    compactShareViewControllerSource.indexOf("private func save(_ pending:"),
    compactShareViewControllerSource.indexOf("private func showSaved"),
  );
  assert.doesNotMatch(compactSaveFlow, /HomeboardExtensionSyncClient/);
  assert.ok(
    compactSaveFlow.indexOf("HomeboardListingSavePipeline.enqueue(pending)")
      < compactSaveFlow.indexOf('self.showSaved(message: "Saved to Homeboard")'),
  );
});

test("the compact chooser keeps bottom spacing inside its scrollable content", () => {
  const chooserLayout = compactShareViewControllerSource.slice(
    compactShareViewControllerSource.indexOf("private func configureLayout()"),
    compactShareViewControllerSource.indexOf("private func configureEditForm()"),
  );
  assert.match(
    chooserLayout,
    /rootStack\.bottomAnchor\.constraint\(\s*lessThanOrEqualTo: view\.safeAreaLayoutGuide\.bottomAnchor,\s*constant: 0\s*\)/,
  );
  assert.match(
    chooserLayout,
    /choicesContainer\.bottomAnchor\.constraint\(\s*equalTo: view\.safeAreaLayoutGuide\.bottomAnchor,\s*constant: 0\s*\)/,
  );
  assert.doesNotMatch(
    chooserLayout,
    /safeAreaLayoutGuide\.bottomAnchor,\s*constant: -12/,
  );
  assert.match(
    compactShareViewControllerSource,
    /section\.contentInsets = NSDirectionalEdgeInsets\(top: 2, leading: 0, bottom: 12, trailing: 0\)/,
  );
});

test("native-app shares preserve a link preview image until the main app uploads it", () => {
  assert.match(compactShareViewControllerSource, /metadata\.imageProvider/);
  assert.match(compactShareViewControllerSource, /canLoadObject\(ofClass: UIImage\.self\)/);
  assert.match(compactShareViewControllerSource, /normalizedPreviewJPEG/);
  assert.match(compactShareViewControllerSource, /previewImageDataBeforeDismissal/);
  assert.match(compactShareViewControllerSource, /queuedImportIDForPreview/);
  assert.match(
    compactShareViewControllerSource,
    /hasItemConformingToTypeIdentifier\(UTType\.image\.identifier\)/,
  );
  assert.match(
    compactShareViewControllerSource,
    /HomeboardSharedImportStore\.savePreviewImage\([\s\S]*?receipt\.listing\.id/,
  );
  assert.match(sharedImportStoreSource, /maximumPreviewImageBytes = 2_000_000/);
  assert.match(sharedImportStoreSource, /homeboard-share-preview/);
  assert.match(sharedImportStoreSource, /data\.starts\(with: \[0xFF, 0xD8, 0xFF\]\)/);
  assert.match(appModelSource, /HomeboardSharedImportStore\.previewImageReference/);
  assert.match(appModelSource, /HomeboardSharedImportStore\.previewImageData/);
  assert.match(appModelSource, /api\.uploadListingImage\(/);
  assert.match(
    appModelSource,
    /removedListingIdentityKeysByBoard\[boardId\]\?\.remove/,
  );
  assert.ok(
    appModelSource.indexOf("api.uploadListingImage(")
      < appModelSource.indexOf("listing: listingForUpload"),
  );
});

test("mobile saves are durable and keep share diagnostics internal", () => {
  const saveFlow = shareViewControllerSource.slice(
    shareViewControllerSource.indexOf("review.onSave ="),
    shareViewControllerSource.indexOf("review.onRescan ="),
  );
  assert.match(saveFlow, /HomeboardListingSavePipeline\.enqueue\(pendingImport\)/);
  assert.doesNotMatch(saveFlow, /HomeboardExtensionSyncClient/);
  assert.match(saveFlow, /save\.queued/);
  assert.match(sharedImportStoreSource, /enum HomeboardShareDiagnosticStore/);
  assert.match(sharedImportStoreSource, /homeboard\.share\.diagnostic-entries-v1/);
  assert.match(sharedImportStoreSource, /Bearer \[redacted\]/);
  assert.match(sharedImportStoreSource, /enum HomeboardShareReportDiagnostics/);
  assert.doesNotMatch(sharedWorkspaceSource, /title: "Share diagnostics"/);
  assert.doesNotMatch(sharedWorkspaceSource, /SharedShareDiagnosticsSheet/);
  assert.doesNotMatch(sharedWorkspaceSource, /Copy full trace|screenshot this page/);
});

test("Mac and iPhone Safari saves use the same authenticated board path", () => {
  assert.match(extensionSyncSource, /HomeboardSharedAuthStore/);
  assert.match(extensionSyncSource, /keychain-access-groups|kSecAttrAccessGroup/);
  assert.ok(
    extensionSyncSource.includes(
      'path: "api/mobile/boards/\\(boardId)/listings"',
    ),
  );
  assert.match(extensionSyncSource, /refresh_token/);
  assert.match(extensionSyncSource, /request\.timeoutInterval = 12/);
  assert.match(extensionSyncSource, /enum HomeboardListingSavePipeline/);
  assert.match(extensionSyncSource, /X-Homeboard-Response/);
  assert.match(safariHandlerSource, /HomeboardListingSavePipeline\.enqueue/);
  assert.match(safariHandlerSource, /HomeboardListingSavePipeline\.synchronize/);
  const safariSaveFlow = safariHandlerSource.slice(
    safariHandlerSource.indexOf("let requestedBoardId"),
    safariHandlerSource.indexOf("private func complete("),
  );
  assert.ok(
    safariSaveFlow.indexOf('"queued": true')
      < safariSaveFlow.indexOf("HomeboardListingSavePipeline.synchronize(receipt)"),
  );
  assert.match(safariHandlerSource, /"queued": true/);
  assert.match(xcodeProjectSpec, /HomeboardMac:/);
  assert.match(xcodeProjectSpec, /HomeboardMacSafariExtension:/);
});

test("extension sync returns a small acknowledgment and parallelizes post-save work", () => {
  const extensionSaveRequest = extensionSyncSource.slice(
    extensionSyncSource.indexOf("private static func requestSave("),
    extensionSyncSource.indexOf("private static func refresh("),
  );
  assert.match(extensionSaveRequest, /"acknowledgment", forHTTPHeaderField: "X-Homeboard-Response"/);
  const pairingRequest = extensionSyncSource.slice(
    extensionSyncSource.indexOf("static func createDevicePairing("),
    extensionSyncSource.indexOf("static func devicePairingStatus("),
  );
  assert.doesNotMatch(pairingRequest, /X-Homeboard-Response/);
  assert.match(mobileListingRouteSource, /x-homeboard-response/);
  assert.match(mobileListingRouteSource, /NextResponse\.json\(\{ saved: true, board: \{ id \} \}\)/);
  const listingSave = boardDataSource.slice(
    boardDataSource.indexOf("export async function addListingToBoard"),
    boardDataSource.indexOf("export async function createBoardInvitation"),
  );
  assert.match(listingSave, /await Promise\.all\(\[/);
  assert.match(listingSave, /submitSource\(\)/);
  assert.match(listingSave, /trackEvent\("listing_imported"/);
});

test("Mac Safari shows grounded details before deeper SLM insights finish", () => {
  const contentSource = readFileSync(
    resolve(
      process.cwd(),
      "ios/HomeboardNative/HomeboardSafariExtension/Resources/content.js",
    ),
    "utf8",
  );
  assert.match(contentSource, /allowSystemModel:\s*visualTracking/);
  assert.match(
    contentSource,
    /if \(!visualTracking && !mobilePillPicker\)[\s\S]*analyzePageCapture\(capture, \{ allowSystemModel: true \}\)/,
  );
  assert.match(contentSource, /applyEnhancedAnalysis/);
  assert.match(contentSource, /resolvedFacts\.modelInsights = resolvedFacts\.insights/);
  assert.match(
    safariHandlerSource,
    /message\["allowSystemModel"\] as\? Bool \?\? true/,
  );
});

test("the connected Mac setup uses a compact self-contained panel", () => {
  assert.match(macAppSource, /HomeboardMacWindowSizer/);
  assert.match(macAppSource, /NSSize\(width: 620, height: 535\)/);
  assert.match(macAppSource, /HomeboardMacPalette\.surface\.opacity\(0\.72\)/);
  assert.match(macAppSource, /Open Safari Settings/);
  assert.match(macAppSource, /getStateOfSafariExtension/);
  assert.match(macAppSource, /safariStatusMessage/);
  assert.match(macAppSource, /syncPendingImports\(reportWhenEmpty: false\)/);
  assert.doesNotMatch(
    macAppSource,
    /refreshSafariExtensionState\(\)[\s\S]*self\.errorMessage = error\.localizedDescription/,
  );
});

test("Mac Debug and installed Release builds cannot register the same Safari extension identity", () => {
  assert.match(
    xcodeProjectSpec,
    /HomeboardMac:[\s\S]*PRODUCT_BUNDLE_IDENTIFIER:\s*com\.homeboard\.native\.mac[\s\S]*configs:[\s\S]*Debug:[\s\S]*PRODUCT_BUNDLE_IDENTIFIER:\s*com\.homeboard\.native\.mac\.dev/,
  );
  assert.match(
    xcodeProjectSpec,
    /HomeboardMacSafariExtension:[\s\S]*PRODUCT_BUNDLE_IDENTIFIER:\s*com\.homeboard\.native\.mac\.safari[\s\S]*configs:[\s\S]*Debug:[\s\S]*PRODUCT_BUNDLE_IDENTIFIER:\s*com\.homeboard\.native\.mac\.dev\.safari/,
  );
  assert.match(macAppSource, /Bundle\.main\.bundleIdentifier\?\.hasSuffix\("\.dev"\)/);
  assert.match(macAppSource, /com\.homeboard\.native\.mac\.dev\.safari/);
  assert.match(macAppSource, /withIdentifier:\s*safariExtensionIdentifier/);
});
