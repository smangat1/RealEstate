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
    id: "astoria-three-bed",
    title: "Astoria Three-Bed Share",
    sourceName: "demo_curated",
    sourceUrl: "https://example.com/demo-astoria-three-bed",
    city: "New York",
    state: "NY",
    neighborhood: "Astoria",
    address: "31-22 31st St, Astoria, NY",
    price: 1675,
    bedrooms: 3,
    bathrooms: 1,
    squareFeet: 1240,
    propertyType: "apartment",
    amenities: ["laundry", "dishwasher", "natural light", "near N/W train"],
    description:
      "A balanced Queens option for a three-person recent-grad share. Not the flashiest neighborhood in the set, but the Midtown commute is clean and the pricing stays inside the realistic group ceiling.",
    images: [],
    scenarioIds: ["recent-grad-nyc-share"],
    demoFitLabel: "best practical fit",
    demoFitReason:
      "This is the most balanced group option because it protects the Midtown commute, stays under the realistic cap, and still feels social enough to not kill the roommate vibe.",
    demoTradeoffSummary:
      "Astoria is not Maya’s purest Brooklyn fantasy, but it avoids crushing Jordan on budget and keeps Sam’s workweek sustainable. That makes it the strongest practical compromise.",
    demoCommuteMinutes: 27,
    demoCommuteMiles: 6.1,
    demoCommuteLabel: "Midtown",
  },
  {
    id: "bed-stuy-sunlight-share",
    title: "Bed-Stuy Sunlight Share",
    sourceName: "demo_curated",
    sourceUrl: "https://example.com/demo-bed-stuy-share",
    city: "New York",
    state: "NY",
    neighborhood: "Bed-Stuy",
    address: "442 Tompkins Ave, Brooklyn, NY",
    price: 1780,
    bedrooms: 3,
    bathrooms: 1,
    squareFeet: 1180,
    propertyType: "apartment",
    amenities: ["natural light", "dishwasher", "near A/C train"],
    description:
      "The lifestyle-forward Brooklyn pick. Better neighborhood energy and sunlight, but it pushes the budget harder and asks the group to tolerate a little more commute strain.",
    images: [],
    scenarioIds: ["recent-grad-nyc-share"],
    demoFitLabel: "worth a look",
    demoFitReason:
      "This is the best neighborhood-energy option, especially if Maya’s lifestyle goals keep winning the room. The main catch is that Jordan will feel the budget pressure immediately.",
    demoTradeoffSummary:
      "If nightlife and Brooklyn character matter enough to justify some extra rent and commute pain, this becomes the emotional favorite. If not, it is the first listing that starts to feel expensive for the group.",
    demoCommuteMinutes: 39,
    demoCommuteMiles: 8.4,
    demoCommuteLabel: "Midtown",
  },
  {
    id: "sunnyside-budget-anchor",
    title: "Sunnyside Budget Anchor",
    sourceName: "demo_curated",
    sourceUrl: "https://example.com/demo-sunnyside-budget",
    city: "New York",
    state: "NY",
    neighborhood: "Sunnyside",
    address: "47-18 Skillman Ave, Sunnyside, NY",
    price: 1540,
    bedrooms: 3,
    bathrooms: 1,
    squareFeet: 1010,
    propertyType: "apartment",
    amenities: ["laundry", "near 7 train"],
    description:
      "The strict-budget option in the set. It is not the coolest listing, but it protects Jordan’s ceiling and still keeps reasonable train access for the whole group.",
    images: [],
    scenarioIds: ["recent-grad-nyc-share"],
    demoFitLabel: "stretch option",
    demoFitReason:
      "This is the safest budget read and the easiest one to defend to the most price-sensitive roommate, but it clearly gives up some neighborhood excitement and natural-light upside.",
    demoTradeoffSummary:
      "If the group decides cost discipline is the thing that keeps the search alive, this becomes important fast. If lifestyle and excitement win, it will feel a little too conservative.",
    demoCommuteMinutes: 33,
    demoCommuteMiles: 5.5,
    demoCommuteLabel: "Midtown",
  },
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
