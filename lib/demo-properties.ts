export type DemoPropertyInput = {
  id: string;
  title: string;
  sourceName?: string;
  sourceUrl?: string;
  city: string;
  state: string;
  neighborhood: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  propertyType: "apartment" | "house" | "condo";
  amenities: string[];
  description: string;
  images: string[];
  scenarioIds?: string[];
  demoFitLabel?: "best practical fit" | "worth a look" | "stretch option" | "risky but interesting";
  demoFitReason?: string;
  demoTradeoffSummary?: string;
  demoCommuteMinutes?: number;
  demoCommuteMiles?: number;
  demoCommuteLabel?: string;
};

/*
  Demo property workflow:

  1. Add or edit listings in this file.
  2. If you want local photos, drop image files into:
     /public/demo-properties/
  3. In `images`, you can use either:
     - a local filename like "west-village-brownstone-1.jpg"
     - a local absolute web path like "/demo-properties/west-village-brownstone-1.jpg"
     - a remote image URL like "https://..."
*/

export const demoProperties: DemoPropertyInput[] = [
  {
    id: "shorecrest-towers",
    title: "Shorecrest Towers",
    sourceName: "Zillow",
    sourceUrl: "https://www.zillow.com/apartments/brooklyn-ny/shorecrest-towers/53WW/",
    city: "New York",
    state: "NY",
    neighborhood: "Coney Island",
    address: "3000 Ocean Pkwy, Brooklyn, NY 11235",
    price: 3890,
    bedrooms: 2,
    bathrooms: 2,
    squareFeet: 1130,
    propertyType: "apartment",
    amenities: ["laundry", "air conditioning", "clubhouse", "pet friendly"],
    description:
      "Introducing the new Shorecrest Towers at Trump Village in the heart of Brighton Beach. A reinvention of a South Brooklyn icon, this classic brick, two-building complex offers no fee, no security deposit studio-to-three-bedroom apartments with Atlantic Ocean views. Just two blocks from the beach and close to the B/Q trains. Parking $300. Gym $35 per resident.",
    images: [],
    scenarioIds: ["nyc-group-houses"],
    demoFitLabel: "stretch option",
    demoFitReason:
      "This one keeps the budget in range and gives you a lot of usable space, but it trades away some of the neighborhood energy your group said it cares about most.",
    demoTradeoffSummary:
      "It feels more like a practical stretch than a personality fit. I would keep it in the conversation if price discipline matters more than being in the strongest neighborhood.",
    demoCommuteMinutes: 44,
    demoCommuteMiles: 12.3,
    demoCommuteLabel: "group office compromise",
  },
  {
    id: "park-slope-townhouse-floor",
    title: "Park Slope Townhouse Floor",
    sourceName: "demo_curated",
    sourceUrl: "https://example.com/demo-park-slope-townhouse",
    city: "New York",
    state: "NY",
    neighborhood: "Park Slope",
    address: "88 Garfield Pl, Brooklyn, NY",
    price: 4725,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 1040,
    propertyType: "house",
    amenities: ["laundry", "dishwasher", "storage"],
    description:
      "A softer neighborhood-driven option that should still feel plausible for a July move. Good for testing whether the board talks about compromise between commute convenience and neighborhood quality.",
    images: [],
    scenarioIds: ["nyc-group-houses"],
    demoFitLabel: "best practical fit",
    demoFitReason:
      "This one lands as the cleanest practical compromise because it stays under the budget ceiling, gives you a real 2 bedroom layout, and still keeps the group in a neighborhood people actually get excited about.",
    demoTradeoffSummary:
      "It may not have the easiest commute of the set, but it balances livability, neighborhood quality, and a believable monthly number better than the riskier options.",
    demoCommuteMinutes: 31,
    demoCommuteMiles: 7.1,
    demoCommuteLabel: "group office compromise",
  },
  {
    id: "lic-commute-winner",
    title: "Long Island City Commute Winner",
    sourceName: "demo_curated",
    sourceUrl: "https://example.com/demo-lic-commute-winner",
    city: "New York",
    state: "NY",
    neighborhood: "Long Island City",
    address: "27-14 Jackson Ave, Queens, NY",
    price: 4590,
    bedrooms: 2,
    bathrooms: 2,
    squareFeet: 990,
    propertyType: "apartment",
    amenities: ["laundry", "gym", "elevator", "doorman"],
    description:
      "A cleaner practical option for a group that cares about commute reliability first and neighborhood energy second.",
    images: [],
    scenarioIds: ["nyc-group-houses"],
    demoFitLabel: "worth a look",
    demoFitReason:
      "This is the commute-forward option in the set. It is less charming than the Brooklyn house options, but it makes the daily routine easier and still stays inside budget.",
    demoTradeoffSummary:
      "If the board decides commute pain is the thing most likely to wear people down, this becomes much more compelling than it looks on pure lifestyle vibe.",
    demoCommuteMinutes: 22,
    demoCommuteMiles: 4.8,
    demoCommuteLabel: "group office compromise",
  },
];

export function getDemoPropertyById(id: string) {
  return demoProperties.find((property) => property.id === id) ?? null;
}

export function getDemoPropertiesForScenario(scenarioId: string) {
  return demoProperties.filter((property) => property.scenarioIds?.includes(scenarioId));
}
