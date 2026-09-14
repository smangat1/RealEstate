import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

import { createArchiveSuggestions, markStaleInquiriesAndCreateFollowUps } from "@/lib/advisor-service";
import { monitorBoardListings } from "@/lib/listing-monitor";
import { prisma } from "@/lib/prisma";

const GITHUB_SCHEDULER_TOKEN_SHA256 = "915fdcc7f3bffd2b861c8da7b29f324695e8f332005fd1e075bd70ba1de2939f";

function sameSecret(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authorized(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!supplied) return false;
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (configuredSecret && sameSecret(supplied, configuredSecret)) return true;
  const suppliedDigest = createHash("sha256").update(supplied).digest("hex");
  return sameSecret(suppliedDigest, GITHUB_SCHEDULER_TOKEN_SHA256);
}

/** Scheduled, server-authoritative monitoring for every board with an active saved listing. */
export async function GET(request: Request) {
  if (!authorized(request)) {
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
