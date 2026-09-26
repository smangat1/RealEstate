import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildPreferenceProposal } from "../lib/advisor-preference-proposals";
import {
  preferenceCandidateSchema,
  validatePreferenceCandidateSubmission,
  type PreferenceCandidate,
} from "../lib/preference-candidate";
import { parsePreferenceTalk } from "../lib/preference-talk";

const boardId = "board-a";
const messageId = "d39f890d-3c13-4ee5-b66f-2a30d7e85109";
const boardRevision = "2026-09-26T12:00:00.000Z";
const profile = {
  commutePriority: "medium",
  neighborhoodPriority: "medium",
  spacePriority: "medium",
  privacyPriority: "medium",
  mustHaves: JSON.stringify(["Garage parking", "Gym", "Dishwasher"]),
  preferenceSignals: {},
};

function candidate(content: string, overrides: Partial<PreferenceCandidate> = {}): PreferenceCandidate {
  const signals = parsePreferenceTalk(content).map(({ feature, weight, evidence, intent }) => ({
    feature, weight, evidence, intent,
  }));
  return {
    boardId,
    messageId,
    boardRevision,
    source: "deterministic_fallback",
    signals,
    ...overrides,
  };
}

test("explicit first-person preferences produce one bounded, accurate candidate", () => {
  const content = "I really need parking and I prefer natural light.";
  const submitted = candidate(content);
  assert.equal(submitted.signals.length, 2);
  assert.deepEqual(validatePreferenceCandidateSubmission({
    candidate: submitted,
    boardId,
    messageId,
    boardRevision,
    content,
  }), { ok: true, signals: parsePreferenceTalk(content) });

  const changes = buildPreferenceProposal(profile, parsePreferenceTalk(content));
  assert.equal(changes.some((change) => change.field === "preferenceSignals.parking"), true);
  assert.equal(changes.some((change) => change.field === "preferenceSignals.natural_light"), true);
  assert.equal(changes.some((change) => change.field === "mustHaves"), false);
});

test("uncertain, quoted, hypothetical, conflicting, shared, and third-party text stages nothing", () => {
  const unsafe = [
    "Maybe I need parking.",
    "I said \"I need parking\" yesterday.",
    "If I needed parking, that place would work.",
    "I need parking, but I don't care about parking.",
    "We need parking.",
    "My roommate needs parking.",
    "She wants a gym.",
    "Sam says I need parking.",
    "The phrase 'I need parking' appeared in the listing notes.",
    "I guess I need parking.",
    "I need parking, but I don't care about the garage.",
  ];
  for (const content of unsafe) assert.deepEqual(parsePreferenceTalk(content), [], content);
});

test("only explicit first-person negation removes the named must-have", () => {
  const loose = buildPreferenceProposal(profile, parsePreferenceTalk("I don't care about parking"));
  assert.equal(loose.some((change) => change.field === "mustHaves"), false);

  const explicit = buildPreferenceProposal(profile, parsePreferenceTalk("I don't need parking anymore"));
  assert.deepEqual(explicit.find((change) => change.field === "mustHaves"), {
    field: "mustHaves",
    label: "Must-haves",
    oldValue: ["Garage parking", "Gym", "Dishwasher"],
    newValue: ["Gym", "Dishwasher"],
  });
});

test("server rejects malformed, cross-board, replayed, stale, and unsupported candidates", () => {
  const content = "I need parking";
  assert.equal(preferenceCandidateSchema.safeParse({ boardId, messageId, boardRevision, source: "apple_intelligence", signals: [] }).success, false);
  assert.equal(preferenceCandidateSchema.safeParse({
    boardId, messageId, boardRevision, source: "remote_model", signals: candidate(content).signals,
  }).success, false);

  for (const expected of [
    { overrides: { boardId: "board-b" }, reason: "cross_board" },
    { overrides: { messageId: "164b0614-ae80-4e88-87fc-32e2c6904b5a" }, reason: "message_mismatch" },
    { overrides: { boardRevision: "2026-09-26T11:59:00.000Z" }, reason: "stale_revision" },
  ] as const) {
    const result = validatePreferenceCandidateSubmission({
      candidate: candidate(content, expected.overrides), boardId, messageId, boardRevision, content,
    });
    assert.deepEqual(result, { ok: false, reason: expected.reason });
  }

  const fabricated = candidate(content);
  fabricated.signals[0] = { ...fabricated.signals[0], feature: "gym", evidence: "I need a gym" };
  assert.deepEqual(validatePreferenceCandidateSubmission({
    candidate: fabricated, boardId, messageId, boardRevision, content,
  }), { ok: false, reason: "invalid_evidence" });
});

test("client uses on-device Apple Intelligence with deterministic fallback; server verifies persisted ownership", () => {
  const generator = readFileSync(resolve("ios/HomeboardNative/HomeboardNative/Sources/AdvisorDraftGenerator.swift"), "utf8");
  const appModel = readFileSync(resolve("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift"), "utf8");
  const service = readFileSync(resolve("lib/advisor-preference-service.ts"), "utf8");
  assert.match(generator, /SystemLanguageModel\.default\.isAvailable/);
  assert.match(generator, /appleIntelligenceSignals/);
  assert.match(generator, /source: "deterministic_fallback"/);
  assert.match(generator, /Never provide a confidence score/);
  assert.match(appModel, /AdvisorPreferenceExtractor\.extract/);
  assert.match(service, /authorUserId: input\.userId/);
  assert.match(service, /boardId: input\.boardId/);
  assert.match(service, /content: input\.content\.trim\(\)/);
});
