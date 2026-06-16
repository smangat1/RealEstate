export type NeighborhoodSignal = {
  tags: string[];
  summary: string;
};

const NEIGHBORHOOD_SIGNALS: Record<string, NeighborhoodSignal> = {
  "los angeles:silver lake": {
    tags: ["nightlife", "cafes", "creative"],
    summary: "Silver Lake tends to attract people who want cafes, nightlife, and a more creative neighborhood feel.",
  },
  "los angeles:culver city": {
    tags: ["commute-friendly", "walkable pockets", "balanced"],
    summary: "Culver City usually reads as a balanced option with stronger westside job access and more practical everyday convenience.",
  },
  "los angeles:echo park": {
    tags: ["nightlife", "energy", "central"],
    summary: "Echo Park is usually valued for energy, food, and central access more than calm or pure square footage.",
  },
  "los angeles:koreatown": {
    tags: ["value", "dense", "late-night"],
    summary: "Koreatown often wins on relative value and late-night city energy, but it can trade away quiet and parking ease.",
  },
  "san diego:north park": {
    tags: ["nightlife", "restaurants", "walkable"],
    summary: "North Park is typically a lifestyle neighborhood with restaurants, bars, and a more walkable local scene.",
  },
  "san diego:mission valley": {
    tags: ["commute-friendly", "central", "practical"],
    summary: "Mission Valley tends to be more practical than charming, with stronger central access and easier car-based movement.",
  },
  "phoenix:downtown": {
    tags: ["urban", "events", "central"],
    summary: "Downtown Phoenix usually stands out for a more urban feel, events, and central access rather than quiet residential character.",
  },
  "phoenix:arcadia": {
    tags: ["lifestyle", "restaurants", "desirable"],
    summary: "Arcadia is often seen as a lifestyle-driven area with strong restaurant access and broad appeal, though usually not the cheapest option.",
  },
  "jersey city:downtown": {
    tags: ["commute-friendly", "dense", "popular"],
    summary: "Downtown Jersey City is usually a strong practical option for Manhattan access, but you often pay for that convenience.",
  },
  "jersey city:journal square": {
    tags: ["value", "transit", "upside"],
    summary: "Journal Square often reads as a better-value transit play, especially for people who care more about access than polish.",
  },
  "jersey city:the heights": {
    tags: ["space", "residential", "value"],
    summary: "The Heights is often more attractive for space and neighborhood feel than for being the absolute fastest commute.",
  },
  "hoboken:uptown": {
    tags: ["residential", "polished", "lifestyle"],
    summary: "Uptown Hoboken tends to feel more polished and residential, usually at a higher price point.",
  },
  "hoboken:waterfront": {
    tags: ["views", "premium", "commute-friendly"],
    summary: "The Hoboken waterfront is usually treated as a premium convenience-and-views option rather than a value play.",
  },
  "denver:rino": {
    tags: ["nightlife", "creative", "trendy"],
    summary: "RiNo tends to be chosen for nightlife and trendier energy more than quiet or straightforward value.",
  },
  "denver:cherry creek": {
    tags: ["polished", "upscale", "amenities"],
    summary: "Cherry Creek usually signals polished amenities and an upscale feel, often with a higher rent tradeoff.",
  },
};

export function getNeighborhoodSignal(city: string | null, neighborhood: string | null): NeighborhoodSignal | null {
  if (!city || !neighborhood) return null;
  const key = `${city.trim().toLowerCase()}:${neighborhood.trim().toLowerCase()}`;
  return NEIGHBORHOOD_SIGNALS[key] ?? null;
}
