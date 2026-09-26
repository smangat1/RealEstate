import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { hasAdvisorTestAccess } from "@/lib/advisor-test-access";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { optimizeRoomAssignment } from "@/lib/room-assignment";

const schema = z.object({
  rooms: z.array(z.object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(80),
    adjustment: z.number().int().min(-10_000).max(10_000),
  })).min(2).max(7).refine((rooms) => new Set(rooms.map((room) => room.id)).size === rooms.length),
});

export async function POST(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    assertThrottle({ scope: "advisor-room-assignment", key: `${user.id}:${id}`, limit: 20, windowMs: 60 * 60 * 1_000, message: "Room splits are being recalculated too quickly." });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Room details are invalid." }, { status: 400 });

    const board = await prisma.searchBoard.findFirst({
      where: { id, OR: [{ userId: user.id }, { members: { some: { userId: user.id } } }] },
      select: {
        id: true,
        advisorSubscription: { select: { validUntil: true } },
        roommates: {
          where: { roleLabel: { not: "commute point" } },
          select: { id: true, name: true, budgetMin: true, idealBudget: true, budgetMax: true },
        },
        boardListings: {
          where: { id: listingId, deletedAt: null },
          take: 1,
          select: { id: true, listing: { select: { price: true, address: true, unit: true } } },
        },
      },
    });
    if (!board || board.boardListings.length === 0) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    const active = hasAdvisorTestAccess(user)
      || Boolean(board.advisorSubscription?.validUntil && board.advisorSubscription.validUntil >= new Date());
    if (!active) return NextResponse.json({ error: "An active Advisor subscription is required.", code: "ADVISOR_SUBSCRIPTION_REQUIRED" }, { status: 402 });
    const listing = board.boardListings[0];
    if (!listing.listing.price) return NextResponse.json({ error: "Add the listing rent before optimizing rooms." }, { status: 409 });
    if (board.roommates.length !== parsed.data.rooms.length) {
      return NextResponse.json({ error: `Add exactly ${board.roommates.length} rooms, one per roommate.` }, { status: 400 });
    }

    const result = optimizeRoomAssignment({ totalRent: listing.listing.price, members: board.roommates, rooms: parsed.data.rooms });
    const address = [listing.listing.address, listing.listing.unit].filter(Boolean).join(" ") || "this listing";
    const summary = result.assignments.map((assignment) => `${assignment.memberName}: ${assignment.roomName} at $${assignment.monthlyRent.toLocaleString()}/mo`).join(" · ");
    const fingerprint = `room_assignment:${id}:${listingId}:${createHash("sha256").update(JSON.stringify(parsed.data.rooms)).digest("hex").slice(0, 20)}`;
    const existing = await prisma.advisorAction.findUnique({ where: { fingerprint }, select: { id: true } });
    if (!existing) {
      await prisma.$transaction([
        prisma.advisorAction.create({ data: {
          boardId: id,
          boardListingId: listingId,
          kind: "room_assignment",
          priority: "medium",
          title: `Room split for ${address}`,
          summary,
          whyItMatters: "Balances the group’s stated comfort ranges while keeping the proposed room rents equal to the listing total.",
          facts: result as unknown as Prisma.InputJsonValue,
          sourceLinks: [] as Prisma.InputJsonValue,
          primaryAction: { type: "review_room_split", listingId } as Prisma.InputJsonValue,
          secondaryActions: [] as Prisma.InputJsonValue,
          fingerprint,
        } }),
        prisma.chatMessage.create({ data: { boardId: id, role: "assistant", authorName: "Advisor", content: `Proposed room split for ${address}: ${summary}. Review the room premiums together before agreeing.` } }),
        prisma.boardEvent.create({ data: { boardId: id, actorType: "assistant", actorName: "Advisor", eventType: "room_assignment_created", content: `Advisor proposed an affordability-balanced room split for ${address}.` } }),
        prisma.searchBoard.update({ where: { id }, data: { updatedAt: new Date() } }),
      ]);
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to optimize room assignments.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : isThrottleError(error) ? message : "Unable to optimize room assignments." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500 },
    );
  }
}
