import { randomBytes, randomUUID } from "node:crypto";

import type {
  BoardActivityRecord,
  BoardListingCommuteRecord,
  BoardListingCommentRecord,
  BoardListingDecisionRecord,
  BoardListingRatingRecord,
  BoardListingRecord,
  BoardListingReviewRecord,
  BoardListingSourceRecord,
  BoardListingVerificationRecord,
  BoardInvitationRecord,
  BoardMemberRecord,
  BoardListingVoteRecord,
  BoardPageData,
  GroupSynthesis,
  ListingBrowseRequest,
  ListingModelInsight,
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
  mergeProfileUpdatesWithGuards,
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
import { estimateCommutes, getCommuteServiceMode } from "@/lib/commute-service";
import { getNeighborhoodSignal } from "@/lib/neighborhood-signals";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/analytics";
import { buildStarterListings } from "@/lib/starter-listings";
import { getDemoPropertyById, getDemoPropertiesForScenario } from "@/lib/demo-properties";
import { matchDemoScenarioForProfile } from "@/lib/demo-scenarios";
import { summarizeMemberAffordability } from "@/lib/group-affordability";
import { analyzeListingForGroup } from "@/lib/listing-analysis";
import { detectListingProvider, previewListingImport } from "@/lib/listing-sources";
import { submitBoardListingSource } from "@/lib/catalog-listing-sources";
import {
  listingSourceTrustWarning,
  sourceIsGloballyDiscoverable,
} from "@/lib/listing-source-policy";

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

function sameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function summarizeProfileChanges(previous: SearchProfileData, next: SearchProfileData) {
  const changed: string[] = [];

  if (previous.city !== next.city || previous.locations.join("|") !== next.locations.join("|")) changed.push("city");
  if (previous.moveInDate !== next.moveInDate || previous.moveInTimeframe !== next.moveInTimeframe) changed.push("move-in timing");
  if (previous.budgetMin !== next.budgetMin || previous.budgetMax !== next.budgetMax || previous.stretchBudget !== next.stretchBudget) changed.push("budget");
  if (previous.groupSize !== next.groupSize || previous.hasRoommates !== next.hasRoommates) changed.push("group setup");
  if (
    previous.commuteTarget !== next.commuteTarget
    || previous.commuteAccess !== next.commuteAccess
    || previous.minCommuteMinutes !== next.minCommuteMinutes
    || previous.maxCommuteMinutes !== next.maxCommuteMinutes
  ) changed.push("commute");
  if (!sameStringArray(previous.neighborhoods, next.neighborhoods)) changed.push("neighborhoods");
  if (!sameStringArray(previous.mustHaves, next.mustHaves)) changed.push("must-haves");
  if (!sameStringArray(previous.niceToHaves, next.niceToHaves)) changed.push("nice-to-haves");
  if (!sameStringArray(previous.dealbreakers, next.dealbreakers)) changed.push("dealbreakers");
  if (!sameStringArray(previous.priorities, next.priorities)) changed.push("priorities");
  if (previous.pets !== next.pets) changed.push("pets");
  if (previous.parking !== next.parking) changed.push("parking");

  return changed;
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
    unit: null,
    city: seed.city,
    state: seed.state,
    zip: null,
    neighborhood: seed.neighborhood,
    latitude: null,
    longitude: null,
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
    providerData: {},
    providerStatus: null,
    providerListedAt: null,
    providerLastSeenAt: null,
    providerFetchedAt: null,
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
  const affordability = summarizeMemberAffordability(roommates);
  const groupBudgetMax = affordability.groupBudgetMax;
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

  const budgetFloor = affordability.groupBudgetMin;
  const budgetCeiling = affordability.groupBudgetMax;
  const budgetSpread = budgets.length >= 2 ? Math.max(...budgets) - Math.min(...budgets) : 0;
  const budgetOverlapStatus: GroupSynthesis["budgetOverlapStatus"] =
    budgets.length <= 1 ? "strong" : budgetSpread <= 300 ? "strong" : budgetSpread <= 800 ? "mixed" : "weak";
  const commuteAlignment: GroupSynthesis["commuteAlignment"] =
    commuteDestinations.length <= 1 ? "aligned" : commuteDestinations.length === 2 ? "mixed" : "split";
  const neighborhoodAlignment: GroupSynthesis["neighborhoodAlignment"] =
    compromiseAreas.length >= 2 ? "aligned" : preferredNeighborhoods.length <= 1 ? "aligned" : compromiseAreas.length === 1 ? "mixed" : "split";
  const budgetRangeText =
    budgetFloor !== null && budgetCeiling !== null
      ? `$${budgetFloor.toLocaleString()}–$${budgetCeiling.toLocaleString()} combined`
      : groupBudgetMax !== null
        ? `Up to $${groupBudgetMax.toLocaleString()} combined`
        : "Waiting for member budgets";
  const confidencePenalty =
    (budgetOverlapStatus === "weak" ? 2 : budgetOverlapStatus === "mixed" ? 1 : 0) +
    (commuteAlignment === "split" ? 2 : commuteAlignment === "mixed" ? 1 : 0) +
    (neighborhoodAlignment === "split" ? 1 : 0) +
    (roommates.length === 0 ? 2 : 0);
  const confidenceLabel: GroupSynthesis["confidenceLabel"] =
    confidencePenalty <= 1 ? "high" : confidencePenalty <= 3 ? "medium" : "low";
  const confidenceReason =
    confidenceLabel === "high"
      ? "The board has enough aligned member signal that comparisons should be pretty trustworthy."
      : confidenceLabel === "medium"
        ? "The board has usable group signal, but a few tradeoffs could still swing the shortlist."
        : "The board is still provisional because budget, commute, or neighborhood preferences are not aligned enough yet.";

  const summary =
    roommates.length === 0
      ? "This board is still basically single-player right now. Add roommates so the group tradeoff view starts becoming real."
      : `This board is balancing ${priorityTallies.join(", ")} across ${roommates.length} roommates. ${compromiseLine} ${
          tensionFlags[0] ?? confidenceReason
        }`;

  return {
    groupBudgetMin: affordability.groupBudgetMin,
    groupBudgetMax,
    groupStretchBudget: affordability.groupStretchBudget,
    budgetMemberCount: affordability.budgetMemberCount,
    missingBudgetMemberNames: affordability.missingBudgetMemberNames,
    budgetRangeText,
    budgetOverlapStatus,
    commuteDestinations,
    commuteAlignment,
    preferredNeighborhoods,
    neighborhoodAlignment,
    mustHaves,
    dealbreakers,
    topSharedPriorities: priorityTallies,
    compromiseAreas,
    tensionFlags,
    confidenceLabel,
    confidenceReason,
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
    emailConfirmedAt: null,
    lastSignInAt: null,
    authProviders: [],
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
  email: string | null;
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

function invitationIsExpired(row: { status: string; expiresAt: Date | null }) {
  return row.status === "pending" && Boolean(row.expiresAt && row.expiresAt.getTime() < Date.now());
}

function mapListingRow(row: {
  id: string;
  source: string;
  sourceName: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  address: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
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
  providerData: unknown;
  providerStatus: string | null;
  providerListedAt: Date | null;
  providerLastSeenAt: Date | null;
  providerFetchedAt: Date | null;
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
    availableDate: row.availableDate ? row.availableDate.toISOString() : null,
    propertyType: row.propertyType,
    amenities: parseJsonArray(row.amenities),
    fees: parseJsonObject(row.fees),
    description: row.description,
    images: parseJsonArray(row.images),
    providerData:
      row.providerData && typeof row.providerData === "object" && !Array.isArray(row.providerData)
        ? row.providerData as Record<string, unknown>
        : {},
    providerStatus: row.providerStatus,
    providerListedAt: row.providerListedAt?.toISOString() ?? null,
    providerLastSeenAt: row.providerLastSeenAt?.toISOString() ?? null,
    providerFetchedAt: row.providerFetchedAt?.toISOString() ?? null,
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
  budgetMin: number | null;
  idealBudget: number | null;
  budgetMax: number | null;
  stretchBudget: number | null;
  commuteDestination: string | null;
  commuteAccess: string | null;
  preferredCommuteMinutes: number | null;
  maxCommuteMinutes: number | null;
  commutePriority: string;
  neighborhoodPriority: string;
  spacePriority: string;
  privacyPriority: string;
  preferredNeighborhoods: string | null;
  mustHaves: string | null;
  dealbreakers: string | null;
  petsRequired: boolean | null;
  accessibilityNeeds: string | null;
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
    commutePriority: row.commutePriority as RoommateRecord["commutePriority"],
    neighborhoodPriority: row.neighborhoodPriority as RoommateRecord["neighborhoodPriority"],
    spacePriority: row.spacePriority as RoommateRecord["spacePriority"],
    privacyPriority: row.privacyPriority as RoommateRecord["privacyPriority"],
    preferredNeighborhoods: parseJsonArray(row.preferredNeighborhoods),
    mustHaves: parseJsonArray(row.mustHaves),
    dealbreakers: parseJsonArray(row.dealbreakers),
    petsRequired: row.petsRequired,
    accessibilityNeeds: parseJsonArray(row.accessibilityNeeds),
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

export async function updateBoardMetadataForUser(
  boardId: string,
  userId: string,
  input: {
    title?: string;
  },
) {
  const board = await prisma.searchBoard.findFirst({
    where: {
      id: boardId,
      userId,
    },
  });

  if (!board) {
    throw new Error("Only the workspace owner can update workspace details.");
  }

  const nextTitle = input.title?.trim() || board.title;
  if (nextTitle !== board.title) {
    await prisma.searchBoard.update({
      where: { id: boardId },
      data: { title: nextTitle },
    });

    await addBoardEvent(
      boardId,
      "system",
      "System",
      "board_renamed",
      `The workspace was renamed from "${board.title}" to "${nextTitle}".`,
    );
  }

  await touchBoard(boardId);
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
    commuteAccess?: SearchProfileData["commuteAccess"];
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
    throw new Error("Workspace not found.");
  }

  const data = await getBoardPageData(boardId, userId, { includeSuggestedListings: true });
  if (!data) {
    throw new Error("Shared brief not found.");
  }
  const previousProfile = data.profile;

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
    commuteAccess: input.commuteAccess ?? data.profile.commuteAccess,
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
  const changedFields = summarizeProfileChanges(previousProfile, nextProfile);
  if (changedFields.length > 0) {
    await addBoardEvent(
      boardId,
      "system",
      "System",
      "profile_updated",
      `The shared brief was updated manually${changedFields.length > 0 ? ` across ${changedFields.slice(0, 4).join(", ")}` : ""}.`,
    );
  }
  await touchBoard(boardId);
}

export async function completeJoinedMemberSetup(
  boardId: string,
  userId: string,
  input: {
    workAddress?: string;
    budgetMin?: string;
    idealBudget?: string;
    budgetMax?: string;
    stretchBudget?: string;
    commuteDestination?: string;
    preferredCommuteMinutes?: string;
    maxCommuteMinutes?: string;
    preferredNeighborhoods?: string;
    mustHaves?: string;
    dealbreakers?: string;
    petsRequired?: string;
    accessibilityNeeds?: string;
    notes?: string;
  },
) {
  const board = await ensureBoard(boardId, userId);
  if (!board) {
    throw new Error("Workspace not found.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("Account not found.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      workAddress: input.workAddress?.trim() || null,
    },
  });

  const roommate = await prisma.roommateProfile.findFirst({
    where: { boardId, linkedUserId: userId },
  });

  if (!roommate) {
    throw new Error("Member profile not found.");
  }

  await updateRoommateProfile(roommate.id, {
    budgetMin: input.budgetMin,
    idealBudget: input.idealBudget,
    budgetMax: input.budgetMax,
    stretchBudget: input.stretchBudget,
    commuteDestination: input.commuteDestination || input.workAddress,
    preferredCommuteMinutes: input.preferredCommuteMinutes,
    maxCommuteMinutes: input.maxCommuteMinutes,
    preferredNeighborhoods: input.preferredNeighborhoods,
    mustHaves: input.mustHaves,
    dealbreakers: input.dealbreakers,
    petsRequired: input.petsRequired,
    accessibilityNeeds: input.accessibilityNeeds,
    notes: input.notes,
    commutePriority: roommate.commutePriority,
    neighborhoodPriority: roommate.neighborhoodPriority,
    spacePriority: roommate.spacePriority,
    privacyPriority: roommate.privacyPriority,
  });

  await addBoardEvent(
    boardId,
    "system",
    "System",
    "member_setup_completed",
    `${user.displayName} added their member setup details.`,
  );
  await touchBoard(boardId);
}

export async function updateLinkedMemberProfile(
  boardId: string,
  userId: string,
  input: {
    workAddress?: string;
    budgetMin?: string;
    idealBudget?: string;
    budgetMax?: string;
    stretchBudget?: string;
    commuteDestination?: string;
    preferredCommuteMinutes?: string;
    maxCommuteMinutes?: string;
    preferredNeighborhoods?: string;
    mustHaves?: string;
    dealbreakers?: string;
    petsRequired?: string;
    accessibilityNeeds?: string;
    notes?: string;
    commutePriority?: string;
    neighborhoodPriority?: string;
    spacePriority?: string;
    privacyPriority?: string;
  },
) {
  const board = await ensureBoard(boardId, userId);
  if (!board) {
    throw new Error("Workspace not found.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("Account not found.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      workAddress: input.workAddress?.trim() || null,
    },
  });

  const roommate = await prisma.roommateProfile.findFirst({
    where: { boardId, linkedUserId: userId },
  });

  if (!roommate) {
    throw new Error("Member profile not found.");
  }

  await updateRoommateProfile(roommate.id, {
    budgetMin: input.budgetMin,
    idealBudget: input.idealBudget,
    budgetMax: input.budgetMax,
    stretchBudget: input.stretchBudget,
    commuteDestination: input.commuteDestination || input.workAddress,
    preferredCommuteMinutes: input.preferredCommuteMinutes,
    maxCommuteMinutes: input.maxCommuteMinutes,
    preferredNeighborhoods: input.preferredNeighborhoods,
    mustHaves: input.mustHaves,
    dealbreakers: input.dealbreakers,
    petsRequired: input.petsRequired,
    accessibilityNeeds: input.accessibilityNeeds,
    notes: input.notes,
    commutePriority: input.commutePriority || roommate.commutePriority,
    neighborhoodPriority: input.neighborhoodPriority || roommate.neighborhoodPriority,
    spacePriority: input.spacePriority || roommate.spacePriority,
    privacyPriority: input.privacyPriority || roommate.privacyPriority,
  });

  await addBoardEvent(
    boardId,
    "roommate",
    user.displayName,
    "member_preferences_updated",
    `${user.displayName} updated their collaborator preferences and commute tradeoffs.`,
  );
  await touchBoard(boardId);
}

export async function confirmBoardProfileForUser(boardId: string, userId: string) {
  const board = await ensureBoard(boardId, userId);
  if (!board) {
    throw new Error("Workspace not found.");
  }

  const data = await getBoardPageData(boardId, userId, { includeSuggestedListings: true });
  if (!data) {
    throw new Error("Shared brief not found.");
  }

  const nextProfile = finalizeProfileState(data.profile, "confirmed");
  await updateProfile(nextProfile);
  await addBoardEvent(
    boardId,
    "system",
    "System",
    "profile_confirmed",
    "The shared brief was confirmed and is ready to drive shared matching.",
  );
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
    throw new Error("Only the workspace owner can delete this workspace.");
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

function getCommuteAnchors(roommates: RoommateRecord[]) {
  const anchors: Array<{ label: string; query: string }> = [];

  for (const roommate of roommates) {
    if (roommate.commuteDestination) {
      anchors.push({ label: roommate.name, query: roommate.commuteDestination });
    }
  }

  return Array.from(new Map(anchors.map((anchor) => [`${anchor.label}:${anchor.query}`.toLowerCase(), anchor])).values()).slice(0, 3);
}

async function getSuggestedListings(
  profile: SearchProfileData,
  boardListings: BoardListingRecord[],
  roommates: RoommateRecord[],
): Promise<SuggestedListingRecord[]> {
  if (isDemoModeEnabled()) {
    await ensureStarterCatalog();
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
          const commute = {
            listingId: listing.id,
            bestDurationMinutes: property?.demoCommuteMinutes ?? null,
            bestDistanceMiles: property?.demoCommuteMiles ?? null,
            bestOriginLabel: property?.demoCommuteLabel ?? null,
            evaluatedAnchors: property?.demoCommuteLabel ? [property.demoCommuteLabel] : [],
            routes: property?.demoCommuteLabel
              ? [{
                  originLabel: property.demoCommuteLabel,
                  durationMinutes: property.demoCommuteMinutes ?? null,
                  distanceMiles: property.demoCommuteMiles ?? null,
                }]
              : [],
          };

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
              "This is a demo-mode listing, so the workspace is presenting a staged recommendation instead of a live match.",
            commute,
            neighborhoodSignal: getNeighborhoodSignal(listing.city, listing.neighborhood),
            analysis: analyzeListingForGroup({
              listing,
              members: roommates,
              routes: commute.routes,
              sourceConfirmed: false,
            }),
          };
        })
        .filter((entry) => entry.existingStatus === null);
    }
  }

  const listings = isDemoModeEnabled()
    ? buildStarterListings().map(starterSeedToListingRecord)
    : (
        await prisma.listing.findMany({
          where: {
            source: "api",
            sourceName: "rentcast",
            NOT: { status: "removed" },
          },
          orderBy: { updatedAt: "desc" },
          take: 500,
        })
      ).map(mapListingRow);

  const existingByListingId = new Map(
    boardListings.map((entry) => [entry.listingId, { id: entry.id, status: entry.userStatus }] as const),
  );

  const scenarioListingIds = isDemoModeEnabled() ? new Set(getDemoScenarioListingIds(profile)) : null;
  const commuteAnchors = getCommuteAnchors(roommates);
  const commuteEstimates = isDemoModeEnabled()
    ? listings.map((listing) => ({
        listingId: listing.id,
        bestDurationMinutes: null,
        bestDistanceMiles: null,
        bestOriginLabel: null,
        evaluatedAnchors: commuteAnchors.map((anchor) => anchor.label),
        routes: commuteAnchors.map((anchor) => ({
          originLabel: anchor.label,
          durationMinutes: null,
          distanceMiles: null,
        })),
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
        analysis: analyzeListingForGroup({
          listing,
          members: roommates,
          routes: commute?.routes ?? [],
          sourceConfirmed: false,
        }),
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
    .slice(0, 500)
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

export async function getBoardPageData(
  boardId: string,
  viewerUserId: string,
  options: { includeSuggestedListings?: boolean } = { includeSuggestedListings: false },
): Promise<BoardPageData | null> {
  const demoMode = isDemoModeEnabled();
  if (demoMode && options.includeSuggestedListings === true) {
    await ensureStarterCatalog();
  }

  const board = await prisma.searchBoard.findFirst({
    where: {
      id: boardId,
      OR: [
        { members: { some: { userId: viewerUserId } } },
        { userId: viewerUserId },
      ],
    },
    include: {
      searchProfile: true,
      roommates: { orderBy: [{ createdAt: "asc" }, { name: "asc" }] },
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        include: { user: true },
      },
      invitations: {
        where: {
          status: "pending",
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        orderBy: { createdAt: "desc" },
      },
      chatMessages: { orderBy: { createdAt: "asc" } },
      boardListings: {
        orderBy: { updatedAt: "desc" },
        include: {
          listing: true,
          votes: { include: { roommate: true }, orderBy: { createdAt: "desc" } },
          comments: { include: { roommate: true }, orderBy: { createdAt: "desc" } },
          ratings: { include: { roommate: true }, orderBy: { updatedAt: "desc" } },
          sources: {
            include: {
              createdByRoommate: true,
              catalogSource: {
                include: {
                  _count: {
                    select: {
                      boardSources: true,
                      attestations: { where: { attestedAt: { not: null } } },
                      reports: true,
                    },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          verifications: { include: { roommate: true }, orderBy: { createdAt: "desc" } },
          reviews: { include: { roommate: true }, orderBy: { updatedAt: "desc" } },
          decisions: {
            include: {
              votes: { include: { roommate: true }, orderBy: { updatedAt: "desc" } },
            },
            orderBy: { createdAt: "desc" },
          },
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
  const groupSynthesis = summarizeGroup(roommates, profile);
  const effectiveProfile: SearchProfileData = {
    ...profile,
    budgetMin: groupSynthesis.groupBudgetMin ?? undefined,
    budgetMax: groupSynthesis.groupBudgetMax ?? undefined,
    stretchBudget: groupSynthesis.groupStretchBudget ?? undefined,
    commuteTarget: groupSynthesis.commuteDestinations[0] ?? undefined,
  };

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
    workflowStatus: entry.workflowStatus,
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

  const ratingRows: BoardListingRatingRecord[] = board.boardListings.flatMap((entry) =>
    entry.ratings.map((rating) => ({
      id: rating.id,
      boardListingId: rating.boardListingId,
      roommateId: rating.roommateId,
      ratings: Object.fromEntries(
        Object.entries(rating.ratings as Record<string, unknown>)
          .filter((entry): entry is [string, number] => typeof entry[1] === "number"),
      ),
      createdAt: rating.createdAt.toISOString(),
      updatedAt: rating.updatedAt.toISOString(),
      roommate: {
        id: rating.roommate.id,
        name: rating.roommate.name,
        roleLabel: rating.roommate.roleLabel,
        linkedUserId: rating.roommate.linkedUserId,
      },
    })),
  );

  const sourceRows: BoardListingSourceRecord[] = board.boardListings.flatMap((entry) =>
    entry.sources.map((source) => ({
      id: source.id,
      boardListingId: source.boardListingId,
      catalogSourceId: source.catalogSourceId,
      url: source.url,
      label: source.label,
      kind: source.kind,
      createdByRoommateId: source.createdByRoommateId,
      confirmedAt: source.confirmedAt?.toISOString() ?? null,
      createdAt: source.createdAt.toISOString(),
      createdByRoommate: source.createdByRoommate
        ? { id: source.createdByRoommate.id, name: source.createdByRoommate.name }
        : null,
      catalogSource: source.catalogSource
        ? {
            id: source.catalogSource.id,
            trustStatus: source.catalogSource.trustStatus,
            resolutionStatus: source.catalogSource.resolutionStatus,
            warning: listingSourceTrustWarning(source.catalogSource.trustStatus),
            boardCount: source.catalogSource._count.boardSources,
            confirmationCount: source.catalogSource._count.attestations,
            reportCount: source.catalogSource._count.reports,
            globallyDiscoverable: sourceIsGloballyDiscoverable(source.catalogSource.trustStatus),
          }
        : null,
    })),
  );

  const verificationRows: BoardListingVerificationRecord[] = board.boardListings.flatMap((entry) =>
    entry.verifications.map((verification) => ({
      id: verification.id,
      boardListingId: verification.boardListingId,
      roommateId: verification.roommateId,
      status: verification.status,
      note: verification.note,
      createdAt: verification.createdAt.toISOString(),
      roommate: verification.roommate
        ? { id: verification.roommate.id, name: verification.roommate.name }
        : null,
    })),
  );

  const reviewRows: BoardListingReviewRecord[] = board.boardListings.flatMap((entry) =>
    entry.reviews.map((review) => ({
      id: review.id,
      boardListingId: review.boardListingId,
      roommateId: review.roommateId,
      tourIntent: review.tourIntent,
      interiorAppeal: review.interiorAppeal,
      naturalLight: review.naturalLight,
      mainConcern: review.mainConcern,
      sourceViewedAt: review.sourceViewedAt?.toISOString() ?? null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      roommate: {
        id: review.roommate.id,
        name: review.roommate.name,
        linkedUserId: review.roommate.linkedUserId,
      },
    })),
  );

  const decisionRows: BoardListingDecisionRecord[] = board.boardListings.flatMap((entry) =>
    entry.decisions.map((decision) => ({
      id: decision.id,
      boardListingId: decision.boardListingId,
      type: decision.type,
      createdByRoommateId: decision.createdByRoommateId,
      createdAt: decision.createdAt.toISOString(),
      closedAt: decision.closedAt?.toISOString() ?? null,
      votes: decision.votes.map((vote) => ({
        id: vote.id,
        roommateId: vote.roommateId,
        choice: vote.choice,
        createdAt: vote.createdAt.toISOString(),
        updatedAt: vote.updatedAt.toISOString(),
        roommate: {
          id: vote.roommate.id,
          name: vote.roommate.name,
          linkedUserId: vote.roommate.linkedUserId,
        },
      })),
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

  const suggestedListings =
    options.includeSuggestedListings === true
      ? await getSuggestedListings(
          effectiveProfile,
          boardListings,
          roommates,
        )
      : [];
  const commuteAnchors = getCommuteAnchors(roommates);
  const savedListingCommutesRaw = isDemoModeEnabled()
    ? boardListings.map((entry) => ({
        listingId: entry.id,
        bestDurationMinutes: null,
        bestDistanceMiles: null,
        bestOriginLabel: null,
        evaluatedAnchors: commuteAnchors.map((anchor) => anchor.label),
        routes: commuteAnchors.map((anchor) => ({
          originLabel: anchor.label,
          durationMinutes: null,
          distanceMiles: null,
        })),
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
        routes: entry.routes,
      };
      return accumulator;
    },
    {},
  );
  const listingSourcesByBoardListingId = groupByKey(sourceRows, "boardListingId");
  const listingVerificationsByBoardListingId = groupByKey(verificationRows, "boardListingId");
  const listingReviewsByBoardListingId = groupByKey(reviewRows, "boardListingId");
  const listingDecisionsByBoardListingId = groupByKey(decisionRows, "boardListingId");
  const listingAnalysisByBoardListingId = Object.fromEntries(
    boardListings.map((entry) => {
      const sources = listingSourcesByBoardListingId[entry.id] ?? [];
      const verifications = listingVerificationsByBoardListingId[entry.id] ?? [];
      return [
        entry.id,
        analyzeListingForGroup({
          listing: entry.listing,
          members: roommates,
          routes: boardListingCommutesByBoardListingId[entry.id]?.routes ?? [],
          reviews: listingReviewsByBoardListingId[entry.id] ?? [],
          sourceConfirmed: sources.some((source) => source.confirmedAt !== null),
          latestVerification: verifications[0]?.status ?? "unverified",
        }),
      ];
    }),
  );
  const browseRequests = getBrowseRequests(messages);
  const currentBrowseRequest = browseRequests.at(-1) ?? null;
  const commuteMode = getCommuteServiceMode(demoMode);

  return {
    isDemoMode: demoMode,
    commuteMode,
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
    listingRatingsByBoardListingId: groupByKey(ratingRows, "boardListingId"),
    listingSourcesByBoardListingId,
    listingVerificationsByBoardListingId,
    listingReviewsByBoardListingId,
    listingDecisionsByBoardListingId,
    listingAnalysisByBoardListingId,
    suggestedListings,
    currentDeckListings: buildDeckListings(suggestedListings, browseRequests),
    currentBrowseRequest,
    comparison: demoMode
      ? getDemoComparisonCopy(effectiveProfile) ?? generateComparison(effectiveProfile, boardListings)
      : generateComparison(effectiveProfile, boardListings),
    missingFields: getMissingFields(effectiveProfile),
    completion: getProfileCompletion(effectiveProfile),
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
  const title = input.title?.trim() || "New workspace";
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
          content: `${input.authorName} created this shared workspace.`,
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
          roleLabel: "workspace owner",
          budgetMin: seededProfile.budgetMin,
          budgetMax: seededProfile.budgetMax,
          stretchBudget: seededProfile.stretchBudget,
          commuteDestination: seededProfile.commuteTarget,
          commuteAccess: seededProfile.commuteAccess ?? null,
          preferredCommuteMinutes: seededProfile.minCommuteMinutes,
          maxCommuteMinutes: seededProfile.maxCommuteMinutes,
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

export async function saveBoardProfile(boardId: string, actingUserId: string, nextProfile: SearchProfileData) {
  const boardData = await getBoardPageData(boardId, actingUserId, { includeSuggestedListings: true });
  if (!boardData) {
    throw new Error("Workspace not found.");
  }

  const finalizedProfile = finalizeProfileState({
    ...boardData.profile,
    ...nextProfile,
    id: boardData.profile.id,
    boardId: boardData.profile.boardId,
    name: nextProfile.name || boardData.profile.name,
    email: nextProfile.email || boardData.profile.email,
    city: nextProfile.city || boardData.profile.city,
    locations: nextProfile.city
      ? [nextProfile.city]
      : (nextProfile.locations.length > 0 ? nextProfile.locations : boardData.profile.locations),
    updatedAt: new Date().toISOString(),
  });

  await updateProfile(finalizedProfile);

  await prisma.roommateProfile.updateMany({
    where: { boardId, linkedUserId: actingUserId },
    data: {
      commuteDestination: finalizedProfile.commuteTarget ?? null,
      commuteAccess: finalizedProfile.commuteAccess ?? null,
      preferredCommuteMinutes: finalizedProfile.minCommuteMinutes ?? null,
      maxCommuteMinutes: finalizedProfile.maxCommuteMinutes ?? null,
    },
  });

  const changedFields = summarizeProfileChanges(boardData.profile, finalizedProfile);
  if (changedFields.length > 0) {
    await addBoardEvent(
      boardId,
      "system",
      "System",
      "profile_updated",
      `Board brief updated: ${changedFields.join(", ")}.`,
    );
  }

  await touchBoard(boardId);
  return finalizedProfile;
}

export async function sendChat(boardId: string, content: string, author: { userId: string; authorName: string }) {
  const boardData = await getBoardPageData(boardId, author.userId, { includeSuggestedListings: true });
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
        ? mergeProfileUpdatesWithGuards({
            profile: boardData.profile,
            ruleProfile,
            updates: aiExtraction.updates,
            message: content,
            conversationHint,
          })
        : ruleProfile;
    nextProfile = finalizeProfileState(nextProfile);

    const groupSynthesis = summarizeGroup(boardData.roommates, nextProfile);
    const suggestedCount = (
      await getSuggestedListings(
        {
          ...nextProfile,
          budgetMin: groupSynthesis.groupBudgetMin ?? undefined,
          budgetMax: groupSynthesis.groupBudgetMax ?? undefined,
          stretchBudget: groupSynthesis.groupStretchBudget ?? undefined,
        },
        boardData.boardListings,
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
    await addBoardEvent(
      boardId,
      "system",
      "System",
      "profile_completed",
      "The onboarding brief now covers the core fields well enough to create a reliable shared search profile.",
    );
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
    listingTitle?: string;
    address?: string;
    unit?: string;
    city?: string;
    neighborhood?: string;
    latitude?: number;
    longitude?: number;
    price?: string;
    bedrooms?: string;
    bathrooms?: string;
    squareFeet?: string;
    amenities?: string[];
    modelInsights?: ListingModelInsight[];
    description?: string;
    imageUrl?: string;
    userNotes?: string;
    actorRoommateId?: string;
    actorUserId?: string;
  },
) {
  const extracted = input.pastedText ? extractListingFromText(input.pastedText) : null;
  const rawSourceUrl = normalizeLooseText(input.sourceUrl);
  const parsedPrice = input.price ? Number(input.price) : extracted?.price ?? null;
  const parsedBedrooms = input.bedrooms ? Number(input.bedrooms) : extracted?.bedrooms ?? null;
  const parsedBathrooms = input.bathrooms ? Number(input.bathrooms) : extracted?.bathrooms ?? null;
  const importPreview = rawSourceUrl
    ? previewListingImport({
        url: rawSourceUrl,
        address: input.address,
        unit: input.unit,
        price: parsedPrice,
        bedrooms: parsedBedrooms,
        bathrooms: parsedBathrooms,
      })
    : null;
  const normalizedSourceUrl = importPreview?.normalizedUrl ?? rawSourceUrl;
  const normalizedAddress = normalizeLooseText(
    input.address || importPreview?.suggestedAddress,
  );
  const normalizedUnit = normalizeLooseText(input.unit || importPreview?.suggestedUnit);
  const normalizedCity = normalizeLooseText(input.city || extracted?.city);
  const normalizedNeighborhood = normalizeLooseText(input.neighborhood || extracted?.neighborhood);

  const existingBoardListings = await prisma.boardListing.findMany({
    where: { boardId },
    include: { listing: true },
  });

  const duplicateBoardListing = existingBoardListings.find((entry) => {
    const listing = entry.listing;
    if (
      normalizedSourceUrl
      && normalizedSourceUrl === normalizeLooseText(listing.sourceUrl)
      && normalizedUnit === normalizeLooseText(listing.unit)
    ) return true;
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
    if (input.modelInsights?.length || input.listingTitle?.trim()) {
      const existingProviderData = duplicateBoardListing.listing.providerData;
      await prisma.listing.update({
        where: { id: duplicateBoardListing.listing.id },
        data: {
          providerData: {
            ...(existingProviderData && typeof existingProviderData === "object" && !Array.isArray(existingProviderData)
              ? existingProviderData as Record<string, unknown>
              : {}),
            ...(input.modelInsights?.length
              ? { homeboardModelInsights: input.modelInsights }
              : {}),
            ...(input.listingTitle?.trim()
              ? { homeboardListingTitle: input.listingTitle.trim() }
              : {}),
          },
        },
      });
    }
    await addBoardEvent(
      boardId,
      "system",
      "System",
      "listing_deduped",
      `A duplicate listing was folded back into the workspace instead of creating a second copy: ${formatListingLabel(duplicateBoardListing.listing)}.`,
    );
    await touchBoard(boardId);
    return;
  }

  const listing = await prisma.listing.create({
    data: {
      source: input.method,
      sourceUrl: normalizedSourceUrl,
      address: normalizedAddress,
      unit: input.unit?.trim() || importPreview?.suggestedUnit || null,
      city: input.city?.trim() || extracted?.city || null,
      neighborhood: input.neighborhood?.trim() || extracted?.neighborhood || null,
      latitude: Number.isFinite(input.latitude) ? input.latitude : null,
      longitude: Number.isFinite(input.longitude) ? input.longitude : null,
      price: parsedPrice,
      bedrooms: parsedBedrooms,
      bathrooms: parsedBathrooms,
      squareFeet: input.squareFeet ? Number(input.squareFeet) : extracted?.squareFeet ?? null,
      description: input.description?.trim() || input.pastedText?.trim() || null,
      amenities: json(input.amenities ?? []),
      providerData: {
        homeboardModelInsights: input.modelInsights ?? [],
        ...(input.listingTitle?.trim()
          ? { homeboardListingTitle: input.listingTitle.trim() }
          : {}),
      },
      fees: json({ brokerFee: null, applicationFee: null, deposit: null, utilitiesIncluded: null }),
      images: json(input.imageUrl?.trim() ? [input.imageUrl.trim()] : []),
      propertyType: null,
      state: null,
      zip: null,
      sourceName:
        input.method === "pasted_link" && input.sourceUrl
          ? detectListingProvider(input.sourceUrl)
          : input.method === "pasted_text"
            ? "pasted text"
            : "manual entry",
      status: input.method === "pasted_link" ? "saved_only" : "unknown",
    },
  });

  const analysis = {
    aiSummary: listing.description ? "Listing added to the workspace for review." : "Listing saved with partial details.",
    aiTradeoffAnalysis: "This was added manually, so the key thing is to confirm the missing details before anyone overcommits to it.",
    aiRedFlags: json(["Source details may still be incomplete"]),
    questionsToAsk: json(["Can you confirm the current availability and full monthly cost?"]),
  };

  const boardListing = await prisma.boardListing.create({
    data: {
      boardId,
      listingId: listing.id,
      userStatus: "new",
      workflowStatus: input.sourceUrl ? "source_confirmed" : "suggested",
      userNotes: input.userNotes?.trim() || null,
      ...analysis,
    },
  });

  if (input.sourceUrl?.trim() && (input.actorRoommateId || input.actorUserId)) {
    const actor = input.actorRoommateId
      ? await prisma.roommateProfile.findUnique({
          where: { id: input.actorRoommateId },
          select: { linkedUserId: true },
        })
      : await prisma.roommateProfile.findFirst({
          where: { boardId, linkedUserId: input.actorUserId },
          select: { linkedUserId: true },
        });
    if (actor?.linkedUserId) {
      await submitBoardListingSource({
        boardListingId: boardListing.id,
        userId: actor.linkedUserId,
        url: input.sourceUrl,
        label: `${detectListingProvider(input.sourceUrl)} listing`,
      });
    }
  }

  if (listing.price !== null) {
    await prisma.priceHistory.create({
      data: {
        listingId: listing.id,
        price: listing.price,
        observedAt: new Date(),
        source: "manual",
      },
    });
  }

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
  await trackEvent("listing_imported", {
    boardId,
    boardListingId: boardListing.id,
    listingId: listing.id,
    method: input.method,
    provider: listing.sourceName,
  });
  await touchBoard(boardId);
}

export async function createBoardInvitation(
  boardId: string,
  invitedByUserId: string,
  email?: string | null,
) {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  const normalizedEmail = email?.trim().toLowerCase() || null;

  const board = await ensureBoard(boardId, invitedByUserId);
  if (!board) throw new Error("Workspace not found.");

  const existingUser = normalizedEmail
    ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
    : null;
  if (existingUser) {
    const existingMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: existingUser.id } },
    });
    if (existingMember) {
      throw new Error("That person is already in this workspace.");
    }
  }

  const existingInvite = await prisma.boardInvitation.findFirst({
    where: { boardId, email: normalizedEmail, status: "pending" },
  });

  if (existingInvite) {
    const refreshedInvite = await prisma.boardInvitation.update({
      where: { id: existingInvite.id },
      data: {
        expiresAt,
      },
    });

    await addBoardEvent(
      boardId,
      "system",
      "System",
      "invitation_refreshed",
      normalizedEmail
        ? `Invitation refreshed for ${normalizedEmail}.`
        : "Shareable roommate invitation refreshed.",
    );
    await trackEvent("invite_refreshed", {
      boardId,
      invitedByUserId,
      email: normalizedEmail,
      invitationId: existingInvite.id,
    });
    await touchBoard(boardId);
    return mapInvitationRow(refreshedInvite);
  }

  const invitation = await prisma.boardInvitation.create({
    data: {
      boardId,
      invitedByUserId,
      email: normalizedEmail,
      inviteCode: createInviteCode(),
      expiresAt,
    },
  });

  await addBoardEvent(
    boardId,
    "system",
    "System",
    "invitation_created",
    normalizedEmail
      ? `Invitation created for ${normalizedEmail}.`
      : "Shareable roommate invitation created.",
  );
  await trackEvent("invite_created", {
    boardId,
    invitedByUserId,
    email: normalizedEmail,
    invitationId: invitation.id,
  });
  await touchBoard(boardId);
  return mapInvitationRow(invitation);
}

export async function revokeBoardInvitation(invitationId: string, actingUserId: string) {
  const invitation = await prisma.boardInvitation.findUnique({
    where: { id: invitationId },
    include: { board: true },
  });

  if (!invitation) {
    throw new Error("Invite not found or no longer available.");
  }

  if (invitation.board.userId !== actingUserId) {
    throw new Error("Only the workspace owner can revoke invites.");
  }

  if (invitation.status !== "pending") {
    throw new Error("Only pending invites can be canceled.");
  }

  await prisma.boardInvitation.update({
    where: { id: invitationId },
    data: { status: "revoked" },
  });

  await addBoardEvent(
    invitation.boardId,
    "system",
    "System",
    "invitation_revoked",
    invitation.email
      ? `Invitation revoked for ${invitation.email}.`
      : "Shareable roommate invitation revoked.",
  );
  await trackEvent("invite_revoked", {
    boardId: invitation.boardId,
    invitationId: invitation.id,
    email: invitation.email,
    actingUserId,
  });
  await touchBoard(invitation.boardId);
  return invitation.boardId;
}

export async function removeBoardMember(boardId: string, actingUserId: string, memberUserId: string) {
  const board = await prisma.searchBoard.findUnique({
    where: { id: boardId },
    include: {
      members: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!board) {
    throw new Error("Workspace not found.");
  }

  if (board.userId !== actingUserId) {
    throw new Error("Only the workspace owner can remove members.");
  }

  if (memberUserId === board.userId) {
    throw new Error("The workspace owner cannot be removed.");
  }

  const member = board.members.find((entry) => entry.userId === memberUserId);
  if (!member) {
    throw new Error("Collaborator not found.");
  }

  await prisma.boardMember.delete({
    where: { boardId_userId: { boardId, userId: memberUserId } },
  });

  await prisma.roommateProfile.deleteMany({
    where: {
      boardId,
      linkedUserId: memberUserId,
    },
  });

  await addBoardEvent(
    boardId,
    "system",
    "System",
    "member_removed",
    `${member.user.displayName} was removed from the workspace.`,
  );
  await touchBoard(boardId);
}

export async function leaveBoard(boardId: string, userId: string) {
  const board = await prisma.searchBoard.findUnique({
    where: { id: boardId },
    include: {
      members: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!board) {
    throw new Error("Workspace not found.");
  }

  if (board.userId === userId) {
    throw new Error("The workspace owner cannot leave their own workspace.");
  }

  const member = board.members.find((entry) => entry.userId === userId);
  if (!member) {
    throw new Error("You are not a member of this workspace.");
  }

  await prisma.boardMember.delete({
    where: { boardId_userId: { boardId, userId } },
  });

  await prisma.roommateProfile.deleteMany({
    where: {
      boardId,
      linkedUserId: userId,
    },
  });

  await addBoardEvent(
    boardId,
    "system",
    "System",
    "member_left",
    `${member.user.displayName} left the workspace.`,
  );
  await touchBoard(boardId);
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
  const wasExpired = invitationIsExpired(invitation);

  if (wasExpired) {
    await prisma.boardInvitation.update({
      where: { id: invitation.id },
      data: { status: "revoked" },
    });
    invitation.status = "revoked";
  }

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
    wasExpired,
  };
}

export async function acceptBoardInvitation(inviteCode: string, userId: string) {
  const invitation = await prisma.boardInvitation.findUnique({ where: { inviteCode } });
  if (!invitation || invitation.status !== "pending") {
    throw new Error("This invite is no longer available.");
  }
  if (invitationIsExpired(invitation)) {
    await prisma.boardInvitation.update({
      where: { id: invitation.id },
      data: { status: "revoked" },
    });
    throw new Error("This invite has expired.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Account not found.");
  if (!user.email) throw new Error("Your account is missing an email address.");

  if (invitation.email && user.email.toLowerCase() !== invitation.email.toLowerCase()) {
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
        budgetMin: null,
        budgetMax: null,
        stretchBudget: null,
        commuteDestination: null,
        maxCommuteMinutes: null,
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

  await addBoardEvent(invitation.boardId, "system", "System", "invitation_accepted", `${user.displayName} joined the workspace.`);
  await trackEvent("invite_accepted", {
    boardId: invitation.boardId,
    invitationId: invitation.id,
    email: invitation.email,
    userId,
  });
  await touchBoard(invitation.boardId);

  return invitation.boardId;
}

export async function addRoommateToBoard(
  boardId: string,
  input: {
    name: string;
    roleLabel?: string;
    budgetMin?: string;
    idealBudget?: string;
    budgetMax?: string;
    stretchBudget?: string;
    commuteDestination?: string;
    commuteAccess?: string;
    preferredCommuteMinutes?: string;
    maxCommuteMinutes?: string;
    petsRequired?: string;
    accessibilityNeeds?: string;
  },
) {
  const roommate = await prisma.roommateProfile.create({
    data: {
      boardId,
      name: input.name.trim() || "New roommate",
      roleLabel: input.roleLabel?.trim() || "roommate",
      budgetMin: input.budgetMin ? Number(input.budgetMin) : null,
      idealBudget: input.idealBudget ? Number(input.idealBudget) : null,
      budgetMax: input.budgetMax ? Number(input.budgetMax) : null,
      stretchBudget: input.stretchBudget ? Number(input.stretchBudget) : null,
      commuteDestination: input.commuteDestination?.trim() || null,
      commuteAccess: input.commuteAccess?.trim() || null,
      preferredCommuteMinutes: input.commuteDestination?.trim() && input.preferredCommuteMinutes
        ? Number(input.preferredCommuteMinutes)
        : null,
      maxCommuteMinutes: input.commuteDestination?.trim() && input.maxCommuteMinutes
        ? Number(input.maxCommuteMinutes)
        : null,
      commutePriority: "medium",
      neighborhoodPriority: "medium",
      spacePriority: "medium",
      privacyPriority: "medium",
      preferredNeighborhoods: json([]),
      mustHaves: json([]),
      dealbreakers: json([]),
      petsRequired:
        input.petsRequired === "true" ? true : input.petsRequired === "false" ? false : null,
      accessibilityNeeds: json(
        input.accessibilityNeeds?.split(",").map((value) => value.trim()).filter(Boolean) ?? [],
      ),
      notes: null,
    },
  });
  await addBoardEvent(boardId, "system", "System", "member_profile_added", `${roommate.name} was added to the group brief.`);
  await touchBoard(boardId);
}

export async function updateRoommateProfile(
  roommateId: string,
  input: {
    budgetMin?: string;
    idealBudget?: string;
    budgetMax?: string;
    stretchBudget?: string;
    commuteDestination?: string;
    commuteAccess?: string;
    preferredCommuteMinutes?: string;
    maxCommuteMinutes?: string;
    commutePriority?: string;
    neighborhoodPriority?: string;
    spacePriority?: string;
    privacyPriority?: string;
    preferredNeighborhoods?: string;
    mustHaves?: string;
    dealbreakers?: string;
    petsRequired?: string;
    accessibilityNeeds?: string;
    notes?: string;
  },
) {
  const current = await prisma.roommateProfile.findUnique({ where: { id: roommateId } });
  if (!current) throw new Error("Member profile not found.");
  const wasComplete =
    current.idealBudget !== null &&
    current.budgetMax !== null &&
    (Boolean(current.commuteDestination) || parseJsonArray(current.preferredNeighborhoods).length > 0) &&
    parseJsonArray(current.mustHaves).length > 0 &&
    parseJsonArray(current.dealbreakers).length > 0;

  const parseBudget = (value: string | undefined, fallback: number | null) =>
    value === undefined ? fallback : value ? Number(value) : null;
  const nextBudgetMin = parseBudget(input.budgetMin, current.budgetMin);
  const nextIdealBudget = parseBudget(input.idealBudget, current.idealBudget);
  const nextBudgetMax = parseBudget(input.budgetMax, current.budgetMax);
  const nextStretchBudget = parseBudget(input.stretchBudget, current.stretchBudget);
  const nextCommuteDestination =
    input.commuteDestination === undefined
      ? current.commuteDestination
      : input.commuteDestination.trim() || null;
  const nextMaxCommuteMinutes =
    input.maxCommuteMinutes === undefined
      ? current.maxCommuteMinutes
      : nextCommuteDestination && input.maxCommuteMinutes
        ? Number(input.maxCommuteMinutes)
        : null;
  const nextPreferredCommuteMinutes =
    input.preferredCommuteMinutes === undefined
      ? current.preferredCommuteMinutes
      : nextCommuteDestination && input.preferredCommuteMinutes
        ? Number(input.preferredCommuteMinutes)
        : null;

  if (nextBudgetMin !== null && nextBudgetMax !== null && nextBudgetMin > nextBudgetMax) {
    throw new Error("The comfortable minimum cannot be higher than the comfortable maximum.");
  }
  if (nextIdealBudget !== null && nextBudgetMin !== null && nextIdealBudget < nextBudgetMin) {
    throw new Error("The ideal budget cannot be lower than the minimum contribution.");
  }
  if (nextIdealBudget !== null && nextBudgetMax !== null && nextIdealBudget > nextBudgetMax) {
    throw new Error("The ideal budget cannot be higher than the absolute maximum.");
  }
  if (nextStretchBudget !== null && nextBudgetMax !== null && nextStretchBudget < nextBudgetMax) {
    throw new Error("The stretch budget cannot be lower than the comfortable maximum.");
  }
  if (nextMaxCommuteMinutes !== null && !nextCommuteDestination) {
    throw new Error("Add a commute address before setting a commute limit.");
  }
  if (
    nextPreferredCommuteMinutes !== null &&
    nextMaxCommuteMinutes !== null &&
    nextPreferredCommuteMinutes > nextMaxCommuteMinutes
  ) {
    throw new Error("The preferred commute cannot be longer than the maximum commute.");
  }

  const roommate = await prisma.roommateProfile.update({
    where: { id: roommateId },
    data: {
      ...(input.budgetMin !== undefined ? { budgetMin: nextBudgetMin } : {}),
      ...(input.idealBudget !== undefined ? { idealBudget: nextIdealBudget } : {}),
      ...(input.budgetMax !== undefined ? { budgetMax: nextBudgetMax } : {}),
      ...(input.stretchBudget !== undefined ? { stretchBudget: nextStretchBudget } : {}),
      ...(input.commuteDestination !== undefined ? { commuteDestination: nextCommuteDestination } : {}),
      ...(input.commuteAccess !== undefined
        ? { commuteAccess: input.commuteAccess.trim() || null }
        : {}),
      ...(input.preferredCommuteMinutes !== undefined
        ? { preferredCommuteMinutes: nextPreferredCommuteMinutes }
        : {}),
      ...(input.maxCommuteMinutes !== undefined ? { maxCommuteMinutes: nextMaxCommuteMinutes } : {}),
      ...(input.commutePriority !== undefined
        ? { commutePriority: input.commutePriority as RoommateRecord["commutePriority"] }
        : {}),
      ...(input.neighborhoodPriority !== undefined
        ? { neighborhoodPriority: input.neighborhoodPriority as RoommateRecord["neighborhoodPriority"] }
        : {}),
      ...(input.spacePriority !== undefined
        ? { spacePriority: input.spacePriority as RoommateRecord["spacePriority"] }
        : {}),
      ...(input.privacyPriority !== undefined
        ? { privacyPriority: input.privacyPriority as RoommateRecord["privacyPriority"] }
        : {}),
      ...(input.preferredNeighborhoods !== undefined
        ? {
            preferredNeighborhoods: json(
              input.preferredNeighborhoods
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          }
        : {}),
      ...(input.mustHaves !== undefined
        ? { mustHaves: json(input.mustHaves.split(",").map((value) => value.trim()).filter(Boolean)) }
        : {}),
      ...(input.dealbreakers !== undefined
        ? { dealbreakers: json(input.dealbreakers.split(",").map((value) => value.trim()).filter(Boolean)) }
        : {}),
      ...(input.petsRequired !== undefined
        ? { petsRequired: input.petsRequired === "true" ? true : input.petsRequired === "false" ? false : null }
        : {}),
      ...(input.accessibilityNeeds !== undefined
        ? {
            accessibilityNeeds: json(
              input.accessibilityNeeds.split(",").map((value) => value.trim()).filter(Boolean),
            ),
          }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
    },
  });
  await addBoardEvent(roommate.boardId, "system", "System", "member_profile_updated", `${roommate.name}'s preferences were updated.`);
  const isComplete =
    roommate.idealBudget !== null &&
    roommate.budgetMax !== null &&
    (Boolean(roommate.commuteDestination) || parseJsonArray(roommate.preferredNeighborhoods).length > 0) &&
    parseJsonArray(roommate.mustHaves).length > 0 &&
    parseJsonArray(roommate.dealbreakers).length > 0;
  if (!wasComplete && isComplete) {
    await addBoardEvent(
      roommate.boardId,
      "roommate",
      roommate.name,
      "preferences_completed",
      `${roommate.name} completed their individual search limits.`,
    );
    await trackEvent("preferences_completed", {
      boardId: roommate.boardId,
      roommateId: roommate.id,
    });
  }
  await touchBoard(roommate.boardId);
}

export async function renameBoard(boardId: string, actorUserId: string, title: string) {
  const cleanedTitle = title.trim();
  if (!cleanedTitle) throw new Error("Board title is required.");
  const board = await ensureBoard(boardId, actorUserId);
  if (!board) throw new Error("Workspace not found.");
  await prisma.searchBoard.update({ where: { id: boardId }, data: { title: cleanedTitle } });
  const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { displayName: true } });
  await addBoardEvent(boardId, "roommate", actor?.displayName || "A member", "board_renamed", `Renamed the workspace to ${cleanedTitle}.`);
  await touchBoard(boardId);
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
  await trackEvent("listing_status_changed", {
    boardId: boardListing.boardId,
    boardListingId,
    status,
  });
  await touchBoard(boardListing.boardId);
}

export async function updateBoardListingWorkflow(
  boardListingId: string,
  workflowStatus: BoardListingRecord["workflowStatus"],
  actorName = "A member",
) {
  const boardListing = await prisma.boardListing.update({
    where: { id: boardListingId },
    data: { workflowStatus },
    include: { listing: true },
  });
  await addBoardEvent(
    boardListing.boardId,
    "roommate",
    actorName,
    "listing_workflow_updated",
    `${formatListingLabel(boardListing.listing)} moved to ${workflowStatus.replaceAll("_", " ")}.`,
  );
  await trackEvent("listing_status_changed", {
    boardId: boardListing.boardId,
    boardListingId,
    workflowStatus,
  });
  await touchBoard(boardListing.boardId);
}

export async function attachBoardListingSource(
  boardListingId: string,
  roommateId: string,
  input: { url: string; label?: string; kind?: "confirmed_exact" | "member_reference" },
) {
  const [boardListing, roommate] = await Promise.all([
    prisma.boardListing.findUnique({ where: { id: boardListingId }, include: { listing: true } }),
    prisma.roommateProfile.findUnique({ where: { id: roommateId } }),
  ]);
  if (!boardListing || !roommate || roommate.boardId !== boardListing.boardId) {
    throw new Error("Listing or member profile not found.");
  }
  if (!roommate.linkedUserId) {
    throw new Error("Sign in with the member account before attaching a source.");
  }
  const result = await submitBoardListingSource({
    boardListingId,
    userId: roommate.linkedUserId,
    url: input.url,
    label: input.label,
  });
  const provider = detectListingProvider(input.url);
  await prisma.boardListing.update({
    where: { id: boardListingId },
    data: { workflowStatus: "source_confirmed" },
  });

  await addBoardEvent(
    boardListing.boardId,
    "roommate",
    roommate.name,
    "listing_source_added",
    `${roommate.name} attached a board source for ${formatListingLabel(boardListing.listing)}.`,
  );
  await trackEvent("listing_source_confirmed", {
    boardId: boardListing.boardId,
    boardListingId,
    roommateId,
    provider,
    trustStatus: result.status,
  });
  await touchBoard(boardListing.boardId);
  return result;
}

export async function verifyBoardListing(
  boardListingId: string,
  roommateId: string,
  status: BoardListingVerificationRecord["status"],
  note?: string,
) {
  const [boardListing, roommate] = await Promise.all([
    prisma.boardListing.findUnique({ where: { id: boardListingId }, include: { listing: true } }),
    prisma.roommateProfile.findUnique({ where: { id: roommateId } }),
  ]);
  if (!boardListing || !roommate || roommate.boardId !== boardListing.boardId) {
    throw new Error("Listing or member profile not found.");
  }

  await prisma.boardListingVerification.create({
    data: {
      boardListingId,
      roommateId,
      status,
      note: note?.trim() || null,
    },
  });
  await addBoardEvent(
    boardListing.boardId,
    "roommate",
    roommate.name,
    "listing_verified",
    `${roommate.name} marked ${formatListingLabel(boardListing.listing)} as ${status.replaceAll("_", " ")}.`,
  );
  await touchBoard(boardListing.boardId);
}

export async function saveBoardListingReview(
  boardListingId: string,
  roommateId: string,
  input: {
    tourIntent: "yes" | "maybe" | "no";
    interiorAppeal?: number | null;
    naturalLight: "unknown" | "poor" | "fair" | "good" | "excellent";
    mainConcern?: string;
    sourceViewed?: boolean;
  },
) {
  const [boardListing, roommate] = await Promise.all([
    prisma.boardListing.findUnique({ where: { id: boardListingId }, include: { listing: true } }),
    prisma.roommateProfile.findUnique({ where: { id: roommateId } }),
  ]);
  if (!boardListing || !roommate || roommate.boardId !== boardListing.boardId) {
    throw new Error("Listing or member profile not found.");
  }

  await prisma.boardListingReview.upsert({
    where: { boardListingId_roommateId: { boardListingId, roommateId } },
    create: {
      boardListingId,
      roommateId,
      tourIntent: input.tourIntent,
      interiorAppeal: input.interiorAppeal ?? null,
      naturalLight: input.naturalLight,
      mainConcern: input.mainConcern?.trim() || null,
      sourceViewedAt: input.sourceViewed ? new Date() : null,
    },
    update: {
      tourIntent: input.tourIntent,
      interiorAppeal: input.interiorAppeal ?? null,
      naturalLight: input.naturalLight,
      mainConcern: input.mainConcern?.trim() || null,
      ...(input.sourceViewed ? { sourceViewedAt: new Date() } : {}),
    },
  });
  await addBoardEvent(
    boardListing.boardId,
    "roommate",
    roommate.name,
    "listing_reviewed",
    `${roommate.name} completed a post-gallery review for ${formatListingLabel(boardListing.listing)}.`,
  );
  await trackEvent("listing_reviewed", {
    boardId: boardListing.boardId,
    boardListingId,
    roommateId,
    tourIntent: input.tourIntent,
  });
  await touchBoard(boardListing.boardId);
}

export async function voteOnBoardListingDecision(
  boardListingId: string,
  roommateId: string,
  type: "shortlist" | "request_viewing" | "apply",
  choice: "yes" | "no" | "abstain",
) {
  const [boardListing, roommate] = await Promise.all([
    prisma.boardListing.findUnique({ where: { id: boardListingId }, include: { listing: true } }),
    prisma.roommateProfile.findUnique({ where: { id: roommateId } }),
  ]);
  if (!boardListing || !roommate || roommate.boardId !== boardListing.boardId) {
    throw new Error("Listing or member profile not found.");
  }

  let decision = await prisma.boardListingDecision.findFirst({
    where: { boardListingId, type, closedAt: null },
    orderBy: { createdAt: "desc" },
  });
  decision ??= await prisma.boardListingDecision.create({
    data: { boardListingId, type, createdByRoommateId: roommateId },
  });

  await prisma.boardListingDecisionVote.upsert({
    where: { decisionId_roommateId: { decisionId: decision.id, roommateId } },
    create: { decisionId: decision.id, roommateId, choice },
    update: { choice },
  });
  await addBoardEvent(
    boardListing.boardId,
    "roommate",
    roommate.name,
    "listing_decision_voted",
    `${roommate.name} voted ${choice} on whether to ${type.replaceAll("_", " ")} ${formatListingLabel(boardListing.listing)}.`,
  );
  await trackEvent("listing_vote_cast", {
    boardId: boardListing.boardId,
    boardListingId,
    roommateId,
    type,
    choice,
  });
  await touchBoard(boardListing.boardId);
}

export async function updateBoardListingDetails(
  boardListingId: string,
  input: {
    address?: string;
    city?: string;
    neighborhood?: string;
    price?: number | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    description?: string;
    sourceUrl?: string;
    imageUrl?: string;
    userNotes?: string;
  },
) {
  const existing = await prisma.boardListing.findUnique({
    where: { id: boardListingId },
    include: { listing: true },
  });
  if (!existing) throw new Error("Listing not found.");

  const nextPrice = input.price === undefined ? existing.listing.price : input.price;
  await prisma.$transaction(async (tx) => {
    await tx.listing.update({
      where: { id: existing.listingId },
      data: {
        address: input.address?.trim() || existing.listing.address,
        city: input.city?.trim() || existing.listing.city,
        neighborhood: input.neighborhood?.trim() || existing.listing.neighborhood,
        price: nextPrice,
        bedrooms: input.bedrooms === undefined ? existing.listing.bedrooms : input.bedrooms,
        bathrooms: input.bathrooms === undefined ? existing.listing.bathrooms : input.bathrooms,
        description: input.description?.trim() || existing.listing.description,
        sourceUrl: input.sourceUrl?.trim() || existing.listing.sourceUrl,
        images: input.imageUrl?.trim() ? json([input.imageUrl.trim()]) : existing.listing.images,
      },
    });
    await tx.boardListing.update({
      where: { id: boardListingId },
      data: { userNotes: input.userNotes?.trim() || null },
    });
    if (nextPrice !== null && nextPrice !== existing.listing.price) {
      await tx.priceHistory.create({
        data: {
          listingId: existing.listingId,
          price: nextPrice,
          observedAt: new Date(),
          source: "user_update",
        },
      });
    }
  });

  await addBoardEvent(
    existing.boardId,
    "system",
    "System",
    "listing_updated",
    `${formatListingLabel({ ...existing.listing, price: nextPrice })} was updated.`,
  );
  await touchBoard(existing.boardId);
}

export async function addManualBoardUpdate(
  boardId: string,
  actor: { userId: string; authorName: string },
  content: string,
) {
  const message = content.trim();
  if (!message) throw new Error("Update cannot be empty.");

  await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        boardId,
        role: "user",
        authorUserId: actor.userId,
        authorName: actor.authorName,
        content: message,
      },
    }),
    prisma.boardEvent.create({
      data: {
        boardId,
        actorType: "roommate",
        actorName: actor.authorName,
        eventType: "board_update",
        content: `${actor.authorName}: ${message}`,
      },
    }),
    prisma.searchBoard.update({
      where: { id: boardId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

export async function addBoardDecision(boardId: string, actorName: string, question: string) {
  const text = question.trim();
  if (!text) throw new Error("Decision cannot be empty.");
  await addBoardEvent(boardId, "roommate", actorName, "decision_opened", text);
  await touchBoard(boardId);
}

export async function resolveBoardDecision(boardId: string, actorName: string, question: string, resolution?: string) {
  const text = question.trim();
  if (!text) throw new Error("Decision cannot be empty.");
  const result = resolution?.trim();
  await addBoardEvent(
    boardId,
    "roommate",
    actorName,
    "decision_resolved",
    result ? `${text} || ${result}` : text,
  );
  await touchBoard(boardId);
}

export async function removeRoommateProfile(roommateId: string) {
  const roommate = await prisma.roommateProfile.findUnique({ where: { id: roommateId } });
  if (!roommate) throw new Error("Member profile not found.");
  if (roommate.linkedUserId) throw new Error("Account-backed members must be removed through board membership controls.");
  await prisma.roommateProfile.delete({ where: { id: roommateId } });
  await addBoardEvent(roommate.boardId, "system", "System", "roommate_profile_removed", `${roommate.name} was removed from the board.`);
  await touchBoard(roommate.boardId);
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

  const boardData = await getBoardPageData(boardId, actorUserId, { includeSuggestedListings: true });
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
    await trackEvent("listing_reaction_added", {
      boardId: boardListing.boardId,
      boardListingId,
      roommateId,
      vote: voteRecord.vote,
    });
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
    await trackEvent("listing_comment_added", {
      boardId: boardListing.boardId,
      boardListingId,
      roommateId,
    });
    await touchBoard(boardListing.boardId);
  }
}

export async function saveBoardListingRatings(
  boardListingId: string,
  roommateId: string,
  ratings: Record<string, number>,
) {
  await prisma.boardListingRating.upsert({
    where: { boardListingId_roommateId: { boardListingId, roommateId } },
    create: { boardListingId, roommateId, ratings },
    update: { ratings },
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
      "listing_dimensions_rated",
      `${roommate.name} updated their group fit read on ${formatListingLabel(boardListing.listing)}.`,
    );
    await trackEvent("listing_rated", {
      boardId: boardListing.boardId,
      boardListingId,
      roommateId,
    });
    await touchBoard(boardListing.boardId);
  }
}
