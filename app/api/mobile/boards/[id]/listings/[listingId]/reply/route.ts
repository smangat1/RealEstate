import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { analyzeAdvisorReply } from "@/lib/advisor-reply";
import { hasAdvisorTestAccess } from "@/lib/advisor-test-access";
import { getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { prisma } from "@/lib/prisma";

const schema = z.object({ text: z.string().trim().min(2).max(10_000) });

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
    const outreach = await prisma.brokerOutreachRecord.findFirst({
      where: { boardListingId: listingId, status: { in: ["sent", "stale", "answered"] } },
      orderBy: [{ sentAt: "desc" }, { contactedAt: "desc" }],
    });
    if (!outreach) return NextResponse.json({ error: "Send or record outreach before adding a reply." }, { status: 409 });

    const analysis = analyzeAdvisorReply(parsed.data.text);
    const listingName = [listing.listing.address, listing.listing.unit ? `Unit ${listing.listing.unit}` : null]
      .filter(Boolean).join(" · ") || "this listing";
    const content = `Broker reply for ${listingName}: ${analysis.summary} Next move: ${analysis.nextMove}`;
    const fingerprint = `reply:${createHash("sha256").update(`${outreach.id}:${parsed.data.text}`).digest("hex")}`;
    const now = new Date();
    try {
      await prisma.$transaction([
        prisma.brokerOutreachRecord.update({
          where: { id: outreach.id },
          data: {
            status: "answered",
            answeredAt: now,
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
        prisma.chatMessage.create({
          data: { boardId: id, role: "assistant", authorName: "Advisor", content },
        }),
        prisma.boardEvent.create({
          data: { boardId: id, actorType: "assistant", actorName: "Advisor", eventType: "broker_reply_reviewed", content },
        }),
        prisma.searchBoard.update({ where: { id }, data: { updatedAt: now } }),
      ]);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }

    const next = await getBoardPageData(id, user.id, { includeSuggestedListings: false, includeCommutes: false });
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      board: buildMobileBoardPayload(next),
      profile: next.profile,
      missingFields: next.missingFields,
      replyAnalysis: analysis,
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
