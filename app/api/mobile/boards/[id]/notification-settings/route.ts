import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DEFAULT_ADVISOR_DIGEST_HOUR,
  DEFAULT_ADVISOR_TIME_ZONE,
  isValidAdvisorTimeZone,
  MAX_ADVISOR_DIGEST_HOUR,
  MIN_ADVISOR_DIGEST_HOUR,
} from "@/lib/advisor-notification-diet";
import { ensureBoard } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  digestHourLocal: z.number().int().min(MIN_ADVISOR_DIGEST_HOUR).max(MAX_ADVISOR_DIGEST_HOUR),
  timeZone: z.string().trim().min(1).max(100).refine(isValidAdvisorTimeZone),
  nonCriticalPushEnabled: z.boolean(),
}).strict();

function response(preference: {
  digestHourLocal: number;
  timeZone: string;
  nonCriticalPushEnabled: boolean;
}) {
  return {
    digestHourLocal: preference.digestHourLocal,
    timeZone: preference.timeZone,
    nonCriticalPushEnabled: preference.nonCriticalPushEnabled,
    urgentPushesAlwaysEnabled: true,
    scope: "board",
  };
}

async function contextFor(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireMobileAppUser(request);
  const { id } = await context.params;
  if (!(await ensureBoard(id, user.id))) return null;
  return { user, boardId: id };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await contextFor(request, context);
    if (!access) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const preference = await prisma.boardNotificationPreference.findUnique({
      where: { boardId_userId: { boardId: access.boardId, userId: access.user.id } },
    });
    return NextResponse.json(response(preference ?? {
      digestHourLocal: DEFAULT_ADVISOR_DIGEST_HOUR,
      timeZone: DEFAULT_ADVISOR_TIME_ZONE,
      nonCriticalPushEnabled: true,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "load_board_notification_settings",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json({
      error: unauthorized ? "Unauthorized" : "Unable to load notification settings.",
    }, { status: unauthorized ? 401 : 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await contextFor(request, context);
    if (!access) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Notification settings are invalid." }, { status: 400 });
    }
    const preference = await prisma.boardNotificationPreference.upsert({
      where: { boardId_userId: { boardId: access.boardId, userId: access.user.id } },
      create: { boardId: access.boardId, userId: access.user.id, ...parsed.data },
      update: parsed.data,
    });
    return NextResponse.json(response(preference), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "save_board_notification_settings",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json({
      error: unauthorized ? "Unauthorized" : "Unable to save notification settings.",
    }, { status: unauthorized ? 401 : 500 });
  }
}
