import "server-only";

import type {
  Listing,
  ListingApplicationItem,
  ListingChange,
  Prisma,
  RoommateProfile,
} from "@prisma/client";
import { allocateRentFairly } from "@/lib/group-affordability";
import { analyzeListingForGroup } from "@/lib/listing-analysis";
import { estimateCommutes } from "@/lib/commute-service";
import { prisma } from "@/lib/prisma";
import {
  advisorFingerprint,
  buildDecisionDigestAction,
  buildFitSummaryActions,
  buildInquiryDraft,
  buildListingChangeAction,
  parseAgentReply,
  structureTourNote,
  type InquiryTemplateKey,
} from "@/lib/advisor-actions";
import type {
  AdvisorActionDraft,
  AdvisorActionRecord,
  AdvisorFact,
  AdvisorSourceLink,
  AgentReplyFacts,
  ApplicationChecklistItemRecord,
  ListingChangeRecord,
  ListingInquiryRecord,
  ListingObservation,
  TourNoteSummary,
} from "@/lib/advisor-types";
import type {
  BoardListingReviewRecord,
  ListingRecord,
  RoommateRecord,
} from "@/lib/types";

const INQUIRY_STALE_MS = 72 * 60 * 60 * 1_000;
const LISTING_STALE_MS = 14 * 24 * 60 * 60 * 1_000;

type AdvisorActionWithListing = Prisma.AdvisorActionGetPayload<{
  include: { boardListing: { select: { listingId: true } } };
}>;
type ReviewWithRoommate = Prisma.BoardListingReviewGetPayload<{
  include: { roommate: true };
}>;
type InquiryWithUser = Prisma.BrokerOutreachRecordGetPayload<{
  include: { user: { select: { displayName: true } } };
}>;

function parseArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray<T>(value: unknown) {
  return Array.isArray(value) ? value as T[] : [];
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function inquiryMethod(value: string): ListingInquiryRecord["method"] {
  return value === "portal" || value === "phone" ? value : "email";
}

function listingRecord(row: Listing): ListingRecord {
  return {
    id: row.id,
    source: row.source,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    externalId: row.externalId,
    address: row.address,
    unit: row.unit,
    city: row.city,
    state: row.state,
    zip: row.zip,
    neighborhood: row.neighborhood,
    latitude: row.latitude,
    longitude: row.longitude,
    price: row.price,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    squareFeet: row.squareFeet,
    availableDate: toIso(row.availableDate),
    propertyType: row.propertyType,
    amenities: parseArray(row.amenities),
    fees: parseObject(row.fees),
    description: row.description,
    images: parseArray(row.images),
    providerData: asRecord(row.providerData),
    providerStatus: row.providerStatus,
    providerListedAt: toIso(row.providerListedAt),
    providerLastSeenAt: toIso(row.providerLastSeenAt),
    providerFetchedAt: toIso(row.providerFetchedAt),
    status: row.status,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

function roommateRecord(row: RoommateProfile): RoommateRecord {
  return {
    id: row.id,
    boardId: row.boardId,
    linkedUserId: row.linkedUserId,
    name: row.name,
    roleLabel: row.roleLabel,
    budgetMin: row.budgetMin,
    idealBudget: row.idealBudget,
    budgetMax: row.budgetMax,
    stretchBudget: row.stretchBudget,
    commuteDestination: row.commuteDestination,
    commuteAccess:
      row.commuteAccess === "car"
      || row.commuteAccess === "transit"
      || row.commuteAccess === "flexible"
      || row.commuteAccess === "remote"
      || row.commuteAccess === "skip"
        ? row.commuteAccess
        : null,
    preferredCommuteMinutes: row.preferredCommuteMinutes,
    maxCommuteMinutes: row.maxCommuteMinutes,
    commutePriority: row.commutePriority,
    neighborhoodPriority: row.neighborhoodPriority,
    spacePriority: row.spacePriority,
    privacyPriority: row.privacyPriority,
    preferredNeighborhoods: parseArray(row.preferredNeighborhoods),
    mustHaves: parseArray(row.mustHaves),
    dealbreakers: parseArray(row.dealbreakers),
    petsRequired: row.petsRequired,
    accessibilityNeeds: parseArray(row.accessibilityNeeds),
    notes: row.notes,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

function reviewRecord(row: ReviewWithRoommate): BoardListingReviewRecord {
  return {
    id: row.id,
    boardListingId: row.boardListingId,
    roommateId: row.roommateId,
    tourIntent: row.tourIntent,
    interiorAppeal: row.interiorAppeal,
    naturalLight: row.naturalLight,
    mainConcern: row.mainConcern,
    sourceViewedAt: toIso(row.sourceViewedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
    roommate: { id: row.roommate.id, name: row.roommate.name, linkedUserId: row.roommate.linkedUserId },
  };
}

function actionCommand(value: unknown) {
  return value as AdvisorActionRecord["primaryAction"];
}

export function mapAdvisorAction(row: AdvisorActionWithListing): AdvisorActionRecord {
  return {
    schemaVersion: 1,
    id: row.id,
    boardId: row.boardId,
    boardListingId: row.boardListingId,
    listingId: row.boardListing?.listingId ?? null,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    title: row.title,
    summary: row.summary,
    whyItMatters: row.whyItMatters,
    facts: asArray<AdvisorFact>(row.facts),
    sourceLinks: asArray<AdvisorSourceLink>(row.sourceLinks),
    primaryAction: actionCommand(row.primaryAction),
    secondaryActions: asArray<AdvisorActionRecord["primaryAction"]>(row.secondaryActions),
    engine: row.engine === "apple_intelligence_wording" ? "apple_intelligence_wording" : "deterministic",
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
    completedAt: toIso(row.completedAt),
  };
}

export async function saveAdvisorAction(draft: AdvisorActionDraft) {
  const row = await prisma.advisorAction.upsert({
    where: { fingerprint: draft.fingerprint },
    create: {
      boardId: draft.boardId,
      boardListingId: draft.boardListingId,
      kind: draft.kind,
      priority: draft.priority,
      title: draft.title,
      summary: draft.summary,
      whyItMatters: draft.whyItMatters,
      facts: draft.facts,
      sourceLinks: draft.sourceLinks,
      primaryAction: draft.primaryAction,
      secondaryActions: draft.secondaryActions,
      fingerprint: draft.fingerprint,
    },
    update: {
      title: draft.title,
      summary: draft.summary,
      whyItMatters: draft.whyItMatters,
      priority: draft.priority,
      facts: draft.facts,
      sourceLinks: draft.sourceLinks,
      primaryAction: draft.primaryAction,
      secondaryActions: draft.secondaryActions,
    },
    include: { boardListing: { select: { listingId: true } } },
  });
  return mapAdvisorAction(row);
}

export async function getAdvisorActions(input: {
  boardId: string;
  boardListingId?: string;
  includeClosed?: boolean;
  limit?: number;
}) {
  const rows = await prisma.advisorAction.findMany({
    where: {
      boardId: input.boardId,
      ...(input.boardListingId ? { boardListingId: input.boardListingId } : {}),
      ...(input.includeClosed ? {} : { status: "open" }),
    },
    include: { boardListing: { select: { listingId: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(input.limit ?? 80, 1), 200),
  });
  return rows.map(mapAdvisorAction);
}

export async function updateAdvisorActionStatus(input: {
  actionId: string;
  boardId: string;
  status: "completed" | "dismissed";
}) {
  const updated = await prisma.advisorAction.updateMany({
    where: { id: input.actionId, boardId: input.boardId },
    data: { status: input.status, completedAt: new Date() },
  });
  return updated.count === 1;
}

async function listingContext(boardListingId: string) {
  const row = await prisma.boardListing.findUnique({
    where: { id: boardListingId },
    include: {
      listing: true,
      board: { include: { searchProfile: true, roommates: true } },
      votes: { include: { roommate: true }, orderBy: { createdAt: "asc" } },
      reviews: { include: { roommate: true }, orderBy: { updatedAt: "asc" } },
      sources: { include: { catalogSource: true }, orderBy: { createdAt: "asc" } },
      verifications: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!row || row.deletedAt) throw new Error("ADVISOR_LISTING_NOT_FOUND");
  const listing = listingRecord(row.listing);
  const members = row.board.roommates.map(roommateRecord);
  const commutes = await estimateCommutes({
    anchors: members.flatMap((member) => member.commuteDestination
      ? [{ label: member.name, query: member.commuteDestination }]
      : []),
    listings: [{
      listingId: row.id,
      address: listing.address,
      city: listing.city,
      neighborhood: listing.neighborhood,
    }],
  });
  const routes = commutes[0]?.routes ?? [];
  const reviews = row.reviews.map(reviewRecord);
  const sourceLinks: AdvisorSourceLink[] = row.sources.map((source) => ({
    label: source.label,
    url: source.url,
    provider: source.catalogSource?.provider ?? listing.sourceName,
    observedAt: toIso(source.confirmedAt ?? source.createdAt),
  }));
  const analysis = analyzeListingForGroup({
    listing,
    members,
    routes,
    reviews,
    sourceConfirmed: row.sources.some((source) => source.confirmedAt !== null),
    latestVerification: row.verifications[0]?.status ?? "unverified",
  });
  return {
    row,
    listing,
    members,
    routes,
    reviews,
    sourceLinks,
    analysis,
    rentSplit: allocateRentFairly(listing.price, members),
    votes: row.votes.map((vote) => ({ name: vote.roommate.name, vote: vote.vote, note: vote.note })),
  };
}

export async function seedListingAdvisorActions(
  boardListingId: string,
  reason: "saved" | "refreshed" = "saved",
) {
  const context = await listingContext(boardListingId);
  const drafts = buildFitSummaryActions({
    boardId: context.row.boardId,
    boardListingId,
    listing: context.listing,
    analysis: context.analysis,
    commutes: context.routes,
    rentSplit: context.rentSplit,
    votes: context.votes,
    reviews: context.reviews.map((review) => ({
      name: review.roommate.name,
      tourIntent: review.tourIntent,
      interiorAppeal: review.interiorAppeal,
      naturalLight: review.naturalLight,
      mainConcern: review.mainConcern,
    })),
    sources: context.sourceLinks,
    reason,
  });
  const digest = buildDecisionDigestAction({
    boardId: context.row.boardId,
    boardListingId,
    listing: context.listing,
    analysis: context.analysis,
    rentSplit: context.rentSplit,
    votes: context.votes,
    reviews: context.reviews.map((review) => ({
      name: review.roommate.name,
      tourIntent: review.tourIntent,
      interiorAppeal: review.interiorAppeal,
      naturalLight: review.naturalLight,
      mainConcern: review.mainConcern,
    })),
    sources: context.sourceLinks,
  });
  return Promise.all([...drafts, digest].map(saveAdvisorAction));
}

function normalizeObservation(observation: ListingObservation): ListingObservation {
  return {
    ...observation,
    sourceUrl: observation.sourceUrl?.trim() || null,
    providerStatus: observation.providerStatus?.trim() || null,
    availableDate: observation.availableDate && !Number.isNaN(Date.parse(observation.availableDate))
      ? new Date(observation.availableDate).toISOString()
      : null,
    observedAt: !Number.isNaN(Date.parse(observation.observedAt))
      ? new Date(observation.observedAt).toISOString()
      : new Date().toISOString(),
    fees: stableObject(observation.fees),
    sourceFacts: stableObject(observation.sourceFacts),
  };
}

function stableObject(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function observationFingerprint(observation: ListingObservation) {
  return advisorFingerprint({
    sourceUrl: observation.sourceUrl,
    price: observation.price,
    fees: observation.fees,
    availableDate: observation.availableDate,
    status: observation.status,
    providerStatus: observation.providerStatus,
  });
}

function changeCopy(input: {
  kind: ListingChangeRecord["kind"];
  field: string;
  beforeValue: unknown;
  afterValue: unknown;
}) {
  if (input.kind === "price") {
    const before = Number(input.beforeValue);
    const after = Number(input.afterValue);
    const direction = after < before ? "decreased" : "increased";
    return {
      explanation: `Monthly rent ${direction} from $${before.toLocaleString("en-US")} to $${after.toLocaleString("en-US")}.`,
      whyItMatters: after < before
        ? "The new rent can improve every roommate's affordability and the proposed split."
        : "The new rent can push one or more roommate shares beyond their recorded limits.",
    };
  }
  if (input.kind === "fee") return {
    explanation: `The saved fee details changed from ${displayValue(input.beforeValue)} to ${displayValue(input.afterValue)}.`,
    whyItMatters: "Up-front and recurring fees change the real cost even when advertised rent stays the same.",
  };
  if (input.kind === "availability") return {
    explanation: `Availability changed from ${displayValue(input.beforeValue)} to ${displayValue(input.afterValue)}.`,
    whyItMatters: "A move-in date mismatch can rule out the listing for the board's timeline.",
  };
  return {
    explanation: `Listing status changed from ${displayValue(input.beforeValue)} to ${displayValue(input.afterValue)}.`,
    whyItMatters: "The group should avoid spending time on a listing that is no longer active.",
  };
}

function comparable(value: unknown) {
  return JSON.stringify(value ?? null);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function recordListingObservation(boardListingId: string, raw: ListingObservation) {
  const context = await listingContext(boardListingId);
  const normalized = normalizeObservation(raw);
  // A missing extraction is not evidence that a stored fact disappeared.
  // Device and server extractors may only replace facts they actually found.
  const observation: ListingObservation = {
    ...normalized,
    price: normalized.price ?? context.listing.price,
    fees: Object.keys(normalized.fees).length > 0 ? normalized.fees : context.listing.fees,
    availableDate: normalized.availableDate ?? context.listing.availableDate,
    status: normalized.status === "unknown" || normalized.status === "saved_only"
      ? context.listing.status
      : normalized.status,
    providerStatus: normalized.providerStatus ?? context.listing.providerStatus,
  };
  const latest = await prisma.listingSnapshot.findFirst({
    where: { boardListingId },
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
  });
  const baseline: ListingObservation = latest
    ? {
        sourceUrl: latest.sourceUrl,
        price: latest.price,
        fees: asRecord(latest.fees),
        availableDate: toIso(latest.availableDate),
        status: latest.listingStatus,
        providerStatus: latest.providerStatus,
        observedAt: toIso(latest.observedAt) ?? new Date(0).toISOString(),
        sourceFacts: asRecord(latest.sourceFacts),
      }
    : {
        sourceUrl: context.listing.sourceUrl,
        price: context.listing.price,
        fees: context.listing.fees,
        availableDate: context.listing.availableDate,
        status: context.listing.status,
        providerStatus: context.listing.providerStatus,
        observedAt: context.listing.updatedAt,
        sourceFacts: {},
      };
  const fingerprint = observationFingerprint(observation);
  const observedAt = new Date(observation.observedAt);
  const snapshot = await prisma.listingSnapshot.upsert({
    where: { boardListingId_fingerprint_observedAt: { boardListingId, fingerprint, observedAt } },
    create: {
      boardListingId,
      sourceUrl: observation.sourceUrl,
      price: observation.price,
      fees: jsonInput(observation.fees),
      availableDate: observation.availableDate ? new Date(observation.availableDate) : null,
      listingStatus: observation.status,
      providerStatus: observation.providerStatus,
      sourceFacts: jsonInput(observation.sourceFacts),
      fingerprint,
      observedAt,
    },
    update: {},
  });
  if (latest?.id === snapshot.id) {
    await prisma.listing.update({
      where: { id: context.listing.id },
      data: { providerLastSeenAt: observedAt, providerFetchedAt: new Date() },
    });
    return { snapshotId: snapshot.id, changes: [], actions: [] };
  }

  const candidates = ([
    { kind: "price", field: "price", beforeValue: baseline.price, afterValue: observation.price },
    { kind: "fee", field: "fees", beforeValue: baseline.fees, afterValue: observation.fees },
    { kind: "availability", field: "available date", beforeValue: baseline.availableDate, afterValue: observation.availableDate },
    { kind: "status", field: "status", beforeValue: baseline.status, afterValue: observation.status },
    { kind: "status", field: "provider status", beforeValue: baseline.providerStatus, afterValue: observation.providerStatus },
  ] satisfies Array<{
    kind: ListingChangeRecord["kind"];
    field: string;
    beforeValue: unknown;
    afterValue: unknown;
  }>).filter((candidate) => comparable(candidate.beforeValue) !== comparable(candidate.afterValue));

  const changes: ListingChangeRecord[] = [];
  for (const candidate of candidates) {
    const copy = changeCopy(candidate);
    const row = await prisma.listingChange.upsert({
      where: { snapshotId_field: { snapshotId: snapshot.id, field: candidate.field } },
      create: {
        boardListingId,
        snapshotId: snapshot.id,
        kind: candidate.kind,
        field: candidate.field,
        beforeValue: jsonInput({ value: candidate.beforeValue ?? null }),
        afterValue: jsonInput({ value: candidate.afterValue ?? null }),
        explanation: copy.explanation,
        whyItMatters: copy.whyItMatters,
        sourceUrl: observation.sourceUrl,
      },
      update: {},
    });
    changes.push({
      id: row.id,
      boardListingId,
      kind: row.kind,
      field: row.field,
      beforeValue: candidate.beforeValue,
      afterValue: candidate.afterValue,
      explanation: row.explanation,
      whyItMatters: row.whyItMatters,
      sourceUrl: row.sourceUrl,
      detectedAt: row.detectedAt.toISOString(),
    });
  }

  await prisma.listing.update({
    where: { id: context.listing.id },
    data: {
      price: observation.price,
      fees: JSON.stringify(observation.fees),
      availableDate: observation.availableDate ? new Date(observation.availableDate) : null,
      status: observation.status,
      providerStatus: observation.providerStatus,
      providerLastSeenAt: observedAt,
      providerFetchedAt: new Date(),
    },
  });
  if (baseline.price !== observation.price && observation.price !== null) {
    await prisma.priceHistory.create({
      data: {
        listingId: context.listing.id,
        price: observation.price,
        observedAt,
        source: "api",
      },
    });
  }
  const actions = await Promise.all(changes.map((change) => saveAdvisorAction(buildListingChangeAction({
    boardId: context.row.boardId,
    listingId: context.listing.id,
    listingLabel: [context.listing.address, context.listing.unit].filter(Boolean).join(" · ") || "Saved listing",
    change,
    sourceLinks: context.sourceLinks,
  }))));
  await seedListingAdvisorActions(boardListingId, "refreshed");
  return { snapshotId: snapshot.id, changes, actions };
}

export async function getListingChangeHistory(boardListingId: string) {
  const rows = await prisma.listingChange.findMany({
    where: { boardListingId },
    orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return rows.map((row: ListingChange): ListingChangeRecord => ({
    id: row.id,
    boardListingId: row.boardListingId,
    kind: row.kind,
    field: row.field,
    beforeValue: asRecord(row.beforeValue).value ?? null,
    afterValue: asRecord(row.afterValue).value ?? null,
    explanation: row.explanation,
    whyItMatters: row.whyItMatters,
    sourceUrl: row.sourceUrl,
    detectedAt: row.detectedAt.toISOString(),
  }));
}

function inquiryRecord(row: InquiryWithUser): ListingInquiryRecord {
  return {
    id: row.id,
    boardListingId: row.boardListingId,
    userId: row.userId,
    userName: row.user?.displayName,
    status: row.status,
    templateKey: row.templateKey,
    subject: row.subject,
    body: row.body,
    method: inquiryMethod(row.method),
    notes: row.notes,
    contactedAt: toIso(row.contactedAt),
    sentAt: toIso(row.sentAt),
    answeredAt: toIso(row.answeredAt),
    staleAt: toIso(row.staleAt),
    lastFollowUpAt: toIso(row.lastFollowUpAt),
    replyText: row.replyText,
    replyFacts: row.replyFacts ? asRecord(row.replyFacts) as AgentReplyFacts : null,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

export async function createInquiryDraft(input: {
  boardListingId: string;
  userId: string;
  templateKey: InquiryTemplateKey;
  priorSentAt?: string | null;
}) {
  const context = await listingContext(input.boardListingId);
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new Error("INQUIRY_USER_NOT_FOUND");
  const draft = buildInquiryDraft({
    templateKey: input.templateKey,
    listing: context.listing,
    senderName: user.displayName,
    roommateNames: context.members.map((member) => member.name),
    moveInTimeframe: context.row.board.searchProfile?.moveInTimeframe ?? null,
    priorSentAt: input.priorSentAt,
  });
  const row = await prisma.brokerOutreachRecord.create({
    data: {
      boardListingId: input.boardListingId,
      userId: input.userId,
      status: "drafted",
      templateKey: draft.templateKey,
      subject: draft.subject,
      body: draft.body,
      method: "email",
    },
    include: { user: { select: { displayName: true } } },
  });
  const inquiry = inquiryRecord(row);
  const kind = input.templateKey === "follow_up" ? "follow_up_draft" : "inquiry_draft";
  const action = await saveAdvisorAction({
    schemaVersion: 1,
    boardId: context.row.boardId,
    boardListingId: input.boardListingId,
    listingId: context.listing.id,
    kind,
    priority: "medium",
    title: `${draft.templateLabel} ready for review`,
    summary: draft.subject,
    whyItMatters: "Homeboard never sends an inquiry automatically. Review and edit every word before marking it sent.",
    facts: draft.facts,
    sourceLinks: context.sourceLinks,
    primaryAction: {
      type: input.templateKey === "follow_up" ? "review_follow_up" : "review_inquiry",
      label: "Review draft",
      payload: { inquiryId: inquiry.id, boardListingId: input.boardListingId },
      requiresReview: true,
    },
    secondaryActions: [{
      type: "dismiss",
      label: "Dismiss",
      payload: { inquiryId: inquiry.id },
      requiresReview: false,
    }],
    fingerprint: advisorFingerprint(kind, inquiry.id),
  });
  return { inquiry, action };
}

export async function getListingInquiries(boardListingId: string) {
  const rows = await prisma.brokerOutreachRecord.findMany({
    where: { boardListingId },
    include: { user: { select: { displayName: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map(inquiryRecord);
}

export async function updateInquiry(input: {
  inquiryId: string;
  boardListingId: string;
  status: "drafted" | "sent" | "answered" | "stale";
  subject?: string;
  body?: string;
  method?: "email" | "portal" | "phone";
  replyText?: string;
}) {
  const existing = await prisma.brokerOutreachRecord.findFirst({
    where: { id: input.inquiryId, boardListingId: input.boardListingId },
  });
  if (!existing) throw new Error("INQUIRY_NOT_FOUND");
  const now = new Date();
  const replyFacts = input.replyText ? parseAgentReply(input.replyText) : null;
  const row = await prisma.brokerOutreachRecord.update({
    where: { id: existing.id },
    data: {
      status: input.status,
      ...(input.subject !== undefined ? { subject: input.subject.trim() } : {}),
      ...(input.body !== undefined ? { body: input.body.trim() } : {}),
      ...(input.method ? { method: input.method } : {}),
      ...(input.status === "sent" ? { sentAt: now, contactedAt: now } : {}),
      ...(input.status === "answered" ? { answeredAt: now } : {}),
      ...(input.status === "stale" ? { staleAt: now } : {}),
      ...(input.replyText !== undefined ? { replyText: input.replyText.trim() } : {}),
      ...(replyFacts ? { replyFacts: jsonInput(replyFacts) } : {}),
    },
    include: { user: { select: { displayName: true } } },
  });
  const inquiry = inquiryRecord(row);
  if (replyFacts) await createReplySummaryAction(input.boardListingId, inquiry, replyFacts);
  return inquiry;
}

async function createReplySummaryAction(
  boardListingId: string,
  inquiry: ListingInquiryRecord,
  reply: AgentReplyFacts,
) {
  const context = await listingContext(boardListingId);
  const facts: AdvisorFact[] = [
    ...(reply.availability ? [{ key: "availability", label: "Availability", value: reply.availability, source: "inquiry" as const }] : []),
    ...reply.fees.map((value, index) => ({ key: `fee_${index}`, label: "Fee", value, source: "inquiry" as const })),
    ...reply.tourTimes.map((value, index) => ({ key: `tour_${index}`, label: "Tour time", value, source: "inquiry" as const })),
    ...reply.requirements.map((value, index) => ({ key: `requirement_${index}`, label: "Requirement", value, source: "inquiry" as const })),
    ...reply.nextSteps.map((value, index) => ({ key: `next_${index}`, label: "Next step", value, source: "inquiry" as const })),
  ];
  return saveAdvisorAction({
    schemaVersion: 1,
    boardId: context.row.boardId,
    boardListingId,
    listingId: context.listing.id,
    kind: "reply_summary",
    priority: reply.availability === "Unavailable" ? "critical" : "high",
    title: `Agent reply parsed for ${context.listing.address ?? "saved listing"}`,
    summary: facts.length > 0 ? facts.map((entry) => `${entry.label}: ${entry.value}`).join(" · ") : "The reply did not contain fields Homeboard could extract safely.",
    whyItMatters: reply.unansweredQuestions.length > 0
      ? `Still unresolved: ${reply.unansweredQuestions.join(" ")}`
      : "The reply contains enough structured details for the group to choose a next step.",
    facts,
    sourceLinks: context.sourceLinks,
    primaryAction: {
      type: "review_reply",
      label: "Review parsed reply",
      payload: { inquiryId: inquiry.id, boardListingId },
      requiresReview: true,
    },
    secondaryActions: [],
    fingerprint: advisorFingerprint("reply_summary", inquiry.id, reply),
  });
}

export async function markStaleInquiriesAndCreateFollowUps(boardId: string) {
  const cutoff = new Date(Date.now() - INQUIRY_STALE_MS);
  const sent = await prisma.brokerOutreachRecord.findMany({
    where: {
      boardListing: { boardId, deletedAt: null },
      status: "sent",
      sentAt: { lte: cutoff },
    },
  });
  let created = 0;
  for (const inquiry of sent) {
    await prisma.brokerOutreachRecord.update({
      where: { id: inquiry.id },
      data: { status: "stale", staleAt: new Date() },
    });
    const result = await createInquiryDraft({
      boardListingId: inquiry.boardListingId,
      userId: inquiry.userId,
      templateKey: "follow_up",
      priorSentAt: toIso(inquiry.sentAt),
    });
    await prisma.brokerOutreachRecord.update({
      where: { id: inquiry.id },
      data: { lastFollowUpAt: new Date() },
    });
    if (result.inquiry) created++;
  }
  return created;
}

export async function saveTourNote(input: {
  boardListingId: string;
  authorUserId: string;
  transcript: string;
}) {
  const context = await listingContext(input.boardListingId);
  const summary: TourNoteSummary = structureTourNote(input.transcript);
  const row = await prisma.listingTourNote.create({
    data: {
      boardListingId: input.boardListingId,
      authorUserId: input.authorUserId,
      transcript: input.transcript.trim(),
      pros: summary.pros,
      cons: summary.cons,
      concerns: summary.concerns,
      followUps: summary.followUps,
    },
  });
  const facts: AdvisorFact[] = [
    ...summary.pros.map((value, index) => ({ key: `pro_${index}`, label: "Pro", value, source: "tour_note" as const, severity: "positive" as const })),
    ...summary.cons.map((value, index) => ({ key: `con_${index}`, label: "Con", value, source: "tour_note" as const, severity: "warning" as const })),
    ...summary.concerns.map((value, index) => ({ key: `concern_${index}`, label: "Concern", value, source: "tour_note" as const, severity: "critical" as const })),
    ...summary.followUps.map((value, index) => ({ key: `follow_up_${index}`, label: "Follow-up", value, source: "tour_note" as const })),
  ];
  const action = await saveAdvisorAction({
    schemaVersion: 1,
    boardId: context.row.boardId,
    boardListingId: input.boardListingId,
    listingId: context.listing.id,
    kind: "tour_note_summary",
    priority: summary.concerns.length > 0 ? "high" : "medium",
    title: `Tour notes organized for ${context.listing.address ?? "saved listing"}`,
    summary: `${summary.pros.length} pros, ${summary.cons.length} cons, ${summary.concerns.length} concerns, and ${summary.followUps.length} follow-ups were identified.`,
    whyItMatters: "Structured notes keep the group from losing specific observations after the tour.",
    facts,
    sourceLinks: context.sourceLinks,
    primaryAction: {
      type: "open_listing",
      label: "Review tour notes",
      payload: { listingId: context.listing.id, boardListingId: input.boardListingId },
      requiresReview: false,
    },
    secondaryActions: [],
    fingerprint: advisorFingerprint("tour_note_summary", row.id),
  });
  return { id: row.id, summary, action };
}

const APPLICATION_ITEMS = [
  ["photo_id", "Photo identification"],
  ["proof_of_income", "Proof of income or employment"],
  ["bank_statements", "Recent bank statements"],
  ["credit_authorization", "Credit/background authorization"],
  ["rental_history", "Landlord or rental references"],
] as const;

export async function ensureApplicationChecklist(boardListingId: string) {
  const context = await listingContext(boardListingId);
  for (const member of context.members) {
    for (const [key, label] of APPLICATION_ITEMS) {
      await prisma.listingApplicationItem.upsert({
        where: { boardListingId_key: { boardListingId, key: `${member.id}:${key}` } },
        create: {
          boardListingId,
          key: `${member.id}:${key}`,
          label: `${member.name}: ${label}`,
          assignedUserId: member.linkedUserId,
          status: "missing",
          required: true,
        },
        update: { label: `${member.name}: ${label}`, assignedUserId: member.linkedUserId },
      });
    }
  }
  const items = await getApplicationChecklist(boardListingId);
  const missing = items.filter((item) => item.required && item.status === "missing");
  if (missing.length > 0) {
    await saveAdvisorAction({
      schemaVersion: 1,
      boardId: context.row.boardId,
      boardListingId,
      listingId: context.listing.id,
      kind: "application_checklist",
      priority: "high",
      title: `${missing.length} application items still missing`,
      summary: missing.slice(0, 4).map((item) => item.label).join(" · "),
      whyItMatters: "A complete packet lets the group apply promptly after deciding, without sending anything automatically.",
      facts: missing.map((item) => ({ key: item.key, label: "Missing", value: item.label, source: "application" as const, severity: "warning" as const })),
      sourceLinks: context.sourceLinks,
      primaryAction: {
        type: "open_application_checklist",
        label: "Review checklist",
        payload: { boardListingId },
        requiresReview: false,
      },
      secondaryActions: [],
      fingerprint: advisorFingerprint("application_checklist", boardListingId, missing.map((item) => item.key)),
    });
  }
  return items;
}

function applicationItem(row: ListingApplicationItem): ApplicationChecklistItemRecord {
  return {
    id: row.id,
    boardListingId: row.boardListingId,
    key: row.key,
    label: row.label,
    detail: row.detail,
    status: row.status,
    assignedUserId: row.assignedUserId,
    required: row.required,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getApplicationChecklist(boardListingId: string) {
  const rows = await prisma.listingApplicationItem.findMany({
    where: { boardListingId },
    orderBy: [{ label: "asc" }, { id: "asc" }],
  });
  return rows.map(applicationItem);
}

export async function updateApplicationItem(input: {
  boardListingId: string;
  itemId: string;
  status: "missing" | "ready" | "submitted" | "waived";
  detail?: string | null;
}) {
  const found = await prisma.listingApplicationItem.findFirst({
    where: { id: input.itemId, boardListingId: input.boardListingId },
  });
  if (!found) throw new Error("APPLICATION_ITEM_NOT_FOUND");
  const row = await prisma.listingApplicationItem.update({
    where: { id: found.id },
    data: { status: input.status, ...(input.detail !== undefined ? { detail: input.detail } : {}) },
  });
  return applicationItem(row);
}

export async function createArchiveSuggestions(boardId: string) {
  const staleBefore = new Date(Date.now() - LISTING_STALE_MS);
  const listings = await prisma.boardListing.findMany({
    where: {
      boardId,
      deletedAt: null,
      userStatus: { not: "rejected" },
      OR: [
        { listing: { status: { in: ["removed", "rented"] } } },
        { listing: { providerLastSeenAt: { lt: staleBefore } } },
        { listing: { providerLastSeenAt: null, updatedAt: { lt: staleBefore } } },
      ],
    },
    include: { listing: true, sources: true },
  });
  const actions: AdvisorActionRecord[] = [];
  for (const entry of listings) {
    const label = [entry.listing.address, entry.listing.unit].filter(Boolean).join(" · ") || "Saved listing";
    const lastSeen = toIso(entry.listing.providerLastSeenAt ?? entry.listing.updatedAt);
    actions.push(await saveAdvisorAction({
      schemaVersion: 1,
      boardId,
      boardListingId: entry.id,
      listingId: entry.listingId,
      kind: "archive_suggestion",
      priority: entry.listing.status === "removed" || entry.listing.status === "rented" ? "high" : "low",
      title: `Consider archiving ${label}`,
      summary: entry.listing.status === "removed" || entry.listing.status === "rented"
        ? `The saved status is ${entry.listing.status}.`
        : `No fresh source observation has been saved since ${lastSeen ? new Date(lastSeen).toLocaleDateString("en-US") : "the listing was added"}.`,
      whyItMatters: "Archiving stale options keeps the active shortlist focused without deleting the decision history.",
      facts: [{ key: "last_seen", label: "Last checked", value: lastSeen ?? "Not recorded", source: "history", severity: "warning" }],
      sourceLinks: entry.sources.map((source) => ({ label: source.label, url: source.url })),
      primaryAction: {
        type: "archive_listing",
        label: "Archive listing",
        payload: { listingId: entry.listingId, boardListingId: entry.id },
        requiresReview: true,
      },
      secondaryActions: [{
        type: "check_listing",
        label: "Check listing again",
        payload: { listingId: entry.listingId, boardListingId: entry.id },
        requiresReview: false,
      }],
      fingerprint: advisorFingerprint("archive_suggestion", entry.id, entry.listing.status, lastSeen),
    }));
  }
  return actions;
}
