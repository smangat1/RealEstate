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
export const DEFAULT_ADVISOR_TIME_ZONE = "UTC";
export const MIN_ADVISOR_DIGEST_HOUR = 7;
export const MAX_ADVISOR_DIGEST_HOUR = 21;
export const LAST_ADVISOR_DIGEST_HOUR = 21;

export function advisorNotificationPreferenceKey(boardId: string, authenticatedUserId: string) {
  return { boardId_userId: { boardId, userId: authenticatedUserId } };
}

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

export function initialAdvisorTimeZone(deviceTimeZones: Array<string | null | undefined>) {
  return deviceTimeZones.find((value): value is string =>
    typeof value === "string" && isValidAdvisorTimeZone(value))
    ?? DEFAULT_ADVISOR_TIME_ZONE;
}

export function advisorTimeZoneAfterDeviceRegistration(input: {
  storedTimeZone: string;
  timeZoneSource: string;
  deviceTimeZone: string;
}) {
  return input.timeZoneSource === "fallback" && isValidAdvisorTimeZone(input.deviceTimeZone)
    ? input.deviceTimeZone
    : input.storedTimeZone;
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

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

export function advisorLocalDateKey(now: Date, timeZone: string) {
  if (!isValidAdvisorTimeZone(timeZone)) return null;
  const parts = localParts(now, timeZone);
  if (![parts.year, parts.month, parts.day].every(Number.isInteger)) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function nextAdvisorDigestAt(after: Date, timeZone: string, digestHourLocal: number) {
  if (!isValidAdvisorTimeZone(timeZone)
      || !Number.isInteger(digestHourLocal)
      || digestHourLocal < MIN_ADVISOR_DIGEST_HOUR
      || digestHourLocal > MAX_ADVISOR_DIGEST_HOUR) return null;

  const minute = 60 * 1_000;
  const start = new Date(Math.floor(after.getTime() / minute) * minute + minute);
  for (let offset = 0; offset <= 72 * 60; offset += 1) {
    const candidate = new Date(start.getTime() + offset * minute);
    const parts = localParts(candidate, timeZone);
    if (parts.hour === digestHourLocal && parts.minute === 0) return candidate;
  }
  return null;
}

export function isAdvisorDigestDue(input: {
  now: Date;
  nextDigestAt: Date;
  timeZone: string;
  digestHourLocal: number;
  lastDigestLocalDate?: string | null;
}) {
  if (!isValidAdvisorTimeZone(input.timeZone) || input.now < input.nextDigestAt) return false;
  const hour = localHour(input.now, input.timeZone);
  const localDate = advisorLocalDateKey(input.now, input.timeZone);
  if (hour === null || localDate === null) return false;
  if (input.lastDigestLocalDate === localDate) return false;
  return hour >= input.digestHourLocal && hour <= LAST_ADVISOR_DIGEST_HOUR;
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

export type AdvisorDigestPreferenceCandidate = {
  id: string;
  boardId: string;
  userId: string;
  nonCriticalPushEnabled: boolean;
  nextDigestAt: Date;
  digestLeaseUntil: Date | null;
};

export function selectFairDigestCandidates(input: {
  preferences: AdvisorDigestPreferenceCandidate[];
  pendingBoardMemberKeys: Set<string>;
  now: Date;
  limit: number;
}) {
  return input.preferences
    .filter((preference) =>
      input.pendingBoardMemberKeys.has(`${preference.boardId}:${preference.userId}`)
      && (preference.digestLeaseUntil === null || preference.digestLeaseUntil < input.now)
      && (!preference.nonCriticalPushEnabled || preference.nextDigestAt <= input.now))
    .sort((left, right) =>
      left.nextDigestAt.getTime() - right.nextDigestAt.getTime()
      || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, input.limit));
}

export function planAdvisorDelivery(input: {
  urgent: boolean;
  isCurrentMember: boolean;
  nonCriticalPushEnabled: boolean;
  now: Date;
  timeZone: string;
  digestHourLocal: number;
  nextDigestAt?: Date;
  lastDigestLocalDate?: string | null;
}): AdvisorDeliveryPlan {
  if (!input.isCurrentMember) return "suppress";
  if (input.urgent) return "urgent";
  if (!input.nonCriticalPushEnabled) return "suppress";
  const due = input.nextDigestAt
    ? isAdvisorDigestDue({
        now: input.now,
        nextDigestAt: input.nextDigestAt,
        timeZone: input.timeZone,
        digestHourLocal: input.digestHourLocal,
        lastDigestLocalDate: input.lastDigestLocalDate,
      })
    : isAdvisorDigestWindow(input.now, input.timeZone, input.digestHourLocal);
  return due
    ? "digest"
    : "wait";
}
