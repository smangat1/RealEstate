import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { normalizeAdvisorTone, runAdvisorEngine } from "@/lib/advisor-engine";
import { getBoardPageData, sendChat } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { notifyBoardChat } from "@/lib/apns";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  content: z.string().trim().min(1).max(4000),
  tone: z.string().trim().max(40).optional(),
});

function isAdvisorMessage(content: string) {
  return /^@advisor\b/i.test(content.trim());
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    assertThrottle({
      scope: "mobile-board-message",
      key: `${user.id}:${id}`,
      limit: 30,
      windowMs: 60 * 1_000,
      message: "Messages are being sent too quickly. Please wait a moment.",
    });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
    const advisorMessage = isAdvisorMessage(parsed.data.content);
    const boardData = await getBoardPageData(id, user.id, advisorMessage
      ? { includeSuggestedListings: false, includeCommutes: false }
      : undefined);
    if (!boardData) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    if (advisorMessage) {
      const now = new Date();
      const subscription = await prisma.advisorSubscription.findUnique({
        where: { boardId: id },
        select: { validUntil: true },
      });
      const subscriptionActive = Boolean(subscription?.validUntil && subscription.validUntil >= now);
      if (!subscriptionActive) {
        return NextResponse.json(
          {
            error: "An active Advisor subscription is required.",
            code: "ADVISOR_SUBSCRIPTION_REQUIRED",
            subscription: {
              active: false,
              validUntil: subscription?.validUntil?.toISOString() ?? null,
            },
          },
          { status: 402 },
        );
      }

      const result = await runAdvisorEngine({
        boardData,
        command: parsed.data.content,
        tone: parsed.data.tone ? normalizeAdvisorTone(parsed.data.tone) : undefined,
        now,
      });

      const messageId = randomUUID();
      const payload = { messageId, ...result };
      await prisma.$transaction([
        prisma.chatMessage.create({
          data: {
            boardId: id,
            role: "user",
            authorUserId: user.id,
            authorName: user.displayName,
            content: parsed.data.content,
          },
        }),
        prisma.boardEvent.create({
          data: {
            boardId: id,
            actorType: "roommate",
            actorName: user.displayName,
            eventType: "chat_message",
            content: `${user.displayName} said: ${parsed.data.content}`,
          },
        }),
        prisma.chatMessage.create({
          data: {
            id: messageId,
            boardId: id,
            role: "assistant",
            authorName: "Advisor",
            content: result.draftText,
            advisorPayload: {
              create: { payload: payload as unknown as Prisma.InputJsonValue },
            },
          },
        }),
        prisma.boardEvent.create({
          data: {
            boardId: id,
            actorType: "assistant",
            actorName: "Advisor",
            eventType: "advisor_draft_created",
            content: result.executionStatus === "draft_ready"
              ? `Advisor prepared a ${result.tone.toLowerCase()} outreach draft.`
              : "Advisor requested missing financial qualifications before drafting outreach.",
          },
        }),
        prisma.searchBoard.update({ where: { id }, data: { updatedAt: now } }),
      ]);

      after(async () => {
        try {
          await notifyBoardChat({
            boardId: id,
            authorUserId: "",
            authorName: "Advisor",
            content: result.draftText,
          });
        } catch (error) {
          await sendOperationalAlert(error, {
            area: "push",
            operation: "notify_advisor_message",
            severity: "error",
          });
        }
      });

      const next = await getBoardPageData(id, user.id);
      if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
      return NextResponse.json({
        board: buildMobileBoardPayload(next),
        profile: next.profile,
        missingFields: next.missingFields,
        advisorPayload: payload,
      });
    }

    await sendChat(id, parsed.data.content, { userId: user.id, authorName: user.displayName });
    after(async () => {
      try {
        await notifyBoardChat({
          boardId: id,
          authorUserId: user.id,
          authorName: user.displayName,
          content: parsed.data.content,
        });
      } catch (error) {
        await sendOperationalAlert(error, {
          area: "push",
          operation: "notify_board_message",
          severity: "error",
        });
      }
    });
    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({ board: buildMobileBoardPayload(next), profile: next.profile, missingFields: next.missingFields });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "post_board_message",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const message = error instanceof Error ? error.message : "Unable to send message.";
    return NextResponse.json(
      {
        error: message === "MOBILE_AUTH_REQUIRED"
          ? "Unauthorized"
          : isThrottleError(error)
            ? message
            : "Unable to send message.",
      },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500 },
    );
  }
}
