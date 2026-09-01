import type { Breadcrumb, Event } from "@sentry/nextjs";

const invitePath = /\/invite\/[^/?#\s"'<>]+/gi;
const webURL = /https?:\/\/[^\s"'<>]+/gi;

function scrubURL(value: string) {
  const inviteRedacted = value.replace(invitePath, "/invite/[redacted]");
  try {
    const url = new URL(inviteRedacted);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return inviteRedacted.replace(/[?#].*$/, "");
  }
}

function scrubText(value: string) {
  return value
    .replace(webURL, (url) => scrubURL(url))
    .replace(invitePath, "/invite/[redacted]");
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data ? { ...breadcrumb.data } : undefined;
  if (data) {
    for (const key of ["from", "to", "url"]) {
      if (typeof data[key] === "string") data[key] = scrubURL(data[key]);
    }
  }
  return {
    ...breadcrumb,
    message: breadcrumb.message ? scrubText(breadcrumb.message) : breadcrumb.message,
    data,
  };
}

export function scrubSentryEvent<T extends Event>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.url) event.request.url = scrubURL(event.request.url);
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.Authorization;
      delete event.request.headers.cookie;
      delete event.request.headers.Cookie;
    }
  }
  if (event.transaction) event.transaction = scrubText(event.transaction);
  if (event.message) event.message = scrubText(event.message);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubSentryBreadcrumb);
  for (const value of event.exception?.values || []) {
    if (value.value) value.value = scrubText(value.value);
  }
  return event;
}
