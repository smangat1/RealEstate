import { NextResponse } from "next/server";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import {
  allocateExpenseShares,
  boardExpenseCreateSchema,
  calculateExpenseBalances,
  resolveRequestedSplitUserIds,
  sanitizeStoredSplitUserIds,
} from "@/lib/group-finance";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

async function accessibleBoard(boardId: string, userId: string) {
  return prisma.searchBoard.findFirst({
    where: { id: boardId, OR: [{ userId }, { members: { some: { userId } } }] },
    select: {
      id: true,
      user: { select: { id: true, displayName: true } },
      members: { select: { user: { select: { id: true, displayName: true } } } },
      boardListings: {
        where: { deletedAt: null },
        select: { id: true, listing: { select: { address: true, unit: true } } },
      },
    },
  });
}

async function payload(board: NonNullable<Awaited<ReturnType<typeof accessibleBoard>>>) {
  const members = [board.user, ...board.members.map((member) => member.user)]
    .filter((member, index, all) => all.findIndex((candidate) => candidate.id === member.id) === index);
  const expenses = await prisma.boardExpense.findMany({
    where: { boardId: board.id },
    include: {
      paidBy: { select: { displayName: true } },
      boardListing: { select: { listing: { select: { address: true, unit: true } } } },
    },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const validUserIds = new Set(members.map((member) => member.id));
  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
  const normalizedExpenses = expenses.map((expense) => {
    const savedSplit = sanitizeStoredSplitUserIds(expense.splitUserIds, validUserIds);
    const splitUserIds = savedSplit.length > 0 ? savedSplit : members.map((member) => member.id);
    const shares = allocateExpenseShares(expense.amountCents, splitUserIds, memberNames);
    const address = expense.boardListing?.listing.address?.trim() ?? "";
    const unit = expense.boardListing?.listing.unit?.trim() ?? "";
    return {
      id: expense.id,
      description: expense.description,
      category: expense.category,
      amountCents: expense.amountCents,
      paidAt: expense.paidAt.toISOString(),
      paidByUserId: expense.paidByUserId,
      paidByName: expense.paidBy.displayName,
      boardListingId: expense.boardListingId,
      listingName: [address, unit].filter(Boolean).join(" · ") || null,
      splitUserIds,
      splitNames: shares.map((share) => share.name),
      shares,
    };
  });
  const totalCents = normalizedExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const balances = calculateExpenseBalances(
    normalizedExpenses,
    members.map((member) => ({ id: member.id, name: member.displayName })),
  );
  return {
    totalCents,
    splitMode: "equal",
    expenses: normalizedExpenses,
    balances,
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const board = await accessibleBoard(id, user.id);
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json(await payload(board), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json({ error: unauthorized ? "Unauthorized" : "Unable to load group expenses." }, { status: unauthorized ? 401 : 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    assertThrottle({ scope: "board-expense", key: `${user.id}:${id}`, limit: 50, windowMs: 60 * 60 * 1_000, message: "Expenses are being added too quickly." });
    const parsed = boardExpenseCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Expense details are invalid." }, { status: 400 });
    const board = await accessibleBoard(id, user.id);
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const memberIds = new Set([board.user.id, ...board.members.map((member) => member.user.id)]);
    const paidByUserId = parsed.data.paidByUserId ?? user.id;
    if (!memberIds.has(paidByUserId)) {
      return NextResponse.json({ error: "The selected payer is not on this board." }, { status: 400 });
    }
    const splitUserIds = resolveRequestedSplitUserIds(parsed.data.splitUserIds, [...memberIds]);
    if (!splitUserIds) {
      return NextResponse.json({ error: "Every split participant must be on this board." }, { status: 400 });
    }
    if (parsed.data.boardListingId
      && !board.boardListings.some((listing) => listing.id === parsed.data.boardListingId)) {
      return NextResponse.json({ error: "The selected listing is not on this board." }, { status: 400 });
    }
    const { boardListingId } = parsed.data;
    await prisma.$transaction([
      prisma.boardExpense.create({
        data: {
          boardId: id,
          paidByUserId,
          boardListingId,
          splitUserIds,
          description: parsed.data.description,
          category: parsed.data.category,
          amountCents: parsed.data.amountCents,
        },
      }),
      prisma.boardEvent.create({
        data: {
          boardId: id,
          actorType: "roommate",
          actorName: user.displayName,
          eventType: "group_expense_added",
          content: `${user.displayName} recorded $${(parsed.data.amountCents / 100).toFixed(2)} for ${parsed.data.description}.`,
        },
      }),
      prisma.searchBoard.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);
    return NextResponse.json(await payload(board));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add expense.";
    return NextResponse.json({ error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : isThrottleError(error) ? message : "Unable to add expense." }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : isThrottleError(error) ? 429 : 500 });
  }
}
