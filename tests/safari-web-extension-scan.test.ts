import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const resourcePath = (...parts: string[]) =>
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardSafariExtension/Resources",
    ...parts,
  );

const manifest = JSON.parse(readFileSync(resourcePath("manifest.json"), "utf8"));
const backgroundSource = readFileSync(resourcePath("background.js"), "utf8");
const contentSource = readFileSync(resourcePath("content.js"), "utf8");
const projectSpec = readFileSync(
  resolve(process.cwd(), "ios/HomeboardNative/project.yml"),
  "utf8",
);

test("the Safari toolbar starts the in-page scan instead of opening a popup", () => {
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.action.default_title, "Save to Homeboard");
  assert.match(backgroundSource, /browser\.action\.onClicked/);
  assert.match(backgroundSource, /homeboard\.startPageScan/);
  assert.match(backgroundSource, /homeboard\.analyzeListing/);
  assert.equal(manifest.background.persistent, false);
  assert.equal(manifest.background.type, undefined);
  assert.match(backgroundSource, /Number\.isInteger\(tab\?\.id\)/);
  assert.doesNotMatch(backgroundSource, /if \(!tab\?\.id\)/);
  assert.match(backgroundSource, /browser\.tabs\.query\(\{ active: true, currentWindow: true \}\)/);
  assert.match(backgroundSource, /browser\.scripting\.executeScript/);
  assert.match(backgroundSource, /response\?\.started !== true/);
  assert.match(backgroundSource, /browser\.action\.setBadgeText/);
  assert.match(contentSource, /This page did not finish scanning/);
  assert.match(contentSource, /showPageScanFailure\(error\)/);
  assert.deepEqual(manifest.permissions.includes("activeTab"), true);
  assert.deepEqual(Array.isArray(manifest.host_permissions), true);
  assert.deepEqual(Array.isArray(manifest.content_scripts), true);
  assert.match(JSON.stringify(manifest.host_permissions), /zillow\.com/);
  assert.doesNotMatch(JSON.stringify(manifest.host_permissions), /<all_urls>/);
});

test("Mac Safari stays compact while iPhone uses the pill picker", () => {
  assert.match(backgroundSource, /platform\?\.os === "mac"/);
  assert.match(backgroundSource, /\? "compact" : "mobile-pills"/);
  assert.match(contentSource, /const visualTracking = presentation === "visual"/);
  assert.match(contentSource, /const mobilePillPicker = presentation === "mobile-pills"/);
  assert.match(
    contentSource,
    /if \(visualTracking\) \{[\s\S]*animateSentenceRanges/,
  );
  assert.match(contentSource, /Checking listing details/);
});

test("mobile Safari presents listing and unit pills that save on selection", () => {
  assert.match(contentSource, /classList\.toggle\("mobile-pills", pillPicker\)/);
  assert.match(contentSource, /class="capture-pills hidden"/);
  assert.match(contentSource, /className = "listing-pill"/);
  assert.match(contentSource, /Choose a unit to save/);
  assert.match(contentSource, /Tap the listing to save/);
  assert.match(contentSource, /bedroomLabel\(capture\.bedrooms\)/);
  assert.match(contentSource, /bathroomLabel\(capture\.bathrooms\)/);
  assert.match(contentSource, /type: "homeboard\.saveListing",[\s\S]*capture/);
  assert.match(contentSource, /review\.prepareCapture\(capture\)/);
  assert.match(contentSource, /overflow-x: auto/);
  assert.match(contentSource, /touch-action: pan-x/);
  assert.match(contentSource, /scroll-snap-type: x mandatory/);
  assert.match(contentSource, /scroll-snap-align: center/);
  assert.match(contentSource, /scroll-snap-stop: always/);
  assert.match(contentSource, /classList\.toggle\("carousel-active", active\)/);
  assert.match(contentSource, /function configureMobilePillPicker/);
  assert.match(contentSource, /const updateCenteredPill/);
  assert.match(contentSource, /requestAnimationFrame\(updateCenteredPill\)/);
  assert.match(contentSource, /function mobileListingTitle/);
  assert.match(contentSource, /if \(multiple && detail\) return detail/);
  assert.match(contentSource, /background: transparent/);
  assert.match(contentSource, /:host\(\.mobile-pills\) \.complete-copy \{[\s\S]*?display: none/);
  assert.match(contentSource, /showMobileSavedPill/);
  assert.match(contentSource, /const SAVE_CONFIRMATION_DELAY_MS = 900/);
  assert.match(contentSource, /saveListingCapture\(capture\)/);
  assert.match(contentSource, /setTimeout\(\(\) => ui\.host\.remove\(\), SAVE_CONFIRMATION_DELAY_MS\)/);
  assert.doesNotMatch(contentSource, /ui\.host\.remove\(\), 2600/);
});

test("website saves reuse the last native host and acknowledge the durable queue first", () => {
  assert.match(backgroundSource, /successfulNativeApplicationId/);
  assert.match(backgroundSource, /orderedNativeApplicationIds/);
  assert.match(backgroundSource, /platform\?\.os === "mac"/);
  assert.match(backgroundSource, /successfulNativeApplicationId = applicationId/);
  assert.match(contentSource, /async function saveListingCapture\(capture\)/);
  assert.equal((contentSource.match(/type: "homeboard\.saveListing"/g) || []).length, 1);
  assert.doesNotMatch(contentSource, /Saved\. Waiting to sync/);
});

test("mobile carousel tucks away without saving and includes an edit choice", () => {
  assert.match(contentSource, /class="collapsed-tab" id="collapsedTab"/);
  assert.match(contentSource, /const collapseDelay = 4_000/);
  assert.match(contentSource, /classList\.add\("carousel-collapsed"\)/);
  assert.match(contentSource, /classList\.remove\("carousel-collapsed"\)/);
  assert.match(contentSource, /globalThis\.addEventListener\("scroll", onPageScroll/);
  assert.match(contentSource, /document\.addEventListener\("scroll", onPageScroll/);
  assert.match(contentSource, /ui\.collapsedTab\.addEventListener\("click", expandCarousel\)/);
  assert.match(contentSource, /\? `\$\{candidates\.length\} units`/);
  assert.match(contentSource, /editButton\.className = "listing-pill edit-pill"/);
  assert.match(contentSource, /"Edit details"/);
  assert.match(contentSource, /"Change anything before saving"/);
  assert.match(
    contentSource,
    /editButton\.addEventListener\("click", \(\) => \{[\s\S]*?review\.showReview\(\)/,
  );
  assert.doesNotMatch(
    contentSource,
    /editButton\.addEventListener\("click"[\s\S]{0,400}homeboard\.saveListing/,
  );
});

test("mobile pills dismiss downward without adding a visible close control", () => {
  assert.match(contentSource, /function configureMobileSwipeDismiss/);
  assert.match(
    contentSource,
    /deltaY > 56 && deltaY > Math\.abs\(deltaX\) \* 1\.15/,
  );
  assert.match(contentSource, /Swipe down to dismiss/);
  assert.match(
    contentSource,
    /:host\(\.mobile-pills\) \.complete-card \.close-button \{[\s\S]*?clip-path: inset\(50%\)/,
  );
});

test("supported mobile listing pages scan automatically without auto-saving", () => {
  assert.match(contentSource, /function isMobileSafariContext/);
  assert.match(contentSource, /function isLikelyListingCapture/);
  assert.match(contentSource, /function scheduleAutomaticListingScan/);
  assert.match(contentSource, /startPageScan\(\{ presentation: "mobile-pills" \}\)/);
  assert.match(contentSource, /automaticScanAttempts >= 40/);
  assert.match(contentSource, /if \(document\.hidden\) return/);
  assert.match(contentSource, /document\.addEventListener\("visibilitychange"/);
  assert.match(contentSource, /function isActualListingPage/);
  assert.match(contentSource, /function listingURLKind/);
  assert.match(contentSource, /function hasActiveMapResultsUI/);
  assert.match(contentSource, /return visibleCards\.length >= 1/);
  assert.match(contentSource, /if \(capture\?\.detailPage !== true\) return false/);
  assert.match(
    contentSource,
    /if \(mobilePillPicker && !isLikelyListingCapture\(capture\)\)[\s\S]*?return;/,
  );
  assert.doesNotMatch(contentSource, /scheduleAutomaticListingScan[\s\S]{0,500}homeboard\.saveListing/);
});

test("listing preview images fall back from metadata to the visible gallery", () => {
  assert.match(contentSource, /meta\[property="og:image:secure_url"\]/);
  assert.match(contentSource, /link\[rel~="image_src"\]/);
  assert.match(contentSource, /function structuredImageURL/);
  assert.match(contentSource, /function visibleListingImageURL/);
  assert.match(contentSource, /data-testid\*="gallery"/);
  assert.match(contentSource, /image\.naturalWidth \|\| rect\.width/);
  assert.match(contentSource, /isRecommendationElement\(image, roots\) \|\| isListingCard\(image\)/);
});

test("the compact Share Extension ships beside the automatic Safari scanner", () => {
  const appTarget = projectSpec.slice(
    projectSpec.indexOf("  HomeboardNative:"),
    projectSpec.indexOf("  HomeboardShareExtension:"),
  );
  assert.match(appTarget, /^\s+- target: HomeboardShareExtension$/m);
  assert.match(projectSpec, /^  HomeboardShareExtension:$/m);
  assert.match(projectSpec, /CompactShareViewController\.swift/);
});

test("the in-page scan advances sentence ranges and reveals review afterward", () => {
  assert.match(contentSource, /function readableSentenceRanges/);
  assert.match(contentSource, /sentence-highlight/);
  assert.match(contentSource, /Reading \$\{index \+ 1\} of \$\{ranges\.length\}/);
  assert.match(contentSource, /Review and save/);
  assert.match(contentSource, /homeboard\.analyzeListing/);
  assert.match(contentSource, /homeboard\.saveListing/);
  assert.match(contentSource, /You can keep browsing while Homeboard finishes the save/);
});

test("the Mac share overlay matches the neutral Homeboard palette", () => {
  assert.match(contentSource, /#f9e2cd/i);
  assert.match(contentSource, /#3d504a/i);
  assert.match(contentSource, /#fff3e5/i);
  assert.match(
    contentSource,
    /\.backdrop\s*\{[^}]*pointer-events:\s*auto;\s*\}/,
  );
  assert.doesNotMatch(
    contentSource,
    /#(?:8addff|4a8ff5|76c8f5|0c1017|08111f)|74,\s*143,\s*245|138,\s*221,\s*255|12,\s*16,\s*23/i,
  );
});

test("the Mac review card has branded, keyboard-accessible review states", () => {
  assert.match(contentSource, /Listing ready/);
  assert.match(contentSource, /REVIEW BEFORE SAVING/);
  assert.match(contentSource, /role="dialog" aria-modal="true"/);
  assert.match(contentSource, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(contentSource, /event\.key === "Escape"/);
  assert.match(contentSource, /function listingSource/);
});
