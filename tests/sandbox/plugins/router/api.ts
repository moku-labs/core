import type { NavigationGuard, NavigationResult, RouterCtx } from "./types";

export const createRouterApi = (ctx: RouterCtx) => ({
  navigate: (path: string): NavigationResult => {
    const from = ctx.state.currentPath;

    // Check guards
    const blocked = ctx.state.guards.some(guard => !guard(path, from));
    if (blocked) {
      return { from, to: path, blocked: true };
    }

    ctx.state.history.push(from);
    ctx.state.currentPath = path;
    ctx.emit("router:navigate", { from, to: path });
    return { from, to: path, blocked: false };
  },

  current: (): string => ctx.state.currentPath,

  back: (): string | undefined => {
    const previous = ctx.state.history.pop();
    if (previous !== undefined) {
      const from = ctx.state.currentPath;
      ctx.state.currentPath = previous;
      ctx.emit("router:navigate", { from, to: previous });
    }
    return previous;
  },

  addGuard: (guard: NavigationGuard): void => {
    ctx.state.guards.push(guard);
  },

  getHistory: (): readonly string[] => ctx.state.history
});
