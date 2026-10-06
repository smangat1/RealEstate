import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  InvalidChatReplyTargetError,
  loadChatReplyLinks,
  routeChatReply,
  storeChatReplyLink,
  validateChatReplyTarget,
} from "../lib/chat-replies";

const advisorTarget = {
  id: "advisor-message",
  boardId: "board-a",
  role: "assistant",
  hasAdvisorPayload: true,
};

test("a reply target from another board is rejected before routing", () => {
  assert.throws(
    () => validateChatReplyTarget("board-a", "foreign-message", {
      id: "foreign-message",
      boardId: "board-b",
      role: "user",
      hasAdvisorPayload: false,
    }),
    InvalidChatReplyTargetError,
  );
});

test("replying to an Advisor card builds the exact implicit advisor command", () => {
  const routing = routeChatReply("  make this easier to read  ", advisorTarget);
  assert.equal(routing.isAdvisorRequest, true);
  assert.equal(routing.isImplicitAdvisorRequest, true);
  assert.equal(routing.engineCommand, "@advisor make this easier to read");
});

test("replying to an ordinary board message never selects the Advisor engine", async () => {
  const routing = routeChatReply("sounds good", {
    id: "roommate-message",
    boardId: "board-a",
    role: "user",
    hasAdvisorPayload: false,
  });
  let engineCalls = 0;
  if (routing.isAdvisorRequest) engineCalls += 1;
  assert.equal(routing.isAdvisorRequest, false);
  assert.equal(routing.engineCommand, "sounds good");
  assert.equal(engineCalls, 0);
});

test("a missing reply table fails soft for both board reads and sends", async () => {
  const diagnostics: string[] = [];
  const links = await loadChatReplyLinks({
    boardId: "board-a",
    messageIds: ["message-a"],
    query: async () => { throw Object.assign(new Error("missing table"), { code: "P2021" }); },
    diagnostic: (event) => diagnostics.push(event),
  });
  const saved = await storeChatReplyLink({
    boardId: "board-a",
    messageId: "message-a",
    replyToMessageId: "message-b",
    create: async () => { throw Object.assign(new Error("missing table"), { code: "P2021" }); },
    diagnostic: (event) => diagnostics.push(event),
  });
  assert.equal(links.size, 0);
  assert.equal(saved, false);
  assert.deepEqual(diagnostics, ["chat_reply_read_unavailable", "chat_reply_write_unavailable"]);
});

test("the reply record and diagnostics contain identifiers only", async () => {
  let stored: unknown;
  const diagnostics: string[] = [];
  const privateText = "My income is 90000 and credit is 780";
  const saved = await storeChatReplyLink({
    boardId: "board-a",
    messageId: "message-a",
    replyToMessageId: "message-b",
    create: async (args) => { stored = args.data; },
    diagnostic: (event) => diagnostics.push(event),
  });
  const serialized = JSON.stringify({ stored, diagnostics });
  assert.equal(saved, true);
  assert.deepEqual(stored, {
    boardId: "board-a",
    messageId: "message-a",
    replyToMessageId: "message-b",
  });
  assert.equal(serialized.includes(privateText), false);
  assert.equal(serialized.includes("90000"), false);
  assert.equal(serialized.includes("780"), false);
});

test("migration is additive, board-scoped, RLS-enabled, and explicitly granted", () => {
  const migration = readFileSync(
    "prisma/migrations/20261005120000_chat_message_replies/migration.sql",
    "utf8",
  );
  assert.match(migration, /CREATE TABLE "ChatMessageReply"/);
  assert.doesNotMatch(migration, /ALTER TABLE "ChatMessage" ADD COLUMN/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /message\."boardId" = "ChatMessageReply"\."boardId"/);
  assert.match(migration, /target\."boardId" = "ChatMessageReply"\."boardId"/);
  assert.match(migration, /GRANT SELECT ON TABLE "ChatMessageReply" TO anon/);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE "ChatMessageReply" TO authenticated/);
  assert.match(migration, /GRANT ALL PRIVILEGES ON TABLE "ChatMessageReply" TO service_role/);
});
