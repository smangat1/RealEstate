import assert from "node:assert/strict";
import test from "node:test";

import {
  outreachConfirmation,
  preferenceResolutionConfirmation,
  replyLogConfirmation,
} from "../lib/advisor-confirmations";

test("reply confirmation claims cancellation only when this request suppressed a follow-up", () => {
  assert.deepEqual(replyLogConfirmation(0), {
    followUpCancelled: false,
    message: "Reply logged.",
  });
  assert.deepEqual(replyLogConfirmation(2), {
    followUpCancelled: true,
    message: "Reply logged. Follow-up cancelled.",
  });
});

test("preference confirmation reflects the persisted resolution", () => {
  assert.equal(preferenceResolutionConfirmation("accepted"), "Preference updated");
  assert.equal(preferenceResolutionConfirmation("rejected"), "No change made");
});

test("outreach confirmation never invents a follow-up date", () => {
  assert.equal(outreachConfirmation({ recorded: false }), null);
  assert.equal(outreachConfirmation({ recorded: true }), "Marked sent.");
  assert.equal(
    outreachConfirmation({ recorded: true, followUpScheduledFor: "Oct 5" }),
    "Marked sent. Follow-up scheduled for Oct 5",
  );
});
