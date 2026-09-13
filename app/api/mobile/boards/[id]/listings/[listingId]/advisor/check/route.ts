import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { requireAdvisorListingAccess } from "@/lib/advisor-auth";
import { checkListingAgain } from "@/lib/listing-monitor";

const observationSchema = z.object({
  sourceUrl: z.string().url().nullable(),
  price: z.number().int().nonnegative().nullable(),
  fees: z.record(z.string(), z.unknown()).default({}),
  availableDate: z.string().datetime().nullable(),
  status: z.enum(["active", "unknown", "removed", "rented", "saved_only"]),
  providerStatus: z.string().trim().max(160).nullable(),
  observedAt: z.string().datetime(),
  sourceFacts: z.record(z.string(), z.unknown()).default({}),
}).strict();

const schema = z.object({ observation: observationSchema.optional() }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    const boardListing = await requireAdvisorListingAccess(id, listingId, user.id);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid listing observation." }, { status: 400 });
    const result = await checkListingAgain(boardListing.id, parsed.data.observation);
    return NextResponse.json({
      ...result,
      message: result.changes.length === 0
        ? "No price, fee, availability, or status change was found."
        : `${result.changes.length} listing change${result.changes.length === 1 ? " was" : "s were"} found.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check this listing.";
    if (message === "LISTING_SOURCE_REQUIRES_DEVICE_REVIEW") {
      return NextResponse.json({ error: "Open the source on this device, then run Check listing again from the share review." }, { status: 409 });
    }
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to check this listing." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
