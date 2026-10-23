import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { canModerateMessage, contentReportReasons } from "@/lib/content-moderation";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  reason: z.enum(contentReportReasons),
  details: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; messageId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id: boardId, messageId } = await context.params;
    assertThrottle({
      scope: "mobile-content-report",
      key: user.id,
      limit: 10,
      windowMs: 60 * 1_000,
      message: "Too many reports were submitted recently. Please wait a moment.",
    });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid report." }, { status: 400 });

    const board = await prisma.searchBoard.findFirst({
      where: {
        id: boardId,
        OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }],
      },
      select: { id: true },
    });
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, boardId },
      select: { id: true, role: true, authorUserId: true, content: true },
    });
    if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });
    if (!canModerateMessage({ reporterUserId: user.id, message })) {
      return NextResponse.json(
        { error: message.authorUserId === user.id ? "You cannot report your own message." : "This message cannot be reported." },
        { status: 400 },
      );
    }

    const existing = await prisma.contentReport.findUnique({
      where: { reporterUserId_messageId: { reporterUserId: user.id, messageId } },
    });
    if (existing) return NextResponse.json({ report: existing, created: false });

    let report;
    try {
      report = await prisma.contentReport.create({
        data: {
          boardId,
          messageId,
          reportedUserId: message.authorUserId,
          reporterUserId: user.id,
          reason: parsed.data.reason,
          details: parsed.data.details ?? "",
          contentSnapshot: message.content,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        report = await prisma.contentReport.findUniqueOrThrow({
          where: { reporterUserId_messageId: { reporterUserId: user.id, messageId } },
        });
        return NextResponse.json({ report, created: false });
      }
      throw error;
    }

    await sendOperationalAlert(new Error("A new content report needs review."), {
      area: "content_moderation",
      operation: "new_content_report",
      severity: "warning",
      captureError: false,
      metadata: { reportId: report.id, reason: report.reason, boardId },
    });
    return NextResponse.json({ report, created: true }, { status: 201 });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "report_board_message",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const message = error instanceof Error ? error.message : "Unable to report message.";
    return NextResponse.json(
      {
        error: message === "MOBILE_AUTH_REQUIRED"
          ? "Unauthorized"
          : isThrottleError(error)
            ? message
            : "Unable to report message.",
      },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500 },
    );
  }
}

