import assert from "node:assert/strict";
import test from "node:test";

import type { RentCastRentalListing } from "@/lib/rentcast-client";
import {
  assertSafeRentCastRefreshBatch,
  validateRentCastListing,
  validateRentCastRefreshBatch,
} from "@/lib/rentcast-import";

const now = new Date("2026-07-26T12:00:00.000Z");

function rental(
  id: string,
  overrides: Partial<RentCastRentalListing> = {},
): RentCastRentalListing {
  return {
    id,
    formattedAddress: `123 Main St Apt ${id}, New York, NY 10001`,
    addressLine1: "123 Main St",
    addressLine2: `Apt ${id}`,
    city: "New York",
    state: "NY",
    zipCode: "10001",
    latitude: 40.75,
    longitude: -73.99,
    propertyType: "Apartment",
    bedrooms: 2,
    bathrooms: 1,
    squareFootage: 900,
    status: "Active",
    price: 4_200,
    lastSeenDate: "2026-07-25T12:00:00.000Z",
    ...overrides,
  };
}

test("apartments require a unit while houses may omit one", () => {
  const apartment = validateRentCastListing(
    rental("apartment", {
      addressLine2: null,
      formattedAddress: "123 Main St, New York, NY 10001",
    }),
    now,
  );
  assert.equal(apartment.value, null);
  assert.ok(apartment.reasons.includes("missing_unit"));

  const house = validateRentCastListing(
    rental("house", {
      propertyType: "Single Family",
      addressLine2: null,
      formattedAddress: "123 Main St, New York, NY 10001",
    }),
    now,
  );
  assert.ok(house.value);
  assert.equal(house.value?.unit, null);
});

test("stale, inactive, and non-NYC candidates fail validation", () => {
  const validation = validateRentCastListing(
    rental("bad", {
      city: "Jersey City",
      state: "NJ",
      status: "Inactive",
      lastSeenDate: "2026-06-01T12:00:00.000Z",
    }),
    now,
  );

  assert.equal(validation.value, null);
  assert.ok(validation.reasons.includes("wrong_location"));
  assert.ok(validation.reasons.includes("inactive"));
  assert.ok(validation.reasons.includes("stale"));
});

test("duplicate provider IDs and duplicate address-unit identities are rejected", () => {
  const result = validateRentCastRefreshBatch(
    [
      rental("one"),
      rental("one"),
      rental("two", { addressLine2: "Apt one" }),
    ],
    now,
  );

  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejectedByReason.duplicate_provider_id, 1);
  assert.equal(result.rejectedByReason.duplicate_address_unit, 2);
});

test("refresh safety gates require 500 received and 450 accepted", () => {
  const tooSmall = Array.from({ length: 499 }, (_, index) =>
    rental(String(index)),
  );
  const smallValidation = validateRentCastRefreshBatch(tooSmall, now);
  assert.throws(
    () => assertSafeRentCastRefreshBatch(tooSmall, smallValidation),
    /received 499/i,
  );

  const lowQuality = Array.from({ length: 500 }, (_, index) =>
    rental(String(index), index < 449 ? {} : { status: "Inactive" }),
  );
  const lowQualityValidation = validateRentCastRefreshBatch(lowQuality, now);
  assert.equal(lowQualityValidation.accepted.length, 449);
  assert.throws(
    () => assertSafeRentCastRefreshBatch(lowQuality, lowQualityValidation),
    /only 449/i,
  );
});
