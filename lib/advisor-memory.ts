export const ADVISOR_MEMORY_MIN_SAMPLES = 3;

export type AdvisorFeedbackMemorySignal = {
  tone: string | null;
  templateId: string | null;
  signal: "confirmed" | "rejected" | "revised";
  reasonCode: string | null;
  count: number;
};

export type AdvisorFeedbackMemorySummary = {
  sampleSize: number;
  signals: AdvisorFeedbackMemorySignal[];
};

export type AdvisorOutreachHistory = {
  boardListingId: string;
  status: string;
  templateId: string;
  contactedAt: Date | null;
  sentAt: Date | null;
  answeredAt: Date | null;
  staleAt: Date | null;
  createdAt: Date;
};

export type AdvisorPickerContext = {
  conversationStage: "none" | "drafted" | "sent" | "replied" | "stale";
  listingHistory: Array<{
    boardListingId: string;
    status: string;
    templateId: string;
    contactedAt: string | null;
    answered: boolean;
    daysSinceContact: number | null;
  }>;
  boardFeedback: AdvisorFeedbackMemorySummary;
};

type AdvisorFeedbackRow = {
  subjectId?: string;
  signal: string;
  reasonCode: string | null;
  snapshot: unknown;
};

const EMPTY_SUMMARY: AdvisorFeedbackMemorySummary = { sampleSize: 0, signals: [] };
const allowedSignals = new Set(["confirmed", "rejected", "revised"]);
const allowedReasons = new Set(["wrong_listing", "wrong_fact", "not_relevant", "bad_tone", "other"]);

function boundedIdentifier(value: unknown, maximum = 64) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maximum ? trimmed : null;
}

export function summarizeAdvisorDraftFeedback(
  rows: AdvisorFeedbackRow[],
): AdvisorFeedbackMemorySummary {
  const safeRows = rows.flatMap((row, index) => {
    if (!allowedSignals.has(row.signal)) return [];
    const snapshot = row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot)
      ? row.snapshot as Record<string, unknown>
      : {};
    return [{
      subjectId: boundedIdentifier(row.subjectId, 128) ?? `legacy-${index}`,
      tone: boundedIdentifier(snapshot.tone),
      templateId: boundedIdentifier(snapshot.templateId),
      signal: row.signal as AdvisorFeedbackMemorySignal["signal"],
      reasonCode: allowedReasons.has(row.reasonCode ?? "") ? row.reasonCode : null,
    }];
  });

  const sampleSize = new Set(safeRows.map((row) => row.subjectId)).size;
  if (sampleSize < ADVISOR_MEMORY_MIN_SAMPLES) return EMPTY_SUMMARY;

  const counts = new Map<string, AdvisorFeedbackMemorySignal>();
  for (const row of safeRows) {
    const key = [row.tone ?? "", row.templateId ?? "", row.signal, row.reasonCode ?? ""].join("\u0000");
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, {
        tone: row.tone,
        templateId: row.templateId,
        signal: row.signal,
        reasonCode: row.reasonCode,
        count: 1,
      });
    }
  }

  return {
    sampleSize,
    signals: Array.from(counts.values()).sort((left, right) =>
      `${left.tone ?? ""}:${left.templateId ?? ""}:${left.signal}:${left.reasonCode ?? ""}`
        .localeCompare(`${right.tone ?? ""}:${right.templateId ?? ""}:${right.signal}:${right.reasonCode ?? ""}`)),
  };
}

export async function loadAdvisorDraftFeedback(input: {
  query: () => Promise<AdvisorFeedbackRow[]>;
  diagnostic?: (message: string) => void;
}): Promise<AdvisorFeedbackMemorySummary> {
  try {
    return summarizeAdvisorDraftFeedback(await input.query());
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "unknown")
      : "unknown";
    input.diagnostic?.(`[advisor-memory] feedback unavailable code=${code}`);
    return EMPTY_SUMMARY;
  }
}

/**
 * Feedback is optional. The caller starts the lookup beside required board work,
 * then uses it only if it has completed by the next event-loop turn.
 */
export async function settledAdvisorFeedback(
  lookup: Promise<AdvisorFeedbackMemorySummary>,
): Promise<AdvisorFeedbackMemorySummary> {
  return Promise.race([
    lookup,
    new Promise<AdvisorFeedbackMemorySummary>((resolve) => {
      setTimeout(() => resolve(EMPTY_SUMMARY), 0);
    }),
  ]);
}

export function buildAdvisorPickerContext(input: {
  targetListingBoardId: string | null;
  history: AdvisorOutreachHistory[];
  boardFeedback?: AdvisorFeedbackMemorySummary;
  now?: Date;
}): AdvisorPickerContext {
  const now = input.now ?? new Date();
  const history = input.history
    .filter((entry) => !input.targetListingBoardId || entry.boardListingId === input.targetListingBoardId)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 12);
  const latest = history[0];
  const conversationStage = !latest
    ? "none"
    : latest.answeredAt || latest.status === "answered"
      ? "replied"
      : latest.staleAt || latest.status === "stale"
        ? "stale"
        : latest.sentAt || ["sent", "reported_sent"].includes(latest.status)
          ? "sent"
          : "drafted";
  return {
    conversationStage,
    listingHistory: history.map((entry) => {
      const contactedAt = entry.sentAt ?? entry.contactedAt;
      return {
        boardListingId: entry.boardListingId,
        status: entry.status,
        templateId: entry.templateId,
        contactedAt: contactedAt?.toISOString() ?? null,
        answered: Boolean(entry.answeredAt),
        daysSinceContact: contactedAt
          ? Math.max(0, Math.floor((now.getTime() - contactedAt.getTime()) / 86_400_000))
          : null,
      };
    }),
    boardFeedback: input.boardFeedback ?? EMPTY_SUMMARY,
  };
}
