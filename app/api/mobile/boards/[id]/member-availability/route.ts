import { NextResponse } from "next/server";
import { z } from "zod";

import {
  effectiveAdvisorAvailabilityState,
  loadAdvisorMemberAvailability,
  setAdvisorMemberAvailability,
} from "@/lib/advisor-availability";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("active") }).strict(),
  z.object({ state: z.literal("ride_along") }).strict(),
  z.object({ state: z.literal("away"), awayUntil: z.string().datetime().nullable().optional() }).strict(),
]);

async function contextFor(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireMobileAppUser(request);
  const { id } = await context.params;
  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: id, userId: user.id } },
    select: { id: true },
  });
  if (!membership) return null;
  return { user, boardId: id };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await contextFor(request, context);
    if (!access) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const now = new Date();
    const [members, availability] = await Promise.all([
      prisma.boardMember.findMany({
        where: { boardId: access.boardId },
        select: { userId: true, user: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      }),
      loadAdvisorMemberAvailability(access.boardId, now),
    ]);
    return NextResponse.json({
      available: availability.available,
      members: members.map((member) => {
        const record = availability.byUserId[member.userId];
        const state = effectiveAdvisorAvailabilityState(record, now);
        return {
          userId: member.userId,
          name: member.user.displayName,
          state,
          awayUntil: member.userId === access.user.id && state === "away"
            ? record?.awayUntil instanceof Date
              ? record.awayUntil.toISOString()
              : record?.awayUntil ?? null
            : null,
        };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "load_member_availability",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json({ error: unauthorized ? "Unauthorized" : "Unable to load member availability." }, {
      status: unauthorized ? 401 : 500,
    });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await contextFor(request, context);
    if (!access) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Member availability is invalid." }, { status: 400 });
    const awayUntil = parsed.data.state === "away" && parsed.data.awayUntil
      ? new Date(parsed.data.awayUntil)
      : null;
    const result = await setAdvisorMemberAvailability({
      boardId: access.boardId,
      userId: access.user.id,
      state: parsed.data.state,
      awayUntil,
    });
    return NextResponse.json({
      available: result.available,
      state: result.state,
      awayUntil: result.awayUntil?.toISOString() ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "save_member_availability",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json({ error: unauthorized ? "Unauthorized" : "Unable to save member availability." }, {
      status: unauthorized ? 401 : 500,
    });
  }
}
