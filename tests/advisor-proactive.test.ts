import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  ADVISOR_GHOST_WINDOW_MS,
  detectListingChanges,
  findBoardCompFlags,
  followUpFinancialDisclosure,
  isGhostedOutreach,
} from "../lib/advisor-proactive-logic";
import { validateGitHubActionsClaims } from "../lib/github-actions-oidc";
import { analyzeAdvisorReply } from "../lib/advisor-reply";
import { calculateListingMonthlyCost, findScamPriceWarnings } from "../lib/listing-cost";
import { optimizeRoomAssignment } from "../lib/room-assignment";
import { parsePreferenceTalk } from "../lib/preference-talk";
import { findSharedTourWindows } from "../lib/tour-availability";

test("confirmed outreach becomes ghosted only after three unanswered days", () => {
  const now = new Date("2026-09-25T16:00:00.000Z");
  const base = {
    status: "sent",
    sentAt: new Date(now.getTime() - ADVISOR_GHOST_WINDOW_MS),
    contactedAt: null,
    answeredAt: null,
    lastFollowUpAt: null,
  };
  assert.equal(isGhostedOutreach(base, now), true);
  assert.equal(isGhostedOutreach({ ...base, sentAt: new Date(now.getTime() - ADVISOR_GHOST_WINDOW_MS + 1) }, now), false);
  assert.equal(isGhostedOutreach({ ...base, answeredAt: now }, now), false);
  assert.equal(isGhostedOutreach({ ...base, lastFollowUpAt: now }, now), false);
  assert.equal(isGhostedOutreach({ ...base, status: "drafted" }, now), false);
});

test("follow-up drafts preserve an explicit financial disclosure choice", () => {
  assert.equal(followUpFinancialDisclosure("omit"), "omit");
  assert.equal(followUpFinancialDisclosure("combined_range"), "combined_range");
  assert.equal(followUpFinancialDisclosure(undefined), "available_on_request");
});

test("listing watch reports price drops and off-market transitions without fabricating changes", () => {
  const previous = {
    price: 3200,
    fees: "No broker fee",
    availableDate: "2026-10-01T00:00:00.000Z",
    listingStatus: "active",
    providerStatus: "Active",
  };
  assert.deepEqual(detectListingChanges(previous, previous), []);

  const changes = detectListingChanges(previous, {
    ...previous,
    price: 3080,
    listingStatus: "removed",
    providerStatus: "Off market",
  });
  assert.equal(changes.find((change) => change.kind === "price")?.beforeValue, 3200);
  assert.equal(changes.find((change) => change.kind === "price")?.afterValue, 3080);
  assert.match(changes.find((change) => change.kind === "status")?.explanation ?? "", /off market/i);
});

test("negotiation flags use similar units already saved to the same board", () => {
  const flags = findBoardCompFlags([
    { id: "target", label: "12 Main · 2A", price: 3320, bedrooms: 2, neighborhood: "Astoria", city: "New York", listingStatus: "active", userStatus: "interested" },
    { id: "comp-a", label: "14 Main · 3B", price: 3150, bedrooms: 2, neighborhood: "Astoria", city: "New York", listingStatus: "active", userStatus: "maybe" },
    { id: "comp-b", label: "18 Main · 4C", price: 3250, bedrooms: 2, neighborhood: "Astoria", city: "New York", listingStatus: "active", userStatus: "maybe" },
    { id: "wrong-layout", label: "Studio", price: 2000, bedrooms: 0, neighborhood: "Astoria", city: "New York", listingStatus: "active", userStatus: "maybe" },
  ]);
  const target = flags.find((flag) => flag.boardListingId === "target");
  assert.equal(target?.averagePrice, 3200);
  assert.equal(target?.difference, 120);
  assert.deepEqual(target?.comparableIds, ["comp-a", "comp-b"]);
});

test("true monthly cost amortizes disclosed fees without inventing missing utilities", () => {
  const cost = calculateListingMonthlyCost({
    rent: 3000,
    fees: {
      monthlyAmenityFee: 60,
      applicationFee: 120,
      brokerFee: 1200,
      utilitiesIncluded: false,
    },
    description: "One month free on a 12 month lease",
  });
  assert.equal(cost.recurringFeesMonthly, 60);
  assert.equal(cost.upfrontFeesMonthly, 110);
  assert.equal(cost.concessionCreditMonthly, 250);
  assert.equal(cost.knownMonthlyTotal, 2920);
  assert.equal(cost.complete, false);
  assert.deepEqual(cost.missing, ["utilities"]);
});

test("scam warning requires a material price gap against similar board homes", () => {
  const warnings = findScamPriceWarnings([
    { id: "target", price: 2100, bedrooms: 2, neighborhood: "Astoria", city: "New York", listingStatus: "active", userStatus: "interested" },
    { id: "comp-a", price: 3200, bedrooms: 2, neighborhood: "Astoria", city: "New York", listingStatus: "active", userStatus: "maybe" },
    { id: "comp-b", price: 3300, bedrooms: 2, neighborhood: "Astoria", city: "New York", listingStatus: "active", userStatus: "maybe" },
    { id: "studio", price: 1900, bedrooms: 0, neighborhood: "Astoria", city: "New York", listingStatus: "active", userStatus: "maybe" },
  ]);
  const warning = warnings.find((entry) => entry.boardListingId === "target");
  assert.equal(warning?.averagePrice, 3250);
  assert.equal(warning?.difference, 1150);
  assert.equal(warning?.percentBelow, 35);
  assert.match(warning?.message ?? "", /verify/i);
});

test("room assignment preserves total rent and gives the premium room to the roommate with more room in budget", () => {
  const result = optimizeRoomAssignment({
    totalRent: 4_000,
    members: [
      { id: "a", name: "Alex", budgetMin: 1_500, idealBudget: 1_700, budgetMax: 1_900 },
      { id: "b", name: "Blair", budgetMin: 1_900, idealBudget: 2_300, budgetMax: 2_600 },
    ],
    rooms: [
      { id: "large", name: "Large room", adjustment: 300 },
      { id: "small", name: "Small room", adjustment: 0 },
    ],
  });

  assert.equal(result.assignments.reduce((sum, assignment) => sum + assignment.monthlyRent, 0), 4_000);
  assert.equal(result.assignments.find((assignment) => assignment.roomId === "large")?.memberName, "Blair");
  assert.ok(result.assignments.every((assignment) => assignment.withinComfortRange));
});

test("room assignment warns instead of hiding an unaffordable split", () => {
  const result = optimizeRoomAssignment({
    totalRent: 5_000,
    members: [
      { id: "a", name: "Alex", budgetMin: null, idealBudget: 1_500, budgetMax: 1_700 },
      { id: "b", name: "Blair", budgetMin: null, idealBudget: 1_700, budgetMax: 1_900 },
    ],
    rooms: [
      { id: "one", name: "Room 1", adjustment: 0 },
      { id: "two", name: "Room 2", adjustment: 0 },
    ],
  });

  assert.equal(result.assignments.filter((assignment) => !assignment.withinComfortRange).length, 2);
  assert.match(result.warnings[0], /2 assignments are outside/);
});

test("explicit preference talk changes only named features", () => {
  assert.deepEqual(parsePreferenceTalk("idgaf about the gym, but natural light is a high priority"), [
    { feature: "gym", label: "gym", weight: -2 },
    { feature: "natural_light", label: "natural light", weight: 2 },
  ]);
  assert.deepEqual(parsePreferenceTalk("That apartment has a gym"), []);
});

test("tour logistics returns only overlap shared by every roommate", () => {
  const shared = findSharedTourWindows([
    { memberId: "a", name: "Alex", windows: [{ start: "2026-10-03T14:00:00.000Z", end: "2026-10-03T18:00:00.000Z" }] },
    { memberId: "b", name: "Blair", windows: [{ start: "2026-10-03T16:00:00.000Z", end: "2026-10-03T19:00:00.000Z" }] },
    { memberId: "c", name: "Casey", windows: [{ start: "2026-10-03T15:30:00.000Z", end: "2026-10-03T17:00:00.000Z" }] },
  ]);
  assert.deepEqual(shared, [{ start: "2026-10-03T16:00:00.000Z", end: "2026-10-03T17:00:00.000Z" }]);
});

test("broker reply intake extracts the next move without exposing invented facts", () => {
  const tour = analyzeAdvisorReply("Yes, unit 4B is available at $3,250. We can show it Saturday morning.");
  assert.equal(tour.facts.available, true);
  assert.equal(tour.facts.mentionsTour, true);
  assert.equal(tour.facts.quotedPrice, 3250);
  assert.match(tour.nextMove, /time windows/i);

  const unavailable = analyzeAdvisorReply("Sorry, it was already rented yesterday.");
  assert.equal(unavailable.facts.available, false);
  assert.equal(unavailable.facts.mentionsTour, false);
  assert.match(unavailable.nextMove, /comparable unit/i);
});

test("the free scheduler accepts only the main-branch Homeboard workflow identity", () => {
  const now = Math.floor(new Date("2026-09-25T16:00:00.000Z").getTime() / 1_000);
  const validClaims = {
    iss: "https://token.actions.githubusercontent.com",
    aud: "homeboard-advisor-proactive",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
    repository: "smangat1/RealEstate",
    repository_id: "1270827998",
    repository_visibility: "public",
    ref: "refs/heads/main",
    workflow_ref: "smangat1/RealEstate/.github/workflows/advisor-proactive.yml@refs/heads/main",
    event_name: "schedule",
  };
  assert.equal(validateGitHubActionsClaims(validClaims, now), true);
  assert.equal(validateGitHubActionsClaims({ ...validClaims, repository: "attacker/fork" }, now), false);
  assert.equal(validateGitHubActionsClaims({ ...validClaims, ref: "refs/heads/feature" }, now), false);
  assert.equal(validateGitHubActionsClaims({ ...validClaims, workflow_ref: "smangat1/RealEstate/.github/workflows/untrusted.yml@refs/heads/main" }, now), false);
  assert.equal(validateGitHubActionsClaims({ ...validClaims, event_name: "pull_request" }, now), false);
  assert.equal(validateGitHubActionsClaims({ ...validClaims, exp: now - 31 }, now), false);
});

test("proactive jobs are authenticated, hourly, idempotent, and persist to board chat", () => {
  const root = process.cwd();
  const read = (path: string) => readFileSync(resolve(root, path), "utf8");
  const cron = read("app/api/cron/advisor-proactive/route.ts");
  const engine = read("lib/advisor-proactive.ts");
  const workflow = read(".github/workflows/advisor-proactive.yml");
  const outreach = read("app/api/mobile/boards/[id]/listings/[listingId]/outreach/route.ts");

  assert.match(cron, /isAdvisorCronRequestAuthorized/);
  assert.match(cron, /validUntil: \{ gte: now \}/);
  assert.match(workflow, /cron: "17 \* \* \* \*"/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /homeboard-advisor-proactive/);
  assert.ok(engine.includes("const fingerprint = `follow-up:${input.outreach.id}`;"));
  assert.match(engine, /advisorAction\.create/);
  assert.match(engine, /chatMessage\.create/);
  assert.match(engine, /lastFollowUpAt: input\.now/);
  assert.match(outreach, /advisorMessageId/);
  assert.match(outreach, /status: "sent"/);
});
