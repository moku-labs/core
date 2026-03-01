// =============================================================================
// @moku-labs/core — Kernel Type Definitions
// =============================================================================
// Types for the kernel runtime contract. NOT exported from the package entry
// point. Consumer types flow through inference, not import.
//
// NOTE: This file has a type-only circular import with utilities.ts.
//       utilities.ts imports AnyPluginInstance from here.
//       This file imports IsLiteralString and UnionToIntersection from utilities.ts.
//       This cycle MUST remain `import type` only to prevent runtime coupling.
//
// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------
//
//   §1 Context Tiers              — TeardownContext, MinimalContext, PluginContext
//      Three tiers providing progressively more access during lifecycle.
//   §2 Emit Function Type         — EmitFunction
//      Strictly typed emit for dispatching known events with correct payloads.
//   §3 Plugin Lookup Types        — RequireFunction, HasFunction
//      Instance-based require and string-based has for inter-plugin communication.
//   §4 Plugin Types               — PluginSpec, PluginInstance, AnyPluginInstance
//      Core plugin shapes: spec (input), instance (output), any (constraint).
//   §5 Extraction Types           — ExtractApi, ExtractEvents, ExtractName, ExtractConfig, DepsEvents
//      Conditional types that pull phantom types from PluginInstance.
//   §6 Aggregate Types            — BuildPluginApis, App, AppCallbackContext, CreateAppOptions
//      Top-level types composing the app surface and consumer-facing options.
//
// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
//
//   TeardownContext<Config>          Most minimal context tier. Global config only.
//                                   Used by onStop — during teardown only global config is safe.
//   MinimalContext<Config, C>        Teardown context plus plugin config.
//                                   Used by createState — before inter-plugin communication exists.
//   PluginContext<Config, E, C, S>   Full plugin context with emit, require, has.
//                                   Used by api, onInit, onStart — everything is live.
//
//   EmitFunction<Events>             Strictly typed emit. Kernel-layer generic signature that
//                                   accepts only known event names with matching payloads.
//                                   (app.ts defines a separate runtime-layer alias without generics.)
//
//   RequireFunction                  Get plugin API by instance reference. Throws if missing.
//   HasFunction                      Check if a plugin name is registered. String-based boolean.
//
//   PluginSpec<...>                  The spec shape passed to createPlugin. 7 generic parameters,
//                                   all inferred from the spec object.
//   PluginInstance<N, C, S, A, E>    Plugin instance returned by createPlugin. Carries phantom
//                                   types for compile-time inference (_phantom never read at runtime).
//   AnyPluginInstance                Widened PluginInstance for generic constraints on arrays.
//
//   ExtractApi<P>                    Pull API phantom type from a PluginInstance.
//   ExtractEvents<P>                 Pull events phantom type from a PluginInstance.
//   ExtractName<P>                   Pull name literal type from a PluginInstance.
//   ExtractConfig<P>                 Pull config phantom type from a PluginInstance.
//   DepsEvents<Deps>                 Intersection of all PluginEvents from a depends tuple.
//
//   BuildPluginApis<P>               Map plugin tuple to { [Name]: Api } for the app surface.
//   App<Config, Events, P>           Typed app object with lifecycle methods + plugin APIs.
//   AppCallbackContext<...>          Context for consumer lifecycle callbacks.
//   CreateAppOptions<...>            Options for createApp (Step 3 of factory chain).
//
// =============================================================================

// Type-only import -- must NOT become a value import (see file header).
import type { IsLiteralString, UnionToIntersection } from "./utilities";

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
 * Teardown context — the most minimal context tier.
 * Used by: onStop
 *
 * During teardown, plugins may be partially or fully stopped. Only the frozen
 * global config is available.
 * @example
 * ```ts
 * type StopCtx = TeardownContext<{ siteName: string }>;
 * // => { readonly global: Readonly<{ siteName: string }> }
 *
 * // Used in plugin spec:
 * onStop: (ctx: StopCtx) => { console.log(`Stopping ${ctx.global.siteName}`); }
 * ```
 */
type TeardownContext<Config> = {
  readonly global: Readonly<Config>;
};

/**
 * Minimal context — teardown context plus plugin config.
 * Used by: createState
 *
 * At this stage, not all plugins have been created yet. Communication methods
 * (emit, require, has) are intentionally unavailable.
 * @example
 * ```ts
 * type StateCtx = MinimalContext<{ siteName: string }, { basePath: string }>;
 * // => { readonly global: ...; readonly config: Readonly<{ basePath: string }> }
 *
 * // Used in plugin spec:
 * createState: (ctx: StateCtx) => ({ currentPath: ctx.config.basePath })
 * ```
 */
type MinimalContext<Config, C> = {
  readonly global: Readonly<Config>;
  readonly config: Readonly<C>;
};

/**
 * Full plugin context — everything is live.
 * Used by: api, onInit, onStart
 *
 * Provides global config, plugin config, mutable state, event emission,
 * and inter-plugin communication.
 * @example
 * ```ts
 * type Ctx = PluginContext<
 *   { siteName: string },
 *   { "page:view": { path: string } },
 *   { basePath: string },
 *   { count: number }
 * >;
 * // => { global, config, state, emit, require, has }
 *
 * // Used in plugin spec:
 * api: (ctx: Ctx) => ({
 *   navigate: (path: string) => { ctx.state.count += 1; ctx.emit("page:view", { path }); }
 * })
 * ```
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
// Section 2: Emit Function Type
// =============================================================================

/**
 * Strictly typed emit function (kernel-layer generic signature).
 * Only known event names are accepted, with matching payload required.
 *
 * This is the compile-time generic signature used by PluginContext and App.
 * app.ts defines a separate runtime-layer `EmitFunction` alias without generics
 * for dynamically typed dispatch — they are intentionally different.
 * @example
 * ```ts
 * type Emit = EmitFunction<{ "page:view": { path: string }; "auth:login": { userId: string } }>;
 *
 * declare const emit: Emit;
 * emit("page:view", { path: "/" });   // OK — known event with correct payload
 * // emit("page:view", { url: "/" }); // Error — wrong payload shape
 * // emit("unknown", {});             // Error — unknown event name
 * ```
 */
type EmitFunction<Events extends Record<string, unknown>> = <K extends string & keyof Events>(
  name: K,
  payload: Events[K]
) => void;

// =============================================================================
// Section 3: Plugin Lookup Types
// =============================================================================

/**
 * Get a dependency plugin's API by instance reference.
 * Accepts only PluginInstance values (not strings). Returns the fully typed API
 * extracted from the phantom type, or throws at runtime if not registered.
 * @example
 * ```ts
 * declare const require: RequireFunction;
 * const api = require(routerPlugin); // => typeof routerPlugin's API
 * // api.navigate("/about");         // fully typed — method comes from phantom type
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: PluginInstance uses any for generic instance matching
type RequireFunction = <P extends PluginInstance<string, any, any, any, any>>(
  plugin: P
) => ExtractApi<P>;

/**
 * Check if a plugin is registered by name. String-based boolean check.
 * Unlike require, this accepts a plain string and returns a boolean instead of throwing.
 * @example
 * ```ts
 * declare const has: HasFunction;
 * if (has("analytics")) {
 *   // analytics plugin is registered — safe to require
 * }
 * ```
 */
type HasFunction = (name: string) => boolean;

// =============================================================================
// Section 4: Plugin Types
// =============================================================================

/**
 * Plugin specification — the shape passed to createPlugin.
 *
 * All generics (N, C, S, A) are inferred from the spec object values.
 * Config and Events flow from the createCoreConfig closure.
 * PluginEvents is the only explicit generic (defines new events).
 * @example
 * ```ts
 * // Rarely written explicitly — inferred from createPlugin spec object.
 * // The kernel uses this type internally to constrain spec shapes:
 * type RouterSpec = PluginSpec<SiteConfig, SiteEvents, RouterEvents,
 *   { basePath: string }, { currentPath: string },
 *   { navigate(path: string): void }, readonly []>;
 * ```
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
 * Plugin instance — the return value of createPlugin.
 *
 * Carries phantom types for compile-time type inference. The _phantom field
 * is never read at runtime (it is `{} as { ... }`).
 * @example
 * ```ts
 * // Created via createPlugin — types are inferred, not written:
 * const router = createPlugin("router", {
 *   config: { basePath: "/" },
 *   api: ctx => ({ navigate: (path: string) => path }),
 * });
 * // router: PluginInstance<"router", { basePath: string }, ..., { navigate(path: string): string }>
 * ```
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

/**
 * Widened PluginInstance type for generic constraints on arrays.
 * Used across multiple modules (utilities, core, app) for plugin list parameters.
 * @example
 * ```ts
 * function processPlugins(plugins: AnyPluginInstance[]): void { ... }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint on PluginInstance arrays
type AnyPluginInstance = PluginInstance<string, any, any, any, any>;

// =============================================================================
// Section 5: Extraction Types
// =============================================================================

/**
 * Extract the API phantom type from a PluginInstance.
 * Used by RequireFunction to return the correct API type from require(plugin).
 * @example
 * ```ts
 * type RouterApi = ExtractApi<typeof routerPlugin>; // { navigate(path: string): void }
 * ```
 */
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

/**
 * Extract the events phantom type from a PluginInstance.
 * Used by DepsEvents to merge event maps from dependency plugins.
 * @example
 * ```ts
 * type RouterEvents = ExtractEvents<typeof routerPlugin>;
 * // { "router:navigate": { from: string; to: string } }
 * ```
 */
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

/**
 * Extract the name literal type from a PluginInstance.
 * Used by BuildPluginApis to key the app surface by plugin name.
 * @example
 * ```ts
 * type Name = ExtractName<typeof routerPlugin>; // "router"
 * ```
 */
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

/**
 * Extract the config phantom type from a PluginInstance.
 * Used by CreateAppOptions to type pluginConfigs keys.
 * @example
 * ```ts
 * type RouterConfig = ExtractConfig<typeof routerPlugin>; // { basePath: string }
 * ```
 */
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
 * Intersection of all PluginEvents from a depends tuple.
 * Merges events from [authPlugin, routerPlugin] into AuthEvents & RouterEvents.
 * Falls back to `{}` (identity element) when the tuple is empty.
 * @example
 * ```ts
 * type Combined = DepsEvents<readonly [typeof authPlugin, typeof routerPlugin]>;
 * // => { "auth:login": { userId: string } } & { "router:navigate": { path: string } }
 * ```
 */
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
 * @example
 * ```ts
 * type Apis = BuildPluginApis<typeof routerPlugin | typeof authPlugin>;
 * // => { router: { navigate(path: string): void }; auth: { login(): void } }
 * ```
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

/**
 * Typed App object returned by createApp.
 * Combines base methods (start, stop, emit, require, has) with plugin APIs
 * mapped by name via BuildPluginApis.
 * @example
 * ```ts
 * type MyApp = App<SiteConfig, SiteEvents, typeof routerPlugin | typeof authPlugin>;
 * // => { start, stop, emit, require, has, router: RouterApi, auth: AuthApi }
 *
 * declare const app: MyApp;
 * await app.start();
 * app.router.navigate("/about");
 * ```
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
 * @example
 * ```ts
 * type Ctx = AppCallbackContext<SiteConfig, SiteEvents, typeof routerPlugin>;
 * // => { config, emit, require, has, router: RouterApi }
 *
 * // Used in createApp options:
 * onReady: (ctx: Ctx) => { ctx.router.navigate("/home"); }
 * ```
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
 * @example
 * ```ts
 * const app = await createApp({
 *   config: { siteName: "My Blog" },
 *   pluginConfigs: { router: { basePath: "/blog" } },
 *   onReady: ctx => { console.log("App ready:", ctx.config.siteName); },
 * });
 * ```
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
  AnyPluginInstance,
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
