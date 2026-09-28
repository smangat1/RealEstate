export type ListingCostInput = {
  rent: number | null;
  fees: Record<string, unknown>;
  description?: string | null;
  amenities?: string[];
};

export type ListingCostBreakdown = {
  listedRent: number | null;
  knownMonthlyTotal: number | null;
  recurringFeesMonthly: number;
  utilitiesMonthly: number | null;
  upfrontFeesTotal: number;
  upfrontFeesMonthly: number;
  concessionCreditMonthly: number;
  complete: boolean;
  missing: string[];
  lines: { label: string; monthlyAmount: number }[];
  note: string;
};

function amount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[$,]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function normalizedKey(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
}

function freeMonths(input: ListingCostInput) {
  const text = [input.description ?? "", ...(input.amenities ?? [])].join(" ");
  const digit = text.match(/\b(\d+(?:\.\d+)?)\s*(?:months?|mos?)\s*(?:free|off|rent[ -]?free)\b/i);
  if (digit) return Math.min(Number(digit[1]), 4);
  if (/\b(?:one|first)\s+month(?:'s)?\s+(?:free|off)\b|\bfree\s+month\b/i.test(text)) return 1;
  if (/\btwo\s+months?\s+(?:free|off)\b/i.test(text)) return 2;
  const weeks = text.match(/\b(\d+)\s*weeks?\s*free\b/i);
  return weeks ? Math.min(Number(weeks[1]) / 4.345, 4) : 0;
}

export function calculateListingMonthlyCost(input: ListingCostInput): ListingCostBreakdown {
  let recurringFeesMonthly = 0;
  let upfrontFeesTotal = 0;
  let utilitiesMonthly: number | null = null;
  let utilitiesIncluded = false;
  const feeDisclosureKnown = Object.keys(input.fees).length > 0;
  const lines: ListingCostBreakdown["lines"] = [];

  for (const [rawKey, rawValue] of Object.entries(input.fees)) {
    const key = normalizedKey(rawKey);
    if (/utilities? included/.test(key) || key === "utilitiesincluded") {
      utilitiesIncluded = rawValue === true || String(rawValue).toLowerCase() === "true";
      continue;
    }
    const numeric = amount(rawValue);
    if (numeric === null) continue;
    if (/utilit/.test(key) && /month|estimate|recurring/.test(key)) {
      utilitiesMonthly = numeric;
      continue;
    }
    if (/month|monthly|recurring|pet rent/.test(key)) {
      recurringFeesMonthly += numeric;
      lines.push({ label: rawKey, monthlyAmount: numeric });
      continue;
    }
    if (/application|admin|broker|move.?in|lease.?sign|one.?time/.test(key)) {
      upfrontFeesTotal += numeric;
    }
  }

  if (utilitiesIncluded) utilitiesMonthly = 0;
  const upfrontFeesMonthly = Math.round(upfrontFeesTotal / 12);
  const monthsFree = freeMonths(input);
  const concessionCreditMonthly = input.rent === null ? 0 : Math.round((input.rent * monthsFree) / 12);
  const knownMonthlyTotal = input.rent === null
    ? null
    : Math.max(0, input.rent + recurringFeesMonthly + upfrontFeesMonthly + (utilitiesMonthly ?? 0) - concessionCreditMonthly);
  const missing = [
    ...(input.rent === null ? ["rent"] : []),
    ...(!feeDisclosureKnown ? ["fee disclosure"] : []),
    ...(utilitiesMonthly === null ? ["utilities"] : []),
  ];
  if (input.rent !== null) lines.unshift({ label: "Listed rent", monthlyAmount: input.rent });
  if (upfrontFeesMonthly > 0) lines.push({ label: "Upfront fees ÷ 12", monthlyAmount: upfrontFeesMonthly });
  if (utilitiesMonthly !== null) lines.push({ label: utilitiesIncluded ? "Utilities included" : "Utilities", monthlyAmount: utilitiesMonthly });
  if (concessionCreditMonthly > 0) lines.push({ label: "Concession credit", monthlyAmount: -concessionCreditMonthly });

  return {
    listedRent: input.rent,
    knownMonthlyTotal,
    recurringFeesMonthly,
    utilitiesMonthly,
    upfrontFeesTotal,
    upfrontFeesMonthly,
    concessionCreditMonthly,
    complete: missing.length === 0,
    missing,
    lines,
    note: missing.length === 0
      ? "Includes disclosed recurring fees, utilities, and one-time fees spread across 12 months. Refundable deposits are excluded."
      : `Known cost only; still verify ${missing.join(" and ")}. Refundable deposits are excluded.`,
  };
}

export type ScamComparableListing = {
  id: string;
  price: number | null;
  bedrooms: number | null;
  neighborhood: string | null;
  city: string | null;
  listingStatus: string;
  userStatus: string;
};

export type ScamPriceWarning = {
  boardListingId: string;
  comparableCount: number;
  averagePrice: number;
  difference: number;
  percentBelow: number;
  comparableIds: string[];
  message: string;
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

export function findScamPriceWarnings(listings: ScamComparableListing[]): ScamPriceWarning[] {
  const eligible = listings.filter((listing) =>
    listing.price !== null
    && listing.price > 0
    && listing.bedrooms !== null
    && !["removed", "rented"].includes(normalized(listing.listingStatus))
    && normalized(listing.userStatus) !== "rejected");

  return eligible.flatMap((target) => {
    const sameLayoutAndCity = eligible.filter((candidate) =>
      candidate.id !== target.id
      && normalized(candidate.city) === normalized(target.city)
      && candidate.bedrooms !== null
      && target.bedrooms !== null
      && Math.abs(candidate.bedrooms - target.bedrooms) <= 0.25);
    const sameNeighborhood = sameLayoutAndCity.filter((candidate) =>
      normalized(target.neighborhood).length > 0
      && normalized(candidate.neighborhood) === normalized(target.neighborhood));
    const comparables = sameNeighborhood.length >= 2 ? sameNeighborhood : sameLayoutAndCity;
    if (comparables.length < 2 || target.price === null) return [];
    const averagePrice = Math.round(comparables.reduce((sum, comp) => sum + (comp.price ?? 0), 0) / comparables.length);
    const difference = averagePrice - target.price;
    const percentBelow = averagePrice > 0 ? Math.round((difference / averagePrice) * 100) : 0;
    if (difference < Math.max(400, averagePrice * 0.2)) return [];
    return [{
      boardListingId: target.id,
      comparableCount: comparables.length,
      averagePrice,
      difference,
      percentBelow,
      comparableIds: comparables.map((listing) => listing.id).sort(),
      message: `This asking rent is ${percentBelow}% below ${comparables.length} similar homes saved to this board. Verify the exact unit, agent identity, and payment instructions before sharing documents or money.`,
    }];
  });
}
