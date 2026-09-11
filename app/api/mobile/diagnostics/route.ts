import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/analytics";

const schema = z.object({
  payloads: z.array(z.string().min(2).max(500_000)).min(1).max(4),
  appVersion: z.string().trim().max(40),
  buildNumber: z.string().trim().max(40),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid diagnostic payload." }, { status: 400 });
    }
    if (parsed.data.payloads.some((payload) => {
      try {
        const decoded: unknown = JSON.parse(payload);
        return decoded === null || typeof decoded !== "object";
      } catch {
        return true;
      }
    })) {
      return NextResponse.json({ error: "Invalid diagnostic payload." }, { status: 400 });
    }

    const recentUploads = await prisma.analyticsEvent.count({
      where: {
        eventName: "native_diagnostic_uploaded",
        occurredAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1_000) },
        payload: { path: ["userId"], equals: user.id },
      },
    });
    if (recentUploads >= 4) {
      return NextResponse.json(
        { error: "Diagnostic upload limit reached. Try again tomorrow." },
        { status: 429 },
      );
    }

    for (const [index, payload] of parsed.data.payloads.entries()) {
      Sentry.withScope((scope) => {
        scope.setLevel("fatal");
        scope.setTag("homeboard.area", "ios");
        scope.setTag("homeboard.operation", "metrickit_diagnostic");
        scope.setTag("homeboard.app_version", parsed.data.appVersion);
        scope.setTag("homeboard.build_number", parsed.data.buildNumber);
        scope.addAttachment({
          data: Buffer.from(payload, "utf8"),
          filename: `metrickit-${Date.now()}-${index}.json`,
          contentType: "application/json",
        });
        Sentry.captureMessage("Homeboard iOS MetricKit diagnostic received");
      });
    }

    await sendOperationalAlert(
      new Error("Homeboard iOS crash or hang diagnostic received."),
      {
        area: "ios",
        operation: "metrickit_diagnostic",
        requestId: request.headers.get("x-homeboard-request-id"),
        severity: "critical",
        captureError: false,
      },
    );
    await trackEvent("native_diagnostic_uploaded", {
      userId: user.id,
      payloadCount: parsed.data.payloads.length,
      totalBytes: parsed.data.payloads.reduce((total, payload) => total + Buffer.byteLength(payload), 0),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "upload_native_diagnostic",
      requestId: request.headers.get("x-homeboard-request-id"),
      severity: "error",
    });
    const message = error instanceof Error ? error.message : "Unable to upload diagnostics.";
    return NextResponse.json(
      { error: message === "MOBILE_AUTH_REQUIRED" ? "Unauthorized" : "Unable to upload diagnostics." },
      { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 },
    );
  }
}
