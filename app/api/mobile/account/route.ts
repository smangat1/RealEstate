import { NextResponse } from "next/server";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(request: Request) {
  try {
    const user = await requireMobileAppUser(request);

    // Cascades remove owned boards, memberships, profile data, devices, and board content.
    await prisma.user.delete({ where: { id: user.id } });
    if (user.authUserId) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.authUserId);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "delete_account",
      requestId: request.headers.get("x-homeboard-request-id"),
      severity: "critical",
    });
    const message = error instanceof Error ? error.message : "Unable to delete account.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
