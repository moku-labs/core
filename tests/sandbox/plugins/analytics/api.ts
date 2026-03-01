import { createProvider } from "./providers";
import type { AnalyticsProvider } from "./providers/types";
import { trackEvent } from "./tracker";
import type { AnalyticsCtx, TrackedEvent } from "./types";

export const createAnalyticsApi = (ctx: AnalyticsCtx) => {
  let provider: AnalyticsProvider | undefined;

  /**
   * Lazily initialize and cache the analytics provider instance. Ensures only
   * one provider is created per plugin lifecycle, regardless of how many API
   * calls are made.
   *
   * @returns {AnalyticsProvider} The cached provider instance.
   */
  const getProvider = (): AnalyticsProvider => {
    if (!provider) {
      provider = createProvider(ctx.config.provider);
    }
    return provider;
  };

  return {
    /**
     * Track a named event with optional properties. The event is forwarded
     * to the configured provider and stored in state. Subject to the
     * configured sample rate — returns undefined when the event is filtered.
     * Emits `analytics:track` on success.
     *
     * @param {string} event - The event name to track (e.g. "page_view", "click").
     * @param {Record<string, unknown>} properties - Arbitrary key-value metadata attached to the event.
     * @returns {TrackedEvent | undefined} The tracked event record, or undefined if filtered by sample rate.
     * @example
     * ```typescript
     * app.analytics.track("button_click", { buttonId: "signup" });
     * ```
     */
    track: (event: string, properties: Record<string, unknown> = {}) => {
      const tracked = trackEvent(
        getProvider(),
        ctx.state.events,
        event,
        properties,
        ctx.config.sampleRate
      );
      if (tracked) {
        ctx.emit("analytics:track", { event, properties });
      }
      return tracked;
    },

    /**
     * Associate all subsequent tracked events with a user identity.
     * Forwards the identity to the provider and emits `analytics:identify`.
     * Call this after user login to attribute events to a known user.
     *
     * @param {string} userId - The unique user identifier.
     * @example
     * ```typescript
     * app.analytics.identify("user-42");
     * app.analytics.track("dashboard_view"); // attributed to user-42
     * ```
     */
    identify: (userId: string) => {
      ctx.state.userId = userId;
      getProvider().identify(userId);
      ctx.emit("analytics:identify", { userId });
    },

    /**
     * Flush any pending events to the provider. Call this before app
     * teardown to ensure all tracked events are delivered.
     */
    flush: () => {
      getProvider().flush();
    },

    /**
     * Get all tracked events recorded in this session. Returns a readonly
     * array — useful for assertions in tests or building an event log UI.
     *
     * @returns {readonly TrackedEvent[]} A readonly array of all tracked events.
     */
    getEvents: (): readonly TrackedEvent[] => ctx.state.events,

    /**
     * Get the currently identified user ID. Returns undefined if
     * `identify()` has not been called yet.
     *
     * @returns {string | undefined} The current user ID, or undefined.
     */
    getUserId: (): string | undefined => ctx.state.userId,

    /**
     * Get the total number of events tracked in this session.
     * Useful for dashboards or rate-limiting checks.
     *
     * @returns {number} The count of tracked events.
     */
    getEventCount: (): number => ctx.state.events.length
  };
};
