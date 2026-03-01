import type { AnalyticsProvider } from "./types";

/**
 * Internal store structure for the memory provider. Holds arrays of tracked
 * events and identified users, accessible via `getStore()` for test assertions.
 */
export type MemoryProviderStore = {
  events: Array<{ event: string; properties: Record<string, unknown> }>;
  identities: string[];
};

/**
 * Create an in-memory analytics provider that accumulates events and identities
 * in arrays. Designed for testing — allows assertions against the internal store
 * via the extra `getStore()` method not present on the base `AnalyticsProvider` interface.
 *
 * @returns {AnalyticsProvider & { getStore: () => MemoryProviderStore }} A provider with an inspectable store.
 */
export const createMemoryProvider = (): AnalyticsProvider & {
  getStore: () => MemoryProviderStore;
} => {
  const store: MemoryProviderStore = {
    events: [],
    identities: []
  };

  return {
    name: "memory",
    track: (event, properties) => {
      store.events.push({ event, properties });
    },
    identify: userId => {
      store.identities.push(userId);
    },
    flush: () => {
      store.events.length = 0;
      store.identities.length = 0;
    },
    getStore: () => store
  };
};
