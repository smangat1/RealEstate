import "server-only";

import { Prisma } from "@prisma/client";

import {
  BraveSearchClient,
  type BraveSearchResult,
} from "@/lib/brave-search-client";
import {
  completeBraveRequest,
  reserveBraveRequest,
} from "@/lib/provider-request-budget";
import {
  canonicalizeListingUrl,
  detectListingProvider,
  keepExactListingCandidates,
  listingIdentityFingerprint,
  previewListingImport,
  type ExternalListingCandidate,
  type ListingMatchFacts,
} from "@/lib/listing-sources";
import { prisma } from "@/lib/prisma";

function numberFromText(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

function candidateFromResult(result: BraveSearchResult): ExternalListingCandidate | null {
  let preview;
  try {
    preview = previewListingImport({ url: result.url });
  } catch {
    return null;
  }
  const text = `${result.title} ${result.description}`;
  const unitMatch = text.match(/\b(?:apt|apartment|unit|suite|ste|#)\s*([a-z0-9-]{1,16})\b/i);
  return {
    url: preview.normalizedUrl,
    provider: detectListingProvider(preview.normalizedUrl),
    label: result.title,
    address: preview.suggestedAddress,
    unit: preview.suggestedUnit ?? unitMatch?.[1] ?? null,
    price: numberFromText(text, /\$\s*([\d,]{3,8})(?:\s*\/?\s*(?:mo|month))?/i),
    bedrooms: numberFromText(text, /\b(\d+(?:\.\d+)?)\s*(?:bed(?:room)?s?|bd|br)\b/i),
    bathrooms: numberFromText(text, /\b(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|ba)\b/i),
  };
}

function searchQuery(input: {
  address: string;
  unit: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
}) {
  return [
    `"${input.address}"`,
    `"${input.unit}"`,
    `"$${input.price}"`,
    `"${input.bedrooms} bed"`,
    `"${input.bathrooms} bath"`,
    "(Zillow OR StreetEasy OR Realtor OR Apartments.com OR broker)",
  ].join(" ");
}

export async function resolveListingSourceWithBrave(listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });
  if (!listing) throw new Error("Listing not found.");
  const facts: ListingMatchFacts = {
    address: listing.address,
    unit: listing.unit,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
  };
  if (
    !facts.address
    || !facts.unit
    || facts.price === null
    || facts.bedrooms === null
    || facts.bathrooms === null
  ) {
    throw new Error("Address, unit, rent, bedrooms, and bathrooms are required before resolving a source.");
  }

  const identityFingerprint = listingIdentityFingerprint(facts);
  const cached = await prisma.listingSourceResolutionCache.findUnique({
    where: { identityFingerprint },
  });
  if (cached) {
    return {
      cached: true,
      status: cached.status,
      candidates: cached.candidates,
      matchedCanonicalUrl: cached.matchedCanonicalUrl,
    };
  }

  const query = searchQuery({
    address: facts.address,
    unit: facts.unit,
    price: facts.price,
    bedrooms: facts.bedrooms,
    bathrooms: facts.bathrooms,
  });
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not configured.");

  let rawResults: BraveSearchResult[] = [];
  try {
    const client = new BraveSearchClient({
      apiKey,
      gate: {
        reserve: reserveBraveRequest,
        complete: completeBraveRequest,
      },
    });
    rawResults = await client.search(query);
  } catch (error) {
    const failed = await prisma.listingSourceResolutionCache.create({
      data: {
        identityFingerprint,
        query,
        provider: "brave",
        status: "failed",
        candidates: [],
      },
    });
    return {
      cached: false,
      status: failed.status,
      candidates: failed.candidates,
      matchedCanonicalUrl: null,
      error: error instanceof Error ? error.message : "Brave Search failed.",
    };
  }

  const parsedCandidates = rawResults.flatMap((result) => {
    const candidate = candidateFromResult(result);
    return candidate ? [candidate] : [];
  });
  const exactCandidates = keepExactListingCandidates(facts, parsedCandidates);
  const status =
    exactCandidates.length > 0 ? "exact_match"
    : parsedCandidates.length > 0 ? "ambiguous"
    : "no_match";

  const savedSources: string[] = [];
  if (status === "exact_match") {
    for (const candidate of exactCandidates) {
      const canonicalUrl = canonicalizeListingUrl(candidate.url);
      const existingSource = await prisma.catalogListingSource.findUnique({
        where: { canonicalUrl },
        select: {
          id: true,
          listingId: true,
          identityFingerprint: true,
        },
      });
      if (
        existingSource
        && (
          existingSource.listingId !== listingId
          || existingSource.identityFingerprint !== identityFingerprint
        )
      ) {
        await prisma.catalogListingSource.update({
          where: { id: existingSource.id },
          data: {
            trustStatus: "review_hold",
            reviewReason:
              "The resolver found this URL for conflicting listing identity fields.",
          },
        });
        continue;
      }

      const source = existingSource
        ? await prisma.catalogListingSource.update({
            where: { id: existingSource.id },
            data: {
              trustStatus: "verified",
              resolutionStatus: "exact_match",
              resolutionEvidence: candidate as unknown as Prisma.InputJsonValue,
              reviewReason: null,
              resolvedAt: new Date(),
              verifiedAt: new Date(),
            },
          })
        : await prisma.catalogListingSource.create({
            data: {
          listingId,
          canonicalUrl,
          originalUrl: candidate.url,
          provider: candidate.provider ?? detectListingProvider(candidate.url),
          identityFingerprint,
          trustStatus: "verified",
          resolutionStatus: "exact_match",
          resolutionEvidence: candidate as unknown as Prisma.InputJsonValue,
          resolvedAt: new Date(),
          verifiedAt: new Date(),
        },
            });
      savedSources.push(source.id);
    }
  }

  const cache = await prisma.listingSourceResolutionCache.create({
    data: {
      identityFingerprint,
      query,
      provider: "brave",
      status,
      candidates: parsedCandidates as unknown as Prisma.InputJsonValue,
      matchedCanonicalUrl: exactCandidates[0]?.url
        ? canonicalizeListingUrl(exactCandidates[0].url)
        : null,
    },
  });
  return {
    cached: false,
    status: cache.status,
    candidates: cache.candidates,
    matchedCanonicalUrl: cache.matchedCanonicalUrl,
    savedSourceIds: savedSources,
  };
}
