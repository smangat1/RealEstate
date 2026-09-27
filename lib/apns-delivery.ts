export type BoardPushAttemptResult = {
  configured: boolean;
  attempted: number;
  delivered: number;
  accepted: number;
  definitiveRejected: number;
  uncertain: number;
};

export type AdvisorPushDeliveryOutcome =
  | "not_configured"
  | "no_device"
  | "accepted"
  | "partial"
  | "rejected"
  | "uncertain";

export function classifyBoardPushAttempt(input: {
  configured: boolean;
  statuses: number[];
}): BoardPushAttemptResult {
  const accepted = input.statuses.filter((status) => status === 200).length;
  const uncertain = input.statuses.filter((status) => status === 0).length;
  const definitiveRejected = input.statuses.length - accepted - uncertain;
  return {
    configured: input.configured,
    attempted: input.statuses.length,
    delivered: accepted,
    accepted,
    definitiveRejected,
    uncertain,
  };
}

export function classifyAdvisorPushDelivery(result: BoardPushAttemptResult): AdvisorPushDeliveryOutcome {
  if (!result.configured) return "not_configured";
  if (result.attempted === 0) return "no_device";
  if (result.accepted > 0) {
    return result.definitiveRejected > 0 || result.uncertain > 0 ? "partial" : "accepted";
  }
  if (result.uncertain > 0) return "uncertain";
  return "rejected";
}

export function advisorDeliveryLeaseIsAvailable(
  delivery: { leaseUntil: Date | null },
  now: Date,
) {
  return delivery.leaseUntil === null || delivery.leaseUntil < now;
}
