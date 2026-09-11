import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { listingDecisionActionSchema, pendingBoardQuestions } from "../lib/board-decisions";

test("poll actions only accept member votes", () => {
  assert.deepEqual(listingDecisionActionSchema.parse({ type: "request_viewing", choice: "yes" }), {
    type: "request_viewing", choice: "yes",
  });
  assert.deepEqual(listingDecisionActionSchema.parse({ action: "vote", type: "apply", choice: "no" }), {
    action: "vote", type: "apply", choice: "no",
  });
  for (const invalid of [
    { action: "close", type: "apply" },
    { action: "close", decisionId: " " },
    { action: "close", decisionId: "poll-1", type: "apply", choice: "yes" },
    { type: "apply", choice: "yes", decisionId: "poll-1" },
    { type: "apply", choice: "unknown" },
    { type: "unsupported", choice: "yes" },
    { action: "delete", decisionId: "poll-1" },
  ]) {
    assert.equal(listingDecisionActionSchema.safeParse(invalid).success, false);
  }
});

test("only explicitly opened questions become pending decisions", () => {
  assert.deepEqual(pendingBoardQuestions([
    { eventType: "listing_decision_voted", content: "Maya voted yes", createdAt: "2026-09-04T13:00:00Z" },
    { eventType: "board_updated", content: "Which neighborhood should we prioritize?", createdAt: "2026-09-04T12:00:00Z" },
    { eventType: "decision_opened", content: "  Is parking essential?  ", createdAt: "2026-09-04T11:00:00Z" },
  ]), ["Is parking essential?"]);
});

test("resolving a question removes case-insensitive duplicates and keeps other questions", () => {
  assert.deepEqual(pendingBoardQuestions([
    { eventType: "decision_opened", content: "Is parking essential?", createdAt: "2026-09-04T10:00:00Z" },
    { eventType: "decision_opened", content: "IS PARKING ESSENTIAL?", createdAt: "2026-09-04T11:00:00Z" },
    { eventType: "decision_opened", content: "Move in October?", createdAt: "2026-09-04T12:00:00Z" },
    { eventType: "decision_resolved", content: "Is parking essential? || No, we will use transit.", createdAt: "2026-09-04T13:00:00Z" },
  ]), ["Move in October?"]);
});

test("a reopened question is pending even when it was resolved in the past", () => {
  const events = [
    { eventType: "decision_opened", content: "Is parking essential?", createdAt: new Date("2026-09-04T10:00:00Z") },
    { eventType: "decision_resolved", content: "Is parking essential? || No", createdAt: new Date("2026-09-04T11:00:00Z") },
    { eventType: "decision_opened", content: "Is parking essential?", createdAt: new Date("2026-09-04T12:00:00Z") },
  ];
  const before = [...events];
  assert.deepEqual(pendingBoardQuestions(events), ["Is parking essential?"]);
  assert.deepEqual(events, before);
});

test("pending questions survive a busy activity feed and are newest first", () => {
  const events = [
    { eventType: "decision_opened", content: "Older question", createdAt: "2026-09-01T10:00:00Z" },
    { eventType: "decision_opened", content: "Newer question", createdAt: "2026-09-02T10:00:00Z" },
    ...Array.from({ length: 30 }, (_, index) => ({
      eventType: "listing_saved",
      content: `Place ${index}`,
      createdAt: "2026-09-03T10:00:00Z",
    })),
  ];
  assert.deepEqual(pendingBoardQuestions(events), ["Newer question", "Older question"]);
});

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const boardDataSource = read("lib/board-data.ts");
const decisionRouteSource = read("app/api/mobile/boards/[id]/listings/[listingId]/decisions/route.ts");
const updatesRouteSource = read("app/api/mobile/boards/[id]/updates/route.ts");
const listingRouteSource = read("app/api/mobile/boards/[id]/listings/[listingId]/route.ts");
const payloadSource = read("lib/mobile-payloads.ts");
const workspaceSource = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");
const shellSource = read("ios/HomeboardNative/HomeboardNative/Sources/BoardShellView.swift");

test("the server cannot create a one-person group decision", () => {
  const voteFlow = boardDataSource.slice(
    boardDataSource.indexOf("export async function voteOnBoardListingDecision"),
    boardDataSource.indexOf("export async function updateBoardListingDetails"),
  );
  assert.match(voteFlow, /transaction\.boardMember\.count/);
  assert.match(voteFlow, /memberCount < 2/);
  assert.match(voteFlow, /GROUP_DECISION_REQUIRES_TWO_MEMBERS/);
  assert.match(decisionRouteSource, /Invite at least one other member/);
});

test("mobile mutation routes expose no unilateral close or resolve action", () => {
  assert.doesNotMatch(decisionRouteSource, /closeBoardListingDecision|decisionId/);
  assert.doesNotMatch(updatesRouteSource, /open_decision|resolve_decision|resolveBoardDecision/);
  assert.doesNotMatch(listingRouteSource, /workflowStatus:[^\n]+decided/);
});

test("group decision payload and native UI report response progress", () => {
  assert.match(payloadSource, /resolvedCount: seenUserIds\.size/);
  assert.match(payloadSource, /requiredCount: decisionRequiredCount/);
  assert.match(payloadSource, /remainingMemberNames:/);

  const sharedDecisionFlow = workspaceSource.slice(
    workspaceSource.indexOf("// MARK: - Group decisions"),
    workspaceSource.indexOf("struct SharedSetupView"),
  );
  assert.match(sharedDecisionFlow, /Resolved .*groupResolvedCount.*groupRequiredCount/);
  assert.match(sharedDecisionFlow, /Everyone must respond|every member responds|no one can close this alone/i);
  assert.doesNotMatch(sharedDecisionFlow, /Close poll|Resolve decision|Ask the group/);
  assert.match(shellSource, /Label\("Group", systemImage: "bubble\.left\.and\.bubble\.right\.fill"\)/);
});
