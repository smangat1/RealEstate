import { NextResponse } from "next/server";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { requireAdvisorListingAccess } from "@/lib/advisor-auth";
import { getListingChangeHistory } from "@/lib/advisor-service";

export async function GET(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    const boardListing = await requireAdvisorListingAccess(id, listingId, user.id);
    return NextResponse.json({ changes: await getListingChangeHistory(boardListing.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load listing history.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Listing not found." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 404 },
    );
  }
}
