import { NextResponse } from "next/server";

import { matchesDevicePairingHash, noStoreJsonHeaders } from "@/lib/device-pairing";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = noStoreJsonHeaders();
  try {
    const user = await requireMobileAppUser(request);
    const clientSecret = request.headers.get("x-homeboard-pairing-secret")?.trim();
    const { id } = await context.params;
    const pairing = await prisma.devicePairing.findUnique({ where: { id } });

    if (!clientSecret || !pairing || !matchesDevicePairingHash(clientSecret, pairing.clientSecretHash)) {
      return NextResponse.json({ error: "Device pairing authorization required." }, { status: 401, headers });
    }
    if (pairing.userId !== user.id) {
      return NextResponse.json({ error: "This Mac was approved for a different account." }, { status: 403, headers });
    }
    if (pairing.status === "completed") {
      return NextResponse.json({ ok: true }, { headers });
    }
    if (pairing.status !== "approved") {
      return NextResponse.json({ error: "This pairing is not ready to complete." }, { status: 409, headers });
    }

    await prisma.devicePairing.update({
      where: { id },
      data: { status: "completed", completedAt: new Date(), tokenHash: null },
    });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete device pairing.";
    const status = message === "MOBILE_AUTH_REQUIRED" ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? "The new Mac session could not be verified." : message }, { status, headers });
  }
}
