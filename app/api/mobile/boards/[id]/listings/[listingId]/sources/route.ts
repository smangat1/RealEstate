import { NextResponse } from "next/server";
import { z } from "zod";

import { attachBoardListingSource, getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

const schema = z.object({
  url: z.string().url().max(2_000),
  label: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(["confirmed_exact", "member_reference"]).default("confirmed_exact"),
});

export async function POST(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    const data = await getBoardPageData(id, user.id);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    if (!data.boardListings.some((entry) => entry.id === listingId)) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }
    const roommate = data.roommates.find((entry) => entry.linkedUserId === user.id);
    if (!roommate) return NextResponse.json({ error: "Complete your member profile first." }, { status: 409 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid source link." }, { status: 400 });

    await attachBoardListingSource(listingId, roommate.id, parsed.data);
    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({ board: buildMobileBoardPayload(next), profile: next.profile, missingFields: next.missingFields });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to attach the source.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
