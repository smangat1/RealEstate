import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function userFacingSourceFiles(relativePath: string): string[] {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) return [];
  if (!statSync(absolutePath).isDirectory()) return [absolutePath];

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = join(absolutePath, entry.name);
    if (entry.isDirectory()) return userFacingSourceFiles(childPath);
    return [childPath];
  });
}

test("ASD-STE100 copy avoids em dashes in the website and app", () => {
  const extensions = new Set([".js", ".json", ".plist", ".swift", ".ts", ".tsx"]);
  const roots = [
    "app",
    "components",
    "lib",
    "ios/HomeboardNative/HomeboardNative/Sources",
    "ios/HomeboardNative/HomeboardMac",
    "ios/HomeboardNative/HomeboardSafariExtension",
    "ios/HomeboardNative/HomeboardShareExtension",
  ];
  const offenders = roots
    .flatMap(userFacingSourceFiles)
    .filter((path) => extensions.has(extname(path)))
    .filter((path) => readFileSync(path, "utf8").includes("—"))
    .map((path) => path.slice(root.length + 1));

  assert.deepEqual(offenders, []);
});

test("the public site has branded metadata and installable icons", () => {
  const layout = read("app/layout.tsx");
  const manifest = read("app/manifest.ts");

  assert.match(layout, /template: "%s · Homeboard"/);
  assert.match(layout, /openGraph:/);
  assert.match(layout, /twitter:/);
  assert.match(layout, /shared shortlist/);
  assert.match(manifest, /theme_color: "#3D504A"/);
  assert.ok(existsSync(resolve(root, "app/icon.svg")));
  assert.ok(existsSync(resolve(root, "app/favicon.ico")));
  assert.ok(existsSync(resolve(root, "app/apple-icon.png")));
});

test("information pages have a mobile menu, useful footer, and custom 404", () => {
  const shell = read("app/info-shell.tsx");
  const infoStyles = read("app/info.module.css");
  const notFound = read("app/not-found.tsx");

  assert.match(shell, /<details className=\{styles\.mobileMenu\}>/);
  assert.match(shell, /href="\/privacy"/);
  assert.match(shell, /href="\/contact"/);
  assert.match(shell, /© \{currentYear\} Homeboard/);
  assert.match(shell, /mailto:/);
  assert.match(infoStyles, /@media \(max-width: 640px\)[\s\S]*\.mobileMenu/);
  assert.match(notFound, /404 · Wrong address/);
  assert.match(notFound, /Return to Homeboard/);
});

test("mobile pages prevent sideways overflow and retain final-page legal links", () => {
  const globals = read("app/globals.css");
  const marketingStyles = read("app/marketing.module.css");

  assert.match(globals, /overflow-x: clip/);
  assert.match(globals, /img,[\s\S]*svg,[\s\S]*video[\s\S]*max-width: 100%/);
  assert.match(marketingStyles, /\.productLinks \{ margin-top: 10px; display: flex/);
  assert.doesNotMatch(marketingStyles, /\.productRoadmap,\s*\.productLinks \{ display: none/);
});

test("the heaviest visible marketing assets use compressed delivery files", () => {
  const page = read("app/page.tsx");
  const install = read("app/install-experience.tsx");
  const compressedMap = resolve(root, "public/images/homeboard-comparison-map-clean.webp");
  const webBackground = resolve(root, "public/images/homeboard-auth-bg.jpg");
  const nativeBackground = resolve(root, "ios/HomeboardNative/HomeboardNative/Resources/Assets.xcassets/HomeboardAuthBackground.imageset/background.jpg");

  assert.match(page, /homeboard-comparison-map-clean\.webp/);
  assert.match(install, /homeboard-comparison-map-clean\.webp/);
  assert.ok(statSync(compressedMap).size < 400_000);
  assert.ok(statSync(webBackground).size < 800_000);
  assert.ok(statSync(nativeBackground).size < 800_000);
});

test("the native app already ships a complete icon set", () => {
  const iconContents = read("ios/HomeboardNative/HomeboardNative/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json");
  for (const size of ["AppIcon-20.png", "AppIcon-60.png", "AppIcon-180.png", "AppIcon-1024.png"]) {
    assert.match(iconContents, new RegExp(size.replace(".", "\\.")));
    assert.ok(existsSync(resolve(root, `ios/HomeboardNative/HomeboardNative/Resources/Assets.xcassets/AppIcon.appiconset/${size}`)));
  }
});

test("the beta exposes a non-secret health check and invite-gates web registration", () => {
  const health = read("app/api/health/route.ts");
  const actions = read("app/actions.ts");
  const registration = read("app/register/page.tsx");

  assert.match(health, /SELECT 1/);
  assert.match(health, /configuration: requiredConfigurationReady/);
  assert.match(health, /"Cache-Control": "no-store"/);
  assert.doesNotMatch(health, /SUPABASE_SECRET_KEY|DATABASE_URL|process\.env/);
  assert.match(actions, /Homeboard beta accounts require an active board invite/);
  assert.match(actions, /getInvitationByCode\(inviteCode\)/);
  assert.match(registration, /Invitation-only beta/);
  assert.match(registration, /inviteData\.invitation\.status === "pending"/);
});

test("notification permission is offered after auth and not buried in workspace settings", () => {
  const workspace = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");
  const appModel = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
  const app = read("ios/HomeboardNative/HomeboardNative/Sources/HomeboardNativeApp.swift");
  const root = read("ios/HomeboardNative/HomeboardNative/Sources/RootView.swift");

  assert.match(workspace, /Share beta feedback/);
  assert.match(workspace, /ShareLink\(item: report\)/);
  assert.match(workspace, /It does not include your email, listing addresses, URLs, comments, or preferences/);
  assert.doesNotMatch(workspace, /title: "Notification permission"/);
  assert.match(appModel, /preparePostAuthenticationPrompts\(\)/);
  assert.match(appModel, /respondToPostAuthNotificationPrompt/);
  assert.match(app, /authorizationStatus == \.notDetermined/);
  assert.match(root, /Stay in sync with your board/);
  assert.match(root, /Turn on notifications/);
  assert.match(root, /when a roommate posts a new message/);
  assert.doesNotMatch(root, /new listings, roommate reactions, invitations/);
  assert.match(root, /if appModel\.showsPostAuthInvitePrompt/);
  assert.match(root, /PostAuthInvitePrompt\(\)/);
  assert.match(root, /value: appModel\.showsPostAuthInvitePrompt/);
});

test("edit search brief opens the complete personal preference editor", () => {
  const workspace = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");

  assert.match(workspace, /title: "Edit search brief"/);
  assert.match(workspace, /These changes only apply to your personal preferences/);
  assert.match(workspace, /presentation: \.personalPreferences/);
  assert.match(workspace, /SharedField\(title: "Ideal monthly share"/);
  assert.match(workspace, /SharedField\(\s*title: "Preferred neighborhoods"/);
  assert.match(workspace, /SharedField\(\s*title: "Must-haves"/);
  assert.match(workspace, /SharedField\(\s*title: "Hard limits"/);
  assert.doesNotMatch(workspace, /Each person controls those fields from their member card/);
});

test("release verification scans tracked secrets and attaches correlation IDs", () => {
  const packageJson = read("package.json");
  const secretCheck = read("scripts/check-tracked-secrets.ts");
  const proxy = read("proxy.ts");
  const workflow = read(".github/workflows/verify.yml");

  assert.match(packageJson, /"verify": "npm run secrets:check/);
  assert.match(secretCheck, /values intentionally hidden/);
  assert.match(secretCheck, /git", \["ls-files", "-z"\]/);
  assert.match(proxy, /crypto\.randomUUID\(\)/);
  assert.match(proxy, /x-homeboard-request-id/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /npm run prisma:validate/);
});
