/**
 * Analytics plugin — Complex tier.
 *
 * Event tracking with pluggable provider backends.
 * Depends on router for automatic page view tracking.
 *
 * @see README.md
 */
import { createPlugin } from "../config";
import { routerPlugin } from "../router";
import { createAnalyticsApi } from "./api";
import { createAnalyticsState } from "./state";
import type { AnalyticsEvents } from "./types";

export const analyticsPlugin = createPlugin("analytics", {
  depends: [routerPlugin],
  events: register =>
    register.map<AnalyticsEvents>({
      "analytics:track": "Event tracked",
      "analytics:identify": "User identified"
    }),
  config: {
    provider: "memory" as "console" | "memory",
    sampleRate: 1,
    trackingId: ""
  },
  createState: createAnalyticsState,
  api: ctx => createAnalyticsApi(ctx),
  hooks: ctx => ({
    "router:navigate": ({ to }) => {
      ctx.state.events.push({
        event: "page_view",
        properties: { path: to },
        timestamp: Date.now()
      });
    }
  }),
  onInit: ctx => {
    if (!ctx.config.trackingId) {
      throw new Error(
        "[plugin-test] analytics.trackingId is required.\n  Provide a tracking ID in pluginConfigs."
      );
    }
    ctx.state.initialized = true;
  }
});
