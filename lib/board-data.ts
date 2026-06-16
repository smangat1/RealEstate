import { randomBytes, randomUUID } from "node:crypto";

import type {
  BoardActivityRecord,
  BoardListingCommuteRecord,
  BoardListingCommentRecord,
  BoardListingRecord,
  BoardInvitationRecord,
  BoardMemberRecord,
  BoardListingVoteRecord,
  BoardPageData,
  GroupSynthesis,
  ListingBrowseRequest,
  ListingRecord,
  AuthUserRecord,
  RoommateRecord,
  SearchBoardSummary,
  SearchProfileData,
  SuggestedListingRecord,
} from "@/lib/types";
import {
  extractSearchProfileUpdatesWithAI,
  generateConversationalReplyWithAI,
  mergeProfileUpdates,
} from "@/lib/chat-ai";
import { getDemoComparisonCopy, getDemoScenarioListingIds, isDemoModeEnabled, runDemoChatTurn } from "@/lib/demo-chat";
import {
  applyMessageToProfile,
  createBlankProfile,
  finalizeProfileState,
  generateAssistantReply,
  generateComparison,
  generateListingAnalysis,
  encodeNotesPayload,
  getConversationHint,
  getMissingFields,
  getProfileCompletion,
  mapProfileRow,
  parseListingBrowseRequest,
} from "@/lib/rental-logic";
import { estimateCommutes } from "@/lib/commute-service";
import { getNeighborhoodSignal } from "@/lib/neighborhood-signals";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/analytics";
import { buildStarterListings } from "@/lib/starter-listings";
import { getDemoPropertyById, getDemoPropertiesForScenario } from "@/lib/demo-properties";
import { matchDemoScenarioForProfile } from "@/lib/demo-scenarios";

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function json(value: unknown) {
  return JSON.stringify(value);
}

function toIso(value: Date | string) {
  return typeof value === "string" ? value : value.toISOString();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function createInviteCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

function starterSeedToListingRecord(seed: ReturnType<typeof buildStarterListings>[number], index: number): ListingRecord {
  return {
    id: seed.id ?? `demo-seed-${index}`,
    source: seed.source,
    sourceName: seed.sourceName ?? null,
    sourceUrl: seed.sourceUrl ?? null,
    externalId: null,
    address: seed.address,
    city: seed.city,
    state: seed.state,
    zip: null,
    neighborhood: seed.neighborhood,
    price: seed.price,
    bedrooms: seed.bedrooms,
    bathrooms: seed.bathrooms,
    squareFeet: seed.squareFeet,
    availableDate: null,
    propertyType: seed.propertyType,
    amenities: seed.amenities,
    fees: {
      brokerFee: null,
      applicationFee: 50,
      deposit: Math.round(seed.price * 0.75),
      utilitiesIncluded: null,
    },
    description: seed.description,
    images: seed.images ?? [],
    status: seed.status,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeLooseText(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function formatListingLabel(input: {
  neighborhood?: string | null;
  city?: string | null;
  address?: string | null;
  price?: number | null;
}) {
  const place = [input.neighborhood, input.city].filter(Boolean).join(", ") || input.address || "Untitled listing";
  if (input.price) {
    return `${place} at $${input.price.toLocaleString()}`;
  }
  return place;
}

function levelWeight(level: "low" | "medium" | "high") {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function profilePriorityWeight(profile: SearchProfileData, label: string) {
  return profile.priorities.includes(label) ? 3 : 2;
}

function summarizeGroup(roommates: RoommateRecord[], profile: SearchProfileData): GroupSynthesis {
  const budgets = roommates.map((roommate) => roommate.budgetMax).filter((value): value is number => value !== null);
  const groupBudgetMax = budgets.length > 0 ? Math.min(...budgets) : (profile.budgetMax ?? null);
  const commuteDestinations = unique(roommates.map((roommate) => roommate.commuteDestination ?? ""));
  const preferredNeighborhoods = unique([
    ...profile.neighborhoods,
    ...roommates.flatMap((roommate) => roommate.preferredNeighborhoods),
  ]);
  const mustHaves = unique([
    ...profile.mustHaves,
    ...roommates.flatMap((roommate) => roommate.mustHaves),
  ]);
  const dealbreakers = unique([
    ...profile.dealbreakers,
    ...roommates.flatMap((roommate) => roommate.dealbreakers),
  ]);

  const priorityTallies = [
    { label: "price", score: profilePriorityWeight(profile, "price") },
    { label: "space", score: profilePriorityWeight(profile, "space") },
    {
      label: "commute",
      score: profilePriorityWeight(profile, "commute") + roommates.reduce((sum, roommate) => sum + levelWeight(roommate.commutePriority), 0),
    },
    {
      label: "neighborhood",
      score: profilePriorityWeight(profile, "neighborhood") + roommates.reduce((sum, roommate) => sum + levelWeight(roommate.neighborhoodPriority), 0),
    },
    { label: "amenities", score: profilePriorityWeight(profile, "amenities") },
    { label: "privacy", score: roommates.reduce((sum, roommate) => sum + levelWeight(roommate.privacyPriority), 0) },
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => entry.label);

  const neighborhoodCounts = new Map<string, number>();
  for (const neighborhood of preferredNeighborhoods) {
    neighborhoodCounts.set(neighborhood, (neighborhoodCounts.get(neighborhood) ?? 0) + 1);
  }

  const compromiseAreas = [...neighborhoodCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([neighborhood]) => neighborhood);

  const tensionFlags: string[] = [];
  if (budgets.length >= 2 && Math.max(...budgets) - Math.min(...budgets) > 900) {
    tensionFlags.push("The roommate budget ceilings are spread out enough that price fairness will matter.");
  }
  if (commuteDestinations.length > 1) {
    tensionFlags.push("There are multiple commute targets, so the board needs a compromise area rather than a perfect winner.");
  }
  if (
    roommates.some((roommate) => roommate.neighborhoodPriority === "high") &&
    roommates.some((roommate) => roommate.commutePriority === "high")
  ) {
    tensionFlags.push("Neighborhood energy and commute convenience are both pulling hard, so tradeoffs need to stay explicit.");
  }

  const compromiseLine =
    compromiseAreas.length > 0
      ? `The current center of gravity is around ${compromiseAreas.join(", ")}.`
      : "The group has not settled on obvious compromise neighborhoods yet.";

  const summary =
    roommates.length === 0
      ? "This board is still basically single-player right now. Add roommates so the group tradeoff view starts becoming real."
      : `This board is balancing ${priorityTallies.join(", ")} across ${roommates.length} roommates. ${compromiseLine} ${
          tensionFlags[0] ?? "Right now the group constraints are aligned enough to keep browsing without too much friction."
        }`;

  return {
    groupBudgetMax,
    commuteDestinations,
    preferredNeighborhoods,
    mustHaves,
    dealbreakers,
    topSharedPriorities: priorityTallies,
    compromiseAreas,
    tensionFlags,
    summary,
  };
}

function groupByKey<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, T[]>>((accumulator, item) => {
    const bucket = String(item[key]);
    accumulator[bucket] ??= [];
    accumulator[bucket].push(item);
    return accumulator;
  }, {});
}

function mapUserRow(row: {
  id: string;
  authUserId: string | null;
  email: string | null;
  displayName: string;
  workAddress: string | null;
  secondaryWorkAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AuthUserRecord {
  return {
    id: row.id,
    authUserId: row.authUserId ?? "",
    email: row.email ?? "",
    displayName: row.displayName,
    workAddress: row.workAddress,
    secondaryWorkAddress: row.secondaryWorkAddress,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapBoardMemberRow(row: {
  id: string;
  boardId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  createdAt: Date;
  user: {
    id: string;
    authUserId: string | null;
    email: string | null;
    displayName: string;
    workAddress: string | null;
    secondaryWorkAddress: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}): BoardMemberRecord {
  return {
    id: row.id,
    boardId: row.boardId,
    userId: row.userId,
    role: row.role as BoardMemberRecord["role"],
    joinedAt: row.joinedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    user: {
      id: row.user.id,
      email: row.user.email ?? "",
      displayName: row.user.displayName,
      workAddress: row.user.workAddress,
      secondaryWorkAddress: row.user.secondaryWorkAddress,
    },
  };
}

function mapInvitationRow(row: {
  id: string;
  boardId: string;
  invitedByUserId: string;
  email: string;
  inviteCode: string;
  status: string;
  createdAt: Date;
  acceptedAt: Date | null;
  expiresAt: Date | null;
}): BoardInvitationRecord {
  return {
    id: row.id,
    boardId: row.boardId,
    invitedByUserId: row.invitedByUserId,
    email: row.email,
    inviteCode: row.inviteCode,
    status: row.status as BoardInvitationRecord["status"],
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

function mapListingRow(row: {
  id: string;
  source: string;
  sourceName: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  neighborhood: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  availableDate: Date | null;
  propertyType: string | null;
  amenities: string | null;
  fees: string | null;
  description: string | null;
  images: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): ListingRecord {
  return {
    id: row.id,
    source: row.source as ListingRecord["source"],
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    externalId: row.externalId,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    neighborhood: row.neighborhood,
    price: row.price,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    squareFeet: row.squareFeet,
    availableDate: row.availableDate ? row.availableDate.toISOString() : null,
    propertyType: row.propertyType,
    amenities: parseJsonArray(row.amenities),
    fees: parseJsonObject(row.fees),
    description: row.description,
    images: parseJsonArray(row.images),
    status: row.status as ListingRecord["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRoommateRow(row: {
  id: string;
  boardId: string;
  linkedUserId: string | null;
  name: string;
  roleLabel: string;
  budgetMax: number | null;
  commuteDestination: string | null;
  commutePriority: string;
  neighborhoodPriority: string;
  spacePriority: string;
  privacyPriority: string;
  preferredNeighborhoods: string | null;
  mustHaves: string | null;
  dealbreakers: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RoommateRecord {
  return {
    id: row.id,
    boardId: row.boardId,
    linkedUserId: row.linkedUserId,
    name: row.name,
    roleLabel: row.roleLabel,
    budgetMax: row.budgetMax,
    commuteDestination: row.commuteDestination,
    commutePriority: row.commutePriority as RoommateRecord["commutePriority"],
    neighborhoodPriority: row.neighborhoodPriority as RoommateRecord["neighborhoodPriority"],
    spacePriority: row.spacePriority as RoommateRecord["spacePriority"],
    privacyPriority: row.privacyPriority as RoommateRecord["privacyPriority"],
    preferredNeighborhoods: parseJsonArray(row.preferredNeighborhoods),
    mustHaves: parseJsonArray(row.mustHaves),
    dealbreakers: parseJsonArray(row.dealbreakers),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureStarterCatalog() {
  const count = await prisma.listing.count();
  if (count > 0) return;

  const now = new Date();
  await prisma.listing.createMany({
    data: buildStarterListings().map((seed) => ({
      id: randomUUID(),
      source: seed.source,
      sourceName: seed.sourceName,
      address: seed.address,
      city: seed.city,
      state: seed.state,
      neighborhood: seed.neighborhood,
      price: seed.price,
      bedrooms: seed.bedrooms,
      bathrooms: seed.bathrooms,
      squareFeet: seed.squareFeet,
      propertyType: seed.propertyType,
      amenities: json(seed.amenities),
      fees: json({
        brokerFee: null,
        applicationFee: 50,
        deposit: Math.round(seed.price * 0.75),
        utilitiesIncluded: null,
      }),
      description: seed.description,
      images: json(seed.images ?? []),
      sourceUrl: seed.sourceUrl ?? null,
      status: seed.status,
      createdAt: now,
      updatedAt: now,
    })),
  });
}

export async function getUserById(userId: string) {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  return row ? mapUserRow(row) : null;
}

export async function getUserByAuthId(authUserId: string) {
  const row = await prisma.user.findUnique({ where: { authUserId } });
  return row ? mapUserRow(row) : null;
}

export async function updateUserProfile(userId: string, input: { displayName: string; workAddress?: string; secondaryWorkAddress?: string }) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: input.displayName.trim() || "Board member",
      workAddress: input.workAddress?.trim() || null,
      secondaryWorkAddress: input.secondaryWorkAddress?.trim() || null,
    },
  });
}

export async function updateBoardProfileForUser(
  boardId: string,
  userId: string,
  input: {
    name?: string;
    city?: string;
    moveInDate?: string;
    budgetMin?: number | null;
    budgetMax?: number | null;
    stretchBudget?: number | null;
    groupSize?: number | null;
    hasRoommates?: boolean | null;
    commuteTarget?: string;
    maxCommuteMinutes?: number | null;
    neighborhoods?: string[];
    mustHaves?: string[];
    niceToHaves?: string[];
    dealbreakers?: string[];
    priorities?: string[];
    pets?: boolean | null;
    parking?: boolean | null;
    rentalReadiness?: SearchProfileData["rentalReadiness"];
  },
) {
  const board = await ensureBoard(boardId, userId);
  if (!board) {
    throw new Error("Board not found.");
  }

  const data = await getBoardPageData(boardId, userId);
  if (!data) {
    throw new Error("Profile not found.");
  }

  const nextProfile = finalizeProfileState({
    ...data.profile,
    name: input.name?.trim() || data.profile.name,
    city: input.city?.trim() || undefined,
    locations: input.city?.trim() ? [input.city.trim()] : data.profile.locations,
    moveInDate: input.moveInDate?.trim() || undefined,
    moveInTimeframe: input.moveInDate?.trim() || null,
    budgetMin: input.budgetMin ?? undefined,
    budgetMax: input.budgetMax ?? undefined,
    stretchBudget: input.stretchBudget ?? undefined,
    groupSize: input.groupSize ?? undefined,
    hasRoommates: input.hasRoommates ?? undefined,
    commuteTarget: input.commuteTarget?.trim() || undefined,
    maxCommuteMinutes: input.maxCommuteMinutes ?? undefined,
    neighborhoods: input.neighborhoods ?? [],
    mustHaves: input.mustHaves ?? [],
    niceToHaves: input.niceToHaves ?? [],
    dealbreakers: input.dealbreakers ?? [],
    priorities: input.priorities ?? [],
    pets: input.pets ?? undefined,
    parking: input.parking ?? undefined,
    petsRequired: input.pets ?? null,
    parkingRequired: input.parking ?? null,
    rentalReadiness: input.rentalReadiness ?? data.profile.rentalReadiness,
  });

  await updateProfile(nextProfile);
  await touchBoard(boardId);
}

export async function confirmBoardProfileForUser(boardId: string, userId: string) {
  const board = await ensureBoard(boardId, userId);
  if (!board) {
    throw new Error("Board not found.");
  }

  const data = await getBoardPageData(boardId, userId);
  if (!data) {
    throw new Error("Profile not found.");
  }

  const nextProfile = finalizeProfileState(data.profile, "confirmed");
  await updateProfile(nextProfile);
  await touchBoard(boardId);
  await trackEvent("profile_completed", {
    boardId,
    userId,
    completionStatus: nextProfile.completionStatus,
  });
}

export async function getRecentBoardsForUser(userId: string, limit = 8): Promise<SearchBoardSummary[]> {
  return (
    await prisma.searchBoard.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: { searchProfile: true },
    })
  ).map((board) => ({
    id: board.id,
    userId: board.userId,
    title: board.title,
    name: board.title,
    city: board.searchProfile ? mapProfileRow({
      ...board.searchProfile,
      id: board.searchProfile.id,
      boardId: board.searchProfile.boardId,
      createdAt: board.searchProfile.createdAt.toISOString(),
      updatedAt: board.searchProfile.updatedAt.toISOString(),
    }).city : undefined,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  }));
}

export async function deleteBoardForUser(boardId: string, userId: string) {
  const board = await prisma.searchBoard.findFirst({
    where: {
      id: boardId,
      userId,
    },
  });

  if (!board) {
    throw new Error("Only the board owner can delete this chat.");
  }

  await prisma.searchBoard.delete({
    where: { id: boardId },
  });
}

export async function ensureBoard(boardId: string, userId: string) {
  const board = await prisma.searchBoard.findFirst({
    where: {
      id: boardId,
      OR: [
        { members: { some: { userId } } },
        { userId },
      ],
    },
  });
  return board
    ? {
        id: board.id,
        userId: board.userId,
        title: board.title,
        createdAt: board.createdAt.toISOString(),
        updatedAt: board.updatedAt.toISOString(),
      }
    : null;
}

function scoreListing(
  profile: SearchProfileData,
  listing: ListingRecord,
  commute: {
    bestDurationMinutes: number | null;
  } | null,
) {
  let score = 0;

  if (profile.locations.length === 0 && profile.city === undefined) score += 10;
  else if (
    [...profile.locations, ...(profile.city ? [profile.city] : [])].some((location) =>
      [listing.city, listing.neighborhood].filter(Boolean).some((part) => part?.toLowerCase() === location.toLowerCase()),
    )
  ) {
    score += 40;
  } else {
    score -= 12;
  }

  if (profile.budgetMax != null && listing.price !== null) {
    if (listing.price <= profile.budgetMax) score += 35;
    else if (listing.price <= profile.budgetMax + 300) score += 12;
    else score -= 20;
  }

  if (profile.bedroomsPreferred != null && listing.bedrooms !== null) {
    if (listing.bedrooms === profile.bedroomsPreferred) score += 20;
    else if (Math.abs(listing.bedrooms - profile.bedroomsPreferred) <= 1) score += 8;
    else score -= 10;
  }

  if (profile.laundryRequired && listing.amenities.includes("laundry")) score += 10;
  if (profile.parkingRequired && listing.amenities.includes("parking")) score += 8;
  if (profile.petsRequired && listing.amenities.includes("pet friendly")) score += 8;
  if (listing.squareFeet) score += Math.min(12, Math.round(listing.squareFeet / 120));
  if (listing.status === "active") score += 6;
  if (listing.status === "unknown") score -= 4;
  if (listing.status === "saved_only") score -= 6;

  if (commute && commute.bestDurationMinutes !== null) {
    const commuteWeight = profile.priorities.includes("commute") ? 1 : 0.55;
    if (commute.bestDurationMinutes <= 20) score += Math.round(18 * commuteWeight);
    else if (commute.bestDurationMinutes <= 35) score += Math.round(12 * commuteWeight);
    else if (commute.bestDurationMinutes <= 50) score += Math.round(6 * commuteWeight);
    else if (commute.bestDurationMinutes >= 70) score -= Math.round(8 * commuteWeight);
  }

  return score;
}

function describeListingFit(
  profile: SearchProfileData,
  listing: ListingRecord,
  score: number,
  commute: {
    bestDurationMinutes: number | null;
    bestDistanceMiles: number | null;
    bestOriginLabel: string | null;
  } | null,
  neighborhoodSignal: {
    tags: string[];
    summary: string;
  } | null,
) {
  const withinBudget = profile.budgetMax != null && listing.price !== null ? listing.price <= profile.budgetMax : null;
  const locationLabel = [listing.neighborhood, listing.city].filter(Boolean).join(", ") || "this area";
  const priceLabel = listing.price ? `$${listing.price.toLocaleString()}` : "price still unclear";
  const priorities = profile.priorities;
  const commuteLine =
    commute && commute.bestDurationMinutes !== null
      ? ` The strongest commute read is about ${commute.bestDurationMinutes} min${commute.bestOriginLabel ? ` to ${commute.bestOriginLabel}` : ""}.`
      : "";
  const neighborhoodLine = neighborhoodSignal ? ` ${neighborhoodSignal.summary}` : "";

  if (score >= 85) {
    return {
      fitLabel: "best practical fit" as const,
      fitReason: `${locationLabel} is landing as one of the cleanest practical matches in the starter catalog.${commuteLine}${neighborhoodLine}`,
      tradeoffSummary: `It lines up well on the basics, especially ${withinBudget ? "budget" : "overall balance"}, and it should be one of the first places your group pressure-tests together.`,
    };
  }

  if (score >= 55) {
    return {
      fitLabel: "worth a look" as const,
      fitReason: `${locationLabel} looks viable enough to keep in the first pass, especially if ${priorities[0] ?? "flexibility"} matters most.${commuteLine}${neighborhoodLine}`,
      tradeoffSummary: `At ${priceLabel}, this is not a slam dunk, but it feels real enough to put in front of roommates instead of dismissing immediately.`,
    };
  }

  if (score >= 30) {
    return {
      fitLabel: "stretch option" as const,
      fitReason: `${locationLabel} starts to look more like a compromise than a clean fit.${commuteLine}${neighborhoodLine}`,
      tradeoffSummary: "This one probably needs a strong reason to survive, like better space or a better building setup than the safer group options.",
    };
  }

  return {
    fitLabel: "risky but interesting" as const,
    fitReason: `${locationLabel} has enough mismatch or uncertainty that I would treat it cautiously.${commuteLine}${neighborhoodLine}`,
    tradeoffSummary: "This feels more like a curiosity card than a core target unless the group loosens up.",
  };
}

function getCommuteAnchors(
  profile: SearchProfileData,
  members: Array<{ displayName: string; workAddress: string | null; secondaryWorkAddress: string | null }>,
  roommates: RoommateRecord[],
) {
  const anchors: Array<{ label: string; query: string }> = [];

  if (profile.commuteTarget) {
    anchors.push({ label: profile.commuteTarget, query: profile.commuteTarget });
  }

  for (const roommate of roommates) {
    if (roommate.commuteDestination) {
      anchors.push({ label: roommate.name, query: roommate.commuteDestination });
    }
  }

  for (const member of members) {
    if (member.workAddress) {
      anchors.push({ label: `${member.displayName} primary`, query: member.workAddress });
    }
    if (member.secondaryWorkAddress) {
      anchors.push({ label: `${member.displayName} secondary`, query: member.secondaryWorkAddress });
    }
  }

  return Array.from(new Map(anchors.map((anchor) => [`${anchor.label}:${anchor.query}`.toLowerCase(), anchor])).values()).slice(0, 3);
}

async function getSuggestedListings(
  profile: SearchProfileData,
  boardListings: BoardListingRecord[],
  members: Array<{ displayName: string; workAddress: string | null; secondaryWorkAddress: string | null }>,
  roommates: RoommateRecord[],
): Promise<SuggestedListingRecord[]> {
  await ensureStarterCatalog();

  if (isDemoModeEnabled()) {
    const scenario = matchDemoScenarioForProfile(profile);
    if (scenario) {
      const existingByListingId = new Map(
        boardListings.map((entry) => [entry.listingId, { id: entry.id, status: entry.userStatus }] as const),
      );
      const scenarioIds = scenario.listingIds;
      const normalizedStarterListings = buildStarterListings();
      const scenarioSeeds = scenarioIds
        .map((id) => normalizedStarterListings.find((seed) => seed.id === id))
        .filter((seed): seed is NonNullable<(typeof normalizedStarterListings)[number]> => Boolean(seed));
      const fallbackScenarioProperties = getDemoPropertiesForScenario(scenario.id);
      const scenarioListings =
        scenarioSeeds.length > 0
          ? scenarioSeeds.map((seed, index) => ({
              seed,
              property: getDemoPropertyById(seed.id ?? `seed-${index}`),
            }))
          : fallbackScenarioProperties.map((property, index) => ({
              seed: normalizedStarterListings.find((entry) => entry.id === property.id) ?? {
                id: property.id,
                source: "api" as const,
                sourceName: property.sourceName?.trim() || "demo_property",
                sourceUrl: property.sourceUrl?.trim() || null,
                city: property.city,
                state: property.state,
                neighborhood: property.neighborhood,
                address: property.address,
                price: property.price,
                bedrooms: property.bedrooms,
                bathrooms: property.bathrooms,
                squareFeet: property.squareFeet,
                propertyType: property.propertyType,
                amenities: property.amenities,
                description: property.description,
                images: property.images,
                status: "active" as const,
              },
              property,
            }));

      return scenarioListings
        .map(({ seed, property }, index) => {
          const listing = starterSeedToListingRecord(seed, index);
          const existing = existingByListingId.get(listing.id) ?? null;

          return {
            listing,
            existingBoardListingId: existing?.id ?? null,
            existingStatus: existing?.status ?? null,
            fitLabel: property?.demoFitLabel ?? "worth a look",
            fitReason:
              property?.demoFitReason ??
              `${listing.neighborhood}, ${listing.city} is one of the curated demo options for this exact search.`,
            tradeoffSummary:
              property?.demoTradeoffSummary ??
              "This is a demo-mode listing, so the board is presenting a staged recommendation instead of a live match.",
            commute: {
              listingId: listing.id,
              bestDurationMinutes: property?.demoCommuteMinutes ?? null,
              bestDistanceMiles: property?.demoCommuteMiles ?? null,
              bestOriginLabel: property?.demoCommuteLabel ?? null,
              evaluatedAnchors: property?.demoCommuteLabel ? [property.demoCommuteLabel] : [],
            },
            neighborhoodSignal: getNeighborhoodSignal(listing.city, listing.neighborhood),
          };
        })
        .filter((entry) => entry.existingStatus === null);
    }
  }

  const listings = isDemoModeEnabled()
    ? buildStarterListings().map(starterSeedToListingRecord)
    : (
        await prisma.listing.findMany({
          where: { NOT: { status: "removed" } },
          orderBy: { updatedAt: "desc" },
          take: 600,
        })
      ).map(mapListingRow);

  const existingByListingId = new Map(
    boardListings.map((entry) => [entry.listingId, { id: entry.id, status: entry.userStatus }] as const),
  );

  const scenarioListingIds = isDemoModeEnabled() ? new Set(getDemoScenarioListingIds(profile)) : null;
  const commuteAnchors = getCommuteAnchors(profile, members, roommates);
  const commuteEstimates = isDemoModeEnabled()
    ? listings.map((listing) => ({
        listingId: listing.id,
        bestDurationMinutes: null,
        bestDistanceMiles: null,
        bestOriginLabel: null,
        evaluatedAnchors: commuteAnchors.map((anchor) => anchor.label),
      }))
    : await estimateCommutes({
        anchors: commuteAnchors,
        listings: listings.map((listing) => ({
          listingId: listing.id,
          address: listing.address,
          city: listing.city,
          neighborhood: listing.neighborhood,
        })),
      });
  const commuteByListingId = new Map(commuteEstimates.map((entry) => [entry.listingId, entry]));

  return listings
    .map((listing) => {
      const commute = commuteByListingId.get(listing.id) ?? null;
      const neighborhoodSignal = getNeighborhoodSignal(listing.city, listing.neighborhood);
      const score = scoreListing(profile, listing, commute);
      const fit = describeListingFit(profile, listing, score, commute, neighborhoodSignal);
      const existing = existingByListingId.get(listing.id) ?? null;

      return {
        listing,
        score,
        existingBoardListingId: existing?.id ?? null,
        existingStatus: existing?.status ?? null,
        fitLabel: fit.fitLabel,
        fitReason: fit.fitReason,
        tradeoffSummary: fit.tradeoffSummary,
        commute,
        neighborhoodSignal,
      };
    })
    .filter((entry) => entry.score > 0 && entry.existingStatus === null)
    .sort((left, right) => {
      if (scenarioListingIds && scenarioListingIds.size > 0) {
        const leftPinned = scenarioListingIds.has(left.listing.id) ? 1 : 0;
        const rightPinned = scenarioListingIds.has(right.listing.id) ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
      }
      return right.score - left.score;
    })
    .slice(0, 48)
    .map(({ score: _score, ...entry }) => entry);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function reorderForRequest(listings: SuggestedListingRecord[], request: ListingBrowseRequest | null) {
  if (!request) return listings;
  const seedBase = `${request.requestIndex}:${request.message.toLowerCase()}`;

  return [...listings].sort((left, right) => {
    const leftSeed = hashString(`${seedBase}:${left.listing.id}`);
    const rightSeed = hashString(`${seedBase}:${right.listing.id}`);
    return rightSeed - leftSeed;
  });
}

function getBrowseRequests(messages: Array<{ role: string; content: string }>) {
  const requests: ListingBrowseRequest[] = [];
  let previousCount = 12;

  for (const [index, message] of messages.filter((entry) => entry.role === "user").entries()) {
    const request = parseListingBrowseRequest(message.content, index + 1, previousCount);
    if (!request) continue;
    requests.push(request);
    previousCount = request.count;
  }

  return requests;
}

function buildDeckListings(listings: SuggestedListingRecord[], requests: ListingBrowseRequest[]) {
  const currentRequest = requests.at(-1) ?? null;
  const ordered = reorderForRequest(listings, currentRequest);
  if (!currentRequest) return ordered.slice(0, 12);

  const batchSize = currentRequest.count;
  let offset = 0;
  let previousCount = 0;

  for (const request of requests) {
    if (request.isMoreRequest && previousCount > 0) offset += previousCount;
    else offset = 0;
    previousCount = request.count;
  }

  return ordered.slice(offset, offset + batchSize);
}

async function ensureOwnerMembership(boardId: string, ownerUserId: string) {
  await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId, userId: ownerUserId } },
    update: {},
    create: {
      boardId,
      userId: ownerUserId,
      role: "owner",
    },
  });

  const owner = await prisma.user.findUnique({ where: { id: ownerUserId } });
  if (!owner) return;

  const existingRoommate = await prisma.roommateProfile.findFirst({
    where: { boardId, linkedUserId: ownerUserId },
  });

  if (!existingRoommate) {
    await prisma.roommateProfile.create({
      data: {
        boardId,
        linkedUserId: ownerUserId,
        name: owner.displayName,
        roleLabel: "board owner",
        budgetMax: null,
        commuteDestination: owner.workAddress,
        commutePriority: "medium",
        neighborhoodPriority: "medium",
        spacePriority: "medium",
        privacyPriority: "medium",
        preferredNeighborhoods: json([]),
        mustHaves: json([]),
        dealbreakers: json([]),
        notes: null,
      },
    });
  }
}

export async function getBoardPageData(boardId: string, viewerUserId: string): Promise<BoardPageData | null> {
  await ensureStarterCatalog();
  const demoMode = isDemoModeEnabled();

  const boardAccess = await ensureBoard(boardId, viewerUserId);
  if (!boardAccess) return null;
  await ensureOwnerMembership(boardId, boardAccess.userId);

  const board = await prisma.searchBoard.findUnique({
    where: { id: boardId },
    include: {
      searchProfile: true,
      roommates: { orderBy: [{ createdAt: "asc" }, { name: "asc" }] },
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        include: { user: true },
      },
      invitations: {
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
      },
      chatMessages: { orderBy: { createdAt: "asc" } },
      boardListings: {
        orderBy: { updatedAt: "desc" },
        include: {
          listing: true,
          votes: { include: { roommate: true }, orderBy: { createdAt: "desc" } },
          comments: { include: { roommate: true }, orderBy: { createdAt: "desc" } },
        },
      },
      boardEvents: { orderBy: { createdAt: "desc" }, take: 18 },
    },
  });

  if (!board || !board.searchProfile) return null;

  const profile = mapProfileRow({
    ...board.searchProfile,
    locations: board.searchProfile.locations,
    bedroomsFlexible: board.searchProfile.bedroomsFlexible,
    mustHaves: board.searchProfile.mustHaves,
    niceToHaves: board.searchProfile.niceToHaves,
    dealbreakers: board.searchProfile.dealbreakers,
    priorities: board.searchProfile.priorities,
    commuteTarget: board.searchProfile.commuteTarget,
    notes: board.searchProfile.notes,
    createdAt: toIso(board.searchProfile.createdAt),
    updatedAt: toIso(board.searchProfile.updatedAt),
  } as Record<string, unknown>);

  const roommates = board.roommates
    .map(mapRoommateRow);

  const members = board.members.map(mapBoardMemberRow);
  const invitations = board.invitations.map(mapInvitationRow);

  const messages = board.chatMessages.map((message) => ({
    id: message.id,
    boardId: message.boardId,
    role: message.role,
    authorUserId: message.authorUserId,
    authorName: message.authorName,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  }));

  const boardListings: BoardListingRecord[] = board.boardListings.map((entry) => ({
    id: entry.id,
    boardId: entry.boardId,
    listingId: entry.listingId,
    userStatus: entry.userStatus as BoardListingRecord["userStatus"],
    userNotes: entry.userNotes,
    aiSummary: entry.aiSummary,
    aiTradeoffAnalysis: entry.aiTradeoffAnalysis,
    aiRedFlags: parseJsonArray(entry.aiRedFlags),
    questionsToAsk: parseJsonArray(entry.questionsToAsk),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    listing: mapListingRow(entry.listing),
  }));

  const voteRows: BoardListingVoteRecord[] = board.boardListings.flatMap((entry) =>
    entry.votes.map((vote) => ({
      id: vote.id,
      boardListingId: vote.boardListingId,
      roommateId: vote.roommateId,
      vote: vote.vote as BoardListingVoteRecord["vote"],
      note: vote.note,
      createdAt: vote.createdAt.toISOString(),
      roommate: {
        id: vote.roommate.id,
        name: vote.roommate.name,
        roleLabel: vote.roommate.roleLabel,
      },
    })),
  );

  const commentRows: BoardListingCommentRecord[] = board.boardListings.flatMap((entry) =>
    entry.comments.map((comment) => ({
      id: comment.id,
      boardListingId: comment.boardListingId,
      roommateId: comment.roommateId,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      roommate: {
        id: comment.roommate.id,
        name: comment.roommate.name,
        roleLabel: comment.roommate.roleLabel,
      },
    })),
  );

  const activity: BoardActivityRecord[] = board.boardEvents.map((event) => ({
    id: event.id,
    boardId: event.boardId,
    actorType: event.actorType as BoardActivityRecord["actorType"],
    actorName: event.actorName,
    eventType: event.eventType,
    content: event.content,
    createdAt: event.createdAt.toISOString(),
  }));

  const suggestedListings = await getSuggestedListings(
    profile,
    boardListings,
    members.map((member) => ({
      displayName: member.user.displayName,
      workAddress: member.user.workAddress,
      secondaryWorkAddress: member.user.secondaryWorkAddress,
    })),
    roommates,
  );
  const commuteAnchors = getCommuteAnchors(
    profile,
    members.map((member) => ({
      displayName: member.user.displayName,
      workAddress: member.user.workAddress,
      secondaryWorkAddress: member.user.secondaryWorkAddress,
    })),
    roommates,
  );
  const savedListingCommutesRaw = isDemoModeEnabled()
    ? boardListings.map((entry) => ({
        listingId: entry.id,
        bestDurationMinutes: null,
        bestDistanceMiles: null,
        bestOriginLabel: null,
        evaluatedAnchors: commuteAnchors.map((anchor) => anchor.label),
      }))
    : await estimateCommutes({
        anchors: commuteAnchors,
        listings: boardListings.map((entry) => ({
          listingId: entry.id,
          address: entry.listing.address,
          city: entry.listing.city,
          neighborhood: entry.listing.neighborhood,
        })),
      });
  const boardListingCommutesByBoardListingId = savedListingCommutesRaw.reduce<Record<string, BoardListingCommuteRecord>>(
    (accumulator, entry) => {
      accumulator[entry.listingId] = {
        boardListingId: entry.listingId,
        bestDurationMinutes: entry.bestDurationMinutes,
        bestDistanceMiles: entry.bestDistanceMiles,
        bestOriginLabel: entry.bestOriginLabel,
        evaluatedAnchors: entry.evaluatedAnchors,
      };
      return accumulator;
    },
    {},
  );
  const browseRequests = getBrowseRequests(messages);
  const currentBrowseRequest = browseRequests.at(-1) ?? null;
  const groupSynthesis = summarizeGroup(roommates, profile);

  return {
    isDemoMode: demoMode,
    board: {
      id: board.id,
      userId: board.userId,
      title: board.title,
      name: board.title,
      city: profile.city,
      createdByProfileId: profile.id,
      members,
      listings: boardListings.map((entry) => entry.listing),
      groupProfile: groupSynthesis,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
    },
    profile,
    roommates,
    members,
    invitations,
    groupSynthesis,
    activity,
    messages,
    boardListings,
    boardListingCommutesByBoardListingId,
    listingVotesByBoardListingId: groupByKey(voteRows, "boardListingId"),
    listingCommentsByBoardListingId: groupByKey(commentRows, "boardListingId"),
    suggestedListings,
    currentDeckListings: buildDeckListings(suggestedListings, browseRequests),
    currentBrowseRequest,
    comparison: demoMode ? getDemoComparisonCopy(profile) ?? generateComparison(profile, boardListings) : generateComparison(profile, boardListings),
    missingFields: getMissingFields(profile),
    completion: getProfileCompletion(profile),
  };
}

export async function createBoardAndReturnId(input: {
  title?: string;
  userId: string;
  authorName: string;
  profileSeed?: Partial<SearchProfileData>;
  initialAssistantMessage?: string;
}) {
  await ensureStarterCatalog();
  const title = input.title?.trim() || "New rental search";
  const blankProfile = createBlankProfile("temp");
  const seededProfile = finalizeProfileState({ ...blankProfile, ...(input.profileSeed ?? {}) });

  const board = await prisma.searchBoard.create({
    data: {
      userId: input.userId,
      title,
      searchProfile: {
        create: {
          intent: seededProfile.intent,
          propertyType: seededProfile.propertyType,
          locations: json(seededProfile.locations),
          budgetMin: seededProfile.budgetMin,
          budgetMax: seededProfile.budgetMax,
          bedroomsPreferred: seededProfile.bedroomsPreferred,
          bedroomsFlexible: json(seededProfile.bedroomsFlexible),
          moveInTimeframe: seededProfile.moveInTimeframe,
          mustHaves: json(seededProfile.mustHaves),
          niceToHaves: json(seededProfile.niceToHaves),
          dealbreakers: json(seededProfile.dealbreakers),
          priorities: json(seededProfile.priorities),
          petsRequired: seededProfile.petsRequired,
          parkingRequired: seededProfile.parkingRequired,
          laundryRequired: seededProfile.laundryRequired,
          commuteTarget: seededProfile.commuteTarget,
          notes: encodeNotesPayload(seededProfile),
        },
      },
      chatMessages: {
        create: {
          role: "assistant",
          authorName: "Advisor",
          content: input.initialAssistantMessage ?? "Tell me what kind of rental you want, and I’ll build the search profile while we talk.",
        },
      },
      boardEvents: {
        create: {
          actorType: "system",
          actorName: "System",
          eventType: "board_created",
          content: `${input.authorName} created this shared board.`,
        },
      },
      members: {
        create: {
          userId: input.userId,
          role: "owner",
        },
      },
      roommates: {
        create: {
          linkedUserId: input.userId,
          name: input.authorName,
          roleLabel: "board owner",
          budgetMax: null,
          commuteDestination: null,
          commutePriority: "medium",
          neighborhoodPriority: "medium",
          spacePriority: "medium",
          privacyPriority: "medium",
          preferredNeighborhoods: json([]),
          mustHaves: json([]),
          dealbreakers: json([]),
          notes: null,
        },
      },
    },
  });

  await trackEvent("board_created", {
    boardId: board.id,
    userId: input.userId,
    title: board.title,
  });

  return board.id;
}

async function addBoardEvent(boardId: string, actorType: BoardActivityRecord["actorType"], actorName: string, eventType: string, content: string) {
  await prisma.boardEvent.create({
    data: { boardId, actorType, actorName, eventType, content },
  });
}

async function touchBoard(boardId: string) {
  await prisma.searchBoard.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
}

async function updateProfile(nextProfile: SearchProfileData) {
  await prisma.searchProfile.update({
    where: { id: nextProfile.id },
    data: {
      intent: nextProfile.intent,
      propertyType: nextProfile.propertyType,
      locations: json(nextProfile.locations),
      budgetMin: nextProfile.budgetMin,
      budgetMax: nextProfile.budgetMax,
      bedroomsPreferred: nextProfile.bedroomsPreferred,
      bedroomsFlexible: json(nextProfile.bedroomsFlexible),
      moveInTimeframe: nextProfile.moveInTimeframe,
      mustHaves: json(nextProfile.mustHaves),
      niceToHaves: json(nextProfile.niceToHaves),
      dealbreakers: json(nextProfile.dealbreakers),
      priorities: json(nextProfile.priorities),
      petsRequired: nextProfile.petsRequired,
      parkingRequired: nextProfile.parkingRequired,
      laundryRequired: nextProfile.laundryRequired,
      commuteTarget: nextProfile.commuteTarget,
      notes: encodeNotesPayload(nextProfile),
    },
  });
}

export async function sendChat(boardId: string, content: string, author: { userId: string; authorName: string }) {
  const boardData = await getBoardPageData(boardId, author.userId);
  if (!boardData) return;
  const previousStatus = boardData.profile.completionStatus;

  await prisma.chatMessage.create({
    data: {
      boardId,
      role: "user",
      authorUserId: author.userId,
      authorName: author.authorName,
      content,
    },
  });

  const conversationHint = getConversationHint(boardData.messages);
  const recentMessages = [
    ...boardData.messages.slice(-8),
    { role: "user", content, authorName: author.authorName },
  ];

  let nextProfile = boardData.profile;
  let assistant = "";

  if (isDemoModeEnabled()) {
    const demoTurn = runDemoChatTurn({
      previousProfile: boardData.profile,
      message: content,
      messages: boardData.messages,
      listingsCount: boardData.boardListings.filter((item) => item.userStatus !== "rejected").length,
    });
    nextProfile = finalizeProfileState(demoTurn.nextProfile);
    assistant = demoTurn.reply;
  } else {
    const ruleProfile = applyMessageToProfile(boardData.profile, content, conversationHint);
    const aiExtraction = await extractSearchProfileUpdatesWithAI({
      profile: boardData.profile,
      message: content,
      recentMessages,
      conversationHint,
    });

    nextProfile =
      aiExtraction?.updates && Object.keys(aiExtraction.updates).length > 0
        ? mergeProfileUpdates(ruleProfile, aiExtraction.updates)
        : ruleProfile;
    nextProfile = finalizeProfileState(nextProfile);

    const suggestedCount = (
      await getSuggestedListings(
        nextProfile,
        boardData.boardListings,
        boardData.members.map((member) => ({
          displayName: member.user.displayName,
          workAddress: member.user.workAddress,
          secondaryWorkAddress: member.user.secondaryWorkAddress,
        })),
        boardData.roommates,
      )
    ).length;
    const fallbackAssistant = generateAssistantReply(
      boardData.profile,
      nextProfile,
      content,
      Math.max(boardData.boardListings.filter((item) => item.userStatus !== "rejected").length, suggestedCount),
      conversationHint,
    );
    assistant = await generateConversationalReplyWithAI({
      previousProfile: boardData.profile,
      nextProfile,
      message: content,
      recentMessages,
      missingFields: getMissingFields(nextProfile),
      listingsCount: Math.max(boardData.boardListings.filter((item) => item.userStatus !== "rejected").length, suggestedCount),
      fallbackReply: fallbackAssistant,
    });
  }

  await updateProfile(nextProfile);
  if (previousStatus !== "complete" && nextProfile.completionStatus === "complete") {
    await trackEvent("profile_completed", {
      boardId,
      userId: author.userId,
      completionStatus: nextProfile.completionStatus,
    });
  }

  await prisma.chatMessage.create({
    data: {
      boardId,
      role: "assistant",
      authorName: "Advisor",
      content: assistant,
    },
  });

  await addBoardEvent(boardId, "roommate", author.authorName, "chat_message", `${author.authorName} said: ${content}`);
  await prisma.searchBoard.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
}

function extractListingFromText(text: string) {
  const normalized = text.replace(/,/g, "");
  const price = normalized.match(/\$?(\d+(?:\.\d+)?k?)/i);
  const bedroom = normalized.match(/(\d(?:\.\d)?)\s*(?:bed|bedroom|br)/i);
  const bathroom = normalized.match(/(\d(?:\.\d)?)\s*(?:bath|bathroom|ba)/i);
  const squareFeet = normalized.match(/(\d{3,5})\s*(?:sq ?ft|square feet)/i);
  const cityMatch = ["Jersey City", "Hoboken", "Brooklyn", "Queens", "New York", "Los Angeles", "Phoenix", "San Diego"].find((city) =>
    text.toLowerCase().includes(city.toLowerCase()),
  );
  const neighborhood = [
    "Downtown",
    "Journal Square",
    "Newport",
    "Williamsburg",
    "Astoria",
    "Harlem",
    "Midtown",
    "Silver Lake",
    "Echo Park",
    "North Park",
  ].find((entry) => text.toLowerCase().includes(entry.toLowerCase()));

  return {
    price: price ? Number(price[1].replace(/k/i, "000")) : null,
    bedrooms: bedroom ? Number(bedroom[1]) : null,
    bathrooms: bathroom ? Number(bathroom[1]) : null,
    squareFeet: squareFeet ? Number(squareFeet[1]) : null,
    city: cityMatch ?? null,
    neighborhood: neighborhood ?? null,
  };
}

export async function addListingToBoard(
  boardId: string,
  input: {
    method: "pasted_link" | "pasted_text" | "manual";
    sourceUrl?: string;
    pastedText?: string;
    address?: string;
    city?: string;
    neighborhood?: string;
    price?: string;
    bedrooms?: string;
    bathrooms?: string;
    squareFeet?: string;
    description?: string;
  },
) {
  const extracted = input.pastedText ? extractListingFromText(input.pastedText) : null;
  const normalizedSourceUrl = normalizeLooseText(input.sourceUrl);
  const normalizedAddress = normalizeLooseText(input.address);
  const normalizedCity = normalizeLooseText(input.city || extracted?.city);
  const normalizedNeighborhood = normalizeLooseText(input.neighborhood || extracted?.neighborhood);
  const parsedPrice = input.price ? Number(input.price) : extracted?.price ?? null;
  const parsedBedrooms = input.bedrooms ? Number(input.bedrooms) : extracted?.bedrooms ?? null;

  const existingBoardListings = await prisma.boardListing.findMany({
    where: { boardId },
    include: { listing: true },
  });

  const duplicateBoardListing = existingBoardListings.find((entry) => {
    const listing = entry.listing;
    if (normalizedSourceUrl && normalizedSourceUrl === normalizeLooseText(listing.sourceUrl)) return true;
    if (!normalizedSourceUrl && normalizedAddress && normalizedAddress === normalizeLooseText(listing.address)) {
      const samePrice = parsedPrice === null || listing.price === null || parsedPrice === listing.price;
      const sameBedrooms = parsedBedrooms === null || listing.bedrooms === null || parsedBedrooms === listing.bedrooms;
      const sameCity = !normalizedCity || normalizedCity === normalizeLooseText(listing.city);
      const sameNeighborhood = !normalizedNeighborhood || normalizedNeighborhood === normalizeLooseText(listing.neighborhood);
      return samePrice && sameBedrooms && (sameCity || sameNeighborhood);
    }
    return false;
  });

  if (duplicateBoardListing) {
    await prisma.boardListing.update({
      where: { id: duplicateBoardListing.id },
      data: { userStatus: duplicateBoardListing.userStatus === "rejected" ? "maybe" : duplicateBoardListing.userStatus },
    });
    await addBoardEvent(
      boardId,
      "system",
      "System",
      "listing_deduped",
      `A duplicate listing was folded back into the board instead of creating a second copy: ${formatListingLabel(duplicateBoardListing.listing)}.`,
    );
    await touchBoard(boardId);
    return;
  }

  const listing = await prisma.listing.create({
    data: {
      source: input.method,
      sourceUrl: input.sourceUrl?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || extracted?.city || null,
      neighborhood: input.neighborhood?.trim() || extracted?.neighborhood || null,
      price: parsedPrice,
      bedrooms: parsedBedrooms,
      bathrooms: input.bathrooms ? Number(input.bathrooms) : extracted?.bathrooms ?? null,
      squareFeet: input.squareFeet ? Number(input.squareFeet) : extracted?.squareFeet ?? null,
      description: input.description?.trim() || input.pastedText?.trim() || null,
      amenities: json([]),
      fees: json({ brokerFee: null, applicationFee: null, deposit: null, utilitiesIncluded: null }),
      images: json([]),
      propertyType: null,
      state: null,
      zip: null,
      sourceName: input.method === "pasted_link" ? "pasted link" : input.method === "pasted_text" ? "pasted text" : "manual entry",
      status: input.method === "pasted_link" ? "saved_only" : "unknown",
    },
  });

  const analysis = {
    aiSummary: listing.description ? "Listing added to the board for review." : "Listing saved with partial details.",
    aiTradeoffAnalysis: "This was added manually, so the key thing is to confirm the missing details before anyone overcommits to it.",
    aiRedFlags: json(["Source details may still be incomplete"]),
    questionsToAsk: json(["Can you confirm the current availability and full monthly cost?"]),
  };

  await prisma.boardListing.create({
    data: {
      boardId,
      listingId: listing.id,
      userStatus: "new",
      ...analysis,
    },
  });

  await addBoardEvent(
    boardId,
    "system",
    "System",
    "listing_added",
    `${
      input.method === "pasted_link"
        ? "A link was saved"
        : input.method === "pasted_text"
          ? "A pasted listing was added"
          : "A manual listing was created"
    }: ${formatListingLabel(listing)}.`,
  );
  await touchBoard(boardId);
}

export async function createBoardInvitation(boardId: string, invitedByUserId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Invite email is required.");

  const board = await ensureBoard(boardId, invitedByUserId);
  if (!board) throw new Error("Board not found.");

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    const existingMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: existingUser.id } },
    });
    if (existingMember) {
      throw new Error("That person is already on this board.");
    }
  }

  const existingInvite = await prisma.boardInvitation.findFirst({
    where: { boardId, email: normalizedEmail, status: "pending" },
  });

  if (existingInvite) return mapInvitationRow(existingInvite);

  const invitation = await prisma.boardInvitation.create({
    data: {
      boardId,
      invitedByUserId,
      email: normalizedEmail,
      inviteCode: createInviteCode(),
      expiresAt: null,
    },
  });

  await addBoardEvent(boardId, "system", "System", "invitation_created", `Invitation created for ${normalizedEmail}.`);
  await touchBoard(boardId);
  return mapInvitationRow(invitation);
}

export async function getInvitationByCode(inviteCode: string) {
  const invitation = await prisma.boardInvitation.findUnique({
    where: { inviteCode },
    include: {
      board: true,
      invitedByUser: true,
    },
  });

  if (!invitation) return null;

  return {
    invitation: mapInvitationRow(invitation),
    board: {
      id: invitation.board.id,
      userId: invitation.board.userId,
      title: invitation.board.title,
      createdAt: invitation.board.createdAt.toISOString(),
      updatedAt: invitation.board.updatedAt.toISOString(),
    },
    invitedBy: mapUserRow(invitation.invitedByUser),
  };
}

export async function acceptBoardInvitation(inviteCode: string, userId: string) {
  const invitation = await prisma.boardInvitation.findUnique({ where: { inviteCode } });
  if (!invitation || invitation.status !== "pending") {
    throw new Error("This invite is no longer available.");
  }
  if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) {
    throw new Error("This invite has expired.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found.");
  if (!user.email) throw new Error("Your account is missing an email address.");

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new Error(`This invite is for ${invitation.email}, but you are signed in as ${user.email}.`);
  }

  await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: invitation.boardId, userId } },
    update: { joinedAt: new Date() },
    create: {
      boardId: invitation.boardId,
      userId,
      role: "member",
    },
  });

  const existingRoommate = await prisma.roommateProfile.findFirst({
    where: { boardId: invitation.boardId, linkedUserId: userId },
  });

  if (!existingRoommate) {
    await prisma.roommateProfile.create({
      data: {
        boardId: invitation.boardId,
        linkedUserId: userId,
        name: user.displayName,
        roleLabel: "roommate",
        budgetMax: null,
        commuteDestination: user.workAddress,
        commutePriority: "medium",
        neighborhoodPriority: "medium",
        spacePriority: "medium",
        privacyPriority: "medium",
        preferredNeighborhoods: json([]),
        mustHaves: json([]),
        dealbreakers: json([]),
        notes: null,
      },
    });
  }

  await prisma.boardInvitation.update({
    where: { id: invitation.id },
    data: { status: "accepted", acceptedAt: new Date() },
  });

  await addBoardEvent(invitation.boardId, "system", "System", "invitation_accepted", `${user.displayName} joined the board.`);
  await touchBoard(invitation.boardId);

  return invitation.boardId;
}

export async function addRoommateToBoard(
  boardId: string,
  input: { name: string; roleLabel?: string; budgetMax?: string; commuteDestination?: string },
) {
  await prisma.roommateProfile.create({
    data: {
      boardId,
      name: input.name.trim() || "New roommate",
      roleLabel: input.roleLabel?.trim() || "roommate",
      budgetMax: input.budgetMax ? Number(input.budgetMax) : null,
      commuteDestination: input.commuteDestination?.trim() || null,
      commutePriority: "medium",
      neighborhoodPriority: "medium",
      spacePriority: "medium",
      privacyPriority: "medium",
      preferredNeighborhoods: json([]),
      mustHaves: json([]),
      dealbreakers: json([]),
      notes: null,
    },
  });
}

export async function updateRoommateProfile(
  roommateId: string,
  input: {
    budgetMax?: string;
    commuteDestination?: string;
    commutePriority?: string;
    neighborhoodPriority?: string;
    spacePriority?: string;
    privacyPriority?: string;
    preferredNeighborhoods?: string;
    mustHaves?: string;
    dealbreakers?: string;
    notes?: string;
  },
) {
  await prisma.roommateProfile.update({
    where: { id: roommateId },
    data: {
      budgetMax: input.budgetMax ? Number(input.budgetMax) : null,
      commuteDestination: input.commuteDestination?.trim() || null,
      commutePriority: (input.commutePriority as RoommateRecord["commutePriority"]) || "medium",
      neighborhoodPriority: (input.neighborhoodPriority as RoommateRecord["neighborhoodPriority"]) || "medium",
      spacePriority: (input.spacePriority as RoommateRecord["spacePriority"]) || "medium",
      privacyPriority: (input.privacyPriority as RoommateRecord["privacyPriority"]) || "medium",
      preferredNeighborhoods: json(
        input.preferredNeighborhoods
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean) ?? [],
      ),
      mustHaves: json(input.mustHaves?.split(",").map((value) => value.trim()).filter(Boolean) ?? []),
      dealbreakers: json(input.dealbreakers?.split(",").map((value) => value.trim()).filter(Boolean) ?? []),
      notes: input.notes?.trim() || null,
    },
  });
}

export async function updateBoardListingStatus(boardListingId: string, status: BoardListingRecord["userStatus"]) {
  const boardListing = await prisma.boardListing.update({
    where: { id: boardListingId },
    data: { userStatus: status },
    include: { listing: true },
  });
  await addBoardEvent(
    boardListing.boardId,
    "system",
    "System",
    "listing_status_updated",
    `${formatListingLabel(boardListing.listing)} is now marked ${status}.`,
  );
  await touchBoard(boardListing.boardId);
}

export async function saveSuggestedListingToBoard(
  boardId: string,
  listingId: string,
  status: BoardListingRecord["userStatus"],
  actorUserId: string,
) {
  const board = await prisma.boardListing.findFirst({ where: { boardId, listingId } });
  if (board) {
    await prisma.boardListing.update({ where: { id: board.id }, data: { userStatus: status } });
    const existingListing = await prisma.listing.findUnique({ where: { id: listingId } });
    await addBoardEvent(
      boardId,
      "system",
      "System",
      "listing_resurfaced",
      `${formatListingLabel(existingListing ?? {})} was updated to ${status} from the match deck.`,
    );
    await touchBoard(boardId);
    return;
  }

  const boardData = await getBoardPageData(boardId, actorUserId);
  if (!boardData) return;

  const listing = boardData.suggestedListings.find((entry) => entry.listing.id === listingId);
  const analysis = listing
    ? {
        aiSummary: listing.fitReason,
        aiTradeoffAnalysis: listing.tradeoffSummary,
        aiRedFlags: json(["Needs normal listing verification before commitment."]),
        questionsToAsk: json(["Can you confirm the total move-in cost and exact availability date?"]),
      }
    : {
        aiSummary: "Saved from the match deck.",
        aiTradeoffAnalysis: "Keep this on the board long enough to compare it against the cleaner practical options.",
        aiRedFlags: json([]),
        questionsToAsk: json([]),
      };

  await prisma.boardListing.create({
    data: {
      boardId,
      listingId,
      userStatus: status,
      ...analysis,
    },
  });
  const listingRow = await prisma.listing.findUnique({ where: { id: listingId } });
  await addBoardEvent(
    boardId,
    "system",
    "System",
    "listing_saved_from_deck",
    `${formatListingLabel(listingRow ?? {})} was saved from the match deck as ${status}.`,
  );
  await touchBoard(boardId);
}

export async function saveBoardListingVote(
  boardListingId: string,
  roommateId: string,
  vote: BoardListingVoteRecord["vote"],
  note?: string,
) {
  const voteRecord = await prisma.boardListingVote.upsert({
    where: { boardListingId_roommateId: { boardListingId, roommateId } },
    create: { boardListingId, roommateId, vote, note: note?.trim() || null },
    update: { vote, note: note?.trim() || null },
  });
  const boardListing = await prisma.boardListing.findUnique({
    where: { id: boardListingId },
    include: { listing: true },
  });
  const roommate = await prisma.roommateProfile.findUnique({ where: { id: roommateId } });
  if (boardListing && roommate) {
    await addBoardEvent(
      boardListing.boardId,
      "roommate",
      roommate.name,
      "listing_vote_saved",
      `${roommate.name} marked ${formatListingLabel(boardListing.listing)} as ${voteRecord.vote}.`,
    );
    await touchBoard(boardListing.boardId);
  }
}

export async function addBoardListingComment(boardListingId: string, roommateId: string, content: string) {
  const trimmedContent = content.trim();
  await prisma.boardListingComment.create({
    data: { boardListingId, roommateId, content: content.trim() },
  });
  const boardListing = await prisma.boardListing.findUnique({
    where: { id: boardListingId },
    include: { listing: true },
  });
  const roommate = await prisma.roommateProfile.findUnique({ where: { id: roommateId } });
  if (boardListing && roommate) {
    await addBoardEvent(
      boardListing.boardId,
      "roommate",
      roommate.name,
      "listing_comment_added",
      `${roommate.name} left a note on ${formatListingLabel(boardListing.listing)}: ${trimmedContent}`,
    );
    await touchBoard(boardListing.boardId);
  }
}
