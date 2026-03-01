// =============================================================================
// @moku-labs/core - createApp Kernel
// =============================================================================
// The runtime heart of the framework. Called by createCore's createApp wrapper
// after plugin list merging and validatePlugins have run.
//
// Sections:
//   §1 Runtime Boundary Types    — Type aliases, KernelParameters, KernelRuntime
//   §2 Shared Primitives         — asRecord, createRequire, createHas
//   §3 Config Resolution         — resolvePluginConfigs, createPluginStates
//   §4 Event Bus                 — buildEventBus, registerPluginHooks
//   §5 Context Factories         — createContextFactory, buildCallbackContext
//   §6 App Builder               — executeStop, buildApp
//   §7 Kernel Orchestrator       — kernel
// =============================================================================

import type { AnyPluginInstance } from "./types";
import { isRecord } from "./utilities";

// =============================================================================
// Section 1: Runtime Boundary Types
// =============================================================================
// At the kernel layer, plugin APIs, states, event payloads, and contexts are
// dynamically constructed. Type safety is enforced at compile time by the
// generic signatures in types.ts and plugin.ts. These aliases centralize
// the lint suppression annotations for the runtime boundary.
// =============================================================================

/** Map of plugin names to their API objects (dynamically typed at runtime). */
// biome-ignore lint/suspicious/noExplicitAny: plugin API objects vary per plugin; typed at compile-time boundary
type ApiMap = Map<string, any>;

/** Map of plugin names to their state objects (dynamically typed at runtime). */
// biome-ignore lint/suspicious/noExplicitAny: plugin state values vary per plugin
type StateMap = Map<string, any>;

/**
 * Fire-and-forget event emitter function (runtime-layer alias).
 * This is the dynamically typed runtime counterpart of the generic
 * `EmitFunction<Events>` in types.ts. At runtime, event names and payloads
 * are strings/objects — type safety is enforced at compile time by the
 * generic signature, not here.
 */
// biome-ignore lint/suspicious/noExplicitAny: event payloads vary per event; typed by EmitFunction<Events>
type EmitFunction = (eventName: string, payload?: any) => void;

/** Event hook handler that receives a payload and optionally returns a promise. */
// biome-ignore lint/suspicious/noExplicitAny: hook handler payloads are dynamically typed per event
type HookHandler = (payload: any) => void | Promise<void>;

/** Factory that builds a PluginContext for a given plugin instance. */
// biome-ignore lint/suspicious/noExplicitAny: context factory returns dynamically typed PluginContext
type ContextFactory = (plugin: AnyPluginInstance) => any;

/** Consumer lifecycle callback receiving a dynamically typed context. */
// biome-ignore lint/suspicious/noExplicitAny: consumer callbacks receive dynamically typed context
type ConsumerCallback = (context: any) => void | Promise<void>;

/** Consumer error callback receiving an error and optional context. */
// biome-ignore lint/suspicious/noExplicitAny: consumer error callback receives dynamically typed context
type ConsumerErrorCallback = (error: Error, context?: any) => void;

/** Framework onReady callback receiving a frozen config object. */
// biome-ignore lint/suspicious/noExplicitAny: framework onReady receives Config which varies per framework
type OnReadyCallback = (context: { config: Readonly<any> }) => void | Promise<void>;

/** Dynamically constructed object used for app and callback contexts. */
// biome-ignore lint/suspicious/noExplicitAny: dynamically constructed objects (app, callback context)
type DynamicObject = Record<string, any>;

/** Parameters for the kernel function. */
interface KernelParameters {
  readonly id: string;
  readonly configDefaults: Record<string, unknown>;
  readonly frameworkPluginConfigs: Record<string, unknown>;
  readonly flatPlugins: AnyPluginInstance[];
  readonly configOverrides: Record<string, unknown>;
  readonly consumerPluginConfigs: Record<string, unknown>;
  readonly onReady?: OnReadyCallback | undefined;
  readonly onError?: ((error: Error) => void) | undefined;
  readonly consumer?: {
    readonly onReady?: ConsumerCallback | undefined;
    readonly onError?: ConsumerErrorCallback | undefined;
    readonly onStart?: ConsumerCallback | undefined;
    readonly onStop?: ConsumerCallback | undefined;
  };
}

/** Shared runtime state assembled by the kernel during initialization. */
interface KernelRuntime {
  readonly id: string;
  readonly globalConfig: Readonly<Record<string, unknown>>;
  readonly emit: EmitFunction;
  readonly apis: ApiMap;
  readonly pluginNameSet: Set<string>;
}

// =============================================================================
// Section 2: Shared Primitives
// =============================================================================

/**
 * Cast a value to Record if it is a non-null object, or return empty object.
 *
 * @param value - The value to cast.
 * @returns The value as a Record, or an empty object if not a non-null object.
 * @example
 * ```ts
 * asRecord({ a: 1 }); // => { a: 1 }
 * asRecord(undefined); // => {}
 * ```
 */
function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * Create a require function that looks up a plugin API by instance reference.
 *
 * @param runtime - The kernel runtime containing the API map.
 * @param formatError - Formats the error message using the plugin instance name.
 * @returns A function that returns the API for a given plugin instance or throws.
 * @example
 * ```ts
 * const require = createRequire(runtime, name => `Plugin "${name}" not found.`);
 * const api = require(routerPlugin);
 * ```
 */
function createRequire(
  runtime: KernelRuntime,
  formatError: (instanceName: string) => string
): (instance: AnyPluginInstance) => unknown {
  return (instance: AnyPluginInstance) => {
    const api = runtime.apis.get(instance.name);
    if (!api) throw new Error(formatError(instance.name));
    return api;
  };
}

/**
 * Create a has function from the runtime's plugin name set.
 *
 * @param runtime - The kernel runtime containing the plugin name set.
 * @returns A function that checks if a plugin name is registered.
 * @example
 * ```ts
 * const has = createHas(runtime);
 * has("router"); // => true or false
 * ```
 */
function createHas(runtime: KernelRuntime): (name: string) => boolean {
  return (name: string) => runtime.pluginNameSet.has(name);
}

// =============================================================================
// Section 3: Config Resolution
// =============================================================================

/**
 * Resolve per-plugin configs: 3-level merge (plugin defaults, framework, consumer), freeze.
 *
 * @param flatPlugins - The flattened plugin list.
 * @param frameworkPluginConfigs - Framework-level plugin config overrides.
 * @param consumerPluginConfigs - Consumer-level plugin config overrides.
 * @returns A map of plugin names to their frozen resolved configs.
 * @example
 * ```ts
 * const configs = resolvePluginConfigs(plugins, frameworkConfigs, consumerConfigs);
 * configs.get("router"); // => { basePath: "/" }
 * ```
 */
function resolvePluginConfigs(
  flatPlugins: AnyPluginInstance[],
  frameworkPluginConfigs: Record<string, unknown>,
  consumerPluginConfigs: Record<string, unknown>
): Map<string, Readonly<Record<string, unknown>>> {
  const resolvedConfigs = new Map<string, Readonly<Record<string, unknown>>>();
  for (const plugin of flatPlugins) {
    const merged = Object.freeze({
      ...(plugin.spec.config as Record<string, unknown> | undefined),
      ...asRecord(frameworkPluginConfigs[plugin.name]),
      ...asRecord(consumerPluginConfigs[plugin.name])
    });
    resolvedConfigs.set(plugin.name, merged);
  }
  return resolvedConfigs;
}

/**
 * Create plugin state using MinimalContext (global + config only).
 *
 * @param flatPlugins - The flattened plugin list.
 * @param globalConfig - The frozen global config object.
 * @param resolvedConfigs - The resolved per-plugin config map.
 * @returns A map of plugin names to their initial state objects.
 * @example
 * ```ts
 * const states = createPluginStates(plugins, globalConfig, resolvedConfigs);
 * states.get("counter"); // => { count: 0 }
 * ```
 */
function createPluginStates(
  flatPlugins: AnyPluginInstance[],
  globalConfig: Readonly<Record<string, unknown>>,
  resolvedConfigs: Map<string, Readonly<Record<string, unknown>>>
): StateMap {
  const states: StateMap = new Map();
  for (const plugin of flatPlugins) {
    if (plugin.spec.createState) {
      const pluginConfig = resolvedConfigs.get(plugin.name) ?? {};
      const minimalContext = { global: globalConfig, config: pluginConfig };
      states.set(plugin.name, plugin.spec.createState(minimalContext));
    } else {
      states.set(plugin.name, {});
    }
  }
  return states;
}

// =============================================================================
// Section 4: Event Bus
// =============================================================================

/**
 * Build event bus: hookMap with async dispatch, fire-and-forget emit, and registerHook.
 *
 * @param onError - Optional error handler for hook execution failures.
 * @returns An object with emit and registerHook functions.
 * @example
 * ```ts
 * const { emit, registerHook } = buildEventBus(error => console.error(error));
 * registerHook("page:view", payload => console.log(payload));
 * emit("page:view", { path: "/" });
 * ```
 */
function buildEventBus(onError: ((error: Error) => void) | undefined): {
  emit: EmitFunction;
  registerHook: (eventName: string, handler: HookHandler) => void;
} {
  const hookMap = new Map<string, HookHandler[]>();

  /**
   * Dispatch an event to all registered handlers sequentially.
   *
   * @param eventName - The event name to dispatch.
   * @param payload - The event payload.
   * @example
   * ```ts
   * await dispatch("page:view", { path: "/" });
   * ```
   */
  async function dispatch(eventName: string, payload: unknown): Promise<void> {
    const handlers = hookMap.get(eventName);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (error) {
        if (onError) onError(error as Error);
      }
    }
  }

  /**
   * Fire-and-forget emit that dispatches without awaiting.
   *
   * @param eventName - The event name to emit.
   * @param payload - The optional event payload.
   * @example
   * ```ts
   * emit("page:view", { path: "/" });
   * ```
   */
  const emit: EmitFunction = (eventName, payload) => {
    void dispatch(eventName, payload);
  };

  /**
   * Register a hook handler for a given event name.
   *
   * @param eventName - The event name to listen for.
   * @param handler - The handler to invoke when the event fires.
   * @example
   * ```ts
   * registerHook("page:view", payload => console.log(payload));
   * ```
   */
  const registerHook = (eventName: string, handler: HookHandler): void => {
    let list = hookMap.get(eventName);
    if (!list) {
      list = [];
      hookMap.set(eventName, list);
    }
    list.push(handler);
  };

  return { emit, registerHook };
}

/**
 * Register hooks from all plugins. Each plugin's hooks(ctx) produces a handler map.
 *
 * @param flatPlugins - The flattened plugin list.
 * @param buildPluginContext - Factory that builds context for a plugin.
 * @param registerHook - Function to register a hook handler for an event.
 * @example
 * ```ts
 * registerPluginHooks(plugins, contextFactory, registerHook);
 * ```
 */
function registerPluginHooks(
  flatPlugins: AnyPluginInstance[],
  buildPluginContext: ContextFactory,
  registerHook: (eventName: string, handler: (payload: unknown) => void | Promise<void>) => void
): void {
  for (const plugin of flatPlugins) {
    if (plugin.spec.hooks) {
      const hookHandlers = plugin.spec.hooks(buildPluginContext(plugin));
      for (const [eventName, handler] of Object.entries(hookHandlers)) {
        if (!handler) continue;
        registerHook(eventName, handler as (payload: unknown) => void | Promise<void>);
      }
    }
  }
}

// =============================================================================
// Section 5: Context Factories
// =============================================================================

/**
 * Create a factory that builds PluginContext for a given plugin.
 *
 * @param runtime - The kernel runtime with shared state.
 * @param resolvedConfigs - The resolved per-plugin config map.
 * @param states - The plugin state map.
 * @returns A factory function that produces a PluginContext for any plugin.
 * @example
 * ```ts
 * const factory = createContextFactory(runtime, configs, states);
 * const ctx = factory(routerPlugin);
 * ```
 */
function createContextFactory(
  runtime: KernelRuntime,
  resolvedConfigs: Map<string, Readonly<Record<string, unknown>>>,
  states: StateMap
): ContextFactory {
  const has = createHas(runtime);

  return (plugin: AnyPluginInstance) => ({
    global: runtime.globalConfig,
    config: resolvedConfigs.get(plugin.name),
    state: states.get(plugin.name),
    emit: runtime.emit,
    require: createRequire(
      runtime,
      name =>
        `[${runtime.id}] Plugin "${plugin.name}" requires "${name}", but "${name}" is not registered.\n` +
        `  Add "${name}" to your plugin list.`
    ),
    has
  });
}

/**
 * Build callback context for consumer lifecycle callbacks (onReady, onStart, onStop).
 *
 * @param runtime - The kernel runtime with shared state and APIs.
 * @returns A dynamic object with config, emit, require, has, and all plugin APIs.
 * @example
 * ```ts
 * const ctx = buildCallbackContext(runtime);
 * ctx.config; // frozen global config
 * ctx.router; // router plugin API (if registered)
 * ```
 */
function buildCallbackContext(runtime: KernelRuntime): DynamicObject {
  const context: DynamicObject = {
    config: runtime.globalConfig,
    emit: runtime.emit,
    require: createRequire(
      runtime,
      name =>
        `[${runtime.id}] Plugin "${name}" is not registered.\n  Add "${name}" to your plugin list.`
    ),
    has: createHas(runtime)
  };
  for (const [name, api] of runtime.apis) {
    context[name] = api;
  }
  return context;
}

// =============================================================================
// Section 6: App Builder
// =============================================================================

/**
 * Run onStop for all plugins in reverse order.
 *
 * @param flatPlugins - The flattened plugin list.
 * @param globalConfig - The frozen global config object.
 * @example
 * ```ts
 * await executeStop(plugins, globalConfig);
 * ```
 */
async function executeStop(
  flatPlugins: AnyPluginInstance[],
  globalConfig: Readonly<Record<string, unknown>>
): Promise<void> {
  for (const plugin of flatPlugins.toReversed()) {
    if (!plugin.spec.onStop) continue;
    await plugin.spec.onStop({ global: globalConfig });
  }
}

/**
 * Build the frozen app object with start, stop, emit, require, has and mounted plugin APIs.
 *
 * @param runtime - The kernel runtime with shared state and APIs.
 * @param flatPlugins - The flattened plugin list.
 * @param buildPluginContext - Factory that builds context for a plugin.
 * @param consumer - Optional consumer lifecycle callbacks.
 * @returns A frozen app object with lifecycle methods and plugin APIs.
 * @example
 * ```ts
 * const app = buildApp(runtime, plugins, contextFactory, onError, consumer);
 * await app.start();
 * ```
 */
function buildApp(
  runtime: KernelRuntime,
  flatPlugins: AnyPluginInstance[],
  buildPluginContext: ContextFactory,
  consumer?: KernelParameters["consumer"]
): DynamicObject {
  let started = false;

  const appRequire = createRequire(
    runtime,
    name =>
      `[${runtime.id}] app.require("${name}") failed: "${name}" is not registered.\n  Check your plugin list.`
  );
  const appHas = createHas(runtime);

  const app: DynamicObject = {
    /**
     * Run onStart for all plugins, then consumer onStart.
     *
     * @example
     * ```ts
     * await app.start();
     * ```
     */
    start: async (): Promise<void> => {
      if (started) {
        throw new Error(`[${runtime.id}] App already started.\n  start() can only be called once.`);
      }

      for (const plugin of flatPlugins) {
        if (plugin.spec.onStart) {
          await plugin.spec.onStart(buildPluginContext(plugin));
        }
      }

      if (consumer?.onStart) {
        await consumer.onStart(buildCallbackContext(runtime));
      }

      started = true;
    },

    /**
     * Run onStop for all plugins in reverse, then consumer onStop.
     *
     * @example
     * ```ts
     * await app.stop();
     * ```
     */
    stop: async (): Promise<void> => {
      if (!started) {
        throw new Error(`[${runtime.id}] App not started.\n  Call start() before stop().`);
      }
      await executeStop(flatPlugins, runtime.globalConfig);

      if (consumer?.onStop) {
        await consumer.onStop(buildCallbackContext(runtime));
      }
    },

    /**
     * Emit an event with an optional payload.
     *
     * @param eventName - The event name to emit.
     * @param payload - The optional event payload.
     * @example
     * ```ts
     * app.emit("page:view", { path: "/" });
     * ```
     */
    emit: (eventName: string, payload?: unknown): void => {
      runtime.emit(eventName, payload);
    },

    /**
     * Look up a plugin API by instance reference.
     *
     * @param instance - The plugin instance to look up.
     * @returns The plugin's API object.
     * @example
     * ```ts
     * const routerApi = app.require(routerPlugin);
     * ```
     */
    require: (instance: AnyPluginInstance) => appRequire(instance),

    /**
     * Check if a plugin name is registered.
     *
     * @param name - The plugin name to check.
     * @returns True if the plugin is registered.
     * @example
     * ```ts
     * app.has("router"); // => true or false
     * ```
     */
    has: (name: string): boolean => appHas(name)
  };

  // Mount plugin APIs directly on the app object
  for (const [name, api] of runtime.apis) {
    app[name] = api;
  }

  return Object.freeze(app);
}

// =============================================================================
// Section 7: Kernel Orchestrator
// =============================================================================

/**
 * The kernel — creates and initializes the application.
 *
 * Receives pre-flattened, pre-validated plugins and all captured context from
 * createCore. Performs: config resolution, state creation, event bus setup,
 * API building, lifecycle execution, returns frozen app object.
 *
 * @param parameters - All kernel inputs captured from the factory chain.
 * @returns A promise that resolves to the frozen app object.
 * @example
 * ```ts
 * const app = await kernel({ id: "my-app", configDefaults: {}, ... });
 * ```
 */
async function kernel(parameters: KernelParameters): Promise<DynamicObject> {
  const {
    id,
    configDefaults,
    frameworkPluginConfigs,
    flatPlugins,
    configOverrides,
    consumerPluginConfigs,
    onReady,
    onError,
    consumer
  } = parameters;

  // Step 4: Build plugin name set
  const pluginNameSet = new Set(flatPlugins.map(plugin => plugin.name));

  // Step 5: Resolve global config (shallow merge, freeze)
  const globalConfig: Readonly<Record<string, unknown>> = Object.freeze({
    ...configDefaults,
    ...configOverrides
  });

  // Step 6: Resolve per-plugin config (3-level merge, freeze)
  const resolvedConfigs = resolvePluginConfigs(
    flatPlugins,
    frameworkPluginConfigs,
    consumerPluginConfigs
  );

  // Step 7: Create state (MinimalContext — global + config only)
  const states = createPluginStates(flatPlugins, globalConfig, resolvedConfigs);

  // Step 8a: Build event bus (empty — hooks registered in Step 8b)
  const apis: ApiMap = new Map();

  // Combine framework + consumer onError into a single handler.
  // References to runtime are resolved at call time, not definition time.
  const combinedOnError =
    onError || consumer?.onError
      ? (error: Error): void => {
          if (onError) onError(error);
          if (consumer?.onError) consumer.onError(error, buildCallbackContext(runtime));
        }
      : undefined;

  const { emit, registerHook } = buildEventBus(combinedOnError);

  // Assemble runtime (apis Map is populated in Step 9; same reference shared)
  const runtime: KernelRuntime = { id, globalConfig, emit, apis, pluginNameSet };

  // Build context factory (needed by hooks and APIs)
  const buildPluginContext = createContextFactory(runtime, resolvedConfigs, states);

  // Step 8b: Register hooks (context-aware)
  registerPluginHooks(flatPlugins, buildPluginContext, registerHook);

  // Step 9: Build APIs (forward order)
  for (const plugin of flatPlugins) {
    if (plugin.spec.api) {
      apis.set(plugin.name, plugin.spec.api(buildPluginContext(plugin)));
    }
  }

  // Step 10: Run onInit (forward order, sequential async)
  for (const plugin of flatPlugins) {
    if (plugin.spec.onInit) {
      await plugin.spec.onInit(buildPluginContext(plugin));
    }
  }

  // Call framework onReady callback after all onInit complete
  if (onReady) {
    await onReady({ config: globalConfig });
  }

  // Call consumer onReady callback after framework onReady
  if (consumer?.onReady) {
    await consumer.onReady(buildCallbackContext(runtime));
  }

  // Step 11: Build and freeze app
  return buildApp(runtime, flatPlugins, buildPluginContext, consumer);
}

export { kernel };
export type { KernelParameters };
