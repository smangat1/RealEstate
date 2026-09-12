import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/analytics";
import type { BrokerOutreachRecordType, ScoutRadarLeadRecord } from "@/lib/types";
import {
  detectPriceChange,
  detectPriceDrop,
  generateBrokerPitch,
} from "@/lib/scout-utils";

export { detectPriceDrop, generateBrokerPitch };
export type { PriceDropAlert, PriceIncreaseAlert, PriceChangeAlert } from "@/lib/scout-utils";

export async function runBoardScoutScan(boardId: string): Promise<{
  priceDropsDetected: number;
  priceIncreasesDetected: number;
  newLeadsDiscovered: number;
}> {
  const board = await (prisma as any).searchBoard.findUnique({
    where: { id: boardId },
    include: {
      searchProfile: true,
      roommates: true,
      boardListings: {
        where: { deletedAt: null },
        include: {
          listing: {
            include: {
              priceHistory: { orderBy: { observedAt: "desc" }, take: 2 },
            },
          },
        },
      },
    },
  });

  if (!board) return { priceDropsDetected: 0, newLeadsDiscovered: 0 };

  let priceDropsDetected = 0;
  let priceIncreasesDetected = 0;

  // 1. Check for price changes (drops AND increases) on active board listings
  for (const boardListing of board.boardListings) {
    const listing = boardListing.listing;
    const history = listing.priceHistory ?? [];
    if (history.length < 2 || !listing.price) continue;

    const latest = history[0].price;
    const previous = history[1].price;
    const change = detectPriceChange(previous, latest);
    if (!change) continue;

    const address = listing.address ?? "Saved listing";

    if (change.direction === "drop") {
      priceDropsDetected++;
      const dropFmt = `$${change.dropAmount.toLocaleString()}`;
      const newFmt = `$${change.newPrice.toLocaleString()}`;

      await (prisma as any).chatMessage.create({
        data: {
          boardId,
          role: "assistant",
          content: `📉 Price Drop: ${address} dropped by ${dropFmt} → now ${newFmt}/mo (-${change.percentDrop}%). Good time to reach out.`,
        },
      });

      // Ensure listing.price is synced so group analysis recalculates scores immediately
      await (prisma as any).listing.update({
        where: { id: listing.id },
        data: { price: change.newPrice },
      }).catch(() => null);

      await trackEvent("scout_price_drop_detected", {
        boardId,
        listingId: listing.id,
        oldPrice: change.oldPrice,
        newPrice: change.newPrice,
        dropAmount: change.dropAmount,
      });
    } else {
      // direction === "increase"
      priceIncreasesDetected++;
      const riseFmt = `$${change.increaseAmount.toLocaleString()}`;
      const newFmt = `$${change.newPrice.toLocaleString()}`;

      // Alert the group: their votes may now be based on a stale price
      await (prisma as any).chatMessage.create({
        data: {
          boardId,
          role: "assistant",
          content: `⚠️ Price Increase: ${address} went up by ${riseFmt} → now ${newFmt}/mo (+${change.percentIncrease}%). Group votes were cast at the old price; worth a quick check.`,
        },
      });

      // Ensure listing.price is synced so group analysis recalculates scores immediately
      await (prisma as any).listing.update({
        where: { id: listing.id },
        data: { price: change.newPrice },
      }).catch(() => null);

      // Flag the listing so the UI can surface a "price changed" badge
      await (prisma as any).boardListing.update({
        where: { id: boardListing.id },
        data: { workflowStatus: "price_changed" },
      }).catch(() => null); // graceful if workflowStatus enum doesn't include it yet

      await trackEvent("scout_price_increase_detected", {
        boardId,
        listingId: listing.id,
        oldPrice: change.oldPrice,
        newPrice: change.newPrice,
        increaseAmount: change.increaseAmount,
      });
    }
  }

  // 2. Lead Radar discovery: DISABLED pending live data source integration.
  //
  // The `Listing` table contains only user-imported listings that were manually
  // scraped via URL. These are stale, unverified, and may already be rented.
  // Surfacing them as "discovered leads" would be misleading.
  //
  // This step should be re-enabled once integrated with a live rental feed:
  //   - RentCast API (rentcast.io)
  //   - StreetEasy API (NYC-focused)
  //   - Zillow Bridge API or RapidAPI/Zillow scrapers
  //   - Any provider returning verified, currently-available listings
  //
  // The ScoutDiscoveredLead schema, API routes, and UI are all ready.
  // Just replace this comment block with real live-inventory queries.
  const newLeadsDiscovered = 0;

  return { priceDropsDetected, priceIncreasesDetected, newLeadsDiscovered };
}

export async function getScoutRadarLeads(boardId: string): Promise<ScoutRadarLeadRecord[]> {
  const leads = await (prisma as any).scoutDiscoveredLead.findMany({
    where: { boardId, status: "pending" },
    include: { listing: true },
    orderBy: { matchScore: "desc" },
    take: 6,
  });

  return leads.map((item: any) => ({
    id: item.id,
    boardId: item.boardId,
    listingId: item.listingId,
    matchScore: item.matchScore,
    matchReason: item.matchReason,
    status: item.status,
    discoveredAt: item.discoveredAt.toISOString(),
    listing: {
      ...item.listing,
      createdAt: item.listing.createdAt.toISOString(),
      updatedAt: item.listing.updatedAt.toISOString(),
    },
  }));
}

export async function promoteRadarLeadToShortlist(leadId: string, actorUserId: string): Promise<boolean> {
  const lead = await (prisma as any).scoutDiscoveredLead.findUnique({
    where: { id: leadId },
  });
  if (!lead) return false;

  // Add to board listings if not already there
  await (prisma as any).boardListing.upsert({
    where: {
      boardId_listingId: {
        boardId: lead.boardId,
        listingId: lead.listingId,
      },
    },
    create: {
      boardId: lead.boardId,
      listingId: lead.listingId,
      userStatus: "interested",
      workflowStatus: "shortlisted",
      userNotes: `Promoted from Scout Radar (Match: ${lead.matchScore}%)`,
    },
    update: {
      deletedAt: null,
      userStatus: "interested",
    },
  });

  // Mark radar lead as promoted
  await (prisma as any).scoutDiscoveredLead.update({
    where: { id: leadId },
    data: { status: "promoted" },
  });

  await trackEvent("scout_radar_lead_promoted", {
    boardId: lead.boardId,
    leadId,
    listingId: lead.listingId,
    promotedByUserId: actorUserId,
  });

  return true;
}

export async function dismissRadarLead(leadId: string, actorUserId: string): Promise<boolean> {
  const lead = await (prisma as any).scoutDiscoveredLead.findUnique({
    where: { id: leadId },
  });
  if (!lead) return false;

  await (prisma as any).scoutDiscoveredLead.update({
    where: { id: leadId },
    data: { status: "dismissed" },
  });

  await trackEvent("scout_radar_lead_dismissed", {
    boardId: lead.boardId,
    leadId,
    dismissedByUserId: actorUserId,
  });

  return true;
}

export async function recordBrokerOutreach(params: {
  boardListingId: string;
  userId: string;
  method?: "email" | "portal" | "phone";
  notes?: string;
}): Promise<BrokerOutreachRecordType> {
  const record = await (prisma as any).brokerOutreachRecord.create({
    data: {
      boardListingId: params.boardListingId,
      userId: params.userId,
      method: params.method ?? "email",
      notes: params.notes,
    },
    include: {
      user: { select: { displayName: true } },
    },
  });

  await trackEvent("broker_outreach_recorded", {
    boardListingId: params.boardListingId,
    userId: params.userId,
    method: params.method ?? "email",
  });

  return {
    id: record.id,
    boardListingId: record.boardListingId,
    userId: record.userId,
    userName: record.user?.displayName,
    contactedAt: record.contactedAt.toISOString(),
    method: record.method as "email" | "portal" | "phone",
    notes: record.notes,
  };
}

export async function getBrokerOutreachesForBoard(boardId: string): Promise<Record<string, BrokerOutreachRecordType[]>> {
  const records = await (prisma as any).brokerOutreachRecord.findMany({
    where: {
      boardListing: { boardId },
    },
    include: {
      user: { select: { displayName: true } },
    },
    orderBy: { contactedAt: "desc" },
  });

  const grouped: Record<string, BrokerOutreachRecordType[]> = {};
  for (const r of records) {
    if (!grouped[r.boardListingId]) grouped[r.boardListingId] = [];
    grouped[r.boardListingId].push({
      id: r.id,
      boardListingId: r.boardListingId,
      userId: r.userId,
      userName: r.user?.displayName,
      contactedAt: r.contactedAt.toISOString(),
      method: r.method,
      notes: r.notes,
    });
  }
  return grouped;
}
