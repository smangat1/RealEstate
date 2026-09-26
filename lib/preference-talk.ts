export type PreferenceSignal = {
  feature: string;
  weight: -2 | -1 | 1 | 2;
  label: string;
};

const FEATURES: Array<{ feature: string; label: string; aliases: string[] }> = [
  { feature: "gym", label: "gym", aliases: ["gym", "fitness center", "fitness room"] },
  { feature: "laundry", label: "laundry", aliases: ["laundry", "washer dryer", "washer/dryer"] },
  { feature: "elevator", label: "elevator", aliases: ["elevator", "lift"] },
  { feature: "doorman", label: "doorman", aliases: ["doorman", "concierge"] },
  { feature: "outdoor_space", label: "outdoor space", aliases: ["outdoor space", "balcony", "roof deck", "yard"] },
  { feature: "dishwasher", label: "dishwasher", aliases: ["dishwasher"] },
  { feature: "natural_light", label: "natural light", aliases: ["natural light", "sunlight", "bright apartment"] },
  { feature: "parking", label: "parking", aliases: ["parking", "garage"] },
  { feature: "commute", label: "commute", aliases: ["commute", "train access", "subway access", "transit"] },
  { feature: "neighborhood", label: "neighborhood", aliases: ["neighborhood", "area", "location"] },
  { feature: "space", label: "space", aliases: ["space", "big room", "large room", "square footage"] },
  { feature: "privacy", label: "privacy", aliases: ["privacy", "private room"] },
  { feature: "price", label: "price", aliases: ["price", "rent", "budget", "cheap", "affordable"] },
];

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parsePreferenceTalk(content: string): PreferenceSignal[] {
  const normalized = content.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  const result: PreferenceSignal[] = [];
  for (const feature of FEATURES) {
    const alias = feature.aliases.find((candidate) => normalized.includes(candidate));
    if (!alias) continue;
    const target = escaped(alias);
    const strongNegative = new RegExp(`(?:idgaf|i do not care|i don't care|dont care|couldn't care less|could not care less|doesn't matter|does not matter)(?:\\s+(?:about|for))?\\s+(?:the\\s+)?${target}`).test(normalized)
      || new RegExp(`(?:hate|do not want|don't want|dont want|no need for|skip)(?:\\s+(?:the\\s+)?)?${target}`).test(normalized);
    const mildNegative = new RegExp(`(?:not important|low priority|optional|nice but not necessary)(?:\\s+(?:to me|for me))?(?:\\s*[:,;-]?\\s*)(?:the\\s+)?${target}`).test(normalized)
      || new RegExp(`${target}(?:\\s+is)?\\s+(?:not important|low priority|optional)`).test(normalized);
    const strongPositive = new RegExp(`(?:really want|really need|must have|need|love|care a lot about|high priority)(?:\\s+(?:the\\s+)?)?${target}`).test(normalized)
      || new RegExp(`${target}(?:\\s+is)?\\s+(?:a must|essential|non-negotiable|(?:a\\s+)?high priority)`).test(normalized);
    const mildPositive = new RegExp(`(?:want|prefer|care about|would like)(?:\\s+(?:the\\s+)?)?${target}`).test(normalized)
      || new RegExp(`${target}(?:\\s+is)?\\s+(?:important|a priority)`).test(normalized);
    const weight = strongNegative ? -2 : mildNegative ? -1 : strongPositive ? 2 : mildPositive ? 1 : null;
    if (weight !== null) result.push({ feature: feature.feature, label: feature.label, weight });
  }
  return result;
}
