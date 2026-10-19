import { z } from "zod";

export const boardExpenseCategories = [
  "application_fee",
  "deposit",
  "holding_deposit",
  "security_deposit",
  "first_month_rent",
  "last_month_rent",
  "broker_fee",
  "move_in_fee",
  "renters_insurance",
  "utility_deposit",
  "tour",
  "moving",
  "other",
] as const;

export const boardExpenseCreateSchema = z.object({
  description: z.string().trim().min(1).max(160),
  category: z.enum(boardExpenseCategories),
  amountCents: z.number().int().min(1).max(10_000_000),
  boardListingId: z.string().trim().min(1).optional(),
  paidByUserId: z.string().trim().min(1).optional(),
  splitUserIds: z.array(z.string().trim().min(1)).min(1).max(20).optional(),
});

export type BoardExpenseShare = {
  userId: string;
  name: string;
  owedCents: number;
};

type FinanceMember = {
  id: string;
  name: string;
};

type ExpenseWithShares = {
  amountCents: number;
  paidByUserId: string;
  shares: BoardExpenseShare[];
};

export function sanitizeStoredSplitUserIds(value: unknown, validUserIds: ReadonlySet<string>) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && validUserIds.has(entry))
    .filter((entry, index, all) => all.indexOf(entry) === index);
}

export function resolveRequestedSplitUserIds(
  requestedUserIds: readonly string[] | undefined,
  boardMemberIds: readonly string[],
) {
  const validUserIds = new Set(boardMemberIds);
  const requested = requestedUserIds ?? boardMemberIds;
  if (requested.some((userId) => !validUserIds.has(userId))) return null;
  return requested.filter((userId, index, all) => all.indexOf(userId) === index);
}

export function allocateExpenseShares(
  amountCents: number,
  splitUserIds: readonly string[],
  memberNames: ReadonlyMap<string, string>,
): BoardExpenseShare[] {
  if (splitUserIds.length === 0) return [];
  const baseShare = Math.floor(amountCents / splitUserIds.length);
  const remainder = amountCents % splitUserIds.length;
  return splitUserIds.map((userId, index) => ({
    userId,
    name: memberNames.get(userId) ?? "Former member",
    owedCents: baseShare + (index < remainder ? 1 : 0),
  }));
}

export function calculateExpenseBalances(
  expenses: readonly ExpenseWithShares[],
  members: readonly FinanceMember[],
) {
  return members.map((member) => {
    const paidCents = expenses.reduce(
      (sum, expense) => sum + (expense.paidByUserId === member.id ? expense.amountCents : 0),
      0,
    );
    const owedCents = expenses.reduce(
      (sum, expense) => sum + (expense.shares.find((share) => share.userId === member.id)?.owedCents ?? 0),
      0,
    );
    return {
      userId: member.id,
      name: member.name,
      paidCents,
      owedCents,
      balanceCents: paidCents - owedCents,
    };
  });
}
