/**
 * scout-utils.ts
 * Pure utility functions for the Homeboard Scout monetization feature.
 * No server-only imports — safe to use in tests and client code.
 */

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

export type PriceDropAlert = {
  direction: "drop";
  listingId: string;
  address: string;
  oldPrice: number;
  newPrice: number;
  dropAmount: number;
  percentDrop: number;
};

export type PriceIncreaseAlert = {
  direction: "increase";
  listingId: string;
  address: string;
  oldPrice: number;
  newPrice: number;
  increaseAmount: number;
  percentIncrease: number;
};

export type PriceChangeAlert = PriceDropAlert | PriceIncreaseAlert;

const MIN_CHANGE_PCT = 1; // ignore noise below 1%

/**
 * Detects any meaningful price change (drop or increase) between two observations.
 * Returns null if prices are equal, invalid, or the change is below the noise threshold.
 */
export function detectPriceChange(
  previousPrice: number,
  currentPrice: number,
): PriceChangeAlert | null {
  if (previousPrice <= 0 || currentPrice <= 0 || previousPrice === currentPrice) {
    return null;
  }
  const diff = currentPrice - previousPrice;
  const pct = Math.round((Math.abs(diff) / previousPrice) * 100);
  if (pct < MIN_CHANGE_PCT) return null;

  if (diff < 0) {
    // Price went down
    const dropAmount = previousPrice - currentPrice;
    return {
      direction: "drop",
      listingId: "",
      address: "",
      oldPrice: previousPrice,
      newPrice: currentPrice,
      dropAmount,
      percentDrop: pct,
    };
  } else {
    // Price went up
    return {
      direction: "increase",
      listingId: "",
      address: "",
      oldPrice: previousPrice,
      newPrice: currentPrice,
      increaseAmount: diff,
      percentIncrease: pct,
    };
  }
}

/**
 * @deprecated Use detectPriceChange() which handles both directions.
 * Kept for backward compatibility with existing tests.
 */
export function detectPriceDrop(
  previousPrice: number,
  currentPrice: number,
): PriceDropAlert | null {
  const change = detectPriceChange(previousPrice, currentPrice);
  if (!change || change.direction !== "drop") return null;
  return change;
}

/**
 * Generates a professional, tailored broker outreach email body for the group.
 */
export function generateBrokerPitch(params: {
  listingAddress: string;
  neighborhood?: string;
  monthlyRent?: number;
  roommateCount: number;
  combinedBudgetMax?: number;
  moveInDate?: string;
  senderName?: string;
}): string {
  const {
    listingAddress,
    neighborhood,
    monthlyRent,
    roommateCount,
    combinedBudgetMax,
    moveInDate,
    senderName,
  } = params;

  const loc = neighborhood ? `${listingAddress} in ${neighborhood}` : listingAddress;
  const rentMention = monthlyRent ? ` (listed at $${monthlyRent.toLocaleString()}/mo)` : "";
  const groupDescription =
    roommateCount > 1
      ? `my ${roommateCount - 1} roommate${roommateCount > 2 ? "s" : ""} and myself (${roommateCount} working professionals)`
      : "myself";
  const budgetNotice = combinedBudgetMax
    ? `Our comfortable group budget aligns well with the listing.`
    : "";
  const moveInNotice = moveInDate
    ? `We are targeting a move-in around ${moveInDate} for a standard 12-month lease.`
    : "We are ready to move quickly on the right lease.";
  const signoff = senderName
    ? `Best regards,\n${senderName} and group`
    : "Best regards,\nThe prospective tenants";

  return `Hello,

I saw the listing for ${loc}${rentMention} and wanted to inquire about its current availability.

A quick intro: ${groupDescription} are looking for our next home. We have verified employment, combined income well exceeding standard 40x requirements, strong credit scores, and complete paperwork ready. ${budgetNotice} ${moveInNotice}

Could we schedule an in-person or virtual tour this week? We are happy to accommodate your earliest showing window.

${signoff}`;
}
