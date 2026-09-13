/** Pure subscription-split helpers. No server-only imports. */

export const SCOUT_WEEKLY_AMOUNT_CENTS = 499;
export const SCOUT_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type SplitCalculation = {
  totalAmountCents: number;
  perRoommateCents: number;
  remainderCents: number;
  sharesByUserId: Record<string, number>;
};

/**
 * Splits the Scout weekly fee evenly across all board members.
 * Any remainder cents (due to integer division) are assigned to the initiator (first member).
 */
export function calculateEqualSplit(
  memberUserIds: string[],
  totalCents = SCOUT_WEEKLY_AMOUNT_CENTS,
): SplitCalculation {
  const uniqueMembers = [...new Set(memberUserIds.filter(Boolean))];
  const count = Math.max(uniqueMembers.length, 1);
  const perRoommate = Math.floor(totalCents / count);
  const remainder = totalCents - perRoommate * count;

  const sharesByUserId: Record<string, number> = {};
  uniqueMembers.forEach((id, idx) => {
    sharesByUserId[id] = perRoommate + (idx === 0 ? remainder : 0);
  });

  return {
    totalAmountCents: totalCents,
    perRoommateCents: perRoommate,
    remainderCents: remainder,
    sharesByUserId,
  };
}
