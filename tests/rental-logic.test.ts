import assert from "node:assert/strict";
import test from "node:test";

import { ApiListingProvider, ManualListingProvider } from "../lib/listing-providers";
import { createBlankProfile, getProfileCompletion } from "../lib/rental-logic";

test("profile completion reports every unresolved onboarding field", () => {
  const profile = createBlankProfile("board-test");
  const completion = getProfileCompletion(profile);

  assert.deepEqual(completion.completedFields, []);
  assert.ok(completion.missingFields.includes("name"));
  assert.ok(completion.missingFields.includes("city"));
  assert.ok(completion.missingFields.includes("commute or neighborhood"));
  assert.equal(completion.percentComplete, 0);
});

test("a complete rental brief reaches 100 percent", () => {
  const profile = {
    ...createBlankProfile("board-test"),
    name: "Sam",
    city: "New York",
    locations: ["New York"],
    moveInDate: "August",
    budgetMax: 5000,
    commuteTarget: "Midtown",
    minCommuteMinutes: 5,
    maxCommuteMinutes: 45,
    mustHaves: ["laundry"],
    dealbreakers: ["broker fee"],
    priorities: ["commute", "price"],
  };

  const completion = getProfileCompletion(profile);
  assert.equal(completion.percentComplete, 100);
  assert.deepEqual(completion.missingFields, []);
});

test("neighborhood preferences satisfy the commute-or-neighborhood requirement", () => {
  const profile = { ...createBlankProfile("board-test"), neighborhoods: ["Astoria"] };
  assert.equal(getProfileCompletion(profile).missingFields.includes("commute or neighborhood"), false);
});

test("providers never fabricate remote inventory", async () => {
  const profile = createBlankProfile("board-test");
  assert.deepEqual(await new ManualListingProvider().searchListings(profile), []);
  const api = new ApiListingProvider();
  if (!api.isConfigured) assert.deepEqual(await api.searchListings(profile), []);
});
