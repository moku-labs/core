import type { AnalyticsProvider } from "./providers/types";
import type { TrackedEvent } from "./types";

export const shouldSample = (sampleRate: number): boolean => {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  // eslint-disable-next-line sonarjs/pseudo-random -- sampling, not security
  return Math.random() < sampleRate;
};

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
