import { NextResponse } from "next/server";

import { getRecentBoardsForUser } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { mapBoardSummaryForMobile } from "@/lib/mobile-payloads";

export async function GET(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const boards = await getRecentBoardsForUser(user.id, 20);
    return NextResponse.json({
      user: { id: user.id, email: user.email, displayName: user.displayName },
      boards: boards.map(mapBoardSummaryForMobile),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
