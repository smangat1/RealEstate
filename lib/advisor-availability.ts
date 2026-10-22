import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AdvisorAvailabilityState = "active" | "away" | "ride_along";

export type AdvisorMemberAvailabilityRecord = {
  state: Exclude<AdvisorAvailabilityState, "active">;
  awayUntil: string | Date | null;
};

export type AdvisorMemberAvailabilityByUserId = Record<string, AdvisorMemberAvailabilityRecord>;

type AvailabilityClient = {
  advisorMemberAvailability: {
    findMany(args: unknown): Promise<Array<{ userId: string; state: "away" | "ride_along"; awayUntil: Date | null }>>;
    upsert(args: unknown): Promise<{ state: "away" | "ride_along"; awayUntil: Date | null }>;
    deleteMany(args: unknown): Promise<unknown>;
  };
};

export function isAdvisorAvailabilityStorageMissing(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }
  const message = error instanceof Error ? error.message : String(error);
  return /AdvisorMemberAvailability/.test(message)
    && /(does not exist|unknown (?:table|column)|P2021|P2022)/i.test(message);
}

export function effectiveAdvisorAvailabilityState(
  record: AdvisorMemberAvailabilityRecord | null | undefined,
  now = new Date(),
): AdvisorAvailabilityState {
  if (!record) return "active";
  if (record.state === "away" && record.awayUntil && new Date(record.awayUntil) <= now) return "active";
  return record.state;
}

export function selectRequiredAdvisorMembers<T extends { userId: string }>(
  members: T[],
  availabilityByUserId: AdvisorMemberAvailabilityByUserId,
  now = new Date(),
) {
  return members.filter((member) =>
    effectiveAdvisorAvailabilityState(availabilityByUserId[member.userId], now) === "active");
}

export function selectAdvisorReminderRecipients<T extends { userId: string }>(
  members: T[],
  availabilityByUserId: AdvisorMemberAvailabilityByUserId,
  now = new Date(),
) {
  return members.filter((member) =>
    effectiveAdvisorAvailabilityState(availabilityByUserId[member.userId], now) !== "away");
}

export async function loadAdvisorMemberAvailability(
  boardId: string,
  now = new Date(),
  client: AvailabilityClient = prisma,
): Promise<{ available: boolean; byUserId: AdvisorMemberAvailabilityByUserId }> {
  try {
    const rows = await client.advisorMemberAvailability.findMany({
      where: { boardId },
      select: { userId: true, state: true, awayUntil: true },
    });
    return {
      available: true,
      byUserId: Object.fromEntries(rows.flatMap((row) =>
        effectiveAdvisorAvailabilityState(row, now) === "active"
          ? []
          : [[row.userId, row]])),
    };
  } catch (error) {
    if (isAdvisorAvailabilityStorageMissing(error)) return { available: false, byUserId: {} };
    throw error;
  }
}

export async function setAdvisorMemberAvailability(input: {
  boardId: string;
  userId: string;
  state: AdvisorAvailabilityState;
  awayUntil?: Date | null;
  now?: Date;
  client?: AvailabilityClient;
}): Promise<{ available: boolean; state: AdvisorAvailabilityState; awayUntil: Date | null }> {
  const client = input.client ?? prisma;
  const now = input.now ?? new Date();
  const state = input.state === "away" && input.awayUntil && input.awayUntil <= now
    ? "active"
    : input.state;
  try {
    if (state === "active") {
      await client.advisorMemberAvailability.deleteMany({
        where: { boardId: input.boardId, userId: input.userId },
      });
      return { available: true, state: "active", awayUntil: null };
    }
    const row = await client.advisorMemberAvailability.upsert({
      where: { boardId_userId: { boardId: input.boardId, userId: input.userId } },
      create: {
        boardId: input.boardId,
        userId: input.userId,
        state,
        awayUntil: state === "away" ? input.awayUntil ?? null : null,
      },
      update: {
        state,
        awayUntil: state === "away" ? input.awayUntil ?? null : null,
      },
      select: { state: true, awayUntil: true },
    });
    return { available: true, state: row.state, awayUntil: row.awayUntil };
  } catch (error) {
    if (isAdvisorAvailabilityStorageMissing(error)) {
      return { available: false, state: "active", awayUntil: null };
    }
    throw error;
  }
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseAwayUntil(value: string, now: Date) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "tomorrow") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 23, 59, 59, 999));
  }
  const weekday = WEEKDAYS.indexOf(normalized);
  if (weekday >= 0) {
    const days = ((weekday - now.getUTCDay() + 7) % 7) || 7;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 23, 59, 59, 999));
  }
  const isoDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    const parsed = new Date(`${normalized}T23:59:59.999Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(normalized)) return parsed;
  }
  return null;
}

export type AdvisorAvailabilityCommand = {
  state: AdvisorAvailabilityState;
  awayUntil: Date | null;
  error: string | null;
};

export function parseAdvisorAvailabilityCommand(command: string, now = new Date()): AdvisorAvailabilityCommand | null {
  const normalized = command.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "back") return { state: "active", awayUntil: null, error: null };
  if (normalized === "ride along" || normalized === "ride-along" || normalized === "along for the ride") {
    return { state: "ride_along", awayUntil: null, error: null };
  }
  if (normalized === "away") return { state: "away", awayUntil: null, error: null };
  const datedAway = normalized.match(/^away until (.+)$/);
  if (!datedAway) return null;
  const awayUntil = parseAwayUntil(datedAway[1], now);
  return awayUntil
    ? { state: "away", awayUntil, error: null }
    : { state: "away", awayUntil: null, error: "Use a weekday, tomorrow, or a YYYY-MM-DD date." };
}
