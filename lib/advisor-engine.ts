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
  RentalProfile,
  RoommateRecord,
} from "@/lib/types";

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
    | "include_income_multiple"
    | "include_credit_score"
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
  schemaVersion: 1;
  draftText: string;
  tone: AdvisorTone;
  toggleOptions: AdvisorToggleOption[];
  executionStatus: "draft_ready" | "needs_input";
  missingInputs: Array<"incomeMultiple" | "creditScore">;
  promptVersion: "advisor-v2-p3";
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

function qualificationText(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function normalizeIncomeMultiple(value: string | number | null | undefined) {
  const text = qualificationText(value);
  if (!text) return null;
  const match = text.match(/(\d{1,3}(?:\.\d+)?)\s*x?/i);
  return match ? `${match[1]}x` : null;
}

function normalizeCreditScore(value: string | number | null | undefined) {
  const text = qualificationText(value);
  if (!text) return null;
  const scores = [...text.matchAll(/\b(\d{3})\b/g)]
    .map((match) => Number(match[1]))
    .filter((score) => score >= 300 && score <= 850);
  if (scores.length === 0) return null;
  return scores.length === 1
    ? String(scores[0])
    : `${Math.min(...scores)}-${Math.max(...scores)}`;
}

function profileFinancialQualifications(profile: RentalProfile): AdvisorFinancialQualifications {
  const structured = profile as RentalProfile & {
    financialQualifications?: Partial<AdvisorFinancialQualifications>;
    rentalQualifications?: Partial<AdvisorFinancialQualifications>;
    incomeMultiple?: string | number | null;
    creditScore?: string | number | null;
  };
  return {
    incomeMultiple: normalizeIncomeMultiple(
      structured.financialQualifications?.incomeMultiple
      ?? structured.rentalQualifications?.incomeMultiple
      ?? structured.incomeMultiple,
    ) ?? "40x",
    creditScore: normalizeCreditScore(
      structured.financialQualifications?.creditScore
      ?? structured.rentalQualifications?.creditScore
      ?? structured.creditScore,
    ) ?? "700+",
  };
}

export function extractAdvisorFinancialQualifications(
  text: string,
): AdvisorFinancialQualifications {
  const incomeMatch =
    text.match(/\b(?:income(?:\s+multiple)?|earnings?)\s*(?::|is|of|at|=)?\s*(\d{1,3}(?:\.\d+)?)\s*x\b/i)
    ?? text.match(/\b(\d{1,3}(?:\.\d+)?)\s*x\s*(?:the\s+)?(?:monthly\s+)?rent\b/i)
    ?? text.match(/\b(\d{1,3}(?:\.\d+)?)\s*x\b/i);
  const creditMatch =
    text.match(/\bcredit(?:\s+score)?s?\s*(?::|are|is|of|at|=)?\s*((?:\d{3})(?:\s*(?:-|\u2013|to|through|and)\s*\d{3})*)/i)
    ?? text.match(/\b((?:\d{3})(?:\s*(?:-|\u2013|to|through|and)\s*\d{3})*)\s+credit\b/i);

  return {
    incomeMultiple: normalizeIncomeMultiple(incomeMatch?.[1]),
    creditScore: normalizeCreditScore(creditMatch?.[1]),
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
  const command = content.replace(/^\s*@advisor\b[\s,:-]*/i, "").trim();
  const toneMatch = command.match(/\b(?:tone\s*[:=]\s*)?(professional|casual|stern|passive[\s-]+aggressive)\b/i);
  return {
    command: command || "Draft broker outreach for the strongest saved listing.",
    tone: normalizeAdvisorTone(toneMatch?.[1]),
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
  const incomeMultiple = input.financialQualifications.incomeMultiple ?? "MISSING - do not invent";
  const creditScore = input.financialQualifications.creditScore ?? "MISSING - do not invent";
  const toneInstruction = ADVISOR_TONE_INSTRUCTIONS[input.tone];

  return {
    system: [
      "You are Homeboard Advisor. Draft grounded rental outreach using only the supplied JSON context.",
      "STRICT CONSTRAINTS:",
      `- You MUST include the group's exact income multiple: ${incomeMultiple}.`,
      `- You MUST include the group's exact credit score: ${creditScore}.`,
      `- You MUST write in the selected ${input.tone} tone: ${toneInstruction}.`,
      "- Never invent financial qualifications, listing facts, availability, or prior contact.",
      "- If either required financial fact is marked MISSING, do not produce recipient-facing outreach; request the missing facts.",
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

function formatFinancialSentence(financials: Required<AdvisorFinancialQualifications>) {
  return `Our group income is ${financials.incomeMultiple} the monthly rent, and our group credit score is ${financials.creditScore}.`;
}

function generateDraft(input: {
  boardData: BoardPageData;
  context: AdvisorGroupContext;
  tone: AdvisorTone;
  financialQualifications: Required<AdvisorFinancialQualifications>;
  command: string;
}) {
  const listing = findRequestedListing(
    input.boardData,
    input.command,
    input.context.leverage.strongestListings,
  );
  const subject = listing ? listingLabel(listing) : "the rental";
  const finance = formatFinancialSentence(input.financialQualifications);
  const moveIn = input.context.requirements.moveIn
    ? ` We are targeting ${input.context.requirements.moveIn}.`
    : "";
  const sender = input.boardData.profile.name && input.boardData.profile.name !== "Unknown"
    ? input.boardData.profile.name
    : "The prospective tenants";
  const readiness = input.context.leverage.applicationReadiness;
  const hasApplicationMaterials = readiness.hasOfferLetter === true && readiness.hasProofOfIncome === true;
  const canApplyWithoutDelay = hasApplicationMaterials && readiness.needsGuarantor === false;
  const readinessSentence = canApplyWithoutDelay
    ? " Our offer letter and proof of income are ready, and we do not need a guarantor."
    : hasApplicationMaterials
      ? " Our offer letter and proof of income are ready."
      : "";

  if (input.tone === "Casual") {
    return `Hi! Checking in about ${subject}. ${finance}${moveIn}${readinessSentence} Is it still available, and when could we tour? Thanks, ${sender}`;
  }

  if (input.tone === "Stern") {
    return [
      "Hello,",
      "",
      `We need a current status on ${subject}. ${finance}${moveIn}${readinessSentence}`,
      "",
      "Please confirm availability and the earliest tour time today.",
      "",
      sender,
    ].join("\n");
  }

  if (input.tone === "Passive-Aggressive") {
    return [
      "Hello,",
      "",
      `I am checking on ${subject}. ${finance}${moveIn}${readinessSentence}`,
      "",
      "Please let us know whether the rental is still available so we can plan accordingly.",
      "",
      `Thank you,\n${sender}`,
    ].join("\n");
  }

  return [
    "Hello,",
    "",
    `I am reaching out regarding ${subject}. ${finance}${moveIn} Our group is organized and prepared to move promptly on the right home.`,
    "",
    "Could you please confirm current availability and the next opportunity to tour?",
    "",
    `Best regards,\n${sender}`,
  ].join("\n");
}

function toggleOptions(): AdvisorToggleOption[] {
  return [
    { id: "include_income_multiple", label: "Income multiple", enabled: true, required: false },
    { id: "include_credit_score", label: "Credit score", enabled: true, required: false },
    { id: "include_requirements", label: "Group requirements", enabled: true, required: false },
    { id: "include_commute", label: "Commute fit", enabled: false, required: false },
    { id: "request_tour", label: "Request a tour", enabled: true, required: false },
  ];
}

export async function runAdvisorEngine(input: AdvisorEngineInput): Promise<AdvisorMessagePayloadData> {
  const parsed = parseAdvisorCommand(input.command);
  const tone = normalizeAdvisorTone(input.tone ?? parsed.tone);
  const financialQualifications = profileFinancialQualifications(input.boardData.profile);
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
  if (!financialQualifications.incomeMultiple) missingInputs.push("incomeMultiple");
  if (!financialQualifications.creditScore) missingInputs.push("creditScore");

  // Compiling before generation keeps every execution path subject to the same
  // strict financial and tone constraints, including the missing-input path.
  if (!prompt.system.includes(ADVISOR_TONE_INSTRUCTIONS[tone])) {
    throw new Error("Advisor tone constraint was not compiled.");
  }

  return {
    schemaVersion: 1,
    draftText: missingInputs.length > 0
      ? `Advisor needs the group's ${missingInputs.map((field) => field === "incomeMultiple" ? "exact income multiple" : "exact credit score").join(" and ")} before preparing broker outreach.`
      : generateDraft({
          boardData: input.boardData,
          context,
          tone,
          financialQualifications: financialQualifications as Required<AdvisorFinancialQualifications>,
          command: parsed.command,
        }),
    tone,
    toggleOptions: toggleOptions(),
    executionStatus: missingInputs.length > 0 ? "needs_input" : "draft_ready",
    missingInputs,
    promptVersion: "advisor-v2-p3",
    context,
  };
}
