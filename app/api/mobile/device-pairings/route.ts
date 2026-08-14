import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createDeviceApprovalCode,
  DEVICE_PAIRING_LIFETIME_MS,
  devicePairingDeepLink,
  hashDevicePairingValue,
  noStoreJsonHeaders,
  requestFingerprint,
} from "@/lib/device-pairing";
import { prisma } from "@/lib/prisma";

const createPairingSchema = z.object({
  deviceName: z.string().trim().min(1).max(100),
  clientSecretHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function POST(request: Request) {
  const headers = noStoreJsonHeaders();
  try {
    const parsed = createPairingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid device pairing request." }, { status: 400, headers });
    }

    const fingerprint = requestFingerprint(request);
    const recentCount = await prisma.devicePairing.count({
      where: {
        requestFingerprint: fingerprint,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });
    if (recentCount >= 6) {
      return NextResponse.json(
        { error: "Too many pairing requests. Wait a minute and try again." },
        { status: 429, headers },
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEVICE_PAIRING_LIFETIME_MS);
    const approvalCode = createDeviceApprovalCode();
    const pairing = await prisma.devicePairing.create({
      data: {
        deviceName: parsed.data.deviceName,
        clientSecretHash: parsed.data.clientSecretHash,
        approvalCodeHash: hashDevicePairingValue(approvalCode),
        requestFingerprint: fingerprint,
        expiresAt,
      },
      select: { id: true, deviceName: true, expiresAt: true },
    });

    return NextResponse.json(
      {
        id: pairing.id,
        deviceName: pairing.deviceName,
        approvalCode,
        expiresAt: pairing.expiresAt.toISOString(),
        deepLink: devicePairingDeepLink(pairing.id, approvalCode, pairing.deviceName),
      },
      { status: 201, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start device pairing.";
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}
