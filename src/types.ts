// =============================================================================
// moku_core v3 - Kernel Type Definitions
// =============================================================================
// Types for the kernel runtime contract. NOT exported from the package entry
// point. Consumer types flow through inference, not import.
//
// Sections:
//   1. Context Tiers (MinimalContext, PluginContext, TeardownContext)
//   2. Emit Function Types
//   3. Plugin Lookup Types (RequireFunction, HasFunction)
//   4. Plugin Types (PluginSpec, PluginInstance)
//   5. Extraction Types (ExtractApi, ExtractEvents, ExtractName, ExtractConfig, DepsEvents)
//   6. Aggregate Types (BuildPluginApis, App, CreateAppOptions)
// =============================================================================

import type { IsLiteralString, UnionToIntersection } from "./type-utilities";

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
 * (emit, require, has) are intentionally unavailable.
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
 * Map a plugin tuple to `{ [Name]: Api }` for the app surface.
 * Plugins with empty API (Record<string, never>) are excluded.
 * Plugins with non-literal name type (string) are excluded to prevent
 * index signature pollution on the App type.
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
  readonly require: RequireFunction;
  readonly has: HasFunction;
} & BuildPluginApis<P>;

/**
 * Context passed to consumer lifecycle callbacks (onReady, onStart, onStop).
 * Includes frozen config, event emission, plugin lookup, and mounted plugin APIs.
 */
type AppCallbackContext<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  P extends PluginInstance<string, any, any, any, any>
> = {
  readonly config: Readonly<Config>;
  readonly emit: EmitFunction<Events>;
  readonly require: RequireFunction;
  readonly has: HasFunction;
} & BuildPluginApis<P>;

/**
 * Options for createApp (Step 3). Structured namespaces replace flat key discrimination:
 * - `plugins`: extra consumer plugins
 * - `config`: global config overrides (shallow-merged with framework defaults)
 * - `pluginConfigs`: per-plugin config overrides keyed by plugin name
 * - `onReady/onError/onStart/onStop`: consumer lifecycle callbacks
 */
type CreateAppOptions<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  P extends PluginInstance<string, any, any, any, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  ExtraPlugins extends readonly PluginInstance<string, any, any, any, any>[]
> = {
  plugins?: ExtraPlugins;
  config?: { [K in keyof Config]?: Config[K] };
  pluginConfigs?: {
    [K in P as ExtractConfig<K> extends Record<string, never>
      ? never
      : IsLiteralString<ExtractName<K>> extends true
        ? ExtractName<K>
        : never]?: Partial<ExtractConfig<K>>;
  };
  onReady?: (context: AppCallbackContext<Config, Events, P>) => void | Promise<void>;
  onError?: (error: Error, context: AppCallbackContext<Config, Events, P>) => void;
  onStart?: (context: AppCallbackContext<Config, Events, P>) => void | Promise<void>;
  onStop?: (context: AppCallbackContext<Config, Events, P>) => void | Promise<void>;
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
  DepsEvents,
  // Aggregate types
  BuildPluginApis,
  AppCallbackContext,
  App,
  CreateAppOptions
};
