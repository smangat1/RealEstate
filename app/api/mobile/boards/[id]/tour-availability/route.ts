import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { findSharedTourWindows, type TourWindow } from "@/lib/tour-availability";

const schema = z.object({
  windows: z.array(z.object({ start: z.string().datetime(), end: z.string().datetime() })).max(10),
});

async function accessibleBoard(boardId: string, userId: string) {
  return prisma.searchBoard.findFirst({
    where: { id: boardId, OR: [{ userId }, { members: { some: { userId } } }] },
    select: {
      id: true,
      roommates: {
        where: { roleLabel: { not: "commute point" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, linkedUserId: true, name: true, tourAvailability: true },
      },
    },
  });
}

function windows(value: Prisma.JsonValue): TourWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const start = "start" in entry && typeof entry.start === "string" ? entry.start : null;
    const end = "end" in entry && typeof entry.end === "string" ? entry.end : null;
    return start && end ? [{ start, end }] : [];
  });
}

function payload(board: NonNullable<Awaited<ReturnType<typeof accessibleBoard>>>, userId: string) {
  const members = board.roommates.map((member) => ({
    memberId: member.id,
    name: member.name,
    isCurrentUser: member.linkedUserId === userId,
    windows: windows(member.tourAvailability),
  }));
  return { members, sharedWindows: findSharedTourWindows(members) };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const board = await accessibleBoard(id, user.id);
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json(payload(board, user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json({ error: unauthorized ? "Unauthorized" : "Unable to load tour availability." }, { status: unauthorized ? 401 : 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Tour availability is invalid." }, { status: 400 });
    const now = Date.now();
    const horizon = now + 90 * 24 * 60 * 60 * 1_000;
    const invalid = parsed.data.windows.some((window) => {
      const start = new Date(window.start).getTime();
      const end = new Date(window.end).getTime();
      return start < now - 60 * 60 * 1_000 || end > horizon || end - start < 30 * 60 * 1_000 || end - start > 12 * 60 * 60 * 1_000;
    });
    if (invalid) return NextResponse.json({ error: "Tour windows must be 30 minutes to 12 hours and within the next 90 days." }, { status: 400 });
    const board = await accessibleBoard(id, user.id);
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const roommate = board.roommates.find((member) => member.linkedUserId === user.id);
    if (!roommate) return NextResponse.json({ error: "Complete your member profile before adding availability." }, { status: 409 });
    await prisma.$transaction([
      prisma.roommateProfile.update({ where: { id: roommate.id }, data: { tourAvailability: parsed.data.windows } }),
      prisma.boardEvent.create({ data: { boardId: id, actorType: "roommate", actorName: user.displayName, eventType: "tour_availability_updated", content: `${user.displayName} updated their tour availability.` } }),
      prisma.searchBoard.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    const updated = await accessibleBoard(id, user.id);
    return NextResponse.json(payload(updated!, user.id));
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json({ error: unauthorized ? "Unauthorized" : "Unable to save tour availability." }, { status: unauthorized ? 401 : 500 });
  }
}
