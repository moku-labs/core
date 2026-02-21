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
// All context types use unified EventContract (single generic for all events).
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
 * (emit, getPlugin, require, has) are intentionally unavailable to
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
 * @template G - Global config type
 * @template Events - EventContract type (unified event name -> payload mapping)
 * @template C - Plugin config type
 * @template Deps - Depends tuple carrying declared plugin dependencies
 */
type InitContext<
  G,
  Events extends Record<string, unknown>,
  C,
  Deps extends readonly PluginLikeInstance[] = readonly PluginLikeInstance[]
> = MinimalContext<G, C> & {
  /**
   * Fire an event. Overloaded:
   *   - Known names (in EventContract): typed required payload.
   *   - Unknown names: untyped optional payload (escape hatch).
   */
  emit: {
    <K extends string & keyof Events>(name: K, payload: Events[K]): Promise<void>;
    (name: string, payload?: unknown): Promise<void>;
  };

  /**
   * Get plugin API by instance or name. Three overload tiers:
   * 1. Pass instance from depends -> fully typed API | undefined
   * 2. Pass name string from depends tuple -> typed API | undefined
   * 3. Pass any string -> unknown (untyped escape hatch)
   */
  getPlugin: {
    <P extends Deps[number]>(plugin: P): PluginApiType<P> | undefined;
    <N extends PluginName<Deps[number]>>(name: N): ExtractDepsMap<Deps>[N] | undefined;
    (name: string): unknown;
  };

  /**
   * Get plugin API or throw. Three overload tiers:
   * 1. Pass instance from depends -> fully typed API
   * 2. Pass name string from depends tuple -> typed API
   * 3. Pass any string -> unknown (untyped escape hatch)
   */
  require: {
    <P extends Deps[number]>(plugin: P): PluginApiType<P>;
    <N extends PluginName<Deps[number]>>(name: N): ExtractDepsMap<Deps>[N];
    (name: string): unknown;
  };

  /** Check if a plugin is registered. */
  has: (name: string) => boolean;
};

/**
 * Full plugin context -- init context plus mutable state.
 * Used by: api, onStart
 *
 * Everything is live. The plugin's internal mutable state is available.
 * This is the richest context tier.
 * @template G - Global config type
 * @template Events - EventContract type (unified event name -> payload mapping)
 * @template C - Plugin config type
 * @template S - Plugin state type
 * @template Deps - Depends tuple carrying declared plugin dependencies
 */
type PluginContext<
  G,
  Events extends Record<string, unknown>,
  C,
  S,
  Deps extends readonly PluginLikeInstance[] = readonly PluginLikeInstance[]
> = InitContext<G, Events, C, Deps> & {
  /** This plugin's internal mutable state. Mutable by design. */
  state: S;
};

// =============================================================================
// Section 4: Spec Interfaces (exported)
// =============================================================================
// All spec interfaces use unified EventContract (single generic for all events).
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
 * @template Events - EventContract type (unified event name -> payload mapping)
 * @template Deps - Depends tuple carrying declared plugin dependencies
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
  Events extends Record<string, any> = Record<string, unknown>,
  Deps extends readonly PluginLikeInstance[] = readonly PluginLikeInstance[]
> {
  /** Complete default config. Presence makes config OPTIONAL for consumer. Full C, not Partial<C>. */
  defaultConfig?: C;

  /** Declarative dependencies. Instance-based -- accepts plugin/component instances. */
  depends?: Deps;

  /** Create internal mutable state. Async-compatible. Runs before any other lifecycle. Minimal context. */
  createState?: (context: MinimalContext<G, C>) => S | Promise<S>;

  /** Validate config. No other plugins available. Async-compatible. */
  onCreate?: (context: MinimalContext<G, C>) => void | Promise<void>;

  /** Build the public API mounted on app.<pluginName>. Full context. Async-compatible. */
  api?: (context: PluginContext<G, Events, C, S, Deps>) => A | Promise<A>;

  /** All plugins created and APIs mounted. Check dependencies here. Async-compatible. */
  onInit?: (context: InitContext<G, Events, C, Deps>) => void | Promise<void>;

  /** App is starting. Async allowed. Full context. */
  onStart?: (context: PluginContext<G, Events, C, S, Deps>) => void | Promise<void>;

  /** Teardown. Reverse order. Minimal context. */
  onStop?: (context: TeardownContext<G>) => void | Promise<void>;

  /** Final cleanup. Reverse order. Minimal context. */
  onDestroy?: (context: TeardownContext<G>) => void | Promise<void>;

  /**
   * Event subscriptions. Keys are event names, values are handlers.
   * Known events (in EventContract) get typed payloads.
   * Unknown/ad-hoc event names get `unknown` payload.
   * Handlers execute in plugin registration order, sequentially.
   */
  hooks?: {
    [K in string]?: K extends keyof Events
      ? (payload: Events[K]) => void | Promise<void>
      : (payload: unknown) => void | Promise<void>;
  };

  /** Sub-plugins. Flattened depth-first, children before parent. */
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete instances use void/never defaults that conflict with unknown in contravariant positions
  plugins?: Array<PluginInstance<string, any, any, any>>;
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
 * @template Events - EventContract type (unified event name -> payload mapping)
 * @template Deps - Depends tuple carrying declared plugin dependencies
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
  Events extends Record<string, any> = Record<string, unknown>,
  Deps extends readonly PluginLikeInstance[] = readonly PluginLikeInstance[]
> {
  /** Complete default config. Presence makes config OPTIONAL for consumer. */
  defaultConfig?: C;

  /** Declarative dependencies. Instance-based -- accepts plugin/component instances. */
  depends?: Deps;

  /** Create internal mutable state. Async-compatible. */
  createState?: (context: MinimalContext<G, C>) => S | Promise<S>;

  /** Component mounted. Maps to onStart at runtime. Full context. */
  onMount?: (context: PluginContext<G, Events, C, S, Deps>) => void | Promise<void>;

  /** Component unmounted. Maps to onStop at runtime. Minimal context. */
  onUnmount?: (context: TeardownContext<G>) => void | Promise<void>;

  /**
   * Event subscriptions. Known events get typed payloads, unknown events get `unknown`.
   */
  hooks?: {
    [K in string]?: K extends keyof Events
      ? (payload: Events[K]) => void | Promise<void>
      : (payload: unknown) => void | Promise<void>;
  };

  /** Build the public API. Full context. Async-compatible. */
  api?: (context: PluginContext<G, Events, C, S, Deps>) => A | Promise<A>;
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
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete instances use void/never defaults that conflict with unknown in contravariant positions
  plugins?: Array<PluginInstance<string, any, any, any>>;

  /** Components contained in this module. */
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete instances use void/never defaults that conflict with unknown in contravariant positions
  components?: Array<ComponentInstance<string, any, any, any>>;

  /** Nested modules. Recursive flattening. */
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete instances use void defaults that conflict with unknown in contravariant positions
  modules?: Array<ModuleInstance<string, any>>;

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
  readonly spec: ComponentSpec<N, C, A, S, any, any, any> & {
    /** Present at runtime after createComponent maps onMount -> onStart. */
    // biome-ignore lint/suspicious/noExplicitAny: Widened to reflect runtime shape after lifecycle mapping
    readonly onStart?: ((...arguments_: any[]) => any) | undefined;
    /** Present at runtime after createComponent maps onUnmount -> onStop. */
    // biome-ignore lint/suspicious/noExplicitAny: Widened to reflect runtime shape after lifecycle mapping
    readonly onStop?: ((...arguments_: any[]) => any) | undefined;
  };
}

/** Union of PluginInstance | ComponentInstance for constraints that accept both. */
type PluginLikeInstance =
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  | PluginInstance<string, any, any, any>
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  | ComponentInstance<string, any, any, any>;

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

/** Type for the depends field on PluginSpec/ComponentSpec. Instance-only, no strings. */
type DependsTuple = readonly PluginLikeInstance[];

/**
 * Extracts a name -> API mapping from a depends tuple.
 * Given [PluginInstance<"router", C, RouterApi, S>, PluginInstance<"auth", C, AuthApi, S>],
 * produces { router: RouterApi; auth: AuthApi }.
 */
type ExtractDepsMap<Deps extends readonly PluginLikeInstance[]> = {
  [K in Deps[number] as PluginName<K>]: PluginApiType<K>;
};

/** Extract the name literal type from a plugin or component instance (structural). */
type PluginName<P> = P extends { readonly name: infer N extends string } ? N : never;

/** Extract the config type from a plugin or component instance (structural). */
type PluginConfigType<P> = P extends { readonly _types: { config: infer C } } ? C : never;

/** Extract the API type from a plugin or component instance (structural). */
type PluginApiType<P> = P extends { readonly _types: { api: infer A } } ? A : never;

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
 * Extract a plugin's raw API by plugin name from a union (structural).
 * Config is NOT attached -- config lives on app.configs per CONTEXT decision.
 */
type PluginApiByName<P, N extends string> = P extends {
  readonly name: N;
  readonly _types: { api: infer A };
}
  ? Prettify<A>
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
type BuildPluginConfigs<P extends PluginLikeInstance> = Prettify<
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
 * Maps each plugin with a non-void API to a property keyed by plugin name.
 * Plugins with void/empty API (Record<string, never>) are excluded from the app surface.
 * Config is NOT attached to the API -- it lives on app.configs per CONTEXT decision.
 */
type BuildPluginApis<P extends PluginLikeInstance> = {
  [K in P as PluginApiType<K> extends Record<string, never> ? never : PluginName<K>]: Prettify<
    PluginApiType<K>
  >;
};

/**
 * Build the per-plugin configs accessor type for app.configs.
 * Maps every plugin name to its resolved frozen config.
 * Plugins with void config get Record<string, never>.
 */
type BuildPluginConfigsAccessor<P extends PluginLikeInstance> = {
  readonly [K in P as PluginName<K>]: PluginConfigType<K> extends void
    ? Record<string, never>
    : Readonly<PluginConfigType<K>>;
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
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete plugins have specific config/api/state types
  plugins?: Array<PluginInstance<string, any, any, any>>;

  /** Components that ship with the framework. */
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete components have specific config/api/state types
  components?: Array<ComponentInstance<string, any, any, any>>;

  /** Modules that ship with the framework. */
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete modules have specific config types
  modules?: Array<ModuleInstance<string, any>>;

  /** Called once when createApp is invoked, before any plugin lifecycle. Sync only. */
  onBoot?: (context: { config: Readonly<BaseConfig> }) => void;

  /** Called after all plugins have completed init. */
  onReady?: (context: { config: Readonly<BaseConfig> }) => void | Promise<void>;

  /** Called after all plugins have stopped. */
  onShutdown?: (context: { config: Readonly<BaseConfig> }) => void | Promise<void>;

  /** Called when a lifecycle method throws. Notification-only -- error always propagates after onError returns. */
  onError?: (context: {
    error: unknown;
    phase: string;
    pluginName?: string;
  }) => void | Promise<void>;
};

/**
 * Opaque config object produced by createConfig.
 * Carries the full plugin union type for createApp to type pluginConfigs against.
 * Contains pre-resolved global and per-plugin configs (frozen), the flattened
 * plugin list, and a phantom `_allPlugins` union for downstream type inference.
 * @template G - Global config type (BaseConfig)
 * @template DefaultP - Default plugin union from framework
 * @template ExtraPlugins - Extra plugins added by consumer
 */
type AppConfig<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  G extends Record<string, any>,
  DefaultP extends PluginLikeInstance = never,
  ExtraPlugins extends readonly PluginLikeInstance[] = []
> = {
  readonly _brand: "AppConfig";
  /** Fully resolved global config (framework defaults + consumer overrides). Frozen. */
  readonly global: Readonly<G>;
  readonly extras: ExtraPlugins;
  /** Pre-resolved per-plugin configs. Keys are plugin names, values are frozen config objects. */
  readonly _pluginConfigs: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  /** Flattened, validated plugin list in execution order. */
  readonly _plugins: ReadonlyArray<PluginInstance>;
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
 * The full app type returned by createApp. Uses unified EventContract.
 * Provides typed emit with overloaded signatures (typed for known events,
 * untyped for ad-hoc events), typed getPlugin/require constrained
 * to registered plugin names, lifecycle methods, and plugin API surface.
 * @template G - Global config type
 * @template Events - EventContract type (unified event name -> payload mapping)
 * @template P - Plugin union type
 */
type App<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  G extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  Events extends Record<string, any>,
  P extends PluginLikeInstance = PluginLikeInstance
> = Prettify<
  {
    /** Global config, frozen. */
    readonly config: Readonly<G>;

    /** Per-plugin resolved configs accessor. Frozen. */
    readonly configs: Prettify<BuildPluginConfigsAccessor<P>>;

    /**
     * Fire an event. Overloaded:
     *   - Known names (in EventContract): typed required payload.
     *   - Unknown names: untyped optional payload (escape hatch).
     */
    emit: {
      <K extends string & keyof Events>(name: K, payload: Events[K]): Promise<void>;
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

    /** Destroy. Calls stop() if needed. Terminal -- second call throws. */
    destroy: () => Promise<void>;
  } & BuildPluginApis<P>
>;

// -----------------------------------------------------------------------------
// CoreAPI Function Type Aliases
// -----------------------------------------------------------------------------

/**
 * Union type for items that can be passed to createConfig's plugins option.
 * Accepts plugins, components, and modules -- all are valid inputs
 * because createConfig calls flattenPlugins which handles all kinds.
 */
type PluginLike =
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete instances use specific type parameters
  | PluginInstance<string, any, any, any>
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete instances use specific type parameters
  | ComponentInstance<string, any, any, any>
  // biome-ignore lint/suspicious/noExplicitAny: Widened for assignability -- concrete instances use specific type parameters
  | ModuleInstance<string, any>;

/**
 * Type alias for the createConfig function returned by createCore.
 * Accepts an options object with config overrides, extra plugins, and per-plugin configs.
 * Returns an opaque AppConfig carrying resolved configs and the full plugin union type.
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
type CreateConfigFunction<BaseConfig extends Record<string, any>> = <
  const ExtraPlugins extends readonly PluginLikeInstance[] = []
>(options?: {
  config?: Partial<BaseConfig>;
  plugins?: ExtraPlugins | readonly PluginLike[];
  pluginConfigs?: Record<string, unknown>;
}) => AppConfig<BaseConfig, never, ExtraPlugins>;

/**
 * Type alias for the createApp function returned by createCore.
 * Accepts a single AppConfig (which already contains pre-resolved plugin configs
 * from createConfig) and returns a frozen App.
 */
type CreateAppFunction<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  EventContract extends Record<string, any>
> = <
  DefaultP extends PluginLikeInstance = never,
  ExtraPlugins extends readonly PluginLikeInstance[] = []
>(
  config: AppConfig<BaseConfig, DefaultP, ExtraPlugins>
) => Promise<App<BaseConfig, EventContract, DefaultP | ExtraPlugins[number]>>;

/**
 * Type alias for the createPlugin function returned by createCore.
 * Creates a plugin instance bound to the framework's generics.
 */
type CreatePluginFunction<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  EventContract extends Record<string, any>
> = <
  N extends string,
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void,
  Deps extends readonly PluginLikeInstance[] = readonly PluginLikeInstance[]
>(
  name: N,
  spec: PluginSpec<N, C, A, S, BaseConfig, EventContract, Deps>
) => PluginInstance<N, C, A, S>;

/**
 * Type alias for the createComponent function returned by createCore.
 */
type CreateComponentFunction<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  EventContract extends Record<string, any>
> = <
  N extends string,
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void,
  Deps extends readonly PluginLikeInstance[] = readonly PluginLikeInstance[]
>(
  name: N,
  spec: ComponentSpec<N, C, A, S, BaseConfig, EventContract, Deps>
) => ComponentInstance<N, C, A, S>;

/**
 * Type alias for the createModule function returned by createCore.
 */
type CreateModuleFunction = <N extends string, C = void>(
  name: N,
  spec: ModuleSpec<N, C>
) => ModuleInstance<N, C>;

/**
 * A typed event bus instance with emit, on, off, once, and clear methods.
 * Returned by createEventBus. Consumers can use this type for annotations.
 * @template Events - Map of event names to payload types
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
type EventBus<Events extends Record<string, any> = Record<string, unknown>> = {
  /** Fire a typed event. Dispatches to all registered handlers sequentially. */
  emit: <K extends keyof Events>(event: K, payload: Events[K]) => Promise<void>;
  /** Subscribe to an event. Returns an unsubscribe function. */
  on: <K extends keyof Events>(
    event: K,
    handler: (payload: Events[K]) => void | Promise<void>
  ) => () => void;
  /** Remove a specific handler by reference. No-op if not found. */
  off: <K extends keyof Events>(
    event: K,
    handler: (payload: Events[K]) => void | Promise<void>
  ) => void;
  /** Subscribe to an event for a single invocation. Returns an unsubscribe function. */
  once: <K extends keyof Events>(
    event: K,
    handler: (payload: Events[K]) => void | Promise<void>
  ) => () => void;
  /** Clear all handlers, or handlers for a specific event. */
  clear: (event?: keyof Events) => void;
};

/**
 * Type alias for the createEventBus function returned by createCore.
 * Accepts an optional config for maxListeners and onError.
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
type CreateEventBusFunction = <
  Events extends Record<string, any> = Record<string, unknown>
>(config?: {
  maxListeners?: number;
  onError?: (error: unknown) => void;
}) => EventBus<Events>;

/**
 * Type alias for the createPluginFactory function returned by createCore.
 * Creates a factory for making named instances of the same plugin shape.
 */
type CreatePluginFactoryFunction<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  EventContract extends Record<string, any>
> = <
  C = void,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  A extends Record<string, any> = Record<string, never>,
  S = void,
  Deps extends readonly PluginLikeInstance[] = readonly PluginLikeInstance[]
>(
  spec: Omit<PluginSpec<string, C, A, S, BaseConfig, EventContract, Deps>, "plugins">
) => <N extends string>(name: N) => PluginInstance<N, C, A, S>;

/**
 * What createCore returns. All 7 functions typed against framework generics.
 * Uses unified EventContract (2 generics: BaseConfig, EventContract).
 * @template BaseConfig - The framework's global config shape
 * @template EventContract - Map of all event names to payload types (unified bus + signals)
 */
type CoreAPI<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  EventContract extends Record<string, any>
> = {
  createConfig: CreateConfigFunction<BaseConfig>;
  createApp: CreateAppFunction<BaseConfig, EventContract>;
  createPlugin: CreatePluginFunction<BaseConfig, EventContract>;
  createComponent: CreateComponentFunction<BaseConfig, EventContract>;
  createModule: CreateModuleFunction;
  createEventBus: CreateEventBusFunction;
  createPluginFactory: CreatePluginFactoryFunction<BaseConfig, EventContract>;
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
  PluginLikeInstance,
  // Internal types re-exported for use within the package (not re-exported from index.ts)
  Prettify,
  OmitNever,
  TeardownContext,
  MinimalContext,
  InitContext,
  PluginContext,
  DependsTuple,
  ExtractDepsMap,
  PluginName,
  PluginConfigType,
  PluginApiType,
  IsEmptyConfig,
  HasDefaults,
  PluginApiByName,
  BuildPluginConfigs,
  BuildPluginApis,
  BuildPluginConfigsAccessor,
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
  CreatePluginFactoryFunction,
  EventBus
};
