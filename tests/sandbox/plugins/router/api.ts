import type { NavigationGuard, NavigationResult, RouterCtx } from "./types";

export const createRouterApi = (ctx: RouterCtx) => ({
  /**
   * Navigate to a path. Checks all registered guards before allowing the
   * transition. If any guard rejects, the navigation is blocked and state
   * remains unchanged. Emits `router:navigate` on success.
   *
   * @param {string} path - The target path to navigate to.
   * @returns {NavigationResult} The navigation result indicating whether the route change was blocked.
   * @example
   * ```typescript
   * const result = app.router.navigate("/dashboard");
   * if (result.blocked) console.log("Navigation was blocked by a guard");
   * ```
   */
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

  /**
   * Get the current path. Used to read where the router is currently
   * pointing without triggering any navigation or side effects.
   *
   * @returns {string} The current active path.
   */
  current: (): string => ctx.state.currentPath,

  /**
   * Navigate back to the previous path by popping the history stack.
   * Emits `router:navigate` when a previous path exists.
   *
   * @returns {string | undefined} The previous path, or undefined if the history stack is empty.
   * @example
   * ```typescript
   * app.router.navigate("/a");
   * app.router.navigate("/b");
   * app.router.back(); // returns "/a"
   * ```
   */
  back: (): string | undefined => {
    const previous = ctx.state.history.pop();
    if (previous !== undefined) {
      const from = ctx.state.currentPath;
      ctx.state.currentPath = previous;
      ctx.emit("router:navigate", { from, to: previous });
    }
    return previous;
  },

  /**
   * Register a navigation guard that can block route changes. Guards are
   * checked in order during `navigate()` — if any returns false, the
   * navigation is blocked.
   *
   * @param {NavigationGuard} guard - A function `(to, from) => boolean` that returns false to block.
   * @example
   * ```typescript
   * app.router.addGuard((to) => to !== "/admin");
   * ```
   */
  addGuard: (guard: NavigationGuard): void => {
    ctx.state.guards.push(guard);
  },

  /**
   * Get the navigation history as a readonly array of previously visited
   * paths. Useful for breadcrumbs or debugging navigation flow.
   *
   * @returns {readonly string[]} A readonly array of visited paths in chronological order.
   */
  getHistory: (): readonly string[] => ctx.state.history
});
