import type { RouterCtx } from "./types";

export const createRouterApi = (ctx: RouterCtx) => ({
  /**
   * Navigate to a URL. Pushes the current URL onto the history stack,
   * updates state, and emits `nav:start` then `nav:end`. Used by
   * consumers and other plugins to trigger SPA navigation.
   *
   * @param {string} url - The target URL to navigate to.
   * @example
   * ```typescript
   * app.router.navigate("/about");
   * app.router.current(); // "/about"
   * ```
   */
  navigate: (url: string) => {
    const from = ctx.state.currentUrl;
    ctx.emit("nav:start", { from, to: url });
    ctx.state.history.push(from);
    ctx.state.currentUrl = url;
    ctx.emit("nav:end", { from, to: url });
  },

  /**
   * Get the current URL. Used to read where the router is currently
   * pointing without triggering any navigation or side effects.
   *
   * @returns {string} The current active URL.
   */
  current: (): string => ctx.state.currentUrl,

  /**
   * Navigate back to the previous URL by popping the history stack.
   * Emits `nav:start` and `nav:end` when a previous URL exists.
   *
   * @returns {string | undefined} The previous URL, or undefined if the history stack is empty.
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
      const from = ctx.state.currentUrl;
      ctx.emit("nav:start", { from, to: previous });
      ctx.state.currentUrl = previous;
      ctx.emit("nav:end", { from, to: previous });
    }
    return previous;
  }
});
