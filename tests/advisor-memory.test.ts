import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdvisorPickerContext,
  loadAdvisorDraftFeedback,
  settledAdvisorFeedback,
  summarizeAdvisorDraftFeedback,
} from "../lib/advisor-memory";
import { advisorFeedbackRequestSchema } from "../lib/advisor-feedback";

const row = (tone: string, signal: "confirmed" | "rejected" | "revised", templateId = "availability_standard", subjectId?: string) => ({
  subjectId,
  signal,
  reasonCode: signal === "rejected" ? "bad_tone" : null,
  snapshot: { tone, templateId },
});

test("board feedback stays neutral below the small-sample threshold", () => {
  assert.deepEqual(summarizeAdvisorDraftFeedback([
    row("Casual", "confirmed"),
    row("Casual", "confirmed"),
  ]), { sampleSize: 0, signals: [] });
});

test("board feedback aggregates bounded tone and template identifiers", () => {
  const summary = summarizeAdvisorDraftFeedback([
    row("Casual", "confirmed", "availability_standard", "draft-1"),
    row("Casual", "confirmed", "availability_standard", "draft-2"),
    row("Stern", "rejected", "availability_concise", "draft-3"),
  ]);
  assert.equal(summary.sampleSize, 3);
  assert.equal(summary.signals.find((signal) => signal.tone === "Casual")?.count, 2);
  assert.equal(summary.signals.find((signal) => signal.tone === "Stern")?.reasonCode, "bad_tone");
});

test("several signals about one draft do not bypass the small-sample guard", () => {
  assert.deepEqual(summarizeAdvisorDraftFeedback([
    row("Casual", "confirmed", "availability_standard", "draft-1"),
    row("Casual", "revised", "availability_standard", "draft-1"),
    row("Casual", "rejected", "availability_standard", "draft-1"),
  ]), { sampleSize: 0, signals: [] });
});

test("missing AdvisorFeedback table and generic failures never fail the draft path", async () => {
  const diagnostics: string[] = [];
  for (const error of [{ code: "P2021" }, new Error("network details must stay private")]) {
    const summary = await loadAdvisorDraftFeedback({
      query: async () => { throw error; },
      diagnostic: (message) => diagnostics.push(message),
    });
    assert.deepEqual(summary, { sampleSize: 0, signals: [] });
  }
  assert.deepEqual(diagnostics, [
    "[advisor-memory] feedback unavailable code=P2021",
    "[advisor-memory] feedback unavailable code=unknown",
  ]);
  assert.doesNotMatch(diagnostics.join(" "), /network details/);
});

test("optional feedback lookup cannot hold up the required draft path", async () => {
  const pending = new Promise<never>(() => {});
  assert.deepEqual(await settledAdvisorFeedback(pending), { sampleSize: 0, signals: [] });
});

test("picker context is target-scoped and derives reported outreach stage without draft text", () => {
  const now = new Date("2026-10-02T12:00:00.000Z");
  const picker = buildAdvisorPickerContext({
    targetListingBoardId: "listing-a",
    now,
    history: [
      {
        boardListingId: "listing-b", status: "answered", templateId: "other",
        contactedAt: now, sentAt: now, answeredAt: now, staleAt: null, createdAt: now,
      },
      {
        boardListingId: "listing-a", status: "reported_sent", templateId: "availability_concise",
        contactedAt: new Date("2026-09-28T12:00:00.000Z"), sentAt: null,
        answeredAt: null, staleAt: null, createdAt: new Date("2026-09-28T12:00:00.000Z"),
      },
    ],
  });
  assert.equal(picker.conversationStage, "sent");
  assert.equal(picker.listingHistory.length, 1);
  assert.equal(picker.listingHistory[0]?.daysSinceContact, 4);
  assert.doesNotMatch(JSON.stringify(picker), /body|replyText|draftText/);
});

test("draft feedback accepts an identifier but rejects draft and financial content", () => {
  const base = {
    subjectType: "draft",
    subjectId: "message-1",
    signal: "confirmed",
  } as const;
  assert.equal(advisorFeedbackRequestSchema.safeParse({
    ...base,
    snapshot: { tone: "Casual", templateId: "availability_concise" },
  }).success, true);
  assert.equal(advisorFeedbackRequestSchema.safeParse({
    ...base,
    snapshot: { tone: "Casual", templateId: "availability_concise", draftText: "private text" },
  }).success, false);
  assert.equal(advisorFeedbackRequestSchema.safeParse({
    ...base,
    snapshot: { tone: "Casual", annualIncome: 200_000 },
  }).success, false);
});
