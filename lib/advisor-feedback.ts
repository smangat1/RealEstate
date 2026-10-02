import { z } from "zod";

const reasonCode = z.enum(["wrong_listing", "wrong_fact", "not_relevant", "bad_tone", "other"]);
const common = {
  subjectId: z.string().trim().min(1).max(128),
  signal: z.enum(["rejected", "revised", "confirmed"]),
  reasonCode: reasonCode.optional(),
  note: z.string().trim().max(280).optional(),
  engine: z.string().trim().min(1).max(64).optional(),
  subjectKind: z.string().trim().min(1).max(64).optional(),
  boardListingId: z.string().trim().min(1).max(128).optional(),
};

export const advisorFeedbackRequestSchema = z.discriminatedUnion("subjectType", [
  z.object({
    ...common,
    subjectType: z.literal("action"),
    snapshot: z.object({ kind: z.string().max(64), listingId: z.string().max(128).optional() }).strict(),
  }).strict(),
  z.object({
    ...common,
    subjectType: z.literal("reply_extraction"),
    snapshot: z.object({
      listingId: z.string().max(128),
      outreachId: z.string().max(128),
      source: z.enum(["apple_intelligence", "on_device_ocr", "manual"]),
    }).strict(),
  }).strict(),
  z.object({
    ...common,
    subjectType: z.literal("preference_proposal"),
    snapshot: z.object({ changeFields: z.array(z.string().max(64)).max(24) }).strict(),
  }).strict(),
  z.object({
    ...common,
    subjectType: z.literal("draft"),
    snapshot: z.object({
      tone: z.string().max(64),
      generationSource: z.string().max(64).optional(),
      executionStatus: z.string().max(64).optional(),
    }).strict(),
  }).strict(),
]);

export type AdvisorFeedbackRequest = z.infer<typeof advisorFeedbackRequestSchema>;

export function feedbackSubjectMatchesBoard(input: {
  requestedBoardId: string;
  subjectBoardId: string | null | undefined;
  requestedListingId?: string;
  subjectListingId?: string | null;
}) {
  if (!input.subjectBoardId || input.subjectBoardId !== input.requestedBoardId) return false;
  return !input.requestedListingId || input.requestedListingId === input.subjectListingId;
}
