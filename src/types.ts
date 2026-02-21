// =============================================================================
// moku_core v3 - Internal Type Definitions
// =============================================================================
// These types are internal to the implementation. They are NOT exported from
// the package entry point. Consumer types flow through inference, not import.
//
// Sections:
//   1. Context Tiers (MinimalContext, PluginContext, TeardownContext)
//   2. Emit Function Types
//   3. Plugin Lookup Types (GetPluginFunction, RequireFunction, HasFunction)
//   4. Plugin Types (PluginSpec, PluginInstance)
//   5. Utility / Extraction Types
//   6. Aggregate Types (BuildPluginApis)
// =============================================================================

// =============================================================================
// Section 1: Context Tiers
// =============================================================================
// Three context tiers, each providing progressively more access:
//   TeardownContext (least) -> MinimalContext -> PluginContext (most)
//
// - TeardownContext: global config only (onStop)
// - MinimalContext: global + plugin config (createState)
// - PluginContext: everything (api, onInit, onStart)
// =============================================================================

/**
 * Teardown context -- the most minimal context tier.
 * Used by: onStop
 *
 * During teardown, plugins may be partially or fully stopped. Only the frozen
 * global config is available.
 */
type TeardownContext<Config> = {
  readonly global: Readonly<Config>;
};

/**
 * Minimal context -- teardown context plus plugin config.
 * Used by: createState
 *
 * At this stage, not all plugins have been created yet. Communication methods
 * (emit, getPlugin, require, has) are intentionally unavailable.
 */
type MinimalContext<Config, C> = {
  readonly global: Readonly<Config>;
  readonly config: Readonly<C>;
};

/**
 * Full plugin context -- everything is live.
 * Used by: api, onInit, onStart
 *
 * Provides global config, plugin config, mutable state, event emission,
 * and inter-plugin communication.
 */
type PluginContext<Config, Events extends Record<string, unknown>, C, S> = {
  readonly global: Readonly<Config>;
  readonly config: Readonly<C>;
  state: S;
  emit: EmitFunction<Events>;
  getPlugin: GetPluginFunction;
  require: RequireFunction;
  has: HasFunction;
};

// =============================================================================
// Section 2: Emit Function Types
// =============================================================================

/**
 * Overloaded emit function.
 * - For known event names (keyof Events): require matching payload.
 * - For unknown strings: allow any payload (escape hatch).
 */
type EmitFunction<Events extends Record<string, unknown>> = {
  <K extends string & keyof Events>(name: K, payload: Events[K]): void;
  (name: string, payload?: unknown): void;
};

// =============================================================================
// Section 3: Plugin Lookup Types
// =============================================================================

/** Get plugin API by instance or name. Returns API or undefined. */
type GetPluginFunction = {
  // biome-ignore lint/suspicious/noExplicitAny: PluginInstance uses any for generic instance matching
  <P extends PluginInstance<string, any, any, any, any>>(plugin: P): ExtractApi<P> | undefined;
  (name: string): unknown;
};

/** Get plugin API or throw. Same overloads as GetPluginFunction but without undefined. */
type RequireFunction = {
  // biome-ignore lint/suspicious/noExplicitAny: PluginInstance uses any for generic instance matching
  <P extends PluginInstance<string, any, any, any, any>>(plugin: P): ExtractApi<P>;
  (name: string): unknown;
};

/** Check if a plugin is registered by name. */
type HasFunction = (name: string) => boolean;

// =============================================================================
// Section 4: Plugin Types
// =============================================================================

/**
 * Plugin specification -- the shape passed to createPlugin.
 *
 * All generics (N, C, S, A) are inferred from the spec object values.
 * Config and Events flow from the createCoreConfig closure.
 * PluginEvents is the only explicit generic (defines new events).
 */
type PluginSpec<
  Config,
  Events extends Record<string, unknown>,
  PluginEvents extends Record<string, unknown>,
  C,
  S,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  A extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  Deps extends ReadonlyArray<PluginInstance<string, any, any, any, any>>
> = {
  defaultConfig?: C;
  depends?: Deps;
  // biome-ignore lint/suspicious/noExplicitAny: Sub-plugins use widened types for assignability
  plugins?: Array<PluginInstance<string, any, any, any, any>>;
  createState?: (context: MinimalContext<Config, C>) => S;
  api?: (context: PluginContext<Config, Events & PluginEvents & DepsEvents<Deps>, C, S>) => A;
  onInit?: (
    context: PluginContext<Config, Events & PluginEvents & DepsEvents<Deps>, C, S>
  ) => void | Promise<void>;
  onStart?: (
    context: PluginContext<Config, Events & PluginEvents & DepsEvents<Deps>, C, S>
  ) => void | Promise<void>;
  onStop?: (context: TeardownContext<Config>) => void | Promise<void>;
  hooks?: {
    [K in string]?: K extends keyof (Events & PluginEvents & DepsEvents<Deps>)
      ? (payload: (Events & PluginEvents & DepsEvents<Deps>)[K]) => void | Promise<void>
      : (payload: unknown) => void | Promise<void>;
  };
};

/**
 * Plugin instance -- the return value of createPlugin.
 *
 * Carries phantom types for compile-time type inference. The _phantom field
 * is never read at runtime (it is `{} as { ... }`).
 */
interface PluginInstance<
  N extends string = string,
  C = void,
  S = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  A extends Record<string, any> = Record<string, never>,
  PluginEvents extends Record<string, unknown> = Record<string, never>
> {
  readonly name: N;
  // biome-ignore lint/suspicious/noExplicitAny: Spec uses any for framework generics since instances are decoupled
  readonly spec: PluginSpec<any, any, any, C, S, A, any>;
  readonly _phantom: {
    config: C;
    state: S;
    api: A;
    events: PluginEvents;
  };
}

// =============================================================================
// Section 5: Utility / Extraction Types
// =============================================================================

/** Extract the API phantom type from a PluginInstance. */
type ExtractApi<P> =
  P extends PluginInstance<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    infer A,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any
  >
    ? A
    : never;

/** Extract the events phantom type from a PluginInstance. */
type ExtractEvents<P> =
  P extends PluginInstance<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    infer E
  >
    ? E
    : never;

/** Extract the name literal type from a PluginInstance. */
type ExtractName<P> =
  P extends PluginInstance<
    infer N,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any
  >
    ? N
    : never;

/** Union of all PluginEvents from a depends tuple. */
type DepsEvents<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  Deps extends ReadonlyArray<PluginInstance<string, any, any, any, any>>
> = Deps[number] extends never ? Record<string, never> : ExtractEvents<Deps[number]>;

// =============================================================================
// Section 6: Aggregate Types
// =============================================================================

/**
 * Map a plugin tuple to `{ [Name]: Api }` for the app surface.
 * Plugins with empty API (Record<string, never>) are excluded.
 */
type BuildPluginApis<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  P extends PluginInstance<string, any, any, any, any>
> = {
  [K in P as ExtractApi<K> extends Record<string, never> ? never : ExtractName<K>]: ExtractApi<K>;
};

// =============================================================================
// Exports (internal to package, NOT re-exported from index.ts)
// =============================================================================

export type {
  // Context tiers
  TeardownContext,
  MinimalContext,
  PluginContext,
  // Emit
  EmitFunction,
  // Plugin lookup
  GetPluginFunction,
  RequireFunction,
  HasFunction,
  // Plugin types
  PluginSpec,
  PluginInstance,
  // Extraction types
  ExtractApi,
  ExtractEvents,
  ExtractName,
  DepsEvents,
  // Aggregate types
  BuildPluginApis
};
