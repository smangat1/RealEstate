import { NextResponse } from "next/server";

import { getBoardPageData } from "@/lib/board-data";
import { markCatalogSourceOpened } from "@/lib/catalog-listing-sources";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sourceId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, sourceId } = await context.params;
    await markCatalogSourceOpened({
      catalogSourceId: sourceId,
      boardId: id,
      userId: user.id,
    });
    const data = await getBoardPageData(id, user.id);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      board: buildMobileBoardPayload(data),
      profile: data.profile,
      missingFields: data.missingFields,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open the listing source.";
    return NextResponse.json(
      { error: message },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 400 },
    );
  }
}
