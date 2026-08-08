import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const boardData = read("lib/board-data.ts");
const updateRoute = read("app/api/mobile/boards/[id]/updates/route.ts");
const appModel = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
const workspace = read(
  "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift",
);

test("board update text is persisted in the same timeline the Updates screen renders", () => {
  const updateWrite = boardData.slice(
    boardData.indexOf("export async function addManualBoardUpdate"),
    boardData.indexOf("export async function addBoardDecision"),
  );
  assert.match(updateWrite, /prisma\.chatMessage\.create/);
  assert.match(updateWrite, /role: "user"/);
  assert.match(updateWrite, /authorUserId: actor\.userId/);
  assert.match(updateWrite, /content: message/);
  assert.match(updateRoute, /\{ userId: user\.id, authorName: user\.displayName \}/);
});

test("native updates post optimistically and restore failed text", () => {
  assert.match(appModel, /var isPostingBoardUpdate = false/);
  assert.match(appModel, /id: temporaryID[\s\S]*content: message/);
  assert.match(appModel, /board\.chatMessages\.removeAll \{ \$0\.id == temporaryID \}/);
  assert.match(appModel, /Your update was put back in the composer/);
  assert.match(workspace, /let posted = await appModel\.addBoardUpdate\(message\)/);
  assert.match(workspace, /if !posted \{[\s\S]*updateDraft = message/);
  assert.match(workspace, /if appModel\.isPostingBoardUpdate[\s\S]*ProgressView\(\)/);
});
