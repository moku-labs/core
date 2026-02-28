// =============================================================================
// moku_core v3 — Plugin Author Type Definitions
// =============================================================================
// Types for the createPlugin API surface. Plugin authors interact with these
// types through inference — they never import them directly.
//
// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------
//
//   §1 Plugin Structural Types    — PluginLike, DependencyPluginTuple
//      Variance-safe shapes for generic constraints.
//   §2 Plugin Type Extraction     — ExtractPluginApi, ExtractPluginEvents
//      Pull API/events phantom types from a plugin-like value.
//   §3 Event Merging              — DependencyEvents, MergedPluginEvents
//      Combine global + own + dependency event maps into one surface.
//   §4 Plugin Context             — PluginExecutionContext
//      The ctx object for api, hooks, onInit, onStart.
//   §5 Event Registration         — EventDescriptor, RegisterFunction
//      The register<T>() callback for typed event declarations.
//   §6 Plugin Spec                — CreatePluginSpec
//      Full spec object shape passed to createPlugin.
//   §7 Plugin Factory             — BoundCreatePluginFunction
//      createPlugin signature — all types inferred from spec.
//   §8 Runtime Types              — LifecycleMethodName, RuntimePluginSpec
//      Minimal runtime shapes for validation.
//   §9 Runtime Assertions         — isRecord, assertValid*
//      Validation functions called inside createPlugin.
//   §10 Plugin Factory            — createPluginFactory
//       Creates a bound createPlugin function for a framework.
//
// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
//
//   PluginLike               Structural shape matching any PluginInstance. Avoids
//                            variance issues that PluginInstance<string,any,...> has.
//   DependencyPluginTuple    readonly PluginLike[] — the depends array constraint.
//
//   ExtractPluginApi<P>      Pulls the API phantom type from a PluginLike value.
//                            Used by ctx.require() return type.
//   ExtractPluginEvents<P>   Pulls the events phantom type from a PluginLike value.
//                            Falls back to {} (identity) when no events declared.
//
//   DependencyEvents<Deps>   Intersects all events from a depends tuple into one map.
//                            [authPlugin, routerPlugin] → AuthEvents & RouterEvents.
//   MergedPluginEvents       GlobalEvents & PluginEvents & DependencyEvents — the
//                            full event surface a plugin can emit/listen to.
//
//   PluginExecutionContext    The ctx object. Provides global, config, state, emit,
//                            require, has. Same shape for api/hooks/lifecycle.
//
//   EventDescriptor<T>       Returned by register<T>(). Carries payload type as phantom.
//   RegisterFunction         <T>(description?) => EventDescriptor<T>. Passed to events().
//
//   CreatePluginSpec         The spec object shape with all optional fields: events,
//                            config, depends, plugins, createState, api, onInit,
//                            onStart, onStop, hooks. 7 generic parameters, all inferred.
//
//   BoundCreatePluginFunction  Bound createPlugin function. All types inferred from spec —
//                            no explicit generics needed.
//
//   LifecycleMethodName      "onInit" | "onStart" | "onStop" — for runtime validation.
//   RuntimePluginSpec        Minimal runtime shape for assertion functions.
//
// -----------------------------------------------------------------------------
// Usage
// -----------------------------------------------------------------------------
//
//   Simple plugin — state + API, no events, no deps:
//
//     const logger = createPlugin("logger", {
//       createState: () => ({ entries: [] as string[] }),
//       api: ctx => ({
//         log: (msg: string) => { ctx.state.entries.push(msg); },
//       }),
//     });
//
//   Plugin with config + deps — hooks react to dependency events:
//
//     const dashboard = createPlugin("dashboard", {
//       config: { refreshInterval: 5000 },
//       depends: [authPlugin],
//       createState: () => ({ lastLogin: "" }),
//       hooks: ctx => ({
//         "auth:login": ({ userId }) => { ctx.state.lastLogin = userId; },
//       }),
//       api: ctx => ({ getLastLogin: () => ctx.state.lastLogin }),
//     });
//
//   Plugin with custom events — other plugins listen via depends:
//
//     const router = createPlugin("router", {
//       events: register => ({
//         "router:navigate": register<{ from: string; to: string }>("Route changed"),
//       }),
//       createState: () => ({ currentPath: "/" }),
//       api: ctx => ({
//         navigate: (path: string) => {
//           const from = ctx.state.currentPath;
//           ctx.state.currentPath = path;
//           ctx.emit("router:navigate", { from, to: path });
//         },
//       }),
//     });
// =============================================================================

import type { EmitFunction, MinimalContext, PluginInstance, TeardownContext } from "./types";
import {
  type EmptyPluginEventMap,
  type FrameworkConfig,
  type FrameworkEventMap,
  isRecord,
  type UnionToIntersection
} from "./utilities";

// =============================================================================
// Section 1: Plugin Structural Types
// =============================================================================

/**
 * Structural plugin shape used for generic constraints without variance issues.
 * @example
 * ```ts
 * const pluginRef: PluginLike = somePlugin;
 * ```
 */
type PluginLike = {
  readonly name: string;
  readonly spec: unknown;
  readonly _phantom: {
    readonly config: unknown;
    readonly state: unknown;
    readonly api: unknown;
    readonly events: Record<string, unknown>;
  };
};

/**
 * Readonly dependency tuple accepted by `depends`.
 * @example
 * ```ts
 * const deps: DependencyPluginTuple = [];
 * ```
 */
type DependencyPluginTuple = readonly PluginLike[];

// =============================================================================
// Section 2: Plugin Type Extraction
// =============================================================================

/**
 * Extracts API type from a plugin-like value.
 * @example
 * ```ts
 * type Api = ExtractPluginApi<typeof somePlugin>;
 * ```
 */
type ExtractPluginApi<PluginCandidate> = PluginCandidate extends {
  readonly _phantom: {
    readonly api: infer PluginApi;
  };
}
  ? PluginApi
  : never;

/**
 * Extracts event map type from a plugin-like value.
 * @example
 * ```ts
 * type Events = ExtractPluginEvents<typeof somePlugin>;
 * ```
 */
type ExtractPluginEvents<PluginCandidate> = PluginCandidate extends {
  readonly _phantom: {
    readonly events: infer PluginEvents;
  };
}
  ? PluginEvents extends Record<string, unknown>
    ? PluginEvents
    : EmptyPluginEventMap
  : EmptyPluginEventMap;

// =============================================================================
// Section 3: Event Merging
// =============================================================================

/**
 * Event map contributed by all dependency plugins.
 * @example
 * ```ts
 * type DepEvents = DependencyEvents<readonly [authPlugin, routerPlugin]>;
 * ```
 */
type DependencyEvents<DependencyPlugins extends DependencyPluginTuple> =
  DependencyPlugins[number] extends never
    ? EmptyPluginEventMap
    : UnionToIntersection<ExtractPluginEvents<DependencyPlugins[number]>>;

/**
 * Intersection of framework events, plugin events, and dependency events.
 * @example
 * ```ts
 * type AllEvents = MergedPluginEvents<SiteConfigEvents, RouterEvents, readonly [authPlugin]>;
 * ```
 */
type MergedPluginEvents<
  GlobalEventMap extends FrameworkEventMap,
  PluginEventMap extends Record<string, unknown>,
  DependencyPlugins extends DependencyPluginTuple
> = GlobalEventMap & PluginEventMap & DependencyEvents<DependencyPlugins>;

// =============================================================================
// Section 4: Plugin Context
// =============================================================================

/**
 * Runtime context for `api`, `onInit`, and `onStart`.
 *
 * Generic parameters:
 * - `GlobalConfig`: frozen app-wide config from `createCoreConfig`
 * - `AllEvents`: merged events the plugin can emit
 * - `PluginConfig`: this plugin's config slice
 * - `PluginState`: mutable plugin state
 * @example
 * ```ts
 * type Ctx = PluginExecutionContext<
 *   SiteConfig,
 *   SiteEvents,
 *   { basePath: string },
 *   { currentPath: string }
 * >;
 * ```
 */
type PluginExecutionContext<
  GlobalConfig extends FrameworkConfig,
  AllEvents extends Record<string, unknown>,
  PluginConfig,
  PluginState
> = {
  /**
   * Frozen app-wide config from `createCoreConfig`. Shared by all plugins.
   * @example
   * ```ts
   * const siteUrl = ctx.global.siteUrl;
   * ```
   */
  readonly global: Readonly<GlobalConfig>;
  /**
   * Frozen plugin-specific config. Defaults from the plugin spec, shallow-merged
   * with consumer overrides.
   * @example
   * ```ts
   * const base = ctx.config.basePath; // from plugin defaults or consumer override
   * ```
   */
  readonly config: Readonly<PluginConfig>;
  /**
   * Mutable plugin state created by `createState`. The only mutable store in the system.
   * @example
   * ```ts
   * ctx.state.count += 1;
   * ctx.state.cache.set(key, value);
   * ```
   */
  state: PluginState;
  /**
   * Dispatch a typed event. Only known event names are accepted (no escape hatch).
   * @example
   * ```ts
   * ctx.emit("auth:login", { userId: "123" });
   * ```
   */
  emit: EmitFunction<AllEvents>;
  /**
   * Get a registered plugin's API by instance reference. Throws if the plugin is not registered.
   * Accepts any plugin instance, not just declared dependencies (not strings).
   * @example
   * ```ts
   * const http = ctx.require(httpPlugin);
   * http.use(authMiddleware);
   * ```
   */
  require: <PluginCandidate extends PluginLike>(
    plugin: PluginCandidate
  ) => ExtractPluginApi<PluginCandidate>;
  /**
   * Check if a plugin is registered by name. String-based (boolean check only).
   * @example
   * ```ts
   * if (ctx.has("analytics")) { ... }
   * ```
   */
  has: (name: string) => boolean;
};

// =============================================================================
// Section 5: Event Registration
// =============================================================================

/**
 * Descriptor returned by register(). Carries the payload type.
 * and an optional description string for runtime event catalogs.
 */
type EventDescriptor<PayloadType = unknown> = {
  readonly description: string;
  /** Phantom field — carries `PayloadType` for inference. Never set at runtime. */
  readonly _type?: PayloadType;
};

/**
 * The register function passed to the events callback.
 * `register<{ userId: string }>("desc")` returns an EventDescriptor
 * that carries both the payload type and description.
 */
type RegisterFunction = <PayloadType>(description?: string) => EventDescriptor<PayloadType>;

// =============================================================================
// Section 6: Plugin Spec
// =============================================================================

/**
 * Specification object passed to `createPlugin`.
 *
 * Generic parameters:
 * - `GlobalConfig`: app-wide config object
 * - `GlobalEventMap`: app-wide events from `createCoreConfig`
 * - `PluginEventMap`: plugin-specific events declared by `events`
 * - `PluginConfig`: plugin config shape from `config`
 * - `PluginState`: mutable state returned by `createState`
 * - `PluginApi`: API returned by `api`
 * - `DependencyPlugins`: tuple from `depends`
 * @example
 * ```ts
 * type RouterSpec = CreatePluginSpec<
 *   SiteConfig,
 *   SiteEvents,
 *   Record<never, never>,
 *   { basePath: string },
 *   { currentPath: string },
 *   { navigate(path: string): void },
 *   readonly []
 * >;
 * ```
 */
type CreatePluginSpec<
  GlobalConfig extends FrameworkConfig,
  GlobalEventMap extends FrameworkEventMap,
  PluginEventMap extends Record<string, unknown>,
  PluginConfig extends Record<string, unknown>,
  PluginState,
  PluginApi extends Record<string, unknown>,
  DependencyPlugins extends DependencyPluginTuple
> = {
  /**
   * Declare plugin-specific events via a register callback.
   * Used for compile-time type inference only — the kernel does not call this at runtime.
   * @example
   * ```ts
   * events: (register) => ({
   *   "auth:login": register<{ userId: string }>("Triggered after user login"),
   *   "auth:logout": register<{ userId: string }>("Triggered after user logout"),
   * })
   * ```
   */
  events?: (register: RegisterFunction) => {
    [EventName in keyof PluginEventMap]: EventDescriptor<PluginEventMap[EventName]>;
  };
  /**
   * Default config values for this plugin. Consumers can override via `pluginName: { ... }`.
   * Shallow-merged at startup, then frozen.
   * @example
   * ```ts
   * config: { basePath: "/", trailing: false }
   * ```
   */
  config?: PluginConfig;
  /**
   * Plugins this plugin depends on. Dependency APIs are available via `ctx.require()`.
   * Dependencies must appear earlier in the plugins array (no topological sort).
   * @example
   * ```ts
   * depends: [authPlugin, httpPlugin]
   * ```
   */
  depends?: DependencyPlugins;
  /**
   * Factory for mutable plugin state. Called once at startup with a minimal context
   * (global config + plugin config). The returned object is the only mutable store.
   * @example
   * ```ts
   * createState: (ctx) => ({ count: 0, cache: new Map() })
   * ```
   */
  createState?: (context: MinimalContext<GlobalConfig, PluginConfig>) => PluginState;
  /**
   * Public API factory. Receives full plugin context; returns the API object
   * other plugins access via `ctx.require(thisPlugin)`.
   * Must be synchronous and side-effect-free — do not call `ctx.emit()` from this factory.
   * @example
   * ```ts
   * api: (ctx) => ({
   *   navigate: (path: string) => { ctx.state.currentPath = path; },
   *   getCurrentPath: () => ctx.state.currentPath,
   * })
   * ```
   */
  api?: (
    context: PluginExecutionContext<
      GlobalConfig,
      MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>,
      PluginConfig,
      PluginState
    >
  ) => PluginApi;
  /**
   * Called after all plugins are registered and APIs are built. Runs in forward
   * plugin order, sequentially awaited. Use for setup that depends on other plugins.
   * @example
   * ```ts
   * onInit: (ctx) => {
   *   const http = ctx.require(httpPlugin);
   *   http.use(authMiddleware);
   * }
   * ```
   */
  onInit?: (
    context: PluginExecutionContext<
      GlobalConfig,
      MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>,
      PluginConfig,
      PluginState
    >
  ) => void | Promise<void>;
  /**
   * Called when the app starts. Runs in forward plugin order, sequentially awaited.
   * Use for runtime startup (open connections, start listeners).
   * @example
   * ```ts
   * onStart: async (ctx) => {
   *   await ctx.state.db.connect(ctx.config.connectionString);
   * }
   * ```
   */
  onStart?: (
    context: PluginExecutionContext<
      GlobalConfig,
      MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>,
      PluginConfig,
      PluginState
    >
  ) => void | Promise<void>;
  /**
   * Called when the app stops. Runs in **reverse** plugin order, sequentially awaited.
   * Use for teardown (close connections, flush buffers). Receives only global config.
   * @example
   * ```ts
   * onStop: async (ctx) => {
   *   await db.disconnect();
   * }
   * ```
   */
  onStop?: (context: TeardownContext<GlobalConfig>) => void | Promise<void>;
  /**
   * Event subscription factory. Receives full plugin context; returns a map of
   * event handlers. Same closure pattern as `api`. Handlers can access `ctx.state`,
   * `ctx.emit`, `ctx.require`, etc.
   * @example
   * ```ts
   * hooks: (ctx) => ({
   *   "auth:login": ({ userId }) => {
   *     ctx.state.lastLogin = userId;
   *     ctx.emit("page:render", { path: "/dashboard", html: "<div>Welcome</div>" });
   *   },
   * })
   * ```
   */
  hooks?: (
    context: PluginExecutionContext<
      GlobalConfig,
      MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>,
      PluginConfig,
      PluginState
    >
  ) => {
    [EventName in string &
      keyof MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>]?: (
      payload: MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>[EventName]
    ) => void | Promise<void>;
  };
};

// =============================================================================
// Section 7: Plugin Factory
// =============================================================================

/**
 * Bound createPlugin function type, parameterized by the framework's Config and Events.
 *
 * All type parameters are inferred from the spec object — no explicit generics needed.
 * Per-plugin events use the register callback pattern instead of explicit type arguments.
 * @example
 * ```ts
 * const { createPlugin } = createCoreConfig<MyConfig, MyEvents>("my-app", { config: defaults });
 * const router = createPlugin("router", { config: { basePath: "/" } });
 * ```
 */
type BoundCreatePluginFunction<
  GlobalConfig extends FrameworkConfig,
  GlobalEventMap extends FrameworkEventMap
> = {
  // All type parameters inferred from the spec object.
  // Per-plugin events use the register callback: events: register => ({ ... })
  // HookHandlerMap captures the return keys of hooks() to reject unknown event names.
  <
    const PluginName extends string = string,
    PluginConfig extends Record<string, unknown> = Record<string, never>,
    PluginState = Record<string, never>,
    PluginApi extends Record<string, unknown> = Record<string, never>,
    DependencyPlugins extends DependencyPluginTuple = readonly [],
    PluginEventMap extends Record<string, unknown> = EmptyPluginEventMap,
    // biome-ignore lint/suspicious/noExplicitAny: Inferred from hooks return; keys checked against merged events
    HookHandlerMap extends Record<string, any> = Record<never, never>
  >(
    name: PluginName,
    spec: Omit<
      CreatePluginSpec<
        GlobalConfig,
        GlobalEventMap,
        PluginEventMap,
        PluginConfig,
        PluginState,
        PluginApi,
        DependencyPlugins
      >,
      "hooks"
    > & {
      hooks?: (
        context: PluginExecutionContext<
          GlobalConfig,
          MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>,
          PluginConfig,
          PluginState
        >
      ) => {
        [K in keyof HookHandlerMap]: K extends string &
          keyof MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>
          ? (
              payload: MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>[K &
                keyof MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>]
            ) => void | Promise<void>
          : never;
      };
    }
  ): PluginInstance<PluginName, PluginConfig, PluginState, PluginApi, PluginEventMap>;
};

// =============================================================================
// Section 8: Runtime Types
// =============================================================================

/**
 * Valid lifecycle method names accepted in plugin specs.
 * @example
 * ```ts
 * const method: LifecycleMethodName = "onInit";
 * ```
 */
type LifecycleMethodName = "onInit" | "onStart" | "onStop";

/**
 * Minimal runtime shape validated inside `createPlugin`.
 * @example
 * ```ts
 * const runtimeSpec: RuntimePluginSpec = { onInit: () => {} };
 * ```
 */
type RuntimePluginSpec = Record<string, unknown> & {
  readonly events?: unknown;
  readonly api?: unknown;
  readonly createState?: unknown;
  readonly onInit?: unknown;
  readonly onStart?: unknown;
  readonly onStop?: unknown;
  readonly hooks?: unknown;
};

// =============================================================================
// Section 9: Runtime Assertions
// =============================================================================

/**
 * Asserts that a plugin name is a non-empty string.
 * @param frameworkId - Framework identifier used in error messages.
 * @param name - Candidate plugin name.
 * @example
 * ```ts
 * assertValidPluginName("my-app", "router");
 * ```
 */
function assertValidPluginName(frameworkId: string, name: unknown): asserts name is string {
  if (typeof name === "string" && name.length > 0) {
    return;
  }

  throw new TypeError(
    `[${frameworkId}] Plugin name must be a non-empty string.\n` +
      `  Pass a non-empty string as the first argument.`
  );
}

/**
 * Asserts that the plugin spec is a non-null object.
 * @param frameworkId - Framework identifier used in error messages.
 * @param pluginName - Validated plugin name.
 * @param spec - Candidate plugin spec.
 * @example
 * ```ts
 * assertValidPluginSpec("my-app", "router", { onInit: () => {} });
 * ```
 */
function assertValidPluginSpec(
  frameworkId: string,
  pluginName: string,
  spec: unknown
): asserts spec is RuntimePluginSpec {
  if (isRecord(spec)) {
    return;
  }

  throw new TypeError(
    `[${frameworkId}] Plugin "${pluginName}" has invalid spec: expected an object.\n` +
      `  Provide a plugin specification object as the second argument.`
  );
}

/**
 * Validates lifecycle handlers (`onInit`, `onStart`, `onStop`) if provided.
 * @param frameworkId - Framework identifier used in error messages.
 * @param pluginName - Validated plugin name.
 * @param spec - Runtime plugin spec.
 * @example
 * ```ts
 * assertValidLifecycleHandlers("my-app", "router", { onStart: () => {} });
 * ```
 */
function assertValidLifecycleHandlers(
  frameworkId: string,
  pluginName: string,
  spec: RuntimePluginSpec
): void {
  const lifecycleMethods: readonly LifecycleMethodName[] = ["onInit", "onStart", "onStop"];

  for (const methodName of lifecycleMethods) {
    const methodValue = spec[methodName];
    if (methodValue !== undefined && typeof methodValue !== "function") {
      throw new TypeError(
        `[${frameworkId}] Plugin "${pluginName}" has invalid ${methodName}: expected a function.\n` +
          `  Provide a function for ${methodName} or remove it from the spec.`
      );
    }
  }
}

/**
 * Validates that events is a function (the register callback factory) if provided.
 * The kernel does not call events at runtime — it exists for compile-time type inference.
 * This validation catches typos like `events: { ... }` instead of `events: register => ({ ... })`.
 * @param frameworkId - Framework identifier used in error messages.
 * @param pluginName - Validated plugin name.
 * @param events - Candidate events value from plugin spec.
 * @example
 * ```ts
 * assertValidEvents("my-app", "auth", register => ({ "auth:login": register<{ userId: string }>() }));
 * ```
 */
function assertValidEvents(frameworkId: string, pluginName: string, events: unknown): void {
  if (events === undefined) {
    return;
  }

  if (typeof events !== "function") {
    throw new TypeError(
      `[${frameworkId}] Plugin "${pluginName}" has invalid events: expected a function.\n` +
        `  Provide a function like: events: register => ({ "event:name": register<PayloadType>() })`
    );
  }
}

/**
 * Validates that hooks is a function (the context-receiving factory).
 * The return value (handler map) is validated at kernel time when hooks(ctx) is called.
 * @param frameworkId - Framework identifier used in error messages.
 * @param pluginName - Validated plugin name.
 * @param hooks - Candidate hooks value from plugin spec.
 * @example
 * ```ts
 * assertValidHooks("my-app", "router", ctx => ({ "route:change": () => {} }));
 * ```
 */
function assertValidHooks(frameworkId: string, pluginName: string, hooks: unknown): void {
  if (hooks === undefined) {
    return;
  }

  if (typeof hooks !== "function") {
    throw new TypeError(
      `[${frameworkId}] Plugin "${pluginName}" has invalid hooks: expected a function.\n` +
        `  Provide a function like: hooks: ctx => ({ "event:name": payload => { ... } })`
    );
  }
}

/**
 * Validates that `api` is a function if provided.
 * @param frameworkId - Framework identifier used in error messages.
 * @param pluginName - Validated plugin name.
 * @param api - Candidate api value from plugin spec.
 * @example
 * ```ts
 * assertValidApi("my-app", "router", ctx => ({ navigate: () => {} }));
 * ```
 */
function assertValidApi(frameworkId: string, pluginName: string, api: unknown): void {
  if (api !== undefined && typeof api !== "function") {
    throw new TypeError(
      `[${frameworkId}] Plugin "${pluginName}" has invalid api: expected a function.\n` +
        `  Provide a function like: api: ctx => ({ methodName: () => { ... } })`
    );
  }
}

/**
 * Validates that `createState` is a function if provided.
 * @param frameworkId - Framework identifier used in error messages.
 * @param pluginName - Validated plugin name.
 * @param createState - Candidate createState value from plugin spec.
 * @example
 * ```ts
 * assertValidCreateState("my-app", "router", ctx => ({ count: 0 }));
 * ```
 */
function assertValidCreateState(
  frameworkId: string,
  pluginName: string,
  createState: unknown
): void {
  if (createState !== undefined && typeof createState !== "function") {
    throw new TypeError(
      `[${frameworkId}] Plugin "${pluginName}" has invalid createState: expected a function.\n` +
        `  Provide a function like: createState: ctx => ({ key: initialValue })`
    );
  }
}

// =============================================================================
// Section 10: Plugin Factory
// =============================================================================

/**
 * Creates a bound `createPlugin` function that captures framework generics.
 *
 * Generic parameters:
 * - `GlobalConfig`: app-wide config from `createCoreConfig`
 * - `GlobalEventMap`: app-wide events from `createCoreConfig`
 * @param frameworkId - The framework identifier for error messages.
 * @returns A createPlugin function bound to the framework's Config and Events types.
 * @example
 * ```ts
 * const createPlugin = createPluginFactory<MyConfig, MyEvents>("my-app");
 * const plugin = createPlugin("router", { config: { basePath: "/" } });
 * ```
 */
function createPluginFactory<
  GlobalConfig extends FrameworkConfig,
  GlobalEventMap extends FrameworkEventMap
>(frameworkId: string): BoundCreatePluginFunction<GlobalConfig, GlobalEventMap> {
  /**
   * Creates a plugin instance with inferred types from the spec object.
   * @param name - Unique plugin name (inferred as literal string type).
   * @param spec - Plugin specification with config, state, api, lifecycle, hooks.
   * @returns A PluginInstance carrying phantom types for compile-time inference.
   * @example
   * ```ts
   * const router = createPlugin("router", {
   *   config: { basePath: "/" },
   *   api: (ctx) => ({ navigate: (path: string) => path }),
   * });
   * ```
   */
  const createPlugin = (name: unknown, spec: unknown): unknown => {
    assertValidPluginName(frameworkId, name);
    assertValidPluginSpec(frameworkId, name, spec);
    assertValidLifecycleHandlers(frameworkId, name, spec);
    assertValidEvents(frameworkId, name, spec.events);
    assertValidHooks(frameworkId, name, spec.hooks);
    assertValidApi(frameworkId, name, spec.api);
    assertValidCreateState(frameworkId, name, spec.createState);

    return {
      name,
      spec,
      _phantom: {} as {
        config: unknown;
        state: unknown;
        api: unknown;
        events: unknown;
      }
    };
  };

  return createPlugin as BoundCreatePluginFunction<GlobalConfig, GlobalEventMap>;
}

export { createPluginFactory };
export type { BoundCreatePluginFunction };
