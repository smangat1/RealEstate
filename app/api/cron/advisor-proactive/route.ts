import { NextResponse } from "next/server";

import { runAdvisorProactiveBoard } from "@/lib/advisor-proactive";
import {
  ADVISOR_PROACTIVE_BATCH_SIZE,
  ADVISOR_PROACTIVE_CANDIDATE_LIMIT,
  ADVISOR_PROACTIVE_LEASE_MS,
  ADVISOR_PROACTIVE_WORK_BUDGET_MS,
} from "@/lib/advisor-cron-rotation";
import { isAdvisorCronRequestAuthorized } from "@/lib/github-actions-oidc";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!(await isAdvisorCronRequestAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const deadline = Date.now() + ADVISOR_PROACTIVE_WORK_BUDGET_MS;
  const leaseUntil = new Date(now.getTime() + ADVISOR_PROACTIVE_LEASE_MS);
  const subscriptions = await prisma.advisorSubscription.findMany({
    where: {
      validUntil: { gte: now },
      OR: [{ proactiveLeaseUntil: null }, { proactiveLeaseUntil: { lt: now } }],
    },
    select: { id: true, boardId: true },
    orderBy: [
      { proactiveCheckedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
      { id: "asc" },
    ],
    take: ADVISOR_PROACTIVE_CANDIDATE_LIMIT,
  });
  const results = [];
  for (const subscription of subscriptions) {
    if (results.length >= ADVISOR_PROACTIVE_BATCH_SIZE || Date.now() >= deadline) break;
    const claimed = await prisma.advisorSubscription.updateMany({
      where: {
        id: subscription.id,
        validUntil: { gte: now },
        OR: [{ proactiveLeaseUntil: null }, { proactiveLeaseUntil: { lt: now } }],
      },
      data: { proactiveCheckedAt: now, proactiveLeaseUntil: leaseUntil },
    });
    if (claimed.count === 0) continue;
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
    } finally {
      await prisma.advisorSubscription.updateMany({
        where: { id: subscription.id, proactiveLeaseUntil: leaseUntil },
        data: { proactiveLeaseUntil: null },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checkedBoards: results.length,
    candidateBoards: subscriptions.length,
    batchSize: ADVISOR_PROACTIVE_BATCH_SIZE,
    workBudgetMs: ADVISOR_PROACTIVE_WORK_BUDGET_MS,
    results,
    checkedAt: now.toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
