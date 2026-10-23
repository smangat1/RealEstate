import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import test from "node:test";
import { inflateSync } from "node:zlib";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function decodeRGBPNG(path: string) {
  const png = readFileSync(resolve(root, path));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let width = 0;
  let height = 0;
  const imageData: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, `${path} must use 8-bit color`);
      assert.equal(data[9], 2, `${path} must be RGB with no alpha channel`);
      assert.equal(data[12], 0, `${path} must not be interlaced`);
    } else if (type === "IDAT") {
      imageData.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a: number, b: number, c: number) => {
    const estimate = a + b - c;
    const aDistance = Math.abs(estimate - a);
    const bDistance = Math.abs(estimate - b);
    const cDistance = Math.abs(estimate - c);
    return aDistance <= bDistance && aDistance <= cDistance ? a : bDistance <= cDistance ? b : c;
  };

  for (let y = 0; y < height; y += 1) {
    const filter = filtered[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[y * (stride + 1) + x + 1];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : filter === 4 ? paeth(left, above, upperLeft)
                : Number.NaN;
      assert.ok(Number.isFinite(predictor), `${path} uses unsupported PNG filter ${filter}`);
      pixels[y * stride + x] = (raw + predictor) & 0xff;
    }
  }

  return { width, height, pixels };
}

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

test("the iOS icon is opaque, square, full bleed, and centered at every catalog size", () => {
  const iconRoot = "ios/HomeboardNative/HomeboardNative/Resources/Assets.xcassets/AppIcon.appiconset";
  const sizes = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

  for (const size of sizes) {
    const icon = decodeRGBPNG(`${iconRoot}/AppIcon-${size}.png`);
    assert.equal(icon.width, size);
    assert.equal(icon.height, size);
    const pixel = (x: number, y: number) => [...icon.pixels.subarray((y * size + x) * 3, (y * size + x + 1) * 3)];
    const background = pixel(0, 0);
    for (let position = 0; position < size; position += 1) {
      assert.deepEqual(pixel(position, 0), background, `top edge must bleed at ${size}px`);
      assert.deepEqual(pixel(position, size - 1), background, `bottom edge must bleed at ${size}px`);
      assert.deepEqual(pixel(0, position), background, `left edge must bleed at ${size}px`);
      assert.deepEqual(pixel(size - 1, position), background, `right edge must bleed at ${size}px`);
    }
  }

  const master = decodeRGBPNG(`${iconRoot}/AppIcon-1024.png`);
  const background = master.pixels.subarray(0, 3);
  let minimumX = master.width;
  let minimumY = master.height;
  let maximumX = -1;
  let maximumY = -1;
  for (let y = 0; y < master.height; y += 1) {
    for (let x = 0; x < master.width; x += 1) {
      const offset = (y * master.width + x) * 3;
      if (master.pixels[offset] !== background[0]
        || master.pixels[offset + 1] !== background[1]
        || master.pixels[offset + 2] !== background[2]) {
        minimumX = Math.min(minimumX, x);
        minimumY = Math.min(minimumY, y);
        maximumX = Math.max(maximumX, x);
        maximumY = Math.max(maximumY, y);
      }
    }
  }
  assert.deepEqual(
    { minimumX, minimumY, maximumX, maximumY },
    { minimumX: 151, minimumY: 144, maximumX: 872, maximumY: 879 },
  );
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

test("the privacy policy page uses support@joinhomeboard.com and explains Advisor status", () => {
  const privacy = read("app/privacy/page.tsx");

  assert.match(privacy, /support@joinhomeboard\.com/);
  assert.match(privacy, /process\.env\.NEXT_PUBLIC_SUPPORT_EMAIL/);
  assert.doesNotMatch(privacy, /homeboard\.support@gmail\.com/);
  assert.match(privacy, /<h2>Homeboard Advisor<\/h2>/);
  assert.match(
    privacy,
    /The Homeboard Advisor is not available in this version of the[\s\S]+?will be released in a later update\./,
  );
  assert.match(
    privacy,
    /No advisor features[\s\S]+?collect or process any data today\./,
  );
});

test("support and community rules publish contact and moderation guidance", () => {
  const support = read("app/support/page.tsx");
  const terms = read("app/terms/page.tsx");
  const shell = read("app/info-shell.tsx");
  const workspace = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");

  for (const source of [support, terms]) {
    assert.match(source, /process\.env\.NEXT_PUBLIC_SUPPORT_EMAIL/);
    assert.match(source, /support@joinhomeboard\.com/);
    assert.match(source, /mailto:\$\{supportEmail\}/);
  }
  assert.match(support, /long-press the message/);
  assert.match(support, /Report message/);
  assert.match(support, /review reports[\s\S]*within 24 hours/);
  assert.match(support, /Delete account and[\s\S]*data/);
  assert.match(terms, /harassment/);
  assert.match(terms, /hate/);
  assert.match(terms, /explicit sexual content/);
  assert.match(terms, /threats/);
  assert.match(terms, /spam/);
  assert.match(terms, /illegal content/);
  assert.match(terms, /Last updated: 22 October 2026/);
  assert.match(shell, /href="\/terms"/);
  assert.match(shell, /href="\/support"/);
  assert.match(workspace, /title: "Contact support"/);
  assert.match(workspace, /mailto:support@joinhomeboard\.com/);
  assert.match(workspace, /title: "Community rules"/);
  assert.match(workspace, /HomeboardConfig\.backendBaseURL\.appending\(path: "terms"\)/);
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

  assert.doesNotMatch(page, /homeboard-comparison-map-(?:clean|cropped)/);
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

test("Release app and extensions use the public production origin without unused local access", () => {
  const project = read("ios/HomeboardNative/project.yml");
  const info = read("ios/HomeboardNative/HomeboardNative/Info.plist");

  for (const [target, nextTarget] of [
    ["HomeboardShareExtension", "HomeboardActionExtension"],
    ["HomeboardActionExtension", "HomeboardSafariExtension"],
    ["HomeboardSafariExtension", "HomeboardMac"],
  ]) {
    const start = project.indexOf(`  ${target}:`);
    const end = project.indexOf(`  ${nextTarget}:`, start);
    const block = project.slice(start, end);
    assert.match(block, /Release:[\s\S]*HOMEBOARD_API_BASE_URL: "https:\/\/joinhomeboard\.com"/);
  }

  assert.match(info, /ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
  assert.match(info, /NSCameraUsageDescription/);
  assert.doesNotMatch(info, /NSLocalNetworkUsageDescription|NSAllowsLocalNetworking/);
  assert.doesNotMatch(info, /NSExceptionDomains|localhost|127\.0\.0\.1/);
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

  assert.match(workspace, /Saw a bug\?/);
  assert.match(workspace, /Send bug report/);
  assert.match(workspace, /It does not send your email, listing addresses, page contents, comments, preferences, or access tokens/);
  assert.doesNotMatch(workspace, /ShareLink\(item: report\)/);
  assert.doesNotMatch(workspace, /title: "Notification permission"/);
  assert.match(appModel, /preparePostAuthenticationPrompts\(\)/);
  assert.match(appModel, /respondToPostAuthNotificationPrompt/);
  assert.match(app, /authorizationStatus == \.notDetermined/);
  assert.match(root, /Stay in sync with your board/);
  assert.match(root, /Turn on notifications/);
  assert.match(root, /one daily Advisor digest/);
  assert.doesNotMatch(root, /new listings, roommate reactions, invitations/);
  assert.match(root, /if appModel\.showsPostAuthInvitePrompt/);
  assert.match(root, /PostAuthInvitePrompt\(\)/);
  assert.match(root, /value: appModel\.showsPostAuthInvitePrompt/);
});

test("edit search brief reuses onboarding with the current selections", () => {
  const workspace = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");
  const onboarding = read("ios/HomeboardNative/HomeboardNative/Sources/AccountOnboardingView.swift");
  const appModel = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");

  assert.match(workspace, /title: "Edit search brief"/);
  assert.match(workspace, /appModel\.prepareSearchBriefEditing\(\)/);
  assert.match(workspace, /OnboardingView\(\s*purpose: \.editSearchBrief/);
  assert.doesNotMatch(workspace, /SharedBriefEditorSheet/);
  assert.match(onboarding, /case editSearchBrief/);
  assert.match(onboarding, /Your current choice is already selected/);
  assert.match(onboarding, /if isSingleOptionSelected\(option\)/);
  assert.match(onboarding, /return "Save changes"/);
  assert.match(appModel, /func prepareSearchBriefEditing\(\)/);
  assert.match(appModel, /func saveSearchBriefEdits\(\) async -> Bool/);
});

test("settings consolidates tutorials and keeps bug reports out of beta sharing", () => {
  const workspace = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");

  assert.match(workspace, /title: "Help & tutorials"/);
  assert.match(workspace, /Save a listing/);
  assert.match(workspace, /Pages at a glance/);
  assert.match(workspace, /Replay page guides/);
  assert.match(workspace, /SharedBugReportSheet/);
  assert.doesNotMatch(workspace, /SharedBetaFeedbackSheet|showsBetaFeedback|Share beta feedback/);
  assert.doesNotMatch(workspace, /title: "Sharing from Safari"/);
  assert.doesNotMatch(workspace, /title: "Replay page guides"/);
  assert.doesNotMatch(workspace, /title: "Add an offline listing"/);
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
