import type { EmitFunction, PluginInstance, UnionToIntersection } from "./types";

/**
 * Framework configuration object captured by `createCoreConfig`.
 * @example
 * ```ts
 * type SiteConfig = FrameworkConfig;
 * ```
 */
type FrameworkConfig = Record<string, unknown>;

/**
 * Framework event map captured by `createCoreConfig`.
 * @example
 * ```ts
 * type SiteEvents = FrameworkEventMap;
 * ```
 */
type FrameworkEventMap = Record<string, unknown>;

/**
 * Empty event map used as the default when a plugin declares no custom events.
 * @example
 * ```ts
 * type NoCustomEvents = EmptyPluginEventMap;
 * ```
 */
type EmptyPluginEventMap = Record<never, never>;

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
  readonly global: Readonly<GlobalConfig>;
  readonly config: Readonly<PluginConfig>;
  state: PluginState;
  emit: EmitFunction<AllEvents>;
  getPlugin: <PluginCandidate extends PluginLike>(
    plugin: PluginCandidate
  ) => ExtractPluginApi<PluginCandidate> | undefined;
  require: <PluginCandidate extends PluginLike>(
    plugin: PluginCandidate
  ) => ExtractPluginApi<PluginCandidate>;
  has: (name: string) => boolean;
};

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
  PluginConfig,
  PluginState,
  PluginApi extends Record<string, unknown>,
  DependencyPlugins extends DependencyPluginTuple
> = {
  /**
   * Declare plugin-specific events via a register callback.
   * The kernel calls this at startup to build the event catalog.
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
  config?: PluginConfig;
  depends?: DependencyPlugins;
  plugins?: PluginLike[];
  createState?: (context: {
    readonly global: Readonly<GlobalConfig>;
    readonly config: Readonly<PluginConfig>;
  }) => PluginState;
  api?: (
    context: PluginExecutionContext<
      GlobalConfig,
      MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>,
      PluginConfig,
      PluginState
    >
  ) => PluginApi;
  onInit?: (
    context: PluginExecutionContext<
      GlobalConfig,
      MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>,
      PluginConfig,
      PluginState
    >
  ) => void | Promise<void>;
  onStart?: (
    context: PluginExecutionContext<
      GlobalConfig,
      MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>,
      PluginConfig,
      PluginState
    >
  ) => void | Promise<void>;
  onStop?: (context: { readonly global: Readonly<GlobalConfig> }) => void | Promise<void>;
  hooks?: {
    [EventName in string]?: EventName extends keyof MergedPluginEvents<
      GlobalEventMap,
      PluginEventMap,
      DependencyPlugins
    >
      ? (
          payload: MergedPluginEvents<GlobalEventMap, PluginEventMap, DependencyPlugins>[EventName]
        ) => void | Promise<void>
      : (payload: unknown) => void | Promise<void>;
  };
};

/**
 * Bound createPlugin function type, parameterized by the framework's Config and Events.
 *
 * Two overloads handle the partial inference problem:
 * - Overload 1 (1 type param): `createPlugin<PluginEvents>(name, spec)` -- PluginEvents explicit, rest inferred
 * - Overload 2 (0 or 6 type params): `createPlugin(name, spec)` -- all inferred
 *
 * TypeScript selects overloads by matching number of explicit type arguments.
 * @example
 * ```ts
 * const { createPlugin } = createCoreConfig<MyConfig, MyEvents>("my-app", { config: defaults });
 * const router = createPlugin("router", { config: { basePath: "/" } });
 * const renderer = createPlugin<RendererEvents>("renderer", { api: ctx => ({ ... }) });
 * ```
 */
type BoundCreatePluginFunction<
  GlobalConfig extends FrameworkConfig,
  GlobalEventMap extends FrameworkEventMap
> = {
  // Overload 1: Zero explicit generics. Everything inferred from spec.
  // Used as: createPlugin("router", { ... })
  // Must be first so TypeScript tries it before the less-specific overload.
  <
    const PluginName extends string = string,
    PluginConfig = Record<string, never>,
    PluginState = Record<string, never>,
    PluginApi extends Record<string, unknown> = Record<string, never>,
    DependencyPlugins extends DependencyPluginTuple = readonly [],
    PluginEventMap extends Record<string, unknown> = EmptyPluginEventMap
  >(
    name: PluginName,
    spec: CreatePluginSpec<
      GlobalConfig,
      GlobalEventMap,
      PluginEventMap,
      PluginConfig,
      PluginState,
      PluginApi,
      DependencyPlugins
    >
  ): PluginInstance<PluginName, PluginConfig, PluginState, PluginApi, PluginEventMap>;

  // Overload 2: One explicit generic (PluginEvents). Rest inferred from spec.
  // Used as: createPlugin<RendererEvents>("renderer", { ... })
  // Falls back to this when overload 1 fails with explicit type arg.
  // Name type is `string` (not literal) due to TypeScript partial inference
  // limitation. BuildPluginApis filters out non-literal names to prevent
  // string index signature pollution on the App type.
  <PluginEventMap extends Record<string, unknown>>(
    name: string,
    spec: CreatePluginSpec<
      GlobalConfig,
      GlobalEventMap,
      PluginEventMap,
      unknown,
      unknown,
      Record<string, unknown>,
      DependencyPluginTuple
    >
    // biome-ignore lint/suspicious/noExplicitAny: Overload 2 erases Api type; any preserves ctx.require() usability
  ): PluginInstance<string, unknown, unknown, any, PluginEventMap>;
};

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
  readonly onInit?: unknown;
  readonly onStart?: unknown;
  readonly onStop?: unknown;
  readonly hooks?: unknown;
};

/**
 * Checks whether a value is a non-null object record.
 * @param value - Value to inspect.
 * @returns `true` when value is an object record.
 * @example
 * ```ts
 * const asRecord = isRecord({ key: "value" });
 * ```
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
 * Validates hooks object and each hook handler function.
 * @param frameworkId - Framework identifier used in error messages.
 * @param pluginName - Validated plugin name.
 * @param hooks - Candidate hooks object from plugin spec.
 * @example
 * ```ts
 * assertValidHooks("my-app", "router", { "route:change": () => {} });
 * ```
 */
function assertValidHooks(frameworkId: string, pluginName: string, hooks: unknown): void {
  if (hooks === undefined) {
    return;
  }

  if (!isRecord(hooks)) {
    throw new TypeError(
      `[${frameworkId}] Plugin "${pluginName}" has invalid hooks: expected an object.\n` +
        `  Provide an object mapping event names to handler functions.`
    );
  }

  for (const [eventName, handler] of Object.entries(hooks)) {
    if (typeof handler !== "function") {
      throw new TypeError(
        `[${frameworkId}] Plugin "${pluginName}" has invalid hook for "${eventName}": expected a function.\n` +
          `  Provide a function as the hook handler for "${eventName}".`
      );
    }
  }
}

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
    assertValidHooks(frameworkId, name, spec.hooks);

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
