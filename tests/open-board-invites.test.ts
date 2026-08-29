import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const schema = read("prisma/schema.prisma");
const invitationRoute = read("app/api/mobile/invitations/route.ts");
const boardData = read("lib/board-data.ts");
const actions = read("app/actions.ts");
const signInPage = read("app/sign-in/page.tsx");
const appModel = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
const workspace = read(
  "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift",
);
const onboarding = read("ios/HomeboardNative/HomeboardNative/Sources/AccountOnboardingView.swift");
const welcome = read("ios/HomeboardNative/HomeboardNative/Sources/WelcomeView.swift");
const releaseEntitlements = read("ios/HomeboardNative/HomeboardNative/HomeboardNative.entitlements");
const debugEntitlements = read("ios/HomeboardNative/HomeboardNative/HomeboardNativeDebug.entitlements");
const association = read("lib/apple-app-site-association.ts");
const invitePage = read("app/invite/[token]/page.tsx");
const inviteActions = read("app/invite/[token]/invite-actions.tsx");
const inviteStyles = read("app/invite/[token]/invite.module.css");
const inviteOG = read("app/api/invite-og/route.tsx");

test("roommate invitations are secure bearer links instead of email locks", () => {
  assert.match(schema, /model BoardInvitation[\s\S]*email\s+String\?/);
  assert.doesNotMatch(invitationRoute, /email:/);
  assert.match(boardData, /randomBytes\(16\)\.toString\("hex"\)/);
  assert.match(boardData, /where: \{ boardId, status: "pending" \}[\s\S]*data: \{ status: "revoked" \}/);
  assert.match(boardData, /email: null/);
  assert.match(boardData, /where: \{ id: boardId, userId: invitedByUserId \}/);
  assert.match(boardData, /transaction\.searchBoard\.update[\s\S]*transaction\.boardInvitation\.updateMany[\s\S]*transaction\.boardInvitation\.create/);
  assert.match(boardData, /const existingMembership = await prisma\.boardMember\.findUnique[\s\S]*if \(existingMembership\) return invitation\.boardId/);
  assert.match(boardData, /prisma\.\$transaction[\s\S]*boardInvitation\.updateMany[\s\S]*claim\.count !== 1/);
  assert.doesNotMatch(boardData, /This invite is for .*signed in as/);
});

test("native invite UI shares a link that works with hidden Apple email", () => {
  assert.match(appModel, /func createInvite\(\)/);
  assert.match(appModel, /Single-use roommate link ready/);
  assert.match(workspace, /Create a shareable link/);
  assert.match(workspace, /Hide My Email/);
  assert.match(workspace, /The first signed-in person to accept this expiring link joins the board/);
  assert.match(workspace, /Join our shared rental board on Homeboard/);
  assert.doesNotMatch(workspace, /Restrict to email|Only .* can use this code/);
});

test("shared web links open the installed app and otherwise retain an install path", () => {
  assert.match(association, /4SSAVHCM6U\.com\.homeboard\.native/);
  assert.match(association, /paths: \["\/invite\/\*"\]/);
  assert.match(releaseEntitlements, /com\.apple\.developer\.associated-domains/);
  assert.match(releaseEntitlements, /applinks:real-estate-samyanmangat-6662s-projects\.vercel\.app/);
  assert.match(debugEntitlements, /com\.apple\.developer\.associated-domains/);
  assert.match(inviteActions, /window\.location\.assign\(nativeURL\)/);
  assert.match(inviteActions, /window\.location\.assign\(installURL\)/);
  assert.match(inviteActions, /visibilitychange/);
  assert.match(inviteActions, /Keep this page open/);
  assert.match(appModel, /normalizedInviteToken\(from: rawCode\)/);
  assert.match(appModel, /didFinishBootstrap/);
  assert.match(appModel, /await bootstrap\(\)[\s\S]*pendingInviteCode == inviteCode[\s\S]*startInviteJoin\(code: inviteCode\)/);
  assert.match(onboarding, /PASTE INVITE LINK/);
  assert.match(welcome, /Paste invite link or token/);
  assert.match(welcome, /joinCode\.count == 10 \|\| joinCode\.count == 32/);
  assert.match(appModel, /pendingInviteCode: ""/);
  assert.match(appModel, /incomingLinkError/);
});

test("invite links have board-specific branded social previews", () => {
  assert.match(invitePage, /export async function generateMetadata/);
  assert.match(invitePage, /Join \$\{inviteData\.board\.title\} on Homeboard/);
  assert.match(invitePage, /\/api\/invite-og\?token=/);
  assert.match(invitePage, /Private invitation/);
  assert.match(invitePage, /Link reference/);
  assert.ok(invitePage.indexOf("const sharedFrame") > invitePage.indexOf('invitation.status !== "pending"'));
  assert.match(inviteStyles, /font-size: 16px/);
  assert.match(inviteStyles, /min-height: 44px/);
  assert.match(inviteOG, /inviteData\.board\.title/);
  assert.match(inviteOG, /inviteData\.invitedBy\.displayName/);
  assert.match(inviteOG, /PRIVATE BOARD LINK/);
  assert.doesNotMatch(inviteOG, /email/);
});

test("the optional web fallback preserves the invite through authentication", () => {
  assert.match(invitePage, /href=\{`\/sign-in\?next=/);
  assert.match(signInPage, /name="next" value=\{next\}/);
  assert.match(signInPage, /action=\{signInAction\}/);
  assert.match(actions, /redirectWithMessage\(`\/sign-in\?next=/);

  const actionStart = actions.indexOf("export async function acceptBoardInvitationAction");
  const actionEnd = actions.indexOf("export async function completeJoinedMemberSetupAction");
  const acceptAction = actions.slice(actionStart, actionEnd);
  assert.match(acceptAction, /let boardId: string;[\s\S]*catch \(error\)[\s\S]*revalidatePath[\s\S]*redirect\(`\/boards\//);
});
