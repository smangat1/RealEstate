import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const sourcesDirectory = resolve(
  process.cwd(),
  "ios/HomeboardNative/HomeboardNative/Sources",
);
const swiftSources = readdirSync(sourcesDirectory)
  .filter((name) => name.endsWith(".swift"))
  .map((name) => readFileSync(resolve(sourcesDirectory, name), "utf8"))
  .join("\n");
const paletteSource = readFileSync(
  resolve(sourcesDirectory, "HomeboardPalette.swift"),
  "utf8",
);

test("native plain buttons use their complete rectangular label as the hit region", () => {
  assert.match(paletteSource, /struct HomeboardAreaButtonStyle: ButtonStyle/);
  assert.match(
    paletteSource,
    /configuration\.label\s*\.contentShape\(Rectangle\(\)\)/,
  );
  assert.doesNotMatch(swiftSources, /\.buttonStyle\(\.plain\)/);
  assert.match(swiftSources, /\.buttonStyle\(HomeboardAreaButtonStyle\(\)\)/);
});
