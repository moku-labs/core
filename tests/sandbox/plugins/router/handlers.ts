import type { RouterCtx } from "./types";

/**
 * Create an `app:error` event handler for the router. When a 404 error is
 * received, pushes the current path to history, redirects to the configured
 * `notFoundPath`, and emits `router:not-found`. Used in the router plugin's
 * `hooks` to intercept application-level errors.
 *
 * @param {RouterCtx} ctx - The router plugin context for accessing state, config, and emit.
 * @returns {(payload: { message: string; code: number }) => void} A handler that processes error payloads.
 */
export const handleAppError = (ctx: RouterCtx) => (_payload: { message: string; code: number }) => {
  if (_payload.code === 404) {
    const from = ctx.state.currentPath;
    ctx.state.history.push(from);
    ctx.state.currentPath = ctx.config.notFoundPath;
    ctx.emit("router:not-found", { path: from });
  }
};
