export const ADVISOR_ACTION_KINDS = [
  "fit_summary",
  "listing_change",
  "conflict",
  "inquiry_draft",
  "follow_up_draft",
  "reply_summary",
  "decision_digest",
  "archive_suggestion",
  "tour_note_summary",
  "application_checklist",
] as const;

export type AdvisorActionKind = (typeof ADVISOR_ACTION_KINDS)[number];
export type AdvisorActionStatus = "open" | "completed" | "dismissed";
export type AdvisorActionPriority = "low" | "medium" | "high" | "critical";
export type AdvisorFactSource =
  | "listing"
  | "profile"
  | "fit_score"
  | "commute"
  | "rent_split"
  | "vote"
  | "review"
  | "source"
  | "history"
  | "inquiry"
  | "tour_note"
  | "application";

export type AdvisorFact = {
  key: string;
  label: string;
  value: string;
  source: AdvisorFactSource;
  severity?: "info" | "positive" | "warning" | "critical";
};

export type AdvisorSourceLink = {
  label: string;
  url: string;
  provider?: string | null;
  observedAt?: string | null;
};

export type AdvisorActionCommand = {
  type:
    | "open_listing"
    | "check_listing"
    | "review_inquiry"
    | "review_follow_up"
    | "review_reply"
    | "open_application_checklist"
    | "archive_listing"
    | "open_source"
    | "dismiss";
  label: string;
  payload: Record<string, string>;
  requiresReview: boolean;
};

/**
 * The single transport and persistence format for every Advisor surface.
 * Narrative may be reworded on-device, but facts, sources, commands and IDs
 * always come from the server and are never model-authored.
 */
export type AdvisorActionRecord = {
  schemaVersion: 1;
  id: string;
  boardId: string;
  boardListingId: string | null;
  listingId: string | null;
  kind: AdvisorActionKind;
  status: AdvisorActionStatus;
  priority: AdvisorActionPriority;
  title: string;
  summary: string;
  whyItMatters: string;
  facts: AdvisorFact[];
  sourceLinks: AdvisorSourceLink[];
  primaryAction: AdvisorActionCommand;
  secondaryActions: AdvisorActionCommand[];
  engine: "deterministic" | "apple_intelligence_wording";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type AdvisorActionDraft = Omit<
  AdvisorActionRecord,
  "id" | "status" | "engine" | "createdAt" | "updatedAt" | "completedAt"
> & {
  fingerprint: string;
};

export type ListingObservation = {
  sourceUrl: string | null;
  price: number | null;
  fees: Record<string, unknown>;
  availableDate: string | null;
  status: "active" | "unknown" | "removed" | "rented" | "saved_only";
  providerStatus: string | null;
  observedAt: string;
  sourceFacts: Record<string, unknown>;
};

export type ListingChangeRecord = {
  id: string;
  boardListingId: string;
  kind: "price" | "fee" | "availability" | "status";
  field: string;
  beforeValue: unknown;
  afterValue: unknown;
  explanation: string;
  whyItMatters: string;
  sourceUrl: string | null;
  detectedAt: string;
};

export type InquiryStatus = "drafted" | "sent" | "answered" | "stale";

export type ListingInquiryRecord = {
  id: string;
  boardListingId: string;
  userId: string;
  userName?: string;
  status: InquiryStatus;
  templateKey: string;
  subject: string | null;
  body: string | null;
  method: "email" | "portal" | "phone";
  notes: string | null;
  contactedAt: string | null;
  sentAt: string | null;
  answeredAt: string | null;
  staleAt: string | null;
  lastFollowUpAt: string | null;
  replyText: string | null;
  replyFacts: AgentReplyFacts | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentReplyFacts = {
  availability: string | null;
  fees: string[];
  tourTimes: string[];
  requirements: string[];
  nextSteps: string[];
  unansweredQuestions: string[];
};

export type TourNoteSummary = {
  pros: string[];
  cons: string[];
  concerns: string[];
  followUps: string[];
};

export type ApplicationChecklistItemRecord = {
  id: string;
  boardListingId: string;
  key: string;
  label: string;
  detail: string | null;
  status: "missing" | "ready" | "submitted" | "waived";
  assignedUserId: string | null;
  required: boolean;
  createdAt: string;
  updatedAt: string;
};
