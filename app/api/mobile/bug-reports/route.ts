import { randomUUID } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle } from "@/lib/action-throttle";
import { trackEvent } from "@/lib/analytics";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";

const schema = z.object({
  description: z.string().trim().min(5).max(4_000),
  currentScreen: z.string().trim().min(1).max(80),
  boardId: z.string().trim().min(1).max(120).nullable(),
  appVersion: z.string().trim().min(1).max(40),
  buildNumber: z.string().trim().min(1).max(40),
  deviceKind: z.string().trim().min(1).max(40),
  osVersion: z.string().trim().min(1).max(80),
  boardLoaded: z.boolean(),
  boardCount: z.number().int().nonnegative().max(10_000),
  memberCount: z.number().int().nonnegative().max(10_000),
  savedListingCount: z.number().int().nonnegative().max(100_000),
  shareDiagnostics: z.string().max(64_000).default("No share-extension diagnostics were provided."),
});

function sanitizeDiagnosticTrace(value: string) {
  return value
    .replace(/bearer\s+[a-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/(access|refresh|token|secret)=([^\s&]+)/gi, "$1=[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email redacted]")
    .replace(/https?:\/\/[^\s]+/gi, (rawUrl) => {
      try {
        return `${new URL(rawUrl).origin}/[path redacted]`;
      } catch {
        return "[url redacted]";
      }
    })
    .slice(-60_000);
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Describe the bug before sending it." }, { status: 400 });
    }

    try {
      assertThrottle({
        scope: "mobile-bug-report",
        key: user.id,
        limit: 5,
        windowMs: 60 * 60 * 1_000,
        message: "You have sent several reports recently. Please try again in an hour.",
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Too many bug reports." },
        { status: 429 },
      );
    }

    const reportId = `bug-${randomUUID()}`;
    const receivedAt = new Date();
    const shareDiagnostics = sanitizeDiagnosticTrace(parsed.data.shareDiagnostics);
    const context = {
      reportId,
      userId: user.id,
      boardId: parsed.data.boardId,
      currentScreen: parsed.data.currentScreen,
      appVersion: parsed.data.appVersion,
      buildNumber: parsed.data.buildNumber,
      deviceKind: parsed.data.deviceKind,
      osVersion: parsed.data.osVersion,
      boardLoaded: parsed.data.boardLoaded,
      boardCount: parsed.data.boardCount,
      memberCount: parsed.data.memberCount,
      savedListingCount: parsed.data.savedListingCount,
      description: parsed.data.description,
      shareDiagnostics,
      receivedAt: receivedAt.toISOString(),
    };

    await trackEvent("bug_report_submitted", context);

    Sentry.withScope((scope) => {
      scope.addAttachment({
        data: Buffer.from(shareDiagnostics, "utf8"),
        filename: `${reportId}-share-diagnostics.txt`,
        contentType: "text/plain",
      });
      Sentry.captureFeedback({
        message: parsed.data.description,
        name: "Homeboard beta tester",
        source: "ios_settings",
        tags: {
          "homeboard.report_id": reportId,
          "homeboard.current_screen": parsed.data.currentScreen,
          "homeboard.app_version": parsed.data.appVersion,
          "homeboard.device": parsed.data.deviceKind,
          "homeboard.received_at": receivedAt.toISOString(),
        },
      });
    });

    return NextResponse.json({
      ok: true,
      reportId,
      // Keep this response key for compatibility with installed beta builds.
      promisedBy: receivedAt.toISOString(),
    });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "submit_bug_report",
      requestId: request.headers.get("x-homeboard-request-id"),
      severity: "error",
    });
    const message = error instanceof Error ? error.message : "Unable to send the bug report.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to send the bug report." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
