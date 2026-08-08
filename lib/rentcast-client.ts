import { createHash } from "node:crypto";

export type RentCastRentalSearch = {
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  propertyType?: string;
  bedrooms?: string;
  bathrooms?: string;
  price?: string;
  daysOld?: string;
  status?: "Active" | "Inactive";
  offset?: number;
};

export type RentCastRequestReservation = {
  id: string;
};

export type RentCastRequestGate = {
  reserve(input: {
    operation: string;
    requestFingerprint: string;
  }): Promise<RentCastRequestReservation>;
  complete(
    reservationId: string,
    completion: {
      status: "succeeded" | "failed";
      httpStatus?: number;
      resultCount?: number;
      errorMessage?: string;
    },
  ): Promise<void>;
};

export type RentCastRentalListing = {
  id: string;
  formattedAddress?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  status?: "Active" | "Inactive";
  price?: number;
  listedDate?: string;
  removedDate?: string | null;
  lastSeenDate?: string;
  [key: string]: unknown;
};

export type RentCastRentalSearchResult = {
  listings: RentCastRentalListing[];
  totalCount: number | null;
};

export class RentCastApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RentCastApiError";
  }
}
function normalizedParams(criteria: RentCastRentalSearch) {
  const params = new URLSearchParams();
  const entries: Array<[string, string | number | undefined]> = [
    ["city", criteria.city?.trim()],
    ["state", criteria.state?.trim().toUpperCase()],
    ["zipCode", criteria.zipCode?.trim()],
    ["latitude", criteria.latitude],
    ["longitude", criteria.longitude],
    ["radius", criteria.radius],
    ["propertyType", criteria.propertyType?.trim()],
    ["bedrooms", criteria.bedrooms?.trim()],
    ["bathrooms", criteria.bathrooms?.trim()],
    ["price", criteria.price?.trim()],
    ["daysOld", criteria.daysOld?.trim()],
    ["status", criteria.status ?? "Active"],
    ["limit", 500],
    ["offset", criteria.offset ?? 0],
    ["includeTotalCount", "true"],
  ];

  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }

  const hasPlace =
    params.has("city") ||
    params.has("zipCode") ||
    (params.has("latitude") && params.has("longitude") && params.has("radius"));
  if (!hasPlace) {
    throw new RentCastApiError("A city, ZIP code, or latitude/longitude/radius is required.");
  }

  return params;
}

function requestFingerprint(params: URLSearchParams) {
  return createHash("sha256").update(params.toString()).digest("hex");
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown RentCast request failure";
}

export class RentCastClient {
  private readonly baseUrl = "https://api.rentcast.io/v1";

  constructor(
    private readonly options: {
      apiKey: string;
      gate: RentCastRequestGate;
      fetchImplementation?: typeof fetch;
    },
  ) {
    if (!options.apiKey.trim()) throw new RentCastApiError("RentCast is not configured.");
  }

  async searchLongTermRentals(
    criteria: RentCastRentalSearch,
  ): Promise<RentCastRentalSearchResult> {
    const params = normalizedParams(criteria);
    const reservation = await this.options.gate.reserve({
      operation: "listings/rental/long-term",
      requestFingerprint: requestFingerprint(params),
    });
    const fetchImplementation = this.options.fetchImplementation ?? fetch;

    try {
      const response = await fetchImplementation(
        `${this.baseUrl}/listings/rental/long-term?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Api-Key": this.options.apiKey,
          },
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | RentCastRentalListing[]
        | { message?: string }
        | null;

      if (!response.ok) {
        const message =
          payload && !Array.isArray(payload) && typeof payload.message === "string"
            ? payload.message
            : `RentCast returned HTTP ${response.status}.`;
        await this.finishWithoutRetry(reservation.id, {
          status: "failed",
          httpStatus: response.status,
          errorMessage: message,
        });
        throw new RentCastApiError(message, response.status);
      }

      if (!Array.isArray(payload)) {
        const message = "RentCast returned an unexpected response.";
        await this.finishWithoutRetry(reservation.id, {
          status: "failed",
          httpStatus: response.status,
          errorMessage: message,
        });
        throw new RentCastApiError(message, response.status);
      }

      await this.finishWithoutRetry(reservation.id, {
        status: "succeeded",
        httpStatus: response.status,
        resultCount: payload.length,
      });

      const totalHeader = response.headers.get("x-total-count");
      const totalCount = totalHeader === null ? null : Number.parseInt(totalHeader, 10);
      return {
        listings: payload,
        totalCount: Number.isFinite(totalCount) ? totalCount : null,
      };
    } catch (error) {
      if (!(error instanceof RentCastApiError)) {
        await this.finishWithoutRetry(reservation.id, {
          status: "failed",
          errorMessage: safeErrorMessage(error),
        });
      }
      throw error;
    }
  }

  private async finishWithoutRetry(
    reservationId: string,
    completion: Parameters<RentCastRequestGate["complete"]>[1],
  ) {
    // Completion bookkeeping must never trigger a second billable provider call.
    await this.options.gate.complete(reservationId, completion).catch(() => undefined);
  }
}
