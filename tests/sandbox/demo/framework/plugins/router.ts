import { createPlugin } from "../config";

export const routerPlugin = createPlugin("router", {
  config: {
    basePath: "/",
    trailingSlash: false
  },
  createState: () => ({
    currentPath: "/",
    history: [] as string[]
  }),
  api: ctx => ({
    navigate: (path: string) => {
      const from = ctx.state.currentPath;
      ctx.state.history.push(from);
      ctx.state.currentPath = path;
      ctx.emit("router:navigate", { from, to: path });
      return ctx.state.history;
    },
    current: () => ctx.state.currentPath
  }),
  onInit: _ctx => {
    // All plugins registered, can validate dependencies
  },
  onStart: _ctx => {
    // App is starting, begin routing
  },
  onStop: _ctx => {
    // Cleanup
  }
});
