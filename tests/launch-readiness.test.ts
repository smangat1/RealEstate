import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("the public site has branded metadata and installable icons", () => {
  const layout = read("app/layout.tsx");
  const manifest = read("app/manifest.ts");

  assert.match(layout, /template: "%s · Homeboard"/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /twitter:/);
  assert.match(layout, /shared shortlist/);
  assert.match(manifest, /theme_color: "#3D504A"/);
  assert.ok(existsSync(resolve(root, "app/icon.svg")));
  assert.ok(existsSync(resolve(root, "app/favicon.ico")));
  assert.ok(existsSync(resolve(root, "app/apple-icon.png")));
});

test("information pages have a mobile menu, useful footer, and custom 404", () => {
  const shell = read("app/info-shell.tsx");
  const infoStyles = read("app/info.module.css");
  const notFound = read("app/not-found.tsx");

  assert.match(shell, /<details className=\{styles\.mobileMenu\}>/);
  assert.match(shell, /href="\/privacy"/);
  assert.match(shell, /href="\/contact"/);
  assert.match(shell, /© \{currentYear\} Homeboard/);
  assert.match(shell, /mailto:/);
  assert.match(infoStyles, /@media \(max-width: 640px\)[\s\S]*\.mobileMenu/);
  assert.match(notFound, /404 · Wrong address/);
  assert.match(notFound, /Return to Homeboard/);
});

test("mobile pages prevent sideways overflow and retain final-page legal links", () => {
  const globals = read("app/globals.css");
  const marketingStyles = read("app/marketing.module.css");

  assert.match(globals, /overflow-x: clip/);
  assert.match(globals, /img,[\s\S]*svg,[\s\S]*video[\s\S]*max-width: 100%/);
  assert.match(marketingStyles, /\.productLinks \{ margin-top: 10px; display: flex/);
  assert.doesNotMatch(marketingStyles, /\.productRoadmap,\s*\.productLinks \{ display: none/);
});

test("the heaviest visible marketing assets use compressed delivery files", () => {
  const page = read("app/page.tsx");
  const install = read("app/install-experience.tsx");
  const compressedMap = resolve(root, "public/images/homeboard-comparison-map-clean.webp");
  const webBackground = resolve(root, "public/images/homeboard-auth-bg.jpg");
  const nativeBackground = resolve(root, "ios/HomeboardNative/HomeboardNative/Resources/Assets.xcassets/HomeboardAuthBackground.imageset/background.jpg");

  assert.match(page, /homeboard-comparison-map-clean\.webp/);
  assert.match(install, /homeboard-comparison-map-clean\.webp/);
  assert.ok(statSync(compressedMap).size < 400_000);
  assert.ok(statSync(webBackground).size < 800_000);
  assert.ok(statSync(nativeBackground).size < 800_000);
});

test("the native app already ships a complete icon set", () => {
  const iconContents = read("ios/HomeboardNative/HomeboardNative/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json");
  for (const size of ["AppIcon-20.png", "AppIcon-60.png", "AppIcon-180.png", "AppIcon-1024.png"]) {
    assert.match(iconContents, new RegExp(size.replace(".", "\\.")));
    assert.ok(existsSync(resolve(root, `ios/HomeboardNative/HomeboardNative/Resources/Assets.xcassets/AppIcon.appiconset/${size}`)));
  }
});
