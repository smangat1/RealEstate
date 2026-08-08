import { createHash } from "node:crypto";

export type BraveSearchResult = {
  title: string;
  url: string;
  description: string;
};

export type BraveSearchGate = {
  reserve(input: {
    operation: string;
    requestFingerprint: string;
  }): Promise<{ id: string }>;
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

export class BraveSearchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BraveSearchError";
  }
}

export class BraveSearchClient {
  private readonly endpoint = "https://api.search.brave.com/res/v1/web/search";

  constructor(
    private readonly options: {
      apiKey: string;
      gate: BraveSearchGate;
      fetchImplementation?: typeof fetch;
    },
  ) {
    if (!options.apiKey.trim()) {
      throw new BraveSearchError("Brave Search is not configured.");
    }
  }

  async search(query: string): Promise<BraveSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new BraveSearchError("A search query is required.");
    const params = new URLSearchParams({
      q: normalizedQuery,
      count: "20",
      safesearch: "moderate",
      text_decorations: "false",
    });
    const fingerprint = createHash("sha256")
      .update(params.toString())
      .digest("hex");
    const reservation = await this.options.gate.reserve({
      operation: "web/search",
      requestFingerprint: fingerprint,
    });
    const fetchImplementation = this.options.fetchImplementation ?? fetch;

    try {
      const response = await fetchImplementation(`${this.endpoint}?${params}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.options.apiKey,
        },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as {
        message?: string;
        web?: {
          results?: Array<{
            title?: string;
            url?: string;
            description?: string;
          }>;
        };
      } | null;

      if (!response.ok) {
        const message = payload?.message || `Brave Search returned HTTP ${response.status}.`;
        await this.finish(reservation.id, {
          status: "failed",
          httpStatus: response.status,
          errorMessage: message,
        });
        throw new BraveSearchError(message, response.status);
      }

      const results = (payload?.web?.results ?? []).flatMap((result) => {
        if (!result.url || !result.title) return [];
        return [{
          title: result.title,
          url: result.url,
          description: result.description ?? "",
        }];
      });
      await this.finish(reservation.id, {
        status: "succeeded",
        httpStatus: response.status,
        resultCount: results.length,
      });
      return results;
    } catch (error) {
      if (!(error instanceof BraveSearchError)) {
        await this.finish(reservation.id, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown Brave Search failure",
        });
      }
      throw error;
    }
  }

  private async finish(
    reservationId: string,
    completion: Parameters<BraveSearchGate["complete"]>[1],
  ) {
    await this.options.gate.complete(reservationId, completion).catch(() => undefined);
  }
}
