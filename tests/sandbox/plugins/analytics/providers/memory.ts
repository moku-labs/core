import type { AnalyticsProvider } from "./types";

export type MemoryProviderStore = {
  events: Array<{ event: string; properties: Record<string, unknown> }>;
  identities: string[];
};

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
