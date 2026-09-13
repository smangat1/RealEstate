import type { BoardSubscriptionRecord } from "./types";

export function isDemoAdvisorAccount(user: { isDemoAccount?: boolean; email?: string | null } | null | undefined): boolean {
  return user?.isDemoAccount === true || user?.email?.trim().toLowerCase().endsWith("@homeboard.local") === true;
}

export function demoAdvisorSubscription(boardId: string): BoardSubscriptionRecord {
  return {
    id: `demo-advisor-${boardId}`, boardId, status: "active", tier: "scout_weekly",
    amountCents: 0, currency: "usd", startedAt: null, expiresAt: null,
    fundedCents: 0, targetCents: 0, daysRemaining: 0, contributions: [],
  };
}
