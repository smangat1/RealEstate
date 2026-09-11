import { NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { createBoardInvitation, revokeBoardInvitation } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";

const createInvitationSchema = z.object({
  boardId: z.string().min(1).max(120),
});

const revokeInvitationSchema = z.object({ invitationId: z.string().min(1).max(120) });

export async function POST(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const body = await request.json().catch(() => null);
    const parsed = createInvitationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invite payload." }, { status: 400 });
    }

    assertThrottle({
      scope: "mobile-board-invite",
      key: `${user.id}:${parsed.data.boardId}`,
      limit: 10,
      windowMs: 10 * 60 * 1_000,
      message: "Too many invite links were created recently. Please wait before trying again.",
    });

    const invitation = await createBoardInvitation(parsed.data.boardId, user.id);

    return NextResponse.json({
      invitation,
      inviteUrl: `${new URL(request.url).origin}/invite/${invitation.inviteCode}`,
    });
  } catch (error) {
    await sendOperationalAlert(error, { area: "mobile_api", operation: "create_invitation", requestId: request.headers.get("x-homeboard-request-id") });
    const message = error instanceof Error ? error.message : "Unable to create invitation.";
    return NextResponse.json(
      {
        error: message === "MOBILE_AUTH_REQUIRED"
          ? "Unauthorized"
          : isThrottleError(error)
            ? message
            : "Unable to create invitation.",
      },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const parsed = revokeInvitationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });
    await revokeBoardInvitation(parsed.data.invitationId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await sendOperationalAlert(error, { area: "mobile_api", operation: "revoke_invitation", requestId: request.headers.get("x-homeboard-request-id") });
    const message = error instanceof Error ? error.message : "Unable to revoke invitation.";
    const status = message === "MOBILE_AUTH_REQUIRED" ? 401 : message.includes("Only the workspace owner") ? 403 : 500;
    return NextResponse.json(
      {
        error: status === 401
          ? "Unauthorized"
          : status === 403
            ? "Only the workspace owner can revoke invitations."
            : "Unable to revoke invitation.",
      },
      { status },
    );
  }
}
