import { createPlugin } from "../config";
import { createRouterApi } from "./api";
import { handleAppError } from "./handlers";
import { createRouterState } from "./state";
import type { RouterEvents } from "./types";

export const routerPlugin = createPlugin("router", {
  events: register => ({
    "router:navigate": register<RouterEvents["router:navigate"]>("Route changed"),
    "router:not-found": register<RouterEvents["router:not-found"]>("Route not found")
  }),
  config: { basePath: "/", notFoundPath: "/404" },
  createState: createRouterState,
  api: ctx => createRouterApi(ctx),
  hooks: ctx => ({
    "app:error": handleAppError(ctx)
  }),
  onInit: ctx => {
    ctx.state.initialized = true;
  },
  onStart: async ctx => {
    ctx.emit("router:navigate", { from: "", to: ctx.config.basePath });
  },
  onStop: async () => {
    // Cleanup
  }
});
