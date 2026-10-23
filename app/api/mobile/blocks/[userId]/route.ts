import { NextResponse } from "next/server";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { userId } = await context.params;
    await prisma.userBlock.deleteMany({
      where: { blockerUserId: user.id, blockedUserId: userId },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "unblock_user",
      requestId: request.headers.get("x-homeboard-request-id"),
    });
    const message = error instanceof Error ? error.message : "Unable to unblock user.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to unblock user." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
