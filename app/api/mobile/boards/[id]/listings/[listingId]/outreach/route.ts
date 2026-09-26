import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  advisorMessageId: z.string().trim().min(1).max(64),
  method: z.enum(["email", "message"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    assertThrottle({
      scope: "mobile-advisor-outreach",
      key: `${user.id}:${id}`,
      limit: 20,
      windowMs: 60 * 60 * 1_000,
      message: "Outreach is being recorded too quickly. Please wait a moment.",
    });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Outreach record is invalid." }, { status: 400 });
    const board = await getBoardPageData(id, user.id, {
      includeSuggestedListings: false,
      includeCommutes: false,
    });
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    const [boardListing, message, existing] = await Promise.all([
      prisma.boardListing.findFirst({ where: { id: listingId, boardId: id }, select: { id: true } }),
      prisma.chatMessage.findFirst({
        where: { id: parsed.data.advisorMessageId, boardId: id, role: "assistant" },
        include: { advisorPayload: true },
      }),
      prisma.brokerOutreachRecord.findUnique({
        where: { advisorMessageId: parsed.data.advisorMessageId },
        select: { id: true },
      }),
    ]);
    if (!boardListing || !message?.advisorPayload) {
      return NextResponse.json({ error: "Advisor draft not found." }, { status: 404 });
    }
    const payload = message.advisorPayload.payload;
    const payloadObject = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
    if (payloadObject?.targetListingBoardId !== listingId) {
      return NextResponse.json({ error: "Advisor draft does not match this listing." }, { status: 409 });
    }

    if (!existing) {
      const originalCommand = typeof payloadObject.originalCommand === "string"
        ? payloadObject.originalCommand
        : "";
      const templateKey = /follow[ -]?up/i.test(originalCommand) ? "follow_up" : "availability";
      const now = new Date();
      try {
        await prisma.$transaction([
          prisma.brokerOutreachRecord.create({
            data: {
              boardListingId: listingId,
              userId: user.id,
              advisorMessageId: parsed.data.advisorMessageId,
              contactedAt: now,
              sentAt: null,
              method: parsed.data.method,
              status: "reported_sent",
              templateKey,
              subject: "Homeboard rental outreach",
              body: message.content,
              notes: "Member reported that the system composer returned sent. Recipient delivery is not verified.",
            },
          }),
          prisma.boardListing.update({
            where: { id: listingId },
            data: { userStatus: "outreach_reported" },
          }),
          prisma.advisorAction.updateMany({
            where: {
              boardId: id,
              boardListingId: listingId,
              kind: "follow_up_draft",
              status: "open",
            },
            data: { status: "completed", completedAt: now },
          }),
          prisma.boardEvent.create({
            data: {
              boardId: id,
              actorType: "roommate",
              actorName: user.displayName,
              eventType: "advisor_outreach_reported",
              content: `${user.displayName} reported that the composer returned sent. Recipient delivery is not verified.`,
            },
          }),
          prisma.searchBoard.update({ where: { id }, data: { updatedAt: now } }),
        ]);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
    }

    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      board: buildMobileBoardPayload(next),
      profile: next.profile,
      missingFields: next.missingFields,
      outreachEvidence: {
        kind: "member_reported",
        deliveryVerified: false,
        followUpEligible: false,
      },
    });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "record_advisor_outreach",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const message = error instanceof Error ? error.message : "Unable to record outreach.";
    return NextResponse.json({
      error: message === "MOBILE_AUTH_REQUIRED"
        ? "Unauthorized"
        : isThrottleError(error)
          ? message
          : "Unable to record outreach.",
    }, {
      status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500,
    });
  }
}
