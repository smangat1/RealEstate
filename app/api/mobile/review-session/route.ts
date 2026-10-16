import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";

const REVIEWER_EMAIL = "app-review@joinhomeboard.com";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { inviteCode?: unknown };
    const inviteCode = typeof body.inviteCode === "string"
      ? body.inviteCode.trim().toUpperCase()
      : "";
    const demoInviteCode = (process.env.DEMO_BOARD_INVITE_CODE ?? "REVIEW2026")
      .trim()
      .toUpperCase();

    if (!inviteCode || inviteCode !== demoInviteCode) {
      return NextResponse.json({ error: "This review invitation is not available." }, { status: 404 });
    }

    const invitation = await prisma.boardInvitation.findUnique({
      where: { inviteCode },
      select: { status: true },
    });
    if (invitation?.status !== "pending") {
      return NextResponse.json({ error: "This review invitation is not available." }, { status: 404 });
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: REVIEWER_EMAIL,
      options: { data: { displayName: "App Review" } },
    });
    if (linkError || !linkData.properties?.hashed_token) {
      throw linkError ?? new Error("Unable to create the review session link.");
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (authError || !authData.session || !authData.user) {
      throw authError ?? new Error("Unable to verify the review session.");
    }

    const metadataName = authData.user.user_metadata?.displayName;
    const displayName = typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : "App Review";

    return NextResponse.json({
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      userId: authData.user.id,
      email: authData.user.email ?? REVIEWER_EMAIL,
      displayName,
    });
  } catch {
    return NextResponse.json({ error: "Unable to continue with the review invitation." }, { status: 500 });
  }
}
