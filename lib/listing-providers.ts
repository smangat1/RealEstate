import type { ListingRecord, SearchProfileData } from "@/lib/types";

export type NormalizedListing = Omit<ListingRecord, "id" | "createdAt" | "updatedAt"> & {
  externalId: string;
};

export interface ListingProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  searchListings(criteria: SearchProfileData): Promise<NormalizedListing[]>;
}

export class ManualListingProvider implements ListingProvider {
  readonly name = "manual";
  readonly isConfigured = true;

  async searchListings(_criteria: SearchProfileData): Promise<NormalizedListing[]> {
    // Manual listings enter through the board API; this provider intentionally has no remote catalog.
    return [];
  }
}

export class ApiListingProvider implements ListingProvider {
  readonly name = process.env.LISTING_PROVIDER_NAME?.trim() || "rentcast";
  readonly isConfigured = Boolean(
    process.env.RENTCAST_API_KEY?.trim() || process.env.LISTING_PROVIDER_API_KEY?.trim(),
  );

  async searchListings(_criteria: SearchProfileData): Promise<NormalizedListing[]> {
    // User searches are always served from Homeboard's stored catalog. Remote
    // inventory is imported separately through the quota-guarded operator path.
    return [];
  }
}

export function getListingProviders(): ListingProvider[] {
  return [new ManualListingProvider(), new ApiListingProvider()];
}
