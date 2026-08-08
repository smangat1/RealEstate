import { NextResponse } from "next/server";

import { acceptBoardInvitation, getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { code } = await context.params;
    const boardId = await acceptBoardInvitation(code.trim().toUpperCase(), user.id);
    const data = await getBoardPageData(boardId, user.id);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({ boardId, board: buildMobileBoardPayload(data), profile: data.profile, missingFields: data.missingFields });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to accept invitation.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 400 });
  }
}
