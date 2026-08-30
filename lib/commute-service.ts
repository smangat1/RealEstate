import "server-only";

type Coordinates = [number, number];

export type CommuteServiceMode = "demo" | "live" | "disabled";

export type CommuteEstimate = {
  listingId: string;
  bestDurationMinutes: number | null;
  bestDistanceMiles: number | null;
  bestOriginLabel: string | null;
  evaluatedAnchors: string[];
  routes: Array<{
    originLabel: string;
    durationMinutes: number | null;
    distanceMiles: number | null;
  }>;
};

type Anchor = {
  label: string;
  query: string;
};

const geocodeCache = new Map<string, Coordinates | null>();
const COMMUTE_REQUEST_TIMEOUT_MS = 2_500;

function emptyEstimate(listingId: string, anchorLabels: string[] = []): CommuteEstimate {
  return {
    listingId,
    bestDurationMinutes: null,
    bestDistanceMiles: null,
    bestOriginLabel: null,
    evaluatedAnchors: anchorLabels,
    routes: anchorLabels.map((originLabel) => ({
      originLabel,
      durationMinutes: null,
      distanceMiles: null,
    })),
  };
}

function getOpenRouteServiceApiKey() {
  return process.env.OPENROUTESERVICE_API_KEY?.trim() || null;
}

export function getCommuteServiceMode(isDemoMode: boolean): CommuteServiceMode {
  if (isDemoMode) return "demo";
  return getOpenRouteServiceApiKey() ? "live" : "disabled";
}

async function geocode(query: string): Promise<Coordinates | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  if (geocodeCache.has(normalized)) return geocodeCache.get(normalized) ?? null;

  const apiKey = getOpenRouteServiceApiKey();
  if (!apiKey) {
    geocodeCache.set(normalized, null);
    return null;
  }

  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("size", "1");
  url.searchParams.set("text", query);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "homeboard-mvp/0.1",
      },
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(COMMUTE_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    geocodeCache.set(normalized, null);
    return null;
  }

  const data = (await response.json()) as {
    features?: Array<{ geometry?: { coordinates?: number[] } }>;
  };

  const coords = data.features?.[0]?.geometry?.coordinates;
  const parsed =
    Array.isArray(coords) && coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])
      ? ([coords[0], coords[1]] as Coordinates)
      : null;

  geocodeCache.set(normalized, parsed);
  return parsed;
}

async function matrixDurations(
  anchors: Array<{ label: string; coords: Coordinates }>,
  destinations: Array<{ listingId: string; coords: Coordinates }>,
): Promise<CommuteEstimate[]> {
  const apiKey = getOpenRouteServiceApiKey();
  if (!apiKey || anchors.length === 0 || destinations.length === 0) {
    return destinations.map((destination) =>
      emptyEstimate(destination.listingId, anchors.map((anchor) => anchor.label)),
    );
  }

  const locations = [...anchors.map((anchor) => anchor.coords), ...destinations.map((destination) => destination.coords)];
  const sources = anchors.map((_, index) => index);
  const destinationsIndexes = destinations.map((_, index) => anchors.length + index);

  let response: Response;
  try {
    response = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locations,
        sources,
        destinations: destinationsIndexes,
        metrics: ["distance", "duration"],
        units: "mi",
      }),
      next: { revalidate: 60 * 10 },
      signal: AbortSignal.timeout(COMMUTE_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return destinations.map((destination) =>
      emptyEstimate(destination.listingId, anchors.map((anchor) => anchor.label)),
    );
  }

  if (!response.ok) {
    return destinations.map((destination) => ({
      listingId: destination.listingId,
      bestDurationMinutes: null,
      bestDistanceMiles: null,
      bestOriginLabel: null,
      evaluatedAnchors: anchors.map((anchor) => anchor.label),
      routes: anchors.map((anchor) => ({
        originLabel: anchor.label,
        durationMinutes: null,
        distanceMiles: null,
      })),
    }));
  }

  const data = (await response.json()) as {
    distances?: number[][];
    durations?: number[][];
  };

  return destinations.map((destination, destinationIndex) => {
    let bestDurationSeconds: number | null = null;
    let bestDistanceMiles: number | null = null;
    let bestOriginLabel: string | null = null;

    anchors.forEach((anchor, anchorIndex) => {
      const duration = data.durations?.[anchorIndex]?.[destinationIndex];
      const distance = data.distances?.[anchorIndex]?.[destinationIndex];
      if (typeof duration !== "number" || !Number.isFinite(duration)) return;
      if (bestDurationSeconds === null || duration < bestDurationSeconds) {
        bestDurationSeconds = duration;
        bestDistanceMiles = typeof distance === "number" && Number.isFinite(distance) ? distance : null;
        bestOriginLabel = anchor.label;
      }
    });

    return {
      listingId: destination.listingId,
      bestDurationMinutes: bestDurationSeconds !== null ? Math.round(bestDurationSeconds / 60) : null,
      bestDistanceMiles: bestDistanceMiles !== null ? Math.round(bestDistanceMiles * 10) / 10 : null,
      bestOriginLabel,
      evaluatedAnchors: anchors.map((anchor) => anchor.label),
      routes: anchors.map((anchor, anchorIndex) => {
        const duration = data.durations?.[anchorIndex]?.[destinationIndex];
        const distance = data.distances?.[anchorIndex]?.[destinationIndex];
        return {
          originLabel: anchor.label,
          durationMinutes:
            typeof duration === "number" && Number.isFinite(duration)
              ? Math.round(duration / 60)
              : null,
          distanceMiles:
            typeof distance === "number" && Number.isFinite(distance)
              ? Math.round(distance * 10) / 10
              : null,
        };
      }),
    };
  });
}

export async function estimateCommutes(input: {
  anchors: Anchor[];
  listings: Array<{ listingId: string; address: string | null; city: string | null; neighborhood: string | null }>;
}) {
  const uniqueAnchors = Array.from(
    new Map(input.anchors.map((anchor) => [anchor.query.trim().toLowerCase(), anchor])).values(),
  ).slice(0, 3);

  // Board creation and startup should never wait on an external commute
  // provider when there is no route to calculate. Previously, a brand-new
  // board still geocoded its commute anchor even though it had zero listings.
  if (input.listings.length === 0 || uniqueAnchors.length === 0) {
    return input.listings.map((listing) =>
      emptyEstimate(listing.listingId, uniqueAnchors.map((anchor) => anchor.label)),
    );
  }

  const resolvedAnchors = (
    await Promise.all(
      uniqueAnchors.map(async (anchor) => {
        const coords = await geocode(anchor.query);
        return coords ? { label: anchor.label, coords } : null;
      }),
    )
  ).filter((value): value is { label: string; coords: Coordinates } => Boolean(value));

  const destinationCandidates = input.listings.slice(0, 16);
  const resolvedDestinations = (
    await Promise.all(
      destinationCandidates.map(async (listing) => {
        const query = [listing.address, listing.neighborhood, listing.city].filter(Boolean).join(", ");
        const coords = await geocode(query);
        return coords ? { listingId: listing.listingId, coords } : null;
      }),
    )
  ).filter((value): value is { listingId: string; coords: Coordinates } => Boolean(value));

  const matrix = await matrixDurations(resolvedAnchors, resolvedDestinations);
  const byListingId = new Map(matrix.map((entry) => [entry.listingId, entry]));

  return input.listings.map((listing) =>
    byListingId.get(listing.listingId) ?? {
      listingId: listing.listingId,
      bestDurationMinutes: null,
      bestDistanceMiles: null,
      bestOriginLabel: null,
      evaluatedAnchors: resolvedAnchors.map((anchor) => anchor.label),
      routes: resolvedAnchors.map((anchor) => ({
        originLabel: anchor.label,
        durationMinutes: null,
        distanceMiles: null,
      })),
    },
  );
}
