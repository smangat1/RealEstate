export type AdvisorNotificationKind =
  | "listing_change"
  | "advisor_follow_up"
  | "negotiation_comp"
  | "scam_warning"
  | "advisor_group_nag";

export type AdvisorNotificationEventInput = {
  kind: AdvisorNotificationKind;
  urgent: boolean;
  title: string;
  body: string;
};

export const DEFAULT_ADVISOR_DIGEST_HOUR = 18;
export const DEFAULT_ADVISOR_TIME_ZONE = "America/New_York";
export const MIN_ADVISOR_DIGEST_HOUR = 7;
export const MAX_ADVISOR_DIGEST_HOUR = 21;

const digestLabels: Record<AdvisorNotificationKind, string> = {
  listing_change: "listing update",
  advisor_follow_up: "follow-up draft",
  negotiation_comp: "negotiation flag",
  scam_warning: "verification warning",
  advisor_group_nag: "group check-in",
};

export function isValidAdvisorTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function localHour(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isInteger(value) ? value : null;
}

export function isAdvisorDigestWindow(now: Date, timeZone: string, digestHourLocal: number) {
  if (!isValidAdvisorTimeZone(timeZone)) return false;
  if (!Number.isInteger(digestHourLocal)
      || digestHourLocal < MIN_ADVISOR_DIGEST_HOUR
      || digestHourLocal > MAX_ADVISOR_DIGEST_HOUR) return false;
  return localHour(now, timeZone) === digestHourLocal;
}

export function isUrgentAdvisorNotification(input: {
  kind: AdvisorNotificationKind;
  verifiedUnavailableTransition?: boolean;
}) {
  // Keep this deliberately narrow: a fresh, real transition to unavailable
  // and a safety verification warning are the only proactive interruptions.
  return input.kind === "scam_warning"
    || (input.kind === "listing_change" && input.verifiedUnavailableTransition === true);
}

export function buildAdvisorDigest(input: {
  boardTitle: string;
  events: AdvisorNotificationEventInput[];
}) {
  const counts = new Map<AdvisorNotificationKind, number>();
  for (const event of input.events) {
    if (event.urgent) continue;
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  }
  const parts = Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${count} ${digestLabels[kind]}${count === 1 ? "" : "s"}`);
  const total = parts.reduce((sum, part) => {
    const count = Number(part.split(" ", 1)[0]);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);
  return {
    title: `${input.boardTitle || "Homeboard"} · Advisor digest`,
    body: total === 0
      ? "No new Advisor updates."
      : `${parts.join(", ")} ${total === 1 ? "is" : "are"} ready to review.`,
    total,
  };
}

export type AdvisorDeliveryPlan = "urgent" | "digest" | "wait" | "suppress";

export function planAdvisorDelivery(input: {
  urgent: boolean;
  isCurrentMember: boolean;
  nonCriticalPushEnabled: boolean;
  now: Date;
  timeZone: string;
  digestHourLocal: number;
}): AdvisorDeliveryPlan {
  if (!input.isCurrentMember) return "suppress";
  if (input.urgent) return "urgent";
  if (!input.nonCriticalPushEnabled) return "suppress";
  return isAdvisorDigestWindow(input.now, input.timeZone, input.digestHourLocal)
    ? "digest"
    : "wait";
}
