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
 * Strictly typed emit function.
 * Only known event names are accepted, with matching payload required.
 */
type EmitFunction<Events extends Record<string, unknown>> = <K extends string & keyof Events>(
  name: K,
  payload: Events[K]
) => void;

// =============================================================================
// Section 3: Plugin Lookup Types
// =============================================================================

/** Get plugin API by instance. Returns API or undefined. */
// biome-ignore lint/suspicious/noExplicitAny: PluginInstance uses any for generic instance matching
type GetPluginFunction = <P extends PluginInstance<string, any, any, any, any>>(
  plugin: P
) => ExtractApi<P> | undefined;

/** Get plugin API or throw. Instance-only, fully typed. */
// biome-ignore lint/suspicious/noExplicitAny: PluginInstance uses any for generic instance matching
type RequireFunction = <P extends PluginInstance<string, any, any, any, any>>(
  plugin: P
) => ExtractApi<P>;

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
  config?: C;
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
  hooks?: (context: PluginContext<Config, Events & PluginEvents & DepsEvents<Deps>, C, S>) => {
    [K in string & keyof (Events & PluginEvents & DepsEvents<Deps>)]?: (
      payload: (Events & PluginEvents & DepsEvents<Deps>)[K]
    ) => void | Promise<void>;
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
  // biome-ignore lint/complexity/noBannedTypes: {} is the identity element for intersection; Record<string, never> poisons event maps
  PluginEvents extends Record<string, unknown> = {}
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

/** Convert a union to an intersection via distributive conditional + contra-variance. */
// biome-ignore lint/suspicious/noExplicitAny: Required for union-to-intersection inference trick
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/** Intersection of all PluginEvents from a depends tuple. */
type DepsEvents<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  Deps extends ReadonlyArray<PluginInstance<string, any, any, any, any>>
  // biome-ignore lint/complexity/noBannedTypes: {} is the identity element for intersection; intentional empty events fallback
> = Deps[number] extends never ? {} : UnionToIntersection<ExtractEvents<Deps[number]>>;

// =============================================================================
// Section 6: Aggregate Types
// =============================================================================

/**
 * Detect if a string type is a literal (e.g. "router") vs the general `string` type.
 * Used by BuildPluginApis to exclude plugins created via overload 2 (which have
 * name type `string` instead of a literal) from polluting the mapped type
 * with a string index signature.
 */
type IsLiteralString<S extends string> = string extends S ? false : true;

/**
 * Map a plugin tuple to `{ [Name]: Api }` for the app surface.
 * Plugins with empty API (Record<string, never>) are excluded.
 * Plugins with non-literal name type (string) are excluded to prevent
 * index signature pollution from overload 2 of createPlugin.
 */
type BuildPluginApis<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  P extends PluginInstance<string, any, any, any, any>
> = {
  [K in P as ExtractApi<K> extends Record<string, never>
    ? never
    : IsLiteralString<ExtractName<K>> extends true
      ? ExtractName<K>
      : never]: ExtractApi<K>;
};

/** Extract the config phantom type from a PluginInstance. */
type ExtractConfig<P> =
  P extends PluginInstance<
    string,
    infer C,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any,
    // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching
    any
  >
    ? C
    : never;

/**
 * Typed App object returned by createApp.
 * Combines base methods (start, stop, emit, etc.) with plugin APIs
 * mapped by name via BuildPluginApis.
 */
type App<
  _Config extends Record<string, unknown>,
  Events extends Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  P extends PluginInstance<string, any, any, any, any>
> = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly emit: EmitFunction<Events>;
  readonly getPlugin: GetPluginFunction;
  readonly require: RequireFunction;
  readonly has: HasFunction;
} & BuildPluginApis<P>;

/**
 * Options for createApp (Step 3), typed to accept only valid keys:
 * global config keys, plugin name keys (for plugin config overrides),
 * and 'plugins' for extra plugins.
 *
 * Uses a mapped type over Config keys plus plugin names to get excess
 * property checking from TypeScript.
 */
type CreateAppOptions<
  Config extends Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  P extends PluginInstance<string, any, any, any, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  ExtraPlugins extends readonly PluginInstance<string, any, any, any, any>[]
> = {
  [K in keyof Config]?: Config[K];
} & {
  [K in ExtractName<P> as IsLiteralString<K> extends true ? K : never]?: unknown;
} & {
  plugins?: ExtraPlugins;
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
  ExtractConfig,
  UnionToIntersection,
  DepsEvents,
  // Aggregate types
  BuildPluginApis,
  App,
  CreateAppOptions
};
