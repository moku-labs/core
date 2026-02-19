// =============================================================================
// moku_core - Type System Foundation
// =============================================================================
// All TypeScript interfaces, phantom types, context types, and type-level
// helpers that every subsequent phase depends on. Organized by section:
//
//   1. Utility Helpers (internal)
//   2. Phantom Type Symbol (internal)
//   3. Context Types (internal, four tiers)
//   4. Spec Interfaces (exported)
//   5. Instance Interfaces (exported)
//   6. Type-Level Helpers (internal)
//   7. Aggregate Type Helpers (internal)
// =============================================================================

// =============================================================================
// Section 1: Utility Helpers (internal)
// =============================================================================

/**
 * Flattens intersection types into a single object type for readable IDE hover.
 * Applied to all public-facing types per project convention.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Removes keys whose value type is `never` from an object type.
 * Used by BuildPluginConfigs to exclude void-config plugins.
 */
type OmitNever<T> = { [K in keyof T as T[K] extends never ? never : K]: T[K] };

// =============================================================================
// Section 2: Phantom Type Symbol (internal)
// =============================================================================

/**
 * Unique symbol used as the key for phantom type fields.
 * Using a symbol key minimizes IDE hover noise -- symbol-keyed properties
 * are collapsed in most IDE tooltips, keeping the focus on real API surface.
 */
declare const PHANTOM: unique symbol;

/**
 * Branded phantom field type. Carries type information through the type system
 * without appearing prominently in IDE hover tooltips.
 */
type PhantomTypes<C, A, S> = {
  readonly [PHANTOM]: { config: C; api: A; state: S };
};

/**
 * Branded phantom field for default config presence.
 * Carries whether a plugin has defaultConfig for BuildPluginConfigs logic.
 */
type PhantomDefaults<HasDefaults extends boolean> = {
  readonly [PHANTOM]: HasDefaults;
};

// =============================================================================
// Section 3: Context Types (internal, four tiers)
// =============================================================================
// Each tier structurally extends the previous, showing progressive context
// growth through the lifecycle:
//   TeardownContext (least) -> MinimalContext -> InitContext -> PluginContext (most)
//
// All context types use Variant B (3 generics: G, Bus, Signals).
// =============================================================================

/**
 * Teardown context -- the most minimal context tier.
 * Used by: onStop, onDestroy
 *
 * During teardown, plugins may be partially or fully stopped. Accessing other
 * plugins' APIs during teardown is unreliable, so only the frozen global config
 * is available.
 */
type TeardownContext<G> = {
  /** Global config (BaseConfig merged with consumer overrides). Frozen. */
  readonly global: Readonly<G>;
};

/**
 * Minimal context -- teardown context plus plugin config.
 * Used by: createState, onCreate
 *
 * At this stage, not all plugins have been created yet. Communication methods
 * (emit, signal, getPlugin, require, has) are intentionally unavailable to
 * prevent access to incomplete data.
 */
type MinimalContext<G, C> = TeardownContext<G> & {
  /** This plugin's resolved config. Frozen. */
  readonly config: Readonly<C>;
};

/**
 * Init context -- minimal context plus all communication methods.
 * Used by: onInit
 *
 * All plugins are created and APIs are mounted. Dependencies can be checked
 * with require/has. State is not yet available (created separately).
 */
type InitContext<
  G,
  Bus extends Record<string, unknown>,
  Signals extends Record<string, unknown>,
  C
> = MinimalContext<G, C> & {
  /** Fire typed bus event. Constrained to BusContract keys. */
  emit: <K extends string & keyof Bus>(hook: K, payload: Bus[K]) => Promise<void>;

  /**
   * Fire signal. Overloaded:
   *   - Known names (in SignalRegistry): typed payload.
   *   - Unknown names: untyped payload (escape hatch).
   */
  signal: {
    <K extends string & keyof Signals>(name: K, payload: Signals[K]): Promise<void>;
    (name: string, payload?: unknown): Promise<void>;
  };

  /** Get plugin API by name. Returns undefined if not found. */
  getPlugin: <T = unknown>(name: string) => T | undefined;

  /** Get plugin API or throw with clear error. */
  require: <T = unknown>(name: string) => T;

  /** Check if a plugin is registered. */
  has: (name: string) => boolean;
};

/**
 * Full plugin context -- init context plus mutable state.
 * Used by: api, onStart
 *
 * Everything is live. The plugin's internal mutable state is available.
 * This is the richest context tier.
 */
type PluginContext<
  G,
  Bus extends Record<string, unknown>,
  Signals extends Record<string, unknown>,
  C,
  S
> = InitContext<G, Bus, Signals, C> & {
  /** This plugin's internal mutable state. Mutable by design. */
  state: S;
};

// =============================================================================
// Section 4: Spec Interfaces (exported)
// =============================================================================
// All spec interfaces use Variant B (async-compatible lifecycle).
// Generic constraints use `any` where TypeScript requires it for assignability
// in generic constraint positions. Values use `unknown`.
// =============================================================================

/**
 * Plugin specification defining a plugin's behavior, lifecycle, and API.
 * @template N - Plugin name as a string literal type
 * @template C - Plugin config type (void = no config)
 * @template A - Plugin API type (Record of methods/properties)
 * @template S - Plugin internal state type (void = no state)
 * @template G - Global config type (BaseConfig from framework)
 * @template Bus - Bus contract type (event name -> payload mapping)
 * @template Signals - Signal registry type (signal name -> payload mapping)
 */
interface PluginSpec<
  N extends string,
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  G extends Record<string, any> = Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  Bus extends Record<string, any> = Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  Signals extends Record<string, any> = Record<string, unknown>
> {
  /** Complete default config. Presence makes config OPTIONAL for consumer. Full C, not Partial<C>. */
  defaultConfig?: C;

  /** Declarative dependencies. Validated at Phase 0. NOT a topological sort -- just validation. */
  depends?: readonly string[];

  /** Create internal mutable state. Async-compatible. Runs before any other lifecycle. Minimal context. */
  createState?: (context: MinimalContext<G, C>) => S | Promise<S>;

  /** Validate config. No other plugins available. Async-compatible. */
  onCreate?: (context: MinimalContext<G, C>) => void | Promise<void>;

  /** Build the public API mounted on app.<pluginName>. Full context. Async-compatible. */
  api?: (context: PluginContext<G, Bus, Signals, C, S>) => A | Promise<A>;

  /** All plugins created and APIs mounted. Check dependencies here. Async-compatible. */
  onInit?: (context: InitContext<G, Bus, Signals, C>) => void | Promise<void>;

  /** App is starting. Async allowed. Full context. */
  onStart?: (context: PluginContext<G, Bus, Signals, C, S>) => void | Promise<void>;

  /** Teardown. Reverse order. Minimal context. */
  onStop?: (context: TeardownContext<G>) => void | Promise<void>;

  /** Final cleanup. Reverse order. Minimal context. */
  onDestroy?: (context: TeardownContext<G>) => void | Promise<void>;

  /**
   * Event subscriptions. Keys are event names, values are handlers.
   * Handles BOTH bus events (typed at BusContract level) and signals.
   * Handlers execute in plugin registration order, sequentially.
   */
  hooks?: Record<string, (...arguments_: unknown[]) => void | Promise<void>>;

  /** Sub-plugins. Flattened depth-first, children before parent. */
  plugins?: Array<PluginInstance<string, unknown, Record<string, unknown>, unknown>>;
}

/**
 * Component specification defining a component's behavior, lifecycle, and API.
 * Components use onMount/onUnmount instead of onStart/onStop.
 * At runtime, onMount maps to onStart and onUnmount maps to onStop.
 * @template N - Component name as a string literal type
 * @template C - Component config type (void = no config)
 * @template A - Component API type (Record of methods/properties)
 * @template S - Component internal state type (void = no state)
 * @template G - Global config type (BaseConfig from framework)
 * @template Bus - Bus contract type (event name -> payload mapping)
 * @template Signals - Signal registry type (signal name -> payload mapping)
 */
interface ComponentSpec<
  N extends string,
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  G extends Record<string, any> = Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  Bus extends Record<string, any> = Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  Signals extends Record<string, any> = Record<string, unknown>
> {
  /** Complete default config. Presence makes config OPTIONAL for consumer. */
  defaultConfig?: C;

  /** Declarative dependencies. Validated at Phase 0. */
  depends?: readonly string[];

  /** Create internal mutable state. Async-compatible. */
  createState?: (context: MinimalContext<G, C>) => S | Promise<S>;

  /** Component mounted. Maps to onStart at runtime. Full context. */
  onMount?: (context: PluginContext<G, Bus, Signals, C, S>) => void | Promise<void>;

  /** Component unmounted. Maps to onStop at runtime. Minimal context. */
  onUnmount?: (context: TeardownContext<G>) => void | Promise<void>;

  /** Event subscriptions. */
  hooks?: Record<string, (...arguments_: unknown[]) => void | Promise<void>>;

  /** Build the public API. Full context. Async-compatible. */
  api?: (context: PluginContext<G, Bus, Signals, C, S>) => A | Promise<A>;
}

/**
 * Module specification. Modules are flattening containers -- they group plugins,
 * components, and other modules for organizational purposes. Modules are consumed
 * during Phase 0 and do not exist at runtime.
 * @template N - Module name as a string literal type
 * @template C - Module config type (void = no config)
 */
interface ModuleSpec<N extends string, C = void> {
  /** Plugins contained in this module. */
  plugins?: Array<PluginInstance<string, unknown, Record<string, unknown>, unknown>>;

  /** Components contained in this module. */
  components?: Array<ComponentInstance<string, unknown, Record<string, unknown>, unknown>>;

  /** Nested modules. Recursive flattening. */
  modules?: Array<ModuleInstance<string, unknown>>;

  /** Called during Phase 0 flattening. The only place a module "runs". */
  onRegister?: (context: {
    readonly global: Readonly<unknown>;
    readonly config: Readonly<C>;
  }) => void;
}

// =============================================================================
// Section 5: Instance Interfaces (exported)
// =============================================================================
// Instance interfaces carry phantom types for type-level inference.
// The PHANTOM symbol key keeps _types and _hasDefaults minimally visible
// in IDE tooltips.
// =============================================================================

/**
 * A plugin instance produced by createPlugin. Carries phantom types for
 * compile-time type inference. The `_types` and `_hasDefaults` fields are
 * never read at runtime.
 * @template N - Plugin name as a string literal type
 * @template C - Plugin config type
 * @template A - Plugin API type
 * @template S - Plugin state type
 */
interface PluginInstance<
  N extends string = string,
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void
> {
  /** Discriminant for plugin/component/module identification. */
  readonly kind: "plugin";

  /** Plugin name. Used as the key on the App object. */
  readonly name: N;

  /** Phantom field carrying generic type parameters. Never read at runtime. */
  readonly _types: { config: C; api: A; state: S };

  /** Phantom field indicating whether defaultConfig is provided. Set by createPlugin. */
  readonly _hasDefaults: boolean;

  /** The plugin specification containing lifecycle methods and config. */
  // biome-ignore lint/suspicious/noExplicitAny: Spec uses any for framework generics since instances are decoupled from specific framework generics
  readonly spec: PluginSpec<N, C, A, S, any, any, any>;
}

/**
 * A component instance produced by createComponent. At runtime, components
 * are treated identically to plugins (onMount -> onStart, onUnmount -> onStop).
 * @template N - Component name as a string literal type
 * @template C - Component config type
 * @template A - Component API type
 * @template S - Component state type
 */
interface ComponentInstance<
  N extends string = string,
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void
> {
  /** Discriminant for plugin/component/module identification. */
  readonly kind: "component";

  /** Component name. Used as the key on the App object. */
  readonly name: N;

  /** Phantom field carrying generic type parameters. Never read at runtime. */
  readonly _types: { config: C; api: A; state: S };

  /** Phantom field indicating whether defaultConfig is provided. */
  readonly _hasDefaults: boolean;

  /** The component specification containing lifecycle methods and config. */
  // biome-ignore lint/suspicious/noExplicitAny: Spec uses any for framework generics since instances are decoupled from specific framework generics
  readonly spec: ComponentSpec<N, C, A, S, any, any, any>;
}

/**
 * A module instance produced by createModule. Modules are consumed during
 * Phase 0 flattening and do not exist at runtime.
 * @template N - Module name as a string literal type
 * @template C - Module config type
 */
interface ModuleInstance<N extends string = string, C = void> {
  /** Discriminant for plugin/component/module identification. */
  readonly kind: "module";

  /** Module name. Used for identification and error messages. */
  readonly name: N;

  /** The module specification containing children and onRegister. */
  readonly spec: ModuleSpec<N, C>;
}

// =============================================================================
// Section 6: Type-Level Helpers (internal)
// =============================================================================
// These extract type information from plugin instances for use by aggregate
// types and the App type. All are internal to the package.
// =============================================================================

/** Extract the name literal type from a plugin instance. */
// biome-ignore lint/suspicious/noExplicitAny: Required for conditional type inference pattern
type PluginName<P> = P extends PluginInstance<infer N, any, any, any> ? N : never;

/** Extract the config type from a plugin instance. */
// biome-ignore lint/suspicious/noExplicitAny: Required for conditional type inference pattern
type PluginConfigType<P> = P extends PluginInstance<any, infer C, any, any> ? C : never;

/** Extract the API type from a plugin instance. */
// biome-ignore lint/suspicious/noExplicitAny: Required for conditional type inference pattern
type PluginApiType<P> = P extends PluginInstance<any, any, infer A, any> ? A : never;

/**
 * Check if a config type is void or empty (no keys).
 * Used by BuildPluginConfigs to exclude plugins with no config.
 */
type IsEmptyConfig<C> = C extends void ? true : [keyof C] extends [never] ? true : false;

/**
 * Check if a plugin instance has defaultConfig.
 * Used by BuildPluginConfigs for optional vs required determination.
 */
type HasDefaults<P> = P extends { _hasDefaults: true } ? true : false;

/**
 * Extract a plugin's API augmented with its config, by plugin name from a union.
 * The config property uses Readonly<C> for IDE hover readability.
 */
type PluginApiByName<P, N extends string> =
  // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type inference pattern
  P extends PluginInstance<N, infer C, infer A, any>
    ? Prettify<A & { readonly config: C extends void ? Record<string, never> : Readonly<C> }>
    : never;

// =============================================================================
// Section 7: Aggregate Type Helpers (internal)
// =============================================================================
// These combine multiple plugin types into composite types used by createApp,
// createConfig, and the App type. All are internal to the package.
// =============================================================================

/**
 * Build the config map type for createApp's pluginConfigs parameter.
 *
 * Rules:
 *   - C is void/empty -> excluded (no config key)
 *   - defaultConfig provided -> OPTIONAL (Partial<C>)
 *   - no defaultConfig -> REQUIRED (full C)
 */
type BuildPluginConfigs<P extends PluginInstance> = Prettify<
  OmitNever<{
    [K in P as IsEmptyConfig<PluginConfigType<K>> extends true
      ? never
      : HasDefaults<K> extends true
        ? never
        : PluginName<K>]: PluginConfigType<K>;
  }> &
    OmitNever<{
      [K in P as IsEmptyConfig<PluginConfigType<K>> extends true
        ? never
        : HasDefaults<K> extends true
          ? PluginName<K>
          : never]?: Partial<PluginConfigType<K>>;
    }>
>;

/**
 * Build the app's API surface from the plugin union.
 * Maps each plugin in the union to a property keyed by plugin name,
 * with the plugin's API augmented with a readonly config property.
 */
type BuildPluginApis<P extends PluginInstance> = {
  [K in P as PluginName<K>]: Prettify<
    PluginApiType<K> & {
      readonly config: PluginConfigType<K> extends void
        ? Record<string, never>
        : Readonly<PluginConfigType<K>>;
    }
  >;
};

/**
 * Framework defaults shape passed to createCore.
 * Defines the default global config, built-in plugins/components/modules,
 * and optional framework lifecycle callbacks.
 * @template BaseConfig - The framework's global config shape
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
type CoreDefaults<BaseConfig extends Record<string, any>> = {
  /** Default values for BaseConfig. Consumer overrides via createConfig. */
  config: BaseConfig;

  /** Plugins that ship with the framework. Always loaded. Consumer cannot remove them. */
  plugins?: PluginInstance[];

  /** Components that ship with the framework. */
  components?: ComponentInstance[];

  /** Modules that ship with the framework. */
  modules?: ModuleInstance[];

  /** Called once when createApp is invoked, before any plugin lifecycle. Sync only. */
  onBoot?: (context: { config: Readonly<BaseConfig> }) => void;

  /** Called after all plugins have completed init. */
  onReady?: (context: { config: Readonly<BaseConfig> }) => void | Promise<void>;

  /** Called after all plugins have stopped. */
  onShutdown?: (context: { config: Readonly<BaseConfig> }) => void | Promise<void>;
};

/**
 * Opaque config object produced by createConfig.
 * Carries the full plugin union type for createApp to type pluginConfigs against.
 * @template G - Global config type (BaseConfig)
 * @template DefaultP - Default plugin union from framework
 * @template ExtraPlugins - Extra plugins added by consumer
 */
type AppConfig<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  G extends Record<string, any>,
  DefaultP extends PluginInstance,
  ExtraPlugins extends readonly PluginInstance[]
> = {
  readonly _brand: "AppConfig";
  readonly global: Partial<G>;
  readonly extras: ExtraPlugins;
  /** Phantom: union of all plugins (defaults + extras). Used by createApp for typing. */
  readonly _allPlugins: DefaultP | ExtraPlugins[number];
};

/**
 * Custom type error for getPlugin/require when a plugin name is not registered.
 * Produces a readable compile-time error message.
 */
type PluginNotRegistered<N extends string> =
  `Plugin '${N}' is not registered. Check your plugin list in createConfig.`;

/**
 * The full app type returned by createApp. Variant B with SignalRegistry.
 * Provides typed emit, overloaded signal, typed getPlugin/require constrained
 * to registered plugin names, lifecycle methods, and plugin API surface.
 * @template G - Global config type
 * @template Bus - Bus contract type
 * @template Signals - Signal registry type
 * @template P - Plugin union type
 */
type App<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  G extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  Bus extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  Signals extends Record<string, any>,
  P extends PluginInstance
> = Prettify<
  {
    /** Global config, frozen. */
    readonly config: Readonly<G> & {
      get: <K extends keyof G>(key: K) => G[K];
    };

    /** Fire typed bus event. Constrained to BusContract. */
    emit: <K extends string & keyof Bus>(hook: K, payload: Bus[K]) => Promise<void>;

    /** Fire signal. Typed for known names, untyped for unknown names. */
    signal: {
      <K extends string & keyof Signals>(name: K, payload: Signals[K]): Promise<void>;
      (name: string, payload?: unknown): Promise<void>;
    };

    /**
     * Get plugin API by name. Typed -- constrained to registered plugin names.
     * Returns undefined if not found.
     */
    getPlugin: <N extends PluginName<P>>(name: N) => PluginApiByName<P, N> | undefined;

    /**
     * Get plugin API or throw with clear error. Typed -- constrained to registered plugin names.
     */
    require: <N extends PluginName<P>>(name: N) => PluginApiByName<P, N>;

    /** Check if a plugin is registered. */
    has: (name: string) => boolean;

    /** Start the app. Idempotent. */
    start: () => Promise<void>;

    /** Stop the app. Reverse order. Idempotent. */
    stop: () => Promise<void>;

    /** Destroy. Calls stop() if needed. Idempotent. */
    destroy: () => Promise<void>;
  } & BuildPluginApis<P>
>;

// -----------------------------------------------------------------------------
// CoreAPI Function Type Aliases (stubs -- refined in later phases)
// -----------------------------------------------------------------------------

/**
 * Type alias for the createConfig function returned by createCore.
 * Binds global overrides and extra plugins into an opaque AppConfig.
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
type CreateConfigFunction<BaseConfig extends Record<string, any>> = <
  const ExtraPlugins extends readonly PluginInstance[] = []
>(
  globalConfig: Partial<BaseConfig>,
  extraPlugins?: ExtraPlugins
) => AppConfig<BaseConfig, PluginInstance, ExtraPlugins>;

/**
 * Type alias for the createApp function returned by createCore.
 * Wires everything together and returns a frozen app.
 */
type CreateAppFunction<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BusContract extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  SignalRegistry extends Record<string, any>
> = <P extends PluginInstance>(
  // biome-ignore lint/suspicious/noExplicitAny: AppConfig accepts any plugin union at call site
  config: AppConfig<BaseConfig, any, any>,
  pluginConfigs: BuildPluginConfigs<P>
) => Promise<App<BaseConfig, BusContract, SignalRegistry, P>>;

/**
 * Type alias for the createPlugin function returned by createCore.
 * Creates a plugin instance bound to the framework's generics.
 */
type CreatePluginFunction<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BusContract extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  SignalRegistry extends Record<string, any>
> = <
  N extends string,
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void
>(
  name: N,
  spec: PluginSpec<N, C, A, S, BaseConfig, BusContract, SignalRegistry>
) => PluginInstance<N, C, A, S>;

/**
 * Type alias for the createComponent function returned by createCore.
 */
type CreateComponentFunction<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BusContract extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  SignalRegistry extends Record<string, any>
> = <
  N extends string,
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void
>(
  name: N,
  spec: ComponentSpec<N, C, A, S, BaseConfig, BusContract, SignalRegistry>
) => ComponentInstance<N, C, A, S>;

/**
 * Type alias for the createModule function returned by createCore.
 */
type CreateModuleFunction = <N extends string, C = void>(
  name: N,
  spec: ModuleSpec<N, C>
) => ModuleInstance<N, C>;

/**
 * Type alias for the createEventBus function returned by createCore.
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
type CreateEventBusFunction = <Events extends Record<string, any> = Record<string, unknown>>() => {
  emit: <K extends keyof Events>(event: K, payload: Events[K]) => Promise<void>;
  on: <K extends keyof Events>(
    event: K,
    handler: (payload: Events[K]) => void | Promise<void>
  ) => () => void;
  off: <K extends keyof Events>(event: K, handler: (...arguments_: unknown[]) => void) => void;
  clear: () => void;
};

/**
 * Type alias for the createPluginFactory function returned by createCore.
 * Creates a factory for making named instances of the same plugin shape.
 */
type CreatePluginFactoryFunction<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BusContract extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  SignalRegistry extends Record<string, any>
> = <
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void
>(
  spec: Omit<PluginSpec<string, C, A, S, BaseConfig, BusContract, SignalRegistry>, "plugins">
) => <N extends string>(name: N) => PluginInstance<N, C, A, S>;

/**
 * What createCore returns. All 7 functions typed against framework generics.
 * Variant B: 3 generics (BaseConfig, BusContract, SignalRegistry) + 7 functions.
 * @template BaseConfig - The framework's global config shape
 * @template BusContract - Map of event names to payload types
 * @template SignalRegistry - Map of signal names to payload types
 */
type CoreAPI<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BusContract extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  SignalRegistry extends Record<string, any>
> = {
  createConfig: CreateConfigFunction<BaseConfig>;
  createApp: CreateAppFunction<BaseConfig, BusContract, SignalRegistry>;
  createPlugin: CreatePluginFunction<BaseConfig, BusContract, SignalRegistry>;
  createComponent: CreateComponentFunction<BaseConfig, BusContract, SignalRegistry>;
  createModule: CreateModuleFunction;
  createEventBus: CreateEventBusFunction;
  createPluginFactory: CreatePluginFactoryFunction<BaseConfig, BusContract, SignalRegistry>;
};

// =============================================================================
// Exports
// =============================================================================
// Only instance types and spec interfaces are exported.
// Everything else (helpers, contexts, aggregates) stays internal.
// =============================================================================

export type {
  // Spec interfaces (public API for framework and plugin authors)
  PluginSpec,
  ComponentSpec,
  ModuleSpec,
  // Instance interfaces (public API for framework and plugin authors)
  PluginInstance,
  ComponentInstance,
  ModuleInstance,
  // Internal types re-exported for use within the package (not re-exported from index.ts)
  Prettify,
  OmitNever,
  TeardownContext,
  MinimalContext,
  InitContext,
  PluginContext,
  PluginName,
  PluginConfigType,
  PluginApiType,
  IsEmptyConfig,
  HasDefaults,
  PluginApiByName,
  BuildPluginConfigs,
  BuildPluginApis,
  CoreDefaults,
  AppConfig,
  App,
  CoreAPI,
  PluginNotRegistered,
  PhantomTypes,
  PhantomDefaults,
  // Function type aliases
  CreateConfigFunction,
  CreateAppFunction,
  CreatePluginFunction,
  CreateComponentFunction,
  CreateModuleFunction,
  CreateEventBusFunction,
  CreatePluginFactoryFunction
};
