export type AnalyticsConfig = {
  provider: "console" | "memory";
  sampleRate: number;
  trackingId: string;
};

export type TrackedEvent = {
  event: string;
  properties: Record<string, unknown>;
  timestamp: number;
};

export type AnalyticsState = {
  events: TrackedEvent[];
  userId: string | undefined;
  initialized: boolean;
};

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
