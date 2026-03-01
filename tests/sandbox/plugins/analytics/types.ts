/**
 * Analytics plugin configuration.
 * @example
 * ```typescript
 * { provider: "memory", sampleRate: 1, trackingId: "G-XXXXX" }
 * ```
 */
export type AnalyticsConfig = {
  /** Analytics provider backend. */
  provider: "console" | "memory";
  /** Sampling rate between 0 and 1. */
  sampleRate: number;
  /** Tracking identifier (required). */
  trackingId: string;
};

/**
 * A tracked analytics event with timestamp.
 * @example
 * ```typescript
 * { event: "click", properties: { button: "submit" }, timestamp: 1709312400000 }
 * ```
 */
export type TrackedEvent = {
  event: string;
  properties: Record<string, unknown>;
  timestamp: number;
};

/**
 * Internal mutable state for the analytics plugin.
 * @example
 * ```typescript
 * // After tracking two events and identifying a user
 * {
 *   events: [
 *     { event: "page_view", properties: { page: "/" }, timestamp: 1709312400000 },
 *     { event: "click", properties: { button: "signup" }, timestamp: 1709312401000 }
 *   ],
 *   userId: "user-42",
 *   initialized: true
 * }
 * ```
 */
export type AnalyticsState = {
  /** Accumulated tracked events for this session. Appended by `track()` when not filtered by sample rate. */
  events: TrackedEvent[];
  /** The currently identified user. Set by `identify()`, undefined until first identification. */
  userId: string | undefined;
  /** Whether the analytics provider has been initialized. Set to true during `onStart`. */
  initialized: boolean;
};

/**
 * Events emitted by the analytics plugin.
 * @example
 * ```typescript
 * hooks: ctx => ({
 *   "analytics:track": ({ event, properties }) => console.log(event),
 *   "analytics:identify": ({ userId }) => console.log(userId),
 * })
 * ```
 */
export type AnalyticsEvents = {
  "analytics:track": { event: string; properties: Record<string, unknown> };
  "analytics:identify": { userId: string };
};

export type AnalyticsCtx = {
  config: AnalyticsConfig;
  state: AnalyticsState;
  emit: {
    (name: "analytics:track", payload: AnalyticsEvents["analytics:track"]): void;
    (name: "analytics:identify", payload: AnalyticsEvents["analytics:identify"]): void;
  };
};
