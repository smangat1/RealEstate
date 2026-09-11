import { z } from "zod";

export const GROUP_DECISION_REQUIRES_TWO_MEMBERS = "GROUP_DECISION_REQUIRES_TWO_MEMBERS";

export const listingDecisionActionSchema = z.object({
  action: z.literal("vote").optional(),
  type: z.enum(["shortlist", "request_viewing", "apply"]),
  choice: z.enum(["yes", "no", "abstain"]),
}).strict();

type DecisionEvent = {
  eventType: string;
  content: string;
  createdAt: string | Date;
};

/** A question's latest explicit action wins, including reopening a resolved one. */
export function pendingBoardQuestions(events: readonly DecisionEvent[]): string[] {
  const seen = new Set<string>();
  const pending: string[] = [];
  const newestFirst = [...events].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  for (const event of newestFirst) {
    if (event.eventType !== "decision_opened" && event.eventType !== "decision_resolved") continue;
    const question = (event.eventType === "decision_resolved"
      ? event.content.split(" || ")[0]
      : event.content)?.trim();
    if (!question) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (event.eventType === "decision_opened") pending.push(question);
  }
  return pending;
}
