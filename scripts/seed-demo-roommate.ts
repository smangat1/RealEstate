import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import {
  assertExpectedDemoBoard,
  DEMO_BOARD_TITLE,
  DEMO_ROOMMATE_DISPLAY_NAME,
  DEMO_ROOMMATE_MESSAGES,
  DEMO_ROOMMATE_USER_ID,
  demoRoommateRows,
} from "../lib/demo-roommate-seed";
import { prisma } from "../lib/prisma";

const inviteCode = (process.env.DEMO_BOARD_INVITE_CODE ?? "REVIEW2026").trim().toUpperCase();
const confirmed = process.argv.includes("--confirm");
const undo = process.argv.includes("--undo");

async function loadDemoBoard() {
  const invitation = await prisma.boardInvitation.findUnique({
    where: { inviteCode },
    include: {
      board: {
        include: { user: true },
      },
    },
  });
  if (!invitation) throw new Error(`Refusing: invitation ${inviteCode} was not found.`);

  const identity = {
    title: invitation.board.title,
    owner: invitation.board.user,
    invitation,
    boardId: invitation.board.id,
    ownerUserId: invitation.board.userId,
  };
  assertExpectedDemoBoard(identity);
  return invitation.board;
}

async function assertSeedIdentityIsSafe(boardId: string) {
  const [user, membershipWithName, messageCollisions] = await Promise.all([
    prisma.user.findUnique({ where: { id: DEMO_ROOMMATE_USER_ID } }),
    prisma.boardMember.findFirst({
      where: {
        boardId,
        user: { displayName: DEMO_ROOMMATE_DISPLAY_NAME },
      },
      include: { user: true },
    }),
    prisma.chatMessage.findMany({
      where: { id: { in: DEMO_ROOMMATE_MESSAGES.map((message) => message.id) } },
      select: { id: true, boardId: true, authorUserId: true },
    }),
  ]);

  if (
    user
    && (
      user.displayName !== DEMO_ROOMMATE_DISPLAY_NAME
      || user.email !== null
      || user.authUserId !== null
      || !user.isDemoAccount
    )
  ) {
    throw new Error("Refusing: the deterministic demo-roommate user ID belongs to another identity.");
  }
  if (membershipWithName && membershipWithName.userId !== DEMO_ROOMMATE_USER_ID) {
    throw new Error("Refusing: this board already has a different member named Demo Roommate.");
  }
  if (
    messageCollisions.some(
      (message) => message.boardId !== boardId || message.authorUserId !== DEMO_ROOMMATE_USER_ID,
    )
  ) {
    throw new Error("Refusing: a deterministic demo message ID is already in use elsewhere.");
  }
}

async function printPlan(boardId: string) {
  const [user, membership, profile, messages] = await Promise.all([
    prisma.user.findUnique({ where: { id: DEMO_ROOMMATE_USER_ID }, select: { id: true } }),
    prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: DEMO_ROOMMATE_USER_ID } },
      select: { id: true },
    }),
    prisma.roommateProfile.findFirst({
      where: { boardId, linkedUserId: DEMO_ROOMMATE_USER_ID },
      select: { id: true },
    }),
    prisma.chatMessage.findMany({
      where: {
        boardId,
        id: { in: DEMO_ROOMMATE_MESSAGES.map((message) => message.id) },
      },
      select: { id: true },
    }),
  ]);

  const plan = undo
    ? {
        action: "undo demo roommate",
        deleteMessageCount: messages.length,
        deleteRoommateProfile: Boolean(profile),
        deleteMembership: Boolean(membership),
        deleteFakeUser: Boolean(user),
      }
    : {
        action: "seed demo roommate",
        createFakeUser: !user,
        createMembership: !membership,
        createRoommateProfile: !profile,
        createMessages: DEMO_ROOMMATE_MESSAGES.length - messages.length,
      };
  process.stdout.write(`${JSON.stringify({ boardId, boardTitle: DEMO_BOARD_TITLE, plan }, null, 2)}\n`);
}

async function seed(boardId: string) {
  const rows = demoRoommateRows(boardId);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.upsert({
      where: { id: DEMO_ROOMMATE_USER_ID },
      create: rows.user,
      update: {},
    });
    await transaction.boardMember.upsert({
      where: { boardId_userId: { boardId, userId: DEMO_ROOMMATE_USER_ID } },
      create: rows.membership,
      update: {},
    });
    const profile = await transaction.roommateProfile.findFirst({
      where: { boardId, linkedUserId: DEMO_ROOMMATE_USER_ID },
      select: { id: true },
    });
    if (!profile) await transaction.roommateProfile.create({ data: rows.roommateProfile });
    await transaction.chatMessage.createMany({ data: rows.messages, skipDuplicates: true });
  });
}

async function undoSeed(boardId: string) {
  await prisma.$transaction(async (transaction) => {
    await transaction.chatMessage.deleteMany({
      where: {
        boardId,
        id: { in: DEMO_ROOMMATE_MESSAGES.map((message) => message.id) },
        authorUserId: DEMO_ROOMMATE_USER_ID,
      },
    });
    await transaction.roommateProfile.deleteMany({
      where: { boardId, linkedUserId: DEMO_ROOMMATE_USER_ID },
    });
    await transaction.boardMember.deleteMany({
      where: { boardId, userId: DEMO_ROOMMATE_USER_ID },
    });
    await transaction.user.deleteMany({
      where: {
        id: DEMO_ROOMMATE_USER_ID,
        displayName: DEMO_ROOMMATE_DISPLAY_NAME,
        email: null,
        authUserId: null,
        isDemoAccount: true,
      },
    });
  });
}

async function main() {
  const board = await loadDemoBoard();
  await assertSeedIdentityIsSafe(board.id);
  await printPlan(board.id);

  if (!confirmed) {
    process.stdout.write(
      `Dry run only. Re-run with ${undo ? "--undo --confirm" : "--confirm"} to apply this exact plan.\n`,
    );
    return;
  }

  if (undo) await undoSeed(board.id);
  else await seed(board.id);
  process.stdout.write(`${undo ? "Removed" : "Seeded"} ${DEMO_ROOMMATE_DISPLAY_NAME}.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

