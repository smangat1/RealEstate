import "server-only";

import type { SearchProfileData } from "@/lib/types";

export type DemoScenario = {
  id: string;
  name: string;
  trigger: {
    locations: string[];
    locationAliases?: string[];
    propertyType?: SearchProfileData["propertyType"];
    bedroomsPreferred?: number;
    budgetMaxAtMost?: number;
    moveInContains?: string;
  };
  stagedReply: string;
  listingsReply: string;
  moreReply: string;
  comparisonReply: string;
  listingIds: string[];
};

export const demoScenarios: DemoScenario[] = [
  {
    id: "nyc-group-houses",
    name: "NYC Group Houses",
    trigger: {
      locations: ["New York", "Brooklyn", "Queens"],
      locationAliases: ["nyc", "new york city", "nyc area", "new york area", "brooklyn", "queens"],
      propertyType: "house",
      bedroomsPreferred: 2,
      budgetMaxAtMost: 5000,
      moveInContains: "July",
    },
    stagedReply:
      "Okay, based on your group’s commute, here are the best options that still keep you in the strongest neighborhoods for this budget. I’ve staged the New York demo batch now, so open the match deck and you should see the curated listings right away.",
    listingsReply:
      "I’ve staged the New York demo batch for this exact brief, so the deck should now feel like the finished product: commute-aware, neighborhood-aware, and already narrowed to the best starting options.",
    moreReply:
      "I queued another pass through the New York demo batch. It should feel like the product is giving you the next strongest set rather than randomly reshuffling the same cards.",
    comparisonReply:
      "You’ve given me enough to make the board feel finished for this demo. The shortlist and compare view should now read like a real roommate decision tool instead of a raw list of properties.",
    listingIds: ["park-slope-townhouse-floor", "lic-commute-winner", "shorecrest-towers"],
  },
];

export function getDemoScenarioById(id: string) {
  return demoScenarios.find((scenario) => scenario.id === id) ?? null;
}

export function matchDemoScenarioForProfile(profile: SearchProfileData) {
  return (
    demoScenarios.find((scenario) => {
      const normalizedProfileLocations = profile.locations.map((location) => location.toLowerCase());
      const locationTerms = [
        ...scenario.trigger.locations.map((location) => location.toLowerCase()),
        ...(scenario.trigger.locationAliases ?? []).map((location) => location.toLowerCase()),
      ];
      const locationMatch = locationTerms.some((location) =>
        normalizedProfileLocations.some(
          (profileLocation) =>
            profileLocation === location || profileLocation.includes(location) || location.includes(profileLocation),
        ),
      );
      const propertyTypeMatch = scenario.trigger.propertyType ? profile.propertyType === scenario.trigger.propertyType : true;
      const bedroomMatch =
        scenario.trigger.bedroomsPreferred !== undefined ? profile.bedroomsPreferred === scenario.trigger.bedroomsPreferred : true;
      const budgetMatch =
        scenario.trigger.budgetMaxAtMost !== undefined && profile.budgetMax !== null
          ? profile.budgetMax <= scenario.trigger.budgetMaxAtMost
          : scenario.trigger.budgetMaxAtMost === undefined;
      const moveInMatch = scenario.trigger.moveInContains
        ? (profile.moveInTimeframe ?? "").toLowerCase().includes(scenario.trigger.moveInContains.toLowerCase())
        : true;

      return locationMatch && propertyTypeMatch && bedroomMatch && budgetMatch && moveInMatch;
    }) ?? null
  );
}
