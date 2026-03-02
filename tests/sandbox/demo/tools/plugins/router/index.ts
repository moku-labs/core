/**
 * Router plugin — Standard tier.
 *
 * Client-side SPA navigation simulation. Tracks URLs in state
 * (no real DOM or Navigation API). Emits `nav:start` and `nav:end`.
 *
 * @see specification/06-LIFECYCLE.md
 */
import { createPlugin } from "../../config";
import { createRouterApi } from "./api";
import { createRouterState } from "./state";
import type { RouterEvents } from "./types";

export type { RouterEvents, RouterState } from "./types";

export const routerPlugin = createPlugin("router", {
  events: register =>
    register.map<RouterEvents>({
      "nav:start": "Navigation started",
      "nav:end": "Navigation completed"
    }),
  config: { basePath: "/" },
  createState: createRouterState,
  api: ctx => createRouterApi(ctx),
  onInit: ctx => {
    ctx.state.initialized = true;
  },
  onStart: async ctx => {
    ctx.emit("nav:end", { from: "", to: ctx.state.currentUrl });
  }
});
