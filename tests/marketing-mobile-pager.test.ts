import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = read("app/page.tsx");
const installExperience = read("app/install-experience.tsx");
const styles = read("app/marketing.module.css");
const layout = read("app/layout.tsx");
const ogRoute = read("app/api/og/route.tsx");
const globals = read("app/globals.css");
const cleanSourceImage = readFileSync(resolve(process.cwd(), "public/images/homeboard-comparison-map-clean.png"));
const compressedImage = resolve(process.cwd(), "public/images/homeboard-comparison-map-clean.webp");

test("the document-style landing page remains mobile-safe without obsolete slide paging", () => {
  assert.match(page, /className="doc-canvas"/);
  assert.match(page, /className="doc-sheet"/);
  assert.match(page, /@media \(max-width: 640px\)/);
  assert.match(page, /\.doc-toolbar-ribbon \{[\s\S]*display: none !important/);
  assert.match(page, /\.doc-sheet \{/);
  assert.match(page, /maxWidth: "760px"/);
  assert.match(page, /position: "sticky"/);
  assert.match(page, /minHeight: "100vh"/);
  assert.match(globals, /overflow-x: clip/);
  assert.doesNotMatch(page, /data-page-item|MarketingPager|scroll-snap-type/);
});

test("the document landing page keeps share behavior and branded metadata", () => {
  assert.match(page, /const handleShareClick = async \(\) =>/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /url: window\.location\.href/);
  assert.match(page, /navigator\.clipboard\.writeText\(window\.location\.href\)/);
  assert.match(page, /Share \/ Install Homeboard/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /twitter:/);
  assert.match(ogRoute, /new ImageResponse/);
  assert.match(ogRoute, /apple-icon\.png/);
  assert.match(layout, /favicon\.ico/);
});

test("install, privacy, and legal paths remain usable on mobile", () => {
  assert.match(styles, /installDialogPanel[^}]*overflow-y: auto/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
  assert.match(installExperience, /dialog\.showModal\(\)/);
  assert.match(styles, /installDialogBody[^}]*display: grid/);
  assert.match(page, /Add to Home Screen/);
  assert.match(page, /href="\/mac"/);
  assert.match(page, /aria-label="Data Privacy Details"/);
  assert.match(page, /aria-expanded=\{isPrivacyOpen\}/);
  assert.match(page, /privacy policy/);
  assert.match(page, /maxWidth: "calc\(100vw - 32px\)"/);
});

test("the landing page keeps compressed assets and usable document controls", () => {
  assert.match(page, /\/brand\/homeboard-mark\.svg/);
  assert.match(installExperience, /homeboard-comparison-map-clean\.webp/);
  assert.doesNotMatch(`${page}\n${installExperience}`, /homeboard-comparison-map-cropped\.png/);
  assert.equal(cleanSourceImage.readUInt32BE(16), 1179);
  assert.equal(cleanSourceImage.readUInt32BE(20), 2360);
  assert.ok(statSync(compressedImage).size < 400_000);
  assert.match(page, /className="doc-share-btn"/);
  assert.match(page, /\.doc-share-btn \{[\s\S]*padding: 5px 12px !important/);
  assert.match(page, /width=\{34\}[\s\S]*height=\{35\}/);
});
