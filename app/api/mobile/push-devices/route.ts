import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  token: z.string().regex(/^[a-fA-F0-9]{32,256}$/),
  environment: z.enum(["development", "production"]).default("development"),
});

export async function POST(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid device token." }, { status: 400 });
    await prisma.pushDevice.upsert({
      where: { token: parsed.data.token.toLowerCase() },
      create: {
        userId: user.id,
        token: parsed.data.token.toLowerCase(),
        environment: parsed.data.environment,
      },
      update: {
        userId: user.id,
        environment: parsed.data.environment,
        lastSeenAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to register device.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
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
    const message = error instanceof Error ? error.message : "Unable to unregister device.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
