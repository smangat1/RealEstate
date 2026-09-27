import { NextResponse } from "next/server";

import { REPLY_LOGGABLE_OUTREACH_STATUSES } from "@/lib/advisor-proactive-logic";
import { hasAdvisorTestAccess } from "@/lib/advisor-test-access";
import { getBoardPageData } from "@/lib/board-data";
import { listingContactInfo } from "@/lib/mobile-payloads";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const [data, subscription] = await Promise.all([
      getBoardPageData(id, user.id, { includeSuggestedListings: false, includeCommutes: false }),
      prisma.advisorSubscription.findUnique({ where: { boardId: id }, select: { validUntil: true } }),
    ]);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    if (!hasAdvisorTestAccess(user)
        && !(subscription?.validUntil && subscription.validUntil >= new Date())) {
      return NextResponse.json({ error: "An active Advisor subscription is required." }, { status: 402 });
    }

    const records = await prisma.brokerOutreachRecord.findMany({
      where: {
        status: { in: [...REPLY_LOGGABLE_OUTREACH_STATUSES] },
        boardListing: { boardId: id, deletedAt: null },
      },
      orderBy: [
        { contactedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 100,
      select: {
        id: true,
        boardListingId: true,
        method: true,
        status: true,
        contactedAt: true,
        createdAt: true,
        boardListing: {
          select: {
            listing: {
              select: { address: true, unit: true, neighborhood: true, providerData: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      threads: records.map((record) => {
        const listing = record.boardListing.listing;
        const contact = listingContactInfo(listing);
        const listingName = [
          listing.address || listing.neighborhood || "Listing",
          listing.unit ? `Unit ${listing.unit}` : null,
        ].filter(Boolean).join(" · ");
        return {
          id: record.id,
          outreachId: record.id,
          listingId: record.boardListingId,
          listingName,
          recipientName: contact?.agentName || contact?.brokerage || null,
          method: record.method,
          status: record.status,
          contactedAt: (record.contactedAt ?? record.createdAt).toISOString(),
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load outreach threads.";
    return NextResponse.json({
      error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to load outreach threads.",
    }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
