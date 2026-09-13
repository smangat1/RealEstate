import { createHash } from "node:crypto";

import type { RentSplit } from "@/lib/group-affordability";
import type { GroupListingAnalysis } from "@/lib/types";
import type {
  AdvisorActionDraft,
  AdvisorActionPriority,
  AdvisorFact,
  AdvisorSourceLink,
  AgentReplyFacts,
  ListingChangeRecord,
  TourNoteSummary,
} from "@/lib/advisor-types";

type ListingFacts = {
  id: string;
  address: string | null;
  unit: string | null;
  city: string | null;
  neighborhood: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  availableDate: string | null;
  status: string;
  sourceUrl: string | null;
  sourceName: string | null;
};

type CommuteFact = {
  originLabel: string;
  durationMinutes: number | null;
  distanceMiles: number | null;
};

type VoteFact = { name: string; vote: string; note?: string | null };

type ReviewFact = {
  name: string;
  tourIntent: string;
  interiorAppeal: number | null;
  naturalLight: string;
  mainConcern: string | null;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

export function advisorFingerprint(...parts: unknown[]) {
  return createHash("sha256")
    .update(JSON.stringify(stable(parts)))
    .digest("hex");
}

function dollars(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function listingLabel(listing: ListingFacts) {
  return [listing.address, listing.unit].filter(Boolean).join(" · ") || "Saved listing";
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not provided";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function fact(
  key: string,
  label: string,
  value: string,
  source: AdvisorFact["source"],
  severity?: AdvisorFact["severity"],
): AdvisorFact {
  return { key, label, value, source, ...(severity ? { severity } : {}) };
}

function sourcesFor(listing: ListingFacts, exactSources: AdvisorSourceLink[]) {
  const all = [
    ...(listing.sourceUrl
      ? [{ label: listing.sourceName || "Original listing", url: listing.sourceUrl, provider: listing.sourceName }]
      : []),
    ...exactSources,
  ];
  return Array.from(new Map(all.map((source) => [source.url, source])).values());
}

export function buildFitSummaryActions(input: {
  boardId: string;
  boardListingId: string;
  listing: ListingFacts;
  analysis: GroupListingAnalysis;
  commutes: CommuteFact[];
  rentSplit: RentSplit | null;
  votes: VoteFact[];
  reviews: ReviewFact[];
  sources: AdvisorSourceLink[];
  reason?: "saved" | "refreshed";
}): AdvisorActionDraft[] {
  const { listing, analysis } = input;
  const listingID = listing.id;
  const score = analysis.overallScore === null ? "Not enough verified facts" : `${Math.round(analysis.overallScore)}/100`;
  const facts: AdvisorFact[] = [
    fact("listing", "Listing", listingLabel(listing), "listing"),
    ...(listing.price === null ? [] : [fact("rent", "Monthly rent", dollars(listing.price), "listing")]),
    ...(listing.bedrooms === null ? [] : [fact("bedrooms", "Bedrooms", String(listing.bedrooms), "listing")]),
    ...(listing.squareFeet === null ? [] : [fact("space", "Space", `${listing.squareFeet.toLocaleString("en-US")} sq ft`, "listing")]),
    fact("group_fit", "Group fit", score, "fit_score", analysis.hardFailureCount > 0 ? "warning" : "positive"),
    ...(analysis.lowestRoommateScore === null
      ? []
      : [fact("lowest_fit", "Lowest roommate fit", `${Math.round(analysis.lowestRoommateScore)}/100`, "fit_score")]),
    ...(analysis.fairnessScore === null
      ? []
      : [fact("fairness", "Fairness", `${Math.round(analysis.fairnessScore)}/100`, "fit_score")]),
    ...analysis.members.map((member) =>
      fact(
        `member_fit_${member.roommateId}`,
        `${member.name} fit`,
        member.overallScore === null ? "Incomplete" : `${Math.round(member.overallScore)}/100`,
        "fit_score",
        member.hardFailures.length > 0 ? "warning" : "info",
      ),
    ),
    ...input.commutes.map((route, index) =>
      fact(
        `commute_${index}`,
        `${route.originLabel} commute`,
        route.durationMinutes === null
          ? "Not calculated"
          : `${route.durationMinutes} min${route.distanceMiles === null ? "" : ` · ${route.distanceMiles} mi`}`,
        "commute",
        route.durationMinutes === null ? "warning" : "info",
      ),
    ),
    ...(input.rentSplit?.shares ?? []).map((share) =>
      fact(
        `rent_share_${share.memberId}`,
        `${share.name} share`,
        `${dollars(share.amount)}/mo · ${share.percentOfComfortableBudget}% of limit`,
        "rent_split",
        share.percentOfComfortableBudget > 100 ? "critical" : share.percentOfComfortableBudget > 90 ? "warning" : "info",
      ),
    ),
    ...input.votes.map((vote, index) => fact(`vote_${index}`, `${vote.name} vote`, vote.vote, "vote")),
  ];
  const sourceLinks = sourcesFor(listing, input.sources);
  const fit: AdvisorActionDraft = {
    schemaVersion: 1,
    boardId: input.boardId,
    boardListingId: input.boardListingId,
    listingId: listingID,
    kind: "fit_summary",
    priority: analysis.hardFailureCount > 0 ? "high" : "medium",
    title: input.reason === "refreshed" ? `Fit refreshed for ${listingLabel(listing)}` : `How ${listingLabel(listing)} fits`,
    summary: analysis.verdict,
    whyItMatters: analysis.confidenceReason,
    facts,
    sourceLinks,
    primaryAction: {
      type: "open_listing",
      label: "Review listing fit",
      payload: { listingId: listingID, boardListingId: input.boardListingId },
      requiresReview: false,
    },
    secondaryActions: [
      {
        type: "check_listing",
        label: "Check listing again",
        payload: { listingId: listingID, boardListingId: input.boardListingId },
        requiresReview: false,
      },
    ],
    fingerprint: advisorFingerprint("fit_summary", input.boardListingId, input.reason ?? "saved", facts),
  };

  const hardFailures = Array.from(new Set(analysis.members.flatMap((member) => member.hardFailures)));
  if (hardFailures.length === 0) return [fit];
  const conflictFacts = hardFailures.map((value, index) => fact(`conflict_${index}`, "Conflict", value, "profile", "critical"));
  const categories = Array.from(new Set(hardFailures.map((value) => {
    const lower = value.toLowerCase();
    if (/budget|\$|rent/.test(lower)) return "budget";
    if (/commute|minute/.test(lower)) return "commute";
    if (/bedroom|room|space/.test(lower)) return "space";
    return "roommate requirement";
  })));
  const conflict: AdvisorActionDraft = {
    schemaVersion: 1,
    boardId: input.boardId,
    boardListingId: input.boardListingId,
    listingId: listingID,
    kind: "conflict",
    priority: "critical",
    title: `${listingLabel(listing)} conflicts with ${categories.join(" and ")}`,
    summary: hardFailures.join("; "),
    whyItMatters: "A saved place should not move toward a tour or application while a roommate's hard limit is failing.",
    facts: conflictFacts,
    sourceLinks,
    primaryAction: {
      type: "open_listing",
      label: "Review conflicts",
      payload: { listingId: listingID, boardListingId: input.boardListingId },
      requiresReview: false,
    },
    secondaryActions: [{
      type: "dismiss",
      label: "Dismiss",
      payload: { boardListingId: input.boardListingId },
      requiresReview: false,
    }],
    fingerprint: advisorFingerprint("conflict", input.boardListingId, conflictFacts),
  };
  return [fit, conflict];
}

export function buildListingChangeAction(input: {
  boardId: string;
  listingId: string;
  listingLabel: string;
  change: ListingChangeRecord;
  sourceLinks: AdvisorSourceLink[];
}): AdvisorActionDraft {
  const priority: AdvisorActionPriority = input.change.kind === "status" || input.change.kind === "availability"
    ? "critical"
    : "high";
  return {
    schemaVersion: 1,
    boardId: input.boardId,
    boardListingId: input.change.boardListingId,
    listingId: input.listingId,
    kind: "listing_change",
    priority,
    title: `${input.listingLabel}: ${input.change.field} changed`,
    summary: input.change.explanation,
    whyItMatters: input.change.whyItMatters,
    facts: [
      fact("before", "Before", displayValue(input.change.beforeValue), "history"),
      fact("after", "Now", displayValue(input.change.afterValue), "history", priority === "critical" ? "critical" : "warning"),
    ],
    sourceLinks: input.sourceLinks,
    primaryAction: {
      type: "open_listing",
      label: "Review the change",
      payload: { listingId: input.listingId, boardListingId: input.change.boardListingId },
      requiresReview: false,
    },
    secondaryActions: [{
      type: "open_source",
      label: "Open live source",
      payload: { url: input.change.sourceUrl ?? input.sourceLinks[0]?.url ?? "" },
      requiresReview: false,
    }],
    fingerprint: advisorFingerprint("listing_change", input.change.id),
  };
}

export const INQUIRY_TEMPLATES = {
  availability: {
    label: "Availability check",
    subject: (label: string) => `Availability for ${label}`,
    opening: (label: string) => `I'm reaching out about ${label} and would like to confirm that it is still available.`,
    ask: "Could you confirm the current rent, required fees, available move-in date, and next viewing times?",
  },
  tour_request: {
    label: "Tour request",
    subject: (label: string) => `Tour request for ${label}`,
    opening: (label: string) => `My group is interested in touring ${label}.`,
    ask: "What in-person or virtual tour times are currently available?",
  },
  fee_clarification: {
    label: "Fee clarification",
    subject: (label: string) => `Fee questions for ${label}`,
    opening: (label: string) => `We're reviewing the full move-in cost for ${label}.`,
    ask: "Could you itemize the broker fee, application fee, security deposit, and any required recurring fees?",
  },
  application_requirements: {
    label: "Application requirements",
    subject: (label: string) => `Application requirements for ${label}`,
    opening: (label: string) => `We're reviewing what the application for ${label} requires.`,
    ask: "Please share the document list, income or guarantor rules, screening steps, deposit timing, and application deadline.",
  },
  follow_up: {
    label: "No-response follow-up",
    subject: (label: string) => `Following up on ${label}`,
    opening: (label: string) => `I'm following up on my earlier inquiry about ${label}.`,
    ask: "Is the home still available, and is there a good time to tour or discuss next steps?",
  },
} as const;

export type InquiryTemplateKey = keyof typeof INQUIRY_TEMPLATES;

export function buildInquiryDraft(input: {
  templateKey: InquiryTemplateKey;
  listing: ListingFacts;
  senderName: string;
  roommateNames: string[];
  moveInTimeframe: string | null;
  priorSentAt?: string | null;
}) {
  const template = INQUIRY_TEMPLATES[input.templateKey];
  const label = listingLabel(input.listing);
  const group = input.roommateNames.length > 1
    ? `${input.senderName} and ${input.roommateNames.length - 1} roommate${input.roommateNames.length === 2 ? "" : "s"}`
    : input.senderName;
  const knownFacts = [
    input.listing.price === null ? null : `The advertised rent we saved is ${dollars(input.listing.price)} per month.`,
    input.moveInTimeframe ? `Our recorded move-in target is ${input.moveInTimeframe}.` : null,
    input.priorSentAt ? `This follows the inquiry sent on ${new Date(input.priorSentAt).toLocaleDateString("en-US")}.` : null,
  ].filter((value): value is string => Boolean(value));
  const body = [
    "Hello,",
    "",
    template.opening(label),
    ...knownFacts,
    "",
    template.ask,
    "",
    "Thank you,",
    group,
  ].join("\n");
  return {
    templateKey: input.templateKey,
    templateLabel: template.label,
    subject: template.subject(label),
    body,
    facts: [
      fact("listing", "Listing", label, "listing"),
      ...(input.listing.price === null ? [] : [fact("rent", "Saved rent", dollars(input.listing.price), "listing")]),
      ...(input.moveInTimeframe ? [fact("move_in", "Move-in target", input.moveInTimeframe, "profile") as AdvisorFact] : []),
      fact("sender", "Sender", group, "profile"),
    ],
  };
}

function matches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).map((match) => match[0].trim());
}

export function parseAgentReply(reply: string): AgentReplyFacts {
  const clean = reply.replace(/\r/g, "").trim();
  const lower = clean.toLowerCase();
  const availability = /\b(?:no longer available|rented|leased|taken|off market)\b/.test(lower)
    ? "Unavailable"
    : /\b(?:still available|is available|available now)\b/.test(lower)
      ? "Available"
      : null;
  const fees = matches(clean, /(?:\$[\d,]+|\d+(?:\.\d+)?%)\s+(?:broker(?:'s)? fee|application fee|deposit|security|amenity fee)/gi);
  const tourTimes = matches(clean, /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)[,\s]+(?:[A-Z][a-z]+\s+\d{1,2}[,\s]*)?(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi);
  const requirements = clean
    .split(/[\n.!?]+/)
    .map((line) => line.trim())
    .filter((line) => /\b(?:income|credit|guarantor|pay stubs?|bank statements?|identification|id|references?|documents?|required)\b/i.test(line))
    .slice(0, 8);
  const nextSteps = clean
    .split(/[\n.!?]+/)
    .map((line) => line.trim())
    .filter((line) => /\b(?:reply|send|call|apply|schedule|confirm|let me know|next step|submit|complete|return)\b/i.test(line))
    .slice(0, 8);
  return {
    availability,
    fees: Array.from(new Set(fees)),
    tourTimes: Array.from(new Set(tourTimes)),
    requirements: Array.from(new Set(requirements)),
    nextSteps: Array.from(new Set(nextSteps)),
    unansweredQuestions: [
      availability ? null : "Current availability was not explicit.",
      fees.length > 0 ? null : "No itemized fee was detected.",
      tourTimes.length > 0 ? null : "No specific tour time was detected.",
    ].filter((value): value is string => Boolean(value)),
  };
}

function classifiedSentences(text: string) {
  return text
    .replace(/\r/g, "")
    .split(/[\n.!?]+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3);
}

export function structureTourNote(transcript: string): TourNoteSummary {
  const sentences = classifiedSentences(transcript);
  const pros = sentences.filter((value) => /\b(?:love|liked|great|good|bright|spacious|quiet|clean|close|nice|updated|large)\b/i.test(value));
  const concerns = sentences.filter((value) => /\b(?:concern|worry|verify|check|ask|unclear|unsure|mold|leak|damage|pest|noise|broken)\b/i.test(value));
  const cons = sentences.filter((value) => /\b(?:small|dark|loud|noisy|bad|old|dated|cramped|expensive|far|smell|dirty)\b/i.test(value));
  const followUps = sentences.filter((value) => /\b(?:ask|confirm|check|find out|follow up|need to know|verify)\b/i.test(value));
  return {
    pros: Array.from(new Set(pros)).slice(0, 8),
    cons: Array.from(new Set(cons)).slice(0, 8),
    concerns: Array.from(new Set(concerns)).slice(0, 8),
    followUps: Array.from(new Set(followUps)).slice(0, 8),
  };
}

export function buildDecisionDigestAction(input: {
  boardId: string;
  boardListingId: string;
  listing: ListingFacts;
  analysis: GroupListingAnalysis;
  rentSplit: RentSplit | null;
  votes: VoteFact[];
  reviews: ReviewFact[];
  sources: AdvisorSourceLink[];
}): AdvisorActionDraft {
  const voteSummary = input.votes.length === 0
    ? "No roommate votes yet"
    : input.votes.map((vote) => `${vote.name}: ${vote.vote}`).join(" · ");
  const reviewSummary = input.reviews.length === 0
    ? "No tour reviews yet"
    : `${input.reviews.length} review${input.reviews.length === 1 ? "" : "s"}`;
  const facts = [
    fact("votes", "Votes", voteSummary, "vote"),
    fact("reviews", "Reviews", reviewSummary, "review"),
    fact("fit", "Group fit", input.analysis.overallScore === null ? "Incomplete" : `${input.analysis.overallScore}/100`, "fit_score"),
    ...(input.rentSplit ? [fact("rent_split", "Rent split", input.rentSplit.summary, "rent_split") as AdvisorFact] : []),
  ];
  return {
    schemaVersion: 1,
    boardId: input.boardId,
    boardListingId: input.boardListingId,
    listingId: input.listing.id,
    kind: "decision_digest",
    priority: input.analysis.hardFailureCount > 0 ? "high" : "medium",
    title: `Decision digest for ${listingLabel(input.listing)}`,
    summary: `${voteSummary}. ${input.analysis.verdict}`,
    whyItMatters: "This keeps votes, fit, reviews, and the proposed rent split visible in the same decision.",
    facts,
    sourceLinks: sourcesFor(input.listing, input.sources),
    primaryAction: {
      type: "open_listing",
      label: "Continue the decision",
      payload: { listingId: input.listing.id, boardListingId: input.boardListingId },
      requiresReview: false,
    },
    secondaryActions: [],
    fingerprint: advisorFingerprint("decision_digest", input.boardListingId, facts),
  };
}
