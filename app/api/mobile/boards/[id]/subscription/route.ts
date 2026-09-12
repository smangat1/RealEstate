import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import {
  getBoardSubscriptionState,
  initiateBoardSubscriptionSplit,
} from "@/lib/subscription-service";

// GET /api/mobile/boards/[id]/subscription: fetch current subscription state
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireMobileAppUser(req);
    const { id: boardId } = await params;
    const state = await getBoardSubscriptionState(boardId);
    return NextResponse.json({ subscription: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load subscription.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to load subscription." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}

// POST /api/mobile/boards/[id]/subscription: initiate split crowdfunder
// Body: { memberUserIds: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireMobileAppUser(req);
    const { id: boardId } = await params;
    const body = await req.json().catch(() => ({}));
    const memberUserIds: string[] = Array.isArray(body.memberUserIds) ? body.memberUserIds : [];

    const state = await initiateBoardSubscriptionSplit(boardId, user.id, memberUserIds);
    return NextResponse.json({ subscription: state }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to initiate subscription.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to initiate subscription." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
