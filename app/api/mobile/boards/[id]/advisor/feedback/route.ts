import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import {
  advisorFeedbackRequestSchema,
  feedbackSubjectMatchesBoard,
  type AdvisorFeedbackRequest,
} from "@/lib/advisor-feedback";
import { hasAdvisorTestAccess } from "@/lib/advisor-test-access";
import { getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

async function subjectScope(body: AdvisorFeedbackRequest, userId: string) {
  if (body.subjectType === "action") {
    const action = await prisma.advisorAction.findUnique({
      where: { id: body.subjectId },
      select: { boardId: true, boardListingId: true },
    });
    return action && { boardId: action.boardId, boardListingId: action.boardListingId };
  }
  if (body.subjectType === "reply_extraction") {
    const outreach = await prisma.brokerOutreachRecord.findUnique({
      where: { id: body.subjectId },
      select: { boardListingId: true, boardListing: { select: { boardId: true } } },
    });
    return outreach && { boardId: outreach.boardListing.boardId, boardListingId: outreach.boardListingId };
  }
  if (body.subjectType === "preference_proposal") {
    const proposal = await prisma.advisorPreferenceProposal.findFirst({
      where: { id: body.subjectId, userId },
      select: { boardId: true },
    });
    return proposal && { boardId: proposal.boardId, boardListingId: null };
  }
  const draft = await prisma.chatMessage.findFirst({
    where: { id: body.subjectId, role: "assistant", advisorPayload: { isNot: null } },
    select: { boardId: true },
  });
  return draft && { boardId: draft.boardId, boardListingId: null };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    assertThrottle({
      scope: "advisor-feedback",
      key: `${user.id}:${id}`,
      limit: 30,
      windowMs: 60 * 60 * 1_000,
      message: "Too much Advisor feedback was submitted. Please wait a moment.",
    });
    const parsed = advisorFeedbackRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Advisor feedback is invalid." }, { status: 400 });

    const [board, subscription] = await Promise.all([
      getBoardPageData(id, user.id, { includeSuggestedListings: false, includeCommutes: false }),
      prisma.advisorSubscription.findUnique({ where: { boardId: id }, select: { validUntil: true } }),
    ]);
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    if (!hasAdvisorTestAccess(user)
        && !(subscription?.validUntil && subscription.validUntil >= new Date())) {
      return NextResponse.json({ error: "An active Advisor subscription is required." }, { status: 402 });
    }

    const scope = await subjectScope(parsed.data, user.id);
    if (!scope || !feedbackSubjectMatchesBoard({
      requestedBoardId: id,
      subjectBoardId: scope.boardId,
      requestedListingId: parsed.data.boardListingId,
      subjectListingId: scope.boardListingId,
    })) {
      return NextResponse.json({ error: "Advisor feedback subject not found on this board." }, { status: 404 });
    }

    let duplicate = false;
    let feedback;
    try {
      feedback = await prisma.advisorFeedback.create({
        data: {
          boardId: id,
          userId: user.id,
          boardListingId: parsed.data.boardListingId ?? scope.boardListingId,
          subjectType: parsed.data.subjectType,
          subjectId: parsed.data.subjectId,
          signal: parsed.data.signal,
          reasonCode: parsed.data.reasonCode,
          note: parsed.data.note,
          engine: parsed.data.engine,
          subjectKind: parsed.data.subjectKind,
          snapshot: parsed.data.snapshot,
        },
        select: { id: true, createdAt: true },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      duplicate = true;
      feedback = await prisma.advisorFeedback.findUniqueOrThrow({
        where: {
          userId_subjectType_subjectId_signal: {
            userId: user.id,
            subjectType: parsed.data.subjectType,
            subjectId: parsed.data.subjectId,
            signal: parsed.data.signal,
          },
        },
        select: { id: true, createdAt: true },
      });
    }

    if (parsed.data.subjectType === "action" && parsed.data.signal === "rejected") {
      await prisma.advisorAction.updateMany({
        where: { id: parsed.data.subjectId, boardId: id, status: "open" },
        data: { status: "dismissed", completedAt: new Date() },
      });
    }
    return NextResponse.json({ feedback: { ...feedback, duplicate } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Advisor feedback.";
    return NextResponse.json({
      error: message === "MOBILE_AUTH_REQUIRED"
        ? "Unauthorized"
        : isThrottleError(error)
          ? message
          : "Unable to save Advisor feedback.",
    }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500 });
  }
}
