import type { RouterState } from "./types";

type StateCtx = {
  config: { basePath: string };
};

/**
 * Create the initial router state. Sets `currentPath` to the configured
 * `basePath` so the router starts at the application root. History and
 * guards start empty; `initialized` is set to true during `onStart`.
 * @param ctx - Minimal context with config for reading `basePath`.
 * @returns A fresh router state object.
 */
export const createRouterState = (ctx: StateCtx): RouterState => ({
  currentPath: ctx.config.basePath,
  history: [],
  guards: [],
  initialized: false
});
