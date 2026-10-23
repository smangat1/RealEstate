import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertExpectedDemoBoard,
  DEMO_ROOMMATE_MESSAGES,
  DEMO_ROOMMATE_USER_ID,
  demoRoommateRows,
} from "../lib/demo-roommate-seed";
import { filterVisibleChatMessages, shareBoardWhere } from "../lib/content-moderation";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("the fake roommate has no sign-in identity and three harmless board messages", () => {
  const rows = demoRoommateRows("demo-board-id");
  assert.equal(rows.user.email, null);
  assert.equal(rows.user.authUserId, null);
  assert.equal(rows.user.isDemoAccount, true);
  assert.equal(rows.messages.length, 3);
  assert.ok(rows.messages.every((message) => message.authorUserId === DEMO_ROOMMATE_USER_ID));
  assert.deepEqual(rows.messages.map((message) => message.content), DEMO_ROOMMATE_MESSAGES.map((message) => message.content));
});

test("the seed accepts only the exact review board owner and invitation shape", () => {
  const expected = {
    title: "Demo Board",
    boardId: "board-1",
    ownerUserId: "owner-1",
    owner: { displayName: "App Review", email: "app-review@joinhomeboard.com" },
    invitation: { boardId: "board-1", invitedByUserId: "owner-1", status: "pending" },
  };
  assert.doesNotThrow(() => assertExpectedDemoBoard(expected));
  assert.throws(() => assertExpectedDemoBoard({ ...expected, title: "Another board" }), /Refusing/);
  assert.throws(
    () => assertExpectedDemoBoard({ ...expected, owner: { ...expected.owner, email: null } }),
    /Refusing/,
  );
});

test("mocked review login and board load remain compatible with the member", async () => {
  const reviewRoute = read("app/api/mobile/review-session/route.ts");
  const sessionRoute = read("app/api/mobile/session/route.ts");
  const boardData = read("lib/board-data.ts");
  const script = read("scripts/seed-demo-roommate.ts");

  assert.match(reviewRoute, /generateLink\(\{[\s\S]*type: "magiclink"/);
  assert.match(reviewRoute, /verifyOtp\(\{/);
  assert.match(sessionRoute, /getBoardPageData\(boards\[0\]\.id, user\.id/);
  assert.match(boardData, /filterVisibleChatMessages\(/);
  assert.match(script, /if \(!confirmed\)/);
  assert.match(script, /skipDuplicates: true/);

  const rows = demoRoommateRows("board-1");
  const mockDatabase = {
    invitation: { inviteCode: "REVIEW2026", status: "pending" },
    board: {
      id: "board-1",
      ownerUserId: "reviewer-user",
      memberUserIds: [DEMO_ROOMMATE_USER_ID],
      messages: rows.messages,
    },
  };
  const mockReviewLogin = async (inviteCode: string) => {
    assert.equal(inviteCode, mockDatabase.invitation.inviteCode);
    assert.equal(mockDatabase.invitation.status, "pending");
    return { userId: "reviewer-user" };
  };
  const mockBoardLoad = async (userId: string) => {
    const canLoad = mockDatabase.board.ownerUserId === userId
      || mockDatabase.board.memberUserIds.includes(userId);
    if (!canLoad) throw new Error("Not a board member");
    return filterVisibleChatMessages(mockDatabase.board.messages, new Set(), new Set());
  };

  const session = await mockReviewLogin("REVIEW2026");
  const visible = await mockBoardLoad(session.userId);
  assert.equal(visible.length, 3);
});

test("blocking the fake roommate uses the shared-board rule and hides their messages", () => {
  assert.deepEqual(shareBoardWhere("reviewer-user", DEMO_ROOMMATE_USER_ID), {
    AND: [
      {
        OR: [
          { userId: "reviewer-user" },
          { members: { some: { userId: "reviewer-user" } } },
        ],
      },
      {
        OR: [
          { userId: DEMO_ROOMMATE_USER_ID },
          { members: { some: { userId: DEMO_ROOMMATE_USER_ID } } },
        ],
      },
    ],
  });

  const messages = demoRoommateRows("board-1").messages;
  assert.deepEqual(
    filterVisibleChatMessages(messages, new Set([DEMO_ROOMMATE_USER_ID]), new Set()),
    [],
  );
});
