import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeneratedListingSearches,
  canonicalizeListingUrl,
  detectListingProvider,
  evaluateExactListingMatch,
  keepExactListingCandidates,
  previewListingImport,
} from "@/lib/listing-sources";

test("canonical URLs remove tracking and deduplicate equivalent listing links", () => {
  const first = canonicalizeListingUrl(
    "http://www.zillow.com/homedetails/123-main/123_zpid/?utm_source=text&b=2&a=1#photos",
  );
  const second = canonicalizeListingUrl(
    "https://zillow.com/homedetails/123-main/123_zpid?a=1&b=2",
  );

  assert.equal(first, second);
  assert.equal(
    first,
    "https://zillow.com/homedetails/123-main/123_zpid?a=1&b=2",
  );
});

test("non-web listing protocols are rejected", () => {
  assert.throws(
    () => canonicalizeListingUrl("javascript:alert(1)"),
    /http or https/i,
  );
});

test("external listing previews identify the provider without fetching the page", () => {
  const preview = previewListingImport({
    url: "https://www.zillow.com/homedetails/123-Main-St-Apt-4B-New-York-NY-10001/123_zpid/",
    price: 4_800,
    bedrooms: 3,
    bathrooms: 2,
  });

  assert.equal(preview.provider, "Zillow");
  assert.equal(preview.suggestedAddress, "123 Main ST");
  assert.equal(preview.suggestedUnit, "4B");
  assert.deepEqual(preview.missingEssentialFields, []);
  assert.match(preview.notice, /exact source/i);
});

test("listing import reports every essential fact the user still needs to confirm", () => {
  const preview = previewListingImport({
    url: "https://streeteasy.com/building/example",
  });

  assert.equal(preview.provider, "StreetEasy");
  assert.deepEqual(preview.missingEssentialFields, [
    "address",
    "rent",
    "bedrooms",
    "bathrooms",
  ]);
});

test("generated building-level searches are never exposed as listing links", () => {
  const searches = buildGeneratedListingSearches({
    address: "123 Main St",
    city: "New York",
    state: "NY",
    zip: "10001",
  });

  assert.deepEqual(searches, []);
});

test("generic Zillow, StreetEasy, and web-search URLs are never accepted as sources", () => {
  const genericUrls = [
    "https://www.zillow.com/new-york-ny/rentals/",
    "https://streeteasy.com/for-rent/nyc",
    "https://www.google.com/search?q=123+Main+Street+apartment",
  ];

  for (const url of genericUrls) {
    assert.throws(
      () => previewListingImport({
        url,
        address: "123 Main St",
        unit: "4B",
        price: 4_800,
        bedrooms: 2,
        bathrooms: 1,
      }),
      /exact rental unit/i,
    );
  }
});

test("same building with a different apartment is rejected", () => {
  const match = evaluateExactListingMatch(
    {
      address: "45 Wall St, Apt 1211, New York, NY 10005",
      price: 4_680,
      bedrooms: 1,
      bathrooms: 1,
    },
    {
      address: "45 Wall Street, Unit 1218, New York, NY 10005",
      price: 4_680,
      bedrooms: 1,
      bathrooms: 1,
    },
  );

  assert.equal(match.status, "mismatch");
  assert.match(match.reasons.join(" "), /unit/i);
});

test("building matches with no unit stay hidden as ambiguous", () => {
  const match = evaluateExactListingMatch(
    {
      address: "10 Hanover Sq, Apt 2A, New York, NY 10005",
      price: 6_152,
      bedrooms: 2,
      bathrooms: 2,
    },
    {
      address: "10 Hanover Square, New York, NY 10005",
      price: 6_152,
      bedrooms: 2,
      bathrooms: 2,
    },
  );

  assert.equal(match.status, "ambiguous");
  assert.match(match.reasons.join(" "), /unit/i);
});

test("only candidates matching address, unit, rent, beds, and baths survive", () => {
  const exact = {
    url: "https://www.zillow.com/homedetails/333-E-49th-St-APT-3NN-New-York-NY-10017/123_zpid/",
    address: "333 E 49th Street",
    unit: "3NN",
    price: 4_900,
    bedrooms: 1,
    bathrooms: 1,
  };
  const candidates = keepExactListingCandidates(
    {
      address: "333 E 49th St, Unit 3NN, New York, NY 10017",
      price: 4_900,
      bedrooms: 1,
      bathrooms: 1,
    },
    [
      exact,
      { ...exact, url: "https://streeteasy.com/building/333-east-49-street/4nn", unit: "4NN" },
      { ...exact, url: "https://example.com/wrong-rent", price: 5_100 },
    ],
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].url, exact.url);
  assert.equal(candidates[0].provider, "Zillow");
});
