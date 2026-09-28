export const ADVISOR_PROACTIVE_BATCH_SIZE = 50;
export const ADVISOR_PROACTIVE_CANDIDATE_LIMIT = 150;
export const ADVISOR_PROACTIVE_WORK_BUDGET_MS = 45_000;
export const ADVISOR_PROACTIVE_LEASE_MS = 2 * 60 * 1_000;

export type RotatingSubscription = {
  id: string;
  validUntil: Date | null;
  proactiveCheckedAt: Date | null;
  proactiveLeaseUntil: Date | null;
  createdAt: Date;
};

export function selectRotatingSubscriptions(
  subscriptions: RotatingSubscription[],
  now: Date,
  limit = ADVISOR_PROACTIVE_BATCH_SIZE,
) {
  return subscriptions
    .filter((subscription) =>
      subscription.validUntil !== null
      && subscription.validUntil >= now
      && (subscription.proactiveLeaseUntil === null || subscription.proactiveLeaseUntil < now))
    .sort((left, right) => {
      const leftChecked = left.proactiveCheckedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightChecked = right.proactiveCheckedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      return leftChecked - rightChecked
        || left.createdAt.getTime() - right.createdAt.getTime()
        || left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}
