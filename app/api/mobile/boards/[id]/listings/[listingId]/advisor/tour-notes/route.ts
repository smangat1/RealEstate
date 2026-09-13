import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdvisorListingAccess } from "@/lib/advisor-auth";
import { saveTourNote } from "@/lib/advisor-service";
import { requireMobileAppUser } from "@/lib/mobile-auth";

const schema = z.object({ transcript: z.string().trim().min(3).max(20_000) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    const boardListing = await requireAdvisorListingAccess(id, listingId, user.id);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Add a tour note to organize." }, { status: 400 });
    return NextResponse.json(await saveTourNote({
      boardListingId: boardListing.id,
      authorUserId: user.id,
      transcript: parsed.data.transcript,
    }), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save tour notes.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to save tour notes." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
