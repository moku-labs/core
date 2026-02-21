import { createPlugin } from "../config";

export const analyticsPlugin = createPlugin("analytics", {
  defaultConfig: {
    trackingId: "",
    debug: false
  },
  createState: () => ({
    events: [] as Array<{ name: string; timestamp: number }>
  }),
  api: ctx => ({
    track: (name: string) => {
      ctx.state.events.push({ name, timestamp: Date.now() });
      if (ctx.global.mode === "development") {
        // Dev-only logging
      }
    },
    getEvents: () => ctx.state.events
  }),
  hooks: {
    "page:render": _payload => {
      // Track page renders
    },
    "router:navigate": _payload => {
      // Track navigations
    }
  }
});
