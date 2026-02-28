import type { RouterCtx } from "./types";

export const handleAppError = (ctx: RouterCtx) => (_payload: { message: string; code: number }) => {
  if (_payload.code === 404) {
    const from = ctx.state.currentPath;
    ctx.state.history.push(from);
    ctx.state.currentPath = ctx.config.notFoundPath;
    ctx.emit("router:not-found", { path: from });
  }
};
