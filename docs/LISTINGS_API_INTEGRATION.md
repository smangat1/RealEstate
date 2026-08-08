# Wiring a Real Listings API into Homeboard

Homeboard must consume a licensed listings feed through the Next.js backend. The iOS app must never call a listings vendor directly, and vendor credentials must never be placed in Swift, `Info.plist`, or a `NEXT_PUBLIC_*` environment variable.

The existing integration seam is `lib/listing-providers.ts`. Every vendor response should be converted to the existing `NormalizedListing` shape before it reaches the database or mobile UI.

## 1. Confirm the vendor contract

Before writing the adapter, record:

- The rental-search endpoint and authentication method.
- Whether the license permits storing listing fields and images.
- Refresh, attribution, and removal requirements.
- Result limits, pagination, rate limits, and supported geographic filters.
- Stable property/listing identifiers and whether IDs can be reused.
- Whether changed and removed listings are available through webhooks or an incremental feed.

Do not integrate a feed whose terms prohibit the product from displaying or persisting the data Homeboard needs.

## 2. Add server-only configuration

Add these values to the deployed Next.js environment and local `.env.local`:

```bash
LISTING_PROVIDER_NAME=vendor-name
LISTING_PROVIDER_BASE_URL=https://api.vendor.example
LISTING_PROVIDER_API_KEY=replace-me
```

Add the variable names, with blank values, to `.env.example`. Do not prefix the key with `NEXT_PUBLIC_`. Restart the Next.js server after changing local environment variables.

## 3. Add the vendor adapter

Create `lib/listing-providers/vendor-listing-provider.ts` and implement the existing `ListingProvider` interface from `lib/listing-providers.ts`.

```ts
import type {
  ListingProvider,
  NormalizedListing,
} from "@/lib/listing-providers";
import type { SearchProfileData } from "@/lib/types";

export class VendorListingProvider implements ListingProvider {
  readonly name = "vendor-name";
  readonly isConfigured = Boolean(
    process.env.LISTING_PROVIDER_BASE_URL &&
      process.env.LISTING_PROVIDER_API_KEY,
  );

  async searchListings(
    criteria: SearchProfileData,
  ): Promise<NormalizedListing[]> {
    if (!this.isConfigured) return [];

    const url = new URL(
      "/rentals/search",
      process.env.LISTING_PROVIDER_BASE_URL,
    );
    if (criteria.locations[0]) {
      url.searchParams.set("location", criteria.locations[0]);
    }
    if (criteria.budgetMax) {
      url.searchParams.set("max_price", String(criteria.budgetMax));
    }
    if (criteria.bedroomsPreferred !== null) {
      url.searchParams.set(
        "bedrooms",
        String(criteria.bedroomsPreferred),
      );
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.LISTING_PROVIDER_API_KEY}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Listing provider returned ${response.status}.`);
    }

    const payload: VendorSearchResponse = await response.json();
    return payload.results.map(normalizeVendorListing);
  }
}
```

Keep the vendor response types private to this adapter. The normalization function must supply:

- `source: "api"`
- `sourceName`: the stable vendor name
- `externalId`: the vendor's stable listing ID
- Address, city, state, ZIP, neighborhood, latitude, and longitude
- Price, bedrooms, bathrooms, square feet, available date, and property type
- Amenities, fees, description, image URLs, source URL, and status

Unknown values must be `null`, an empty array, or an empty object as required by `NormalizedListing`. Never invent missing listing details.

## 4. Make provider records idempotent

Before live ingestion, update `prisma/schema.prisma` so one vendor listing cannot be inserted repeatedly:

```prisma
model Listing {
  // existing fields
  lastSeenAt DateTime?

  @@unique([sourceName, externalId])
}
```

Then run:

```bash
npx prisma migrate dev --name add_listing_provider_identity
npx prisma generate
```

The ingestion service should `upsert` by `sourceName_externalId`. If the price changed, also create a `PriceHistory` row with `source: api`. Update `lastSeenAt` on every observation. Only mark a listing `removed` after the provider explicitly reports removal or after the vendor's documented expiration window.

## 5. Add a provider ingestion service

Create `lib/listing-sync.ts` with two responsibilities:

1. Call the configured `ListingProvider` with a board's `SearchProfileData`.
2. Upsert each `NormalizedListing` and return the stored records.

Keep provider calls, database writes, deduplication, price history, and stale-listing rules in this service. Do not put vendor-specific mapping inside route handlers or Swift.

Update `getListingProviders()` in `lib/listing-providers.ts` to return the real vendor adapter instead of the placeholder `ApiListingProvider`.

## 6. Expose authenticated search to the iOS app

Add:

```text
GET /api/mobile/boards/:id/listings/search
```

The route should:

1. Authenticate with `requireMobileAppUser(request)`.
2. Confirm the user belongs to the requested board.
3. Load that board's structured search profile.
4. Validate optional map bounds, pagination, and filter query parameters with Zod.
5. Call `listing-sync.ts`.
6. Return normalized mobile listing payloads plus `nextCursor` and `isSaved`.

Suggested listings should remain catalog records until a user saves one. Saving should create a `BoardListing` relation to the existing `Listing` instead of duplicating the listing row.

Add a second accepted input to the existing POST route at `app/api/mobile/boards/[id]/listings/route.ts`:

```json
{ "listingId": "stored-api-listing-id" }
```

That path should validate the listing exists and create the board relation idempotently.

## 7. Connect the native client

In `ios/HomeboardNative/HomeboardNative/Sources/HomeboardAPI.swift`:

1. Add a decodable search response containing `listings` and `nextCursor`.
2. Add `searchListings(accessToken:boardId:filters:bounds:cursor:)`.
3. Add `saveListing(accessToken:boardId:listingId:)`.

In `AppModel.swift`:

1. Store API search results separately from `board.shortlist`.
2. Refresh results when the user submits filters or finishes drawing a map area.
3. Debounce map-bound requests and cancel superseded tasks.
4. Merge saved status into results without duplicating records.
5. Keep the existing manual-listing flow as a fallback.

In `SharedWorkspaceView.swift`, render API suggestions with the existing alternate suggestion color. A saved result should switch to the normal shortlist treatment immediately after the board relation is created.

## 8. Protect reliability and cost

- Cache identical provider searches briefly on the server.
- Cap the number of results and implement cursor pagination.
- Add request timeouts and convert provider failures into a nonfatal empty/error state.
- Log provider latency, status codes, result counts, and normalization failures without logging the secret key.
- Rate-limit the mobile search endpoint per user and board.
- Never fetch on every map camera frame; search only after an explicit user action or a debounced settled region.

## 9. Test before enabling production data

Add fixture-based tests that verify:

- A complete vendor listing maps to every normalized field.
- Missing optional fields do not crash normalization.
- Duplicate external IDs update one database row.
- Price changes append `PriceHistory` once.
- Removed listings leave existing board notes, votes, and ratings intact.
- Unauthorized users cannot search or save into a board.
- The API key never appears in a mobile response or built iOS bundle.

Run:

```bash
npm run test
npm run typecheck
npm run build
npm run prisma:validate
npm run ios:test
```

Finally test the whole user flow: search with filters, draw an area, open a result, inspect commute routes, save it, rate it, and confirm another member sees the same saved listing.

## 10. Roll out safely

Keep the provider behind a server-side flag such as `ENABLE_LISTING_PROVIDER=false`. Enable it first in a staging environment with a low result cap. After data, attribution, deduplication, price history, removal behavior, and rate limits are verified, enable it for the beta cohort.
