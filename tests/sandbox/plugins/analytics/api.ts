import { createProvider } from "./providers";
import type { AnalyticsProvider } from "./providers/types";
import { trackEvent } from "./tracker";
import type { AnalyticsCtx, TrackedEvent } from "./types";

export const createAnalyticsApi = (ctx: AnalyticsCtx) => {
  let provider: AnalyticsProvider | undefined;

  const getProvider = (): AnalyticsProvider => {
    if (!provider) {
      provider = createProvider(ctx.config.provider);
    }
    return provider;
  };

  return {
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

    identify: (userId: string) => {
      ctx.state.userId = userId;
      getProvider().identify(userId);
      ctx.emit("analytics:identify", { userId });
    },

    flush: () => {
      getProvider().flush();
    },

    getEvents: (): readonly TrackedEvent[] => ctx.state.events,

    getUserId: (): string | undefined => ctx.state.userId,

    getEventCount: (): number => ctx.state.events.length
  };
};
