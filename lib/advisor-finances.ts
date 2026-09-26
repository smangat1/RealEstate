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

export function summarizeAdvisorGroupFinances(
  _profiles: AdvisorMemberFinancialValues[],
  memberCount: number,
): AdvisorGroupFinancialSummary {
  // Never return a board-visible function of private member values. Exact sums,
  // extrema, and even contributor counts can be differenced across a member's
  // own updates or membership changes to recover someone else's ranges.
  return {
    combinedAnnualIncomeMin: null,
    combinedAnnualIncomeMax: null,
    creditScoreMin: null,
    creditScoreMax: null,
    contributorCount: 0,
    memberCount,
  };
}
