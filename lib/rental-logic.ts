import { randomUUID } from "node:crypto";

import type { BoardListingRecord, ListingBrowseRequest, SearchBoardSummary, SearchProfileData } from "@/lib/types";

const KNOWN_LOCATIONS = [
  "Arizona",
  "California",
  "Colorado",
  "Florida",
  "Georgia",
  "Jersey City",
  "Hoboken",
  "Brooklyn",
  "Los Angeles",
  "San Diego",
  "San Francisco",
  "NYC",
  "Queens",
  "New York",
  "Phoenix",
  "Tempe",
  "Scottsdale",
  "Tucson",
  "Mesa",
  "Denver",
  "Miami",
  "Atlanta",
  "Downtown",
  "Journal Square",
  "The Heights",
  "Newport",
  "Bergen-Lafayette",
  "Southwest",
  "Uptown",
  "Midtown",
  "Waterfront",
  "Northwest",
  "Williamsburg",
  "Greenpoint",
  "Bushwick",
  "Park Slope",
  "Astoria",
  "Long Island City",
  "Sunnyside",
  "Forest Hills",
  "Jackson Heights",
  "Upper West Side",
  "Harlem",
  "East Village",
  "Financial District",
];

const STATE_LOCATION_OPTIONS: Record<
  string,
  Array<{ name: string; note: string }>
> = {
  Arizona: [
    { name: "Phoenix", note: "the broadest job market, lots of neighborhoods, and the biggest inventory" },
    { name: "Tempe", note: "a younger feel, easier social energy, and decent east-valley access" },
    { name: "Scottsdale", note: "lifestyle, newer buildings, and polished neighborhoods over pure value" },
    { name: "Tucson", note: "a softer-cost option and a slower pace over big-city energy" },
    { name: "Mesa", note: "a more suburban feel and potentially better value per dollar" },
  ],
  California: [
    { name: "San Diego", note: "weather and overall balance over pure job density" },
    { name: "Los Angeles", note: "job access and neighborhood choice more than simplicity" },
    { name: "Sacramento", note: "better value if budget matters more than coastal access" },
    { name: "San Jose", note: "proximity to tech jobs, even if rent is painful" },
  ],
  Colorado: [
    { name: "Denver", note: "the broadest all-around option for jobs, neighborhoods, and inventory" },
    { name: "Boulder", note: "lifestyle and outdoors over budget friendliness" },
    { name: "Fort Collins", note: "a smaller-city feel without going fully rural" },
  ],
  Florida: [
    { name: "Miami", note: "energy and lifestyle more than rent stability" },
    { name: "St. Petersburg", note: "lifestyle with less intensity than Miami" },
    { name: "Orlando", note: "a bigger renter market and more mainstream pricing" },
  ],
  Georgia: [
    { name: "Atlanta", note: "the deepest inventory and strongest job access" },
    { name: "Savannah", note: "charm and pace more than a giant market" },
  ],
};

const DEFAULT_PRIORITIES = {
  price: "medium",
  space: "medium",
  commute: "medium",
  neighborhood: "medium",
  amenities: "medium",
} as const;

type ProfileUpdate = Partial<SearchProfileData>;
export type ConversationHint = "budget" | "bedrooms" | "move-in timeframe" | "location" | "priorities" | null;
type NextPromptAction =
  | "ask-location"
  | "ask-budget"
  | "ask-bedrooms"
  | "ask-move-in"
  | "ask-priorities"
  | "ask-laundry"
  | "ask-commute"
  | "offer-listings"
  | "offer-comparison";

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T extends object>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

function parseBoolean(value: number | null): boolean | null {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

function jsonString(value: unknown) {
  return JSON.stringify(value);
}

function sqlBoolean(value: boolean | null) {
  if (value === null) return null;
  return value ? 1 : 0;
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseAmountToken(raw: string) {
  const normalized = raw.trim().toLowerCase().replace(/\$/g, "").replace(/,/g, "");
  if (!normalized) return null;
  if (normalized.endsWith("k")) {
    const numeric = Number(normalized.slice(0, -1));
    return Number.isFinite(numeric) ? Math.round(numeric * 1000) : null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseBedroomToken(raw: string) {
  const lower = raw.trim().toLowerCase();
  const words: Record<string, number> = {
    studio: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
  };

  if (lower in words) {
    return words[lower];
  }

  const numeric = Number(lower);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeLocationPhrase(raw: string) {
  const lower = raw.toLowerCase();
  if (lower === "nyc") return "New York";
  const match = KNOWN_LOCATIONS.find((location) => location.toLowerCase() === lower);
  return match ?? raw;
}

function extractLocations(message: string): string[] {
  const lower = message.toLowerCase();
  return KNOWN_LOCATIONS.filter((location) => lower.includes(location.toLowerCase()));
}

function findBroadRegion(message: string, profile: SearchProfileData) {
  const locations = extractLocations(message);
  const candidate = [...locations, ...profile.locations].find((location) => location in STATE_LOCATION_OPTIONS);
  return candidate ?? null;
}

function extractLocationsToRemove(message: string) {
  const lower = message.toLowerCase();
  return KNOWN_LOCATIONS.filter(
    (location) =>
      lower.includes(`not ${location.toLowerCase()}`) ||
      lower.includes(`no ${location.toLowerCase()}`) ||
      lower.includes(`remove ${location.toLowerCase()}`) ||
      lower.includes(`drop ${location.toLowerCase()}`),
  );
}

function extractBudget(message: string, hint: ConversationHint) {
  const normalized = message.replace(/,/g, "");
  const rangeMatch = normalized.match(/\$?(\d+(?:\.\d+)?k?)\s*(?:to|-)\s*\$?(\d+(?:\.\d+)?k?)/i);
  const prefixMaxMatch = normalized.match(/(?:under|max|budget|up to|ceiling|tops?)\s*\$?(\d+(?:\.\d+)?k?)/i);
  const suffixMaxMatch = normalized.match(/\$?(\d+(?:\.\d+)?k?)\s*(?:max|maximum|tops?|ceiling)/i);
  const stretchMatch = normalized.match(/(?:can go up to|could go up to|stretch to|stretch up to)\s*\$?(\d+(?:\.\d+)?k?)/i);
  const minMatch = normalized.match(/(?:at least|minimum|min)\s*\$?(\d+(?:\.\d+)?k?)/i);
  const aroundMatch = normalized.match(/(?:around|about)\s*\$?(\d+(?:\.\d+)?k?)/i);
  const fuzzyBudgetMatch = normalized.match(
    /(?:probably|maybe|roughly|roughly around|around|about|like|something like|ish|maybe around)\s*\$?(\d+(?:\.\d+)?k?)/i,
  );
  const plainMatch = normalized.match(/\$?(\d+(?:\.\d+)?k?)/i);

  if (rangeMatch) {
    const min = parseAmountToken(rangeMatch[1]);
    const max = parseAmountToken(rangeMatch[2]);
    if (min !== null && max !== null) {
      return { budgetMin: Math.min(min, max), budgetMax: Math.max(min, max) };
    }
  }

  if (minMatch) {
    const value = parseAmountToken(minMatch[1]);
    if (value !== null) return { budgetMin: value };
  }

  for (const match of [prefixMaxMatch, suffixMaxMatch, stretchMatch, aroundMatch]) {
    if (!match) continue;
    const value = parseAmountToken(match[1]);
    if (value !== null) return { budgetMax: value };
  }

  if (hint === "budget" && fuzzyBudgetMatch) {
    const value = parseAmountToken(fuzzyBudgetMatch[1]);
    if (value !== null) return { budgetMax: value };
  }

  if (
    plainMatch &&
    (/dollar|budget|\$|rent|month|monthly|ceiling|under|max/i.test(message) || hint === "budget")
  ) {
    const value = parseAmountToken(plainMatch[1]);
    return value !== null ? { budgetMax: value } : {};
  }

  return {};
}

function extractBedrooms(message: string, hint: ConversationHint) {
  const lower = message.toLowerCase();
  const updates: ProfileUpdate = {};

  if (lower.includes("studio")) {
    updates.bedroomsFlexible = dedupe(["studio"]);
  }

  const wordBedMatch = lower.match(/\b(one|two|three|four)\s*(?:bed|bedroom)\b/);
  if (wordBedMatch) {
    const parsed = parseBedroomToken(wordBedMatch[1]);
    if (parsed !== null) updates.bedroomsPreferred = parsed;
  }

  const bedMatch = lower.match(/(\d)\s*(?:bed|bedroom|br)/);
  if (bedMatch) {
    updates.bedroomsPreferred = Number(bedMatch[1]);
  }

  const bedOnlyMatch = lower.match(/(?:aiming for|looking for|want|need|prefer)\s+(?:a\s+)?(studio|one|two|three|four|\d)\b/);
  if (bedOnlyMatch) {
    const parsed = parseBedroomToken(bedOnlyMatch[1]);
    if (parsed !== null) updates.bedroomsPreferred = parsed;
  }

  if (hint === "bedrooms" && updates.bedroomsPreferred === undefined) {
    const raw = lower.match(/\b(studio|one|two|three|four|\d)\b/);
    const parsed = raw ? parseBedroomToken(raw[1]) : null;
    if (parsed !== null) updates.bedroomsPreferred = parsed;
  }

  const flexibleStudioMatch = lower.match(
    /(?:studio is fine|studio is okay|studio is ok|flexible on bedrooms|something flexible|open to a studio)/,
  );
  if (flexibleStudioMatch) {
    updates.bedroomsFlexible = dedupe([...(updates.bedroomsFlexible ?? []), "studio"]);
  }

  if (/only studio|studio only/.test(lower)) {
    updates.bedroomsPreferred = 0;
    updates.bedroomsFlexible = [];
  }

  if (lower.includes("flexible")) {
    const flexible = updates.bedroomsFlexible ?? [];
    updates.bedroomsFlexible = dedupe([...flexible, "flexible"]);
  }

  return updates;
}

function extractMoveIn(message: string, hint: ConversationHint) {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  const lower = message.toLowerCase();
  const month = months.find((entry) => new RegExp(`\\b${entry}\\b`, "i").test(lower));
  if (month) {
    return { moveInTimeframe: month[0].toUpperCase() + month.slice(1) };
  }

  if (lower.includes("this summer")) return { moveInTimeframe: "This summer" };
  if (lower.includes("end of summer")) return { moveInTimeframe: "End of summer" };
  if (lower.includes("fall")) return { moveInTimeframe: "Fall" };
  if (lower.includes("winter")) return { moveInTimeframe: "Winter" };
  if (lower.includes("spring")) return { moveInTimeframe: "Spring" };
  if (lower.includes("asap")) return { moveInTimeframe: "ASAP" };
  if (lower.includes("next month")) return { moveInTimeframe: "Next month" };
  if (hint === "move-in timeframe" && lower.trim().length > 0) return { moveInTimeframe: message.trim() };

  return {};
}

function isRecommendationRequest(message: string) {
  const lower = message.toLowerCase();
  return (
    /any good (cities|areas|neighborhoods)/.test(lower) ||
    /where should i live/.test(lower) ||
    /what part of/.test(lower) ||
    /best (cities|areas|places)/.test(lower) ||
    (/good/.test(lower) && /(cities|areas|places)/.test(lower))
  );
}

function parseRequestedListingCount(message: string) {
  const lower = message.toLowerCase();
  const directMatch = lower.match(
    /\b(\d{1,3})\s+(?:more\s+)?(?:listing|listings|matches|options|properties|places|apartments|rentals|homes)\b/,
  );
  if (directMatch) return Number(directMatch[1]);

  const showMatch = lower.match(
    /(?:show|give|send|pull|surface|find)\s+me\s+(\d{1,3})\b/,
  );
  if (showMatch) return Number(showMatch[1]);

  if (/\ba few\b/.test(lower)) return 5;
  if (/\ba bunch\b/.test(lower)) return 12;
  if (/\ball\b/.test(lower)) return 24;
  return null;
}

export function parseListingBrowseRequest(message: string, requestIndex = 0, previousCount = 12): ListingBrowseRequest | null {
  const lower = message.toLowerCase();
  const mentionsListings = /(listing|listings|match|matches|option|options|property|properties|place|places|apartment|apartments|rental|rentals|homes)/.test(
    lower,
  );
  const browseIntent = /(show|see|browse|open|give|send|pull|surface|find|more|another|next)/.test(lower);
  const conversationalMoreButNotBrowsing =
    /\bcare more about\b/.test(lower) ||
    /\bmatters more than\b/.test(lower) ||
    /\bmore important than\b/.test(lower);

  if (conversationalMoreButNotBrowsing && !mentionsListings) return null;
  if (!mentionsListings && !/\bmore\b/.test(lower)) return null;
  if (!browseIntent) return null;

  const requestedCount = parseRequestedListingCount(message);
  const isMoreRequest = /\b(more|another|next)\b/.test(lower);
  const fallbackCount = isMoreRequest ? previousCount : 12;

  return {
    count: Math.min(Math.max(requestedCount ?? fallbackCount, 1), 24),
    hasExplicitCount: requestedCount !== null,
    isMoreRequest,
    message,
    requestIndex,
  };
}

function updatePriorityFromMessage(profile: SearchProfileData, message: string): ProfileUpdate {
  const lower = message.toLowerCase();
  const priorities = { ...profile.priorities };
  const fields = ["price", "space", "commute", "neighborhood", "amenities"] as const;
  const mentionedFields = fields.filter((field) => new RegExp(`\\b${field}\\b`, "i").test(lower));

  const moreThanMatch = lower.match(
    /(price|space|commute|neighborhood|amenities)\s+(?:matters more than|more important than)\s+(price|space|commute|neighborhood|amenities)/,
  );
  if (moreThanMatch) {
    priorities[moreThanMatch[1] as keyof typeof priorities] = "high";
    priorities[moreThanMatch[2] as keyof typeof priorities] = "low";
  }

  const careMoreThanMatch = lower.match(
    /care more about\s+(price|space|commute|neighborhood|amenities)\s+than\s+(price|space|commute|neighborhood|amenities)/,
  );
  if (careMoreThanMatch) {
    priorities[careMoreThanMatch[1] as keyof typeof priorities] = "high";
    priorities[careMoreThanMatch[2] as keyof typeof priorities] = "low";
  }

  const groupedPriorityReply =
    mentionedFields.length >= 2 &&
    !/\bmore than\b/.test(lower) &&
    !/\bless than\b/.test(lower) &&
    !/\bnot important\b/.test(lower) &&
    !/\bdon't care about\b/.test(lower) &&
    (hintLooksLikePriorityReply(lower) || /,| and |\/|&/.test(lower));

  if (groupedPriorityReply) {
    for (const field of fields) {
      priorities[field] = mentionedFields.includes(field) ? "high" : priorities[field] === "high" ? "medium" : priorities[field];
    }
  }

  for (const field of fields) {
    if (
      lower.includes(`care more about ${field}`) ||
      lower.includes(`${field} matters more`) ||
      lower.includes(`${field} is more important`)
    ) {
      priorities[field] = "high";
    }

    if (
      lower.includes(`care less about ${field}`) ||
      lower.includes(`${field} matters less`) ||
      lower.includes(`${field} is not important`) ||
      lower.includes(`not too worried about ${field}`)
    ) {
      priorities[field] = "low";
    }

    if (
      lower.includes(`${field} matters most`) ||
      lower.includes(`${field} is the biggest thing`) ||
      lower.includes(`${field} is my top priority`)
    ) {
      priorities[field] = "high";
    }
  }

  return { priorities };
}

function hintLooksLikePriorityReply(message: string) {
  return (
    /\bwhat matters most\b/.test(message) ||
    /\bpriority\b/.test(message) ||
    /\bmatters most\b/.test(message) ||
    /\bcare most about\b/.test(message)
  );
}

function extractCommuteTarget(message: string): ProfileUpdate {
  const lower = message.toLowerCase();
  const commuteMatch = lower.match(
    /(?:commute to|need to get to|getting to|close to|near the train to)\s+([a-z0-9\s-]{3,40})/i,
  );
  if (!commuteMatch) return {};
  const target = commuteMatch[1].replace(/\b(by|for|around|under|with)\b.*$/i, "").trim();
  return target ? { commuteTarget: toTitleCase(target) } : {};
}

function extractDealbreakers(profile: SearchProfileData, message: string): ProfileUpdate {
  const lower = message.toLowerCase();
  const dealbreakers = new Set(profile.dealbreakers);

  if (/(no broker fee|broker fee is a dealbreaker|won't do a broker fee)/.test(lower)) {
    dealbreakers.add("broker fee");
  }

  if (/(ground floor is a dealbreaker|no ground floor)/.test(lower)) {
    dealbreakers.add("ground floor");
  }

  if (/(walk-up is a dealbreaker|no walk-up|no walkups)/.test(lower)) {
    dealbreakers.add("walk-up");
  }

  if (/(dealbreaker|hard no)/.test(lower) && lower.includes("parking")) {
    dealbreakers.add("parking");
  }

  return { dealbreakers: dedupe([...dealbreakers]) };
}

function extractRequirements(profile: SearchProfileData, message: string): ProfileUpdate {
  const lower = message.toLowerCase();
  const mustHaves = new Set(profile.mustHaves);
  const niceToHaves = new Set(profile.niceToHaves);
  const updates: ProfileUpdate = {};

  if (lower.includes("laundry")) {
    if (
      lower.includes("must-have") ||
      lower.includes("must have") ||
      lower.includes("must be") ||
      lower.includes("has to be")
    ) {
      mustHaves.add("laundry");
      niceToHaves.delete("laundry");
      updates.laundryRequired = true;
    } else if (
      lower.includes("laundry is optional") ||
      lower.includes("laundry can be optional") ||
      lower.includes("laundry is just a nice to have") ||
      lower.includes("laundry is nice to have") ||
      lower.includes("laundry not a must")
    ) {
      mustHaves.delete("laundry");
      niceToHaves.add("laundry");
      updates.laundryRequired = false;
    } else if (lower.includes("don't care about laundry") || lower.includes("do not care about laundry")) {
      mustHaves.delete("laundry");
      niceToHaves.delete("laundry");
      updates.laundryRequired = false;
    } else {
      niceToHaves.add("laundry");
    }
  }

  if (lower.includes("parking")) {
    if (lower.includes("don't care about parking") || lower.includes("do not care about parking")) {
      mustHaves.delete("parking");
      niceToHaves.delete("parking");
      updates.parkingRequired = false;
    } else if (
      lower.includes("parking is optional") ||
      lower.includes("parking can be optional") ||
      lower.includes("parking is nice to have") ||
      lower.includes("parking not a must")
    ) {
      mustHaves.delete("parking");
      niceToHaves.add("parking");
      updates.parkingRequired = false;
    } else if (lower.includes("parking is a must") || lower.includes("need parking")) {
      mustHaves.add("parking");
      niceToHaves.delete("parking");
      updates.parkingRequired = true;
    } else {
      niceToHaves.add("parking");
    }
  }

  if (lower.includes("pets")) {
    if (lower.includes("pets are a must") || lower.includes("pet friendly is a must")) {
      mustHaves.add("pet friendly");
      niceToHaves.delete("pet friendly");
      updates.petsRequired = true;
    } else if (
      lower.includes("pet friendly is optional") ||
      lower.includes("pets are optional") ||
      lower.includes("pets are nice to have") ||
      lower.includes("pet friendly not a must")
    ) {
      mustHaves.delete("pet friendly");
      niceToHaves.add("pet friendly");
      updates.petsRequired = false;
    }
    if (lower.includes("no pets")) {
      mustHaves.delete("pet friendly");
      niceToHaves.delete("pet friendly");
      updates.petsRequired = false;
    }
  }

  updates.mustHaves = dedupe([...mustHaves]);
  updates.niceToHaves = dedupe([...niceToHaves]);
  return updates;
}

function extractPropertyType(message: string): ProfileUpdate {
  const lower = message.toLowerCase();
  if (lower.includes("apartment")) return { propertyType: "apartment" };
  if (lower.includes("house")) return { propertyType: "house" };
  if (lower.includes("condo")) return { propertyType: "condo" };
  if (lower.includes("room")) return { propertyType: "room" };
  if (lower.includes("home")) return { propertyType: "house" };
  return {};
}

function extractIntent(message: string): ProfileUpdate {
  const lower = message.toLowerCase();
  if (lower.includes("buy")) return { intent: "buy" };
  if (lower.includes("rent") || lower.includes("apartment") || lower.includes("place") || lower.includes("house") || lower.includes("home")) {
    return { intent: "rent" };
  }
  return {};
}

function extractExclusiveLocation(message: string): ProfileUpdate {
  const lower = message.toLowerCase();
  if (!lower.includes("only")) return {};
  const found = extractLocations(message);
  if (found.length === 0) return {};
  return { locations: dedupe(found.map(normalizeLocationPhrase)) };
}

export function mapProfileRow(row: Record<string, unknown>): SearchProfileData {
  return {
    id: String(row.id),
    boardId: String(row.boardId),
    intent: (row.intent as SearchProfileData["intent"]) ?? null,
    propertyType: (row.propertyType as SearchProfileData["propertyType"]) ?? null,
    locations: parseJsonArray((row.locations as string | null) ?? null),
    budgetMin: (row.budgetMin as number | null) ?? null,
    budgetMax: (row.budgetMax as number | null) ?? null,
    bedroomsPreferred: (row.bedroomsPreferred as number | null) ?? null,
    bedroomsFlexible: parseJsonArray((row.bedroomsFlexible as string | null) ?? null),
    moveInTimeframe: (row.moveInTimeframe as string | null) ?? null,
    mustHaves: parseJsonArray((row.mustHaves as string | null) ?? null),
    niceToHaves: parseJsonArray((row.niceToHaves as string | null) ?? null),
    dealbreakers: parseJsonArray((row.dealbreakers as string | null) ?? null),
    priorities: parseJsonObject((row.priorities as string | null) ?? null, { ...DEFAULT_PRIORITIES }),
    petsRequired: parseBoolean((row.petsRequired as number | null) ?? null),
    parkingRequired: parseBoolean((row.parkingRequired as number | null) ?? null),
    laundryRequired: parseBoolean((row.laundryRequired as number | null) ?? null),
    commuteTarget: (row.commuteTarget as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

export function getConversationHint(messages: Array<{ role: string; content: string }>): ConversationHint {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (!lastAssistant) return null;

  const lower = lastAssistant.content.toLowerCase();
  if (
    lower.includes("budget") ||
    lower.includes("monthly ceiling") ||
    lower.includes("stay under") ||
    lower.includes("monthly cap") ||
    lower.includes("price range") ||
    lower.includes("monthly number")
  ) {
    return "budget";
  }
  if (lower.includes("studio") || lower.includes("1 bed") || lower.includes("bedroom")) return "bedrooms";
  if (lower.includes("move in") || lower.includes("move-in") || lower.includes("hoping to move")) return "move-in timeframe";
  if (lower.includes("city") || lower.includes("neighborhood")) return "location";
  if (lower.includes("matters most") || lower.includes("priority")) return "priorities";
  return null;
}

export function applyMessageToProfile(
  profile: SearchProfileData,
  message: string,
  conversationHint: ConversationHint = null,
): SearchProfileData {
  const commuteUpdate = extractCommuteTarget(message);
  const locationsToRemove = extractLocationsToRemove(message);
  const locationUpdates = extractExclusiveLocation(message);
  const filteredExclusiveLocations = locationUpdates.locations
    ? locationUpdates.locations.filter(
        (location) => !locationsToRemove.some((removed) => removed.toLowerCase() === location.toLowerCase()),
      )
    : null;
  const removedLocations =
    locationsToRemove.length > 0
      ? profile.locations.filter(
          (location) => !locationsToRemove.some((removed) => removed.toLowerCase() === location.toLowerCase()),
        )
      : null;
  const updates: ProfileUpdate = {
    ...extractIntent(message),
    ...extractPropertyType(message),
    ...extractBudget(message, conversationHint),
    ...extractBedrooms(message, conversationHint),
    ...extractMoveIn(message, conversationHint),
    ...extractRequirements(profile, message),
    ...commuteUpdate,
    ...extractDealbreakers(profile, message),
    ...updatePriorityFromMessage(profile, message),
    ...(filteredExclusiveLocations ? { locations: filteredExclusiveLocations } : locationUpdates),
  };

  if (!locationUpdates.locations) {
    const locations = extractLocations(message);
    const commuteOnlyLocations =
      commuteUpdate.commuteTarget !== undefined
        ? locations.filter((location) => location.toLowerCase() === commuteUpdate.commuteTarget?.toLowerCase())
        : [];

    const shouldSuppressLocationAdd =
      commuteUpdate.commuteTarget !== undefined &&
      locations.length > 0 &&
      commuteOnlyLocations.length === locations.length;

    if (locations.length > 0 && !shouldSuppressLocationAdd) {
      updates.locations = dedupe([...profile.locations, ...locations.map(normalizeLocationPhrase)]);
    }
  }

  return {
    ...profile,
    ...updates,
    mustHaves: updates.mustHaves ?? profile.mustHaves,
    niceToHaves: updates.niceToHaves ?? profile.niceToHaves,
    dealbreakers: updates.dealbreakers ?? profile.dealbreakers,
    bedroomsFlexible: updates.bedroomsFlexible ?? profile.bedroomsFlexible,
    priorities: updates.priorities ?? profile.priorities,
    locations: updates.locations ?? removedLocations ?? profile.locations,
    updatedAt: new Date().toISOString(),
  };
}

export function getMissingFields(profile: SearchProfileData) {
  const missing: string[] = [];
  if (!profile.intent) missing.push("intent");
  if (profile.locations.length === 0) missing.push("location");
  if (!profile.budgetMax && !profile.budgetMin) missing.push("budget");
  if (profile.bedroomsPreferred === null && profile.bedroomsFlexible.length === 0) missing.push("bedrooms");
  if (!profile.moveInTimeframe) missing.push("move-in timeframe");
  return missing;
}

function highestPriorities(profile: SearchProfileData) {
  return Object.entries(profile.priorities)
    .filter(([, level]) => level === "high")
    .map(([key]) => key)
    .slice(0, 2);
}

function describeBedroomPreference(profile: SearchProfileData) {
  if (profile.bedroomsPreferred !== null) {
    return profile.bedroomsPreferred === 0 ? "studio" : `${profile.bedroomsPreferred} bed`;
  }

  if (profile.bedroomsFlexible.length > 0) {
    return profile.bedroomsFlexible.join(", ");
  }

  return "open bedroom count";
}

function describeBudget(profile: SearchProfileData) {
  if (profile.budgetMin !== null && profile.budgetMax !== null) {
    return `$${profile.budgetMin.toLocaleString()} to $${profile.budgetMax.toLocaleString()}`;
  }

  if (profile.budgetMax !== null) return `up to $${profile.budgetMax.toLocaleString()}`;
  if (profile.budgetMin !== null) return `from about $${profile.budgetMin.toLocaleString()}`;
  return "an open budget";
}

function determineNextAction(profile: SearchProfileData, listingsCount: number): NextPromptAction {
  const missing = getMissingFields(profile);

  if (missing[0] === "location") return "ask-location";
  if (missing[0] === "budget") return "ask-budget";
  if (missing[0] === "bedrooms") return "ask-bedrooms";
  if (missing[0] === "move-in timeframe") return "ask-move-in";
  if (missing[0] === "intent") return "ask-location";

  const priorityList = highestPriorities(profile);
  if (priorityList.length === 0) return "ask-priorities";
  if (profile.laundryRequired === null) return "ask-laundry";
  if (!profile.commuteTarget && profile.priorities.commute === "high") return "ask-commute";
  if (listingsCount > 1) return "offer-comparison";
  return "offer-listings";
}

function buildRegionRecommendation(profile: SearchProfileData, message: string) {
  const region = findBroadRegion(message, profile);
  if (!region) return null;

  const options = STATE_LOCATION_OPTIONS[region];
  if (!options) return null;

  const shortList = options
    .slice(0, 4)
    .map((entry) => `${entry.name} if you want ${entry.note}`)
    .join("; ");
  return `${region} is broad enough that I would not pick randomly. I’d start with ${shortList}. Tell me whether you care more about price, nightlife, space, or commute, and I can narrow that down instead of pretending one city is just “best.”`;
}

function summarizeProfileChanges(previous: SearchProfileData, next: SearchProfileData) {
  const changes: string[] = [];

  if (JSON.stringify(previous.locations) !== JSON.stringify(next.locations) && next.locations.length > 0) {
    changes.push(`location locked to ${next.locations.join(" / ")}`);
  }

  if (previous.budgetMin !== next.budgetMin || previous.budgetMax !== next.budgetMax) {
    changes.push(`budget now ${describeBudget(next)}`);
  }

  if (
    previous.bedroomsPreferred !== next.bedroomsPreferred ||
    JSON.stringify(previous.bedroomsFlexible) !== JSON.stringify(next.bedroomsFlexible)
  ) {
    changes.push(`searching for ${describeBedroomPreference(next)} options`);
  }

  if (previous.moveInTimeframe !== next.moveInTimeframe && next.moveInTimeframe) {
    changes.push(`move-in around ${next.moveInTimeframe}`);
  }

  if (previous.laundryRequired !== next.laundryRequired) {
    changes.push(
      next.laundryRequired ? "laundry treated as a must-have" : "laundry moved out of must-have territory",
    );
  }

  if (previous.parkingRequired !== next.parkingRequired) {
    changes.push(next.parkingRequired ? "parking treated as a must-have" : "parking relaxed");
  }

  if (previous.petsRequired !== next.petsRequired) {
    changes.push(next.petsRequired ? "pet-friendly options kept in play" : "pets no longer a requirement");
  }

  if (previous.commuteTarget !== next.commuteTarget && next.commuteTarget) {
    changes.push(`commute target set to ${next.commuteTarget}`);
  }

  const previousTop = highestPriorities(previous).join(",");
  const nextTop = highestPriorities(next).join(",");
  if (previousTop !== nextTop && nextTop) {
    changes.push(`top priorities now ${highestPriorities(next).join(" and ")}`);
  }

  if (JSON.stringify(previous.dealbreakers) !== JSON.stringify(next.dealbreakers) && next.dealbreakers.length > 0) {
    changes.push(`dealbreakers include ${next.dealbreakers.join(", ")}`);
  }

  return changes;
}

function isExploratoryMessage(message: string) {
  return /\b(any good|not sure|i guess|maybe|probably|kind of|somewhere|open to|help me pick)\b/i.test(message);
}

function makeNaturalList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function humanizeChange(change: string) {
  return change
    .replace(/^location locked to /, "")
    .replace(/^budget now /, "budget ")
    .replace(/^searching for /, "")
    .replace(/ options$/, "")
    .replace(/^move-in around /, "a move around ")
    .replace(/^commute target set to /, "a commute to ")
    .replace(/^top priorities now /, "more weight on ")
    .replace(/^dealbreakers include /, "avoiding ");
}

function buildNextQuestion(action: NextPromptAction) {
  switch (action) {
    case "ask-location":
      return "What city or neighborhood should I zero in on first?";
    case "ask-budget":
      return "What monthly ceiling should I stay under?";
    case "ask-bedrooms":
      return "Are you mostly thinking studio, 1 bed, 2 bed, or are you flexible?";
    case "ask-move-in":
      return "When are you hoping to move?";
    case "ask-priorities":
      return "What matters most to you from here? You can pick more than one, like price and commute or space plus neighborhood.";
    case "ask-laundry":
      return "Quick practical one: is laundry a must-have, a nice-to-have, or not a big deal?";
    case "ask-commute":
      return "Since commute seems important, where do you actually need to get to most often?";
    case "offer-comparison":
      return "You’ve got enough options now that the deck and comparison panel should both start being useful.";
    case "offer-listings":
      return "You’ve given me enough to start showing real options, so the next move is opening the deck and pressure-testing what actually feels right.";
  }
}

function chooseAcknowledgement(changes: string[], message: string) {
  if (/show|see|browse|look at|open/i.test(message) && /listing|match|option|apartment|place/i.test(message)) {
    return "Yeah, we’re at the point where browsing makes sense.";
  }

  if (changes.length === 0) {
    if (isExploratoryMessage(message)) return "Makes sense.";
    return "Got you.";
  }

  const naturalChanges = changes.slice(0, 3).map(humanizeChange);
  const summary = makeNaturalList(naturalChanges);

  if (changes.length === 1) {
    const replies = [
      `Okay. I’ve updated the board around ${summary}.`,
      `Got it. I’m using ${summary} as part of the working search now.`,
      `Makes sense. I’ve folded ${summary} into the search.`,
      `Alright. ${summary[0]?.toUpperCase() ?? ""}${summary.slice(1)} is now part of the working brief.`,
    ];
    return replies[message.length % replies.length];
  }

  if (changes.length === 2) {
    return `Got it. I’ve updated the board around ${summary}.`;
  }

  return `Alright, that helps. I’ve updated the board around ${summary}, plus a couple related tweaks.`;
}

function inferSoftIntent(message: string, profile: SearchProfileData, hint: ConversationHint) {
  const lower = message.toLowerCase();

  if (
    hint === "budget" &&
    profile.budgetMax !== null &&
    /\b(probably|maybe|roughly|around|about|ish)\b/.test(lower)
  ) {
    return `I’ll treat that as roughly $${profile.budgetMax.toLocaleString()} unless you want to tighten it later.`;
  }

  if (
    hint === "location" &&
    profile.locations.length > 0 &&
    /\b(probably|maybe|i guess|somewhere|open to)\b/.test(lower)
  ) {
    return `I’ll use ${profile.locations.join(" / ")} as the working area for now and we can narrow it if the tradeoffs look off.`;
  }

  return null;
}

function buildSearchSummary(profile: SearchProfileData) {
  const parts = [
    `${describeBedroomPreference(profile)} options`,
    profile.locations.length > 0 ? `around ${profile.locations.join(" / ")}` : null,
    `with a budget of ${describeBudget(profile)}`,
    profile.moveInTimeframe ? `for a ${profile.moveInTimeframe} move` : null,
  ].filter(Boolean);

  return parts.join(" ");
}

export function generateAssistantReply(
  previousProfile: SearchProfileData,
  nextProfile: SearchProfileData,
  message: string,
  listingsCount: number,
  conversationHint: ConversationHint = null,
) {
  const nextAction = determineNextAction(nextProfile, listingsCount);
  const changes = summarizeProfileChanges(previousProfile, nextProfile);
  const acknowledgement = chooseAcknowledgement(changes, message);
  const regionRecommendation = isRecommendationRequest(message) ? buildRegionRecommendation(nextProfile, message) : null;
  const browseRequest = parseListingBrowseRequest(message);
  const softIntent = inferSoftIntent(message, nextProfile, conversationHint);

  if (regionRecommendation) {
    return `${acknowledgement} ${regionRecommendation}`;
  }

  if (browseRequest) {
    const countLabel = browseRequest.count === 1 ? "1 match" : `${browseRequest.count} matches`;
    const moreLine = browseRequest.isMoreRequest
      ? `I pulled another batch of ${countLabel}.`
      : `I pulled a fresh batch of ${countLabel}.`;
    return `${acknowledgement} ${moreLine} Open the deck, and if you want me to change the pace just say something like “show me 5” or “give me 20 more.”`;
  }

  if (/compare|which one|best option/i.test(message) && listingsCount > 1) {
    return `${acknowledgement} You’ve got enough saved options now for a real comparison, so I’d browse the deck first and then use the comparison read as the sanity check.`;
  }

  const searchSummary = `Right now I’m looking for ${buildSearchSummary(nextProfile)}.`;

  if (nextAction === "offer-listings" || nextAction === "offer-comparison") {
    return `${acknowledgement} ${softIntent ? `${softIntent} ` : ""}${searchSummary} ${buildNextQuestion(nextAction)}`;
  }

  return `${acknowledgement} ${softIntent ? `${softIntent} ` : ""}${buildNextQuestion(nextAction)}`;
}

function formatListingName(item: BoardListingRecord) {
  const listing = item.listing;
  const place = [listing.neighborhood, listing.city].filter(Boolean).join(", ");
  return place ? `${place} at $${(listing.price ?? 0).toLocaleString()}` : "This listing";
}

export function generateComparison(profile: SearchProfileData, listings: BoardListingRecord[]) {
  if (listings.length === 0) {
    return "You have not saved anything yet, which means there is nothing honest to compare. Open the match deck, save a few real contenders, and this read will become much more useful.";
  }

  const active = listings.filter((item) => item.userStatus !== "rejected");
  if (active.length === 0) {
    return "Everything on this board is currently rejected, which usually means either the search is too tight or the current options are weak. I’d widen the lens a little and browse again.";
  }

  const byPrice = [...active].sort((a, b) => (a.listing.price ?? Infinity) - (b.listing.price ?? Infinity));
  const bySpace = [...active].sort((a, b) => (b.listing.squareFeet ?? 0) - (a.listing.squareFeet ?? 0));
  const practical = byPrice[0];
  const spacious = bySpace[0];
  const risky = active.find((item) => item.listing.status === "unknown" || item.aiRedFlags.length >= 3) ?? active[0];
  const priorities = highestPriorities(profile);

  return `${formatListingName(practical)} looks like the strongest practical option because it keeps the price pressure down while still staying in play for your current search. ${formatListingName(spacious)} seems like the best space-first option, so it becomes more attractive if room to live matters more than staying tightly under budget. ${formatListingName(risky)} is the one I would treat most carefully because the open questions and red flags are harder to ignore. Since you said ${priorities.length > 0 ? priorities.join(" and ") : "overall fit"} ${priorities.length > 1 ? "matter" : "matters"} most, I would use that lens instead of chasing the prettiest listing on paper.`;
}

export function generateListingAnalysis(profile: SearchProfileData, listing: BoardListingRecord) {
  const priorities = highestPriorities(profile);
  const listingPlace = [listing.listing.neighborhood, listing.listing.city].filter(Boolean).join(", ");
  const priceLine =
    listing.listing.price && profile.budgetMax
      ? listing.listing.price <= profile.budgetMax
        ? "It fits inside your current budget."
        : "It runs above your current budget, so it only makes sense if you are willing to stretch."
      : "The price is not easy to judge against your budget yet.";

  const sizeLine = listing.listing.squareFeet
    ? `The listed size is about ${listing.listing.squareFeet} square feet, which gives us at least a rough sense of space.`
    : "The listing does not clearly say how much space you are getting.";

  return `Based on the preferences on this board, this feels like a ${listing.userStatus === "interested" ? "strong candidate" : "workable option"} rather than a guaranteed match. ${priceLine} ${sizeLine} The main context here is ${listingPlace || "the location"}, and I would judge it mostly through the lens of ${priorities.length > 0 ? priorities.join(" and ") : "your broader priorities"}. The biggest concern is still the missing information, so this should stay on the board with healthy skepticism instead of instant confidence.`;
}

export function createBlankProfile(boardId: string): SearchProfileData {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    boardId,
    intent: "rent",
    propertyType: "apartment",
    locations: [],
    budgetMin: null,
    budgetMax: null,
    bedroomsPreferred: null,
    bedroomsFlexible: [],
    moveInTimeframe: null,
    mustHaves: [],
    niceToHaves: [],
    dealbreakers: [],
    priorities: { ...DEFAULT_PRIORITIES },
    petsRequired: null,
    parkingRequired: null,
    laundryRequired: null,
    commuteTarget: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createBoard(title = "New rental search"): SearchBoardSummary {
  const now = new Date().toISOString();
  return { id: randomUUID(), userId: randomUUID(), title, createdAt: now, updatedAt: now };
}

export function updateProfile(profile: SearchProfileData) {
  return {
    ...profile,
    updatedAt: new Date().toISOString(),
  };
}
