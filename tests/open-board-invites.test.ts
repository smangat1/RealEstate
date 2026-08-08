import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const schema = read("prisma/schema.prisma");
const invitationRoute = read("app/api/mobile/invitations/route.ts");
const boardData = read("lib/board-data.ts");
const appModel = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
const workspace = read(
  "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift",
);

test("roommate invite codes can be created without an email restriction", () => {
  assert.match(schema, /model BoardInvitation[\s\S]*email\s+String\?/);
  assert.match(invitationRoute, /email: z\.string\(\)\.email\(\)\.max\(320\)\.optional\(\)\.nullable\(\)/);
  assert.match(boardData, /email\?: string \| null/);
  assert.match(boardData, /const normalizedEmail = email\?\.trim\(\)\.toLowerCase\(\) \|\| null/);
  assert.match(
    boardData,
    /if \(invitation\.email && user\.email\.toLowerCase\(\) !== invitation\.email\.toLowerCase\(\)\)/,
  );
});

test("native invite UI makes texting a code primary and describes delivery honestly", () => {
  assert.match(appModel, /func createInvite\(email: String\? = nil\)/);
  assert.match(appModel, /Shareable roommate code ready\. Send it by text or any app\./);
  assert.match(workspace, /Create a shareable code/);
  assert.match(workspace, /Restrict to email \(optional\)/);
  assert.match(workspace, /No email required/);
  assert.match(workspace, /Homeboard code: \\\(board\.inviteCode\)/);
  assert.match(workspace, /the app does not send email/);
});
