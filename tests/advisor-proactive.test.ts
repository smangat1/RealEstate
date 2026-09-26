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
