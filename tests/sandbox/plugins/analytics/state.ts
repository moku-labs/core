import type { AnalyticsState } from "./types";

/**
 * Create the initial analytics state. Starts with no tracked events,
 * no identified user, and uninitialized provider. Events accumulate
 * via `track()` and the user is set via `identify()`.
 *
 * @returns {AnalyticsState} A fresh analytics state object.
 */
export const createAnalyticsState = (): AnalyticsState => ({
  events: [],
  userId: undefined,
  initialized: false
});
