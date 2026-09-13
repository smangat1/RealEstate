import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/analytics";
import { monitorBoardListings } from "@/lib/listing-monitor";

export async function runBoardScoutScan(boardId: string): Promise<{
  listingsChecked: number;
  listingsSkipped: number;
  changesDetected: number;
  newLeadsDiscovered: number;
}> {
  const board = await prisma.searchBoard.findUnique({ where: { id: boardId }, select: { id: true } });

  if (!board) throw new Error("ADVISOR_BOARD_NOT_FOUND");
  const listings = await monitorBoardListings(boardId);
  const changesDetected = listings.reduce((sum, item) => sum + item.changes, 0);
  if (changesDetected > 0) await trackEvent("advisor_listing_changes_detected", { boardId, changesDetected });

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

  return {
    listingsChecked: listings.filter((item) => item.checked).length,
    listingsSkipped: listings.filter((item) => !item.checked).length,
    changesDetected,
    newLeadsDiscovered,
  };
}
