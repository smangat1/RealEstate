import "server-only";

import { prisma } from "@/lib/prisma";
import { recordListingObservation } from "@/lib/advisor-service";
import type { ListingObservation } from "@/lib/advisor-types";

const MAX_SOURCE_BYTES = 1_500_000;
const SOURCE_TIMEOUT_MS = 8_000;
const MAX_SOURCE_REDIRECTS = 4;
const SUPPORTED_HOSTS = [
  "zillow.com",
  "streeteasy.com",
  "realtor.com",
  "apartments.com",
  "renthop.com",
  "compass.com",
  "corcoran.com",
  "elliman.com",
  "serhant.com",
  "sothebysrealty.com",
];

function supportedSourceUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!SUPPORTED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null;
  return url;
}

function decodeEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1].trim());
  }
  return null;
}

function title(html: string) {
  return decodeEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "");
}

function jsonLdObjects(html: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const queue = Array.isArray(parsed) ? parsed : [parsed];
      for (const value of queue) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const record = value as Record<string, unknown>;
          objects.push(record);
          if (Array.isArray(record["@graph"])) {
            objects.push(...record["@graph"].filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)));
          }
        }
      }
    } catch {
      // Malformed page JSON-LD is ignored; stored listing facts remain unchanged.
    }
  }
  return objects;
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace(/[$,\s]/g, ""))
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function pagePrice(html: string, objects: Record<string, unknown>[]) {
  for (const object of objects) {
    const offers = object.offers;
    const values = Array.isArray(offers) ? offers : offers && typeof offers === "object" ? [offers] : [];
    for (const value of values) {
      const record = value as Record<string, unknown>;
      const price = finiteNumber(record.price ?? record.lowPrice);
      if (price !== null) return price;
    }
  }
  const described = [meta(html, "og:description"), meta(html, "description"), title(html)].filter(Boolean).join(" ");
  const match = described.match(/\$\s*([\d,]{3,7})(?:\s*\/?\s*(?:mo|month))?/i);
  return finiteNumber(match?.[1]);
}

function pageAvailability(html: string, objects: Record<string, unknown>[]) {
  for (const object of objects) {
    const date = object.availabilityStarts ?? object.availableFrom ?? object.datePosted;
    if (typeof date === "string" && !Number.isNaN(Date.parse(date))) return new Date(date).toISOString();
  }
  const described = [meta(html, "og:description"), meta(html, "description")].filter(Boolean).join(" ");
  const iso = described.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  return iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString() : null;
}

function pageStatus(html: string, objects: Record<string, unknown>[]): Pick<ListingObservation, "status" | "providerStatus"> {
  const structured = objects
    .flatMap((object) => {
      const offers = object.offers;
      const values = Array.isArray(offers) ? offers : offers && typeof offers === "object" ? [offers] : [];
      return values.map((value) => String((value as Record<string, unknown>).availability ?? ""));
    })
    .join(" ")
    .toLowerCase();
  const summary = `${title(html)} ${meta(html, "og:description") ?? ""} ${structured}`.toLowerCase();
  if (/\b(?:rented|leased|sold out|no longer available|off market|unavailable)\b/.test(summary)) {
    return { status: /rented|leased/.test(summary) ? "rented" : "removed", providerStatus: "unavailable" };
  }
  if (/instock|available now|still available|for rent/.test(summary)) {
    return { status: "active", providerStatus: "available" };
  }
  return { status: "unknown", providerStatus: null };
}

function pageFees(html: string) {
  const description = [meta(html, "og:description"), meta(html, "description"), title(html)].filter(Boolean).join(" ");
  const result: Record<string, unknown> = {};
  const labels: Array<[string, RegExp]> = [
    ["brokerFee", /(?:broker(?:'s)? fee|brokerage fee)\D{0,16}(\$[\d,]+|\d+(?:\.\d+)?%)/i],
    ["applicationFee", /application fee\D{0,16}(\$[\d,]+)/i],
    ["deposit", /(?:security )?deposit\D{0,16}(\$[\d,]+|\d+\s+months?)/i],
  ];
  for (const [key, pattern] of labels) {
    const value = description.match(pattern)?.[1];
    if (value) result[key] = value;
  }
  if (/\bno fee\b|\bno broker(?:'s)? fee\b/i.test(description)) result.brokerFee = "$0";
  return result;
}

async function fetchSource(url: URL, redirectCount = 0): Promise<{ html: string; finalUrl: string }> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Homeboard-Listing-Monitor/1.0 (+https://homeboard.app)",
    },
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_SOURCE_REDIRECTS) throw new Error("LISTING_SOURCE_TOO_MANY_REDIRECTS");
    const location = response.headers.get("location");
    if (!location) throw new Error("LISTING_SOURCE_REDIRECTED");
    const redirected = supportedSourceUrl(new URL(location, url).toString());
    if (!redirected) throw new Error("LISTING_SOURCE_REDIRECT_BLOCKED");
    return fetchSource(redirected, redirectCount + 1);
  }
  if (!response.ok) throw new Error(`LISTING_SOURCE_HTTP_${response.status}`);
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_SOURCE_BYTES) throw new Error("LISTING_SOURCE_TOO_LARGE");
  const html = (await response.text()).slice(0, MAX_SOURCE_BYTES);
  return { html, finalUrl: url.toString() };
}

export async function observeListingSource(boardListingId: string): Promise<ListingObservation> {
  const boardListing = await prisma.boardListing.findUnique({
    where: { id: boardListingId },
    include: { listing: true, sources: { orderBy: { confirmedAt: "desc" } } },
  });
  if (!boardListing || boardListing.deletedAt) throw new Error("LISTING_NOT_FOUND");
  const rawSource = boardListing.sources[0]?.url ?? boardListing.listing.sourceUrl;
  if (!rawSource) throw new Error("LISTING_SOURCE_MISSING");
  const sourceUrl = supportedSourceUrl(rawSource);
  if (!sourceUrl) throw new Error("LISTING_SOURCE_REQUIRES_DEVICE_REVIEW");
  const { html, finalUrl } = await fetchSource(sourceUrl);
  const structured = jsonLdObjects(html);
  const status = pageStatus(html, structured);
  return {
    sourceUrl: finalUrl,
    price: pagePrice(html, structured) ?? boardListing.listing.price,
    fees: Object.keys(pageFees(html)).length > 0 ? pageFees(html) : parseSavedFees(boardListing.listing.fees),
    availableDate: pageAvailability(html, structured) ?? toIso(boardListing.listing.availableDate),
    status: status.status === "unknown" ? boardListing.listing.status : status.status,
    providerStatus: status.providerStatus ?? boardListing.listing.providerStatus,
    observedAt: new Date().toISOString(),
    sourceFacts: {
      title: title(html),
      description: meta(html, "og:description") ?? meta(html, "description"),
      extraction: "json-ld-and-page-metadata",
    },
  };
}

function parseSavedFees(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toIso(value: Date | null) {
  return value?.toISOString() ?? null;
}

export async function checkListingAgain(boardListingId: string, supplied?: ListingObservation) {
  const observation = supplied ?? await observeListingSource(boardListingId);
  return recordListingObservation(boardListingId, observation);
}

export async function monitorBoardListings(boardId: string) {
  const listings = await prisma.boardListing.findMany({
    where: {
      boardId,
      deletedAt: null,
      userStatus: { not: "rejected" },
      listing: { status: { notIn: ["removed", "rented"] } },
    },
    select: { id: true },
    take: 50,
  });
  const results = [];
  for (const listing of listings) {
    try {
      const result = await checkListingAgain(listing.id);
      results.push({ boardListingId: listing.id, checked: true, changes: result.changes.length });
    } catch (error) {
      results.push({
        boardListingId: listing.id,
        checked: false,
        changes: 0,
        reason: error instanceof Error ? error.message : "LISTING_CHECK_FAILED",
      });
    }
  }
  return results;
}
