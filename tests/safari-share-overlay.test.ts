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

const shareViewControllerSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardShareExtension/ShareViewController.swift",
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

const safariHandlerSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardSafariExtension/SafariWebExtensionHandler.swift",
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

const xcodeProjectSpec = readFileSync(
  resolve(process.cwd(), "ios/HomeboardNative/project.yml"),
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
  assert.match(
    preprocessorSource,
    /HomeboardSharePreprocessor\.prototype\.finalize/,
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

test("Safari preprocessing is configured inside the extension attributes", () => {
  assert.match(
    shareExtensionInfoPlist,
    /<\/dict><key>NSExtensionJavaScriptPreprocessingFile<\/key><string>SharePreprocessor<\/string><\/dict><key>NSExtensionPointIdentifier<\/key>/,
  );
  assert.doesNotMatch(
    shareExtensionInfoPlist,
    /<\/dict><\/dict><key>NSExtensionJavaScriptPreprocessingFile<\/key>/,
  );
});

test("the mobile share window is visible immediately and cannot wait forever", () => {
  const startupFlow = shareViewControllerSource.slice(
    shareViewControllerSource.indexOf("override func viewDidLoad"),
    shareViewControllerSource.indexOf("deinit"),
  );
  assert.match(
    startupFlow,
    /showInteractiveInterface\(\)[\s\S]*loadSharedURL\(\)/,
  );
  assert.doesNotMatch(
    shareViewControllerSource,
    /preferredContentSize\s*=\s*CGSize\(width:\s*0,\s*height:\s*1\)/,
  );
  assert.match(shareViewControllerSource, /sharedPayloadDeadline/);
  assert.match(
    shareViewControllerSource,
    /else if[\s\S]*let sharedURL[\s\S]*openSharedPage\(\)/,
  );
  assert.match(
    xcodeProjectSpec,
    /SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD:\s*NO/,
  );
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
  assert.match(safariHandlerSource, /HomeboardExtensionSyncClient\.saveListing/);
  assert.match(safariHandlerSource, /"synced": true/);
  assert.match(xcodeProjectSpec, /HomeboardMac:/);
  assert.match(xcodeProjectSpec, /HomeboardMacSafariExtension:/);
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
    /if \(!visualTracking\)[\s\S]*analyzePageCapture\(capture, \{ allowSystemModel: true \}\)/,
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
