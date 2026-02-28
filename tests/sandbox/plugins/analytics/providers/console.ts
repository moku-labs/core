import type { AnalyticsProvider } from "./types";

export const createConsoleProvider = (): AnalyticsProvider => ({
  name: "console",
  track: (event, properties) => {
    console.log(`[analytics] track: ${event}`, properties);
  },
  identify: userId => {
    console.log(`[analytics] identify: ${userId}`);
  },
  flush: () => {
    console.log("[analytics] flush");
  }
});
