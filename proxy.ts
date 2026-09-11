import { type NextRequest, NextResponse } from "next/server";

import { assertThrottle } from "@/lib/action-throttle";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEFAULT_API_BODY_LIMIT = 1024 * 1024;
const UPLOAD_API_BODY_LIMIT = 12 * 1024 * 1024;

function requestClientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")
    || "unknown";
  return forwarded.split(",")[0]?.trim().slice(0, 80) || "unknown";
}

function configuredOrigins(request: NextRequest) {
  const origins = new Set([request.nextUrl.origin]);
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // Invalid deployment configuration must not widen CORS access.
    }
  }
  return origins;
}

function apiError(error: string, status: number, requestId: string, extraHeaders?: HeadersInit) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "x-homeboard-request-id": requestId,
        ...Object.fromEntries(new Headers(extraHeaders).entries()),
      },
    },
  );
}

export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-homeboard-request-id", requestId);

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const isWrite = MUTATING_METHODS.has(request.method.toUpperCase());
    const origin = request.headers.get("origin");
    if (isWrite && origin && !configuredOrigins(request).has(origin)) {
      return apiError("Cross-origin request blocked.", 403, requestId);
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    const bodyLimit = request.nextUrl.pathname.includes("/uploads")
      ? UPLOAD_API_BODY_LIMIT
      : DEFAULT_API_BODY_LIMIT;
    if (Number.isFinite(contentLength) && contentLength > bodyLimit) {
      return apiError("Request body is too large.", 413, requestId);
    }

    try {
      assertThrottle({
        scope: isWrite ? "api-write" : "api-read",
        key: requestClientKey(request),
        limit: isWrite ? 90 : 240,
        windowMs: 60_000,
        message: "Too many requests. Please wait and try again.",
      });
    } catch {
      return apiError(
        "Too many requests. Please wait and try again.",
        429,
        requestId,
        { "Retry-After": "60" },
      );
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-homeboard-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
