// =============================================================================
// moku_core v3 - createApp Kernel
// =============================================================================
// The runtime heart of the framework. Called by createCore's createApp wrapper
// after flatten + validate have run. Implements all 11 steps from the kernel
// pseudocode (specification/13-KERNEL-PSEUDOCODE.md):
//
//   Step 1-3: (handled by createCore -- merge, flatten, validate)
//   Step 4: Build plugin name set
//   Step 5: Resolve global config (shallow merge, freeze)
//   Step 6: Resolve per-plugin config (3-level merge, freeze)
//   Step 7: Create state (MinimalContext)
//   Step 8: Build event bus (hookMap, dispatch, emit)
//   Step 9: Build APIs (PluginContext, forward order)
//   Step 10: Run onInit (PluginContext, forward order, sequential async)
//   Step 11: Build and freeze app (start/stop/emit/require/getPlugin/has)
// =============================================================================

import type { AnyPluginInstance } from "./type-utilities";

/** Parameters for the kernel function. */
interface KernelParameters {
  readonly id: string;
  readonly configDefaults: Record<string, unknown>;
  readonly frameworkPluginConfigs: Record<string, unknown>;
  readonly flatPlugins: AnyPluginInstance[];
  readonly configOverrides: Record<string, unknown>;
  readonly consumerPluginConfigs: Record<string, unknown>;
  // biome-ignore lint/suspicious/noExplicitAny: onReady callback uses framework Config which varies
  readonly onReady?: ((context: { config: Readonly<any> }) => void | Promise<void>) | undefined;
  readonly onError?: ((error: Error) => void) | undefined;
  readonly consumer?: {
    // biome-ignore lint/suspicious/noExplicitAny: callback context is dynamically typed; type safety enforced by CreateAppOptions
    readonly onReady?: ((context: any) => void | Promise<void>) | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: callback context is dynamically typed; type safety enforced by CreateAppOptions
    readonly onError?: ((error: Error, context?: any) => void) | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: callback context is dynamically typed; type safety enforced by CreateAppOptions
    readonly onStart?: ((context: any) => void | Promise<void>) | undefined;
    // biome-ignore lint/suspicious/noExplicitAny: callback context is dynamically typed; type safety enforced by CreateAppOptions
    readonly onStop?: ((context: any) => void | Promise<void>) | undefined;
  };
}

/**
 * Safely cast a value to a Record if it is a non-null object.
 * @param value - The value to check.
 * @returns The value as Record or empty object.
 * @example
 * ```ts
 * asRecord({ basePath: "/" }) // { basePath: "/" }
 * asRecord(undefined) // {}
 * ```
 */
function asRecord(value: unknown): Record<string, unknown> {
  if (value !== undefined && typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Resolve per-plugin configs with 3-level merge: plugin defaults, framework, consumer.
 * @param flatPlugins - Flattened plugin list.
 * @param frameworkPluginConfigs - Framework-level plugin config overrides.
 * @param consumerPluginConfigs - Consumer-level plugin config overrides.
 * @returns Map of plugin name to frozen resolved config.
 * @example
 * ```ts
 * const configs = resolvePluginConfigs(flatPlugins, { router: { basePath: "/" } }, {});
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
 * @param flatPlugins - Flattened plugin list.
 * @param globalConfig - Frozen global config.
 * @param resolvedConfigs - Map of plugin name to frozen config.
 * @returns Map of plugin name to state value.
 * @example
 * ```ts
 * const states = createPluginStates(flatPlugins, globalConfig, resolvedConfigs);
 * ```
 */
function createPluginStates(
  flatPlugins: AnyPluginInstance[],
  globalConfig: Readonly<Record<string, unknown>>,
  resolvedConfigs: Map<string, Readonly<Record<string, unknown>>>
  // biome-ignore lint/suspicious/noExplicitAny: state values are plugin-specific
): Map<string, any> {
  // biome-ignore lint/suspicious/noExplicitAny: state values are plugin-specific
  const states = new Map<string, any>();
  for (const plugin of flatPlugins) {
    if (plugin.spec.createState) {
      // biome-ignore lint/suspicious/noExplicitAny: runtime context matches MinimalContext shape
      const minimalContext: any = {
        global: globalConfig,
        config: resolvedConfigs.get(plugin.name)
      };
      states.set(plugin.name, plugin.spec.createState(minimalContext));
    }
  }
  return states;
}

/**
 * Build event bus: hookMap with async dispatch, fire-and-forget emit, and registerHook.
 * The hookMap starts empty — hooks are registered separately in Step 8b after
 * the context factory is created, so that hooks(ctx) receives PluginContext.
 *
 * Hook errors are caught per-handler and reported via `onError`. One failing hook
 * does not prevent other hooks from running (same resilience pattern as `executeStop`).
 * @param onError - Optional error handler called when a hook throws.
 * @returns Object with emit and registerHook functions.
 * @example
 * ```ts
 * const { emit, registerHook } = buildEventBus(onError);
 * registerHook("page:render", payload => console.log(payload));
 * emit("page:render", { path: "/", html: "<h1>Home</h1>" });
 * ```
 */
function buildEventBus(onError: ((error: Error) => void) | undefined): {
  // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
  emit: (eventName: string, payload?: any) => void;
  // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
  registerHook: (eventName: string, handler: (payload: any) => void | Promise<void>) => void;
} {
  // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
  const hookMap = new Map<string, Array<(payload: any) => void | Promise<void>>>();

  /**
   * Dispatch an event to all registered handlers sequentially.
   * @param eventName - Name of the event to dispatch.
   * @param payload - Event payload.
   * @example
   * ```ts
   * await dispatch("page:render", { path: "/" });
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
  async function dispatch(eventName: string, payload: any): Promise<void> {
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
   * Emit an event (fire-and-forget).
   * @param eventName - Name of the event to emit.
   * @param payload - Optional event payload.
   * @example
   * ```ts
   * emit("page:render", { path: "/", html: "<h1>Home</h1>" });
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
  const emit = (eventName: string, payload?: any): void => {
    void dispatch(eventName, payload);
  };

  /**
   * Register a single hook handler for an event name.
   * @param eventName - Name of the event to listen for.
   * @param handler - Handler function to call when the event is emitted.
   * @example
   * ```ts
   * registerHook("page:render", payload => console.log(payload));
   * ```
   */
  const registerHook = (
    eventName: string,
    // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
    handler: (payload: any) => void | Promise<void>
  ): void => {
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
 * Register hooks from all plugins. Each plugin's `hooks(ctx)` is called
 * to produce a handler map, then each handler is registered on the event bus.
 *
 * Called before APIs and onInit so events emitted during those phases are captured.
 * @param flatPlugins - Flattened plugin list in registration order.
 * @param buildPluginContext - Factory that builds PluginContext for a given plugin.
 * @param registerHook - Function to register a single hook handler on the event bus.
 * @example
 * ```ts
 * registerPluginHooks(flatPlugins, buildPluginContext, registerHook);
 * ```
 */
function registerPluginHooks(
  flatPlugins: AnyPluginInstance[],
  // biome-ignore lint/suspicious/noExplicitAny: context factory returns dynamically typed PluginContext
  buildPluginContext: (plugin: AnyPluginInstance) => any,
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

/**
 * Create a factory that builds PluginContext for a given plugin.
 * @param id - Framework identifier for error messages.
 * @param globalConfig - Frozen global config.
 * @param resolvedConfigs - Map of plugin name to frozen config.
 * @param states - Map of plugin name to state.
 * @param emit - Event emit function.
 * @param apis - Map of plugin name to API object.
 * @param pluginNameSet - Set of all registered plugin names.
 * @returns A function that builds PluginContext for a given plugin.
 * @example
 * ```ts
 * const buildContext = createContextFactory(id, globalConfig, configs, states, emit, apis, names);
 * const ctx = buildContext(routerPlugin);
 * ```
 */
function createContextFactory(
  id: string,
  globalConfig: Readonly<Record<string, unknown>>,
  resolvedConfigs: Map<string, Readonly<Record<string, unknown>>>,
  // biome-ignore lint/suspicious/noExplicitAny: state values are plugin-specific
  states: Map<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
  emit: (eventName: string, payload?: any) => void,
  // biome-ignore lint/suspicious/noExplicitAny: API values are plugin-specific
  apis: Map<string, any>,
  pluginNameSet: Set<string>
  // biome-ignore lint/suspicious/noExplicitAny: context is dynamically typed to match PluginContext shape
): (plugin: AnyPluginInstance) => any {
  return (plugin: AnyPluginInstance) => ({
    global: globalConfig,
    config: resolvedConfigs.get(plugin.name),
    state: states.get(plugin.name),
    emit,
    /**
     * Get plugin API by instance. Returns undefined if not found.
     * @param instance - The plugin instance to look up.
     * @returns The plugin API or undefined.
     * @example
     * ```ts
     * ctx.getPlugin(routerPlugin);
     * ```
     */
    getPlugin: (instance: AnyPluginInstance) => {
      return apis.get(instance.name);
    },
    /**
     * Get plugin API by instance or throw if not found.
     * @param instance - The plugin instance to require.
     * @returns The plugin API.
     * @example
     * ```ts
     * ctx.require(routerPlugin);
     * ```
     */
    require: (instance: AnyPluginInstance) => {
      const api = apis.get(instance.name);
      if (!api) {
        throw new Error(
          `[${id}] Plugin "${plugin.name}" requires "${instance.name}", but "${instance.name}" is not registered.\n` +
            `  Add "${instance.name}" to your plugin list.`
        );
      }
      return api;
    },
    /**
     * Check if a plugin name is registered.
     * @param name - The plugin name to check.
     * @returns True if registered.
     * @example
     * ```ts
     * ctx.has("router");
     * ```
     */
    has: (name: string) => pluginNameSet.has(name)
  });
}

/**
 * Run onStop for all plugins in reverse order with best-effort error handling.
 * @param flatPlugins - Flattened plugin list (will be reversed).
 * @param globalConfig - Frozen global config (passed as TeardownContext).
 * @param onError - Optional error handler called for each stop error.
 * @returns A promise that resolves when all plugins are stopped, or rejects with first error.
 * @example
 * ```ts
 * await executeStop(flatPlugins, globalConfig, onError);
 * ```
 */
async function executeStop(
  flatPlugins: AnyPluginInstance[],
  globalConfig: Readonly<Record<string, unknown>>,
  onError: ((error: Error) => void) | undefined
): Promise<void> {
  let firstError: Error | undefined;

  for (const plugin of flatPlugins.toReversed()) {
    if (plugin.spec.onStop) {
      try {
        await plugin.spec.onStop({ global: globalConfig });
      } catch (error) {
        if (!firstError) firstError = error as Error;
        if (onError) onError(error as Error);
      }
    }
  }

  if (firstError) throw firstError;
}

/**
 * Build callback context for consumer lifecycle callbacks (onReady, onStart, onStop).
 * Includes frozen config, emit, getPlugin, require, has, and mounted plugin APIs.
 * @param id - Framework identifier for error messages.
 * @param globalConfig - Frozen global config.
 * @param emit - Event emit function.
 * @param apis - Map of plugin name to API object.
 * @param pluginNameSet - Set of all registered plugin names.
 * @returns A context object matching AppCallbackContext.
 * @example
 * ```ts
 * const ctx = buildCallbackContext(id, globalConfig, emit, apis, pluginNameSet);
 * consumer.onReady(ctx);
 * ```
 */
function buildCallbackContext(
  id: string,
  globalConfig: Readonly<Record<string, unknown>>,
  // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
  emit: (eventName: string, payload?: any) => void,
  // biome-ignore lint/suspicious/noExplicitAny: API values are plugin-specific
  apis: Map<string, any>,
  pluginNameSet: Set<string>
  // biome-ignore lint/suspicious/noExplicitAny: context is dynamically constructed with plugin APIs
): any {
  /**
   * Look up a plugin API by instance reference.
   * @param instance - The plugin instance to look up.
   * @returns The plugin API, or undefined if not registered.
   * @example
   * ```ts
   * const api = getPlugin(routerPlugin);
   * ```
   */
  const getPlugin = (instance: AnyPluginInstance) => apis.get(instance.name);

  /**
   * Look up a plugin API by instance reference, throwing if not found.
   * @param instance - The plugin instance to require.
   * @returns The plugin API.
   * @example
   * ```ts
   * const api = requirePlugin(routerPlugin);
   * ```
   */
  const requirePlugin = (instance: AnyPluginInstance) => {
    const api = apis.get(instance.name);
    if (!api) {
      throw new Error(
        `[${id}] Plugin "${instance.name}" is not registered.\n  Add "${instance.name}" to your plugin list.`
      );
    }
    return api;
  };

  /**
   * Check if a plugin is registered by name.
   * @param name - The plugin name to check.
   * @returns True if the plugin is registered.
   * @example
   * ```ts
   * const exists = has("router");
   * ```
   */
  const has = (name: string) => pluginNameSet.has(name);

  // biome-ignore lint/suspicious/noExplicitAny: context is dynamically constructed with plugin APIs
  const context: any = { config: globalConfig, emit, getPlugin, require: requirePlugin, has };
  for (const [name, api] of apis) {
    context[name] = api;
  }
  return context;
}

/**
 * Build the frozen app object with start, stop, emit, require, getPlugin, has methods.
 * Plugin APIs are mounted directly on the app object (e.g., app.router, app.seo).
 * @param id - Framework identifier for error messages.
 * @param flatPlugins - Flattened plugin list.
 * @param globalConfig - Frozen global config.
 * @param buildPluginContext - Context factory function.
 * @param emit - Event emit function.
 * @param apis - Map of plugin name to API object.
 * @param pluginNameSet - Set of all registered plugin names.
 * @param onError - Optional error handler for best-effort stop.
 * @param consumer - Optional consumer lifecycle callbacks.
 * @returns The frozen app object.
 * @example
 * ```ts
 * const app = buildApp(id, flatPlugins, globalConfig, buildCtx, emit, apis, names, onError);
 * await app.start();
 * ```
 */
function buildApp(
  id: string,
  flatPlugins: AnyPluginInstance[],
  globalConfig: Readonly<Record<string, unknown>>,
  // biome-ignore lint/suspicious/noExplicitAny: context factory returns dynamically typed PluginContext
  buildPluginContext: (plugin: AnyPluginInstance) => any,
  // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
  emit: (eventName: string, payload?: any) => void,
  // biome-ignore lint/suspicious/noExplicitAny: API values are plugin-specific
  apis: Map<string, any>,
  pluginNameSet: Set<string>,
  onError: ((error: Error) => void) | undefined,
  consumer?: KernelParameters["consumer"]
  // biome-ignore lint/suspicious/noExplicitAny: app object is dynamically constructed with plugin APIs
): any {
  let started = false;
  let stopped = false;

  /**
   * Guard against operations on a stopped app.
   * @throws {Error} If the app has been stopped.
   * @example
   * ```ts
   * guardStopped(); // throws if stopped
   * ```
   */
  function guardStopped(): void {
    if (stopped) {
      throw new Error(
        `[${id}] App is stopped. No further operations allowed.\n  Create a new app instance instead.`
      );
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: app object is dynamically constructed with plugin APIs
  const app: any = {
    /**
     * Start all plugins in forward order (sequential async).
     * @returns A promise that resolves when all plugins have started.
     * @throws {Error} If already started or if stopped.
     * @example
     * ```ts
     * await app.start();
     * ```
     */
    start: async (): Promise<void> => {
      guardStopped();
      if (started) {
        throw new Error(`[${id}] App already started.\n  start() can only be called once.`);
      }
      started = true;

      for (const plugin of flatPlugins) {
        if (plugin.spec.onStart) {
          await plugin.spec.onStart(buildPluginContext(plugin));
        }
      }

      if (consumer?.onStart) {
        await consumer.onStart(buildCallbackContext(id, globalConfig, emit, apis, pluginNameSet));
      }
    },

    /**
     * Stop all plugins in REVERSE order (sequential async, best-effort).
     * @returns A promise that resolves when all plugins have stopped.
     * @throws {Error} If not started, already stopped, or re-throws first onStop error.
     * @example
     * ```ts
     * await app.stop();
     * ```
     */
    stop: async (): Promise<void> => {
      guardStopped();
      if (!started) {
        throw new Error(`[${id}] App not started.\n  Call start() before stop().`);
      }
      stopped = true;
      let stopError: Error | undefined;
      try {
        await executeStop(flatPlugins, globalConfig, onError);
      } catch (error) {
        stopError = error as Error;
      }

      if (consumer?.onStop) {
        await consumer.onStop(buildCallbackContext(id, globalConfig, emit, apis, pluginNameSet));
      }

      if (stopError) throw stopError;
    },

    /**
     * Emit an event. Guards against use after stop.
     * @param eventName - Name of the event to emit.
     * @param payload - Optional event payload.
     * @example
     * ```ts
     * app.emit("page:render", { path: "/", html: "<h1>Home</h1>" });
     * ```
     */
    // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
    emit: (eventName: string, payload?: any): void => {
      guardStopped();
      emit(eventName, payload);
    },

    /**
     * Get plugin API by instance. Returns undefined if not found.
     * @param instance - PluginInstance to look up.
     * @returns The plugin API object or undefined.
     * @example
     * ```ts
     * const routerApi = app.getPlugin(routerPlugin);
     * ```
     */
    getPlugin: (instance: AnyPluginInstance) => {
      guardStopped();
      return apis.get(instance.name);
    },

    /**
     * Get plugin API or throw if not found.
     * @param instance - PluginInstance to require.
     * @returns The plugin API object.
     * @throws {Error} If the plugin is not registered.
     * @example
     * ```ts
     * const routerApi = app.require(routerPlugin);
     * ```
     */
    require: (instance: AnyPluginInstance) => {
      guardStopped();
      const api = apis.get(instance.name);
      if (!api) {
        throw new Error(
          `[${id}] app.require("${instance.name}") failed: "${instance.name}" is not registered.\n  Check your plugin list.`
        );
      }
      return api;
    },

    /**
     * Check if a plugin name is registered. Checks name registration, not API presence.
     * @param name - The plugin name to check.
     * @returns True if the plugin name is registered.
     * @example
     * ```ts
     * app.has("router") // true
     * ```
     */
    has: (name: string): boolean => {
      guardStopped();
      return pluginNameSet.has(name);
    }
  };

  // Mount plugin APIs directly on app: app.router, app.blog, etc.
  for (const [name, api] of apis) {
    app[name] = api;
  }

  return Object.freeze(app);
}

/**
 * The kernel function -- creates and initializes the application.
 *
 * Receives pre-flattened, pre-validated plugins and all captured context from
 * createCore. Performs config resolution, state creation, event bus setup,
 * API building, lifecycle execution, and returns a frozen app object.
 * @param parameters - All context captured by createCore: id, config defaults,
 *   framework plugin configs, flattened plugins, config overrides, plugin configs, callbacks.
 * @returns A promise that resolves to the frozen App object.
 * @example
 * ```ts
 * const app = await kernel({
 *   id: "my-site",
 *   configDefaults: { siteName: "Untitled" },
 *   frameworkPluginConfigs: {},
 *   flatPlugins: [],
 *   configOverrides: { siteName: "Blog" },
 *   consumerPluginConfigs: {},
 * });
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: kernel return type is dynamically built from registered plugins
async function kernel(parameters: KernelParameters): Promise<any> {
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

  // Combine framework + consumer onError into a single handler.
  // Consumer onError receives the full callback context (config, plugin APIs, etc.).
  // References to globalConfig/emit/apis are resolved at call time, not definition time.
  const combinedOnError =
    onError || consumer?.onError
      ? (error: Error): void => {
          if (onError) onError(error);
          if (consumer?.onError)
            consumer.onError(
              error,
              buildCallbackContext(id, globalConfig, emit, apis, pluginNameSet)
            );
        }
      : undefined;

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

  // Step 7: Create state (MinimalContext -- global + config only)
  const states = createPluginStates(flatPlugins, globalConfig, resolvedConfigs);

  // Step 8a: Build event bus (empty -- hooks registered in Step 8b)
  const { emit, registerHook } = buildEventBus(combinedOnError);

  // Build context factory (needed by hooks and APIs)
  // biome-ignore lint/suspicious/noExplicitAny: API values are plugin-specific
  const apis = new Map<string, any>();
  const buildPluginContext = createContextFactory(
    id,
    globalConfig,
    resolvedConfigs,
    states,
    emit,
    apis,
    pluginNameSet
  );

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
    await consumer.onReady(buildCallbackContext(id, globalConfig, emit, apis, pluginNameSet));
  }

  // Step 11: Build and freeze app
  return buildApp(
    id,
    flatPlugins,
    globalConfig,
    buildPluginContext,
    emit,
    apis,
    pluginNameSet,
    combinedOnError,
    consumer
  );
}

export { kernel };
export type { KernelParameters };
