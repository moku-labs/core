import type { PluginCtx } from "../../../../../../src";

/**
 * Single bundle output entry with hashed path.
 *
 * @example
 * ```typescript
 * { name: "index.css", path: "assets/index-a1b2c3.css", size: 4200 }
 * ```
 */
export type BundleOutput = {
  /** Original entrypoint name. */
  name: string;
  /** Hashed output path in the build directory. */
  path: string;
  /** Output file size in bytes. */
  size: number;
};

/**
 * Build lifecycle phase.
 *
 * @example
 * ```typescript
 * // Transitions: "idle" → "building" → "done" (or "error")
 * ```
 */
export type BuildPhase = "idle" | "building" | "done" | "error";

/**
 * Events emitted by the bundler plugin.
 *
 * @example
 * ```typescript
 * hooks: ctx => ({
 *   "bundle:start": ({ entrypoints }) => console.log(`Bundling ${entrypoints.join(", ")}`),
 *   "bundle:complete": ({ outputs, elapsed }) => console.log(`Done in ${elapsed}ms`),
 * })
 * ```
 */
export type BundlerEvents = {
  /** Emitted when bundling begins. */
  "bundle:start": { entrypoints: string[] };
  /** Emitted when bundling completes successfully. */
  "bundle:complete": { outputs: string[]; elapsed: number };
  /** Emitted when bundling fails. */
  "bundle:error": { message: string };
};

/**
 * Internal mutable state for the bundler plugin.
 *
 * @example
 * ```typescript
 * { outputs: Map { "index.css" => { ... } }, phase: "done", buildCount: 1 }
 * ```
 */
export type BundlerState = {
  /** Bundle outputs keyed by entrypoint name. */
  outputs: Map<string, BundleOutput>;
  /** Current build phase. */
  phase: BuildPhase;
  /** Total number of builds completed. */
  buildCount: number;
};

export type BundlerCtx = PluginCtx<
  { entrypoints: string[]; minify: boolean },
  BundlerState,
  BundlerEvents
>;
