import { NextResponse } from "next/server";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { runAdvisorProactiveBoard } from "@/lib/advisor-proactive";
import { hasAdvisorTestAccess } from "@/lib/advisor-test-access";
import { getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    assertThrottle({
      scope: "mobile-advisor-proactive",
      key: `${user.id}:${id}`,
      limit: 4,
      windowMs: 60 * 60 * 1_000,
      message: "Advisor has checked this board recently. Please wait before checking again.",
    });
    const board = await getBoardPageData(id, user.id, {
      includeSuggestedListings: false,
      includeCommutes: false,
    });
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const subscription = await prisma.advisorSubscription.findUnique({
      where: { boardId: id },
      select: { validUntil: true },
    });
    if (!hasAdvisorTestAccess(user)
        && !(subscription?.validUntil && subscription.validUntil >= new Date())) {
      return NextResponse.json({ error: "An active Advisor subscription is required." }, { status: 402 });
    }

    const result = await runAdvisorProactiveBoard(id);
    const next = await getBoardPageData(id, user.id, {
      includeSuggestedListings: false,
      includeCommutes: false,
    });
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      result,
      board: buildMobileBoardPayload(next),
      profile: next.profile,
      missingFields: next.missingFields,
    });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "run_advisor_proactive",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const message = error instanceof Error ? error.message : "Unable to run Advisor checks.";
    return NextResponse.json({
      error: message === "MOBILE_AUTH_REQUIRED"
        ? "Unauthorized"
        : isThrottleError(error)
          ? message
          : "Unable to run Advisor checks.",
    }, {
      status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500,
    });
  }
}
