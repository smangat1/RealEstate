import "server-only";

type ThrottleEntry = {
  count: number;
  windowStartedAt: number;
};

const globalForThrottle = globalThis as typeof globalThis & {
  __homeboardThrottleStore__?: Map<string, ThrottleEntry>;
};

const throttleStore = globalForThrottle.__homeboardThrottleStore__ ?? new Map<string, ThrottleEntry>();

if (!globalForThrottle.__homeboardThrottleStore__) {
  globalForThrottle.__homeboardThrottleStore__ = throttleStore;
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

  if (!existing || now - existing.windowStartedAt >= input.windowMs) {
    throttleStore.set(storeKey, {
      count: 1,
      windowStartedAt: now,
    });
    return;
  }

  if (existing.count >= input.limit) {
    throw new Error(input.message);
  }

  throttleStore.set(storeKey, {
    ...existing,
    count: existing.count + 1,
  });
}
