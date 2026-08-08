import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getBoardPageData,
  updateBoardListingDetails,
  updateBoardListingStatus,
  updateBoardListingWorkflow,
} from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

const patchSchema = z.object({
  status: z.enum(["new", "interested", "maybe", "rejected", "toured", "applied"]).optional(),
  workflowStatus: z.enum(["suggested", "source_confirmed", "considering", "shortlisted", "viewing", "applying", "decided"]).optional(),
  address: z.string().trim().max(240).optional(),
  city: z.string().trim().max(160).optional(),
  neighborhood: z.string().trim().max(160).optional(),
  price: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  bedrooms: z.number().finite().nonnegative().max(50).nullable().optional(),
  bathrooms: z.number().finite().nonnegative().max(50).nullable().optional(),
  description: z.string().trim().max(10_000).optional(),
  sourceUrl: z.string().url().max(2_000).or(z.literal("")).optional(),
  imageUrl: z.string().url().max(2_000).or(z.literal("")).optional(),
  userNotes: z.string().trim().max(5_000).optional(),
});

async function authorized(request: Request, boardId: string, boardListingId: string) {
  const user = await requireMobileAppUser(request);
  const data = await getBoardPageData(boardId, user.id);
  if (!data) return { user, data: null };
  if (!data.boardListings.some((entry) => entry.id === boardListingId)) throw new Error("LISTING_NOT_FOUND");
  return { user, data };
}

function payload(data: NonNullable<Awaited<ReturnType<typeof getBoardPageData>>>) {
  return NextResponse.json({ board: buildMobileBoardPayload(data), profile: data.profile, missingFields: data.missingFields });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const { id, listingId } = await context.params;
    const { user, data } = await authorized(request, id, listingId);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid listing update." }, { status: 400 });

    if (parsed.data.status) await updateBoardListingStatus(listingId, parsed.data.status);
    if (parsed.data.workflowStatus) {
      await updateBoardListingWorkflow(listingId, parsed.data.workflowStatus, user.displayName);
    }
    if (Object.keys(parsed.data).some((key) => !["status", "workflowStatus"].includes(key))) {
      await updateBoardListingDetails(listingId, parsed.data);
    }
    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return payload(next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update listing.";
    const status = message === "MOBILE_AUTH_REQUIRED" ? 401 : message === "LISTING_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message === "LISTING_NOT_FOUND" ? "Listing not found." : message }, { status });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const { id, listingId } = await context.params;
    const { user, data } = await authorized(request, id, listingId);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    await updateBoardListingStatus(listingId, "rejected");
    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return payload(next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to archive listing.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
