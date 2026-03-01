import { createConsoleProvider } from "./console";
import { createMemoryProvider } from "./memory";
import type { AnalyticsProvider } from "./types";

/**
 * Resolve a provider name to its implementation. Lazily called by the analytics
 * API on first use so providers are only constructed when actually needed.
 *
 * @param {"console" | "memory"} name - The provider backend to instantiate.
 * @returns {AnalyticsProvider} The constructed provider instance.
 */
export const createProvider = (name: "console" | "memory"): AnalyticsProvider => {
  switch (name) {
    case "console": {
      return createConsoleProvider();
    }
    case "memory": {
      return createMemoryProvider();
    }
  }
};
