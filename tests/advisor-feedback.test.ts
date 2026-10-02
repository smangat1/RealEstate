import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  advisorFeedbackRequestSchema,
  feedbackSubjectMatchesBoard,
} from "../lib/advisor-feedback";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("feedback accepts bounded structured facts and rejects unreviewed text or financial fields", () => {
  assert.equal(advisorFeedbackRequestSchema.safeParse({
    subjectType: "draft",
    subjectId: "message-1",
    signal: "rejected",
    reasonCode: "bad_tone",
    note: "Too formal",
    snapshot: { tone: "Stern", generationSource: "apple_intelligence", executionStatus: "draft_ready" },
  }).success, true);

  assert.equal(advisorFeedbackRequestSchema.safeParse({
    subjectType: "reply_extraction",
    subjectId: "outreach-1",
    signal: "rejected",
    snapshot: {
      listingId: "listing-1",
      outreachId: "outreach-1",
      source: "on_device_ocr",
      fullBrokerMessage: "must not persist",
    },
  }).success, false);

  assert.equal(advisorFeedbackRequestSchema.safeParse({
    subjectType: "preference_proposal",
    subjectId: "proposal-1",
    signal: "confirmed",
    snapshot: { changeFields: ["mustHaves"], annualIncome: 200_000 },
  }).success, false);
});

test("feedback scope rejects cross-board and mismatched-listing subjects", () => {
  assert.equal(feedbackSubjectMatchesBoard({
    requestedBoardId: "board-a",
    subjectBoardId: "board-b",
  }), false);
  assert.equal(feedbackSubjectMatchesBoard({
    requestedBoardId: "board-a",
    subjectBoardId: "board-a",
    requestedListingId: "listing-a",
    subjectListingId: "listing-b",
  }), false);
  assert.equal(feedbackSubjectMatchesBoard({
    requestedBoardId: "board-a",
    subjectBoardId: "board-a",
    requestedListingId: "listing-a",
    subjectListingId: "listing-a",
  }), true);
});

test("feedback persistence is idempotent and inaccessible to direct client roles", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20261002150000_advisor_feedback/migration.sql");
  const route = read("app/api/mobile/boards/[id]/advisor/feedback/route.ts");
  assert.match(schema, /@@unique\(\[userId, subjectType, subjectId, signal\]\)/);
  assert.match(route, /error\.code === "P2002"/);
  assert.match(route, /userId_subjectType_subjectId_signal/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE "AdvisorFeedback" FROM anon, authenticated/);
});

test("each wrong-feedback path applies its local effect independently of the feedback POST", () => {
  const card = read("ios/HomeboardNative/HomeboardNative/Sources/AdvisorCardView.swift");
  const replies = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");
  const draftBlock = card.slice(card.indexOf("subjectType: \"draft\"") - 120, card.indexOf("subjectType: \"draft\"") + 900);
  assert.ok(draftBlock.indexOf("isDismissed = true") < draftBlock.indexOf("await appModel.submitAdvisorFeedback"));

  const proposalBlock = card.slice(card.indexOf("subjectType: \"preference_proposal\"") - 250, card.indexOf("subjectType: \"preference_proposal\"") + 900);
  assert.ok(proposalBlock.indexOf("resolveAdvisorPreferenceProposal") < proposalBlock.indexOf("submitAdvisorFeedback"));

  const replyBlock = replies.slice(replies.indexOf("subjectType: \"reply_extraction\"") - 250, replies.indexOf("subjectType: \"reply_extraction\"") + 1_200);
  assert.ok(replyBlock.indexOf("extractionPreview = nil") < replyBlock.indexOf("await appModel.submitAdvisorFeedback"));
  assert.match(replyBlock, /logged reply was not changed/);
});

test("confirmed feedback never participates in reply or preference core transactions", () => {
  const replyRoute = read("app/api/mobile/boards/[id]/listings/[listingId]/reply/route.ts");
  const replyTransaction = replyRoute.slice(
    replyRoute.indexOf("const transactionResults = await prisma.$transaction(["),
    replyRoute.indexOf("followUpCancelled = replyLogConfirmation"),
  );
  assert.doesNotMatch(replyTransaction, /advisorFeedback/);
  assert.match(replyTransaction, /advisorNotificationDelivery\.updateMany/);
  assert.match(replyRoute, /if \(!duplicate\) \{[\s\S]*?try \{[\s\S]*?prisma\.advisorFeedback\.createMany[\s\S]*?catch \{[\s\S]*?confirmed reply signal unavailable/);

  const preferenceRoute = read("app/api/mobile/boards/[id]/preference-proposals/[proposalId]/route.ts");
  const preferenceTransaction = preferenceRoute.slice(
    preferenceRoute.indexOf("const result = await prisma.$transaction"),
    preferenceRoute.indexOf("if (result.kind === \"missing\")"),
  );
  assert.doesNotMatch(preferenceTransaction, /advisorFeedback/);
  assert.match(preferenceRoute, /if \(result\.kind === "accepted"\) \{[\s\S]*?try \{[\s\S]*?prisma\.advisorFeedback\.createMany[\s\S]*?catch \{[\s\S]*?confirmed preference signal unavailable/);
});
