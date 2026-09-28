import { NextResponse } from "next/server";
import { z } from "zod";

import { isValidAdvisorTimeZone, nextAdvisorDigestAt } from "@/lib/advisor-notification-diet";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  token: z.string().regex(/^[a-fA-F0-9]{32,256}$/),
  environment: z.enum(["development", "production"]).default("development"),
  timeZone: z.string().trim().min(1).max(100).refine(isValidAdvisorTimeZone).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid device token." }, { status: 400 });
    const now = new Date();
    await prisma.pushDevice.upsert({
      where: { token: parsed.data.token.toLowerCase() },
      create: {
        userId: user.id,
        token: parsed.data.token.toLowerCase(),
        environment: parsed.data.environment,
        timeZone: parsed.data.timeZone,
      },
      update: {
        userId: user.id,
        environment: parsed.data.environment,
        timeZone: parsed.data.timeZone,
        lastSeenAt: now,
      },
    });
    if (parsed.data.timeZone) {
      const fallbackPreferences = await prisma.boardNotificationPreference.findMany({
        where: { userId: user.id, timeZoneSource: "fallback" },
        select: { id: true, digestHourLocal: true },
      });
      await Promise.all(fallbackPreferences.map((preference) =>
        prisma.boardNotificationPreference.update({
          where: { id: preference.id },
          data: {
            timeZone: parsed.data.timeZone,
            timeZoneSource: "device",
            nextDigestAt: nextAdvisorDigestAt(
              now,
              parsed.data.timeZone!,
              preference.digestHourLocal,
            ) ?? undefined,
          },
        })));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    await sendOperationalAlert(error, { area: "mobile_api", operation: "register_push_device", requestId: request.headers.get("x-homeboard-request-id") });
    const message = error instanceof Error ? error.message : "Unable to register device.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to register device." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const parsed = schema.pick({ token: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid device token." }, { status: 400 });
    await prisma.pushDevice.deleteMany({ where: { userId: user.id, token: parsed.data.token.toLowerCase() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await sendOperationalAlert(error, { area: "mobile_api", operation: "unregister_push_device", requestId: request.headers.get("x-homeboard-request-id") });
    const message = error instanceof Error ? error.message : "Unable to unregister device.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to unregister device." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
