import { demoProperties, type DemoPropertyInput } from "@/lib/demo-properties";

type StarterMarket = {
  city: string;
  state: string;
  neighborhoods: string[];
  propertyBias: Array<"apartment" | "house" | "condo">;
  basePrice: number;
};

export type StarterListingSeed = {
  id?: string;
  source: "api";
  sourceName: string;
  sourceUrl?: string | null;
  city: string;
  state: string;
  neighborhood: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  propertyType: "apartment" | "house" | "condo";
  amenities: string[];
  description: string;
  images: string[];
  status: "active";
};

const MARKETS: StarterMarket[] = [
  {
    city: "Los Angeles",
    state: "CA",
    neighborhoods: ["Silver Lake", "Culver City", "Echo Park", "Koreatown", "Mid-City"],
    propertyBias: ["house", "apartment", "condo"],
    basePrice: 3650,
  },
  {
    city: "San Diego",
    state: "CA",
    neighborhoods: ["North Park", "Hillcrest", "Mission Valley", "University Heights", "Little Italy"],
    propertyBias: ["apartment", "condo", "house"],
    basePrice: 3150,
  },
  {
    city: "Phoenix",
    state: "AZ",
    neighborhoods: ["Downtown", "Roosevelt Row", "Arcadia", "Biltmore", "Midtown"],
    propertyBias: ["apartment", "house", "condo"],
    basePrice: 2100,
  },
  {
    city: "Scottsdale",
    state: "AZ",
    neighborhoods: ["Old Town", "McCormick Ranch", "South Scottsdale", "North Scottsdale", "Gainey Ranch"],
    propertyBias: ["condo", "apartment", "house"],
    basePrice: 2600,
  },
  {
    city: "Jersey City",
    state: "NJ",
    neighborhoods: ["Downtown", "Journal Square", "The Heights", "Newport", "Bergen-Lafayette"],
    propertyBias: ["apartment", "condo", "house"],
    basePrice: 2750,
  },
  {
    city: "Hoboken",
    state: "NJ",
    neighborhoods: ["Uptown", "Midtown", "Southwest", "Waterfront", "Northwest"],
    propertyBias: ["apartment", "condo", "house"],
    basePrice: 3050,
  },
  {
    city: "Denver",
    state: "CO",
    neighborhoods: ["RiNo", "Capitol Hill", "LoHi", "Cherry Creek", "Congress Park"],
    propertyBias: ["apartment", "house", "condo"],
    basePrice: 2450,
  },
];

const AMENITY_ROTATIONS = [
  ["laundry", "dishwasher", "air conditioning"],
  ["parking", "laundry", "pet friendly"],
  ["dishwasher", "gym", "elevator"],
  ["outdoor space", "parking", "laundry"],
  ["pet friendly", "dishwasher", "storage"],
];

function formatAddress(streetNumber: number, neighborhood: string, city: string) {
  const stem = neighborhood.replace(/\s+/g, " ");
  return `${streetNumber} ${stem} Ave, ${city}`;
}

function listingDescription(city: string, neighborhood: string, propertyType: string, bedrooms: number) {
  return `Starter dummy listing in ${neighborhood}, ${city}. This ${bedrooms}-bed ${propertyType} is here so the group board can browse realistic tradeoffs before a real listings API is wired in.`;
}

function normalizeImagePath(image: string) {
  const trimmed = image.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return `/demo-properties/${trimmed}`;
}

function mapDemoPropertyToSeed(property: DemoPropertyInput): StarterListingSeed {
  return {
    id: property.id,
    source: "api",
    sourceName: property.sourceName?.trim() || "demo_property",
    sourceUrl: property.sourceUrl?.trim() || null,
    city: property.city,
    state: property.state,
    neighborhood: property.neighborhood,
    address: property.address,
    price: property.price,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    squareFeet: property.squareFeet,
    propertyType: property.propertyType,
    amenities: property.amenities,
    description: property.description,
    images: property.images.map(normalizeImagePath).filter((value): value is string => Boolean(value)),
    status: "active",
  };
}

function buildGeneratedStarterListings(): StarterListingSeed[] {
  const listings: StarterListingSeed[] = [];

  for (const market of MARKETS) {
    market.neighborhoods.forEach((neighborhood, neighborhoodIndex) => {
      for (let variant = 0; variant < 4; variant += 1) {
        const propertyType = market.propertyBias[(neighborhoodIndex + variant) % market.propertyBias.length];
        const bedrooms = variant === 0 ? 1 : variant === 1 ? 2 : variant === 2 ? 3 : 4;
        const bathrooms = bedrooms >= 3 ? 2 : 1.5;
        const squareFeet = 650 + neighborhoodIndex * 55 + variant * 140;
        const price = market.basePrice + neighborhoodIndex * 150 + variant * 380 + (propertyType === "house" ? 520 : 0);

        listings.push({
          source: "api",
          sourceName: "starter_catalog",
          sourceUrl: null,
          city: market.city,
          state: market.state,
          neighborhood,
          address: formatAddress(110 + neighborhoodIndex * 14 + variant * 3, neighborhood, market.city),
          price,
          bedrooms,
          bathrooms,
          squareFeet,
          propertyType,
          amenities: AMENITY_ROTATIONS[(neighborhoodIndex + variant) % AMENITY_ROTATIONS.length] ?? ["laundry"],
          description: listingDescription(market.city, neighborhood, propertyType, bedrooms),
          images: [],
          status: "active",
        });
      }
    });
  }

  return listings;
}

export function buildStarterListings(): StarterListingSeed[] {
  return [...demoProperties.map(mapDemoPropertyToSeed), ...buildGeneratedStarterListings()];
}
