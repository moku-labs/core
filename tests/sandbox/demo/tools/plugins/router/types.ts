import type { PluginCtx } from "../../../../../../src";

/**
 * Events emitted by the router plugin.
 *
 * @example
 * ```typescript
 * hooks: ctx => ({
 *   "nav:start": ({ from, to }) => console.log(`Leaving ${from}`),
 *   "nav:end": ({ from, to }) => console.log(`Arrived at ${to}`),
 * })
 * ```
 */
export type RouterEvents = {
  /** Emitted before URL changes. Handlers see the old URL via `current()`. */
  "nav:start": { from: string; to: string };
  /** Emitted after URL changes and state is updated. */
  "nav:end": { from: string; to: string };
};

/**
 * Internal mutable state for the router plugin.
 *
 * @example
 * ```typescript
 * // After navigating: "/" → "/about" → "/contact"
 * { currentUrl: "/contact", history: ["/", "/about"], initialized: true }
 * ```
 */
export type RouterState = {
  /** The currently active URL. Set by `navigate()` and `back()`. */
  currentUrl: string;
  /** Stack of previously visited URLs. Pushed on `navigate()`, popped on `back()`. */
  history: string[];
  /** Whether the router has completed initialization. */
  initialized: boolean;
};

export type RouterCtx = PluginCtx<{ basePath: string }, RouterState, RouterEvents>;
