import type { AnalyticsProvider } from "./types";

/**
 * Create a console-based analytics provider that logs all operations to
 * stdout. Used during development to verify tracking calls without
 * connecting to a real analytics backend.
 *
 * @returns {AnalyticsProvider} A provider that logs track, identify, and flush calls.
 */
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
