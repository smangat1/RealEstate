import { NextResponse } from "next/server";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const mode = new URL(request.url).searchParams.get("mode");
    const isDevelopmentAccount = user.email.trim().toLowerCase() === "demoaccount@homeboard.local";

    if (mode === "wipe") {
      if (!isDevelopmentAccount) {
        return NextResponse.json(
          { error: "Account wiping is only available for the development account." },
          { status: 403 },
        );
      }

      if (user.authUserId) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user.authUserId, {
          user_metadata: {
            displayName: user.displayName,
            workAddress: null,
            secondaryWorkAddress: null,
            city: null,
            moveInDate: null,
            budgetMin: null,
            budgetMax: null,
            stretchBudget: null,
            neighborhoods: null,
            commuteTarget: null,
            minCommuteMinutes: null,
            maxCommuteMinutes: null,
            mustHaves: null,
            dealbreakers: null,
            niceToHaves: null,
            priorities: null,
            pets: null,
            parking: null,
            groupSize: null,
            hasRoommates: null,
            rentalReadiness: null,
          },
        });
        if (error) throw error;
      }

      await prisma.$transaction(async (transaction) => {
        await transaction.roommateProfile.deleteMany({ where: { linkedUserId: user.id } });
        await transaction.user.delete({ where: { id: user.id } });
      });

      return NextResponse.json({ ok: true, wiped: true });
    }

    if (isDevelopmentAccount) {
      return NextResponse.json(
        { error: "Use Wipe account for the development login." },
        { status: 400 },
      );
    }

    // Cascades remove owned boards, memberships, profile data, devices, and board content.
    await prisma.user.delete({ where: { id: user.id } });
    if (user.authUserId) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.authUserId);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete account.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
