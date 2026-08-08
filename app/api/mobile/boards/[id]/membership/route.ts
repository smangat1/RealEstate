import { NextResponse } from "next/server";

import { deleteBoardForUser, getBoardPageData, leaveBoard } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const current = await getBoardPageData(id, user.id);
    if (!current) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const action = new URL(request.url).searchParams.get("action");
    if (action === "delete") await deleteBoardForUser(id, user.id);
    else await leaveBoard(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to leave board.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
