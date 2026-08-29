import { NextResponse } from "next/server";
import { z } from "zod";

import { createBoardInvitation, revokeBoardInvitation } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";

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

    const invitation = await createBoardInvitation(parsed.data.boardId, user.id);

    return NextResponse.json({
      invitation,
      inviteUrl: `${new URL(request.url).origin}/invite/${invitation.inviteCode}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create invitation.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
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
    const message = error instanceof Error ? error.message : "Unable to revoke invitation.";
    const status = message === "MOBILE_AUTH_REQUIRED" ? 401 : message.includes("Only the workspace owner") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
