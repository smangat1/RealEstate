import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildInquiryDraft,
  buildListingChangeAction,
  INQUIRY_TEMPLATES,
  parseAgentReply,
  structureTourNote,
} from "../lib/advisor-actions";

const listing = {
  id: "listing-1",
  address: "12 Main Street",
  unit: "4B",
  city: "New York",
  neighborhood: "Chelsea",
  price: 4_200,
  bedrooms: 2,
  bathrooms: 1,
  squareFeet: 900,
  availableDate: "2026-10-01T00:00:00.000Z",
  status: "active",
  sourceUrl: "https://example.com/listings/12-main-4b",
  sourceName: "Example Realty",
};

test("Advisor listing changes use one fact-and-command action format", () => {
  const action = buildListingChangeAction({
    boardId: "board-1",
    listingId: listing.id,
    listingLabel: "12 Main Street · 4B",
    change: {
      id: "change-1",
      boardListingId: "saved-1",
      kind: "price",
      field: "price",
      beforeValue: 4_200,
      afterValue: 4_000,
      explanation: "Monthly rent changed from $4,200 to $4,000.",
      whyItMatters: "The group would spend $200 less each month.",
      sourceUrl: listing.sourceUrl,
      detectedAt: "2026-09-12T12:00:00.000Z",
    },
    sourceLinks: [{ label: "Original listing", url: listing.sourceUrl, provider: listing.sourceName }],
  });

  assert.equal(action.schemaVersion, 1);
  assert.equal(action.kind, "listing_change");
  assert.deepEqual(action.facts.map((fact) => fact.key), ["before", "after"]);
  assert.equal(action.primaryAction.type, "open_listing");
  assert.equal(action.secondaryActions[0]?.type, "open_source");
  assert.equal(action.sourceLinks[0]?.url, listing.sourceUrl);
});

test("all five outreach templates stay grounded in saved listing and profile facts", () => {
  const templateKeys = Object.keys(INQUIRY_TEMPLATES) as Array<keyof typeof INQUIRY_TEMPLATES>;
  assert.equal(templateKeys.length, 5);

  for (const templateKey of templateKeys) {
    const draft = buildInquiryDraft({
      templateKey,
      listing,
      senderName: "Sam",
      roommateNames: ["Sam", "Maya"],
      moveInTimeframe: "October 2026",
      priorSentAt: templateKey === "follow_up" ? "2026-09-08T12:00:00.000Z" : null,
    });

    assert.match(draft.body, /12 Main Street · 4B/);
    assert.match(draft.body, /\$4,200 per month/);
    assert.match(draft.body, /October 2026/);
    assert.match(draft.body, /Sam and 1 roommate/);
    assert.doesNotMatch(draft.body, /guaranteed|perfect fit|approved/i);
  }
});

test("agent replies are parsed into only explicit availability, fees, tours, requirements, and next steps", () => {
  const facts = parseAgentReply(
    "The apartment is still available. The $75 application fee is required. Tour Tuesday at 6 pm. Please send pay stubs and confirm the time.",
  );

  assert.equal(facts.availability, "Available");
  assert.deepEqual(facts.fees, ["$75 application fee"]);
  assert.deepEqual(facts.tourTimes, ["Tuesday at 6 pm"]);
  assert.ok(facts.requirements.some((item) => /pay stubs/i.test(item)));
  assert.ok(facts.nextSteps.some((item) => /confirm/i.test(item)));
});

test("tour transcripts are organized deterministically without adding observations", () => {
  const transcript = "Bright living room. Small second bedroom. Concern about street noise; ask about window repairs.";
  const summary = structureTourNote(transcript);

  assert.deepEqual(summary.pros, ["Bright living room"]);
  assert.deepEqual(summary.cons, ["Small second bedroom"]);
  assert.deepEqual(summary.concerns, ["Concern about street noise; ask about window repairs"]);
  assert.deepEqual(summary.followUps, ["Concern about street noise; ask about window repairs"]);
});

test("board chat invokes Advisor only for an explicit mention", () => {
  const boardData = readFileSync("lib/board-data.ts", "utf8");
  const subscription = readFileSync("lib/subscription-service.ts", "utf8");
  const boardExperience = readFileSync("components/board-experience.tsx", "utf8");

  assert.doesNotMatch(subscription, /chatMessage\.(?:create|createMany)/);
  assert.match(boardData, /const ADVISOR_MENTION = \/\(\^\|\\s\)@advisor\\b\/i/);
  assert.match(boardData, /if \(ADVISOR_MENTION\.test\(message\)\)[\s\S]*authorName:\s*["']Advisor["']/);
  assert.match(boardData, /role:\s*["']user["']/);
  assert.match(boardExperience, /start with @Advisor/);
  assert.doesNotMatch(boardExperience, /Advisor is typing/i);
});

test("Advisor stays out of ordinary board and listing workflows", () => {
  const boardData = readFileSync("lib/board-data.ts", "utf8");
  const boardExperience = readFileSync("components/board-experience.tsx", "utf8");
  const nativeWorkspace = readFileSync(
    "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift",
    "utf8",
  );

  assert.match(boardData, /advisorActions:\s*\[\]/);
  assert.match(boardData, /scoutSubscription:\s*null/);
  assert.doesNotMatch(boardExperience, /<ScoutBanner\b/);
  assert.doesNotMatch(boardExperience, /id=["']advisor-updates-section["']/);
  assert.doesNotMatch(nativeWorkspace, /ScoutBannerView\(subscription:/);
  assert.doesNotMatch(nativeWorkspace, /title:\s*["']Advisor updates["']/i);

  const ordinaryListingWorkflows = boardData.slice(
    boardData.indexOf("export async function addListingToBoard"),
    boardData.indexOf("export async function createBoardInvitation"),
  ) + boardData.slice(
    boardData.indexOf("export async function updateBoardListingStatus"),
  );
  assert.doesNotMatch(ordinaryListingWorkflows, /seedListingAdvisorActions/);
});

test("native Advisor wording uses Apple Intelligence with a deterministic fallback", () => {
  const source = readFileSync(
    "ios/HomeboardNative/HomeboardNative/Sources/AdvisorWordingEngine.swift",
    "utf8",
  );

  assert.match(source, /SystemLanguageModel\.default\.isAvailable/);
  assert.match(source, /engine:\s*"Apple Intelligence/);
  assert.match(source, /engine:\s*"Deterministic"/);
  assert.match(source, /return fallback/);
  assert.match(source, /using only the supplied computed facts/);
});
