// =============================================================================
// @moku-labs/core — Core Plugin Factory
// =============================================================================
// Core plugins are self-contained infrastructure plugins (log, storage, env)
// whose APIs are injected directly onto every regular plugin's context.
//
// Unlike regular plugins, core plugins:
//   - Have NO depends, events, or hooks (self-contained)
//   - Have a minimal context: { config, state } only (no global, emit, require, has)
//   - Are created with a standalone factory (no framework binding needed)
//   - Are passed to createCoreConfig via the plugins option
//
// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------
//
//   §1 Context & Spec Types        — CorePluginContext, CorePluginSpec
//      Minimal context tier and spec shape for core plugins.
//   §2 Instance Types              — CorePluginInstance, AnyCorePluginInstance
//      Core plugin instance with phantom types for type extraction.
//   §3 Extraction Types            — ExtractCoreName, ExtractCoreApi, ExtractCoreConfig
//      Conditional types that pull phantom types from CorePluginInstance.
//   §4 Aggregate Types             — BuildCorePluginApis, CoreApisFromTuple
//      Map core plugin tuple to { [Name]: Api } for context injection.
//   §5 Runtime Assertions          — Validation functions for createCorePlugin.
//   §6 Core Plugin Factory         — createCorePlugin
//      Validates and returns a CorePluginInstance.
//
// =============================================================================

import type { IsLiteralString } from "./utilities";
import { isRecord } from "./utilities";

// =============================================================================
// Section 1: Context & Spec Types
// =============================================================================

/**
 * Minimal context for core plugins. Only config and state — no global, emit,
 * require, or has. Core plugins are self-contained infrastructure.
 *
 * @example
 * ```ts
 * type LogCtx = CorePluginContext<{ level: string }, { entries: string[] }>;
 * // => { readonly config: Readonly<{ level: string }>; state: { entries: string[] } }
 * ```
 */
type CorePluginContext<C, S> = {
  readonly config: Readonly<C>;
  state: S;
};

/**
 * Core plugin specification — the shape passed to createCorePlugin.
 *
 * Same lifecycle methods as regular plugins (config, createState, api, onInit,
 * onStart, onStop) but NO depends, events, or hooks.
 *
 * @example
 * ```ts
 * const spec: CorePluginSpec<{ level: string }, { entries: string[] }, { info(msg: string): void }> = {
 *   config: { level: "info" },
 *   createState: () => ({ entries: [] }),
 *   api: ctx => ({ info: (msg) => { ctx.state.entries.push(msg); } }),
 * };
 * ```
 */
type CorePluginSpec<
  C extends Record<string, unknown>,
  S,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  A extends Record<string, any>
> = {
  /** Default config values for this core plugin. Consumers can override via pluginConfigs. */
  config?: C;
  /** Factory for mutable state. Called once with { config } only. */
  createState?: (context: { readonly config: Readonly<C> }) => S;
  /** API factory. The returned object is injected directly onto every regular plugin's context. */
  api?: (context: CorePluginContext<C, S>) => A;
  /** Called after core plugin APIs are built. Synchronous. */
  onInit?: (context: CorePluginContext<C, S>) => void;
  /** Called when app starts. Core plugins start before regular plugins. */
  onStart?: (context: CorePluginContext<C, S>) => void | Promise<void>;
  /** Called when app stops. Core plugins stop after regular plugins. */
  onStop?: (context: CorePluginContext<C, S>) => void | Promise<void>;
  // NO depends, events, hooks — core plugins are self-contained
};

// =============================================================================
// Section 2: Instance Types
// =============================================================================

/**
 * Core plugin instance — the return value of createCorePlugin.
 *
 * Carries phantom types for compile-time inference and a `_corePlugin: true`
 * brand to distinguish from regular PluginInstance.
 *
 * @example
 * ```ts
 * const log = createCorePlugin("log", { api: ctx => ({ info: () => {} }) });
 * // log: CorePluginInstance<"log", Record<string, never>, Record<string, never>, { info(): void }>
 * ```
 */
interface CorePluginInstance<
  N extends string = string,
  C = void,
  S = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  A extends Record<string, any> = Record<string, never>
> {
  readonly name: N;
  // biome-ignore lint/suspicious/noExplicitAny: Spec uses any for decoupled generic matching
  readonly spec: CorePluginSpec<any, any, any>;
  readonly _corePlugin: true;
  readonly _phantom: {
    config: C;
    state: S;
    api: A;
  };
}

/**
 * Widened CorePluginInstance type for generic constraints on arrays.
 *
 * @example
 * ```ts
 * function processCorePlugins(plugins: AnyCorePluginInstance[]): void { ... }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint on CorePluginInstance arrays
type AnyCorePluginInstance = CorePluginInstance<string, any, any, any>;

// =============================================================================
// Section 3: Extraction Types
// =============================================================================

/**
 * Extract the name literal type from a CorePluginInstance.
 *
 * @example
 * ```ts
 * type Name = ExtractCoreName<typeof logPlugin>; // "log"
 * ```
 */
type ExtractCoreName<P> =
  // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
  P extends CorePluginInstance<infer N, any, any, any> ? N : never;

/**
 * Extract the API phantom type from a CorePluginInstance.
 *
 * @example
 * ```ts
 * type LogApi = ExtractCoreApi<typeof logPlugin>; // { info(msg: string): void }
 * ```
 */
type ExtractCoreApi<P> =
  // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
  P extends CorePluginInstance<string, any, any, infer A> ? A : never;

/**
 * Extract the config phantom type from a CorePluginInstance.
 *
 * @example
 * ```ts
 * type LogConfig = ExtractCoreConfig<typeof logPlugin>; // { level: string }
 * ```
 */
type ExtractCoreConfig<P> =
  // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
  P extends CorePluginInstance<string, infer C, any, any> ? C : never;

// =============================================================================
// Section 4: Aggregate Types
// =============================================================================

/**
 * Map a core plugin union to `{ readonly [Name]: Api }` for context injection.
 * Core plugins with empty API (Record<string, never>) are excluded.
 * Core plugins with non-literal name type (string) are excluded.
 *
 * @example
 * ```ts
 * type Apis = BuildCorePluginApis<typeof logPlugin | typeof envPlugin>;
 * // => { readonly log: { info(msg: string): void }; readonly env: { isDev(): boolean } }
 * ```
 */
type BuildCorePluginApis<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  P extends CorePluginInstance<string, any, any, any>
> = {
  readonly [K in P as ExtractCoreApi<K> extends Record<string, never>
    ? never
    : IsLiteralString<ExtractCoreName<K>> extends true
      ? ExtractCoreName<K>
      : never]: ExtractCoreApi<K>;
};

/**
 * Compute core API map from a core plugin tuple.
 * Convenience alias: extracts the union from the tuple, then builds the map.
 *
 * @example
 * ```ts
 * type Apis = CoreApisFromTuple<readonly [typeof logPlugin, typeof envPlugin]>;
 * // => { readonly log: LogApi; readonly env: EnvApi }
 * ```
 */
type CoreApisFromTuple<T extends readonly AnyCorePluginInstance[]> = BuildCorePluginApis<T[number]>;

// =============================================================================
// Section 5: Runtime Assertions
// =============================================================================

/**
 * Reserved names that cannot be used for core plugins.
 * Includes regular reserved names plus context property names that would collide.
 */
const CORE_PLUGIN_RESERVED_NAMES = new Set([
  "start",
  "stop",
  "emit",
  "require",
  "has",
  "config",
  "global",
  "state",
  "__proto__",
  "constructor",
  "prototype"
]);

/** Fields that core plugins must not have. */
const CORE_PLUGIN_FORBIDDEN_FIELDS = ["depends", "events", "hooks"] as const;

/**
 * Asserts that a core plugin name is a non-empty string and not reserved.
 *
 * @param name - Candidate core plugin name.
 * @example
 * ```ts
 * assertValidCorePluginName("log"); // ok
 * assertValidCorePluginName("config"); // throws
 * ```
 */
function assertValidCorePluginName(name: unknown): asserts name is string {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError(
      "Core plugin name must be a non-empty string.\n" +
        "  Pass a non-empty string as the first argument to createCorePlugin."
    );
  }

  if (CORE_PLUGIN_RESERVED_NAMES.has(name)) {
    throw new TypeError(
      `Core plugin name "${name}" conflicts with a reserved name.\n` +
        "  Choose a different core plugin name."
    );
  }
}

/**
 * Asserts that the core plugin spec is a non-null object.
 *
 * @param name - Validated core plugin name.
 * @param spec - Candidate core plugin spec.
 * @example
 * ```ts
 * assertValidCorePluginSpec("log", { api: () => ({}) }); // ok
 * ```
 */
function assertValidCorePluginSpec(
  name: string,
  spec: unknown
): asserts spec is Record<string, unknown> {
  if (isRecord(spec)) {
    return;
  }

  throw new TypeError(
    `Core plugin "${name}" has invalid spec: expected an object.\n` +
      "  Provide a plugin specification object as the second argument."
  );
}

/**
 * Asserts that the core plugin spec does not contain forbidden fields.
 *
 * @param name - Validated core plugin name.
 * @param spec - Validated core plugin spec.
 * @example
 * ```ts
 * assertNoCorePluginForbiddenFields("log", { api: () => ({}) }); // ok
 * assertNoCorePluginForbiddenFields("log", { depends: [] }); // throws
 * ```
 */
function assertNoCorePluginForbiddenFields(name: string, spec: Record<string, unknown>): void {
  for (const field of CORE_PLUGIN_FORBIDDEN_FIELDS) {
    if (field in spec) {
      throw new TypeError(
        `Core plugin "${name}" cannot have "${field}".\n` +
          "  Core plugins are self-contained — remove the forbidden field."
      );
    }
  }
}

/**
 * Validates lifecycle handlers and factories on a core plugin spec.
 *
 * @param name - Validated core plugin name.
 * @param spec - Validated core plugin spec.
 * @example
 * ```ts
 * assertValidCorePluginCallbacks("log", { api: () => ({}) }); // ok
 * ```
 */
function assertValidCorePluginCallbacks(name: string, spec: Record<string, unknown>): void {
  const optionalFunctions = ["api", "createState", "onInit", "onStart", "onStop"] as const;

  for (const field of optionalFunctions) {
    const value = spec[field];
    if (value !== undefined && typeof value !== "function") {
      throw new TypeError(
        `Core plugin "${name}" has invalid ${field}: expected a function.\n` +
          `  Provide a function for ${field} or remove it from the spec.`
      );
    }
  }
}

// =============================================================================
// Section 6: Core Plugin Factory
// =============================================================================

/**
 * Creates a core plugin instance. Core plugins are standalone, self-contained
 * infrastructure plugins (log, storage, env) whose APIs are injected directly
 * onto every regular plugin's context.
 *
 * @param name - Unique core plugin name (inferred as literal string type).
 * @param spec - Core plugin specification: config, createState, api, lifecycle.
 * @returns A CorePluginInstance carrying phantom types for compile-time inference.
 * @example
 * ```ts
 * const logPlugin = createCorePlugin("log", {
 *   config: { level: "info" },
 *   createState: () => ({ entries: [] as string[] }),
 *   api: ctx => ({
 *     info: (msg: string) => { ctx.state.entries.push(msg); console.log(msg); },
 *   }),
 * });
 * ```
 */
function createCorePlugin<
  const N extends string,
  C extends Record<string, unknown> = Record<string, never>,
  S = Record<string, never>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  A extends Record<string, any> = Record<string, never>
>(name: N, spec: CorePluginSpec<C, S, A>): CorePluginInstance<N, C, S, A> {
  assertValidCorePluginName(name);
  assertValidCorePluginSpec(name, spec);
  assertNoCorePluginForbiddenFields(name, spec);
  assertValidCorePluginCallbacks(name, spec);

  return {
    name,
    spec,
    _corePlugin: true as const,
    _phantom: {} as {
      config: C;
      state: S;
      api: A;
    }
  };
}

export { createCorePlugin };
export type {
  CorePluginContext,
  CorePluginSpec,
  CorePluginInstance,
  AnyCorePluginInstance,
  ExtractCoreName,
  ExtractCoreApi,
  ExtractCoreConfig,
  BuildCorePluginApis,
  CoreApisFromTuple
};
