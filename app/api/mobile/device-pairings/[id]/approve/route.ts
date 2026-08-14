import { NextResponse } from "next/server";
import { z } from "zod";

import {
  DEVICE_PAIRING_MAX_APPROVAL_ATTEMPTS,
  matchesDevicePairingHash,
  noStoreJsonHeaders,
} from "@/lib/device-pairing";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";

const approvalSchema = z.object({
  approvalCode: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = noStoreJsonHeaders();
  let reservedPairingId: string | null = null;
  try {
    const user = await requireMobileAppUser(request);
    const parsed = approvalSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid pairing approval." }, { status: 400, headers });
    }

    const { id } = await context.params;
    const pairing = await prisma.devicePairing.findUnique({ where: { id } });
    if (!pairing) {
      return NextResponse.json({ error: "This pairing request no longer exists." }, { status: 404, headers });
    }
    if (pairing.expiresAt <= new Date()) {
      await prisma.devicePairing.updateMany({
        where: { id, status: { not: "completed" } },
        data: { status: "expired", tokenHash: null },
      });
      return NextResponse.json({ error: "This QR code expired. Refresh it on the Mac." }, { status: 410, headers });
    }
    if (!matchesDevicePairingHash(parsed.data.approvalCode, pairing.approvalCodeHash)) {
      const attempts = pairing.approvalAttempts + 1;
      await prisma.devicePairing.updateMany({
        where: { id, status: "pending" },
        data: {
          approvalAttempts: { increment: 1 },
          status: attempts >= DEVICE_PAIRING_MAX_APPROVAL_ATTEMPTS ? "cancelled" : "pending",
        },
      });
      return NextResponse.json(
        { error: attempts >= DEVICE_PAIRING_MAX_APPROVAL_ATTEMPTS ? "Pairing locked. Refresh the QR code on the Mac." : "The pairing code does not match." },
        { status: 400, headers },
      );
    }
    if (pairing.status === "approved" && pairing.userId === user.id) {
      return NextResponse.json({ ok: true, deviceName: pairing.deviceName }, { headers });
    }
    if (pairing.status !== "pending") {
      return NextResponse.json({ error: "This pairing request is no longer available." }, { status: 409, headers });
    }
    if (!user.email) {
      return NextResponse.json({ error: "Your Homeboard account needs an email before it can connect a Mac." }, { status: 400, headers });
    }

    const reserved = await prisma.devicePairing.updateMany({
      where: { id, status: "pending" },
      data: { status: "approving", userId: user.id },
    });
    if (reserved.count !== 1) {
      return NextResponse.json({ error: "This pairing is already being approved." }, { status: 409, headers });
    }
    reservedPairingId = id;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
    });
    if (error || !data.properties.hashed_token) {
      throw error ?? new Error("Supabase did not create a device session token.");
    }

    await prisma.devicePairing.update({
      where: { id },
      data: {
        status: "approved",
        tokenHash: data.properties.hashed_token,
        approvedAt: new Date(),
      },
    });
    reservedPairingId = null;

    return NextResponse.json({ ok: true, deviceName: pairing.deviceName }, { headers });
  } catch (error) {
    if (reservedPairingId) {
      await prisma.devicePairing.updateMany({
        where: { id: reservedPairingId, status: "approving" },
        data: { status: "pending", userId: null },
      }).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Unable to approve this Mac.";
    const status = message === "MOBILE_AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? "Sign in on your iPhone before connecting a Mac." : message }, { status, headers });
  }
}
