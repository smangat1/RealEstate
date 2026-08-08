import assert from "node:assert/strict";
import test from "node:test";

import {
  RentCastClient,
  type RentCastRequestGate,
} from "../lib/rentcast-client";

function createGate(options?: { rejectReservation?: boolean }) {
  const events: string[] = [];
  const gate: RentCastRequestGate = {
    async reserve() {
      events.push("reserve");
      if (options?.rejectReservation) throw new Error("quota exhausted");
      return { id: "reservation-1" };
    },
    async complete(_reservationId, completion) {
      events.push(`complete:${completion.status}`);
    },
  };
  return { gate, events };
}

test("RentCast is never called when the request gate rejects the reservation", async () => {
  const { gate, events } = createGate({ rejectReservation: true });
  let fetchCount = 0;
  const client = new RentCastClient({
    apiKey: "test-only",
    gate,
    fetchImplementation: async () => {
      fetchCount += 1;
      return new Response("[]", { status: 200 });
    },
  });

  await assert.rejects(() => client.searchLongTermRentals({ city: "New York", state: "NY" }));
  assert.equal(fetchCount, 0);
  assert.deepEqual(events, ["reserve"]);
});

test("one reservation permits exactly one request with the maximum batch size", async () => {
  const { gate, events } = createGate();
  let requestedUrl = "";
  const client = new RentCastClient({
    apiKey: "test-only",
    gate,
    fetchImplementation: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify([{ id: "listing-1" }]), {
        status: 200,
        headers: { "X-Total-Count": "1" },
      });
    },
  });

  const result = await client.searchLongTermRentals({ city: "New York", state: "NY" });
  assert.equal(result.listings.length, 1);
  assert.equal(result.totalCount, 1);
  assert.match(requestedUrl, /limit=500/);
  assert.match(requestedUrl, /includeTotalCount=true/);
  assert.deepEqual(events, ["reserve", "complete:succeeded"]);
});

test("RentCast failures are recorded and are never automatically retried", async () => {
  const { gate, events } = createGate();
  let fetchCount = 0;
  const client = new RentCastClient({
    apiKey: "test-only",
    gate,
    fetchImplementation: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ message: "temporary failure" }), { status: 500 });
    },
  });

  await assert.rejects(() => client.searchLongTermRentals({ zipCode: "10001" }));
  assert.equal(fetchCount, 1);
  assert.deepEqual(events, ["reserve", "complete:failed"]);
});
