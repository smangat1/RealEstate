import {
  summarizeAdvisorGroupFinances,
  type AdvisorGroupFinancialSummary,
} from "@/lib/advisor-finances";

type DisclosureProfile = {
  disclosureMode: string;
};

export type AdvisorApplicationFinancialDisclosure = {
  finances: AdvisorGroupFinancialSummary;
  statement: string | null;
};

export function applicationFinancialDisclosure(
  profiles: DisclosureProfile[],
  memberCount: number,
): AdvisorApplicationFinancialDisclosure {
  const hasConsentingApplicant = profiles.some((profile) =>
    profile.disclosureMode === "available_on_request" || profile.disclosureMode === "combined_range",
  );

  return {
    // Shareable packets never receive raw values, sums, extrema, or contributor
    // counts. This remains invariant when a member changes or removes a range.
    finances: summarizeAdvisorGroupFinances([], memberCount),
    statement: hasConsentingApplicant
      ? "Financial information is available on request from applicants who choose to provide it."
      : null,
  };
}
