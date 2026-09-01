import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("web and server failures are connected to privacy-safe Sentry monitoring", () => {
  const packageJson = read("package.json");
  const instrumentation = read("instrumentation.ts");
  const client = read("instrumentation-client.ts");
  const server = read("sentry.server.config.ts");
  const privacy = read("lib/sentry-privacy.ts");
  const monitoring = read("lib/monitoring.ts");
  const globalError = read("app/global-error.tsx");
  const healthWorkflow = read(".github/workflows/production-health.yml");

  assert.match(packageJson, /"@sentry\/nextjs"/);
  assert.match(instrumentation, /Sentry\.captureRequestError/);
  assert.match(client, /sendDefaultPii: false/);
  assert.match(client, /beforeSend: scrubSentryEvent/);
  assert.match(privacy, /delete event\.request\.data/);
  assert.match(privacy, /\/invite\/\[redacted\]/);
  assert.match(server, /sendDefaultPii: false/);
  assert.match(monitoring, /HOMEBOARD_ALERT_WEBHOOK_URL/);
  assert.match(monitoring, /x-homeboard-request-id|homeboard\.request_id/);
  assert.match(globalError, /Sentry\.captureException\(error\)/);
  assert.match(healthWorkflow, /cron: "\*\/10 \* \* \* \*"/);
  assert.match(healthWorkflow, /\/api\/health/);
});

test("native crash and hang diagnostics are retained until authenticated upload", () => {
  const nativeApp = read("ios/HomeboardNative/HomeboardNative/Sources/HomeboardNativeApp.swift");
  const appModel = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
  const api = read("ios/HomeboardNative/HomeboardNative/Sources/HomeboardAPI.swift");
  const route = read("app/api/mobile/diagnostics/route.ts");

  assert.match(nativeApp, /import MetricKit/);
  assert.match(nativeApp, /MXMetricManager\.shared\.add\(self\)/);
  assert.match(nativeApp, /didReceive\(_ payloads: \[MXDiagnosticPayload\]\)/);
  assert.match(nativeApp, /PendingNativeDiagnostics\.append/);
  assert.match(appModel, /uploadPendingNativeDiagnostics/);
  assert.match(api, /\/api\/mobile\/diagnostics/);
  assert.match(route, /scope\.addAttachment/);
  assert.match(route, /metrickit_diagnostic/);
  assert.doesNotMatch(route, /email|boardId|listing|comment|preference/);
});

test("push delivery is limited to human board chat and excludes the sender", () => {
  const apns = read("lib/apns.ts");
  const apnsToken = read("lib/apns-token.ts");
  const messages = read("app/api/mobile/boards/[id]/messages/route.ts");
  const updates = read("app/api/mobile/boards/[id]/updates/route.ts");
  const reactions = read("app/api/mobile/boards/[id]/listings/[listingId]/reactions/route.ts");
  const listings = read("app/api/mobile/boards/[id]/listings/route.ts");
  const rootView = read("ios/HomeboardNative/HomeboardNative/Sources/RootView.swift");
  const nativeApp = read("ios/HomeboardNative/HomeboardNative/Sources/HomeboardNativeApp.swift");

  assert.match(apns, /api\.push\.apple\.com/);
  assert.match(apns, /api\.sandbox\.push\.apple\.com/);
  assert.match(apnsToken, /ES256/);
  assert.match(apns, /filter\(\(userId\) => userId !== input\.authorUserId\)/);
  assert.match(apns, /type: "board_chat"/);
  assert.match(messages, /notifyBoardChat/);
  assert.match(updates, /parsed\.data\.action === "update"[\s\S]*notifyBoardChat/);
  assert.doesNotMatch(reactions, /notifyBoardChat/);
  assert.doesNotMatch(listings, /notifyBoardChat/);
  assert.match(rootView, /when a roommate posts a new message/);
  assert.doesNotMatch(rootView, /new listings, roommate reactions, invitations/);
  assert.match(nativeApp, /homeboardOpenBoardChat/);
  assert.match(nativeApp, /willPresent notification/);
});
