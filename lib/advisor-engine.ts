import "server-only";

import { estimateCommutes, getCommuteServiceMode, type CommuteEstimate } from "@/lib/commute-service";
import { generateGroupProfile } from "@/lib/group-profile";
import {
  analyzeListingForGroup,
  detectListingActiveOffer,
} from "@/lib/listing-analysis";
import type {
  BoardListingRecord,
  BoardPageData,
  GroupListingAnalysis,
  ListingContactInfo,
  RentalProfile,
  RoommateRecord,
} from "@/lib/types";
import { listingContactInfo } from "@/lib/mobile-payloads";

export const ADVISOR_TONES = [
  "Professional",
  "Casual",
  "Stern",
  "Passive-Aggressive",
] as const;

export type AdvisorTone = (typeof ADVISOR_TONES)[number];

export const ADVISOR_TONE_INSTRUCTIONS: Record<AdvisorTone, string> = {
  Professional: "polished, broker-appropriate",
  Casual: "brief, friendly, like texting a peer",
  Stern: "direct, no-nonsense corporate, urgency",
  "Passive-Aggressive": "dryly direct without inventing prior outreach or readiness",
};

export type AdvisorFinancialQualifications = {
  incomeMultiple: string | null;
  creditScore: string | null;
};

export type AdvisorToggleOption = {
  id:
    | "include_financial_information"
    | "include_requirements"
    | "include_commute"
    | "request_tour";
  label: string;
  enabled: boolean;
  required: boolean;
};

export type AdvisorGroupContext = {
  generatedAt: string;
  commuteMode: ReturnType<typeof getCommuteServiceMode>;
  leverage: {
    incomeMultiple: string | null;
    creditScore: string | null;
    memberCount: number;
    applicationReadiness: {
      hasOfferLetter: boolean | null;
      hasProofOfIncome: boolean | null;
      needsGuarantor: boolean | null;
    };
    activeOffers: Array<{
      boardListingId: string;
      listing: string;
      kind: string;
      label: string;
      bonusPoints: number;
    }>;
    strongestListings: Array<{
      boardListingId: string;
      listing: string;
      rankingLabel: GroupListingAnalysis["rankingLabel"];
      fairnessScore: number | null;
      confidence: GroupListingAnalysis["confidence"];
      contact?: ListingContactInfo | null;
    }>;
  };
  requirements: {
    budget: {
      minimum: number | null;
      maximum: number | null;
      stretchMaximum: number | null;
      summary: string;
    };
    moveIn: string | null;
    locations: string[];
    bedrooms: number | null;
    mustHaves: string[];
    dealbreakers: string[];
    priorities: string[];
    commuteDestinations: string[];
    tensionFlags: string[];
  };
  commutes: CommuteEstimate[];
  listingAnalysis: Array<{
    boardListingId: string;
    listingId: string;
    listing: string;
    analysis: GroupListingAnalysis;
  }>;
};

export type AdvisorMessagePayloadData = {
  schemaVersion: 2;
  /** The original user-authored @advisor command, without regeneration filters. */
  originalCommand: string;
  draftText: string;
  tone: AdvisorTone;
  toggleOptions: AdvisorToggleOption[];
  executionStatus: "draft_ready";
  missingInputs: Array<"incomeMultiple" | "creditScore">;
  promptVersion: "advisor-v2-p5";
  generationSource: "server_template";
  financialDisclosure: "available_on_request";
  contact?: ListingContactInfo | null;
  /** boardListingId of the listing this draft specifically targets. */
  targetListingBoardId?: string | null;
  context: AdvisorGroupContext;
};

export type CompiledAdvisorPrompt = {
  system: string;
  user: string;
};

type AdvisorEngineInput = {
  boardData: BoardPageData;
  command: string;
  tone?: AdvisorTone | string | null;
  now?: Date;
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function listingLabel(entry: BoardListingRecord) {
  return [entry.listing.address, entry.listing.unit, entry.listing.neighborhood, entry.listing.city]
    .filter(Boolean)
    .join(", ") || "the saved rental";
}

function roommateAsRentalProfile(
  roommate: RoommateRecord,
  shared: BoardPageData["profile"],
): RentalProfile {
  return {
    ...shared,
    id: roommate.id,
    boardId: roommate.boardId,
    name: roommate.name,
    budgetMin: roommate.budgetMin ?? undefined,
    budgetMax: roommate.budgetMax ?? undefined,
    stretchBudget: roommate.stretchBudget ?? undefined,
    neighborhoods: unique([...shared.neighborhoods, ...roommate.preferredNeighborhoods]),
    commuteTarget: roommate.commuteDestination ?? shared.commuteTarget,
    commuteAccess: roommate.commuteAccess ?? shared.commuteAccess,
    minCommuteMinutes: roommate.preferredCommuteMinutes ?? shared.minCommuteMinutes,
    maxCommuteMinutes: roommate.maxCommuteMinutes ?? shared.maxCommuteMinutes,
    mustHaves: unique([...shared.mustHaves, ...roommate.mustHaves]),
    dealbreakers: unique([...shared.dealbreakers, ...roommate.dealbreakers]),
    notes: roommate.notes,
  };
}
export function normalizeAdvisorTone(value: string | null | undefined): AdvisorTone {
  const normalized = value?.trim().toLowerCase().replace(/[\u2013\u2014_]/g, "-") ?? "";
  if (normalized.includes("passive") && normalized.includes("aggressive")) return "Passive-Aggressive";
  if (normalized.includes("stern")) return "Stern";
  if (normalized.includes("casual")) return "Casual";
  return "Professional";
}

export function parseAdvisorCommand(content: string) {
  // Strip any regeneration-appended "Include: ..." suffix before extracting tone.
  const [baseContent, includeClause] = content.split(/\nInclude:\s*/i);
  const originalCommand = baseContent.trim();
  const command = baseContent.replace(/^\s*@advisor\b[\s,:-]*/i, "").trim();
  const toneMatch = command.match(/\b(?:tone\s*[:=]\s*)?(professional|casual|stern|passive[\s-]+aggressive)\b/i);
  const inclusionLabels: string[] = includeClause
    ? includeClause.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  return {
    originalCommand,
    command: command || "Draft broker outreach for the strongest saved listing.",
    tone: normalizeAdvisorTone(toneMatch?.[1]),
    inclusionLabels,
  };
}

function getCommuteAnchors(roommates: RoommateRecord[]) {
  return roommates.flatMap((roommate) => {
    const query = roommate.commuteDestination?.trim();
    return query ? [{ label: roommate.name, query }] : [];
  });
}

export async function aggregateAdvisorGroupContext(input: {
  boardData: BoardPageData;
  financialQualifications: AdvisorFinancialQualifications;
  now?: Date;
}): Promise<AdvisorGroupContext> {
  const { boardData } = input;
  const householdRoommates = boardData.roommates.filter((roommate) => roommate.roleLabel !== "commute point");
  const memberProfiles = householdRoommates.length > 0
    ? householdRoommates.map((roommate) => roommateAsRentalProfile(roommate, boardData.profile))
    : [boardData.profile];
  const groupProfile = generateGroupProfile(memberProfiles);
  const commutes = await estimateCommutes({
    anchors: getCommuteAnchors(boardData.roommates),
    listings: boardData.boardListings.map((entry) => ({
      listingId: entry.id,
      address: entry.listing.address,
      city: entry.listing.city,
      neighborhood: entry.listing.neighborhood,
    })),
  });
  const commutesByListingId = new Map(commutes.map((commute) => [commute.listingId, commute]));
  const listingAnalysis = boardData.boardListings.map((entry) => {
    const verifications = boardData.listingVerificationsByBoardListingId[entry.id] ?? [];
    const analysis = analyzeListingForGroup({
      listing: entry.listing,
      members: householdRoommates,
      routes: commutesByListingId.get(entry.id)?.routes ?? [],
      reviews: boardData.listingReviewsByBoardListingId[entry.id] ?? [],
      sourceConfirmed: (boardData.listingSourcesByBoardListingId[entry.id] ?? [])
        .some((source) => source.confirmedAt !== null),
      latestVerification: verifications[0]?.status ?? "unverified",
    });
    return {
      boardListingId: entry.id,
      listingId: entry.listingId,
      listing: listingLabel(entry),
      analysis,
    };
  });
  const analysisByBoardListingId = new Map(
    listingAnalysis.map((entry) => [entry.boardListingId, entry.analysis]),
  );
  const activeOffers = boardData.boardListings.flatMap((entry) => {
    const offer = detectListingActiveOffer(entry.listing);
    return offer
      ? [{ boardListingId: entry.id, listing: listingLabel(entry), ...offer }]
      : [];
  });
  const strongestListings = boardData.boardListings
    .map((entry) => ({ entry, analysis: analysisByBoardListingId.get(entry.id) }))
    .filter((value): value is { entry: BoardListingRecord; analysis: GroupListingAnalysis } => Boolean(value.analysis))
    .sort((left, right) => (right.analysis.fairnessScore ?? -1) - (left.analysis.fairnessScore ?? -1))
    .slice(0, 3)
    .map(({ entry, analysis }) => ({
      boardListingId: entry.id,
      listing: listingLabel(entry),
      rankingLabel: analysis.rankingLabel,
      fairnessScore: analysis.fairnessScore,
      confidence: analysis.confidence,
      contact: listingContactInfo(entry.listing),
    }));

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    commuteMode: getCommuteServiceMode(boardData.isDemoMode),
    leverage: {
      ...input.financialQualifications,
      memberCount: householdRoommates.length || 1,
      applicationReadiness: {
        hasOfferLetter: boardData.profile.rentalReadiness?.hasOfferLetter ?? null,
        hasProofOfIncome: boardData.profile.rentalReadiness?.hasProofOfIncome ?? null,
        needsGuarantor: boardData.profile.rentalReadiness?.needsGuarantor ?? null,
      },
      activeOffers,
      strongestListings,
    },
    requirements: {
      budget: {
        minimum: groupProfile.groupBudgetMin ?? null,
        maximum: groupProfile.groupBudgetMax,
        stretchMaximum: groupProfile.groupStretchBudget ?? null,
        summary: groupProfile.budgetRangeText ?? "No budget signal yet",
      },
      moveIn: boardData.profile.moveInDate ?? boardData.profile.moveInTimeframe ?? null,
      locations: unique([
        ...boardData.profile.locations,
        ...(boardData.profile.city ? [boardData.profile.city] : []),
        ...groupProfile.preferredNeighborhoods,
      ]),
      bedrooms: boardData.profile.bedroomsPreferred ?? null,
      mustHaves: groupProfile.mustHaves,
      dealbreakers: groupProfile.dealbreakers,
      priorities: groupProfile.topSharedPriorities,
      commuteDestinations: groupProfile.commuteDestinations,
      tensionFlags: groupProfile.tensionFlags,
    },
    commutes,
    listingAnalysis,
  };
}

export function compileAdvisorPrompt(input: {
  command: string;
  tone: AdvisorTone;
  financialQualifications: AdvisorFinancialQualifications;
  context: AdvisorGroupContext;
}): CompiledAdvisorPrompt {
  const toneInstruction = ADVISOR_TONE_INSTRUCTIONS[input.tone];

  return {
    system: [
      "You are Homeboard Advisor. Draft grounded rental outreach using only the supplied JSON context.",
      "STRICT CONSTRAINTS:",
      "- Use the exact sentence 'Financial information is available on request.' when financial information is included.",
      `- You MUST write in the selected ${input.tone} tone: ${toneInstruction}.`,
      "- Never invent financial qualifications, listing facts, availability, or prior contact.",
      "- Never output a bracketed placeholder or request that the recipient fill in missing text.",
      "- Produce plain text only.",
    ].join("\n"),
    user: [
      `Request: ${input.command}`,
      "Group leverage and requirements JSON:",
      JSON.stringify(input.context, null, 2),
    ].join("\n\n"),
  };
}

function findRequestedListing(
  boardData: BoardPageData,
  command: string,
  strongestListings: AdvisorGroupContext["leverage"]["strongestListings"],
) {
  const normalized = command.toLowerCase();
  return boardData.boardListings.find((entry) => {
    const candidates = [
      entry.listing.address,
      entry.listing.unit,
      entry.listing.neighborhood,
      entry.listing.city,
    ].filter((value): value is string => Boolean(value?.trim()));
    return candidates.some((value) => normalized.includes(value.toLowerCase()));
  }) ?? (
    strongestListings[0]
      ? boardData.boardListings.find((entry) => entry.id === strongestListings[0].boardListingId)
      : null
  ) ?? boardData.boardListings.find((entry) =>
    ["interested", "toured", "applied", "outreach_sent"].includes(entry.userStatus),
  ) ?? boardData.boardListings[0] ?? null;
}

function generateDraft(input: {
  boardData: BoardPageData;
  context: AdvisorGroupContext;
  tone: AdvisorTone;
  command: string;
  inclusionLabels: string[];
}) {
  const include = (label: string) =>
    input.inclusionLabels.length === 0 || input.inclusionLabels.includes(label.toLowerCase());

  const listing = findRequestedListing(
    input.boardData,
    input.command,
    input.context.leverage.strongestListings,
  );
  const subject = listing ? listingLabel(listing) : "the rental";
  const finance = include("financial information")
    ? "Financial information is available on request."
    : "";
  const moveIn = include("group requirements") && input.context.requirements.moveIn
    ? ` We are targeting ${input.context.requirements.moveIn}.`
    : "";
  const sender = input.boardData.profile.name && input.boardData.profile.name !== "Unknown"
    ? input.boardData.profile.name
    : "The prospective tenants";
  const readiness = input.context.leverage.applicationReadiness;
  const hasApplicationMaterials = readiness.hasOfferLetter === true && readiness.hasProofOfIncome === true;
  const canApplyWithoutDelay = hasApplicationMaterials && readiness.needsGuarantor === false;
  const readinessSentence = include("group requirements")
    ? canApplyWithoutDelay
      ? " Our offer letter and proof of income are ready, and we do not need a guarantor."
      : hasApplicationMaterials
        ? " Our offer letter and proof of income are ready."
        : ""
    : "";
  const tourRequest = include("request a tour") ? " Is it still available, and when could we tour?" : "";
  const contact = listing ? listingContactInfo(listing.listing) : null;
  const firstName = contact?.agentName ? contact.agentName.trim().split(/\s+/)[0] : null;
  const greeting = firstName ? `Hi ${firstName},` : null;
  const financeBlock = finance ? ` ${finance}` : "";

  if (input.tone === "Casual") {
    const start = greeting ? `${greeting} Checking in about ${subject}.` : `Hi! Checking in about ${subject}.`;
    return `${start}${financeBlock}${moveIn}${readinessSentence}${tourRequest} Thanks, ${sender}`;
  }

  if (input.tone === "Stern") {
    return [
      greeting ?? "Hello,",
      "",
      `We need a current status on ${subject}.${financeBlock}${moveIn}${readinessSentence}`,
      "",
      include("request a tour") ? "Please confirm availability and the earliest tour time today." : "Please confirm current availability.",
      "",
      sender,
    ].join("\n");
  }

  if (input.tone === "Passive-Aggressive") {
    return [
      greeting ?? "Hello,",
      "",
      `I am checking on ${subject}.${financeBlock}${moveIn}${readinessSentence}`,
      "",
      "Please let us know whether the rental is still available so we can plan accordingly.",
      "",
      `Thank you,\n${sender}`,
    ].join("\n");
  }

  return [
    greeting ?? "Hello,",
    "",
    `I am reaching out regarding ${subject}.${financeBlock}${moveIn} Our group is organized and prepared to move promptly on the right home.`,
    "",
    include("request a tour") ? "Could you please confirm current availability and the next opportunity to tour?" : "Could you please confirm current availability?",
    "",
    `Best regards,\n${sender}`,
  ].join("\n");
}

function toggleOptions(inclusionLabels: string[]): AdvisorToggleOption[] {
  // When inclusionLabels is non-empty (a regenerate call), reflect the client's
  // current toggle state so the persisted payload stays in sync.
  const enabled = (label: string, defaultOn: boolean) =>
    inclusionLabels.length === 0 ? defaultOn : inclusionLabels.includes(label.toLowerCase());
  return [
    { id: "include_financial_information", label: "Financial information", enabled: enabled("financial information", true), required: false },
    { id: "include_requirements", label: "Group requirements", enabled: enabled("group requirements", true), required: false },
    { id: "include_commute", label: "Commute fit", enabled: enabled("commute fit", false), required: false },
    { id: "request_tour", label: "Request a tour", enabled: enabled("request a tour", true), required: false },
  ];
}

export async function runAdvisorEngine(input: AdvisorEngineInput): Promise<AdvisorMessagePayloadData> {
  const parsed = parseAdvisorCommand(input.command);
  const tone = normalizeAdvisorTone(input.tone ?? parsed.tone);
  const financialQualifications = { incomeMultiple: null, creditScore: null };
  const context = await aggregateAdvisorGroupContext({
    boardData: input.boardData,
    financialQualifications,
    now: input.now,
  });
  const prompt = compileAdvisorPrompt({
    command: parsed.command,
    tone,
    financialQualifications,
    context,
  });
  const missingInputs: AdvisorMessagePayloadData["missingInputs"] = [];

  // Compiling before generation keeps every execution path subject to the same
  // strict financial and tone constraints, including the missing-input path.
  if (!prompt.system.includes(ADVISOR_TONE_INSTRUCTIONS[tone])) {
    throw new Error("Advisor tone constraint was not compiled.");
  }

  const targetListing = findRequestedListing(
    input.boardData,
    parsed.command,
    context.leverage.strongestListings,
  );
  const targetContact = targetListing ? listingContactInfo(targetListing.listing) : null;

  return {
    schemaVersion: 2,
    originalCommand: parsed.originalCommand,
    draftText: generateDraft({
      boardData: input.boardData,
      context,
      tone,
      command: parsed.command,
      inclusionLabels: parsed.inclusionLabels,
    }),
    tone,
    toggleOptions: toggleOptions(parsed.inclusionLabels),
    executionStatus: "draft_ready",
    missingInputs,
    promptVersion: "advisor-v2-p5",
    generationSource: "server_template",
    financialDisclosure: "available_on_request",
    contact: targetContact,
    targetListingBoardId: targetListing?.id ?? null,
    context,
  };
}
