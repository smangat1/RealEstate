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
      commuteDestinations: [],
      preferredNeighborhoods: [],
      mustHaves: [],
      dealbreakers: [],
      topSharedPriorities: [],
      compromiseAreas: [],
      tensionFlags: [],
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
  const budgetLine =
    budgetMins.length > 0 || budgetMaxes.length > 0
      ? `roughly $${Math.min(...(budgetMins.length > 0 ? budgetMins : budgetMaxes)).toLocaleString()} to $${Math.max(...budgetMaxes).toLocaleString()}`
      : "still loose";

  return {
    groupBudgetMax: budgetMaxes.length > 0 ? Math.min(...budgetMaxes) : null,
    commuteDestinations,
    preferredNeighborhoods: neighborhoods,
    mustHaves,
    dealbreakers,
    topSharedPriorities: priorities.slice(0, 5),
    compromiseAreas,
    tensionFlags,
    summary: `This group is ${sharedCity ? `centered on ${sharedCity}` : "still settling on a city"}, ${
      sharedMoveDate ? `moving around ${sharedMoveDate}` : "still aligning on move timing"
    }, and currently budgeting ${budgetLine}.`,
  };
}
