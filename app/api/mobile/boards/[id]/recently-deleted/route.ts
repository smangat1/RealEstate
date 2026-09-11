import { NextResponse } from "next/server";

import {
  clearRecentlyDeletedBoardListings,
  getBoardPageData,
  purgeExpiredRecentlyDeletedBoardListings,
} from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const current = await getBoardPageData(id, user.id);
    if (!current) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    await clearRecentlyDeletedBoardListings(id, user.id);
    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      board: buildMobileBoardPayload(next),
      profile: next.profile,
      missingFields: next.missingFields,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear Recently Deleted.";
    const ownerRequired = message === "RECENTLY_DELETED_OWNER_REQUIRED";
    return NextResponse.json(
      {
        error: message === "MOBILE_AUTH_REQUIRED"
          ? "Unauthorized"
          : ownerRequired
            ? "Only the board owner can permanently clear Recently Deleted."
            : "Unable to clear Recently Deleted.",
      },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : ownerRequired ? 403 : 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    await purgeExpiredRecentlyDeletedBoardListings(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to purge Recently Deleted.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to purge Recently Deleted." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
