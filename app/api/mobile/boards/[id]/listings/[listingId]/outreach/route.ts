import { NextResponse } from "next/server";
import { z } from "zod";

import { createInquiryDraft, getListingInquiries, updateInquiry } from "@/lib/advisor-service";
import { requireAdvisorListingAccess } from "@/lib/advisor-auth";
import { requireMobileAppUser } from "@/lib/mobile-auth";

const createSchema = z.object({
  templateKey: z.enum([
    "availability",
    "tour_request",
    "fee_clarification",
    "application_requirements",
    "follow_up",
  ]).default("availability"),
}).strict();

const updateSchema = z.object({
  inquiryId: z.string().trim().min(1).max(160),
  status: z.enum(["drafted", "sent", "answered", "stale"]),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().max(8_000).optional(),
  method: z.enum(["email", "portal", "phone"]).optional(),
  replyText: z.string().trim().max(12_000).optional(),
  reviewConfirmed: z.literal(true).optional(),
}).strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await params;
    const boardListing = await requireAdvisorListingAccess(id, listingId, user.id);
    return NextResponse.json({ inquiries: await getListingInquiries(boardListing.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load inquiry history.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Listing not found." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 404 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await params;
    const boardListing = await requireAdvisorListingAccess(id, listingId, user.id);
    const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid inquiry template." }, { status: 400 });
    const result = await createInquiryDraft({
      boardListingId: boardListing.id,
      userId: user.id,
      templateKey: parsed.data.templateKey,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create inquiry draft.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to create inquiry draft." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await params;
    const boardListing = await requireAdvisorListingAccess(id, listingId, user.id);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid inquiry update." }, { status: 400 });
    if (parsed.data.status === "sent" && parsed.data.reviewConfirmed !== true) {
      return NextResponse.json({ error: "Review the inquiry before marking it sent." }, { status: 400 });
    }
    const inquiry = await updateInquiry({ boardListingId: boardListing.id, ...parsed.data });
    return NextResponse.json({ inquiry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update inquiry.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to update inquiry." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
