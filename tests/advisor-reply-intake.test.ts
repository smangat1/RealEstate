import assert from "node:assert/strict";
import test from "node:test";

import {
  replyConfirmationFingerprint,
  selectReplyOutreach,
} from "../lib/advisor-reply-intake";

const candidates = [
  { id: "outreach-a", boardListingId: "listing-a" },
  { id: "outreach-b", boardListingId: "listing-b" },
];

test("reply intake accepts only an outreach belonging to the selected listing", () => {
  assert.deepEqual(selectReplyOutreach(candidates, "listing-a", "outreach-a"), {
    ok: true,
    outreach: candidates[0],
  });
  assert.deepEqual(selectReplyOutreach(candidates, "listing-a", "outreach-b"), {
    ok: false,
    reason: "mismatch",
  });
  assert.deepEqual(selectReplyOutreach(candidates, "listing-a", "missing"), {
    ok: false,
    reason: "mismatch",
  });
});

test("legacy listing-only intake fails closed when the outreach thread is ambiguous", () => {
  const sameListing = [
    { id: "old", boardListingId: "listing-a" },
    { id: "new", boardListingId: "listing-a" },
  ];
  assert.deepEqual(selectReplyOutreach(sameListing, "listing-a"), {
    ok: false,
    reason: "ambiguous",
  });
  assert.deepEqual(selectReplyOutreach([sameListing[0]!], "listing-a"), {
    ok: true,
    outreach: sameListing[0],
  });
});

test("one confirmation token produces one reply identity even across retries", () => {
  const first = replyConfirmationFingerprint({
    boardId: "board-a",
    outreachId: "outreach-a",
    confirmationId: "d9085635-2376-48bd-933d-a94ce6801777",
    text: "Saturday works.",
  });
  const editedRetry = replyConfirmationFingerprint({
    boardId: "board-a",
    outreachId: "outreach-a",
    confirmationId: "d9085635-2376-48bd-933d-a94ce6801777",
    text: "Saturday morning works.",
  });
  const separateConfirmation = replyConfirmationFingerprint({
    boardId: "board-a",
    outreachId: "outreach-a",
    confirmationId: "4b6a3a6f-ed6d-4349-b78f-2ad223c003a6",
    text: "Saturday morning works.",
  });
  assert.equal(first, editedRetry);
  assert.notEqual(first, separateConfirmation);
  assert.notEqual(first, replyConfirmationFingerprint({
    boardId: "board-b",
    outreachId: "outreach-a",
    confirmationId: "d9085635-2376-48bd-933d-a94ce6801777",
    text: "Saturday works.",
  }));
});
