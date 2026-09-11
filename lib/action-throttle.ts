import "server-only";

type ThrottleEntry = {
  count: number;
  windowStartedAt: number;
  expiresAt: number;
};

const globalForThrottle = globalThis as typeof globalThis & {
  __homeboardThrottleStore__?: Map<string, ThrottleEntry>;
};

const throttleStore = globalForThrottle.__homeboardThrottleStore__ ?? new Map<string, ThrottleEntry>();
const MAX_THROTTLE_ENTRIES = 10_000;

if (!globalForThrottle.__homeboardThrottleStore__) {
  globalForThrottle.__homeboardThrottleStore__ = throttleStore;
}

export class ThrottleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThrottleError";
  }
}

export function isThrottleError(error: unknown): error is ThrottleError {
  return error instanceof ThrottleError;
}

export function assertThrottle(input: {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
  message: string;
}) {
  const now = Date.now();
  const storeKey = `${input.scope}:${input.key}`;
  const existing = throttleStore.get(storeKey);

  if (throttleStore.size >= MAX_THROTTLE_ENTRIES) {
    for (const [key, entry] of throttleStore) {
      if (entry.expiresAt <= now) throttleStore.delete(key);
    }
  }

  // Bound process memory even if a caller presents unlimited unique keys.
  // Existing Map entries retain insertion order, so the first key is oldest.
  if (!existing && throttleStore.size >= MAX_THROTTLE_ENTRIES) {
    const oldestKey = throttleStore.keys().next().value;
    if (oldestKey !== undefined) throttleStore.delete(oldestKey);
  }

  if (!existing || existing.expiresAt <= now) {
    throttleStore.set(storeKey, {
      count: 1,
      windowStartedAt: now,
      expiresAt: now + input.windowMs,
    });
    return;
  }

  if (existing.count >= input.limit) {
    throw new ThrottleError(input.message);
  }

  throttleStore.set(storeKey, {
    ...existing,
    count: existing.count + 1,
  });
}
