import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runBoardScoutScan } from "@/lib/scout-engine";

/**
 * GET /api/cron/scout-scan
 *
 * Called by Vercel Cron (or any external scheduler) twice per day.
 * Finds every board with an active Scout subscription and runs the scan:
 *   1. Price drop detection across all active shortlisted listings
 *   2. Lead radar discovery — up to 3 new matching leads per board per run
 *
 * Authentication: Bearer token checked against CRON_SECRET env var.
 * In Vercel production the Authorization header is set automatically by the cron runtime.
 */
export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();

  // ── Find all boards with an active Scout subscription ───────────────────
  const activeSubscriptions = await (prisma as any).boardSubscription.findMany({
    where: {
      status: "active",
      expiresAt: { gt: new Date() },
    },
    select: { boardId: true, id: true, expiresAt: true },
  });

  if (activeSubscriptions.length === 0) {
    return NextResponse.json({
      ran: 0,
      message: "No active Scout subscriptions found.",
      durationMs: Date.now() - startedAt,
    });
  }

  // ── Run scan for each board ─────────────────────────────────────────────
  const results: Array<{
    boardId: string;
    priceDropsDetected: number;
    newLeadsDiscovered: number;
    error?: string;
  }> = [];

  for (const sub of activeSubscriptions) {
    try {
      const result = await runBoardScoutScan(sub.boardId);
      results.push({ boardId: sub.boardId, ...result });
    } catch (err: any) {
      results.push({
        boardId: sub.boardId,
        priceDropsDetected: 0,
        newLeadsDiscovered: 0,
        error: err?.message ?? "Unknown error",
      });
    }
  }

  // ── Auto-expire subscriptions whose window has now passed ───────────────
  // (Belt-and-suspenders: getBoardSubscriptionState also handles this per-request,
  //  but the cron keeps the DB tidy proactively.)
  await (prisma as any).boardSubscription.updateMany({
    where: {
      status: "active",
      expiresAt: { lte: new Date() },
    },
    data: { status: "expired" },
  });

  const totalPriceDrops = results.reduce((s, r) => s + r.priceDropsDetected, 0);
  const totalLeads = results.reduce((s, r) => s + r.newLeadsDiscovered, 0);

  return NextResponse.json({
    ran: results.length,
    totalPriceDropsDetected: totalPriceDrops,
    totalNewLeadsDiscovered: totalLeads,
    durationMs: Date.now() - startedAt,
    boards: results,
  });
}
