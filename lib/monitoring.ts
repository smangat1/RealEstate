import "server-only";

import * as Sentry from "@sentry/nextjs";

type Severity = "warning" | "error" | "critical";

type MonitoringContext = {
  area: string;
  operation: string;
  requestId?: string | null;
  severity?: Severity;
  captureError?: boolean;
};

const expectedErrors = new Set([
  "MOBILE_AUTH_REQUIRED",
  "ADMIN_REQUIRED",
]);

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function sanitizedMessage(error: unknown) {
  const message = asError(error).message;
  if (expectedErrors.has(message)) return message;
  return "Unexpected Homeboard server failure";
}

function sanitizedRequestId(value?: string | null) {
  if (!value) return undefined;
  const normalized = value.trim().replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
  return normalized || undefined;
}

export function captureServerError(error: unknown, context: MonitoringContext) {
  const normalized = asError(error);
  if (expectedErrors.has(normalized.message)) return null;
  const requestId = sanitizedRequestId(context.requestId);

  return Sentry.withScope((scope) => {
    scope.setLevel(context.severity === "critical" ? "fatal" : context.severity || "error");
    scope.setTag("homeboard.area", context.area);
    scope.setTag("homeboard.operation", context.operation);
    if (requestId) scope.setTag("homeboard.request_id", requestId);
    return Sentry.captureException(normalized);
  });
}

export async function sendOperationalAlert(error: unknown, context: MonitoringContext) {
  if (expectedErrors.has(asError(error).message)) return;
  if (context.captureError !== false) captureServerError(error, context);

  const webhook = process.env.HOMEBOARD_ALERT_WEBHOOK_URL?.trim();
  if (!webhook) return;
  const requestId = sanitizedRequestId(context.requestId);

  try {
    await fetch(webhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.HOMEBOARD_ALERT_WEBHOOK_BEARER_TOKEN?.trim()
          ? { authorization: `Bearer ${process.env.HOMEBOARD_ALERT_WEBHOOK_BEARER_TOKEN.trim()}` }
          : {}),
      },
      body: JSON.stringify({
        service: "homeboard",
        area: context.area,
        operation: context.operation,
        severity: context.severity || "error",
        message: sanitizedMessage(error),
        requestId,
        occurredAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch (alertError) {
    Sentry.captureException(alertError, {
      tags: {
        "homeboard.area": "monitoring",
        "homeboard.operation": "deliver_alert",
      },
    });
  }
}
