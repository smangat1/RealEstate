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

export type FinanceMember = {
  id: string;
  name: string;
};

export type ExpenseWithShares = {
  amountCents: number;
  paidByUserId: string;
  paidByName?: string;
  shares: BoardExpenseShare[];
};

export function sanitizeStoredSplitUserIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .slice(0, 20);
}

export function sanitizeStoredExpenseShares(
  value: unknown,
  amountCents: number,
  memberNames: ReadonlyMap<string, string> = new Map(),
): BoardExpenseShare[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return [];
  const shares: BoardExpenseShare[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    const userId = typeof candidate.userId === "string" ? candidate.userId.trim() : "";
    const owedCents = candidate.owedCents;
    if (!userId || seen.has(userId) || typeof owedCents !== "number"
      || !Number.isSafeInteger(owedCents) || owedCents < 0) {
      return [];
    }
    seen.add(userId);
    const storedName = typeof candidate.name === "string" ? candidate.name.trim() : "";
    shares.push({
      userId,
      name: storedName || memberNames.get(userId) || "Former member",
      owedCents,
    });
  }
  return shares.reduce((sum, share) => sum + share.owedCents, 0) === amountCents ? shares : [];
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

export function normalizeExpenseShares(input: {
  amountCents: number;
  storedShares: unknown;
  storedSplitUserIds: unknown;
  fallbackUserIds: readonly string[];
  memberNames: ReadonlyMap<string, string>;
}): BoardExpenseShare[] {
  const storedShares = sanitizeStoredExpenseShares(
    input.storedShares,
    input.amountCents,
    input.memberNames,
  );
  if (storedShares.length > 0) return storedShares;

  const storedUserIds = sanitizeStoredSplitUserIds(input.storedSplitUserIds);
  const splitUserIds = storedUserIds.length > 0
    ? storedUserIds
    : sanitizeStoredSplitUserIds(input.fallbackUserIds);
  return allocateExpenseShares(input.amountCents, splitUserIds, input.memberNames);
}

export function calculateExpenseBalances(
  expenses: readonly ExpenseWithShares[],
  members: readonly FinanceMember[],
) {
  const accountingMembers = new Map<string, string>();
  for (const member of members) accountingMembers.set(member.id, member.name);
  for (const expense of expenses) {
    if (!accountingMembers.has(expense.paidByUserId)) {
      accountingMembers.set(expense.paidByUserId, expense.paidByName?.trim() || "Former payer");
    }
    for (const share of expense.shares) {
      if (!accountingMembers.has(share.userId)) {
        accountingMembers.set(share.userId, share.name.trim() || "Former member");
      }
    }
  }

  return [...accountingMembers].map(([userId, name]) => {
    const paidCents = expenses.reduce(
      (sum, expense) => sum + (expense.paidByUserId === userId ? expense.amountCents : 0),
      0,
    );
    const owedCents = expenses.reduce(
      (sum, expense) => sum + (expense.shares.find((share) => share.userId === userId)?.owedCents ?? 0),
      0,
    );
    return {
      userId,
      name,
      paidCents,
      owedCents,
      balanceCents: paidCents - owedCents,
    };
  });
}
