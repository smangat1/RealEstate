import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runBoardScoutScan } from "@/lib/scout-engine";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/mobile/boards/[id]/scout/scan
 *
 * Manually triggers a Scout scan for a single board.
 * Used by the in-app debug button — only works while Scout is active on the board.
 * Requires the requesting user to be a member of the board.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: boardId } = await params;

  // Verify the board has an active Scout subscription
  const activeSub = await (prisma as any).boardSubscription.findFirst({
    where: { boardId, status: "active", expiresAt: { gt: new Date() } },
    select: { id: true },
  });

  if (!activeSub) {
    return NextResponse.json(
      { error: "No active Scout subscription on this board." },
      { status: 403 },
    );
  }

  const startedAt = Date.now();
  const result = await runBoardScoutScan(boardId);

  return NextResponse.json({
    ok: true,
    ...result,
    durationMs: Date.now() - startedAt,
    message:
      result.priceDropsDetected > 0 || result.newLeadsDiscovered > 0
        ? `Found ${result.priceDropsDetected} price drop${result.priceDropsDetected !== 1 ? "s" : ""} and ${result.newLeadsDiscovered} new lead${result.newLeadsDiscovered !== 1 ? "s" : ""}. Check Shared Chat and the Radar deck.`
        : "Scan complete — no new price drops or leads found this run.",
  });
}
