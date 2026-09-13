import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdvisorListingAccess } from "@/lib/advisor-auth";
import {
  ensureApplicationChecklist,
  getApplicationChecklist,
  updateApplicationItem,
} from "@/lib/advisor-service";
import { requireMobileAppUser } from "@/lib/mobile-auth";

const updateSchema = z.object({
  itemId: z.string().trim().min(1).max(160),
  status: z.enum(["missing", "ready", "submitted", "waived"]),
  detail: z.string().trim().max(1_000).nullable().optional(),
}).strict();

export async function GET(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    const boardListing = await requireAdvisorListingAccess(id, listingId, user.id);
    let items = await getApplicationChecklist(boardListing.id);
    if (items.length === 0) items = await ensureApplicationChecklist(boardListing.id);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load application checklist.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to load application checklist." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; listingId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    const boardListing = await requireAdvisorListingAccess(id, listingId, user.id);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid checklist update." }, { status: 400 });
    const item = await updateApplicationItem({ boardListingId: boardListing.id, ...parsed.data });
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update application checklist.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to update application checklist." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
