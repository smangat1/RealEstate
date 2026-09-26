import { NextResponse } from "next/server";

import { runAdvisorProactiveBoard } from "@/lib/advisor-proactive";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const subscriptions = await prisma.advisorSubscription.findMany({
    where: { validUntil: { gte: now } },
    select: { boardId: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  const results = [];
  for (const subscription of subscriptions) {
    try {
      results.push({
        boardId: subscription.boardId,
        ...(await runAdvisorProactiveBoard(subscription.boardId, now)),
      });
    } catch (error) {
      await sendOperationalAlert(error, {
        area: "advisor",
        operation: "run_proactive_board",
        severity: "error",
      });
      results.push({ boardId: subscription.boardId, error: "run_failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    checkedBoards: subscriptions.length,
    results,
    checkedAt: now.toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
