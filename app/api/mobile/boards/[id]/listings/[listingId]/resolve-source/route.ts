import { NextResponse } from "next/server";

import { getBoardPageData } from "@/lib/board-data";
import { resolveListingSourceWithBrave } from "@/lib/listing-source-resolver";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    const data = await getBoardPageData(id, user.id);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const boardListing = data.boardListings.find((entry) => entry.id === listingId);
    if (!boardListing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }
    const roommate = data.roommates.find((entry) => entry.linkedUserId === user.id);
    if (!roommate) {
      return NextResponse.json({ error: "Complete your member profile first." }, { status: 409 });
    }

    const resolution = await resolveListingSourceWithBrave(boardListing.listingId);
    if (resolution.status === "exact_match") {
      const sources = await prisma.catalogListingSource.findMany({
        where: {
          listingId: boardListing.listingId,
          resolutionStatus: "exact_match",
          trustStatus: "verified",
        },
      });
      for (const source of sources) {
        await prisma.boardListingSource.upsert({
          where: {
            boardListingId_url: {
              boardListingId: listingId,
              url: source.canonicalUrl,
            },
          },
          create: {
            boardListingId: listingId,
            catalogSourceId: source.id,
            url: source.canonicalUrl,
            label: `${source.provider} verified listing`,
            kind: "imported_exact",
            createdByRoommateId: roommate.id,
            confirmedAt: new Date(),
          },
          update: {
            catalogSourceId: source.id,
            label: `${source.provider} verified listing`,
            kind: "imported_exact",
            confirmedAt: new Date(),
          },
        });
      }
    }

    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      resolution,
      board: buildMobileBoardPayload(next),
      profile: next.profile,
      missingFields: next.missingFields,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve a listing source.";
    const status =
      message === "MOBILE_AUTH_REQUIRED" ? 401
      : message.includes("not configured") ? 503
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
