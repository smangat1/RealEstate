import "server-only";

import type { BoardPageData, ListingModelInsight, ListingRecord, SearchProfileData, SearchBoardSummary } from "@/lib/types";
import { getProfileCompletion } from "@/lib/rental-logic";
import { allocateRentFairly } from "@/lib/group-affordability";

export type MobileMemberCardPayload = {
  id: string;
  userId: string;
  roommateId: string | null;
  role: "owner" | "member";
  name: string;
  budgetMin: number | null;
  idealBudget: number | null;
  budgetMax: number | null;
  stretchBudget: number | null;
  budgetLine: string;
  commuteDestination: string;
  commuteAccess: SearchProfileData["commuteAccess"] | null;
  preferredCommuteMinutes: number | null;
  maxCommuteMinutes: number | null;
  commuteLine: string;
  priorities: string[];
  mustHaves: string[];
  dealbreakers: string[];
  petsRequired: boolean | null;
  accessibilityNeeds: string[];
  neighborhoods: string[];
  status: string;
};

export type MobileListingPreviewPayload = {
  id: string;
  listingId: string;
  title: string;
  address: string;
  location: string;
  priceLine: string;
  commuteLine: string;
  summary: string;
  fitLabel: string;
  highlights: string[];
  amenities: string[];
  modelInsights: ListingModelInsight[];
  openRisks: string[];
  status: "new" | "interested" | "maybe" | "rejected" | "toured" | "applied";
  workflowStatus: "suggested" | "source_confirmed" | "considering" | "shortlisted" | "viewing" | "applying" | "decided";
  sourceUrl: string;
  exactSources: {
    id: string;
    catalogSourceId: string | null;
    label: string;
    url: string;
    kind: "imported_exact" | "confirmed_exact" | "member_reference";
    confirmedAt: string | null;
    confirmedBy: string | null;
    trustStatus: "board_only" | "pending_review" | "community_supported" | "verified" | "review_hold" | "rejected";
    warning: string | null;
    confirmationCount: number;
    boardCount: number;
    reportCount: number;
    globallyDiscoverable: boolean;
  }[];
  generatedSearches: {
    label: string;
    url: string;
    provider: string;
  }[];
  verification: {
    status: "unverified" | "active" | "unavailable" | "possibly_stale" | "incorrect_match";
    confirmedBy: string | null;
    confirmedAt: string | null;
    note: string | null;
  };
  freshness: {
    providerLastSeenAt: string | null;
    providerFetchedAt: string | null;
    exactSourceConfirmedAt: string | null;
  };
  groupNote: string;
  photoUrl: string;
  unit: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: number | null;
  latitude: number | null;
  longitude: number | null;
  reactions: { name: string; vote: "love" | "like" | "maybe" | "pass" | "veto"; note: string | null }[];
  comments: { id: string; name: string; content: string; createdAt: string }[];
  ratings: {
    id: string;
    memberId: string;
    userId: string;
    name: string;
    values: Record<string, number>;
    updatedAt: string;
  }[];
  reviews: {
    id: string;
    memberId: string;
    userId: string;
    name: string;
    tourIntent: "yes" | "maybe" | "no";
    interiorAppeal: number | null;
    naturalLight: "unknown" | "poor" | "fair" | "good" | "excellent";
    mainConcern: string | null;
    updatedAt: string;
  }[];
  decisions: {
    id: string;
    type: "shortlist" | "request_viewing" | "apply";
    closedAt: string | null;
    votes: { name: string; choice: "yes" | "no" | "abstain" }[];
  }[];
  analysis: BoardPageData["listingAnalysisByBoardListingId"][string] | null;
  rentSplit: {
    status: "ready" | "stretch" | "over_budget" | "incomplete";
    summary: string;
    totalComfortableBudget: number | null;
    totalStretchBudget: number | null;
    missingMemberNames: string[];
    shares: {
      memberId: string;
      name: string;
      amount: number;
      percentOfRent: number;
      percentOfComfortableBudget: number;
      comfortableBudget: number;
    }[];
  } | null;
};

export type MobileBoardPayload = {
  id: string;
  title: string;
  city: string;
  moveInTimeline: string;
  groupSize: string;
  budgetLine: string;
  commuteTargets: string[];
  readiness: string;
  completionLine: string;
  nextBestAction: string;
  inviteCode: string;
  recentActivity: string[];
  chatMessages: {
    id: string;
    role: "user" | "assistant" | "system";
    authorName: string | null;
    content: string;
    createdAt: string;
  }[];
  openQuestions: string[];
  members: MobileMemberCardPayload[];
  suggestions: MobileListingPreviewPayload[];
  shortlist: MobileListingPreviewPayload[];
  invitations: {
    id: string;
    email: string | null;
    inviteCode: string;
    status: "pending" | "accepted" | "revoked";
    expiresAt: string | null;
  }[];
  ranking: {
    boardListingId: string;
    listingId: string;
    position: number;
    label: string;
    verdict: string;
    overallScore: number | null;
    lowestRoommateScore: number | null;
    fairnessScore: number | null;
    confidence: "high" | "medium" | "low";
  }[];
};

function currencyLine(min?: number, max?: number) {
  if (typeof min === "number" && typeof max === "number") {
    return `$${min.toLocaleString()}–$${max.toLocaleString()}`;
  }
  if (typeof max === "number") {
    return `Up to $${max.toLocaleString()}`;
  }
  if (typeof min === "number") {
    return `From $${min.toLocaleString()}`;
  }
  return "Budget still open";
}

function profileProgressLine(profile: SearchProfileData) {
  const completion = getProfileCompletion(profile);
  if (completion.missingFields.length === 0) {
    return "Core search constraints aligned";
  }
  return `Missing: ${completion.missingFields.join(", ")}`;
}

function profileReadiness(profile: SearchProfileData) {
  return profile.completionStatus === "confirmed" || profile.completionStatus === "complete"
    ? "Board brief ready"
    : "Profile still in progress";
}

function commuteTargets(profile: SearchProfileData) {
  const targets: string[] = [];
  if (profile.commuteTarget?.trim()) {
    targets.push(
      profile.minCommuteMinutes !== undefined && profile.maxCommuteMinutes !== undefined
        ? `${profile.commuteTarget.trim()} · ideal ${profile.minCommuteMinutes}–${profile.maxCommuteMinutes} min`
        : profile.commuteTarget.trim(),
    );
  }
  return targets;
}

function memberBudgetLine(input: {
  budgetMin: number | null;
  idealBudget: number | null;
  budgetMax: number | null;
  stretchBudget: number | null;
}) {
  const comfortable = currencyLine(input.budgetMin ?? undefined, input.budgetMax ?? undefined);
  const ideal =
    input.idealBudget !== null
      ? `ideal $${input.idealBudget.toLocaleString()}`
      : comfortable;
  if (input.stretchBudget && input.stretchBudget > (input.budgetMax ?? 0)) {
    return `${ideal} · hard max $${input.budgetMax?.toLocaleString() ?? input.stretchBudget.toLocaleString()}`;
  }
  if (input.budgetMax !== null && input.idealBudget !== input.budgetMax) {
    return `${ideal} · hard max $${input.budgetMax.toLocaleString()}`;
  }
  return ideal;
}

function memberCommuteLine(input: {
  commuteDestination: string | null;
  preferredCommuteMinutes: number | null;
  maxCommuteMinutes: number | null;
}) {
  if (!input.commuteDestination) return "Commute not included";
  return input.preferredCommuteMinutes !== null && input.maxCommuteMinutes !== null
    ? `${input.commuteDestination} · ideal ${input.preferredCommuteMinutes}–${input.maxCommuteMinutes} min`
    : input.commuteDestination;
}

function memberPreferenceMissing(input: {
  idealBudget: number | null;
  budgetMax: number | null;
  commuteDestination: string | null;
  preferredNeighborhoods: string[];
  mustHaves: string[];
  dealbreakers: string[];
}) {
  return [
    input.idealBudget === null ? "ideal budget" : null,
    input.budgetMax === null ? "maximum budget" : null,
    !input.commuteDestination && input.preferredNeighborhoods.length === 0 ? "commute address or neighborhoods" : null,
    input.mustHaves.length === 0 ? "must-haves" : null,
    input.dealbreakers.length === 0 ? "hard limits" : null,
  ].filter((value): value is string => Boolean(value));
}

function formatListingLocation(input: {
  neighborhood?: string | null;
  city?: string | null;
  address?: string | null;
}) {
  return [input.neighborhood, input.city].filter(Boolean).join(", ") || input.address || "Location still unclear";
}

function listingDisplayTitle(listing: ListingRecord) {
  const capturedTitle = listing.providerData.homeboardListingTitle;
  return typeof capturedTitle === "string" && capturedTitle.trim()
    ? capturedTitle.trim()
    : listing.address || listing.neighborhood || "Untitled listing";
}

function listingModelInsights(listing: ListingRecord): ListingModelInsight[] {
  const value = listing.providerData.homeboardModelInsights;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    if (
      typeof item.category !== "string"
      || typeof item.label !== "string"
      || typeof item.sentiment !== "number"
      || typeof item.confidence !== "number"
      || typeof item.evidence !== "string"
    ) return [];
    return [{
      category: item.category as ListingModelInsight["category"],
      label: item.label,
      sentiment: Math.min(Math.max(item.sentiment, -1), 1),
      confidence: Math.min(Math.max(item.confidence, 0), 1),
      evidence: item.evidence,
    }];
  }).slice(0, 16);
}

function boardOpenDecisions(data: BoardPageData) {
  const resolved = new Set(
    data.activity
      .filter((entry) => entry.eventType === "decision_resolved")
      .map((entry) => entry.content.split(" || ")[0]?.trim().toLowerCase()),
  );
  return data.activity
    .filter((entry) => entry.eventType === "decision_opened")
    .map((entry) => entry.content.trim())
    .filter((entry, index, all) => !resolved.has(entry.toLowerCase()) && all.indexOf(entry) === index);
}

function mapSuggestedListingForMobile(
  entry: BoardPageData["suggestedListings"][number],
  data: BoardPageData,
): MobileListingPreviewPayload {
  const listing = entry.listing;
  const commuteLine = entry.commute?.bestDurationMinutes
    ? `${entry.commute.bestDurationMinutes} min driving estimate`
    : "Compare group commutes";

  return {
    id: listing.id,
    listingId: listing.id,
    title: listingDisplayTitle(listing),
    address: listing.address ?? "",
    location: formatListingLocation(listing),
    priceLine:
      typeof listing.price === "number"
        ? `$${listing.price.toLocaleString()}`
        : "Price unclear",
    commuteLine,
    summary:
      entry.tradeoffSummary ||
      entry.fitReason ||
      listing.description ||
      "Open this listing to compare it against the group brief.",
    fitLabel: entry.fitLabel,
    highlights: [
      entry.fitReason,
      entry.neighborhoodSignal?.summary,
      ...(listing.amenities ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .slice(0, 3),
    amenities: listing.amenities ?? [],
    modelInsights: listingModelInsights(listing),
    openRisks: [],
    status: "new",
    workflowStatus: "suggested",
    sourceUrl: "",
    exactSources: [],
    // Address-search links are not listing results. Only return source actions
    // when Homeboard has an exact URL attached to the property.
    generatedSearches: [],
    verification: {
      status: "unverified",
      confirmedBy: null,
      confirmedAt: null,
      note: null,
    },
    freshness: {
      providerLastSeenAt: listing.providerLastSeenAt,
      providerFetchedAt: listing.providerFetchedAt,
      exactSourceConfirmedAt: null,
    },
    groupNote: "",
    photoUrl: "",
    unit: listing.unit ?? "",
    bedrooms: typeof listing.bedrooms === "number" ? String(listing.bedrooms) : "",
    bathrooms: typeof listing.bathrooms === "number" ? String(listing.bathrooms) : "",
    squareFeet: listing.squareFeet,
    latitude: listing.latitude,
    longitude: listing.longitude,
    reactions: [],
    comments: [],
    ratings: [],
    reviews: [],
    decisions: [],
    analysis: entry.analysis ?? null,
    rentSplit: allocateRentFairly(listing.price, data.roommates),
  };
}

export function mapListingInventoryForMobile(
  listing: ListingRecord,
  source: {
    id: string;
    canonicalUrl: string;
    provider: string;
    trustStatus: "community_supported" | "verified";
    warning: string | null;
    confirmationCount: number;
    boardCount: number;
    reportCount: number;
  },
): MobileListingPreviewPayload {
  const sourceUrl = source.canonicalUrl;
  const sourceLabel =
    source.provider.trim()
      ? `${source.provider.trim()} listing`
      : "Original listing";

  return {
    id: listing.id,
    listingId: listing.id,
    title: listingDisplayTitle(listing),
    address: listing.address ?? "",
    location: formatListingLocation(listing),
    priceLine:
      typeof listing.price === "number"
        ? `$${listing.price.toLocaleString()}`
        : "Price unclear",
    commuteLine: "Compare group commutes",
    summary:
      listing.description ||
      "Open the original listing and bring it onto the board if the group wants to discuss it.",
    fitLabel: "Catalog listing",
    highlights: (listing.amenities ?? []).slice(0, 3),
    amenities: listing.amenities ?? [],
    modelInsights: listingModelInsights(listing),
    openRisks: [],
    status: "new",
    workflowStatus: "suggested",
    sourceUrl,
    exactSources: sourceUrl
      ? [{
          id: `inventory-source:${listing.id}`,
          catalogSourceId: source.id,
          label: sourceLabel,
          url: sourceUrl,
          kind: "imported_exact",
          confirmedAt: null,
          confirmedBy: null,
          trustStatus: source.trustStatus,
          warning: source.warning,
          confirmationCount: source.confirmationCount,
          boardCount: source.boardCount,
          reportCount: source.reportCount,
          globallyDiscoverable: true,
        }]
      : [],
    generatedSearches: [],
    verification: {
      status: source.trustStatus === "verified" ? "active" : "unverified",
      confirmedBy: null,
      confirmedAt: null,
      note: null,
    },
    freshness: {
      providerLastSeenAt: listing.providerLastSeenAt,
      providerFetchedAt: listing.providerFetchedAt,
      exactSourceConfirmedAt: null,
    },
    groupNote: "",
    photoUrl: "",
    unit: listing.unit ?? "",
    bedrooms: typeof listing.bedrooms === "number" ? String(listing.bedrooms) : "",
    bathrooms: typeof listing.bathrooms === "number" ? String(listing.bathrooms) : "",
    squareFeet: listing.squareFeet,
    latitude: listing.latitude,
    longitude: listing.longitude,
    reactions: [],
    comments: [],
    ratings: [],
    reviews: [],
    decisions: [],
    analysis: null,
    rentSplit: null,
  };
}

export function mapBoardSummaryForMobile(board: SearchBoardSummary) {
  return {
    id: board.id,
    title: board.title,
    city: board.city ?? "",
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

export function buildMobileBoardPayload(data: BoardPageData): MobileBoardPayload {
  const board = data.board;
  const profile = data.profile;

  const ranked = data.boardListings
    .filter((entry) => entry.userStatus !== "rejected" && entry.workflowStatus !== "decided")
    .map((entry) => ({ entry, analysis: data.listingAnalysisByBoardListingId[entry.id] }))
    .sort((left, right) => {
      if ((left.analysis?.hardFailureCount ?? 0) !== (right.analysis?.hardFailureCount ?? 0)) {
        return (left.analysis?.hardFailureCount ?? 0) - (right.analysis?.hardFailureCount ?? 0);
      }
      return (right.analysis?.fairnessScore ?? -1) - (left.analysis?.fairnessScore ?? -1);
    });
  const activeListings = data.boardListings.filter(
    (entry) => entry.userStatus !== "rejected" && entry.workflowStatus !== "decided",
  );
  const firstUnconfirmed = activeListings.find(
    (entry) => !(data.listingSourcesByBoardListingId[entry.id] ?? []).some((source) => source.confirmedAt),
  );
  const firstHardFailure = activeListings.find(
    (entry) => (data.listingAnalysisByBoardListingId[entry.id]?.hardFailureCount ?? 0) > 0,
  );
  const firstReviewPending = activeListings.find(
    (entry) => (data.listingReviewsByBoardListingId[entry.id] ?? []).length < data.roommates.length,
  );
  const listingLabel = (entry: (typeof activeListings)[number]) =>
    entry.listing.address || entry.listing.neighborhood || "the leading listing";

  return {
    id: board.id,
    title: board.title,
    city: profile.city || board.city || "City still open",
    moveInTimeline: profile.moveInDate || profile.moveInTimeframe || "Move-in still open",
    groupSize: profile.groupSize && profile.groupSize > 1 ? `${profile.groupSize} renters` : "1 renter",
    budgetLine: data.groupSynthesis.budgetRangeText ?? "Waiting for member budgets",
    commuteTargets: data.roommates
      .filter((roommate) => Boolean(roommate.commuteDestination))
      .map((roommate) => memberCommuteLine(roommate)),
    readiness: profileReadiness(profile),
    completionLine: profileProgressLine(profile),
    nextBestAction:
      (data.groupSynthesis.missingBudgetMemberNames?.length ?? 0) > 0
        ? `Have ${data.groupSynthesis.missingBudgetMemberNames?.join(", ")} add a personal budget so affordability and fair rent splits are accurate.`
        : data.missingFields.length > 0
        ? "Finish the missing profile fields so the group can compare real options with confidence."
        : firstUnconfirmed
          ? `Confirm the exact external source for ${listingLabel(firstUnconfirmed)}.`
          : firstHardFailure
            ? `Resolve the hard constraints on ${listingLabel(firstHardFailure)} or remove it from serious consideration.`
            : firstReviewPending
              ? `Have the remaining roommates complete a quick gallery review for ${listingLabel(firstReviewPending)}.`
              : board.listings.length > 0
                ? "Open a focused vote on the next viewing or application."
                : "Invite the rest of the group and start adding the first serious listings to the board.",
    inviteCode: data.invitations.find((invitation) => invitation.status === "pending")?.inviteCode ?? "",
    recentActivity: data.activity.slice(0, 5).map((entry) => entry.content),
    chatMessages: data.messages.slice(-20).map((message) => ({
      id: message.id,
      role: message.role,
      authorName: message.authorName,
      content: message.content,
      createdAt: message.createdAt,
    })),
    openQuestions: Array.from(
      new Set([
        ...boardOpenDecisions(data),
        ...(data.missingFields.length > 0
          ? data.missingFields.map((field) => `Still needed: ${field}.`)
          : data.groupSynthesis.tensionFlags.length > 0
            ? data.groupSynthesis.tensionFlags
            : [
                ...ranked.flatMap(({ analysis }) => analysis?.nextActions ?? []).slice(0, 3),
                "Which listing deserves the first serious group read?",
              ]),
      ]),
    ),
    members: [
      ...data.members.map((member) => {
      const linkedRoommate = data.roommates.find((roommate) => roommate.linkedUserId === member.userId);
      return {
        id: member.id,
        userId: member.userId,
        roommateId: linkedRoommate?.id ?? null,
        role: member.role,
        name: member.user.displayName,
        budgetMin: linkedRoommate?.budgetMin ?? null,
        idealBudget: linkedRoommate?.idealBudget ?? null,
        budgetMax: linkedRoommate?.budgetMax ?? null,
        stretchBudget: linkedRoommate?.stretchBudget ?? null,
        budgetLine: linkedRoommate ? memberBudgetLine(linkedRoommate) : "Budget still open",
        commuteDestination: linkedRoommate?.commuteDestination ?? "",
        commuteAccess: linkedRoommate?.commuteAccess ?? null,
        preferredCommuteMinutes: linkedRoommate?.preferredCommuteMinutes ?? null,
        maxCommuteMinutes: linkedRoommate?.maxCommuteMinutes ?? null,
        commuteLine: linkedRoommate ? memberCommuteLine(linkedRoommate) : "Commute not included",
        priorities: linkedRoommate
          ? [
              linkedRoommate.commutePriority === "high" ? "commute" : "",
              linkedRoommate.neighborhoodPriority === "high" ? "neighborhood" : "",
              linkedRoommate.spacePriority === "high" ? "space" : "",
            ].filter(Boolean)
          : profile.priorities.slice(0, 3),
        mustHaves: linkedRoommate?.mustHaves.length ? linkedRoommate.mustHaves : profile.mustHaves,
        dealbreakers: linkedRoommate?.dealbreakers.length ? linkedRoommate.dealbreakers : profile.dealbreakers,
        petsRequired: linkedRoommate?.petsRequired ?? null,
        accessibilityNeeds: linkedRoommate?.accessibilityNeeds ?? [],
        neighborhoods: linkedRoommate?.preferredNeighborhoods.length ? linkedRoommate.preferredNeighborhoods : profile.neighborhoods,
        status: linkedRoommate
          ? memberPreferenceMissing(linkedRoommate).length === 0
            ? "profile complete"
            : `missing ${memberPreferenceMissing(linkedRoommate).join(", ")}`
          : "profile incomplete",
      };
      }),
      ...data.roommates
        .filter((roommate) => !roommate.linkedUserId)
        .map((roommate) => ({
          id: roommate.id,
          userId: "",
          roommateId: roommate.id,
          role: "member" as const,
          name: roommate.name,
          budgetMin: roommate.budgetMin,
          idealBudget: roommate.idealBudget,
          budgetMax: roommate.budgetMax,
          stretchBudget: roommate.stretchBudget,
          budgetLine: memberBudgetLine(roommate),
          commuteDestination: roommate.commuteDestination ?? "",
          commuteAccess: roommate.commuteAccess ?? null,
          preferredCommuteMinutes: roommate.preferredCommuteMinutes,
          maxCommuteMinutes: roommate.maxCommuteMinutes,
          commuteLine: memberCommuteLine(roommate),
          priorities: [
            roommate.commutePriority === "high" ? "commute" : "",
            roommate.neighborhoodPriority === "high" ? "neighborhood" : "",
            roommate.spacePriority === "high" ? "space" : "",
          ].filter(Boolean),
          mustHaves: roommate.mustHaves,
          dealbreakers: roommate.dealbreakers,
          petsRequired: roommate.petsRequired,
          accessibilityNeeds: roommate.accessibilityNeeds,
          neighborhoods: roommate.preferredNeighborhoods,
          status:
            memberPreferenceMissing(roommate).length === 0
              ? "profile complete"
              : `missing ${memberPreferenceMissing(roommate).join(", ")}`,
        })),
    ],
    // Search inventory is loaded independently by viewport or cursor. Keeping it
    // out of the board payload prevents every collaboration update from
    // retransmitting the full catalog.
    suggestions: [],
    shortlist: data.boardListings
      .filter((entry) => entry.userStatus !== "rejected")
      .slice(0, 30)
      .map((entry) => {
        const commute = data.boardListingCommutesByBoardListingId[entry.id];
        const reactions = data.listingVotesByBoardListingId[entry.id] ?? [];
        const comments = data.listingCommentsByBoardListingId[entry.id] ?? [];
        const ratings = data.listingRatingsByBoardListingId[entry.id] ?? [];
        return {
          id: entry.id,
          listingId: entry.listingId,
          title: listingDisplayTitle(entry.listing),
          address: entry.listing.address ?? "",
          location: formatListingLocation(entry.listing),
          priceLine: typeof entry.listing.price === "number" ? `$${entry.listing.price.toLocaleString()}` : "Price unclear",
          commuteLine: commute?.bestDurationMinutes ? `${commute.bestDurationMinutes} min driving estimate` : "Commute still unevaluated",
          summary: entry.aiTradeoffAnalysis || entry.aiSummary || entry.listing.description || "The group still needs to review this listing.",
          fitLabel: entry.userStatus === "interested" ? "Group favorite" : entry.userStatus === "toured" ? "Toured" : "Shortlisted",
          highlights: [entry.aiSummary, ...(entry.listing.amenities ?? [])].filter((value): value is string => Boolean(value)).slice(0, 3),
          amenities: entry.listing.amenities ?? [],
          modelInsights: listingModelInsights(entry.listing),
          openRisks: entry.aiRedFlags.slice(0, 3),
          status: entry.userStatus,
          workflowStatus: entry.workflowStatus,
          sourceUrl:
            (data.listingSourcesByBoardListingId[entry.id] ?? [])[0]?.url
            ?? entry.listing.sourceUrl
            ?? "",
          exactSources: (data.listingSourcesByBoardListingId[entry.id] ?? []).map((source) => ({
            id: source.id,
            catalogSourceId: source.catalogSourceId,
            label: source.label,
            url: source.url,
            kind: source.kind,
            confirmedAt: source.confirmedAt,
            confirmedBy: source.createdByRoommate?.name ?? null,
            trustStatus: source.catalogSource?.trustStatus ?? "board_only",
            warning:
              source.catalogSource?.warning
              ?? "This source is only visible to this board until it receives more confirmation.",
            confirmationCount: source.catalogSource?.confirmationCount ?? 0,
            boardCount: source.catalogSource?.boardCount ?? 1,
            reportCount: source.catalogSource?.reportCount ?? 0,
            globallyDiscoverable: source.catalogSource?.globallyDiscoverable ?? false,
          })),
          generatedSearches: [],
          verification: (() => {
            const latest = (data.listingVerificationsByBoardListingId[entry.id] ?? [])[0];
            return {
              status: latest?.status ?? "unverified",
              confirmedBy: latest?.roommate?.name ?? null,
              confirmedAt: latest?.createdAt ?? null,
              note: latest?.note ?? null,
            };
          })(),
          freshness: {
            providerLastSeenAt: entry.listing.providerLastSeenAt,
            providerFetchedAt: entry.listing.providerFetchedAt,
            exactSourceConfirmedAt:
              (data.listingSourcesByBoardListingId[entry.id] ?? []).find((source) => source.confirmedAt)?.confirmedAt ?? null,
          },
          groupNote: entry.userNotes || "",
          photoUrl: "",
          unit: entry.listing.unit ?? "",
          bedrooms: typeof entry.listing.bedrooms === "number" ? String(entry.listing.bedrooms) : "",
          bathrooms: typeof entry.listing.bathrooms === "number" ? String(entry.listing.bathrooms) : "",
          squareFeet: entry.listing.squareFeet,
          latitude: entry.listing.latitude,
          longitude: entry.listing.longitude,
          reactions: reactions.map((reaction) => ({
            name: reaction.roommate.name,
            vote: reaction.vote,
            note: reaction.note,
          })),
          comments: comments.map((comment) => ({
            id: comment.id,
            name: comment.roommate.name,
            content: comment.content,
            createdAt: comment.createdAt,
          })),
          ratings: ratings.map((rating) => ({
            id: rating.id,
            memberId: rating.roommateId,
            userId: rating.roommate.linkedUserId ?? "",
            name: rating.roommate.name,
            values: rating.ratings,
            updatedAt: rating.updatedAt,
          })),
          reviews: (data.listingReviewsByBoardListingId[entry.id] ?? []).map((review) => ({
            id: review.id,
            memberId: review.roommateId,
            userId: review.roommate.linkedUserId ?? "",
            name: review.roommate.name,
            tourIntent: review.tourIntent,
            interiorAppeal: review.interiorAppeal,
            naturalLight: review.naturalLight,
            mainConcern: review.mainConcern,
            updatedAt: review.updatedAt,
          })),
          decisions: (data.listingDecisionsByBoardListingId[entry.id] ?? []).map((decision) => ({
            id: decision.id,
            type: decision.type,
            closedAt: decision.closedAt,
            votes: decision.votes.map((vote) => ({
              name: vote.roommate.name,
              choice: vote.choice,
            })),
          })),
          analysis: data.listingAnalysisByBoardListingId[entry.id] ?? null,
          rentSplit: allocateRentFairly(entry.listing.price, data.roommates),
        };
      }),
    invitations: data.invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      inviteCode: invitation.inviteCode,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    })),
    ranking: ranked.map(({ entry, analysis }, index) => ({
      boardListingId: entry.id,
      listingId: entry.listingId,
      position: index + 1,
      label: analysis?.rankingLabel ?? "needs review",
      verdict: analysis?.verdict ?? "The group still needs more verified information.",
      overallScore: analysis?.overallScore ?? null,
      lowestRoommateScore: analysis?.lowestRoommateScore ?? null,
      fairnessScore: analysis?.fairnessScore ?? null,
      confidence: analysis?.confidence ?? "low",
    })),
  };
}
