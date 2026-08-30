import { NextResponse } from "next/server";

import { getBoardPageData, getRecentBoardsForUser } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload, mapBoardSummaryForMobile } from "@/lib/mobile-payloads";

export async function GET(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const boards = await getRecentBoardsForUser(user.id, 20);
    const includeBoard = new URL(request.url).searchParams.get("includeBoard") === "1";
    const activeBoardData = includeBoard && boards[0]
      ? await getBoardPageData(boards[0].id, user.id, {
          includeSuggestedListings: false,
          includeCommutes: false,
        })
      : null;

    return NextResponse.json({
      user: { id: user.id, email: user.email, displayName: user.displayName },
      boards: boards.map(mapBoardSummaryForMobile),
      activeBoard: activeBoardData
        ? {
            board: buildMobileBoardPayload(activeBoardData),
            profile: activeBoardData.profile,
            missingFields: activeBoardData.missingFields,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
