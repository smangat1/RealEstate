import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma, type ListingStatus } from "@prisma/client";

import { runAdvisorEngine } from "@/lib/advisor-engine";
import {
  ADVISOR_GHOST_WINDOW_MS,
  detectListingChanges,
  findBoardCompFlags,
  followUpFinancialDisclosure,
  isFreshListingObservation,
  isGhostedOutreach,
  isListingUnavailable,
  type WatchedListingState,
} from "@/lib/advisor-proactive-logic";
import { notifyBoardMembers, type BoardPushType } from "@/lib/apns";
import { getBoardPageData } from "@/lib/board-data";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

function stateFingerprint(state: WatchedListingState) {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function hourlyObservationSlot(now: Date) {
  return new Date(Math.floor(now.getTime() / (60 * 60 * 1_000)) * 60 * 60 * 1_000);
}

function jsonValue(value: string | number | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value;
}

function listingLabel(listing: { address: string | null; unit: string | null; neighborhood: string | null }) {
  const address = listing.address?.trim() || "Saved rental";
  const unit = listing.unit?.trim();
  const neighborhood = listing.neighborhood?.trim();
  return [address, unit ? `Unit ${unit}` : null, neighborhood].filter(Boolean).join(" · ");
}

function contactFromProviderData(providerData: Prisma.JsonValue | null) {
  if (!providerData || typeof providerData !== "object" || Array.isArray(providerData)) return null;
  const raw = (providerData as Record<string, unknown>).homeboardContactInfo;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const clean = (key: string) => typeof data[key] === "string" && data[key].trim()
    ? data[key].trim()
    : null;
  const contact = {
    agentName: clean("agentName"),
    agentPhone: clean("agentPhone"),
    agentEmail: clean("agentEmail"),
    brokerage: clean("brokerage"),
  };
  return Object.values(contact).some(Boolean) ? contact : null;
}

function currentListingState(listing: {
  price: number | null;
  fees: string | null;
  availableDate: Date | null;
  status: ListingStatus;
  providerStatus: string | null;
}): WatchedListingState {
  return {
    price: listing.price,
    fees: listing.fees,
    availableDate: listing.availableDate?.toISOString() ?? null,
    listingStatus: listing.status,
    providerStatus: listing.providerStatus,
  };
}

function snapshotState(snapshot: {
  price: number | null;
  fees: Prisma.JsonValue;
  availableDate: Date | null;
  listingStatus: ListingStatus;
  providerStatus: string | null;
}): WatchedListingState {
  const fees = snapshot.fees && typeof snapshot.fees === "object" && !Array.isArray(snapshot.fees)
    ? (snapshot.fees as Record<string, unknown>).raw
    : null;
  return {
    price: snapshot.price,
    fees: typeof fees === "string" ? fees : null,
    availableDate: snapshot.availableDate?.toISOString() ?? null,
    listingStatus: snapshot.listingStatus,
    providerStatus: snapshot.providerStatus,
  };
}

function snapshotFreshness(snapshot: { sourceFacts: Prisma.JsonValue }) {
  if (!snapshot.sourceFacts || typeof snapshot.sourceFacts !== "object" || Array.isArray(snapshot.sourceFacts)) {
    return { providerFetchedAt: null, providerLastSeenAt: null };
  }
  const facts = snapshot.sourceFacts as Record<string, unknown>;
  return {
    providerFetchedAt: typeof facts.providerFetchedAt === "string" ? facts.providerFetchedAt : null,
    providerLastSeenAt: typeof facts.providerLastSeenAt === "string" ? facts.providerLastSeenAt : null,
  };
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function deliverPush(input: {
  boardId: string;
  boardListingId?: string;
  type: BoardPushType;
  title: string;
  body: string;
  collapseId: string;
}) {
  try {
    await notifyBoardMembers(input);
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "push",
      operation: `advisor_${input.type}`,
      severity: "error",
    });
  }
}

async function createPlainAction(input: {
  boardId: string;
  boardListingId: string;
  kind: "listing_change" | "negotiation_comp";
  priority: "medium" | "high";
  title: string;
  summary: string;
  whyItMatters: string;
  facts: Prisma.InputJsonObject;
  sourceUrl: string | null;
  fingerprint: string;
  pushType: "listing_change" | "negotiation_comp";
}) {
  try {
    await prisma.$transaction([
      prisma.advisorAction.create({
        data: {
          boardId: input.boardId,
          boardListingId: input.boardListingId,
          kind: input.kind,
          priority: input.priority,
          title: input.title,
          summary: input.summary,
          whyItMatters: input.whyItMatters,
          facts: input.facts,
          sourceLinks: input.sourceUrl ? [input.sourceUrl] : [],
          primaryAction: { type: "open_listing", boardListingId: input.boardListingId },
          secondaryActions: [],
          fingerprint: input.fingerprint,
        },
      }),
      prisma.chatMessage.create({
        data: {
          boardId: input.boardId,
          role: "assistant",
          authorName: "Advisor",
          content: input.summary,
        },
      }),
      prisma.boardEvent.create({
        data: {
          boardId: input.boardId,
          actorType: "assistant",
          actorName: "Advisor",
          eventType: input.kind,
          content: input.summary,
        },
      }),
      prisma.searchBoard.update({ where: { id: input.boardId }, data: { updatedAt: new Date() } }),
    ]);
  } catch (error) {
    if (isUniqueConflict(error)) return false;
    throw error;
  }

  await deliverPush({
    boardId: input.boardId,
    boardListingId: input.boardListingId,
    type: input.pushType,
    title: input.title,
    body: input.summary,
    collapseId: input.fingerprint,
  });
  return true;
}

async function createFollowUpAction(input: {
  boardId: string;
  ownerUserId: string;
  outreach: {
    id: string;
    boardListingId: string;
    advisorMessageId: string | null;
    boardListing: {
      listing: {
        address: string | null;
        unit: string | null;
        neighborhood: string | null;
        providerData: Prisma.JsonValue | null;
      };
    };
  };
  now: Date;
}) {
  const boardData = await getBoardPageData(input.boardId, input.ownerUserId, {
    includeSuggestedListings: false,
    includeCommutes: false,
  });
  if (!boardData) return false;
  const priorMessage = input.outreach.advisorMessageId
    ? await prisma.chatMessage.findFirst({
        where: { id: input.outreach.advisorMessageId, boardId: input.boardId },
        include: { advisorPayload: true },
      })
    : null;
  const priorPayload = priorMessage?.advisorPayload?.payload
    && typeof priorMessage.advisorPayload.payload === "object"
    && !Array.isArray(priorMessage.advisorPayload.payload)
    ? priorMessage.advisorPayload.payload as Record<string, unknown>
    : null;
  const financialDisclosure = followUpFinancialDisclosure(priorPayload?.financialDisclosure);
  const includeFinancialInformation = financialDisclosure !== "omit";
  const label = listingLabel(input.outreach.boardListing.listing);
  const command = `@advisor draft a follow-up about ${label}\nInclude: ${includeFinancialInformation ? "Financial information" : "nothing"}`;
  const generated = await runAdvisorEngine({ boardData, command, tone: "Professional", now: input.now });
  const contact = contactFromProviderData(input.outreach.boardListing.listing.providerData);
  const greeting = contact?.agentName?.split(/\s+/)[0];
  const sender = boardData.profile.name && boardData.profile.name !== "Unknown"
    ? boardData.profile.name
    : "The prospective tenants";
  const followUpFacts = includeFinancialInformation
    ? "Financial information is available on request."
    : "";
  const draftText = [
    greeting ? `Hi ${greeting},` : "Hello,",
    "",
    `I’m following up on my earlier message regarding ${label}. We’d appreciate an update on current availability and next steps. ${followUpFacts}`.trim(),
    "",
    `Best regards,\n${sender}`,
  ].join("\n");
  const messageId = randomUUID();
  const fingerprint = `follow-up:${input.outreach.id}`;
  const payload = {
    ...generated,
    messageId,
    originalCommand: command,
    draftText,
    tone: "Professional" as const,
    toggleOptions: generated.toggleOptions.map((option) => ({
      ...option,
      enabled: option.id === "include_financial_information" && includeFinancialInformation,
    })),
    generationSource: "server_template" as const,
    financialDisclosure,
    contact,
    targetListingBoardId: input.outreach.boardListingId,
  };
  const summary = `Follow-up draft ready for ${label}. No reply is logged three days after the verified send. If they replied elsewhere, log it before using this draft.`;

  try {
    await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.brokerOutreachRecord.updateMany({
        where: { id: input.outreach.id, lastFollowUpAt: null, answeredAt: null, status: "sent" },
        data: { lastFollowUpAt: input.now, staleAt: input.now },
      });
      if (claimed.count === 0) throw new Error("ADVISOR_FOLLOW_UP_ALREADY_CLAIMED");
      await transaction.advisorAction.create({
        data: {
          boardId: input.boardId,
          boardListingId: input.outreach.boardListingId,
          kind: "follow_up_draft",
          priority: "high",
          title: "Follow-up draft ready",
          summary,
          whyItMatters: "A timely follow-up can recover a promising listing without sending anything automatically.",
          facts: { outreachId: input.outreach.id, daysSinceVerifiedSend: 3, replyTracking: "manual" },
          sourceLinks: [],
          primaryAction: { type: "open_advisor_draft", messageId },
          secondaryActions: [{ type: "dismiss" }],
          fingerprint,
        },
      });
      await transaction.chatMessage.create({
        data: {
          id: messageId,
          boardId: input.boardId,
          role: "assistant",
          authorName: "Advisor",
          content: draftText,
          advisorPayload: { create: { payload: payload as unknown as Prisma.InputJsonValue } },
        },
      });
      await transaction.boardEvent.create({
        data: {
          boardId: input.boardId,
          actorType: "assistant",
          actorName: "Advisor",
          eventType: "follow_up_draft",
          content: summary,
        },
      });
      await transaction.searchBoard.update({
        where: { id: input.boardId },
        data: { updatedAt: input.now },
      });
    });
  } catch (error) {
    if (isUniqueConflict(error) || (error instanceof Error && error.message === "ADVISOR_FOLLOW_UP_ALREADY_CLAIMED")) {
      return false;
    }
    throw error;
  }

  await deliverPush({
    boardId: input.boardId,
    boardListingId: input.outreach.boardListingId,
    type: "advisor_follow_up",
    title: "Advisor follow-up ready",
    body: summary,
    collapseId: fingerprint,
  });
  return true;
}

export type AdvisorProactiveRunResult = {
  baselinesCreated: number;
  listingChangeMessages: number;
  followUpDrafts: number;
  negotiationFlags: number;
};

export async function runAdvisorProactiveBoard(
  boardId: string,
  now = new Date(),
): Promise<AdvisorProactiveRunResult> {
  const board = await prisma.searchBoard.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      userId: true,
      boardListings: {
        where: { deletedAt: null, userStatus: { not: "rejected" } },
        include: { listing: true },
      },
    },
  });
  if (!board) return { baselinesCreated: 0, listingChangeMessages: 0, followUpDrafts: 0, negotiationFlags: 0 };

  let baselinesCreated = 0;
  let listingChangeMessages = 0;
  let followUpDrafts = 0;
  let negotiationFlags = 0;
  const observedAt = hourlyObservationSlot(now);

  for (const boardListing of board.boardListings) {
    const current = currentListingState(boardListing.listing);
    const fingerprint = stateFingerprint(current);
    const previousSnapshot = await prisma.listingSnapshot.findFirst({
      where: { boardListingId: boardListing.id },
      orderBy: { observedAt: "desc" },
    });
    const currentFreshness = {
      providerFetchedAt: boardListing.listing.providerFetchedAt?.toISOString() ?? null,
      providerLastSeenAt: boardListing.listing.providerLastSeenAt?.toISOString() ?? null,
    };
    if (!isFreshListingObservation({
      current: currentFreshness,
      previous: previousSnapshot ? snapshotFreshness(previousSnapshot) : null,
      now,
    })) continue;
    if (previousSnapshot?.fingerprint === fingerprint) continue;

    let snapshot;
    try {
      snapshot = await prisma.listingSnapshot.create({
        data: {
          boardListingId: boardListing.id,
          sourceUrl: boardListing.listing.sourceUrl,
          price: current.price,
          fees: { raw: current.fees },
          availableDate: boardListing.listing.availableDate,
          listingStatus: boardListing.listing.status,
          providerStatus: current.providerStatus,
          sourceFacts: currentFreshness,
          fingerprint,
          observedAt,
        },
      });
    } catch (error) {
      if (isUniqueConflict(error)) continue;
      throw error;
    }
    if (!previousSnapshot) {
      baselinesCreated += 1;
      continue;
    }

    const changes = detectListingChanges(snapshotState(previousSnapshot), current);
    if (changes.length === 0) continue;
    await prisma.listingChange.createMany({
      data: changes.map((change) => ({
        boardListingId: boardListing.id,
        snapshotId: snapshot.id,
        kind: change.kind,
        field: change.field,
        beforeValue: jsonValue(change.beforeValue),
        afterValue: jsonValue(change.afterValue),
        explanation: change.explanation,
        whyItMatters: change.whyItMatters,
        sourceUrl: boardListing.listing.sourceUrl,
        detectedAt: now,
      })),
      skipDuplicates: true,
    });
    const label = listingLabel(boardListing.listing);
    const offMarket = isListingUnavailable(current);
    const priceChange = changes.find((change) => change.kind === "price");
    const summary = offMarket
      ? `Listing watch: ${label} now appears off market or unavailable. Verify before sending more information or money.`
      : priceChange
        ? `Listing watch: ${label}. ${priceChange.explanation}`
        : `Listing watch: ${label}. ${changes.map((change) => change.explanation).join(" ")}`;
    const created = await createPlainAction({
      boardId,
      boardListingId: boardListing.id,
      kind: "listing_change",
      priority: offMarket ? "high" : "medium",
      title: offMarket ? "Listing may be off market" : "Listing changed",
      summary,
      whyItMatters: changes.map((change) => change.whyItMatters).join(" "),
      facts: {
        snapshotId: snapshot.id,
        changes: changes.map((change) => ({
          kind: change.kind,
          field: change.field,
          beforeValue: change.beforeValue,
          afterValue: change.afterValue,
        })),
      },
      sourceUrl: boardListing.listing.sourceUrl,
      fingerprint: `listing-change:${snapshot.id}`,
      pushType: "listing_change",
    });
    if (created) listingChangeMessages += 1;
  }

  const ghosted = await prisma.brokerOutreachRecord.findMany({
    where: {
      boardListing: { boardId },
      status: "sent",
      answeredAt: null,
      lastFollowUpAt: null,
      sentAt: { lte: new Date(now.getTime() - ADVISOR_GHOST_WINDOW_MS) },
    },
    include: { boardListing: { include: { listing: true } } },
    orderBy: { sentAt: "asc" },
    take: 20,
  });
  for (const outreach of ghosted) {
    if (!isGhostedOutreach(outreach, now)) continue;
    if (await createFollowUpAction({ boardId, ownerUserId: board.userId, outreach, now })) {
      followUpDrafts += 1;
    }
  }

  const compFlags = findBoardCompFlags(board.boardListings.map((entry) => ({
    id: entry.id,
    label: listingLabel(entry.listing),
    price: entry.listing.price,
    bedrooms: entry.listing.bedrooms,
    neighborhood: entry.listing.neighborhood,
    city: entry.listing.city,
    listingStatus: entry.listing.status,
    userStatus: entry.userStatus,
  })));
  for (const flag of compFlags) {
    const fingerprint = createHash("sha256").update(JSON.stringify({
      target: flag.boardListingId,
      averagePrice: flag.averagePrice,
      comparableIds: flag.comparableIds,
      prices: board.boardListings
        .filter((listing) => flag.comparableIds.includes(listing.id) || listing.id === flag.boardListingId)
        .map((listing) => [listing.id, listing.listing.price]),
    })).digest("hex");
    const summary = `Negotiation flag: ${flag.label}. ${flag.comparableCount} similar homes on this board average $${flag.averagePrice.toLocaleString()}, which is $${flag.difference.toLocaleString()} lower. Ask whether the rent or fees are flexible.`;
    const created = await createPlainAction({
      boardId,
      boardListingId: flag.boardListingId,
      kind: "negotiation_comp",
      priority: "medium",
      title: "Board comps suggest negotiation room",
      summary,
      whyItMatters: "This uses only comparable homes the group has already saved, so it is a negotiation signal rather than a market-wide appraisal.",
      facts: {
        comparableCount: flag.comparableCount,
        averagePrice: flag.averagePrice,
        difference: flag.difference,
        comparableBoardListingIds: flag.comparableIds,
      },
      sourceUrl: null,
      fingerprint: `negotiation-comp:${fingerprint}`,
      pushType: "negotiation_comp",
    });
    if (created) negotiationFlags += 1;
  }

  return { baselinesCreated, listingChangeMessages, followUpDrafts, negotiationFlags };
}
