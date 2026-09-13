import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import {
  getBoardSubscriptionState,
  initiateBoardSubscriptionSplit,
  requireBoardSubscriptionAccess,
} from "@/lib/subscription-service";

function advisorErrorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message === "MOBILE_AUTH_REQUIRED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "ADVISOR_BOARD_NOT_FOUND") {
    return NextResponse.json({ error: "Board not found." }, { status: 404 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

// GET /api/mobile/boards/[id]/subscription: fetch current subscription state
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireMobileAppUser(req);
    const { id: boardId } = await params;
    await requireBoardSubscriptionAccess(boardId, user.id);
    const state = await getBoardSubscriptionState(boardId);
    return NextResponse.json({ subscription: state });
  } catch (error) {
    return advisorErrorResponse(error, "Unable to load Advisor status.");
  }
}

// POST /api/mobile/boards/[id]/subscription: initiate split crowdfunder
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireMobileAppUser(req);
    const { id: boardId } = await params;

    const state = await initiateBoardSubscriptionSplit(boardId, user.id);
    return NextResponse.json({ subscription: state }, { status: 201 });
  } catch (error) {
    return advisorErrorResponse(error, "Unable to start the Advisor split.");
  }
}
