import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileAppUser } from "@/lib/mobile-auth";
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
  try {
    const user = await requireMobileAppUser(req);
    const { id: boardId } = await params;
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "contribute";
    const paymentMethod: string = body.paymentMethod ?? "apple_pay";
    const transactionId: string | undefined = body.transactionId;

    let state;
    if (action === "cover") {
      state = await coverRemainingSubscriptionBalance(boardId, user.id, paymentMethod);
    } else {
      state = await contributeToBoardSubscription(boardId, user.id, paymentMethod, transactionId);
    }
    return NextResponse.json({ subscription: state });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Unable to contribute.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : message },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 400 },
    );
  }
}
