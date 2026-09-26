import { z } from "zod";

import { PREFERENCE_FEATURES, parsePreferenceTalk, type PreferenceSignal } from "@/lib/preference-talk";

const weightSchema = z.union([z.literal(-2), z.literal(-1), z.literal(1), z.literal(2)]);

export const preferenceCandidateSchema = z.object({
  boardId: z.string().trim().min(1).max(120),
  messageId: z.string().uuid(),
  boardRevision: z.string().datetime(),
  source: z.enum(["apple_intelligence", "deterministic_fallback"]),
  signals: z.array(z.object({
    feature: z.enum(PREFERENCE_FEATURES),
    weight: weightSchema,
    evidence: z.string().trim().min(1).max(240),
    intent: z.enum(["preference", "remove_must_have"]),
  }).strict()).min(1).max(4),
}).strict();

export type PreferenceCandidate = z.infer<typeof preferenceCandidateSchema>;
export type PreferenceCandidateValidation =
  | { ok: true; signals: PreferenceSignal[] }
  | { ok: false; reason: "cross_board" | "message_mismatch" | "stale_revision" | "invalid_evidence" };

function normalize(value: string) {
  return value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}

export function validatePreferenceCandidateSubmission(input: {
  candidate: PreferenceCandidate;
  boardId: string;
  messageId: string;
  boardRevision: string;
  content: string;
}): PreferenceCandidateValidation {
  if (input.candidate.boardId !== input.boardId) return { ok: false, reason: "cross_board" };
  if (input.candidate.messageId !== input.messageId) return { ok: false, reason: "message_mismatch" };
  if (input.candidate.boardRevision !== input.boardRevision) return { ok: false, reason: "stale_revision" };

  const serverSignals = parsePreferenceTalk(input.content);
  if (serverSignals.length === 0) return { ok: false, reason: "invalid_evidence" };
  const contentNormalized = normalize(input.content);
  const accepted: PreferenceSignal[] = [];
  const seen = new Set<string>();
  for (const candidateSignal of input.candidate.signals) {
    const evidence = normalize(candidateSignal.evidence);
    if (!evidence || !contentNormalized.includes(evidence)) return { ok: false, reason: "invalid_evidence" };
    const matching = serverSignals.find((signal) =>
      signal.feature === candidateSignal.feature
      && signal.weight === candidateSignal.weight
      && signal.intent === candidateSignal.intent
      && evidence.includes(normalize(signal.evidence)),
    );
    const key = `${candidateSignal.feature}:${candidateSignal.intent}`;
    if (!matching || seen.has(key)) return { ok: false, reason: "invalid_evidence" };
    seen.add(key);
    accepted.push(matching);
  }
  return accepted.length > 0 ? { ok: true, signals: accepted } : { ok: false, reason: "invalid_evidence" };
}
