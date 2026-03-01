import type { AnalyticsProvider } from "./providers/types";
import type { TrackedEvent } from "./types";

/**
 * Determine whether an event should be recorded based on the configured
 * sample rate. Returns true deterministically for rates of 1 (all) or 0
 * (none), and probabilistically for rates in between. Called by
 * `trackEvent` to filter events before they reach the provider.
 *
 * @param {number} sampleRate - A value between 0 and 1 controlling the probability of recording.
 * @returns {boolean} True if the event should be recorded.
 */
export const shouldSample = (sampleRate: number): boolean => {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  // eslint-disable-next-line sonarjs/pseudo-random -- sampling, not security
  return Math.random() < sampleRate;
};

/**
 * Create a timestamped event record, push it to the event array, and forward
 * it to the provider. Called by the `track()` API method after sample-rate
 * filtering decides the event should be kept.
 *
 * @param {AnalyticsProvider} provider - The active provider to forward the event to.
 * @param {TrackedEvent[]} events - The mutable event array from plugin state.
 * @param {string} event - The event name (e.g. "page_view").
 * @param {Record<string, unknown>} properties - Arbitrary metadata attached to the event.
 * @param {number} sampleRate - The configured sample rate used by `shouldSample`.
 * @returns {TrackedEvent | undefined} The tracked event record, or undefined if filtered.
 */
export const trackEvent = (
  provider: AnalyticsProvider,
  events: TrackedEvent[],
  event: string,
  properties: Record<string, unknown>,
  sampleRate: number
): TrackedEvent | undefined => {
  if (!shouldSample(sampleRate)) return undefined;

  const tracked: TrackedEvent = {
    event,
    properties,
    timestamp: Date.now()
  };

  events.push(tracked);
  provider.track(event, properties);

  return tracked;
};
