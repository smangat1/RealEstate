import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const boardExperience = source("components/board-experience.tsx");
const boardPage = source("app/boards/[id]/page.tsx");
const settingsPage = source("app/settings/page.tsx");
const boardData = source("lib/board-data.ts");

test("the laptop board imports exact links without a suggestion popup", () => {
  assert.doesNotMatch(boardExperience, /MatchDeck|isDeckOpen|Open match deck/);
  assert.match(boardExperience, /id="link-import-section"/);
  assert.match(boardExperience, /action=\{addListingAction\}/);
  assert.match(boardExperience, /name="method" value="pasted_link"/);
  assert.match(boardExperience, /name="sourceUrl"/);
});

test("board pages skip unused suggestion inventory and retain imported URLs", () => {
  assert.match(boardPage, /includeSuggestedListings:\s*false/);
  assert.match(settingsPage, /includeSuggestedListings:\s*false/);
  assert.match(boardData, /sourceUrl:\s*normalizedSourceUrl/);
});
