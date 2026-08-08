import { NextResponse } from "next/server";
import { z } from "zod";

import { addListingToBoard, getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload, mapListingInventoryForMobile } from "@/lib/mobile-payloads";
import { previewListingImport } from "@/lib/listing-sources";
import { listingSourceTrustWarning } from "@/lib/listing-source-policy";
import { prisma } from "@/lib/prisma";
import type { ListingRecord } from "@/lib/types";

const modelInsightSchema = z.object({
  category: z.enum([
    "amenity", "interior", "space", "layout", "storage", "light", "noise",
    "transit", "neighborhood", "building", "outdoor", "fee", "risk",
  ]),
  label: z.string().trim().min(1).max(160),
  sentiment: z.number().finite().min(-1).max(1),
  confidence: z.number().finite().min(0).max(1),
  evidence: z.string().trim().min(1).max(500),
});

const listingSchema = z.object({
  title: z.string().trim().max(240).optional(),
  address: z.string().trim().max(300).optional(),
  unit: z.string().trim().max(40).optional(),
  location: z.string().trim().max(300).optional(),
  city: z.string().trim().max(160).optional(),
  neighborhood: z.string().trim().max(160).optional(),
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  price: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  bedrooms: z.number().finite().nonnegative().max(50).nullable().optional(),
  bathrooms: z.number().finite().nonnegative().max(50).nullable().optional(),
  squareFeet: z.number().int().positive().max(100_000).nullable().optional(),
  amenities: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  modelInsights: z.array(modelInsightSchema).max(16).optional(),
  description: z.string().trim().max(10_000).optional(),
  sourceUrl: z.string().url().max(2_000).or(z.literal("")).optional(),
  imageUrl: z.string().url().max(2_000).or(z.literal("")).optional(),
  groupNote: z.string().trim().max(5_000).optional(),
});

const inventoryQuerySchema = z
  .object({
    view: z.enum(["map", "cards"]).default("map"),
    cursor: z.string().trim().min(1).max(160).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    minLat: z.coerce.number().finite().min(-90).max(90).optional(),
    maxLat: z.coerce.number().finite().min(-90).max(90).optional(),
    minLng: z.coerce.number().finite().min(-180).max(180).optional(),
    maxLng: z.coerce.number().finite().min(-180).max(180).optional(),
    maxPrice: z.coerce.number().int().nonnegative().max(1_000_000).optional(),
    minBedrooms: z.coerce.number().finite().nonnegative().max(50).optional(),
    query: z.string().trim().max(160).optional(),
  })
  .superRefine((value, context) => {
    const bounds = [value.minLat, value.maxLat, value.minLng, value.maxLng];
    const providedBounds = bounds.filter((entry) => entry !== undefined).length;
    if (providedBounds !== 0 && providedBounds !== 4) {
      context.addIssue({
        code: "custom",
        message: "All viewport bounds are required together.",
      });
    }
    if (
      providedBounds === 4
      && ((value.minLat as number) >= (value.maxLat as number)
        || (value.minLng as number) >= (value.maxLng as number))
    ) {
      context.addIssue({
        code: "custom",
        message: "Viewport bounds are invalid.",
      });
    }
  });

function parseStringArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function citySearchTerms(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["nyc", "new york", "new york city"].includes(normalized)) {
    return ["New York", "NYC"];
  }
  return [value.trim()];
}

function mapInventoryRow(row: Awaited<ReturnType<typeof prisma.listing.findMany>>[number]): ListingRecord {
  return {
    id: row.id,
    source: row.source,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    externalId: row.externalId,
    address: row.address,
    unit: row.unit,
    city: row.city,
    state: row.state,
    zip: row.zip,
    neighborhood: row.neighborhood,
    latitude: row.latitude,
    longitude: row.longitude,
    price: row.price,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    squareFeet: row.squareFeet,
    availableDate: row.availableDate?.toISOString() ?? null,
    propertyType: row.propertyType,
    amenities: parseStringArray(row.amenities),
    fees: parseJsonObject(row.fees),
    description: row.description,
    images: parseStringArray(row.images),
    providerData: row.providerData && typeof row.providerData === "object" && !Array.isArray(row.providerData)
      ? row.providerData as Record<string, unknown>
      : {},
    providerStatus: row.providerStatus,
    providerListedAt: row.providerListedAt?.toISOString() ?? null,
    providerLastSeenAt: row.providerLastSeenAt?.toISOString() ?? null,
    providerFetchedAt: row.providerFetchedAt?.toISOString() ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function response(data: NonNullable<Awaited<ReturnType<typeof getBoardPageData>>>) {
  return NextResponse.json({
    board: buildMobileBoardPayload(data),
    profile: data.profile,
    completion: data.completion,
    missingFields: data.missingFields,
  });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const parsed = inventoryQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid listing search." }, { status: 400 });
    }

    const board = await prisma.searchBoard.findFirst({
      where: {
        id,
        OR: [
          { userId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      select: {
        id: true,
        searchProfile: { select: { locations: true } },
        boardListings: { select: { listingId: true } },
      },
    });
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    const query = parsed.data.query?.trim();
    const profileLocations = parseStringArray(board.searchProfile?.locations ?? null);
    const boardCity = profileLocations[0]?.trim();
    const boardCityTerms = boardCity ? citySearchTerms(boardCity) : [];
    const hasBounds = parsed.data.minLat !== undefined;
    const requestedLimit = parsed.data.limit ?? (parsed.data.view === "map" ? 500 : 30);
    const limit = parsed.data.view === "cards"
      ? Math.min(requestedLimit, 50)
      : Math.min(requestedLimit, 500);

    const rows = await prisma.listing.findMany({
      where: {
        source: "api",
        sourceName: "rentcast",
        status: { notIn: ["removed", "rented"] },
        catalogSources: {
          some: {
            trustStatus: { in: ["community_supported", "verified"] },
          },
        },
        id: {
          notIn: board.boardListings.map((entry) => entry.listingId),
        },
        ...(hasBounds
          ? {
              latitude: {
                gte: parsed.data.minLat as number,
                lte: parsed.data.maxLat as number,
              },
              longitude: {
                gte: parsed.data.minLng as number,
                lte: parsed.data.maxLng as number,
              },
            }
          : boardCityTerms.length > 0 && !query
            ? {
                OR: boardCityTerms.map((term) => ({
                  city: { contains: term, mode: "insensitive" as const },
                })),
              }
            : {}),
        ...(parsed.data.maxPrice !== undefined
          ? { price: { lte: parsed.data.maxPrice } }
          : {}),
        ...(parsed.data.minBedrooms !== undefined
          ? { bedrooms: { gte: parsed.data.minBedrooms } }
          : {}),
        ...(query
          ? {
              OR: [
                { address: { contains: query, mode: "insensitive" as const } },
                { neighborhood: { contains: query, mode: "insensitive" as const } },
                { city: { contains: query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { id: "asc" },
      include: {
        catalogSources: {
          where: {
            trustStatus: { in: ["community_supported", "verified"] },
          },
          include: {
            _count: {
              select: {
                boardSources: true,
                attestations: { where: { attestedAt: { not: null } } },
                reports: true,
              },
            },
          },
          orderBy: [{ verifiedAt: "desc" }, { updatedAt: "desc" }],
        },
      },
      ...(parsed.data.cursor
        ? { cursor: { id: parsed.data.cursor }, skip: 1 }
        : {}),
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      listings: page.flatMap((row) => {
        const source = row.catalogSources.find((entry) => entry.trustStatus === "verified")
          ?? row.catalogSources[0];
        if (!source) return [];
        return [
          mapListingInventoryForMobile(mapInventoryRow(row), {
            id: source.id,
            canonicalUrl: source.canonicalUrl,
            provider: source.provider,
            trustStatus: source.trustStatus as "community_supported" | "verified",
            warning: listingSourceTrustWarning(source.trustStatus),
            confirmationCount: source._count.attestations,
            boardCount: source._count.boardSources,
            reportCount: source._count.reports,
          }),
        ];
      }),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
      hasMore,
      source: "database",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load listings.";
    return NextResponse.json(
      { error: message },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const existing = await getBoardPageData(id, user.id);
    if (!existing) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    const parsed = listingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid listing details." }, { status: 400 });
    if (!parsed.data.sourceUrl && !parsed.data.address?.trim() && !parsed.data.title?.trim()) {
      return NextResponse.json({ error: "Add an address or listing name." }, { status: 400 });
    }

    const roommate = existing.roommates.find((entry) => entry.linkedUserId === user.id);
    const legacyTitleAddress = parsed.data.title?.match(
      /\b\d{1,6}(?:-\d{1,6})?\s+.+\b(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Parkway|Pkwy|Terrace|Ter|Circle|Cir|Crescent|Cres|Plaza|Highway|Hwy|Broadway)\b/i,
    )?.[0];
    const listingAddress = parsed.data.address?.trim() || legacyTitleAddress;
    const importPreview = parsed.data.sourceUrl
      ? previewListingImport({
          url: parsed.data.sourceUrl,
          address: listingAddress,
          unit: parsed.data.unit,
          price: parsed.data.price,
          bedrooms: parsed.data.bedrooms,
          bathrooms: parsed.data.bathrooms,
        })
      : null;
    if (importPreview && importPreview.missingEssentialFields.length > 0) {
      return NextResponse.json(
        {
          error: `Confirm ${importPreview.missingEssentialFields.join(", ")} before adding this external listing.`,
          importPreview,
        },
        { status: 422 },
      );
    }

    await addListingToBoard(id, {
      method: parsed.data.sourceUrl ? "pasted_link" : "manual",
      sourceUrl: parsed.data.sourceUrl,
      listingTitle: parsed.data.title,
      address: listingAddress || importPreview?.suggestedAddress || undefined,
      unit: parsed.data.unit || importPreview?.suggestedUnit || undefined,
      city: parsed.data.city || parsed.data.location,
      neighborhood: parsed.data.neighborhood,
      latitude: parsed.data.latitude ?? undefined,
      longitude: parsed.data.longitude ?? undefined,
      price: parsed.data.price === null || parsed.data.price === undefined ? undefined : String(parsed.data.price),
      bedrooms: parsed.data.bedrooms === null || parsed.data.bedrooms === undefined ? undefined : String(parsed.data.bedrooms),
      bathrooms: parsed.data.bathrooms === null || parsed.data.bathrooms === undefined ? undefined : String(parsed.data.bathrooms),
      squareFeet: parsed.data.squareFeet === null || parsed.data.squareFeet === undefined ? undefined : String(parsed.data.squareFeet),
      amenities: parsed.data.amenities,
      modelInsights: parsed.data.modelInsights,
      description: parsed.data.description,
      imageUrl: parsed.data.imageUrl,
      userNotes: parsed.data.groupNote,
      actorRoommateId: roommate?.id,
      actorUserId: user.id,
    });

    const data = await getBoardPageData(id, user.id);
    if (!data) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return response(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add listing.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
