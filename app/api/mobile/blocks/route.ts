import { NextResponse } from "next/server";
import { z } from "zod";

import { shareBoardWhere } from "@/lib/content-moderation";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

const schema = z.object({ blockedUserId: z.string().trim().min(1).max(120) });

export async function GET(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const blocks = await prisma.userBlock.findMany({
      where: { blockerUserId: user.id },
      select: {
        blockedUserId: true,
        createdAt: true,
        blocked: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      blocks: blocks.map((block) => ({
        userId: block.blockedUserId,
        displayName: block.blocked.displayName,
        blockedAt: block.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleError(request, error, "list_blocks");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
    if (parsed.data.blockedUserId === user.id) {
      return NextResponse.json({ error: "You cannot block yourself." }, { status: 400 });
    }

    const sharedBoard = await prisma.searchBoard.findFirst({
      where: shareBoardWhere(user.id, parsed.data.blockedUserId),
      select: { id: true },
    });
    if (!sharedBoard) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const block = await prisma.userBlock.upsert({
      where: {
        blockerUserId_blockedUserId: {
          blockerUserId: user.id,
          blockedUserId: parsed.data.blockedUserId,
        },
      },
      update: {},
      create: { blockerUserId: user.id, blockedUserId: parsed.data.blockedUserId },
    });
    return NextResponse.json({ block });
  } catch (error) {
    return handleError(request, error, "block_user");
  }
}

async function handleError(request: Request, error: unknown, operation: string) {
  await sendOperationalAlert(error, {
    area: "mobile_api",
    operation,
    requestId: request.headers.get("x-homeboard-request-id"),
  });
  const message = error instanceof Error ? error.message : "Unable to update blocked users.";
  return NextResponse.json(
    { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to update blocked users." },
    { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
  );
}

