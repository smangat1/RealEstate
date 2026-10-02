import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { analyzeAdvisorReply } from "@/lib/advisor-reply";
import { replyLogConfirmation } from "@/lib/advisor-confirmations";
import {
  pendingFollowUpSuppressionScope,
  replyConfirmationFingerprint,
  selectReplyOutreach,
} from "@/lib/advisor-reply-intake";
import {
  loggedReplyOutreachUpdate,
  REPLY_LOGGABLE_OUTREACH_STATUSES,
} from "@/lib/advisor-proactive-logic";
import { hasAdvisorTestAccess } from "@/lib/advisor-test-access";
import { getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  text: z.string().trim().min(2).max(10_000),
  outreachId: z.string().trim().min(1).max(128).optional(),
  confirmationId: z.string().uuid().optional(),
  extractionSource: z.enum(["apple_intelligence", "on_device_ocr", "manual"]).default("manual"),
}).strict();

const replyFactsSchema = z.object({
  available: z.boolean().nullable(),
  mentionsApplication: z.boolean(),
  mentionsTour: z.boolean(),
  quotedPrice: z.number().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    assertThrottle({
      scope: "advisor-reply-intake",
      key: `${user.id}:${listingId}`,
      limit: 20,
      windowMs: 60 * 60 * 1_000,
      message: "Too many replies were added. Please wait a moment.",
    });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Paste the broker reply first." }, { status: 400 });
    const [data, subscription] = await Promise.all([
      getBoardPageData(id, user.id, { includeSuggestedListings: false, includeCommutes: false }),
      prisma.advisorSubscription.findUnique({ where: { boardId: id }, select: { validUntil: true } }),
    ]);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    if (!hasAdvisorTestAccess(user)
        && !(subscription?.validUntil && subscription.validUntil >= new Date())) {
      return NextResponse.json({ error: "An active Advisor subscription is required." }, { status: 402 });
    }
    const listing = data.boardListings.find((entry) => entry.id === listingId);
    if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    const outreachCandidates = await prisma.brokerOutreachRecord.findMany({
      where: { boardListingId: listingId, status: { in: [...REPLY_LOGGABLE_OUTREACH_STATUSES] } },
      orderBy: [
        { contactedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
    });
    const selection = selectReplyOutreach(outreachCandidates, listingId, parsed.data.outreachId);
    if (!selection.ok) {
      const error = selection.reason === "ambiguous"
        ? "Choose the outreach thread this reply belongs to."
        : selection.reason === "mismatch"
          ? "That outreach thread does not belong to this listing."
          : "Send or record outreach before adding a reply.";
      return NextResponse.json({ error }, { status: 409 });
    }
    const outreach = outreachCandidates.find((candidate) => candidate.id === selection.outreach.id)!;

    let analysis = analyzeAdvisorReply(parsed.data.text);
    const listingName = [listing.listing.address, listing.listing.unit ? `Unit ${listing.listing.unit}` : null]
      .filter(Boolean).join(" · ") || "this listing";
    const content = `Broker reply for ${listingName}: ${analysis.summary} Next move: ${analysis.nextMove}`;
    const fingerprint = replyConfirmationFingerprint({
      boardId: id,
      outreachId: outreach.id,
      confirmationId: parsed.data.confirmationId,
      text: parsed.data.text,
    });
    const now = new Date();
    let followUpCancelled = false;
    let persistedAction = await prisma.advisorAction.findUnique({
      where: { fingerprint },
      select: {
        boardId: true,
        boardListingId: true,
        summary: true,
        whyItMatters: true,
        facts: true,
      },
    });
    let duplicate = Boolean(persistedAction);
    if (persistedAction
        && (persistedAction.boardId !== id || persistedAction.boardListingId !== listingId)) {
      throw new Error("REPLY_CONFIRMATION_SCOPE_MISMATCH");
    }
    try {
      if (!duplicate) {
        const transactionResults = await prisma.$transaction([
        prisma.brokerOutreachRecord.update({
          where: { id: outreach.id },
          data: {
            ...loggedReplyOutreachUpdate(now),
            replyText: parsed.data.text,
            replyFacts: analysis.facts,
          },
        }),
        prisma.advisorAction.create({
          data: {
            boardId: id,
            boardListingId: listingId,
            kind: "reply_summary",
            priority: analysis.facts.available === false ? "high" : "medium",
            title: "Broker reply reviewed",
            summary: analysis.summary,
            whyItMatters: analysis.nextMove,
            facts: analysis.facts,
            sourceLinks: [],
            primaryAction: { type: "open_listing", boardListingId: listingId },
            secondaryActions: [{ type: "draft_reply" }],
            fingerprint,
          },
        }),
        prisma.advisorNotificationDelivery.updateMany({
          where: {
            ...pendingFollowUpSuppressionScope(id, outreach.id),
          },
          data: {
            status: "suppressed",
            leaseToken: null,
            leaseUntil: null,
            suppressedAt: now,
            deliveryOutcome: "reply_logged",
            failureReason: null,
          },
        }),
        prisma.chatMessage.create({
          data: { boardId: id, role: "assistant", authorName: "Advisor", content },
        }),
        prisma.boardEvent.create({
          data: { boardId: id, actorType: "assistant", actorName: "Advisor", eventType: "broker_reply_reviewed", content },
        }),
        prisma.searchBoard.update({ where: { id }, data: { updatedAt: now } }),
        ]);
        followUpCancelled = replyLogConfirmation(transactionResults[2].count).followUpCancelled;
      }
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      duplicate = true;
    }

    if (!duplicate) {
      try {
        await prisma.advisorFeedback.createMany({
          data: [{
            boardId: id,
            userId: user.id,
            boardListingId: listingId,
            subjectType: "reply_extraction",
            subjectId: outreach.id,
            signal: "confirmed",
            engine: "deterministic",
            snapshot: {
              listingId,
              outreachId: outreach.id,
              source: parsed.data.extractionSource,
            },
          }],
          skipDuplicates: true,
        });
      } catch {
        console.error("[advisor-feedback] confirmed reply signal unavailable");
      }
    }

    const [persistedOutreach, confirmedAction] = await Promise.all([
      prisma.brokerOutreachRecord.findUnique({
        where: { id: outreach.id },
        select: { answeredAt: true },
      }),
      duplicate && !persistedAction
        ? prisma.advisorAction.findUnique({
            where: { fingerprint },
            select: {
              boardId: true,
              boardListingId: true,
              summary: true,
              whyItMatters: true,
              facts: true,
            },
          })
        : Promise.resolve(persistedAction),
    ]);
    persistedAction = confirmedAction;
    if (!persistedOutreach?.answeredAt) {
      throw new Error("REPLY_CONFIRMATION_NOT_PERSISTED");
    }
    if (duplicate) {
      if (!persistedAction
          || persistedAction.boardId !== id
          || persistedAction.boardListingId !== listingId) {
        throw new Error("REPLY_CONFIRMATION_SCOPE_MISMATCH");
      }
      const persistedFacts = replyFactsSchema.safeParse(persistedAction.facts);
      if (!persistedFacts.success) throw new Error("REPLY_CONFIRMATION_INVALID");
      analysis = {
        summary: persistedAction.summary,
        nextMove: persistedAction.whyItMatters,
        facts: persistedFacts.data,
      };
    }

    const next = await getBoardPageData(id, user.id, { includeSuggestedListings: false, includeCommutes: false });
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      board: buildMobileBoardPayload(next),
      profile: next.profile,
      missingFields: next.missingFields,
      replyAnalysis: analysis,
      replyLog: {
        confirmationId: parsed.data.confirmationId ?? null,
        outreachId: outreach.id,
        listingId,
        answeredAt: persistedOutreach.answeredAt.toISOString(),
        duplicate,
        followUpCancelled,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review reply.";
    return NextResponse.json({
      error: message === "MOBILE_AUTH_REQUIRED"
        ? "Unauthorized"
        : isThrottleError(error)
          ? message
          : "Unable to review reply.",
    }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500 });
  }
}
