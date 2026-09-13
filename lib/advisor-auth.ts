import "server-only";

import { prisma } from "@/lib/prisma";

export async function requireAdvisorBoardAccess(boardId: string, userId: string) {
  const board = await prisma.searchBoard.findFirst({
    where: {
      id: boardId,
      OR: [{ userId }, { members: { some: { userId } } }],
    },
    select: { id: true },
  });
  if (!board) throw new Error("ADVISOR_BOARD_FORBIDDEN");
  return board;
}

export async function requireAdvisorListingAccess(
  boardId: string,
  listingId: string,
  userId: string,
) {
  const boardListing = await prisma.boardListing.findFirst({
    where: {
      boardId,
      listingId,
      deletedAt: null,
      board: { OR: [{ userId }, { members: { some: { userId } } }] },
    },
    select: { id: true, listingId: true, boardId: true },
  });
  if (!boardListing) throw new Error("ADVISOR_LISTING_FORBIDDEN");
  return boardListing;
}
