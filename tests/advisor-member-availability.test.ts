import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  effectiveAdvisorAvailabilityState,
  loadAdvisorMemberAvailability,
  parseAdvisorAvailabilityCommand,
  selectAdvisorReminderRecipients,
  selectRequiredAdvisorMembers,
  setAdvisorMemberAvailability,
} from "../lib/advisor-availability";

const now = new Date("2026-10-21T12:00:00.000Z");

function memoryClient() {
  let row: { userId: string; state: "away" | "ride_along"; awayUntil: Date | null } | null = null;
  return {
    advisorMemberAvailability: {
      async findMany() { return row ? [row] : []; },
      async upsert(args: {
        create: { userId: string };
        update: { state: "away" | "ride_along"; awayUntil: Date | null };
      }) {
        row = {
          userId: args.create.userId,
          state: args.update.state,
          awayUntil: args.update.awayUntil,
        };
        return { state: row.state, awayUntil: row.awayUntil };
      },
      async deleteMany() { row = null; return { count: 1 }; },
    },
  };
}

test("a member can set and clear their availability", async () => {
  const client = memoryClient();
  const awayUntil = new Date("2026-10-23T23:59:59.999Z");
  assert.deepEqual(await setAdvisorMemberAvailability({
    boardId: "board-a",
    userId: "user-a",
    state: "away",
    awayUntil,
    now,
    client,
  }), { available: true, state: "away", awayUntil });
  assert.deepEqual(await setAdvisorMemberAvailability({
    boardId: "board-a",
    userId: "user-a",
    state: "active",
    now,
    client,
  }), { available: true, state: "active", awayUntil: null });
});

test("dated away status auto-resumes without a cleanup job", () => {
  assert.equal(effectiveAdvisorAvailabilityState({
    state: "away",
    awayUntil: "2026-10-21T11:59:59.999Z",
  }, now), "active");
  assert.equal(effectiveAdvisorAvailabilityState({
    state: "away",
    awayUntil: "2026-10-21T12:00:00.001Z",
  }, now), "away");
});

test("away and ride-along members do not owe actions while only away suppresses reminders", () => {
  const members = [{ userId: "active" }, { userId: "away" }, { userId: "ride" }, { userId: "expired" }];
  const availability = {
    away: { state: "away" as const, awayUntil: null },
    ride: { state: "ride_along" as const, awayUntil: null },
    expired: { state: "away" as const, awayUntil: new Date(now.getTime() - 1) },
  };
  assert.deepEqual(
    selectRequiredAdvisorMembers(members, availability, now).map((member) => member.userId),
    ["active", "expired"],
  );
  assert.deepEqual(
    selectAdvisorReminderRecipients(members, availability, now).map((member) => member.userId),
    ["active", "ride", "expired"],
  );
});

test("missing availability storage fails soft and treats everyone as active", async () => {
  const missingClient = {
    advisorMemberAvailability: {
      async findMany() { throw new Error('relation "AdvisorMemberAvailability" does not exist'); },
      async upsert() { throw new Error('relation "AdvisorMemberAvailability" does not exist'); },
      async deleteMany() { throw new Error('relation "AdvisorMemberAvailability" does not exist'); },
    },
  };
  const unavailableClient = missingClient as NonNullable<
    Parameters<typeof loadAdvisorMemberAvailability>[2]
  >;
  assert.deepEqual(await loadAdvisorMemberAvailability("board-a", now, unavailableClient), {
    available: false,
    byUserId: {},
  });
  assert.deepEqual(await setAdvisorMemberAvailability({
    boardId: "board-a",
    userId: "user-a",
    state: "away",
    now,
    client: unavailableClient,
  }), { available: false, state: "active", awayUntil: null });
});

test("only explicit availability command forms parse", () => {
  assert.deepEqual(parseAdvisorAvailabilityCommand("away", now), {
    state: "away", awayUntil: null, error: null,
  });
  assert.equal(
    parseAdvisorAvailabilityCommand("away until friday", now)?.awayUntil?.toISOString(),
    "2026-10-23T23:59:59.999Z",
  );
  assert.deepEqual(parseAdvisorAvailabilityCommand("back", now), {
    state: "active", awayUntil: null, error: null,
  });
  assert.deepEqual(parseAdvisorAvailabilityCommand("ride along", now), {
    state: "ride_along", awayUntil: null, error: null,
  });
  assert.equal(parseAdvisorAvailabilityCommand("I will be away on Friday", now), null);
});

test("the command surface, self-only route, and migration are wired", () => {
  const engine = readFileSync(resolve("lib/advisor-engine.ts"), "utf8");
  const route = readFileSync(resolve("app/api/mobile/boards/[id]/member-availability/route.ts"), "utf8");
  const messages = readFileSync(resolve("app/api/mobile/boards/[id]/messages/route.ts"), "utf8");
  const boardData = readFileSync(resolve("lib/board-data.ts"), "utf8");
  const mobilePayloads = readFileSync(resolve("lib/mobile-payloads.ts"), "utf8");
  const proactive = readFileSync(resolve("lib/advisor-proactive.ts"), "utf8");
  const appModel = readFileSync(resolve(
    "ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift",
  ), "utf8");
  const migration = readFileSync(resolve(
    "prisma/migrations/20261021220000_advisor_member_availability/migration.sql",
  ), "utf8");
  assert.match(engine, /availabilityCommand: parseAdvisorAvailabilityCommand\(command, now\)/);
  assert.match(messages, /member_availability_confirmation/);
  assert.match(boardData, /selectRequiredAdvisorMembers/);
  assert.match(mobilePayloads, /selectRequiredAdvisorMembers/);
  assert.match(proactive, /selectRequiredAdvisorMembers/);
  assert.match(appModel, /advisorPayload\?\.type != "member_availability_confirmation"/);
  assert.match(route, /requireMobileAppUser/);
  assert.match(route, /userId: access\.user\.id/);
  assert.doesNotMatch(route, /userId:\s*parsed\.data/);
  assert.match(migration, /CREATE TABLE "AdvisorMemberAvailability"/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT ALL ON TABLE "AdvisorMemberAvailability" TO service_role/);
  assert.doesNotMatch(`${route}\n${messages}`, /—/);
});
