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
  if (/\b(?:if|maybe|might|could|would|hypothetically|suppose|what if|not sure|unsure|i think|i guess|probably|kind of|sort of)\b/.test(normalized)) return true;
  if (/\b(?:my|our|the)\s+roommate\b|\b(?:he|she|they)\s+(?:wants?|needs?|prefers?|hates?|loves?|said)\b/.test(normalized)) return true;
  if (/\b(?!(?:i|we)\b)[a-z][a-z'-]+\s+(?:said|says|thinks|wants|needs|prefers)\b/.test(normalized)) return true;
  return false;
}

type EvidenceMatch = { evidence: string; index: number };

function isInsideQuotedSpan(content: string, index: number) {
  const quotePatterns = [/"[^"\n]*"/g, /“[^”\n]*”/g, /(?:^|\s)'[^'\n]+'(?:$|[\s.,!?])/g];
  return quotePatterns.some((pattern) => {
    for (const match of content.matchAll(pattern)) {
      const start = match.index ?? -1;
      if (start <= index && index < start + match[0].length) return true;
    }
    return false;
  });
}

function clausePrefix(content: string, index: number) {
  const before = content.slice(0, index);
  const boundaries = [before.lastIndexOf("."), before.lastIndexOf("?"), before.lastIndexOf("!"), before.lastIndexOf(";")];
  for (const marker of [", but ", " but ", ", however ", " however "]) {
    const markerIndex = before.lastIndexOf(marker);
    if (markerIndex >= 0) boundaries.push(markerIndex + marker.length - 1);
  }
  return before.slice(Math.max(-1, ...boundaries) + 1);
}

function clauseSuffix(content: string, index: number) {
  const after = content.slice(index);
  const boundary = after.search(/[.!?;]/);
  return boundary < 0 ? after : after.slice(0, boundary);
}

function mentionsAlias(content: string, aliases: string[]) {
  return aliases.some((alias) => new RegExp(`\\b${escaped(alias)}\\b`).test(content));
}

function laterCorrectionRetractsFeature(suffix: string, definition: FeatureDefinition) {
  const marker = suffix.search(/(?:^|[,\s])(?:but|however|though|actually)\b/);
  if (marker < 0) return false;
  const correction = suffix.slice(marker);
  const mentionsCurrentFeature = mentionsAlias(correction, definition.aliases);
  const mentionsOtherFeature = FEATURES.some((feature) =>
    feature.feature !== definition.feature && mentionsAlias(correction, feature.aliases));
  if (mentionsCurrentFeature) {
    const explicitFeatureSignal = /\b(?:i|we)\s+(?:do not|don't|no longer)\s+(?:need|want|care about)\b/.test(correction)
      || /\bis\s+no\s+longer\s+(?:a\s+)?(?:must[- ]have|requirement|non-negotiable)\b/.test(correction);
    if (explicitFeatureSignal) return false;
    return /\b(?:not|no longer|not anymore|changed my mind|take (?:it|that) back|retract(?:ed)?)\b/.test(correction);
  }
  if (mentionsOtherFeature) return false;
  return /\b(?:i|we)\s+(?:do not|don't)\s+(?:(?:need|want)\s+)?(?:(?:it|that)\s+)?anymore\b/.test(correction)
    || /\b(?:i|we)\s+(?:changed|change)\s+(?:my|our)\s+mind\b/.test(correction)
    || /\b(?:not anymore|no longer|take (?:it|that) back|retract(?:ed)?)\b/.test(correction);
}

function isCurrentAssertion(content: string, match: EvidenceMatch, definition: FeatureDefinition) {
  if (isInsideQuotedSpan(content, match.index)) return false;
  const prefix = clausePrefix(content, match.index);
  const suffix = clauseSuffix(content, match.index + match.evidence.length);
  if (/\b(?:used to|yesterday|back then|in the past)\b/.test(prefix)) return false;
  if (/\b(?:i|we)\s+(?:never\s+)?(?:said|thought|believed|felt|claimed)\b[^.!?;]*$/.test(prefix)) return false;
  if (/\b(?:not true that|no longer true that|stopped saying|take back)\b/.test(prefix)) return false;
  if (/\b(?:used to|yesterday|back then|in the past)\b/.test(suffix)) return false;
  if (laterCorrectionRetractsFeature(suffix, definition)) return false;
  return true;
}

function firstCurrentMatch(normalized: string, patterns: RegExp[], definition: FeatureDefinition) {
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))) {
      if (match[0] && typeof match.index === "number") {
        const evidence = { evidence: match[0], index: match.index };
        if (isCurrentAssertion(normalized, evidence, definition)) return evidence;
      }
    }
  }
  return null;
}

function signalForFeature(normalized: string, definition: FeatureDefinition): PreferenceSignal | null | "conflict" {
  let removal: EvidenceMatch | null = null;
  let strongNegative: EvidenceMatch | null = null;
  let mildNegative: EvidenceMatch | null = null;
  let strongPositive: EvidenceMatch | null = null;
  let mildPositive: EvidenceMatch | null = null;
  for (const alias of definition.aliases) {
    const target = escaped(alias);
    removal ??= firstCurrentMatch(normalized, [
      new RegExp(`\\bi\\s+(?:do not|don't)\\s+(?:need|want)\\s+(?:the\\s+)?${target}\\s+anymore\\b`),
      new RegExp(`\\bi\\s+no\\s+longer\\s+(?:need|want)\\s+(?:the\\s+)?${target}\\b`),
      new RegExp(`\\b(?:the\\s+)?${target}\\s+is\\s+no\\s+longer\\s+(?:a\\s+)?(?:must[- ]have|requirement|non-negotiable)\\s+(?:for|to)\\s+me\\b`),
      new RegExp(`\\bremove\\s+(?:the\\s+)?${target}\\s+from\\s+my\\s+must[- ]haves\\b`),
    ], definition);
    strongNegative ??= firstCurrentMatch(normalized, [
      new RegExp(`\\b(?:i\\s+(?:do not|don't)\\s+care|idgaf)\\s+(?:about\\s+)?(?:the\\s+)?${target}\\b`),
      new RegExp(`\\bi\\s+(?:hate|do not want|don't want)\\s+(?:the\\s+)?${target}\\b`),
    ], definition);
    mildNegative ??= firstCurrentMatch(normalized, [
      new RegExp(`\\b(?:the\\s+)?${target}\\s+(?:is\\s+)?(?:not important|a low priority|optional)\\s+(?:to|for)\\s+me\\b`),
      new RegExp(`\\bi\\s+consider\\s+(?:the\\s+)?${target}\\s+(?:optional|a low priority)\\b`),
    ], definition);
    strongPositive ??= firstCurrentMatch(normalized, [
      new RegExp(`\\b(?:i|we)\\s+(?:really\\s+)?(?:need|must have|love|care a lot about)\\s+(?:the\\s+)?${target}\\b`),
      new RegExp(`\\b(?:the\\s+)?${target}\\s+is\\s+(?:essential|non-negotiable|a must[- ]have|a high priority)\\s+(?:to|for)\\s+me\\b`),
    ], definition);
    mildPositive ??= firstCurrentMatch(normalized, [
      new RegExp(`\\bi\\s+(?:want|prefer|care about)\\s+(?:the\\s+)?${target}\\b`),
      new RegExp(`\\b(?:the\\s+)?${target}\\s+is\\s+(?:important|a priority)\\s+(?:to|for)\\s+me\\b`),
    ], definition);
  }
  const negative = removal ?? strongNegative ?? mildNegative;
  const positive = strongPositive ?? mildPositive;
  if (negative && positive) return "conflict";
  if (removal) return { feature: definition.feature, label: definition.label, weight: -2, evidence: removal.evidence, intent: "remove_must_have" };
  if (strongNegative) return { feature: definition.feature, label: definition.label, weight: -2, evidence: strongNegative.evidence, intent: "preference" };
  if (mildNegative) return { feature: definition.feature, label: definition.label, weight: -1, evidence: mildNegative.evidence, intent: "preference" };
  if (strongPositive) return { feature: definition.feature, label: definition.label, weight: 2, evidence: strongPositive.evidence, intent: "preference" };
  if (mildPositive) return { feature: definition.feature, label: definition.label, weight: 1, evidence: mildPositive.evidence, intent: "preference" };
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
