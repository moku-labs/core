import type { AnalyticsState } from "./types";

export const createAnalyticsState = (): AnalyticsState => ({
  events: [],
  userId: undefined,
  initialized: false
});
