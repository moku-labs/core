/**
 * Router plugin configuration.
 *
 * @example
 * ```typescript
 * { basePath: "/app", notFoundPath: "/404" }
 * ```
 */
export type RouterConfig = {
  /** Base path prefix for all routes. */
  basePath: string;
  /** Redirect path when no route matches. */
  notFoundPath: string;
};

/**
 * Internal mutable state for the router plugin.
 *
 * @example
 * ```typescript
 * // After navigating: "/" → "/dashboard" → "/settings"
 * {
 *   currentPath: "/settings",
 *   history: ["/", "/dashboard"],
 *   guards: [authGuard],
 *   initialized: true
 * }
 * ```
 */
export type RouterState = {
  /** The currently active route path. Set by `navigate()` and `back()`. Initialized to `config.basePath`. */
  currentPath: string;
  /** Stack of previously visited paths. Pushed on `navigate()`, popped on `back()`. Starts empty. */
  history: string[];
  /** Registered navigation guards. Each is called before route changes — return false to block. */
  guards: NavigationGuard[];
  /** Whether the router has completed initialization. Set to true during `onStart`. */
  initialized: boolean;
};

/**
 * Function that determines whether navigation is allowed.
 * Return `true` to allow, `false` to block.
 *
 * @example
 * ```typescript
 * const authGuard: NavigationGuard = (to) => to !== "/admin" || isLoggedIn();
 * ```
 */
export type NavigationGuard = (to: string, from: string) => boolean;

/**
 * Result of a navigation attempt.
 *
 * @example
 * ```typescript
 * const result = app.router.navigate("/about");
 * if (result.blocked) console.log("Navigation was blocked");
 * ```
 */
export type NavigationResult = {
  from: string;
  to: string;
  blocked: boolean;
};

/**
 * Events emitted by the router plugin.
 *
 * @example
 * ```typescript
 * hooks: ctx => ({
 *   "router:navigate": ({ from, to }) => console.log(`${from} -> ${to}`),
 *   "router:not-found": ({ path }) => console.log(`Not found: ${path}`),
 * })
 * ```
 */
export type RouterEvents = {
  "router:navigate": { from: string; to: string };
  "router:not-found": { path: string };
};

export type RouterCtx = {
  config: RouterConfig;
  state: RouterState;
  emit: {
    (name: "router:navigate", payload: RouterEvents["router:navigate"]): void;
    (name: "router:not-found", payload: RouterEvents["router:not-found"]): void;
  };
};
