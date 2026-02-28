import type { RouterState } from "./types";

type StateCtx = {
  config: { basePath: string };
};

export const createRouterState = (ctx: StateCtx): RouterState => ({
  currentPath: ctx.config.basePath,
  history: [],
  guards: [],
  initialized: false
});
