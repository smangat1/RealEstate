import type { GroupProfile, RentalProfile } from "@/lib/types";

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function numeric(values: Array<number | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function frequency(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function generateGroupProfile(profiles: RentalProfile[]): GroupProfile {
  if (profiles.length === 0) {
    return {
      groupBudgetMax: null,
      budgetRangeText: "No budget signal yet",
      budgetOverlapStatus: "weak",
      commuteDestinations: [],
      commuteAlignment: "split",
      preferredNeighborhoods: [],
      neighborhoodAlignment: "split",
      mustHaves: [],
      dealbreakers: [],
      topSharedPriorities: [],
      compromiseAreas: [],
      tensionFlags: [],
      confidenceLabel: "low",
      confidenceReason: "No profiles have been collected yet.",
      summary: "No profiles have been collected yet, so there is no real group brief to summarize.",
    };
  }

  const cities = unique(profiles.map((profile) => profile.city ?? profile.locations[0] ?? ""));
  const moveDates = unique(profiles.map((profile) => profile.moveInDate ?? profile.moveInTimeframe ?? ""));
  const budgetMins = numeric(profiles.map((profile) => profile.budgetMin));
  const budgetMaxes = numeric(profiles.map((profile) => profile.budgetMax));
  const neighborhoods = unique(profiles.flatMap((profile) => profile.neighborhoods));
  const mustHaves = unique(profiles.flatMap((profile) => profile.mustHaves));
  const dealbreakers = unique(profiles.flatMap((profile) => profile.dealbreakers));
  const priorities = unique(profiles.flatMap((profile) => profile.priorities));
  const commuteDestinations = unique(profiles.map((profile) => profile.commuteTarget ?? ""));

  const neighborhoodCounts = frequency(profiles.flatMap((profile) => profile.neighborhoods));
  const compromiseAreas = [...neighborhoodCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1])
    .map(([neighborhood]) => neighborhood)
    .slice(0, 4);

  const tensionFlags: string[] = [];

  if (cities.length > 1) {
    tensionFlags.push(`City preference is split across ${cities.join(", ")}.`);
  }

  if (moveDates.length > 1) {
    tensionFlags.push(`Move timing is not perfectly aligned yet: ${moveDates.join(", ")}.`);
  }

  if (budgetMaxes.length > 1 && Math.max(...budgetMaxes) - Math.min(...budgetMaxes) > 300) {
    tensionFlags.push("Budget ceilings are spread out enough that fairness will matter.");
  }

  if (commuteDestinations.length > 1) {
    tensionFlags.push("There are multiple commute anchors, so the final area will need to be a compromise.");
  }

  const sharedCity = cities.length === 1 ? cities[0] : undefined;
  const sharedMoveDate = moveDates.length === 1 ? moveDates[0] : undefined;
  const budgetFloor = budgetMins.length > 0 ? Math.min(...budgetMins) : budgetMaxes.length > 0 ? Math.min(...budgetMaxes) : null;
  const budgetCeiling = budgetMaxes.length > 0 ? Math.max(...budgetMaxes) : budgetFloor;
  const budgetSpread =
    budgetMaxes.length > 1 ? Math.max(...budgetMaxes) - Math.min(...budgetMaxes) : 0;
  const budgetOverlapStatus: GroupProfile["budgetOverlapStatus"] =
    budgetMaxes.length <= 1 ? "strong" : budgetSpread <= 250 ? "strong" : budgetSpread <= 600 ? "mixed" : "weak";
  const commuteAlignment: GroupProfile["commuteAlignment"] =
    commuteDestinations.length <= 1 ? "aligned" : commuteDestinations.length === 2 ? "mixed" : "split";
  const neighborhoodAlignment: GroupProfile["neighborhoodAlignment"] =
    compromiseAreas.length >= 2 ? "aligned" : neighborhoods.length <= 1 ? "aligned" : compromiseAreas.length === 1 ? "mixed" : "split";
  const budgetLine =
    budgetFloor !== null && budgetCeiling !== null
      ? `roughly $${budgetFloor.toLocaleString()} to $${budgetCeiling.toLocaleString()}`
      : "still loose";
  const confidencePenalty =
    (cities.length > 1 ? 1 : 0) +
    (moveDates.length > 1 ? 1 : 0) +
    (budgetOverlapStatus === "weak" ? 2 : budgetOverlapStatus === "mixed" ? 1 : 0) +
    (commuteAlignment === "split" ? 2 : commuteAlignment === "mixed" ? 1 : 0) +
    (neighborhoodAlignment === "split" ? 1 : 0);
  const confidenceLabel: GroupProfile["confidenceLabel"] =
    confidencePenalty <= 1 ? "high" : confidencePenalty <= 3 ? "medium" : "low";
  const confidenceReason =
    confidenceLabel === "high"
      ? "The group is aligned enough that shared matching should be reasonably trustworthy."
      : confidenceLabel === "medium"
        ? "The group brief is usable, but there are still tradeoffs that could change which listings feel best."
        : "The group brief is still provisional because the members are pulling in noticeably different directions.";

  return {
    groupBudgetMax: budgetMaxes.length > 0 ? Math.min(...budgetMaxes) : null,
    budgetRangeText: budgetLine,
    budgetOverlapStatus,
    commuteDestinations,
    commuteAlignment,
    preferredNeighborhoods: neighborhoods,
    neighborhoodAlignment,
    mustHaves,
    dealbreakers,
    topSharedPriorities: priorities.slice(0, 5),
    compromiseAreas,
    tensionFlags,
    confidenceLabel,
    confidenceReason,
    summary: `This group is ${sharedCity ? `centered on ${sharedCity}` : "still settling on a city"}, ${
      sharedMoveDate ? `moving around ${sharedMoveDate}` : "still aligning on move timing"
    }, and currently budgeting ${budgetLine}. ${confidenceReason}`,
  };
}
