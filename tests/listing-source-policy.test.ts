import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveListingSourceTrustStatus,
  listingSourceTrustWarning,
  sourceIsGloballyDiscoverable,
} from "@/lib/listing-source-policy";

function evidence(
  overrides: Partial<Parameters<typeof deriveListingSourceTrustStatus>[0]> = {},
) {
  return {
    distinctBoardSubmissions: 1,
    distinctAttestedUsers: 0,
    distinctAttestedBoards: 0,
    hasOpenConflict: false,
    resolverExact: false,
    adminVerified: false,
    adminRejected: false,
    ...overrides,
  };
}

test("a pasted source stays board-only until independent boards support it", () => {
  assert.equal(deriveListingSourceTrustStatus(evidence()), "board_only");
  assert.equal(
    deriveListingSourceTrustStatus(
      evidence({ distinctBoardSubmissions: 2 }),
    ),
    "pending_review",
  );
  assert.equal(
    deriveListingSourceTrustStatus(
      evidence({ distinctBoardSubmissions: 3 }),
    ),
    "community_supported",
  );
});

test("verification requires five distinct users across at least three boards", () => {
  assert.equal(
    deriveListingSourceTrustStatus(
      evidence({
        distinctBoardSubmissions: 3,
        distinctAttestedUsers: 5,
        distinctAttestedBoards: 2,
      }),
    ),
    "community_supported",
  );
  assert.equal(
    deriveListingSourceTrustStatus(
      evidence({
        distinctBoardSubmissions: 3,
        distinctAttestedUsers: 5,
        distinctAttestedBoards: 3,
      }),
    ),
    "verified",
  );
});

test("one credible conflict report immediately places a source on review hold", () => {
  const status = deriveListingSourceTrustStatus(
    evidence({
      distinctBoardSubmissions: 4,
      distinctAttestedUsers: 6,
      distinctAttestedBoards: 4,
      hasOpenConflict: true,
    }),
  );
  assert.equal(status, "review_hold");
  assert.equal(sourceIsGloballyDiscoverable(status), false);
  assert.match(listingSourceTrustWarning(status) ?? "", /under review/i);
});

test("only community-supported and verified sources are globally discoverable", () => {
  assert.equal(sourceIsGloballyDiscoverable("board_only"), false);
  assert.equal(sourceIsGloballyDiscoverable("pending_review"), false);
  assert.equal(sourceIsGloballyDiscoverable("community_supported"), true);
  assert.equal(sourceIsGloballyDiscoverable("verified"), true);
  assert.equal(sourceIsGloballyDiscoverable("review_hold"), false);
  assert.equal(sourceIsGloballyDiscoverable("rejected"), false);
});
