import { NextResponse } from "next/server";

import { createArchiveSuggestions, markStaleInquiriesAndCreateFollowUps } from "@/lib/advisor-service";
import { monitorBoardListings } from "@/lib/listing-monitor";
import { prisma } from "@/lib/prisma";

/** Scheduled, server-authoritative monitoring for every board with an active saved listing. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Advisor monitoring is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const boards = await prisma.searchBoard.findMany({
    where: {
      boardListings: {
        some: {
          deletedAt: null,
          userStatus: { not: "rejected" },
          listing: { status: { notIn: ["removed", "rented"] } },
        },
      },
    },
    select: { id: true },
    take: 500,
  });
  const results = [];
  for (const board of boards) {
    try {
      const listings = await monitorBoardListings(board.id);
      const followUpsCreated = await markStaleInquiriesAndCreateFollowUps(board.id);
      const archiveSuggestions = await createArchiveSuggestions(board.id);
      results.push({
        boardId: board.id,
        checked: listings.filter((item) => item.checked).length,
        skipped: listings.filter((item) => !item.checked).length,
        changes: listings.reduce((sum, item) => sum + item.changes, 0),
        followUpsCreated,
        archiveSuggestions: archiveSuggestions.length,
      });
    } catch (error) {
      results.push({
        boardId: board.id,
        checked: 0,
        skipped: 0,
        changes: 0,
        followUpsCreated: 0,
        archiveSuggestions: 0,
        error: error instanceof Error ? error.message : "ADVISOR_MONITOR_FAILED",
      });
    }
  }
  return NextResponse.json({
    ran: results.length,
    durationMs: Date.now() - startedAt,
    boards: results,
  });
}
