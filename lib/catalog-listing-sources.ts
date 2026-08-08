import "server-only";

import type {
  ListingSourceReportReason,
  ListingSourceTrustStatus,
} from "@prisma/client";

import {
  assertSpecificListingUrl,
  detectListingProvider,
  evaluateExactListingMatch,
  listingIdentityFingerprint,
  type ListingMatchFacts,
} from "@/lib/listing-sources";
import {
  deriveListingSourceTrustStatus,
  listingSourceTrustWarning,
  sourceIsGloballyDiscoverable,
} from "@/lib/listing-source-policy";
import { prisma } from "@/lib/prisma";

type SourceActor = {
  userId: string;
  boardId: string;
  roommateId: string;
};

function listingFacts(listing: {
  address: string | null;
  unit: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
}): ListingMatchFacts {
  return {
    address: listing.address,
    unit: listing.unit,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
  };
}

async function requireSourceActor(
  userId: string,
  boardId: string,
): Promise<SourceActor> {
  const [membership, roommate] = await Promise.all([
    prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { id: true },
    }),
    prisma.roommateProfile.findFirst({
      where: { boardId, linkedUserId: userId },
      select: { id: true },
    }),
  ]);

  if (!membership || !roommate) {
    throw new Error("Complete your member profile before reviewing listing sources.");
  }
  return { userId, boardId, roommateId: roommate.id };
}

async function sourceIsAccessibleFromBoard(
  catalogSourceId: string,
  boardId: string,
) {
  const source = await prisma.catalogListingSource.findUnique({
    where: { id: catalogSourceId },
    select: {
      trustStatus: true,
      boardSources: {
        where: { boardListing: { boardId } },
        select: { id: true },
        take: 1,
      },
    },
  });
  return Boolean(
    source
      && (
        source.boardSources.length > 0
        || sourceIsGloballyDiscoverable(source.trustStatus)
      ),
  );
}

export async function recomputeCatalogSourceTrust(catalogSourceId: string) {
  const source = await prisma.catalogListingSource.findUnique({
    where: { id: catalogSourceId },
    include: {
      boardSources: {
        select: { boardListing: { select: { boardId: true } } },
      },
      attestations: {
        where: { attestedAt: { not: null } },
        select: { userId: true, boardId: true },
      },
      reports: { select: { id: true } },
    },
  });
  if (!source) throw new Error("Listing source not found.");

  const distinctBoardSubmissions = new Set(
    source.boardSources.map((entry) => entry.boardListing.boardId),
  ).size;
  const distinctAttestedUsers = new Set(
    source.attestations.map((entry) => entry.userId),
  ).size;
  const distinctAttestedBoards = new Set(
    source.attestations.map((entry) => entry.boardId),
  ).size;
  const status = deriveListingSourceTrustStatus({
    distinctBoardSubmissions,
    distinctAttestedUsers,
    distinctAttestedBoards,
    hasOpenConflict: source.reports.length > 0,
    resolverExact: source.resolutionStatus === "exact_match",
    adminVerified:
      source.trustStatus === "verified" && source.verifiedByUserId !== null,
    adminRejected: source.trustStatus === "rejected",
  });

  if (status !== source.trustStatus) {
    await prisma.catalogListingSource.update({
      where: { id: catalogSourceId },
      data: {
        trustStatus: status,
        verifiedAt: status === "verified" ? source.verifiedAt ?? new Date() : null,
      },
    });
  }

  return {
    status,
    distinctBoardSubmissions,
    distinctAttestedUsers,
    distinctAttestedBoards,
    warning: listingSourceTrustWarning(status),
    globallyDiscoverable: sourceIsGloballyDiscoverable(status),
  };
}

export async function submitBoardListingSource(input: {
  boardListingId: string;
  userId: string;
  url: string;
  label?: string;
}) {
  const boardListing = await prisma.boardListing.findUnique({
    where: { id: input.boardListingId },
    include: {
      listing: true,
      board: { select: { id: true } },
    },
  });
  if (!boardListing) throw new Error("Listing not found.");
  const actor = await requireSourceActor(input.userId, boardListing.boardId);

  const canonicalUrl = assertSpecificListingUrl(input.url);
  const facts = listingFacts(boardListing.listing);
  const identityFingerprint = listingIdentityFingerprint(facts);
  const provider = detectListingProvider(canonicalUrl);
  let catalogSource = await prisma.catalogListingSource.findUnique({
    where: { canonicalUrl },
    include: {
      listing: {
        include: {
          priceHistory: {
            select: { price: true },
          },
        },
      },
    },
  });

  let conflictReason: string | null = null;
  if (catalogSource) {
    const match = evaluateExactListingMatch(
      listingFacts(catalogSource.listing),
      facts,
    );
    const onlyPriceMismatch =
      match.status === "mismatch"
      && match.reasons.length === 1
      && match.reasons[0] === "Different rent.";
    const knownPrice = boardListing.listing.price;
    const priceWasPreviouslyObserved =
      knownPrice !== null
      && catalogSource.listing.priceHistory.some((entry) => entry.price === knownPrice);

    if (match.status !== "exact" && !(onlyPriceMismatch && priceWasPreviouslyObserved)) {
      conflictReason = match.reasons.join(" ") || "The submitted facts do not identify the same unit.";
      catalogSource = await prisma.catalogListingSource.update({
        where: { id: catalogSource.id },
        data: {
          trustStatus: "review_hold",
          reviewReason: conflictReason,
        },
        include: {
          listing: {
            include: { priceHistory: { select: { price: true } } },
          },
        },
      });
    }
  } else {
    catalogSource = await prisma.catalogListingSource.create({
      data: {
        listingId: boardListing.listingId,
        canonicalUrl,
        originalUrl: input.url.trim(),
        provider,
        identityFingerprint,
      },
      include: {
        listing: {
          include: { priceHistory: { select: { price: true } } },
        },
      },
    });
  }

  const boardSource = await prisma.boardListingSource.upsert({
    where: {
      boardListingId_url: {
        boardListingId: input.boardListingId,
        url: canonicalUrl,
      },
    },
    create: {
      boardListingId: input.boardListingId,
      catalogSourceId: catalogSource.id,
      url: canonicalUrl,
      label: input.label?.trim() || `${provider} listing`,
      kind: "confirmed_exact",
      createdByRoommateId: actor.roommateId,
      confirmedAt: new Date(),
    },
    update: {
      catalogSourceId: catalogSource.id,
      label: input.label?.trim() || `${provider} listing`,
      kind: "confirmed_exact",
      createdByRoommateId: actor.roommateId,
      confirmedAt: new Date(),
    },
  });

  if (conflictReason) {
    await prisma.catalogSourceReport.create({
      data: {
        catalogSourceId: catalogSource.id,
        boardId: actor.boardId,
        userId: actor.userId,
        roommateId: actor.roommateId,
        reason: "conflicting_details",
        details: conflictReason,
      },
    });
  }

  const trust = await recomputeCatalogSourceTrust(catalogSource.id);
  return { boardSource, catalogSourceId: catalogSource.id, ...trust };
}

export async function markCatalogSourceOpened(input: {
  catalogSourceId: string;
  boardId: string;
  userId: string;
}) {
  const actor = await requireSourceActor(input.userId, input.boardId);
  if (!(await sourceIsAccessibleFromBoard(input.catalogSourceId, input.boardId))) {
    throw new Error("This source is not attached to the board.");
  }

  await prisma.catalogSourceAttestation.upsert({
    where: {
      catalogSourceId_userId: {
        catalogSourceId: input.catalogSourceId,
        userId: input.userId,
      },
    },
    create: {
      catalogSourceId: input.catalogSourceId,
      boardId: input.boardId,
      userId: input.userId,
      roommateId: actor.roommateId,
      openedAt: new Date(),
    },
    update: {
      boardId: input.boardId,
      roommateId: actor.roommateId,
      openedAt: new Date(),
    },
  });
}

export async function attestCatalogSourceExact(input: {
  catalogSourceId: string;
  boardId: string;
  userId: string;
}) {
  await requireSourceActor(input.userId, input.boardId);
  if (!(await sourceIsAccessibleFromBoard(input.catalogSourceId, input.boardId))) {
    throw new Error("This source is not attached to the board.");
  }
  const existing = await prisma.catalogSourceAttestation.findUnique({
    where: {
      catalogSourceId_userId: {
        catalogSourceId: input.catalogSourceId,
        userId: input.userId,
      },
    },
  });
  if (!existing?.openedAt) {
    throw new Error("Open the original listing before confirming it.");
  }

  await prisma.catalogSourceAttestation.update({
    where: { id: existing.id },
    data: { attestedAt: new Date() },
  });
  return recomputeCatalogSourceTrust(input.catalogSourceId);
}

export async function reportCatalogSource(input: {
  catalogSourceId: string;
  boardId: string;
  userId: string;
  reason: ListingSourceReportReason;
  details?: string;
}) {
  const actor = await requireSourceActor(input.userId, input.boardId);
  if (!(await sourceIsAccessibleFromBoard(input.catalogSourceId, input.boardId))) {
    throw new Error("This source is not attached to the board.");
  }

  await prisma.$transaction([
    prisma.catalogSourceReport.create({
      data: {
        catalogSourceId: input.catalogSourceId,
        boardId: input.boardId,
        userId: input.userId,
        roommateId: actor.roommateId,
        reason: input.reason,
        details: input.details?.trim().slice(0, 2_000) || null,
      },
    }),
    prisma.catalogListingSource.update({
      where: { id: input.catalogSourceId },
      data: {
        trustStatus: "review_hold",
        reviewReason: input.details?.trim().slice(0, 2_000) || input.reason.replaceAll("_", " "),
      },
    }),
  ]);
  return recomputeCatalogSourceTrust(input.catalogSourceId);
}

export function isHomeboardAdmin(email: string | null | undefined) {
  const configured = (process.env.HOMEBOARD_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && configured.includes(email.trim().toLowerCase()));
}

export async function adminReviewCatalogSource(input: {
  catalogSourceId: string;
  adminUserId: string;
  adminEmail: string | null;
  decision: "verified" | "rejected";
  note?: string;
}) {
  if (!isHomeboardAdmin(input.adminEmail)) {
    throw new Error("ADMIN_REQUIRED");
  }
  const status: ListingSourceTrustStatus = input.decision;
  const source = await prisma.catalogListingSource.update({
    where: { id: input.catalogSourceId },
    data: {
      trustStatus: status,
      reviewReason: input.note?.trim().slice(0, 2_000) || null,
      verifiedByUserId: status === "verified" ? input.adminUserId : null,
      verifiedAt: status === "verified" ? new Date() : null,
    },
  });
  return {
    status: source.trustStatus,
    warning: listingSourceTrustWarning(source.trustStatus),
    globallyDiscoverable: sourceIsGloballyDiscoverable(source.trustStatus),
  };
}

export async function getCatalogSourceSummary(catalogSourceId: string) {
  return recomputeCatalogSourceTrust(catalogSourceId);
}
