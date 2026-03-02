import type { RouterState } from "./types";

type StateCtx = {
  config: { basePath: string };
};

/**
 * Create the initial router state. Sets `currentUrl` to the configured
 * `basePath` so the router starts at the application root. History starts
 * empty; `initialized` is set to true during `onInit`.
 *
 * @param {StateCtx} ctx - Minimal context with config for reading `basePath`.
 * @returns {RouterState} A fresh router state object.
 */
export const createRouterState = (ctx: StateCtx): RouterState => ({
  currentUrl: ctx.config.basePath,
  history: [],
  initialized: false
});
