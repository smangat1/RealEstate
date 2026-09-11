import { NextResponse } from "next/server";

import { getBoardPageData, voteOnBoardListingDecision } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { GROUP_DECISION_REQUIRES_TWO_MEMBERS, listingDecisionActionSchema } from "@/lib/board-decisions";

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
    const parsed = listingDecisionActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Poll action is invalid." }, { status: 400 });

    await voteOnBoardListingDecision(listingId, roommate.id, parsed.data.type, parsed.data.choice);
    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({ board: buildMobileBoardPayload(next), profile: next.profile, missingFields: next.missingFields });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save the decision vote.";
    if (message === GROUP_DECISION_REQUIRES_TWO_MEMBERS) {
      return NextResponse.json(
        { error: "Invite at least one other member before starting a group decision." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to save the decision vote." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
