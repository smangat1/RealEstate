import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const healthRoute = source("app/api/health/route.ts");
const api = source("ios/HomeboardNative/HomeboardNative/Sources/HomeboardAPI.swift");
const config = source("ios/HomeboardNative/HomeboardNative/Sources/HomeboardConfig.swift");
const settings = source("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");
const previewScheme = source(
  "ios/HomeboardNative/HomeboardNative.xcodeproj/xcshareddata/xcschemes/Homeboard Advisor Preview.xcscheme",
);

test("health advertises Advisor PATCH only when its persistence schema is available", () => {
  assert.match(healthRoute, /to_regclass\('\"AdvisorMessagePayload\"'\)/);
  assert.match(healthRoute, /to_regclass\('\"AdvisorMemberFinancialProfile\"'\)/);
  assert.match(healthRoute, /column_name = 'proactiveCheckedAt'/);
  assert.match(healthRoute, /column_name = 'proactiveLeaseUntil'/);
  assert.match(healthRoute, /value\.enumlabel = 'reported_sent'/);
  assert.match(healthRoute, /value\.enumlabel = 'negotiation_comp'/);
  assert.match(healthRoute, /advisorDraftAcceptance: advisorDraftPersistenceReady/);
  assert.match(
    healthRoute,
    /boardMessages: advisorDraftPersistenceReady \? \["POST", "PATCH"\] : \["POST"\]/,
  );
});

test("iOS checks the deployed capability before attempting an Advisor draft write", () => {
  const accept = api.match(/func acceptAdvisorDraft[\s\S]*?\n  }\n\n  func fetchAdvisorFinancialStatus/)?.[0] ?? "";
  assert.match(accept, /let health = try await fetchHealth\(\)/);
  assert.match(accept, /AdvisorBackendCompatibility\.advisorDraftAcceptanceIssue\(health\)/);
  assert.match(accept, /throw HomeboardAPIError\.backendMismatch/);
  assert.match(accept, /method: "PATCH"/);
  assert.ok(
    accept.indexOf("advisorDraftAcceptanceIssue") < accept.indexOf('method: "PATCH"'),
    "compatibility must be checked before PATCH",
  );
});

test("the shared preview scheme targets the matching stack without changing production defaults", () => {
  const previewOrigin =
    "https://real-estate-git-codex-adviso-92a5ad-samyanmangat-6662s-projects.vercel.app";
  assert.ok(previewScheme.includes(previewOrigin));
  assert.match(previewScheme, /HOMEBOARD_BUILD_CHANNEL[\s\S]*advisor-stack-preview/);
  assert.match(config, /productionBackendBaseURL/);
  assert.match(config, /backendConfigurationSource/);
  assert.match(settings, /API origin:/);
  assert.match(settings, /Origin source:/);
  assert.match(settings, /Advisor draft PATCH:/);
});
