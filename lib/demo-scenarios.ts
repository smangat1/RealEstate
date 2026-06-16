import "server-only";

import type { DemoScenario, SearchProfileData } from "@/lib/types";

export const demoScenarios: DemoScenario[] = [
  {
    id: "recent-grad-nyc-share",
    name: "Recent Grad NYC Share",
    trigger: {
      locations: ["New York", "Brooklyn", "Queens"],
      locationAliases: ["nyc", "new york city", "brooklyn", "queens", "midtown"],
      bedroomsPreferred: 3,
      budgetMaxAtMost: 1800,
      moveInContains: "August",
    },
    stagedReply:
      "Perfect. I’ve staged the recent-grad NYC board around three roommates moving in August, with Midtown commute pressure, Brooklyn neighborhood energy, and a strict budget guardrail all represented in one brief. Open the match deck and it should feel like a polished roommate-search demo instead of a generic chatbot.",
    listingsReply:
      "I’ve staged the recent-grad NYC batch now. The deck should read like a real group-search flow: commute-aware for Sam, neighborhood-aware for Maya, and budget-defensive for Jordan.",
    moreReply:
      "I’ve queued another polished pass through the recent-grad NYC batch, so asking for more should still feel intentional instead of random.",
    comparisonReply:
      "This board now reads like a real recent-grad search: one option is the commute-safe compromise, one is the lifestyle-forward Brooklyn pick, and one is the strict-budget fallback that keeps everyone honest.",
    listingIds: ["astoria-three-bed", "bed-stuy-sunlight-share", "sunnyside-budget-anchor"],
    scriptedProfiles: [
      {
        name: "Sam",
        role: "Midtown analyst",
        highlights: ["commute-focused", "budget $1,400-$1,700", "max commute 40 min"],
      },
      {
        name: "Maya",
        role: "social Brooklyn optimist",
        highlights: ["budget $1,500-$1,800", "cares about nightlife", "cares about natural light"],
      },
      {
        name: "Jordan",
        role: "strict budget guardrail",
        highlights: ["budget $1,250-$1,550", "needs train access", "dealbreaker over $1,600"],
      },
    ],
  },
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
        scenario.trigger.budgetMaxAtMost !== undefined && profile.budgetMax != null
          ? profile.budgetMax <= scenario.trigger.budgetMaxAtMost
          : scenario.trigger.budgetMaxAtMost === undefined;
      const moveInMatch = scenario.trigger.moveInContains
        ? (profile.moveInTimeframe ?? "").toLowerCase().includes(scenario.trigger.moveInContains.toLowerCase())
        : true;

      return locationMatch && propertyTypeMatch && bedroomMatch && budgetMatch && moveInMatch;
    }) ?? null
  );
}
