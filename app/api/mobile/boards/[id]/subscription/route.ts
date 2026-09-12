import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getBoardSubscriptionState,
  initiateBoardSubscriptionSplit,
} from "@/lib/subscription-service";

// GET /api/mobile/boards/[id]/subscription — fetch current subscription state
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: boardId } = await params;
  const state = await getBoardSubscriptionState(boardId);
  return NextResponse.json({ subscription: state });
}

// POST /api/mobile/boards/[id]/subscription — initiate split crowdfunder
// Body: { memberUserIds: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: boardId } = await params;
  const body = await req.json().catch(() => ({}));
  const memberUserIds: string[] = Array.isArray(body.memberUserIds) ? body.memberUserIds : [];

  const state = await initiateBoardSubscriptionSplit(boardId, session.user.id, memberUserIds);
  return NextResponse.json({ subscription: state }, { status: 201 });
}
