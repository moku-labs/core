import { createPlugin } from "../config";
import { routerPlugin } from "./router";

export const loggerPlugin = createPlugin("logger", {
  depends: [routerPlugin] as const,
  createState: () => ({
    logs: [] as string[]
  }),
  api: ctx => ({
    log: (msg: string) => {
      const currentPath = ctx.require(routerPlugin).current();
      ctx.state.logs.push(`[${currentPath}] ${msg}`);
    },
    getLogs: () => ctx.state.logs
  }),
  hooks: {
    "router:navigate": payload => {
      // Listens to global event, payload typed from SiteEvents
      console.log(`Navigation: ${payload.from} -> ${payload.to}`);
    }
  }
});
