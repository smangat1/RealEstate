import { NextResponse } from "next/server";
import { z } from "zod";

import { getBoardPageData, saveBoardListingVote } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

const schema = z.object({
  vote: z.enum(["love", "like", "maybe", "pass", "veto"]),
  note: z.string().trim().max(1000).optional(),
}).superRefine((value, context) => {
  if (value.vote === "veto" && !value.note?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["note"],
      message: "A veto requires a reason.",
    });
  }
});

export async function POST(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    const data = await getBoardPageData(id, user.id);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    if (!data.boardListings.some((entry) => entry.id === listingId)) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    const roommate = data.roommates.find((entry) => entry.linkedUserId === user.id);
    if (!roommate) return NextResponse.json({ error: "Complete your member profile before reacting." }, { status: 409 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });
    await saveBoardListingVote(listingId, roommate.id, parsed.data.vote, parsed.data.note);
    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({ board: buildMobileBoardPayload(next), profile: next.profile, missingFields: next.missingFields });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save reaction.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
