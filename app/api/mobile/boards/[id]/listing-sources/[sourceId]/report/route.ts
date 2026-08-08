import { NextResponse } from "next/server";
import { z } from "zod";

import { getBoardPageData } from "@/lib/board-data";
import { reportCatalogSource } from "@/lib/catalog-listing-sources";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

const schema = z.object({
  reason: z.enum([
    "incorrect_unit",
    "unavailable",
    "conflicting_details",
    "broken_link",
    "other",
  ]),
  details: z.string().trim().max(2_000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sourceId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, sourceId } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose a valid report reason." }, { status: 400 });
    }
    await reportCatalogSource({
      catalogSourceId: sourceId,
      boardId: id,
      userId: user.id,
      reason: parsed.data.reason,
      details: parsed.data.details,
    });
    const data = await getBoardPageData(id, user.id);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      board: buildMobileBoardPayload(data),
      profile: data.profile,
      missingFields: data.missingFields,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to report the listing source.";
    return NextResponse.json(
      { error: message },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 400 },
    );
  }
}
