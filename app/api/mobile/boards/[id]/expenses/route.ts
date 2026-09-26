import { NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle, isThrottleError } from "@/lib/action-throttle";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  description: z.string().trim().min(1).max(160),
  category: z.enum(["application_fee", "deposit", "tour", "moving", "other"]),
  amountCents: z.number().int().min(1).max(10_000_000),
});

async function accessibleBoard(boardId: string, userId: string) {
  return prisma.searchBoard.findFirst({
    where: { id: boardId, OR: [{ userId }, { members: { some: { userId } } }] },
    select: {
      id: true,
      user: { select: { id: true, displayName: true } },
      members: { select: { user: { select: { id: true, displayName: true } } } },
    },
  });
}

async function payload(board: NonNullable<Awaited<ReturnType<typeof accessibleBoard>>>) {
  const members = [board.user, ...board.members.map((member) => member.user)]
    .filter((member, index, all) => all.findIndex((candidate) => candidate.id === member.id) === index);
  const expenses = await prisma.boardExpense.findMany({
    where: { boardId: board.id },
    include: { paidBy: { select: { displayName: true } } },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const totalCents = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const baseShare = members.length > 0 ? Math.floor(totalCents / members.length) : 0;
  const remainder = members.length > 0 ? totalCents % members.length : 0;
  const balances = members.map((member, index) => {
    const paidCents = expenses.filter((expense) => expense.paidByUserId === member.id)
      .reduce((sum, expense) => sum + expense.amountCents, 0);
    const owedCents = baseShare + (index < remainder ? 1 : 0);
    return { userId: member.id, name: member.displayName, paidCents, owedCents, balanceCents: paidCents - owedCents };
  });
  return {
    totalCents,
    splitMode: "equal",
    expenses: expenses.map((expense) => ({
      id: expense.id,
      description: expense.description,
      category: expense.category,
      amountCents: expense.amountCents,
      paidAt: expense.paidAt.toISOString(),
      paidByUserId: expense.paidByUserId,
      paidByName: expense.paidBy.displayName,
    })),
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
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Expense details are invalid." }, { status: 400 });
    const board = await accessibleBoard(id, user.id);
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    await prisma.$transaction([
      prisma.boardExpense.create({ data: { boardId: id, paidByUserId: user.id, ...parsed.data } }),
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
