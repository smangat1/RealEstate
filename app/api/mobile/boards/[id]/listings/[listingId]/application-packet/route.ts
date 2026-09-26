import { NextResponse } from "next/server";

import { summarizeAdvisorGroupFinances } from "@/lib/advisor-finances";
import { hasAdvisorTestAccess } from "@/lib/advisor-test-access";
import { getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; listingId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, listingId } = await context.params;
    const [data, financeBoard, subscription] = await Promise.all([
      getBoardPageData(id, user.id, { includeSuggestedListings: false, includeCommutes: false }),
      prisma.searchBoard.findUnique({
        where: { id },
        select: {
          userId: true,
          members: { select: { userId: true } },
          advisorFinancialProfiles: {
            select: {
              userId: true,
              annualIncomeMin: true,
              annualIncomeMax: true,
              creditScoreMin: true,
              creditScoreMax: true,
            },
          },
        },
      }),
      prisma.advisorSubscription.findUnique({ where: { boardId: id }, select: { validUntil: true } }),
    ]);
    if (!data || !financeBoard) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    if (!hasAdvisorTestAccess(user)
        && !(subscription?.validUntil && subscription.validUntil >= new Date())) {
      return NextResponse.json({ error: "An active Advisor subscription is required." }, { status: 402 });
    }
    const boardListing = data.boardListings.find((entry) => entry.id === listingId);
    if (!boardListing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });

    const memberIds = new Set([financeBoard.userId, ...financeBoard.members.map((member) => member.userId)]);
    const finances = summarizeAdvisorGroupFinances(
      financeBoard.advisorFinancialProfiles.filter((profile) => memberIds.has(profile.userId)),
      memberIds.size,
    );
    const readiness = data.profile.rentalReadiness;
    const documents = [
      { id: "proof_of_income", label: "Proof of income", ready: readiness?.hasProofOfIncome === true, privacy: "Attach from Files when sending; Homeboard does not store the document." },
      { id: "offer_letter", label: "Offer or employment letter", ready: readiness?.hasOfferLetter === true, privacy: "Attach from Files when sending; Homeboard does not store the document." },
      { id: "identification", label: "Government identification", ready: false, privacy: "Attach only through the verified application channel. Never send it in board chat." },
      { id: "references", label: "References", ready: false, privacy: "Optional until the broker or landlord requests them." },
    ];
    const listingName = [boardListing.listing.address, boardListing.listing.unit ? `Unit ${boardListing.listing.unit}` : null]
      .filter(Boolean).join(" · ") || "Saved rental";
    const hasCombinedRange = finances.contributorCount > 1
      && finances.combinedAnnualIncomeMin !== null
      && finances.combinedAnnualIncomeMax !== null
      && finances.creditScoreMin !== null
      && finances.creditScoreMax !== null;
    const incomeLine = hasCombinedRange
      ? `$${finances.combinedAnnualIncomeMin?.toLocaleString()}–$${finances.combinedAnnualIncomeMax?.toLocaleString()} combined annual income`
      : "Combined financial ranges available on request";
    const creditLine = hasCombinedRange
      ? `${finances.creditScoreMin}–${finances.creditScoreMax} group credit range`
      : "Credit range available on request";
    const readyCount = documents.filter((document) => document.ready).length;
    const shareText = [
      `Application cover sheet: ${listingName}`,
      "",
      incomeLine,
      creditLine,
      `Move-in: ${data.profile.moveInDate || data.profile.moveInTimeframe || "confirm with applicants"}`,
      `Household: ${memberIds.size} applicant${memberIds.size === 1 ? "" : "s"}`,
      "",
      `Documents marked ready: ${documents.filter((document) => document.ready).map((document) => document.label).join(", ") || "none yet"}.`,
      "Sensitive documents must be attached separately through the verified application channel.",
    ].join("\n");

    return NextResponse.json({
      listingId,
      listingName,
      generatedAt: new Date().toISOString(),
      finances,
      documents,
      readyCount,
      totalCount: documents.length,
      shareText,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json(
      { error: unauthorized ? "Unauthorized" : "Unable to prepare the application packet." },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
