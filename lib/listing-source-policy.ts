export type ListingSourceTrustState =
  | "board_only"
  | "pending_review"
  | "community_supported"
  | "verified"
  | "review_hold"
  | "rejected";

export type ListingSourceTrustEvidence = {
  distinctBoardSubmissions: number;
  distinctAttestedUsers: number;
  distinctAttestedBoards: number;
  hasOpenConflict: boolean;
  resolverExact: boolean;
  adminVerified: boolean;
  adminRejected: boolean;
};

export function deriveListingSourceTrustStatus(
  evidence: ListingSourceTrustEvidence,
): ListingSourceTrustState {
  if (evidence.adminRejected) return "rejected";
  if (evidence.adminVerified) return "verified";
  if (evidence.hasOpenConflict) return "review_hold";
  if (evidence.resolverExact) return "verified";
  if (
    evidence.distinctAttestedUsers >= 5
    && evidence.distinctAttestedBoards >= 3
  ) {
    return "verified";
  }
  if (evidence.distinctBoardSubmissions >= 3) return "community_supported";
  if (
    evidence.distinctBoardSubmissions >= 2
    || evidence.distinctAttestedUsers > 0
  ) {
    return "pending_review";
  }
  return "board_only";
}

export function listingSourceTrustWarning(status: ListingSourceTrustState) {
  switch (status) {
    case "community_supported":
      return "Community-confirmed source. Not yet admin verified.";
    case "verified":
      return null;
    case "review_hold":
      return "This source is under review after a community report.";
    case "rejected":
      return "This source was rejected because it does not reliably identify this rental.";
    case "pending_review":
      return "This source is still being checked by the community.";
    case "board_only":
      return "This source is only visible to this board until it receives more confirmation.";
  }
}

export function sourceIsGloballyDiscoverable(status: ListingSourceTrustState) {
  return status === "community_supported" || status === "verified";
}
