export const ADVISOR_GHOST_WINDOW_MS = 3 * 24 * 60 * 60 * 1_000;
export const ADVISOR_LISTING_FRESHNESS_MS = 6 * 60 * 60 * 1_000;

export type WatchedListingState = {
  price: number | null;
  fees: string | null;
  availableDate: string | null;
  listingStatus: string;
  providerStatus: string | null;
};

export type DetectedListingChange = {
  kind: "price" | "fee" | "availability" | "status";
  field: string;
  beforeValue: string | number | null;
  afterValue: string | number | null;
  explanation: string;
  whyItMatters: string;
};

export type BoardCompListing = {
  id: string;
  label: string;
  price: number | null;
  bedrooms: number | null;
  neighborhood: string | null;
  city: string | null;
  listingStatus: string;
  userStatus: string;
};

export type BoardCompFlag = {
  boardListingId: string;
  label: string;
  comparableCount: number;
  averagePrice: number;
  difference: number;
  comparableIds: string[];
};

export type FollowUpFinancialDisclosure = "available_on_request" | "combined_range" | "omit";

export function followUpFinancialDisclosure(value: unknown): FollowUpFinancialDisclosure {
  return value === "omit" || value === "combined_range" ? value : "available_on_request";
}

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

export function listingObservationTime(input: {
  providerFetchedAt: string | null;
  providerLastSeenAt: string | null;
}) {
  const values = [input.providerFetchedAt, input.providerLastSeenAt]
    .flatMap((value) => value ? [new Date(value).getTime()] : [])
    .filter(Number.isFinite);
  return values.length > 0 ? new Date(Math.max(...values)) : null;
}

export function isFreshListingObservation(input: {
  current: { providerFetchedAt: string | null; providerLastSeenAt: string | null };
  previous: { providerFetchedAt: string | null; providerLastSeenAt: string | null } | null;
  now: Date;
  freshnessMs?: number;
}) {
  const currentAt = listingObservationTime(input.current);
  const previousAt = input.previous ? listingObservationTime(input.previous) : null;
  if (!currentAt) return false;
  const age = input.now.getTime() - currentAt.getTime();
  if (age < -5 * 60 * 1_000 || age > (input.freshnessMs ?? ADVISOR_LISTING_FRESHNESS_MS)) return false;
  return previousAt === null || currentAt > previousAt;
}

export function listingAvailabilityState(state: WatchedListingState): "available" | "unavailable" | "unknown" {
  const listingStatus = normalized(state.listingStatus);
  const providerStatus = normalized(state.providerStatus);
  if (["removed", "rented"].includes(listingStatus)
      || /off[ -]?market|unavailable|inactive|rented|removed|leased|not available/.test(providerStatus)) {
    return "unavailable";
  }
  if (listingStatus === "active" || /\bactive\b|\bavailable\b|for rent|listed/.test(providerStatus)) {
    return "available";
  }
  return "unknown";
}

export function isListingUnavailable(state: WatchedListingState) {
  return listingAvailabilityState(state) === "unavailable";
}

export function detectListingChanges(
  previous: WatchedListingState,
  current: WatchedListingState,
): DetectedListingChange[] {
  const changes: DetectedListingChange[] = [];
  if (previous.price !== current.price && previous.price !== null && current.price !== null) {
    const delta = current.price - previous.price;
    changes.push({
      kind: "price",
      field: "price",
      beforeValue: previous.price,
      afterValue: current.price,
      explanation: delta < 0
        ? `Rent dropped by $${Math.abs(delta).toLocaleString()}.`
        : `Rent increased by $${delta.toLocaleString()}.`,
      whyItMatters: delta < 0
        ? "The lower asking rent can improve affordability or create room to negotiate other terms."
        : "The group should confirm that the new rent still fits its budget before moving forward.",
    });
  }
  if (normalized(previous.fees) !== normalized(current.fees)) {
    changes.push({
      kind: "fee",
      field: "fees",
      beforeValue: previous.fees,
      afterValue: current.fees,
      explanation: "The listing's disclosed fees changed.",
      whyItMatters: "Fees can materially change the effective monthly and move-in cost.",
    });
  }
  if (previous.availableDate !== current.availableDate) {
    changes.push({
      kind: "availability",
      field: "availableDate",
      beforeValue: previous.availableDate,
      afterValue: current.availableDate,
      explanation: "The advertised availability date changed.",
      whyItMatters: "The new date may no longer line up with the group's move-in timing.",
    });
  }
  const previousAvailability = listingAvailabilityState(previous);
  const currentAvailability = listingAvailabilityState(current);
  if (previousAvailability !== currentAvailability
      && previousAvailability !== "unknown"
      && currentAvailability !== "unknown") {
    changes.push({
      kind: "status",
      field: "status",
      beforeValue: previous.providerStatus ?? previous.listingStatus,
      afterValue: current.providerStatus ?? current.listingStatus,
      explanation: isListingUnavailable(current)
        ? "The listing now appears to be off market or unavailable."
        : "The listing's advertised status changed.",
      whyItMatters: isListingUnavailable(current)
        ? "The group should pause outreach and verify availability before spending more time or money."
        : "A status change can affect whether the group should follow up or adjust its shortlist.",
    });
  }
  return changes;
}

export function findBoardCompFlags(listings: BoardCompListing[]): BoardCompFlag[] {
  const eligible = listings.filter((listing) =>
    listing.price !== null
    && listing.bedrooms !== null
    && !["removed", "rented"].includes(normalized(listing.listingStatus))
    && normalized(listing.userStatus) !== "rejected");

  return eligible.flatMap((target) => {
    const sameCityAndLayout = eligible.filter((candidate) =>
      candidate.id !== target.id
      && normalized(candidate.city) === normalized(target.city)
      && candidate.bedrooms !== null
      && target.bedrooms !== null
      && Math.abs(candidate.bedrooms - target.bedrooms) <= 0.25);
    const sameNeighborhood = sameCityAndLayout.filter((candidate) =>
      normalized(target.neighborhood).length > 0
      && normalized(candidate.neighborhood) === normalized(target.neighborhood));
    const comparables = sameNeighborhood.length >= 2 ? sameNeighborhood : sameCityAndLayout;
    if (comparables.length < 2 || target.price === null) return [];

    const averagePrice = Math.round(
      comparables.reduce((total, listing) => total + (listing.price ?? 0), 0) / comparables.length,
    );
    const difference = target.price - averagePrice;
    const minimumMeaningfulGap = Math.max(100, Math.round(averagePrice * 0.03));
    if (difference < minimumMeaningfulGap) return [];
    return [{
      boardListingId: target.id,
      label: target.label,
      comparableCount: comparables.length,
      averagePrice,
      difference,
      comparableIds: comparables.map((listing) => listing.id).sort(),
    }];
  });
}

export function isGhostedOutreach(input: {
  status: string;
  sentAt: Date | null;
  contactedAt: Date | null;
  answeredAt: Date | null;
  lastFollowUpAt: Date | null;
}, now = new Date()) {
  return input.status === "sent"
    && input.answeredAt === null
    && input.lastFollowUpAt === null
    && input.sentAt !== null
    && input.sentAt.getTime() <= now.getTime() - ADVISOR_GHOST_WINDOW_MS;
}
