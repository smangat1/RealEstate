import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { runBoardScoutScan } from "@/lib/scout-engine";
import { getBoardSubscriptionState, requireBoardSubscriptionAccess } from "@/lib/subscription-service";

/**
 * POST /api/mobile/boards/[id]/scout/scan
 *
 * Manually triggers an Advisor listing monitor pass for a single board.
 * Used by the in-app scan button: only works while Advisor is active on the board.
 * Requires the requesting user to be a member of the board.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireMobileAppUser(req);
    const { id: boardId } = await params;
    await requireBoardSubscriptionAccess(boardId, user.id);

    // Verify the board has an active Advisor subscription.
    const activeSub = await getBoardSubscriptionState(boardId);

    if (activeSub?.status !== "active") {
      return NextResponse.json(
        { error: "Advisor is not active on this board." },
        { status: 403 },
      );
    }

    const startedAt = Date.now();
    const result = await runBoardScoutScan(boardId);

    return NextResponse.json({
      ok: true,
      ...result,
      durationMs: Date.now() - startedAt,
      message: result.changesDetected > 0
        ? `Found ${result.changesDetected} listing change${result.changesDetected === 1 ? "" : "s"}. Review the new Advisor actions.`
        : `Checked ${result.listingsChecked} listing${result.listingsChecked === 1 ? "" : "s"}. No price, fee, availability, or status changes were found.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to trigger scan.";
    return NextResponse.json(
      {
        error: message === "MOBILE_AUTH_REQUIRED"
          ? "Unauthorized"
          : message === "ADVISOR_BOARD_NOT_FOUND"
            ? "Board not found."
            : "Unable to trigger scan.",
      },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : message === "ADVISOR_BOARD_NOT_FOUND" ? 404 : 500 },
    );
  }
}
