export type MemberAffordabilityInput = {
  id: string;
  name: string;
  budgetMin: number | null;
  budgetMax: number | null;
  stretchBudget: number | null;
};

export type GroupAffordability = {
  groupBudgetMin: number | null;
  groupBudgetMax: number | null;
  groupStretchBudget: number | null;
  budgetMemberCount: number;
  missingBudgetMemberNames: string[];
};

export type RentShare = {
  memberId: string;
  name: string;
  amount: number;
  percentOfRent: number;
  percentOfComfortableBudget: number;
  comfortableBudget: number;
};

export type RentSplit = {
  status: "ready" | "stretch" | "over_budget" | "incomplete";
  summary: string;
  totalComfortableBudget: number | null;
  totalStretchBudget: number | null;
  missingMemberNames: string[];
  shares: RentShare[];
};

function positive(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

export function summarizeMemberAffordability(members: MemberAffordabilityInput[]): GroupAffordability {
  const completed = members.filter((member) => positive(member.budgetMax) !== null);
  const missingBudgetMemberNames = members
    .filter((member) => positive(member.budgetMax) === null)
    .map((member) => member.name);

  if (completed.length === 0) {
    return {
      groupBudgetMin: null,
      groupBudgetMax: null,
      groupStretchBudget: null,
      budgetMemberCount: 0,
      missingBudgetMemberNames,
    };
  }

  return {
    groupBudgetMin: completed.reduce((sum, member) => sum + (positive(member.budgetMin) ?? 0), 0) || null,
    groupBudgetMax: completed.reduce((sum, member) => sum + (positive(member.budgetMax) ?? 0), 0),
    groupStretchBudget: completed.reduce(
      (sum, member) => sum + (positive(member.stretchBudget) ?? positive(member.budgetMax) ?? 0),
      0,
    ),
    budgetMemberCount: completed.length,
    missingBudgetMemberNames,
  };
}

export function allocateRentFairly(
  monthlyRent: number | null | undefined,
  members: MemberAffordabilityInput[],
): RentSplit | null {
  const rent = positive(monthlyRent);
  if (rent === null) return null;

  const affordability = summarizeMemberAffordability(members);
  const eligible = members
    .map((member) => ({ ...member, comfortableBudget: positive(member.budgetMax) }))
    .filter((member): member is typeof member & { comfortableBudget: number } => member.comfortableBudget !== null);

  if (eligible.length === 0) {
    return {
      status: "incomplete",
      summary: "Add each member’s monthly contribution before Homeboard suggests a rent split.",
      totalComfortableBudget: null,
      totalStretchBudget: null,
      missingMemberNames: affordability.missingBudgetMemberNames,
      shares: [],
    };
  }

  const totalComfortableBudget = affordability.groupBudgetMax ?? 0;
  const exactShares = eligible.map((member) => ({
    member,
    exact: (rent * member.comfortableBudget) / totalComfortableBudget,
  }));
  const roundedShares = exactShares.map(({ member, exact }) => ({
    member,
    amount: Math.floor(exact),
    fraction: exact - Math.floor(exact),
  }));
  let remaining = rent - roundedShares.reduce((sum, share) => sum + share.amount, 0);

  for (const share of [...roundedShares].sort((left, right) => right.fraction - left.fraction)) {
    if (remaining <= 0) break;
    share.amount += 1;
    remaining -= 1;
  }

  const shares = roundedShares.map(({ member, amount }) => ({
    memberId: member.id,
    name: member.name,
    amount,
    percentOfRent: Math.round((amount / rent) * 100),
    percentOfComfortableBudget: Math.round((amount / member.comfortableBudget) * 100),
    comfortableBudget: member.comfortableBudget,
  }));

  const missing = affordability.missingBudgetMemberNames;
  const status: RentSplit["status"] =
    missing.length > 0
      ? "incomplete"
      : rent <= totalComfortableBudget
        ? "ready"
        : rent <= (affordability.groupStretchBudget ?? totalComfortableBudget)
          ? "stretch"
          : "over_budget";
  const summary =
    status === "incomplete"
      ? `Waiting for ${missing.join(", ")} to add a budget before this split is final.`
      : status === "ready"
        ? "Suggested shares use the same percentage of each person’s comfortable maximum, so higher-capacity roommates contribute more without carrying a heavier relative burden."
        : status === "stretch"
          ? "This rent exceeds the group’s comfortable total but fits within the combined stretch limits."
          : "This rent exceeds the group’s combined stretch limits.";

  return {
    status,
    summary,
    totalComfortableBudget,
    totalStretchBudget: affordability.groupStretchBudget,
    missingMemberNames: missing,
    shares,
  };
}
