import "server-only";

import { parseListingBrowseRequest } from "@/lib/rental-logic";
import { matchDemoScenarioForProfile } from "@/lib/demo-scenarios";
import type { ChatMessage, SearchProfileData } from "@/lib/types";

type DemoReplyInput = {
  previousProfile: SearchProfileData;
  message: string;
  messages: ChatMessage[];
  listingsCount: number;
};

type DemoProfilePatch = Partial<SearchProfileData>;

const DEMO_QUESTIONS = {
  location: "What city or neighborhood should I anchor the board on first?",
  budget: "What monthly budget range feels real, and what is the stretch number if the right place shows up?",
  bedrooms: "What bedroom setup should I target for the group?",
  moveIn: "When is the group trying to move?",
  priorities: "What matters most for this group once listings start competing: commute, neighborhood, price, space, or amenities?",
};

function parseAmount(raw: string) {
  const normalized = raw.toLowerCase().replace(/\$/g, "").replace(/,/g, "").trim();
  if (!normalized) return null;
  if (normalized.endsWith("k")) {
    const numeric = Number(normalized.slice(0, -1));
    return Number.isFinite(numeric) ? Math.round(numeric * 1000) : null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function extractDemoUpdates(previousProfile: SearchProfileData, message: string): DemoProfilePatch {
  const lower = message.toLowerCase();
  const updates: DemoProfilePatch = {};

  if (/\b(rent|rental|apartment|house|home|condo|room)\b/.test(lower)) {
    updates.intent = "rent";
  }

  if (/\bhouse\b|\bhome\b/.test(lower)) {
    updates.propertyType = "house";
  } else if (/\bapartment\b/.test(lower)) {
    updates.propertyType = "apartment";
  } else if (/\bcondo\b/.test(lower)) {
    updates.propertyType = "condo";
  } else if (/\broom\b/.test(lower)) {
    updates.propertyType = "room";
  }

  if (/\bnew york city area\b|\bnyc area\b/.test(lower)) {
    updates.locations = ["New York"];
    updates.city = "New York";
  } else if (/\bnew york city\b|\bnyc\b|\bnew york\b/.test(lower)) {
    updates.locations = ["New York"];
    updates.city = "New York";
  } else if (/\bbrooklyn\b/.test(lower)) {
    updates.locations = ["Brooklyn"];
    updates.city = "New York";
  } else if (/\bqueens\b/.test(lower)) {
    updates.locations = ["Queens"];
    updates.city = "New York";
  } else if (/\bjersey city\b/.test(lower)) {
    updates.locations = ["Jersey City"];
    updates.city = "Jersey City";
  } else if (/\bhoboken\b/.test(lower)) {
    updates.locations = ["Hoboken"];
    updates.city = "Hoboken";
  } else if (/\blos angeles\b/.test(lower)) {
    updates.locations = ["Los Angeles"];
    updates.city = "Los Angeles";
  }

  if (/\bwith two roommates\b/.test(lower)) {
    updates.groupSize = 3;
    updates.hasRoommates = true;
  }

  if (/\bthree recent grads\b|\bthree grads\b|\b3 recent grads\b|\b3 grads\b/.test(lower)) {
    updates.groupSize = 3;
    updates.hasRoommates = true;
    if (updates.bedroomsPreferred === undefined && previousProfile.bedroomsPreferred == null) {
      updates.bedroomsPreferred = 3;
    }
  }

  const bedMatch =
    lower.match(/\b(\d)\s*(?:bed|bedroom|br)\b/) ??
    lower.match(/\b(one|two|three|four)\s*(?:bed|bedroom)\b/);
  if (bedMatch) {
    const raw = bedMatch[1];
    const bedroomMap: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
    updates.bedroomsPreferred = /^\d$/.test(raw) ? Number(raw) : bedroomMap[raw] ?? null;
  }

  if (/\bstudio\b/.test(lower) && updates.bedroomsPreferred === undefined) {
    updates.bedroomsPreferred = 0;
  }

  const budgetMatch =
    lower.match(/(?:under|less than|max|up to|ceiling|budget)\s+\$?(\d+(?:\.\d+)?k?)/) ??
    lower.match(/\$?(\d+(?:\.\d+)?k?)\s*(?:max|maximum)/) ??
    lower.match(/\b(?:probably|around|about|roughly|like)\s+\$?(\d+(?:\.\d+)?k?)\b/);
  if (budgetMatch) {
    const value = parseAmount(budgetMatch[1]);
    if (value !== null) updates.budgetMax = value;
  } else if (
    previousProfile.budgetMax == null &&
    /^\s*\$?\d[\d,]*(?:\.\d+)?k?\s*$/.test(message.trim())
  ) {
    const value = parseAmount(message.trim());
    if (value !== null) updates.budgetMax = value;
  }

  const budgetRangeMatch = lower.match(/\$?(\d+(?:\.\d+)?k?)\s*(?:-|to)\s*\$?(\d+(?:\.\d+)?k?)/);
  if (budgetRangeMatch) {
    const min = parseAmount(budgetRangeMatch[1]);
    const max = parseAmount(budgetRangeMatch[2]);
    if (min !== null && max !== null) {
      updates.budgetMin = Math.min(min, max);
      updates.budgetMax = Math.max(min, max);
    }
  }

  const stretchMatch = lower.match(/(?:stretch|maybe|max|maxing out|up to)\s+\$?(\d+(?:\.\d+)?k?)/);
  if (stretchMatch) {
    const stretch = parseAmount(stretchMatch[1]);
    if (stretch !== null) updates.stretchBudget = stretch;
  }

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
  const month = months.find((entry) => new RegExp(`\\b${entry}\\b`, "i").test(lower));
  if (month) {
    updates.moveInTimeframe = titleCase(month);
    updates.moveInDate = titleCase(month);
  } else if (/\basap\b/.test(lower)) {
    updates.moveInTimeframe = "ASAP";
    updates.moveInDate = "ASAP";
  } else if (/\bnext month\b/.test(lower)) {
    updates.moveInTimeframe = "Next month";
    updates.moveInDate = "Next month";
  }

  if (/\blaundry\b/.test(lower)) {
    updates.mustHaves = Array.from(new Set([...(previousProfile.mustHaves ?? []), "laundry"]));
    if (/\bmust\b|\bhas to\b|\bneed\b/.test(lower)) {
      updates.laundryRequired = true;
    }
  }

  if (/\bparking\b/.test(lower) && /\bdon'?t care\b|\bdo not care\b|\bno need\b/.test(lower)) {
    updates.parkingRequired = false;
    updates.niceToHaves = previousProfile.niceToHaves.filter((item) => item !== "parking");
    updates.mustHaves = previousProfile.mustHaves.filter((item) => item !== "parking");
  }

  if (/\bcommute\b/.test(lower)) {
    updates.priorities = Array.from(new Set([...(previousProfile.priorities ?? []), "commute"]));
  }

  if (/\bmidtown\b/.test(lower)) {
    updates.commuteTarget = "Midtown";
  }

  const maxCommuteMatch = lower.match(/(\d{1,3})\s*(?:min|mins|minute|minutes)\b/);
  if (maxCommuteMatch && /\bcommute\b/.test(lower)) {
    const parsed = Number(maxCommuteMatch[1]);
    if (Number.isFinite(parsed)) updates.maxCommuteMinutes = parsed;
  }

  const neighborhoods: string[] = [];
  if (/\bbrooklyn\b/.test(lower)) neighborhoods.push("Brooklyn");
  if (/\bastoria\b/.test(lower)) neighborhoods.push("Astoria");
  if (/\bbed[- ]stuy\b|\bbedstuy\b/.test(lower)) neighborhoods.push("Bed-Stuy");
  if (/\bsunnyside\b/.test(lower)) neighborhoods.push("Sunnyside");
  if (neighborhoods.length > 0) {
    updates.neighborhoods = Array.from(new Set([...(previousProfile.neighborhoods ?? []), ...neighborhoods]));
  }

  if (/\bneighborhood\b|\bcool area\b|\bcool neighborhood\b|\bgood neighborhood\b/.test(lower)) {
    updates.priorities = Array.from(new Set([...(updates.priorities ?? previousProfile.priorities ?? []), "neighborhood"]));
  }

  if (/\bnightlife\b|\bsocial\b/.test(lower)) {
    updates.priorities = Array.from(new Set([...(updates.priorities ?? previousProfile.priorities ?? []), "neighborhood"]));
    updates.niceToHaves = Array.from(new Set([...(previousProfile.niceToHaves ?? []), "nightlife", "social neighborhood"]));
  }

  if (/\bnatural light\b|\bsunlight\b/.test(lower)) {
    updates.mustHaves = Array.from(new Set([...(updates.mustHaves ?? previousProfile.mustHaves ?? []), "natural light"]));
  }

  if (/\btrain access\b|\bnear train\b|\bsubway access\b/.test(lower)) {
    updates.mustHaves = Array.from(new Set([...(updates.mustHaves ?? previousProfile.mustHaves ?? []), "train access"]));
  }

  if (/\bover\s+\$?1600\b/.test(lower)) {
    updates.dealbreakers = Array.from(new Set([...(previousProfile.dealbreakers ?? []), "over $1,600"]));
  }

  if (/\bprice\b|\bbudget\b/.test(lower) && /\bimportant\b|\bmatters\b|\bpriority\b/.test(lower)) {
    updates.priorities = Array.from(new Set([...(updates.priorities ?? previousProfile.priorities ?? []), "price"]));
  }

  if (/\bspace\b/.test(lower) && /\bimportant\b|\bmatters\b|\bpriority\b/.test(lower)) {
    updates.priorities = Array.from(new Set([...(updates.priorities ?? previousProfile.priorities ?? []), "space"]));
  }

  if (/\brecent grad\b|\brecent grads\b/.test(lower)) {
    updates.name = previousProfile.name === "Unknown" ? "Recent grad group" : previousProfile.name;
  }

  return updates;
}

function mergeDemoProfile(previousProfile: SearchProfileData, patch: DemoProfilePatch): SearchProfileData {
  return {
    ...previousProfile,
    ...patch,
    locations: patch.locations ?? previousProfile.locations,
    city: patch.city ?? previousProfile.city,
    mustHaves: patch.mustHaves ?? previousProfile.mustHaves,
    niceToHaves: patch.niceToHaves ?? previousProfile.niceToHaves,
    dealbreakers: patch.dealbreakers ?? previousProfile.dealbreakers,
    priorities: patch.priorities ?? previousProfile.priorities,
    updatedAt: new Date().toISOString(),
  };
}

function getNextQuestion(profile: SearchProfileData) {
  if (profile.locations.length === 0) return DEMO_QUESTIONS.location;
  if (profile.budgetMax == null && profile.budgetMin == null) return DEMO_QUESTIONS.budget;
  if (profile.bedroomsPreferred == null && profile.bedroomsFlexible.length === 0) return DEMO_QUESTIONS.bedrooms;
  if (!profile.moveInTimeframe) return DEMO_QUESTIONS.moveIn;
  if (profile.priorities.length === 0) return DEMO_QUESTIONS.priorities;
  return null;
}

function isCoreProfileReady(profile: SearchProfileData) {
  return Boolean(
    profile.intent &&
      profile.locations.length > 0 &&
      (profile.budgetMax != null || profile.budgetMin != null) &&
      (profile.bedroomsPreferred != null || profile.bedroomsFlexible.length > 0) &&
      profile.moveInTimeframe &&
      (profile.commuteTarget || profile.neighborhoods.length > 0),
  );
}

function buildAcknowledgement(previousProfile: SearchProfileData, nextProfile: SearchProfileData) {
  const fragments: string[] = [];

  if (JSON.stringify(previousProfile.locations) !== JSON.stringify(nextProfile.locations) && nextProfile.locations.length > 0) {
    fragments.push(`I’m centering this around ${nextProfile.locations.join(" / ")}`);
  }

  if (previousProfile.budgetMax !== nextProfile.budgetMax && nextProfile.budgetMax != null) {
    fragments.push(`I’m treating the cap as $${nextProfile.budgetMax.toLocaleString()}`);
  }

  if (previousProfile.bedroomsPreferred !== nextProfile.bedroomsPreferred && nextProfile.bedroomsPreferred != null) {
    fragments.push(nextProfile.bedroomsPreferred === 0 ? "I’m aiming at studios" : `I’m aiming at ${nextProfile.bedroomsPreferred} bedroom options`);
  }

  if (previousProfile.moveInTimeframe !== nextProfile.moveInTimeframe && nextProfile.moveInTimeframe) {
    fragments.push(`I’m planning around a ${nextProfile.moveInTimeframe} move`);
  }

  return fragments.join(". ");
}

export function isDemoModeEnabled() {
  return process.env.DEMO_MODE?.trim().toLowerCase() === "true";
}

export function matchesDirectDemoLaunchMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    (/recent grad|recent grads/.test(lower) &&
      /new york|nyc|new york city/.test(lower) &&
      (/august/.test(lower) || /midtown/.test(lower))) ||
    (/new york|nyc|new york city/.test(lower) &&
      /\b(house|home)\b/.test(lower) &&
      (/2 bedroom|2 bed|two bedroom|two bed/.test(lower)) &&
      (/<\s*\$?\s*5000|less than\s*\$?\s*5000|under\s*\$?\s*5000|max\s*\$?\s*5000|5000 max/.test(lower)) &&
      /\bjuly\b/.test(lower))
  );
}

export function getActiveDemoScenarioId(profile: SearchProfileData) {
  return matchDemoScenarioForProfile(profile)?.id ?? null;
}

export function runDemoChatTurn(input: DemoReplyInput) {
  const patch = extractDemoUpdates(input.previousProfile, input.message);
  const nextProfile = mergeDemoProfile(input.previousProfile, patch);
  const scenario = matchDemoScenarioForProfile(nextProfile);
  const browseRequest = parseListingBrowseRequest(input.message);
  const nextQuestion = getNextQuestion(nextProfile);
  const acknowledgement = buildAcknowledgement(input.previousProfile, nextProfile);

  if (scenario && browseRequest?.isMoreRequest) {
    return { nextProfile, reply: scenario.moreReply };
  }

  if (scenario && (browseRequest || matchesDirectDemoLaunchMessage(input.message))) {
    return { nextProfile, reply: scenario.listingsReply };
  }

  if (scenario && isCoreProfileReady(nextProfile)) {
    return { nextProfile, reply: scenario.stagedReply };
  }

  if (isCoreProfileReady(nextProfile) && browseRequest) {
    return {
      nextProfile,
      reply: "I’ve staged the curated demo batch for this search. Open the match deck and it should behave like the finished product from here.",
    };
  }

  if (isCoreProfileReady(nextProfile)) {
    return {
      nextProfile,
      reply: "That gives me enough to stage the demo board. Open the match deck whenever you want, or keep tweaking the brief in chat first.",
    };
  }

  if (acknowledgement && nextQuestion) {
    return {
      nextProfile,
      reply: `${acknowledgement}. ${nextQuestion}`,
    };
  }

  if (nextQuestion) {
    return {
      nextProfile,
      reply: nextQuestion,
    };
  }

  return {
    nextProfile,
    reply: "Tell me the area, budget, bedroom count, and move timing, and I’ll stage the demo listings around that brief.",
  };
}

export function getDemoComparisonCopy(profile: SearchProfileData) {
  const scenario = matchDemoScenarioForProfile(profile);
  return scenario?.comparisonReply ?? null;
}

export function getDemoScenarioListingIds(profile: SearchProfileData) {
  const scenario = matchDemoScenarioForProfile(profile);
  return scenario?.listingIds ?? [];
}
