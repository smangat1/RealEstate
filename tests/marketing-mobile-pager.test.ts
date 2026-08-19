import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const pager = read("app/marketing-pager.tsx");
const page = read("app/page.tsx");
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
