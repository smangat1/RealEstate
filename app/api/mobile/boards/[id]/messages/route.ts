import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { normalizeAdvisorTone, runAdvisorEngine } from "@/lib/advisor-engine";
import { hasAdvisorTestAccess } from "@/lib/advisor-test-access";
import { getBoardPageData, sendChat } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { notifyBoardChat } from "@/lib/apns";
import { sendOperationalAlert } from "@/lib/monitoring";
import { parsePreferenceTalk } from "@/lib/preference-talk";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  content: z.string().trim().min(1).max(4000),
  tone: z.string().trim().max(40).optional(),
  regenerateOnly: z.boolean().optional(),
  /** The chat message id of the card being regenerated; echoed back so the client can match correctly. */
  originatingMessageId: z.string().trim().max(64).optional(),
});

const acceptedAdvisorSchema = z.object({
  messageId: z.string().trim().min(1).max(64),
  payload: z.object({
    messageId: z.string().trim().min(1).max(64),
    draftText: z.string().trim().min(1).max(4000),
    tone: z.string().trim().min(1).max(40),
    toggleOptions: z.array(z.object({
      id: z.string().trim().min(1).max(80),
      label: z.string().trim().min(1).max(80),
      enabled: z.boolean(),
      required: z.boolean(),
    })).max(12),
    executionStatus: z.literal("draft_ready"),
    generationSource: z.enum(["apple_intelligence", "device_template"]),
    financialDisclosure: z.enum(["available_on_request", "combined_range", "omit"]),
    clientGeneratedAt: z.string().datetime(),
  }).passthrough(),
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
      const subscriptionActive = hasAdvisorTestAccess(user)
        || Boolean(subscription?.validUntil && subscription.validUntil >= now);
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

      // Use the originating message id so the client can match its existing chat bubble.
      const messageId = parsed.data.originatingMessageId ?? randomUUID();
      const payload = { messageId, ...result };

      if (parsed.data.regenerateOnly) {
        const next = await getBoardPageData(id, user.id);
        if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
        return NextResponse.json({
          board: buildMobileBoardPayload(next),
          profile: next.profile,
          missingFields: next.missingFields,
          advisorPayload: payload,
        });
      }

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
    const preferenceSignals = parsePreferenceTalk(parsed.data.content);
    if (preferenceSignals.length > 0) {
      const roommate = await prisma.roommateProfile.findFirst({
        where: { boardId: id, linkedUserId: user.id, roleLabel: { not: "commute point" } },
        select: { id: true, preferenceSignals: true, mustHaves: true },
      });
      if (roommate) {
        const existing = roommate.preferenceSignals && typeof roommate.preferenceSignals === "object" && !Array.isArray(roommate.preferenceSignals)
          ? roommate.preferenceSignals as Record<string, unknown>
          : {};
        const nextSignals = { ...existing };
        for (const signal of preferenceSignals) nextSignals[signal.feature] = signal.weight;
        let mustHaves: string[] = [];
        try {
          const decoded = JSON.parse(roommate.mustHaves ?? "[]");
          if (Array.isArray(decoded)) mustHaves = decoded.filter((value): value is string => typeof value === "string");
        } catch {
          mustHaves = [];
        }
        const lowered = preferenceSignals.filter((signal) => signal.weight < 0);
        if (lowered.length > 0) {
          mustHaves = mustHaves.filter((value) => !lowered.some((signal) => {
            const normalized = value.toLowerCase();
            return normalized.includes(signal.label) || signal.label.includes(normalized);
          }));
        }
        const priorityUpdates: Prisma.RoommateProfileUpdateInput = {};
        for (const signal of preferenceSignals) {
          const priority = signal.weight > 0 ? "high" : "low";
          if (signal.feature === "commute") priorityUpdates.commutePriority = priority;
          if (signal.feature === "neighborhood") priorityUpdates.neighborhoodPriority = priority;
          if (signal.feature === "space") priorityUpdates.spacePriority = priority;
          if (signal.feature === "privacy") priorityUpdates.privacyPriority = priority;
        }
        const summary = preferenceSignals.map((signal) => `${signal.label}: ${signal.weight > 0 ? "more important" : "lower priority"}`).join(" · ");
        await prisma.$transaction([
          prisma.roommateProfile.update({
            where: { id: roommate.id },
            data: {
              preferenceSignals: nextSignals as Prisma.InputJsonValue,
              mustHaves: JSON.stringify(mustHaves),
              ...priorityUpdates,
            },
          }),
          prisma.chatMessage.create({
            data: {
              boardId: id,
              role: "assistant",
              authorName: "Advisor",
              content: `Got it. I adjusted ${user.displayName}'s fit weighting. ${summary}.`,
            },
          }),
          prisma.boardEvent.create({
            data: {
              boardId: id,
              actorType: "assistant",
              actorName: "Advisor",
              eventType: "preference_signal_updated",
              content: `Advisor updated ${user.displayName}'s listing weights from an explicit chat preference: ${summary}.`,
            },
          }),
        ]);
      }
    }
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    assertThrottle({
      scope: "mobile-advisor-draft-accept",
      key: `${user.id}:${id}`,
      limit: 30,
      windowMs: 60 * 1_000,
      message: "Advisor drafts are being updated too quickly. Please wait a moment.",
    });
    const parsed = acceptedAdvisorSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.messageId !== parsed.data.payload.messageId) {
      return NextResponse.json({ error: "Advisor draft is invalid." }, { status: 400 });
    }
    if (/\[(?:income|credit)[^\]]*\]/i.test(parsed.data.payload.draftText)) {
      return NextResponse.json({ error: "Advisor drafts cannot contain financial placeholders." }, { status: 400 });
    }

    const boardData = await getBoardPageData(id, user.id, {
      includeSuggestedListings: false,
      includeCommutes: false,
    });
    if (!boardData) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const subscription = await prisma.advisorSubscription.findUnique({
      where: { boardId: id },
      select: { validUntil: true },
    });
    if (!hasAdvisorTestAccess(user)
        && !(subscription?.validUntil && subscription.validUntil >= new Date())) {
      return NextResponse.json({ error: "An active Advisor subscription is required." }, { status: 402 });
    }

    const message = await prisma.chatMessage.findFirst({
      where: { id: parsed.data.messageId, boardId: id, role: "assistant" },
      include: { advisorPayload: true },
    });
    const storedPayload = message?.advisorPayload?.payload;
    if (!message || !storedPayload || typeof storedPayload !== "object" || Array.isArray(storedPayload)) {
      return NextResponse.json({ error: "Advisor card not found." }, { status: 404 });
    }
    const incomingGeneratedAt = Date.parse(parsed.data.payload.clientGeneratedAt);
    if (incomingGeneratedAt > Date.now() + 5 * 60 * 1_000) {
      return NextResponse.json({ error: "Advisor draft timestamp is invalid." }, { status: 400 });
    }
    let acceptedPayload = storedPayload as Record<string, unknown>;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await prisma.advisorMessagePayload.findUnique({
        where: { messageId: message.id },
      });
      if (!current || typeof current.payload !== "object" || Array.isArray(current.payload)) break;
      const currentPayload = current.payload as Record<string, unknown>;
      const storedGeneratedAt = typeof currentPayload.clientGeneratedAt === "string"
        ? Date.parse(currentPayload.clientGeneratedAt)
        : 0;
      if (incomingGeneratedAt < storedGeneratedAt) {
        acceptedPayload = currentPayload;
        break;
      }
      const candidate = {
        ...currentPayload,
        draftText: parsed.data.payload.draftText,
        tone: parsed.data.payload.tone,
        toggleOptions: parsed.data.payload.toggleOptions,
        executionStatus: "draft_ready",
        generationSource: parsed.data.payload.generationSource,
        financialDisclosure: parsed.data.payload.financialDisclosure,
        acceptedAt: new Date().toISOString(),
        clientGeneratedAt: parsed.data.payload.clientGeneratedAt,
      };
      const saved = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.advisorMessagePayload.updateMany({
          where: {
            id: current.id,
            updatedAt: current.updatedAt,
          },
          data: { payload: candidate as Prisma.InputJsonValue },
        });
        if (updated.count === 0) return false;
        await transaction.chatMessage.update({
          where: { id: message.id },
          data: { content: parsed.data.payload.draftText },
        });
        await transaction.searchBoard.update({ where: { id }, data: { updatedAt: new Date() } });
        return true;
      });
      if (saved) {
        acceptedPayload = candidate;
        break;
      }
    }

    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      board: buildMobileBoardPayload(next),
      profile: next.profile,
      missingFields: next.missingFields,
      advisorPayload: next.messages.find((entry) => entry.id === message.id)?.advisorPayload ?? acceptedPayload,
    });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "accept_advisor_draft",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const message = error instanceof Error ? error.message : "Unable to save Advisor draft.";
    return NextResponse.json(
      {
        error: message === "MOBILE_AUTH_REQUIRED"
          ? "Unauthorized"
          : isThrottleError(error)
            ? message
            : "Unable to save Advisor draft.",
      },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500 },
    );
  }
}
