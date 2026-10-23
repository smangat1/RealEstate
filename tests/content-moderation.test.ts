import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkObjectionableText } from "../lib/content-filter";
import {
  canModerateMessage,
  contentReportReasons,
  filterVisibleChatMessages,
  shareBoardWhere,
} from "../lib/content-moderation";

const reportRoute = readFileSync(
  "app/api/mobile/boards/[id]/messages/[messageId]/report/route.ts",
  "utf8",
);
const blocksRoute = readFileSync("app/api/mobile/blocks/route.ts", "utf8");
const unblockRoute = readFileSync("app/api/mobile/blocks/[userId]/route.ts", "utf8");
const boardData = readFileSync("lib/board-data.ts", "utf8");
const mobilePayloads = readFileSync("lib/mobile-payloads.ts", "utf8");
const apns = readFileSync("lib/apns.ts", "utf8");
const migration = readFileSync(
  "prisma/migrations/20261022120000_content_moderation/migration.sql",
  "utf8",
);

test("report reasons and details are strictly validated", () => {
  assert.deepEqual(contentReportReasons, ["spam", "harassment", "inappropriate", "threat", "other"]);
  assert.match(reportRoute, /z\.enum\(contentReportReasons\)/);
  assert.match(reportRoute, /details: z\.string\(\)\.trim\(\)\.max\(500\)\.optional\(\)/);
  assert.match(reportRoute, /limit: 10[\s\S]*windowMs: 60 \* 1_000/);
});

test("message reports enforce membership, message ownership, and idempotency", () => {
  assert.equal(canModerateMessage({
    reporterUserId: "reporter",
    message: { role: "user", authorUserId: "reporter" },
  }), false);
  assert.equal(canModerateMessage({
    reporterUserId: "reporter",
    message: { role: "assistant", authorUserId: "other" },
  }), false);
  assert.equal(canModerateMessage({
    reporterUserId: "reporter",
    message: { role: "user", authorUserId: "other" },
  }), true);
  assert.match(reportRoute, /OR: \[\{ userId: user\.id \}/);
  assert.match(reportRoute, /members: \{ some: \{ userId: user\.id \} \}/);
  assert.match(reportRoute, /if \(!board\).*Board not found.*404/);
  assert.match(reportRoute, /reporterUserId_messageId/);
  assert.match(reportRoute, /if \(existing\).*created: false/);
  assert.match(reportRoute, /P2002/);
  assert.match(reportRoute, /contentSnapshot: message\.content/);
  assert.match(reportRoute, /metadata: \{ reportId: report\.id, reason: report\.reason, boardId \}/);
});

test("block and unblock enforce self and shared-board rules and stay idempotent", () => {
  assert.deepEqual(shareBoardWhere("a", "b"), {
    AND: [
      { OR: [{ userId: "a" }, { members: { some: { userId: "a" } } }] },
      { OR: [{ userId: "b" }, { members: { some: { userId: "b" } } }] },
    ],
  });
  assert.match(blocksRoute, /blockedUserId === user\.id/);
  assert.match(blocksRoute, /shareBoardWhere\(user\.id, parsed\.data\.blockedUserId\)/);
  assert.match(blocksRoute, /if \(!sharedBoard\).*User not found.*404/);
  assert.match(blocksRoute, /userBlock\.upsert/);
  assert.match(unblockRoute, /userBlock\.deleteMany/);
  assert.match(blocksRoute, /displayName: block\.blocked\.displayName/);
});

test("visibility removes blocked and reported user messages but keeps system roles", () => {
  const messages = [
    { id: "blocked", role: "user", authorUserId: "blocked-user" },
    { id: "reported", role: "user", authorUserId: "other-user" },
    { id: "visible", role: "user", authorUserId: "other-user" },
    { id: "advisor", role: "assistant", authorUserId: "blocked-user" },
    { id: "system", role: "system", authorUserId: null },
  ];
  assert.deepEqual(
    filterVisibleChatMessages(messages, new Set(["blocked-user"]), new Set(["reported"])).map((item) => item.id),
    ["visible", "advisor", "system"],
  );
  assert.match(boardData, /replyToMessageId && visibleMessageIds\.has\(replyToMessageId\)/);
  assert.match(mobilePayloads, /authorUserId: message\.authorUserId/);
});

test("filter catches normalized severe abuse", () => {
  for (const text of [
    "I will kiiill you",
    "s3nd me nuuudes",
    "n1gggg3r",
    "I am going to burn down your house",
  ]) {
    assert.equal(checkObjectionableText(text).isObjectionable, true, text);
  }
});

test("filter avoids housing-talk substring false positives", () => {
  for (const text of ["assume", "class", "Essex", "Sussex", "cocktail", "The class can assume the lease."]) {
    assert.deepEqual(checkObjectionableText(text), { isObjectionable: false, category: null }, text);
  }
});

test("filter runs before mobile storage and inside the shared web send path", () => {
  const messageRoute = readFileSync("app/api/mobile/boards/[id]/messages/route.ts", "utf8");
  assert.match(messageRoute, /checkObjectionableText\(parsed\.data\.content\)/);
  assert.match(messageRoute, /COMMUNITY_RULES_MESSAGE \}, \{ status: 400 \}/);
  assert.match(boardData, /checkObjectionableText\(message\).*COMMUNITY_RULES_MESSAGE/);
});

test("push excludes users who blocked the sender", () => {
  assert.match(apns, /where: \{ blockedUserId: input\.authorUserId \}/);
  assert.match(apns, /blocks\.map\(\(block\) => block\.blockerUserId\)/);
});

test("moderation tables are service-only, RLS-enabled, and deletion-safe", () => {
  assert.match(migration, /ALTER TABLE "UserBlock" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE "ContentReport" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT ALL PRIVILEGES ON TABLE "UserBlock" TO service_role/);
  assert.match(migration, /GRANT ALL PRIVILEGES ON TABLE "ContentReport" TO service_role/);
  assert.doesNotMatch(migration, /TO (?:anon|authenticated)/);
  assert.match(migration, /"blockerUserId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/);
  assert.match(migration, /"blockedUserId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/);
  assert.match(migration, /"reporterUserId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE/);
  assert.match(migration, /"reportedUserId"\) REFERENCES "User"\("id"\) ON DELETE SET NULL/);
  assert.match(migration, /"messageId"\) REFERENCES "ChatMessage"\("id"\) ON DELETE SET NULL/);
});
