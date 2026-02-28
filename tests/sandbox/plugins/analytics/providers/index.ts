import { createConsoleProvider } from "./console";
import { createMemoryProvider } from "./memory";
import type { AnalyticsProvider } from "./types";

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
