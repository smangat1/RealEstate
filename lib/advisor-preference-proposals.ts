import type { PreferenceSignal } from "@/lib/preference-talk";

export type PreferenceProposalValue = string | number | string[] | null;

export type PreferenceProposalChange = {
  field: string;
  label: string;
  oldValue: PreferenceProposalValue;
  newValue: PreferenceProposalValue;
};

export type PreferenceProposalProfile = {
  commutePriority: string;
  neighborhoodPriority: string;
  spacePriority: string;
  privacyPriority: string;
  mustHaves: string | null;
  preferenceSignals: unknown;
};

export function preferenceProposalResolution(input: {
  status: "pending" | "accepted" | "rejected" | "expired";
  action: "accept" | "reject";
  baseVersion: number;
  currentVersion: number;
}): "accepted" | "rejected" | "stale" | "resolved" {
  if (input.status !== "pending") return "resolved";
  if (input.action === "reject") return "rejected";
  return input.baseVersion === input.currentVersion ? "accepted" : "stale";
}

const PRIORITY_FIELDS: Record<string, { field: string; label: string }> = {
  commute: { field: "commutePriority", label: "Commute priority" },
  neighborhood: { field: "neighborhoodPriority", label: "Neighborhood priority" },
  space: { field: "spacePriority", label: "Space priority" },
  privacy: { field: "privacyPriority", label: "Privacy priority" },
};

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseStoredStringList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function matchesFeature(value: string, signal: PreferenceSignal) {
  const normalized = value.toLowerCase();
  return normalized.includes(signal.label) || signal.label.includes(normalized);
}

export function buildPreferenceProposal(
  profile: PreferenceProposalProfile,
  signals: PreferenceSignal[],
): PreferenceProposalChange[] {
  const changes: PreferenceProposalChange[] = [];
  const existingSignals = jsonObject(profile.preferenceSignals);

  for (const signal of signals) {
    const currentWeight = typeof existingSignals[signal.feature] === "number"
      ? existingSignals[signal.feature] as number
      : null;
    if (currentWeight !== signal.weight) {
      changes.push({
        field: `preferenceSignals.${signal.feature}`,
        label: `${signal.label} preference`,
        oldValue: currentWeight,
        newValue: signal.weight,
      });
    }

    const priority = PRIORITY_FIELDS[signal.feature];
    if (priority) {
      const nextValue = signal.weight > 0 ? "high" : "low";
      const oldValue = profile[priority.field as keyof PreferenceProposalProfile];
      if (typeof oldValue === "string" && oldValue !== nextValue) {
        changes.push({ field: priority.field, label: priority.label, oldValue, newValue: nextValue });
      }
    }
  }

  const mustHaves = parseStoredStringList(profile.mustHaves);
  const negativeSignals = signals.filter((signal) => signal.weight < 0);
  const nextMustHaves = mustHaves.filter((value) =>
    !negativeSignals.some((signal) => matchesFeature(value, signal)),
  );
  if (nextMustHaves.length !== mustHaves.length) {
    changes.push({
      field: "mustHaves",
      label: "Must-haves",
      oldValue: mustHaves,
      newValue: nextMustHaves,
    });
  }

  return changes;
}

export function preferenceUpdateFromChanges(
  profile: PreferenceProposalProfile,
  changes: PreferenceProposalChange[],
) {
  const update: Record<string, unknown> = {};
  const nextSignals = { ...jsonObject(profile.preferenceSignals) };

  for (const change of changes) {
    if (change.field.startsWith("preferenceSignals.")) {
      const feature = change.field.slice("preferenceSignals.".length);
      if (feature && typeof change.newValue === "number") nextSignals[feature] = change.newValue;
      continue;
    }
    if (change.field === "mustHaves" && Array.isArray(change.newValue)) {
      update.mustHaves = JSON.stringify(change.newValue);
      continue;
    }
    if (
      ["commutePriority", "neighborhoodPriority", "spacePriority", "privacyPriority"].includes(change.field)
      && typeof change.newValue === "string"
      && ["low", "medium", "high"].includes(change.newValue)
    ) {
      update[change.field] = change.newValue;
    }
  }
  if (changes.some((change) => change.field.startsWith("preferenceSignals."))) {
    update.preferenceSignals = nextSignals;
  }
  return update;
}
