import assert from "node:assert/strict";
import test from "node:test";

import { applicationFinancialDisclosure } from "../lib/advisor-application-finances";
import {
  buildPreferenceProposal,
  preferenceProposalResolution,
  preferenceUpdateFromChanges,
} from "../lib/advisor-preference-proposals";
import { parsePreferenceTalk } from "../lib/preference-talk";

test("application packets honor omit without exposing amounts or contributor counts", () => {
  const omittedOnly = applicationFinancialDisclosure([{ disclosureMode: "omit" }], 2);
  assert.equal(omittedOnly.statement, null);
  assert.deepEqual(omittedOnly.finances, {
    combinedAnnualIncomeMin: null,
    combinedAnnualIncomeMax: null,
    creditScoreMin: null,
    creditScoreMax: null,
    contributorCount: 0,
    memberCount: 2,
  });

  const mixed = applicationFinancialDisclosure([
    { disclosureMode: "omit", annualIncomeMin: 91_234, creditScoreMin: 743 } as { disclosureMode: string },
    { disclosureMode: "available_on_request", annualIncomeMin: 52_345, creditScoreMin: 681 } as { disclosureMode: string },
  ], 2);
  assert.match(mixed.statement ?? "", /applicants who choose to provide it/i);
  assert.doesNotMatch(JSON.stringify(mixed), /91234|52345|743|681/);
  assert.equal(mixed.finances.contributorCount, 0);
});

const preferenceProfile = {
  commutePriority: "medium",
  neighborhoodPriority: "medium",
  spacePriority: "medium",
  privacyPriority: "medium",
  mustHaves: JSON.stringify(["Gym", "Dishwasher"]),
  preferenceSignals: {},
};

test("clear preference talk stages an exact before/after proposal without mutating the profile", () => {
  const signals = parsePreferenceTalk("idgaf about the gym, but commute is a high priority");
  const changes = buildPreferenceProposal(preferenceProfile, signals);
  assert.deepEqual(changes.find((change) => change.field === "commutePriority"), {
    field: "commutePriority",
    label: "Commute priority",
    oldValue: "medium",
    newValue: "high",
  });
  assert.deepEqual(changes.find((change) => change.field === "mustHaves"), {
    field: "mustHaves",
    label: "Must-haves",
    oldValue: ["Gym", "Dishwasher"],
    newValue: ["Dishwasher"],
  });
  assert.equal(preferenceProfile.mustHaves, JSON.stringify(["Gym", "Dishwasher"]));

  const update = preferenceUpdateFromChanges(preferenceProfile, changes);
  assert.equal(update.commutePriority, "high");
  assert.equal(update.mustHaves, JSON.stringify(["Dishwasher"]));
});

test("ambiguous chat creates no preference proposal", () => {
  const signals = parsePreferenceTalk("That apartment has a gym near the train.");
  assert.deepEqual(signals, []);
  assert.deepEqual(buildPreferenceProposal(preferenceProfile, signals), []);
});

test("preference confirmation accepts current proposals, while rejection and stale proposals never apply", () => {
  assert.equal(preferenceProposalResolution({
    status: "pending",
    action: "accept",
    baseVersion: 10,
    currentVersion: 10,
  }), "accepted");
  assert.equal(preferenceProposalResolution({
    status: "pending",
    action: "reject",
    baseVersion: 10,
    currentVersion: 10,
  }), "rejected");
  assert.equal(preferenceProposalResolution({
    status: "pending",
    action: "accept",
    baseVersion: 10,
    currentVersion: 11,
  }), "stale");
  assert.equal(preferenceProposalResolution({
    status: "accepted",
    action: "accept",
    baseVersion: 10,
    currentVersion: 10,
  }), "resolved");
});
