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

test("the Safari toolbar starts the in-page scan instead of opening a popup", () => {
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.action.default_title, "Save to Homeboard");
  assert.match(backgroundSource, /browser\.action\.onClicked/);
  assert.match(backgroundSource, /homeboard\.startPageScan/);
  assert.match(backgroundSource, /homeboard\.analyzeListing/);
});

test("Mac Safari skips the visual sentence sweep", () => {
  assert.match(backgroundSource, /platform\?\.os === "mac"/);
  assert.match(backgroundSource, /presentation = "compact"/);
  assert.match(contentSource, /const visualTracking = presentation !== "compact"/);
  assert.match(
    contentSource,
    /if \(visualTracking\) \{[\s\S]*animateSentenceRanges/,
  );
  assert.match(contentSource, /Checking listing details/);
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
