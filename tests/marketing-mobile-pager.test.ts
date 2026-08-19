import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const pager = read("app/marketing-pager.tsx");
const page = read("app/page.tsx");
const installExperience = read("app/install-experience.tsx");
const styles = read("app/marketing.module.css");
const globals = read("app/globals.css");
const cleanImage = readFileSync(resolve(process.cwd(), "public/images/homeboard-comparison-map-clean.png"));

test("marketing uses the same four fixed visible-viewport pages on phone and laptop", () => {
  assert.equal((page.match(/data-page-item/g) ?? []).length, 4);
  assert.doesNotMatch(page, /data-mobile-page-item/);
  assert.match(pager, /window\.visualViewport\?\.height \?\? window\.innerHeight/);
  assert.match(pager, /touchmove[\s\S]*passive: false/);
  assert.match(pager, /positionPages\(activePageRef\.current, drag, false\)/);
  assert.match(pager, /event\.ctrlKey/);
  assert.doesNotMatch(pager, /MOBILE_QUERY|matchMedia/);
  assert.match(styles, /height: var\(--marketing-viewport-height, 100dvh\)/);
  assert.match(styles, /\.site \[data-page-item\][^{]*\{[^}]*position: absolute/);
  assert.match(globals, /body:has\(\.homeboard-marketing\)[\s\S]*overflow: hidden/);
  assert.doesNotMatch(globals, /scroll-snap-type: y mandatory/);
  assert.doesNotMatch(page, /routeEssay|memoryStatement|betweenSection|futureList/);
});

test("the final install dialog keeps independent scrolling while pager gestures are suspended", () => {
  assert.match(pager, /insideOpenDialog\(event\.target\)/);
  assert.match(styles, /installDialogPanel[^}]*overflow-y: auto/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
  assert.match(page, /id="product" data-page-item/);
  assert.match(page, /<InstallExperience \/>/);
  assert.match(installExperience, /dialog\.showModal\(\)/);
  assert.match(styles, /installDialogBody[^}]*display: grid/);
  assert.match(styles, /productFrame img[^}]*object-fit: contain/);
});

test("marketing uses the clean product crop and comfortably sized header controls", () => {
  assert.match(page, /homeboard-comparison-map-clean\.png/);
  assert.match(installExperience, /homeboard-comparison-map-clean\.png/);
  assert.doesNotMatch(`${page}\n${installExperience}`, /homeboard-comparison-map-cropped\.png/);
  assert.equal(cleanImage.readUInt32BE(16), 1179);
  assert.equal(cleanImage.readUInt32BE(20), 2360);
  assert.match(styles, /\.nav \{[^}]*min-height: 72px/);
  assert.match(styles, /\.installCorner \{[^}]*min-height: 46px/);
  assert.match(styles, /\.desktopNav \{[^}]*font-size: 11px/);
});
