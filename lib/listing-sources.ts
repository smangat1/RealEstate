import { createHash } from "node:crypto";

export type ListingSourceProvider =
  | "Zillow"
  | "StreetEasy"
  | "Craigslist"
  | "Realtor"
  | "Apartments.com"
  | "Brokerage"
  | "Other";

export type ListingImportPreview = {
  normalizedUrl: string;
  provider: ListingSourceProvider;
  suggestedAddress: string | null;
  suggestedUnit: string | null;
  missingEssentialFields: Array<"address" | "unit" | "rent" | "bedrooms" | "bathrooms">;
  notice: string;
};

export type ListingMatchFacts = {
  address: string | null;
  unit?: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
};

export type ExternalListingCandidate = ListingMatchFacts & {
  url: string;
  provider?: ListingSourceProvider;
  label?: string;
};

export type ExactListingMatchResult = {
  status: "exact" | "ambiguous" | "mismatch";
  matchedFields: Array<"address" | "unit" | "price" | "bedrooms" | "bathrooms">;
  reasons: string[];
};

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.length <= 2 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export function normalizeListingUnit(value: string | null | undefined) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/^(?:apt|apartment|unit|suite|ste|#)\s*/i, "")
    .replace(/[^a-z0-9]/g, "") || null;
}

export function normalizedListingAddressParts(address: string | null, explicitUnit?: string | null) {
  const raw = address?.trim() ?? "";
  const unitMatch = raw.match(/\b(?:apt|apartment|unit|suite|ste|#)\s*([a-z0-9-]{1,16})\b/i);
  const street = raw
    .split(",")[0]
    .replace(/\b(?:apt|apartment|unit|suite|ste|#)\s*[a-z0-9-]{1,16}\b.*$/i, "")
    .toLowerCase()
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bstreet\b/g, "st")
    .replace(/\broad\b/g, "rd")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\blane\b/g, "ln")
    .replace(/\bplace\b/g, "pl")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bparkway\b/g, "pkwy")
    .replace(/\bterrace\b/g, "ter")
    .replace(/\bsquare\b/g, "sq")
    .replace(/\bnorth\b/g, "n")
    .replace(/\bsouth\b/g, "s")
    .replace(/\beast\b/g, "e")
    .replace(/\bwest\b/g, "w")
    .replace(/[^a-z0-9]/g, "");

  return {
    street: street || null,
    unit: normalizeListingUnit(explicitUnit) ?? normalizeListingUnit(unitMatch?.[1]),
  };
}

function sameNumber(left: number | null, right: number | null) {
  return left != null && right != null && Math.abs(left - right) < 0.001;
}

/**
 * Deliberately favors false negatives over links to the wrong apartment.
 * Building-level matches and candidates with incomplete specifications never pass.
 */
export function evaluateExactListingMatch(
  target: ListingMatchFacts,
  candidate: ListingMatchFacts,
): ExactListingMatchResult {
  const targetAddress = normalizedListingAddressParts(target.address, target.unit);
  const candidateAddress = normalizedListingAddressParts(candidate.address, candidate.unit);
  const matchedFields: ExactListingMatchResult["matchedFields"] = [];
  const missing: string[] = [];
  const mismatches: string[] = [];

  if (!targetAddress.street || !candidateAddress.street) {
    missing.push("a complete street address");
  } else if (targetAddress.street !== candidateAddress.street) {
    mismatches.push("street address");
  } else {
    matchedFields.push("address");
  }

  if (!targetAddress.unit || !candidateAddress.unit) {
    missing.push("an apartment or unit number");
  } else if (targetAddress.unit !== candidateAddress.unit) {
    mismatches.push("apartment or unit number");
  } else {
    matchedFields.push("unit");
  }

  const numericFields = [
    ["price", target.price, candidate.price, "rent"],
    ["bedrooms", target.bedrooms, candidate.bedrooms, "bedroom count"],
    ["bathrooms", target.bathrooms, candidate.bathrooms, "bathroom count"],
  ] as const;

  for (const [field, targetValue, candidateValue, label] of numericFields) {
    if (targetValue == null || candidateValue == null) {
      missing.push(label);
    } else if (!sameNumber(targetValue, candidateValue)) {
      mismatches.push(label);
    } else {
      matchedFields.push(field);
    }
  }

  if (mismatches.length > 0) {
    return {
      status: "mismatch",
      matchedFields,
      reasons: mismatches.map((field) => `Different ${field}.`),
    };
  }

  if (missing.length > 0) {
    return {
      status: "ambiguous",
      matchedFields,
      reasons: missing.map((field) => `Cannot confirm without ${field}.`),
    };
  }

  return {
    status: "exact",
    matchedFields,
    reasons: [],
  };
}

export function keepExactListingCandidates(
  target: ListingMatchFacts,
  candidates: ExternalListingCandidate[],
) {
  return candidates.flatMap((candidate) => {
    const match = evaluateExactListingMatch(target, candidate);
    return match.status === "exact"
      ? [{
          ...candidate,
          provider: candidate.provider ?? detectListingProvider(candidate.url),
          match,
        }]
      : [];
  });
}

export function detectListingProvider(input: string): ListingSourceProvider {
  let hostname = "";
  try {
    hostname = new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "Other";
  }

  if (hostname.endsWith("zillow.com")) return "Zillow";
  if (hostname.endsWith("streeteasy.com")) return "StreetEasy";
  if (hostname.endsWith("craigslist.org")) return "Craigslist";
  if (hostname.endsWith("realtor.com")) return "Realtor";
  if (hostname.endsWith("apartments.com")) return "Apartments.com";
  if (/compass|corcoran|elliman|serhant|sotheby|brownstoner|renthop/.test(hostname)) return "Brokerage";
  return "Other";
}

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

export function canonicalizeListingUrl(input: string) {
  const parsed = new URL(input.trim());
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Listing links must use http or https.");
  }

  parsed.protocol = "https:";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  parsed.hash = "";
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.searchParams.sort();
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

export function isGenericListingUrl(input: string) {
  const parsed = new URL(canonicalizeListingUrl(input));
  const hostname = parsed.hostname;
  const pathname = parsed.pathname.toLowerCase();
  const searchHosts = [
    "google.com",
    "bing.com",
    "search.yahoo.com",
    "search.brave.com",
    "duckduckgo.com",
  ];

  if (searchHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return true;
  }
  if (parsed.searchParams.has("q") || parsed.searchParams.has("query")) {
    return true;
  }
  if (hostname.endsWith("zillow.com")) {
    return !pathname.includes("/homedetails/");
  }
  if (hostname.endsWith("streeteasy.com")) {
    return pathname === "/"
      || pathname.startsWith("/for-rent")
      || pathname.startsWith("/search");
  }
  if (hostname.endsWith("realtor.com")) {
    return !pathname.includes("/realestateandhomes-detail/");
  }
  return pathname === "/" || pathname.startsWith("/search");
}

export function assertSpecificListingUrl(input: string) {
  const canonicalUrl = canonicalizeListingUrl(input);
  if (isGenericListingUrl(canonicalUrl)) {
    throw new Error(
      "Open the page for the exact rental unit. Search results and building-wide pages cannot be attached as listing sources.",
    );
  }
  return canonicalUrl;
}

export function listingIdentityFingerprint(facts: ListingMatchFacts) {
  const address = normalizedListingAddressParts(facts.address, facts.unit);
  const values = [
    address.street ?? "",
    address.unit ?? "",
    facts.price == null ? "" : String(facts.price),
    facts.bedrooms == null ? "" : String(facts.bedrooms),
    facts.bathrooms == null ? "" : String(facts.bathrooms),
  ];
  return createHash("sha256").update(values.join("|")).digest("hex");
}

function pathHints(url: URL) {
  const decoded = decodeURIComponent(url.pathname)
    .replace(/\.(html?|aspx?)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(?:homedetails|apartments?|rental|rentals|listing|buildings?|for rent|unit)\b/gi, " ")
    .replace(/\b(?:zpid|mls)\b.*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const addressMatch = decoded.match(
    /\b(\d{1,6}\s+[a-z0-9.' ]+?\s(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|place|pl|court|ct|way|parkway|pkwy|terrace|ter))\b/i,
  );
  const unitMatch =
    decoded.match(/\b(?:apt|apartment|unit|#)\s*([a-z0-9-]{1,12})\b/i) ??
    decoded.match(/\b(\d{1,3}[a-z])\b/i);

  return {
    address: addressMatch ? titleCase(addressMatch[1]) : null,
    unit: unitMatch ? unitMatch[1].toUpperCase() : null,
  };
}

export function previewListingImport(input: {
  url: string;
  address?: string | null;
  unit?: string | null;
  price?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
}): ListingImportPreview {
  const parsed = new URL(assertSpecificListingUrl(input.url));

  const hints = pathHints(parsed);
  const address = input.address?.trim() || hints.address;
  const unit = input.unit?.trim() || hints.unit;
  const missingEssentialFields: ListingImportPreview["missingEssentialFields"] = [];
  if (!address) missingEssentialFields.push("address");
  if (input.price == null) missingEssentialFields.push("rent");
  if (input.bedrooms == null) missingEssentialFields.push("bedrooms");
  if (input.bathrooms == null) missingEssentialFields.push("bathrooms");

  return {
    normalizedUrl: canonicalizeListingUrl(parsed.toString()),
    provider: detectListingProvider(parsed.toString()),
    suggestedAddress: address || null,
    suggestedUnit: unit || null,
    missingEssentialFields,
    notice:
      "Homeboard keeps this exact source attached to the board. Confirm the available facts before saving; the unit may stay blank when the source does not provide one.",
  };
}

export function buildGeneratedListingSearches(listing: {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}) {
  void listing;
  // Address searches can land on the correct building and the wrong apartment.
  // Homeboard only exposes a URL after structured candidate facts pass the
  // same-unit matcher above.
  return [];
}
