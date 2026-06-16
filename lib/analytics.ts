import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AnalyticsEventName =
  | "onboarding_started"
  | "profile_completed"
  | "board_created"
  | "waitlist_submitted";

type AnalyticsPayload = Record<string, unknown>;

function normalizePayload(payload: AnalyticsPayload) {
  return JSON.parse(JSON.stringify(payload ?? {})) as Prisma.InputJsonValue;
}

function csvEscape(value: unknown) {
  const stringValue = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export async function trackEvent(event: AnalyticsEventName, payload: AnalyticsPayload = {}) {
  const normalizedPayload = normalizePayload(payload);
  const occurredAt = new Date();

  await prisma.analyticsEvent.create({
    data: {
      eventName: event,
      payload: normalizedPayload,
      occurredAt,
    },
  });

  if (process.env.NODE_ENV === "development") {
    console.info(
      JSON.stringify({
        kind: "homeboard_event",
        event,
        payload: normalizedPayload,
        occurredAt: occurredAt.toISOString(),
      }),
    );
  }
}

export async function listAnalyticsEvents() {
  return prisma.analyticsEvent.findMany({
    orderBy: { occurredAt: "desc" },
  });
}

export async function exportAnalyticsEventsAsCsv() {
  const events = await prisma.analyticsEvent.findMany({
    orderBy: { occurredAt: "asc" },
  });

  const header = ["id", "eventName", "occurredAt", "payloadJson"];
  const rows = events.map((event) => [
    csvEscape(event.id),
    csvEscape(event.eventName),
    csvEscape(event.occurredAt.toISOString()),
    csvEscape(event.payload),
  ]);

  return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
}
