import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import {
  contributeToBoardSubscription,
  coverRemainingSubscriptionBalance,
} from "@/lib/subscription-service";

const contributionSchema = z.object({
  action: z.enum(["contribute", "cover"]).default("contribute"),
  paymentMethod: z.enum(["apple_pay", "in_app", "web"]).default("in_app"),
  transactionId: z.string().trim().min(1).max(200).optional(),
}).strict();

// POST /api/mobile/boards/[id]/subscription/contribute
// Body: { action: "contribute" | "cover", paymentMethod?: string, transactionId?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireMobileAppUser(req);
    const { id: boardId } = await params;
    const parsed = contributionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Advisor contribution request." }, { status: 400 });
    }
    const { action, paymentMethod, transactionId } = parsed.data;

    let state;
    if (action === "cover") {
      state = await coverRemainingSubscriptionBalance(boardId, user.id, paymentMethod);
    } else {
      state = await contributeToBoardSubscription(boardId, user.id, paymentMethod, transactionId);
    }
    return NextResponse.json({ subscription: state });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unable to contribute.";
    if (message === "ADVISOR_BOARD_NOT_FOUND") {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : message },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 400 },
    );
  }
}
