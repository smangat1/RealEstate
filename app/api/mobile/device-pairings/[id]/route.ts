import { NextResponse } from "next/server";

import { matchesDevicePairingHash, noStoreJsonHeaders } from "@/lib/device-pairing";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = noStoreJsonHeaders();
  try {
    const clientSecret = request.headers.get("x-homeboard-pairing-secret")?.trim();
    if (!clientSecret) {
      return NextResponse.json({ error: "Device pairing authorization required." }, { status: 401, headers });
    }

    const { id } = await context.params;
    const pairing = await prisma.devicePairing.findUnique({ where: { id } });
    if (!pairing || !matchesDevicePairingHash(clientSecret, pairing.clientSecretHash)) {
      return NextResponse.json({ error: "Device pairing authorization required." }, { status: 401, headers });
    }

    if (pairing.expiresAt <= new Date() && pairing.status !== "completed") {
      if (pairing.status !== "expired") {
        await prisma.devicePairing.update({
          where: { id },
          data: { status: "expired", tokenHash: null },
        });
      }
      return NextResponse.json(
        { status: "expired", expiresAt: pairing.expiresAt.toISOString() },
        { headers },
      );
    }

    if (pairing.status === "approved" && pairing.tokenHash) {
      return NextResponse.json(
        {
          status: "approved",
          deviceName: pairing.deviceName,
          tokenHash: pairing.tokenHash,
          verificationType: "magiclink",
          expiresAt: pairing.expiresAt.toISOString(),
        },
        { headers },
      );
    }

    const publicStatus = pairing.status === "approving" ? "pending" : pairing.status;
    return NextResponse.json(
      {
        status: publicStatus,
        deviceName: pairing.deviceName,
        expiresAt: pairing.expiresAt.toISOString(),
      },
      { headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check device pairing.";
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = noStoreJsonHeaders();
  try {
    const clientSecret = request.headers.get("x-homeboard-pairing-secret")?.trim();
    const { id } = await context.params;
    const pairing = await prisma.devicePairing.findUnique({ where: { id } });
    if (!clientSecret || !pairing || !matchesDevicePairingHash(clientSecret, pairing.clientSecretHash)) {
      return NextResponse.json({ error: "Device pairing authorization required." }, { status: 401, headers });
    }
    if (["pending", "approving", "approved"].includes(pairing.status)) {
      await prisma.devicePairing.update({
        where: { id },
        data: { status: "cancelled", tokenHash: null },
      });
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel device pairing.";
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}
