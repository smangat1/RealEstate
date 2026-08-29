import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function nativeSource(filename: string) {
  return readFileSync(
    resolve(
      process.cwd(),
      "ios/HomeboardNative/HomeboardNative/Sources",
      filename,
    ),
    "utf8",
  );
}

const apiSource = nativeSource("HomeboardAPI.swift");
const appModelSource = nativeSource("AppModel.swift");
const authViewSource = nativeSource("AccountOnboardingView.swift");
const appleAuthViewSource = nativeSource("AppleAuthView.swift");
const welcomeSource = nativeSource("WelcomeView.swift");
const rootSource = nativeSource("RootView.swift");
const appleSignInSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Shared/HomeboardAppleSignIn.swift",
  ),
  "utf8",
);
const entitlements = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/HomeboardNative.entitlements",
  ),
  "utf8",
);
const debugEntitlements = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/HomeboardNativeDebug.entitlements",
  ),
  "utf8",
);
const macEntitlements = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardMac/HomeboardMac.entitlements",
  ),
  "utf8",
);
const macDebugEntitlements = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardMac/HomeboardMacDebug.entitlements",
  ),
  "utf8",
);
const macAuthSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardMac/HomeboardMacApp.swift",
  ),
  "utf8",
);
const extensionSyncSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative/Shared/HomeboardExtensionSync.swift",
  ),
  "utf8",
);
const workspaceSource = nativeSource("SharedWorkspaceView.swift");
const accountRouteSource = readFileSync(
  resolve(process.cwd(), "app/api/mobile/account/route.ts"),
  "utf8",
);
const nativeProjectSource = readFileSync(
  resolve(
    process.cwd(),
    "ios/HomeboardNative/HomeboardNative.xcodeproj/project.pbxproj",
  ),
  "utf8",
);
const nativeProjectDefinition = readFileSync(
  resolve(process.cwd(), "ios/HomeboardNative/project.yml"),
  "utf8",
);
const boardDataSource = readFileSync(
  resolve(process.cwd(), "lib/board-data.ts"),
  "utf8",
);
test("native signup distinguishes email confirmation from a failed account", () => {
  assert.match(apiSource, /enum NativeSignUpOutcome/);
  assert.match(apiSource, /case confirmationRequired\(email: String\)/);
  assert.match(apiSource, /var resolvedUser: SupabaseUserPayload\?/);
  assert.match(apiSource, /guard let id else \{ return nil \}/);
  assert.match(apiSource, /if response\.resolvedUser != nil/);
  assert.match(apiSource, /path: "\/auth\/v1\/resend"/);

  assert.match(appModelSource, /case \.confirmationRequired\(let confirmationEmail\)/);
  assert.match(appModelSource, /pendingConfirmationEmail = confirmationEmail/);
  assert.match(appModelSource, /authMode = \.signIn/);
  assert.match(appModelSource, /Account created\. Confirm the email/);
  assert.match(authViewSource, /Resend confirmation email/);
});

test("a valid Supabase session survives a temporarily unavailable backend", () => {
  const authFlow = appModelSource.slice(
    appModelSource.indexOf("func submitAuth"),
    appModelSource.indexOf("func continueAfterAuthentication"),
  );

  assert.match(
    authFlow,
    /authSession = session[\s\S]*NativeAuthSessionStore\.save\(session\)[\s\S]*api\.fetchSession/,
  );
  assert.match(appModelSource, /func retryAuthenticatedSession\(\) async/);
  assert.match(appModelSource, /You are signed in, but Homeboard's data service is offline/);
  assert.match(authViewSource, /Label\("Retry connection", systemImage: "arrow\.clockwise"\)/);
});

test("device sign-in uses the stable HTTPS backend and bounded network waits", () => {
  const productionOrigin = /https:\/\/real-estate-samyanmangat-6662s-projects\.vercel\.app/;
  assert.match(nativeProjectSource, productionOrigin);
  assert.match(nativeProjectDefinition, productionOrigin);
  assert.doesNotMatch(nativeProjectSource, /Samyans-Laptop|192\.168\.1\.203/);
  assert.doesNotMatch(nativeProjectDefinition, /Samyans-Laptop|192\.168\.1\.203/);
  assert.match(apiSource, /timeoutInterval: 8/);
  assert.match(apiSource, /request\.timeoutInterval = 12/);
});

test("board loading avoids read-time maintenance writes and shows cached data immediately", () => {
  const boardRead = boardDataSource.slice(
    boardDataSource.indexOf("export async function getBoardPageData"),
    boardDataSource.indexOf("export async function createBoardAndReturnId"),
  );
  assert.match(boardRead, /prisma\.searchBoard\.findFirst/);
  assert.match(boardRead, /members: \{ some: \{ userId: viewerUserId \} \}/);
  assert.match(boardRead, /expiresAt: \{ gt: new Date\(\) \}/);
  assert.doesNotMatch(boardRead, /ensureOwnerMembership|expireStaleBoardInvitations|ensureBoard\(/);

  const continueFlow = appModelSource.slice(
    appModelSource.indexOf("func continueAfterAuthenticationWithoutInvite"),
    appModelSource.indexOf("func requestPasswordReset"),
  );
  assert.match(continueFlow, /let cachedBoard = localBoardsById\[firstBoard\.id\]/);
  assert.match(continueFlow, /isBoardLoading = cachedBoard == nil/);
  assert.match(continueFlow, /Task \{[\s\S]*try await loadBoard\(id: firstBoard\.id\)/);
});

test("launch intro overlaps bootstrap and hands off immediately to a restored board", () => {
  const bootstrapFlow = appModelSource.slice(
    appModelSource.indexOf("func bootstrap"),
    appModelSource.indexOf("func openAuth"),
  );

  assert.match(
    bootstrapFlow,
    /let canShowRestoredBoard = currentScreen == \.board && board\.id != nil/,
  );
  assert.match(bootstrapFlow, /isBootstrapping = !canShowRestoredBoard/);
  assert.match(bootstrapFlow, /isRestoredBoardRefreshing = canShowRestoredBoard/);
  assert.match(bootstrapFlow, /isRestoredBoardRefreshing = false/);
  assert.match(
    workspaceSource,
    /if appModel\.isListingInventoryLoading \|\| appModel\.isRestoredBoardRefreshing/,
  );
  assert.match(rootSource, /\.task \{[\s\S]*await appModel\.bootstrap\(\)[\s\S]*\.task \{/);
  assert.match(rootSource, /Task\.sleep\(for: \.seconds\(1\.45\)\)/);
});

test("the post-auth board chooser is compact, immediate, and does not reset tab navigation", () => {
  assert.match(appleAuthViewSource, /if appModel\.showsPostAuthInvitePrompt/);
  assert.doesNotMatch(appleAuthViewSource, /\.sheet\(isPresented: postAuthInviteBinding\)/);
  assert.match(authViewSource, /\.frame\(maxWidth: 360\)/);
  assert.match(authViewSource, /continueAfterAuthenticationWithoutInvite\(\)/);
  assert.match(appModelSource, /func continueAfterAuthenticationWithoutInvite\(\)/);

  const boardRefresh = appModelSource.slice(
    appModelSource.indexOf("func refreshCurrentBoard()"),
    appModelSource.indexOf("func loadListingInventory"),
  );
  assert.doesNotMatch(boardRefresh, /boardTab = \.board/);

  const boardLoad = appModelSource.slice(
    appModelSource.indexOf("private func loadBoard"),
    appModelSource.indexOf("private func applySessionResponse"),
  );
  assert.doesNotMatch(boardLoad, /boardTab = \.board/);
});

test("every native build configuration uses Apple-only account entry", () => {
  assert.match(rootSource, /case \.auth:[\s\S]*AppleAuthView\(\)/);
  assert.match(appleAuthViewSource, /SignInWithAppleButton\(\.continue\)/);
  assert.match(appleAuthViewSource, /HomeboardAppleSignIn\.prepare\(request\)/);
  assert.match(appleAuthViewSource, /appModel\.submitAppleAuth/);
  assert.match(appleSignInSource, /request\.nonce = hashed\(nonce\)/);
  assert.match(appleSignInSource, /SecRandomCopyBytes/);
  assert.match(apiSource, /grant_type=id_token/);
  assert.match(apiSource, /var provider = "apple"/);
  assert.match(appModelSource, /func submitAppleAuth/);
  assert.match(entitlements, /com\.apple\.developer\.applesignin/);
  assert.match(welcomeSource, /Continue with Apple/);
  assert.doesNotMatch(appleAuthViewSource, /developmentLogin|DEVELOPMENT ACCOUNT|Personal Team/);
  assert.doesNotMatch(appleAuthViewSource, /SecureField\("Password"/);
  assert.match(appleAuthViewSource, /SignInWithAppleButton[\s\S]*\.frame\(height: 50\)/);
  assert.doesNotMatch(appModelSource, /func submitDevelopmentAuth/);
  assert.match(debugEntitlements, /com\.apple\.developer\.applesignin/);
  assert.match(debugEntitlements, /<key>aps-environment<\/key>[\s\S]*<string>development<\/string>/);
  assert.match(entitlements, /<key>aps-environment<\/key>[\s\S]*<string>production<\/string>/);
  assert.match(macEntitlements, /com\.apple\.developer\.applesignin/);
  assert.match(macDebugEntitlements, /com\.apple\.developer\.applesignin/);
  assert.match(
    nativeProjectDefinition,
    /Debug:[\s\S]*CODE_SIGN_ENTITLEMENTS: HomeboardMac\/HomeboardMacDebug\.entitlements[\s\S]*PRODUCT_BUNDLE_IDENTIFIER: com\.homeboard\.native\.mac\.dev/,
  );
  assert.match(macAuthSource, /SignInWithAppleButton\(\.continue\)/);
  assert.doesNotMatch(macAuthSource, /SecureField|Enter your Homeboard email and password/);
  assert.match(extensionSyncSource, /static func signInWithApple/);
  assert.match(extensionSyncSource, /grant_type", value: "id_token"/);
});

test("native account deletion has no reusable development-account bypass", () => {
  assert.match(appModelSource, /func deleteAccount/);
  assert.match(workspaceSource, /"Delete account permanently"/);
  assert.match(accountRouteSource, /supabaseAdmin\.auth\.admin\.deleteUser/);
  assert.doesNotMatch(appModelSource, /isDevelopmentAccount|wipeDevelopmentAccount|demoaccount/);
  assert.doesNotMatch(workspaceSource, /Wipe account|demoaccount/);
  assert.doesNotMatch(accountRouteSource, /mode === "wipe"|demoaccount|wiped: true/);
});

test("entry uses solid fixed cards that track reversible vertical swipes", () => {
  assert.doesNotMatch(welcomeSource, /TabView\(selection: \$selectedPage\)/);
  assert.match(welcomeSource, /selectedPage == 0/);
  assert.match(welcomeSource, /DragGesture\(minimumDistance: 8, coordinateSpace: \.global\)/);
  assert.match(welcomeSource, /-value\.translation\.height/);
  assert.match(welcomeSource, /verticalTravel >= 68/);
  assert.match(welcomeSource, /verticalTravel > horizontalTravel \* 1\.15/);
  assert.match(welcomeSource, /welcomeDragOffset = min\(0, value\.translation\.height\)/);
  assert.match(welcomeSource, /geometry\.size\.height \+ welcomeDragOffset/);
  assert.match(welcomeSource, /private var welcomeReturnGesture/);
  assert.match(welcomeSource, /welcomeDragOffset = max\(0, value\.translation\.height\)/);
  assert.match(welcomeSource, /selectedPage = 0/);
  assert.match(welcomeSource, /@GestureState private var welcomeGestureActive/);
  assert.match(welcomeSource, /onChange\(of: welcomeGestureActive\)/);
  assert.match(welcomeSource, /interactiveSpring\(response: 0\.38, dampingFraction: 0\.88/);
  assert.doesNotMatch(welcomeSource, /Vignette|vignette/);
  assert.doesNotMatch(welcomeSource, /swipeProgress/);
  assert.match(welcomeSource, /\.ignoresSafeArea\(\.container, edges: \.bottom\)/);
  assert.match(welcomeSource, /\.ignoresSafeArea\(\.keyboard, edges: \.bottom\)/);
  assert.match(welcomeSource, /let bottomMargin = max\(geometry\.safeAreaInsets\.bottom \+ 18, 54\)/);
  assert.match(welcomeSource, /y: topMargin \+ \(height \/ 2\)/);
  assert.doesNotMatch(welcomeSource, /forwardProgress|returnProgress/);
  assert.doesNotMatch(welcomeSource, /\.opacity\(selectedPage/);
  assert.match(welcomeSource, /Swipe up to continue/);
  assert.match(welcomeSource, /Image\(systemName: "arrow\.up"\)/);
  assert.match(welcomeSource, /Text\("SWIPE DOWN"\)/);
  assert.match(welcomeSource, /Image\(systemName: "arrow\.down"\)/);
});

test("onboarding accepts solo renters and captures routable commute access", () => {
  assert.match(authViewSource, /case \.city:[\s\S]*citySearchAnswer/);
  assert.match(authViewSource, /Start typing a city or metro/);
  assert.match(authViewSource, /Optional autocomplete from Apple Maps/);
  assert.match(authViewSource, /addressSearch\.updateCity\(query: value\)/);
  assert.match(authViewSource, /resolvedSearchArea\(for suggestion:/);
  assert.match(authViewSource, /case \.city:\s*return \[\]/);
  assert.doesNotMatch(
    authViewSource,
    /return \["New York City", "Jersey City", "Boston"/,
  );
  assert.match(authViewSource, /if option == "Just me" \{ return 1 \}/);
  assert.match(authViewSource, /case \.groupSize:[\s\S]*renterCount\(for: option\)/);
  assert.match(authViewSource, /OnboardingAddressSearch/);
  assert.match(authViewSource, /MKLocalSearchCompleter/);
  assert.match(authViewSource, /completer\.region = MKCoordinateRegion/);
  assert.match(authViewSource, /latitudeDelta: 1\.2, longitudeDelta: 1\.2/);
  assert.match(authViewSource, /resolveRegionIfNeeded\(for: pendingCity\)/);
  assert.match(authViewSource, /Start typing an address or place/);
  assert.match(authViewSource, /Suggestions from Apple Maps/);
  assert.match(authViewSource, /Car or consistent ride/);
  assert.match(authViewSource, /No car — transit first/);
  assert.match(authViewSource, /Sometimes \/ either/);
  assert.match(authViewSource, /appModel\.profile\.commuteAccess/);
  assert.doesNotMatch(
    authViewSource,
    /case \.commuteTarget:\s*return \["I work remotely", "Skip commute matching"\]/,
  );
});

test("onboarding keeps only core setup steps and teaches the first listing share", () => {
  assert.match(
    authViewSource,
    /var questions: \[OnboardingQuestion\] = \[[\s\S]*\.city,[\s\S]*\.moveIn,[\s\S]*\.groupSize,[\s\S]*\.budget,[\s\S]*\.commuteTarget,[\s\S]*\.priorities,[\s\S]*\.review/,
  );
  assert.match(authViewSource, /includesNameQuestion \? \.name : \.city/);
  assert.match(authViewSource, /HOW CAN YOU USUALLY GET THERE\?/);
  assert.match(authViewSource, /COMFORTABLE COMMUTE RANGE/);
  assert.match(authViewSource, /No hard requirements/);
  assert.match(authViewSource, /No hard dealbreakers/);
  assert.match(
    welcomeSource,
    /Finding a place with friends doesn’t have to end your friendship/,
  );
  assert.match(appModelSource, /homeboard\.guide\.first-listing\.pending/);
  assert.match(workspaceSource, /SharedListingShareWorkflowGuide/);
  assert.match(workspaceSource, /Share a listing to Homeboard/);
  assert.match(workspaceSource, /Zillow, StreetEasy, Apartments\.com, Realtor/);
  assert.match(workspaceSource, /Tap Share, then tap Homeboard/);
  assert.match(workspaceSource, /square\.and\.arrow\.up/);
  assert.match(workspaceSource, /CFBundleIcons/);
  assert.match(workspaceSource, /If Homeboard is off-screen, swipe the app row left or tap More/);
  assert.doesNotMatch(workspaceSource, /label: "AirDrop"|label: "Messages"|label: "Mail"/);
  assert.match(workspaceSource, /Review what Homeboard found/);
  assert.match(workspaceSource, /The \+ button is only a manual backup/);
});
