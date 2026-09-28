import { createHash } from "node:crypto";

export type ReplyOutreachCandidate = {
  id: string;
  boardListingId: string;
};

export type ReplyOutreachSelection =
  | { ok: true; outreach: ReplyOutreachCandidate }
  | { ok: false; reason: "missing" | "ambiguous" | "mismatch" };

/**
 * A listing is already an explicit user choice. We only infer its outreach
 * when there is exactly one eligible record; multiple records require the
 * client to send the outreach id the member reviewed.
 */
export function selectReplyOutreach(
  candidates: ReplyOutreachCandidate[],
  boardListingId: string,
  requestedOutreachId?: string,
): ReplyOutreachSelection {
  const eligible = candidates.filter((candidate) => candidate.boardListingId === boardListingId);
  if (requestedOutreachId) {
    const selected = eligible.find((candidate) => candidate.id === requestedOutreachId);
    return selected ? { ok: true, outreach: selected } : { ok: false, reason: "mismatch" };
  }
  if (eligible.length === 1) return { ok: true, outreach: eligible[0]! };
  return { ok: false, reason: eligible.length === 0 ? "missing" : "ambiguous" };
}

export function replyConfirmationFingerprint(input: {
  boardId: string;
  outreachId: string;
  confirmationId?: string;
  text: string;
}) {
  const identity = input.confirmationId
    ? `confirmation:${input.confirmationId}`
    : `legacy-text:${input.text}`;
  const digest = createHash("sha256")
    .update(`${input.boardId}:${input.outreachId}:${identity}`)
    .digest("hex");
  return `reply:${digest}`;
}

export function pendingFollowUpSuppressionScope(boardId: string, outreachId: string) {
  return {
    status: "pending",
    event: {
      boardId,
      fingerprint: `follow-up:${outreachId}`,
    },
  } as const;
}
