import type { Prisma, PropertyType } from "@prisma/client";

import {
  normalizeListingUnit,
  normalizedListingAddressParts,
} from "@/lib/listing-sources";
import { prisma } from "@/lib/prisma";
import type { RentCastRentalListing } from "@/lib/rentcast-client";

const NYC_LATITUDE_RANGE = [40.49, 40.92] as const;
const NYC_LONGITUDE_RANGE = [-74.27, -73.68] as const;
const MAX_LISTING_AGE_DAYS = 14;
const MIN_SAFE_RESPONSE_SIZE = 500;
const MIN_SAFE_ACCEPTED_SIZE = 450;

export type RentCastRejectionReason =
  | "missing_provider_id"
  | "inactive"
  | "incomplete_address"
  | "wrong_location"
  | "invalid_price"
  | "invalid_bedrooms"
  | "invalid_bathrooms"
  | "invalid_coordinates"
  | "missing_last_seen"
  | "stale"
  | "missing_unit"
  | "duplicate_provider_id"
  | "duplicate_address_unit";

export type ValidatedRentCastListing = {
  raw: RentCastRentalListing;
  providerId: string;
  address: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string | null;
  latitude: number;
  longitude: number;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number | null;
  propertyType: PropertyType;
  providerPropertyType: string;
  listedAt: Date | null;
  lastSeenAt: Date;
  identityKey: string;
};

export type RentCastValidationResult = {
  accepted: ValidatedRentCastListing[];
  rejected: Array<{
    providerId: string | null;
    reasons: RentCastRejectionReason[];
  }>;
  rejectedByReason: Record<RentCastRejectionReason, number>;
};

export type ControlledRentCastRefreshAudit = {
  received: number;
  accepted: number;
  rejected: number;
  rejectedByReason: Record<RentCastRejectionReason, number>;
  inserted: number;
  updated: number;
  archived: number;
  preservedBoardLinkedRecords: number;
  trustedSourcesMovedToReviewHold: number;
  priceHistoryEntries: number;
};

function dateOrNull(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundedInteger(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function normalizedPropertyType(value: unknown): PropertyType {
  switch (typeof value === "string" ? value.trim().toLowerCase() : "") {
    case "apartment":
    case "multi-family":
    case "multifamily":
    case "multi family":
      return "apartment";
    case "single family":
    case "single-family":
    case "house":
    case "townhouse":
    case "townhome":
    case "manufactured":
      return "house";
    case "condo":
    case "condominium":
      return "condo";
    default:
      return "unknown";
  }
}

function requiresUnit(providerPropertyType: string, type: PropertyType) {
  const normalized = providerPropertyType.trim().toLowerCase();
  if (type === "condo" || type === "apartment") return true;
  return /apartment|condo|multi[\s-]?family/.test(normalized);
}

function cleanAddressLine(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function listingAddress(listing: RentCastRentalListing) {
  const addressLine1 = cleanAddressLine(listing.addressLine1);
  if (addressLine1) return addressLine1;
  const formatted = cleanAddressLine(listing.formattedAddress);
  if (!formatted) return null;
  return formatted
    .split(",")[0]
    .replace(
      /\b(?:apt|apartment|unit|suite|ste|#)\s*[a-z0-9-]{1,16}\b.*$/i,
      "",
    )
    .trim() || null;
}

function listingUnit(listing: RentCastRentalListing) {
  const addressLine2 = cleanAddressLine(listing.addressLine2);
  if (addressLine2) return normalizeListingUnit(addressLine2);
  const formatted = cleanAddressLine(listing.formattedAddress);
  return normalizedListingAddressParts(formatted, null).unit;
}

function rejectionCounts() {
  return {
    missing_provider_id: 0,
    inactive: 0,
    incomplete_address: 0,
    wrong_location: 0,
    invalid_price: 0,
    invalid_bedrooms: 0,
    invalid_bathrooms: 0,
    invalid_coordinates: 0,
    missing_last_seen: 0,
    stale: 0,
    missing_unit: 0,
    duplicate_provider_id: 0,
    duplicate_address_unit: 0,
  } satisfies Record<RentCastRejectionReason, number>;
}

function withinRange(value: number, range: readonly [number, number]) {
  return value >= range[0] && value <= range[1];
}

export function validateRentCastListing(
  listing: RentCastRentalListing,
  now = new Date(),
): { value: ValidatedRentCastListing | null; reasons: RentCastRejectionReason[] } {
  const reasons: RentCastRejectionReason[] = [];
  const providerId =
    typeof listing.id === "string" && listing.id.trim()
      ? listing.id.trim()
      : null;
  const address = listingAddress(listing);
  const unit = listingUnit(listing);
  const city = cleanAddressLine(listing.city);
  const state = cleanAddressLine(listing.state)?.toUpperCase() ?? null;
  const zip = cleanAddressLine(listing.zipCode);
  const latitude = finiteNumber(listing.latitude);
  const longitude = finiteNumber(listing.longitude);
  const price = roundedInteger(listing.price);
  const bedrooms = finiteNumber(listing.bedrooms);
  const bathrooms = finiteNumber(listing.bathrooms);
  const squareFeet = roundedInteger(listing.squareFootage);
  const listedAt = dateOrNull(listing.listedDate);
  const lastSeenAt = dateOrNull(listing.lastSeenDate);
  const providerPropertyType =
    typeof listing.propertyType === "string" ? listing.propertyType.trim() : "";
  const propertyType = normalizedPropertyType(providerPropertyType);

  if (!providerId || providerId.length > 255) reasons.push("missing_provider_id");
  if (listing.status?.toLowerCase() !== "active") reasons.push("inactive");
  if (!address || !/\d/.test(address) || address.length < 5) {
    reasons.push("incomplete_address");
  }
  if (
    !city
    || !["new york", "new york city", "nyc"].includes(city.toLowerCase())
    || state !== "NY"
  ) {
    reasons.push("wrong_location");
  }
  if (price === null || price < 300 || price > 100_000) {
    reasons.push("invalid_price");
  }
  if (bedrooms === null || bedrooms < 0 || bedrooms > 20) {
    reasons.push("invalid_bedrooms");
  }
  if (bathrooms === null || bathrooms <= 0 || bathrooms > 20) {
    reasons.push("invalid_bathrooms");
  }
  if (
    latitude === null
    || longitude === null
    || !withinRange(latitude, NYC_LATITUDE_RANGE)
    || !withinRange(longitude, NYC_LONGITUDE_RANGE)
  ) {
    reasons.push("invalid_coordinates");
  }
  if (!lastSeenAt) {
    reasons.push("missing_last_seen");
  } else {
    const ageDays = (now.getTime() - lastSeenAt.getTime()) / 86_400_000;
    if (ageDays < -2 || ageDays > MAX_LISTING_AGE_DAYS) reasons.push("stale");
  }
  if (requiresUnit(providerPropertyType, propertyType) && !unit) {
    reasons.push("missing_unit");
  }

  if (
    reasons.length > 0
    || !providerId
    || !address
    || !city
    || !state
    || latitude === null
    || longitude === null
    || price === null
    || bedrooms === null
    || bathrooms === null
    || !lastSeenAt
  ) {
    return { value: null, reasons };
  }

  const addressParts = normalizedListingAddressParts(address, unit);
  return {
    value: {
      raw: listing,
      providerId,
      address,
      unit,
      city,
      state,
      zip,
      latitude,
      longitude,
      price,
      bedrooms,
      bathrooms,
      squareFeet,
      propertyType,
      providerPropertyType,
      listedAt,
      lastSeenAt,
      identityKey: [
        addressParts.street,
        addressParts.unit ?? "no-unit",
      ].join("|"),
    },
    reasons: [],
  };
}

export function validateRentCastRefreshBatch(
  listings: RentCastRentalListing[],
  now = new Date(),
): RentCastValidationResult {
  const accepted: ValidatedRentCastListing[] = [];
  const rejected: RentCastValidationResult["rejected"] = [];
  const rejectedByReason = rejectionCounts();
  const providerIds = new Set<string>();
  const identities = new Set<string>();

  for (const listing of listings) {
    const validation = validateRentCastListing(listing, now);
    const reasons = [...validation.reasons];
    const providerId =
      typeof listing.id === "string" && listing.id.trim()
        ? listing.id.trim()
        : null;

    if (validation.value) {
      if (providerIds.has(validation.value.providerId)) {
        reasons.push("duplicate_provider_id");
      }
      if (identities.has(validation.value.identityKey)) {
        reasons.push("duplicate_address_unit");
      }
    }

    if (!validation.value || reasons.length > 0) {
      for (const reason of new Set(reasons)) rejectedByReason[reason] += 1;
      rejected.push({ providerId, reasons: Array.from(new Set(reasons)) });
      continue;
    }

    providerIds.add(validation.value.providerId);
    identities.add(validation.value.identityKey);
    accepted.push(validation.value);
  }

  return { accepted, rejected, rejectedByReason };
}

export function assertSafeRentCastRefreshBatch(
  listings: RentCastRentalListing[],
  validation: RentCastValidationResult,
) {
  if (listings.length < MIN_SAFE_RESPONSE_SIZE) {
    throw new Error(
      `RentCast refresh aborted: received ${listings.length}; at least ${MIN_SAFE_RESPONSE_SIZE} records are required.`,
    );
  }
  if (validation.accepted.length < MIN_SAFE_ACCEPTED_SIZE) {
    throw new Error(
      `RentCast refresh aborted: only ${validation.accepted.length} records passed validation; at least ${MIN_SAFE_ACCEPTED_SIZE} are required.`,
    );
  }
}

function createListingData(
  listing: ValidatedRentCastListing,
  fetchedAt: Date,
) {
  return {
    source: "api" as const,
    sourceName: "rentcast",
    sourceUrl: null,
    externalId: listing.providerId,
    address: listing.address,
    unit: listing.unit,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
    neighborhood: null,
    latitude: listing.latitude,
    longitude: listing.longitude,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    squareFeet: listing.squareFeet,
    availableDate: null,
    propertyType: listing.propertyType,
    amenities: "[]",
    fees: "{}",
    description: null,
    images: "[]",
    providerData: listing.raw as Prisma.InputJsonValue,
    providerStatus: "Active",
    providerListedAt: listing.listedAt,
    providerRemovedAt: null,
    providerLastSeenAt: listing.lastSeenAt,
    providerFetchedAt: fetchedAt,
    status: "active" as const,
  };
}

function identityChanged(
  existing: {
    address: string | null;
    unit: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
  },
  incoming: ValidatedRentCastListing,
) {
  const existingAddress = normalizedListingAddressParts(
    existing.address,
    existing.unit,
  );
  const incomingAddress = normalizedListingAddressParts(
    incoming.address,
    incoming.unit,
  );
  return (
    existingAddress.street !== incomingAddress.street
    || existingAddress.unit !== incomingAddress.unit
    || existing.bedrooms !== incoming.bedrooms
    || existing.bathrooms !== incoming.bathrooms
  );
}

export async function persistControlledRentCastRefresh(
  listings: RentCastRentalListing[],
  now = new Date(),
): Promise<ControlledRentCastRefreshAudit> {
  const validation = validateRentCastRefreshBatch(listings, now);
  assertSafeRentCastRefreshBatch(listings, validation);

  const existing = await prisma.listing.findMany({
    where: { sourceName: "rentcast" },
    select: {
      id: true,
      externalId: true,
      address: true,
      unit: true,
      price: true,
      bedrooms: true,
      bathrooms: true,
      boardListings: { select: { id: true } },
    },
  });
  const existingByProviderId = new Map(
    existing.flatMap((listing) =>
      listing.externalId ? [[listing.externalId, listing] as const] : [],
    ),
  );
  const acceptedProviderIds = new Set(
    validation.accepted.map((listing) => listing.providerId),
  );
  const archivedRows = existing.filter(
    (listing) =>
      !listing.externalId || !acceptedProviderIds.has(listing.externalId),
  );
  const identityConflictIds = validation.accepted.flatMap((incoming) => {
    const current = existingByProviderId.get(incoming.providerId);
    return current && identityChanged(current, incoming) ? [current.id] : [];
  });
  const priceChanges = validation.accepted.flatMap((incoming) => {
    const current = existingByProviderId.get(incoming.providerId);
    return current && current.price !== incoming.price
      ? [{ listingId: current.id, price: incoming.price }]
      : [];
  });

  const operations: Prisma.PrismaPromise<unknown>[] =
    validation.accepted.map((listing) =>
      prisma.listing.upsert({
        where: {
          sourceName_externalId: {
            sourceName: "rentcast",
            externalId: listing.providerId,
          },
        },
        create: createListingData(listing, now),
        update: createListingData(listing, now),
      }),
    );

  for (const change of priceChanges) {
    operations.push(
      prisma.priceHistory.create({
        data: {
          listingId: change.listingId,
          price: change.price,
          observedAt: now,
          source: "api",
        },
      }),
    );
  }

  if (archivedRows.length > 0) {
    operations.push(
      prisma.listing.updateMany({
        where: { id: { in: archivedRows.map((listing) => listing.id) } },
        data: {
          status: "removed",
          providerStatus: "Archived after controlled catalog refresh",
          providerRemovedAt: now,
          providerFetchedAt: now,
        },
      }),
    );
  }

  if (identityConflictIds.length > 0) {
    operations.push(
      prisma.catalogListingSource.updateMany({
        where: {
          listingId: { in: identityConflictIds },
          trustStatus: { in: ["community_supported", "verified"] },
        },
        data: {
          trustStatus: "review_hold",
          reviewReason:
            "RentCast identity fields changed during the controlled catalog refresh.",
        },
      }),
    );
  }

  await prisma.$transaction(operations);

  const trustedSourcesMovedToReviewHold =
    identityConflictIds.length === 0
      ? 0
      : await prisma.catalogListingSource.count({
          where: {
            listingId: { in: identityConflictIds },
            trustStatus: "review_hold",
            reviewReason:
              "RentCast identity fields changed during the controlled catalog refresh.",
          },
        });

  return {
    received: listings.length,
    accepted: validation.accepted.length,
    rejected: validation.rejected.length,
    rejectedByReason: validation.rejectedByReason,
    inserted: validation.accepted.filter(
      (listing) => !existingByProviderId.has(listing.providerId),
    ).length,
    updated: validation.accepted.filter((listing) =>
      existingByProviderId.has(listing.providerId),
    ).length,
    archived: archivedRows.length,
    preservedBoardLinkedRecords: archivedRows.filter(
      (listing) => listing.boardListings.length > 0,
    ).length,
    trustedSourcesMovedToReviewHold,
    priceHistoryEntries: priceChanges.length,
  };
}

export async function auditActiveRentCastCatalog(now = new Date()) {
  const [rows, visibleSources] = await Promise.all([
    prisma.listing.findMany({
      where: {
        sourceName: "rentcast",
        status: "active",
      },
    }),
    prisma.catalogListingSource.findMany({
      where: {
        listing: { status: "active" },
        trustStatus: { in: ["community_supported", "verified"] },
      },
      select: {
        id: true,
        trustStatus: true,
        canonicalUrl: true,
      },
    }),
  ]);
  const validation = validateRentCastRefreshBatch(
    rows.map((row) => row.providerData as RentCastRentalListing),
    now,
  );
  const rejectedProviderIds = new Set(
    validation.rejected.flatMap((entry) =>
      entry.providerId ? [entry.providerId] : [],
    ),
  );
  const invalidActiveIds = rows.flatMap((row) => {
    const rowValidation = validateRentCastListing(
      row.providerData as RentCastRentalListing,
      now,
    );
    return rowValidation.value === null
      || !row.externalId
      || rejectedProviderIds.has(row.externalId)
      ? [row.id]
      : [];
  });
  const visibleSourceFailures = visibleSources.filter(
    (source) =>
      !["community_supported", "verified"].includes(source.trustStatus)
      || !source.canonicalUrl,
  );

  return {
    activeCandidates: rows.length,
    validActiveCandidates: validation.accepted.length,
    invalidActiveCandidates: validation.rejected.length,
    invalidActiveIds,
    visibleSources: visibleSources.length,
    invalidVisibleSources: visibleSourceFailures.length,
    passed:
      validation.rejected.length === 0 && visibleSourceFailures.length === 0,
  };
}
