import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { recordBrokerOutreach, getBrokerOutreachesForBoard } from "@/lib/scout-engine";
import { prisma } from "@/lib/prisma";

// GET /api/mobile/boards/[id]/listings/[listingId]/outreach: list outreach records for this board listing
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    await requireMobileAppUser(req);
    const { id: boardId, listingId } = await params;

    // Resolve boardListingId from boardId + listingId
    const boardListing = await (prisma as any).boardListing.findFirst({
      where: { boardId, listingId },
      select: { id: true },
    });
    if (!boardListing) {
      return NextResponse.json({ outreaches: [] });
    }

    const allOutreaches = await getBrokerOutreachesForBoard(boardId);
    const outreaches = allOutreaches[boardListing.id] ?? [];
    return NextResponse.json({ outreaches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load outreach records.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to load outreach records." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}

// POST /api/mobile/boards/[id]/listings/[listingId]/outreach: record a new outreach
// Body: { method?: "email" | "portal" | "phone", notes?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    const user = await requireMobileAppUser(req);
    const { id: boardId, listingId } = await params;

    const boardListing = await (prisma as any).boardListing.findFirst({
      where: { boardId, listingId },
      select: { id: true },
    });
    if (!boardListing) {
      return NextResponse.json({ error: "Listing not on this board" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const method: "email" | "portal" | "phone" = body.method ?? "email";
    const notes: string | undefined = body.notes;

    const record = await recordBrokerOutreach({
      boardListingId: boardListing.id,
      userId: user.id,
      method,
      notes,
    });
    return NextResponse.json({ outreach: record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record outreach.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to record outreach." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
