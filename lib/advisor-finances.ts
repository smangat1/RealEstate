export type AdvisorFinancialDisclosureMode =
  | "available_on_request"
  | "combined_range"
  | "omit";

export type AdvisorMemberFinancialValues = {
  annualIncomeMin: number | null;
  annualIncomeMax: number | null;
  creditScoreMin: number | null;
  creditScoreMax: number | null;
};

export type AdvisorGroupFinancialSummary = {
  combinedAnnualIncomeMin: number | null;
  combinedAnnualIncomeMax: number | null;
  creditScoreMin: number | null;
  creditScoreMax: number | null;
  contributorCount: number;
  memberCount: number;
};

function validRange(minimum: number | null, maximum: number | null) {
  return minimum !== null && maximum !== null && minimum <= maximum;
}

export function summarizeAdvisorGroupFinances(
  profiles: AdvisorMemberFinancialValues[],
  memberCount: number,
): AdvisorGroupFinancialSummary {
  const contributors = profiles.filter((profile) =>
    validRange(profile.annualIncomeMin, profile.annualIncomeMax)
    && validRange(profile.creditScoreMin, profile.creditScoreMax));
  // A one-person "aggregate" would reveal that member's exact private range to
  // every roommate. Require at least two contributors before returning values.
  if (contributors.length < 2) {
    return {
      combinedAnnualIncomeMin: null,
      combinedAnnualIncomeMax: null,
      creditScoreMin: null,
      creditScoreMax: null,
      contributorCount: contributors.length,
      memberCount,
    };
  }

  return {
    combinedAnnualIncomeMin: contributors.reduce(
      (total, profile) => total + (profile.annualIncomeMin ?? 0),
      0,
    ),
    combinedAnnualIncomeMax: contributors.reduce(
      (total, profile) => total + (profile.annualIncomeMax ?? 0),
      0,
    ),
    creditScoreMin: Math.min(...contributors.map((profile) => profile.creditScoreMin ?? 850)),
    creditScoreMax: Math.max(...contributors.map((profile) => profile.creditScoreMax ?? 300)),
    contributorCount: contributors.length,
    memberCount,
  };
}
