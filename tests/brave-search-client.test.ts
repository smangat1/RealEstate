import assert from "node:assert/strict";
import test from "node:test";

import {
  BraveSearchClient,
  type BraveSearchGate,
} from "@/lib/brave-search-client";

function createGate(options?: { rejectReservation?: boolean }) {
  const events: string[] = [];
  const gate: BraveSearchGate = {
    async reserve() {
      events.push("reserve");
      if (options?.rejectReservation) throw new Error("quota exhausted");
      return { id: "brave-reservation-1" };
    },
    async complete(_reservationId, completion) {
      events.push(`complete:${completion.status}`);
    },
  };
  return { gate, events };
}

test("Brave is not called after the hard request gate rejects a reservation", async () => {
  const { gate, events } = createGate({ rejectReservation: true });
  let fetchCount = 0;
  const client = new BraveSearchClient({
    apiKey: "test-only",
    gate,
    fetchImplementation: async () => {
      fetchCount += 1;
      return new Response("{}", { status: 200 });
    },
  });

  await assert.rejects(() => client.search("exact listing"));
  assert.equal(fetchCount, 0);
  assert.deepEqual(events, ["reserve"]);
});

test("Brave performs one request and never retries provider failures", async () => {
  const { gate, events } = createGate();
  let fetchCount = 0;
  const client = new BraveSearchClient({
    apiKey: "test-only",
    gate,
    fetchImplementation: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ message: "temporary failure" }), {
        status: 503,
      });
    },
  });

  await assert.rejects(() => client.search("exact listing"));
  assert.equal(fetchCount, 1);
  assert.deepEqual(events, ["reserve", "complete:failed"]);
});

test("Brave returns only result records with both a URL and title", async () => {
  const { gate, events } = createGate();
  const client = new BraveSearchClient({
    apiKey: "test-only",
    gate,
    fetchImplementation: async () =>
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Exact unit",
                url: "https://example.com/exact",
                description: "123 Main St Apt 2A $3000 2 bed 1 bath",
              },
              { title: "Missing URL" },
            ],
          },
        }),
        { status: 200 },
      ),
  });

  const results = await client.search("exact listing");
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Exact unit");
  assert.deepEqual(events, ["reserve", "complete:succeeded"]);
});
