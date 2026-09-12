import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  contributeToBoardSubscription,
  coverRemainingSubscriptionBalance,
} from "@/lib/subscription-service";

// POST /api/mobile/boards/[id]/subscription/contribute
// Body: { action: "contribute" | "cover", paymentMethod?: string, transactionId?: string }
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
  const action: string = body.action ?? "contribute";
  const paymentMethod: string = body.paymentMethod ?? "apple_pay";
  const transactionId: string | undefined = body.transactionId;

  try {
    let state;
    if (action === "cover") {
      state = await coverRemainingSubscriptionBalance(boardId, session.user.id, paymentMethod);
    } else {
      state = await contributeToBoardSubscription(boardId, session.user.id, paymentMethod, transactionId);
    }
    return NextResponse.json({ subscription: state });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 400 });
  }
}
