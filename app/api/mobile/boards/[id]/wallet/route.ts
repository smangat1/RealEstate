import { NextResponse } from "next/server";

import { ensureBoard } from "@/lib/board-data";
import { hasAdvisorTestAccess } from "@/lib/advisor-test-access";
import { ADVISOR_WEEK_CENTS, ADVISOR_WINDOW_MS, realAdvisorLedgerWhere } from "@/lib/advisor-wallet";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    if (!(await ensureBoard(id, user.id))) {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - ADVISOR_WINDOW_MS);
    const [ledger, subscription] = await Promise.all([
      prisma.boardWalletLedger.aggregate({
        where: realAdvisorLedgerWhere(id, windowStart),
        _sum: { amount: true },
      }),
      prisma.advisorSubscription.findUnique({
        where: { boardId: id },
        select: { validUntil: true },
      }),
    ]);
    const rolling7DayTotalCents = ledger._sum.amount ?? 0;
    const validUntil = subscription?.validUntil ?? null;
    const testMode = hasAdvisorTestAccess(user);

    return NextResponse.json({
      rolling7DayTotalCents,
      thresholdCents: ADVISOR_WEEK_CENTS,
      remainingCents: Math.max(0, ADVISOR_WEEK_CENTS - rolling7DayTotalCents),
      windowStartedAt: windowStart.toISOString(),
      subscription: {
        active: testMode || Boolean(validUntil && validUntil >= now),
        validUntil: validUntil?.toISOString() ?? null,
      },
      testMode,
    });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "load_advisor_wallet",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const message = error instanceof Error ? error.message : "Unable to load Advisor wallet.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to load Advisor wallet." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
