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

test("mobile marketing uses four fixed visible-viewport pages instead of document scroll snapping", () => {
  assert.equal((page.match(/data-mobile-page-item/g) ?? []).length, 4);
  assert.match(pager, /window\.visualViewport\?\.height \?\? window\.innerHeight/);
  assert.match(pager, /touchmove[\s\S]*passive: false/);
  assert.match(pager, /positionPages\(activePageRef\.current, drag, false\)/);
  assert.match(styles, /position: fixed;[\s\S]*--mobile-viewport-height/);
  assert.match(globals, /body:has\(\.homeboard-marketing\)[\s\S]*overflow: hidden/);
  assert.doesNotMatch(globals, /scroll-snap-type: y mandatory/);
});

test("the final install dialog keeps independent scrolling while pager gestures are suspended", () => {
  assert.match(pager, /insideOpenDialog\(event\.target\)/);
  assert.match(styles, /installDialogPanel[^}]*overflow-y: auto/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
  assert.match(page, /id="product" data-mobile-page-item/);
});

test("mobile marketing uses the clean product crop and comfortably sized header controls", () => {
  assert.match(page, /homeboard-comparison-map-clean\.png/);
  assert.match(installExperience, /homeboard-comparison-map-clean\.png/);
  assert.doesNotMatch(`${page}\n${installExperience}`, /homeboard-comparison-map-cropped\.png/);
  assert.match(styles, /\.nav \{[\s\S]*?min-height: 72px/);
  assert.match(styles, /\.installCorner \{[\s\S]*?min-height: 44px/);
});
