import "server-only";

import { matchDemoScenarioForProfile } from "@/lib/demo-scenarios";
import type { SearchProfileData } from "@/lib/types";

export function isDemoModeEnabled() {
  return process.env.DEMO_MODE?.trim().toLowerCase() === "true";
}

export function getDemoComparisonCopy(profile: SearchProfileData) {
  return matchDemoScenarioForProfile(profile)?.comparisonReply ?? null;
}

export function getDemoScenarioListingIds(profile: SearchProfileData) {
  return matchDemoScenarioForProfile(profile)?.listingIds ?? [];
}
