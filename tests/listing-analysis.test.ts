import assert from "node:assert/strict";
import test from "node:test";

import { analyzeListingForGroup } from "@/lib/listing-analysis";
import type { ListingRecord, RoommateRecord } from "@/lib/types";

const now = "2026-07-24T12:00:00.000Z";

function member(overrides: Partial<RoommateRecord>): RoommateRecord {
  return {
    id: "member",
    boardId: "board",
    linkedUserId: null,
    name: "Member",
    roleLabel: "roommate",
    budgetMin: 1_200,
    idealBudget: 1_500,
    budgetMax: 1_750,
    stretchBudget: null,
    commuteDestination: "Midtown",
    preferredCommuteMinutes: 30,
    maxCommuteMinutes: 45,
    commutePriority: "high",
    neighborhoodPriority: "medium",
    spacePriority: "medium",
    privacyPriority: "medium",
    preferredNeighborhoods: ["Astoria"],
    mustHaves: ["laundry"],
    dealbreakers: ["private room"],
    petsRequired: false,
    accessibilityNeeds: [],
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function listing(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: "listing",
    source: "api",
    sourceName: "RentCast",
    sourceUrl: null,
    externalId: "rentcast-1",
    address: "30-10 31st Ave",
    unit: "2A",
    city: "New York",
    state: "NY",
    zip: "11102",
    neighborhood: "Astoria",
    latitude: 40.766,
    longitude: -73.922,
    price: 3_100,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 900,
    availableDate: "2026-08-01",
    propertyType: "apartment",
    amenities: ["laundry", "pet friendly"],
    fees: {},
    description: "Two-bedroom apartment.",
    images: [],
    providerData: {},
    providerStatus: "active",
    providerListedAt: now,
    providerLastSeenAt: now,
    providerFetchedAt: now,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("balanced listings explain each roommate fit and retain high confidence", () => {
  const members = [
    member({ id: "sam", name: "Sam" }),
    member({ id: "maya", name: "Maya", idealBudget: 1_600, budgetMax: 1_850 }),
  ];
  const analysis = analyzeListingForGroup({
    listing: listing(),
    members,
    routes: [
      { originLabel: "Sam", durationMinutes: 28, distanceMiles: 6.2 },
      { originLabel: "Maya", durationMinutes: 34, distanceMiles: 7.1 },
    ],
    sourceConfirmed: true,
    latestVerification: "active",
  });

  assert.equal(analysis.members.length, 2);
  assert.equal(analysis.hardFailureCount, 0);
  assert.equal(analysis.confidence, "high");
  assert.ok(analysis.members.every((entry) => entry.explanation.length > 0));
});

test("every commute inside the chosen range receives the same score", () => {
  const scoreAt = (durationMinutes: number) => analyzeListingForGroup({
    listing: listing(),
    members: [member({ preferredCommuteMinutes: 10, maxCommuteMinutes: 35 })],
    routes: [{ originLabel: "Member", durationMinutes, distanceMiles: 5 }],
    sourceConfirmed: true,
    latestVerification: "active",
  }).members[0]?.dimensions.commute.score;

  assert.equal(scoreAt(10), 100);
  assert.equal(scoreAt(22), 100);
  assert.equal(scoreAt(35), 100);
  assert.ok((scoreAt(5) ?? 100) < 100);
  assert.ok((scoreAt(45) ?? 100) < 100);
});

test("one roommate's hard budget failure prevents a misleading group recommendation", () => {
  const analysis = analyzeListingForGroup({
    listing: listing({ price: 5_000 }),
    members: [
      member({ id: "sam", name: "Sam", idealBudget: 1_400, budgetMax: 1_550 }),
      member({ id: "maya", name: "Maya", idealBudget: 2_500, budgetMax: 3_000 }),
    ],
    routes: [
      { originLabel: "Sam", durationMinutes: 25, distanceMiles: 5 },
      { originLabel: "Maya", durationMinutes: 25, distanceMiles: 5 },
    ],
    sourceConfirmed: true,
    latestVerification: "active",
  });

  assert.ok(analysis.hardFailureCount > 0);
  assert.match(analysis.verdict, /hard constraint/i);
  assert.ok(analysis.members.find((entry) => entry.name === "Sam")?.hardFailures.length);
});
