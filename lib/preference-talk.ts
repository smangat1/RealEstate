export const PREFERENCE_FEATURES = [
  "gym", "laundry", "elevator", "doorman", "outdoor_space", "dishwasher",
  "natural_light", "parking", "commute", "neighborhood", "space", "privacy", "price",
] as const;

export type PreferenceFeature = (typeof PREFERENCE_FEATURES)[number];
export type PreferenceSignalIntent = "preference" | "remove_must_have";

export type PreferenceSignal = {
  feature: PreferenceFeature;
  weight: -2 | -1 | 1 | 2;
  label: string;
  evidence: string;
  intent: PreferenceSignalIntent;
};

type FeatureDefinition = { feature: PreferenceFeature; label: string; aliases: string[] };

const FEATURES: FeatureDefinition[] = [
  { feature: "gym", label: "gym", aliases: ["gym", "fitness center", "fitness room"] },
  { feature: "laundry", label: "laundry", aliases: ["laundry", "washer dryer", "washer/dryer", "in-unit laundry"] },
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
  { feature: "price", label: "price", aliases: ["price", "rent", "budget", "affordable"] },
];

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedText(value: string) {
  return value.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * There is deliberately no numeric confidence threshold. A proposal is eligible
 * only when its exact text passes deterministic evidence gates and contains an
 * explicit, current, first-person statement. On-device output that cannot meet
 * the same gate is discarded instead of receiving an invented confidence score.
 */
export function preferenceTextHasConservativeBlocker(content: string) {
  const normalized = normalizedText(content);
  if (!normalized) return true;
  if (/["“”`]/.test(content)) return true;
  if (/\b(?:if|maybe|might|could|would|hypothetically|suppose|what if|not sure|unsure|i think|i guess|probably|kind of|sort of)\b/.test(normalized)) return true;
  if (/(?:^|\s)'[^']+'(?:$|[\s.,!?])/.test(content)) return true;
  if (/\b(?:my|our|the)\s+roommate\b|\b(?:he|she|they)\s+(?:wants?|needs?|prefers?|hates?|loves?|said)\b/.test(normalized)) return true;
  if (/\b(?!i\b)[a-z][a-z'-]+\s+(?:said|says|thinks|wants|needs|prefers)\b/.test(normalized)) return true;
  if (/\b(?:we|us|our group)\s+(?:want|need|prefer|care|hate|love)\b/.test(normalized)) return true;
  return false;
}

function firstMatch(normalized: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}

function signalForFeature(normalized: string, definition: FeatureDefinition): PreferenceSignal | null | "conflict" {
  let removal: string | null = null;
  let strongNegative: string | null = null;
  let mildNegative: string | null = null;
  let strongPositive: string | null = null;
  let mildPositive: string | null = null;
  for (const alias of definition.aliases) {
    const target = escaped(alias);
    removal ??= firstMatch(normalized, [
      new RegExp(`\\bi\\s+(?:do not|don't)\\s+(?:need|want)\\s+(?:the\\s+)?${target}\\s+anymore\\b`),
      new RegExp(`\\bi\\s+no\\s+longer\\s+(?:need|want)\\s+(?:the\\s+)?${target}\\b`),
      new RegExp(`\\b(?:the\\s+)?${target}\\s+is\\s+no\\s+longer\\s+(?:a\\s+)?(?:must[- ]have|requirement|non-negotiable)\\s+(?:for|to)\\s+me\\b`),
      new RegExp(`\\bremove\\s+(?:the\\s+)?${target}\\s+from\\s+my\\s+must[- ]haves\\b`),
    ]);
    strongNegative ??= firstMatch(normalized, [
      new RegExp(`\\b(?:i\\s+(?:do not|don't)\\s+care|idgaf)\\s+(?:about\\s+)?(?:the\\s+)?${target}\\b`),
      new RegExp(`\\bi\\s+(?:hate|do not want|don't want)\\s+(?:the\\s+)?${target}\\b`),
    ]);
    mildNegative ??= firstMatch(normalized, [
      new RegExp(`\\b(?:the\\s+)?${target}\\s+(?:is\\s+)?(?:not important|a low priority|optional)\\s+(?:to|for)\\s+me\\b`),
      new RegExp(`\\bi\\s+consider\\s+(?:the\\s+)?${target}\\s+(?:optional|a low priority)\\b`),
    ]);
    strongPositive ??= firstMatch(normalized, [
      new RegExp(`\\bi\\s+(?:really\\s+)?(?:need|must have|love|care a lot about)\\s+(?:the\\s+)?${target}\\b`),
      new RegExp(`\\b(?:the\\s+)?${target}\\s+is\\s+(?:essential|non-negotiable|a must[- ]have|a high priority)\\s+(?:to|for)\\s+me\\b`),
    ]);
    mildPositive ??= firstMatch(normalized, [
      new RegExp(`\\bi\\s+(?:want|prefer|care about)\\s+(?:the\\s+)?${target}\\b`),
      new RegExp(`\\b(?:the\\s+)?${target}\\s+is\\s+(?:important|a priority)\\s+(?:to|for)\\s+me\\b`),
    ]);
  }
  const negative = removal ?? strongNegative ?? mildNegative;
  const positive = strongPositive ?? mildPositive;
  if (negative && positive) return "conflict";
  if (removal) return { feature: definition.feature, label: definition.label, weight: -2, evidence: removal, intent: "remove_must_have" };
  if (strongNegative) return { feature: definition.feature, label: definition.label, weight: -2, evidence: strongNegative, intent: "preference" };
  if (mildNegative) return { feature: definition.feature, label: definition.label, weight: -1, evidence: mildNegative, intent: "preference" };
  if (strongPositive) return { feature: definition.feature, label: definition.label, weight: 2, evidence: strongPositive, intent: "preference" };
  if (mildPositive) return { feature: definition.feature, label: definition.label, weight: 1, evidence: mildPositive, intent: "preference" };
  return null;
}

export function parsePreferenceTalk(content: string): PreferenceSignal[] {
  if (preferenceTextHasConservativeBlocker(content)) return [];
  const normalized = normalizedText(content);
  const result: PreferenceSignal[] = [];
  for (const definition of FEATURES) {
    const signal = signalForFeature(normalized, definition);
    if (signal === "conflict") return [];
    if (signal) result.push(signal);
  }
  return result.slice(0, 4);
}

export function preferenceFeatureMatchesStoredValue(value: string, feature: PreferenceFeature) {
  const definition = FEATURES.find((entry) => entry.feature === feature);
  if (!definition) return false;
  const normalized = normalizedText(value).replace(/[^a-z0-9/ -]/g, "");
  return definition.aliases.some((alias) => {
    const candidate = normalizedText(alias);
    return normalized === candidate || new RegExp(`\\b${escaped(candidate)}\\b`).test(normalized);
  });
}
