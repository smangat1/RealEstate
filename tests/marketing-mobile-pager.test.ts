import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = read("app/page.tsx");
const macPage = read("app/mac/page.tsx");
const installExperience = read("app/install-experience.tsx");
const layout = read("app/layout.tsx");
const ogRoute = read("app/api/og/route.tsx");
const cleanSourceImage = readFileSync(
  resolve(process.cwd(), "public/images/homeboard-comparison-map-clean.png"),
);
const compressedImage = resolve(
  process.cwd(),
  "public/images/homeboard-comparison-map-clean.webp",
);
const brandMark = resolve(process.cwd(), "public/brand/homeboard-mark.svg");

test("the landing page is one responsive document instead of a four-slide pager", () => {
  assert.equal((page.match(/data-page-item/g) ?? []).length, 0);
  assert.doesNotMatch(page, /MarketingPager|marketing-pager|marketing\.module/);
  assert.match(page, /className="doc-canvas"/);
  assert.match(page, /className="doc-sheet"/);
  assert.match(page, /className="doc-body-text"/);
  assert.match(page, /@media \(max-width: 640px\)/);
  assert.match(page, /\.doc-toolbar-ribbon \{[\s\S]*display: none !important/);
  assert.match(page, /maxWidth: "760px"/);
  assert.match(page, /minHeight: "100vh"/);

  assert.match(macPage, /className="doc-canvas"/);
  assert.match(macPage, /className="doc-sheet"/);
  assert.match(macPage, /@media \(max-width: 640px\)/);
});

test("the document landing retains branded metadata and shareable install paths", () => {
  assert.match(layout, /openGraph:/);
  assert.match(layout, /twitter:/);
  assert.match(layout, /favicon\.ico/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /navigator\.clipboard\.writeText\(window\.location\.href\)/);
  assert.match(page, /Share \/ Install Homeboard/);
  assert.match(page, /href="\/mac"/);
  assert.match(macPage, /Homeboard for Mac/);
  assert.match(macPage, /mac_companion_brief/);
  assert.match(ogRoute, /new ImageResponse/);
  assert.match(ogRoute, /apple-icon\.png/);
});

test("the share and download dialogs remain explicit and accessible", () => {
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /aria-labelledby="request-access-dialog-title"/);
  assert.match(page, /Share Document Link/);
  assert.match(page, /Add to Home Screen/);
  assert.match(page, /Download Homeboard/);

  assert.match(macPage, /role="dialog"/);
  assert.match(macPage, /aria-labelledby="share-dialog-title"/);
  assert.match(macPage, /Install Homeboard or Share Link/);
  assert.match(macPage, /Open Homeboard for Mac/);
});

test("assets that remain visible use the compressed product crop and lightweight mark", () => {
  assert.doesNotMatch(`${page}\n${macPage}`, /homeboard-comparison-map-clean\.webp/);
  assert.match(installExperience, /homeboard-comparison-map-clean\.webp/);
  assert.doesNotMatch(installExperience, /homeboard-comparison-map-cropped\.png/);
  assert.match(page, /\/brand\/homeboard-mark\.svg/);
  assert.match(macPage, /\/brand\/homeboard-mark\.svg/);
  assert.equal(cleanSourceImage.readUInt32BE(16), 1179);
  assert.equal(cleanSourceImage.readUInt32BE(20), 2360);
  assert.ok(statSync(compressedImage).size < 400_000);
  assert.ok(statSync(brandMark).size < 50_000);
});
