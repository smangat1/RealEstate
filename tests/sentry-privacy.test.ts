import assert from "node:assert/strict";
import test from "node:test";

import { scrubSentryBreadcrumb, scrubSentryEvent } from "../lib/sentry-privacy";

test("Sentry events remove credentials, request bodies, invite tokens, and query values", () => {
  const event = scrubSentryEvent({
    message: "Failed at https://homeboard.app/invite/private-code?email=person@example.com",
    request: {
      url: "https://homeboard.app/invite/private-code?access_token=secret",
      cookies: { session: "secret" },
      data: { password: "secret" },
      headers: { authorization: "Bearer secret", cookie: "session=secret", accept: "json" },
    },
    exception: { values: [{ value: "Request /invite/private-code?code=secret failed" }] },
  });

  assert.equal(event.request?.url, "https://homeboard.app/invite/[redacted]");
  assert.equal(event.request?.cookies, undefined);
  assert.equal(event.request?.data, undefined);
  assert.equal(event.request?.headers?.authorization, undefined);
  assert.equal(event.request?.headers?.cookie, undefined);
  assert.equal(event.request?.headers?.accept, "json");
  assert.doesNotMatch(JSON.stringify(event), /private-code|person@example\.com|Bearer secret/);
});

test("Sentry navigation breadcrumbs retain routes without link secrets", () => {
  const breadcrumb = scrubSentryBreadcrumb({
    category: "navigation",
    data: {
      from: "https://homeboard.app/?slide=compare",
      to: "https://homeboard.app/invite/private-code?source=messages",
    },
  });

  assert.equal(breadcrumb.data?.from, "https://homeboard.app/");
  assert.equal(breadcrumb.data?.to, "https://homeboard.app/invite/[redacted]");
});
