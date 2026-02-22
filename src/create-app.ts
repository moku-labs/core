// =============================================================================
// moku_core v3 - createApp Kernel
// =============================================================================
// The runtime heart of the framework. Called by createCore's createApp wrapper
// after flatten + validate have run. Implements all 11 steps from the kernel
// pseudocode (specification/13-KERNEL-PSEUDOCODE.md):
//
//   Step 1-3: (handled by createCore -- merge, flatten, validate)
//   Step 4: Key discrimination (separate config overrides from plugin configs)
//   Step 5: Resolve global config (shallow merge, freeze)
//   Step 6: Resolve per-plugin config (3-level merge, freeze)
//   Step 7: Create state (MinimalContext)
//   Step 8: Build event bus (hookMap, dispatch, emit)
//   Step 9: Build APIs (PluginContext, forward order)
//   Step 10: Run onInit (PluginContext, forward order, sequential async)
//   Step 11: Build and freeze app (start/stop/emit/require/getPlugin/has)
// =============================================================================

import type { PluginInstance } from "./types";

/** Widened PluginInstance type for generic constraints. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint on PluginInstance arrays
type AnyPluginInstance = PluginInstance<string, any, any, any, any>;

/** Parameters for the kernel function. */
interface KernelParameters {
  readonly id: string;
  readonly configDefaults: Record<string, unknown>;
  readonly frameworkPluginConfigs: Record<string, unknown>;
  readonly flatPlugins: AnyPluginInstance[];
  readonly consumerOverrides: Record<string, unknown>;
  // biome-ignore lint/suspicious/noExplicitAny: onReady callback uses framework Config which varies
  readonly onReady?: ((context: { config: Readonly<any> }) => void | Promise<void>) | undefined;
  readonly onError?: ((error: Error) => void) | undefined;
}

/**
 * Separate consumer overrides into global config overrides and plugin config overrides.
 * Keys matching a registered plugin name go to plugin configs; the rest are global.
 * @param pluginNameSet - Set of registered plugin names.
 * @param consumerOverrides - Flat consumer options (excluding 'plugins' key).
 * @returns Separated config overrides and plugin config overrides.
 * @example
 * ```ts
 * const { configOverrides, consumerPluginConfigs } = discriminateKeys(
 *   new Set(["router", "seo"]),
 *   { siteName: "Blog", router: { basePath: "/blog" } }
 * );
 * ```
 */
function discriminateKeys(
  pluginNameSet: Set<string>,
  consumerOverrides: Record<string, unknown>
): { configOverrides: Record<string, unknown>; consumerPluginConfigs: Record<string, unknown> } {
  const configOverrides: Record<string, unknown> = {};
  const consumerPluginConfigs: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(consumerOverrides)) {
    if (pluginNameSet.has(key)) {
      consumerPluginConfigs[key] = value;
    } else {
      configOverrides[key] = value;
    }
  }

  return { configOverrides, consumerPluginConfigs };
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
// biome-ignore lint/suspicious/noExplicitAny: state values are plugin-specific
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
 * Build event bus: hookMap with async dispatch and fire-and-forget emit.
 * @param flatPlugins - Flattened plugin list.
 * @returns Object with the emit function.
 * @example
 * ```ts
 * const { emit } = buildEventBus(flatPlugins);
 * emit("page:render", { path: "/", html: "<h1>Home</h1>" });
 * ```
 */
function buildEventBus(flatPlugins: AnyPluginInstance[]): {
  // biome-ignore lint/suspicious/noExplicitAny: event payloads are dynamically typed
  emit: (eventName: string, payload?: any) => void;
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
      await handler(payload);
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

  // Register hooks from all plugins
  for (const plugin of flatPlugins) {
    if (plugin.spec.hooks) {
      for (const [eventName, handler] of Object.entries(plugin.spec.hooks)) {
        if (!handler) continue;
        let list = hookMap.get(eventName);
        if (!list) {
          list = [];
          hookMap.set(eventName, list);
        }
        list.push(handler as (payload: unknown) => void | Promise<void>);
      }
    }
  }

  return { emit };
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
     * @param nameOrInstance - Plugin name string or PluginInstance.
     * @returns The plugin API or undefined.
     * @example
     * ```ts
     * ctx.getPlugin(routerPlugin);
     * ```
     */
    getPlugin: (nameOrInstance: string | AnyPluginInstance) => {
      const name = typeof nameOrInstance === "string" ? nameOrInstance : nameOrInstance.name;
      return apis.get(name);
    },
    /**
     * Get plugin API by instance or throw if not found.
     * @param nameOrInstance - Plugin name string or PluginInstance.
     * @returns The plugin API.
     * @example
     * ```ts
     * ctx.require(routerPlugin);
     * ```
     */
    require: (nameOrInstance: string | AnyPluginInstance) => {
      const name = typeof nameOrInstance === "string" ? nameOrInstance : nameOrInstance.name;
      const api = apis.get(name);
      if (!api) {
        throw new Error(
          `[${id}] Plugin "${plugin.name}" requires "${name}", but "${name}" is not registered.\n` +
            `  Add "${name}" to your plugin list.`
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
 * Resolve a plugin name from a string or PluginInstance argument.
 * @param nameOrInstance - A string name or PluginInstance object.
 * @returns The plugin name string.
 * @example
 * ```ts
 * resolvePluginName("router") // "router"
 * resolvePluginName(routerPlugin) // "router"
 * ```
 */
function resolvePluginName(nameOrInstance: string | AnyPluginInstance): string {
  return typeof nameOrInstance === "string" ? nameOrInstance : nameOrInstance.name;
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
 * @returns The frozen app object.
 * @example
 * ```ts
 * const app = buildApp(id, flatPlugins, globalConfig, buildCtx, emit, apis, names, onError);
 * await app.start();
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: app object is dynamically constructed with plugin APIs
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
  onError: ((error: Error) => void) | undefined
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
      await executeStop(flatPlugins, globalConfig, onError);
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
     * @param nameOrInstance - Plugin name string or PluginInstance object.
     * @returns The plugin API object or undefined.
     * @example
     * ```ts
     * const routerApi = app.getPlugin(routerPlugin);
     * ```
     */
    getPlugin: (nameOrInstance: string | AnyPluginInstance) => {
      guardStopped();
      return apis.get(resolvePluginName(nameOrInstance));
    },

    /**
     * Get plugin API or throw if not found.
     * @param nameOrInstance - Plugin name string or PluginInstance object.
     * @returns The plugin API object.
     * @throws {Error} If the plugin is not registered.
     * @example
     * ```ts
     * const routerApi = app.require(routerPlugin);
     * ```
     */
    require: (nameOrInstance: string | AnyPluginInstance) => {
      guardStopped();
      const name = resolvePluginName(nameOrInstance);
      const api = apis.get(name);
      if (!api) {
        throw new Error(
          `[${id}] app.require("${name}") failed: "${name}" is not registered.\n  Check your plugin list.`
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
 *   framework plugin configs, flattened plugins, consumer overrides, callbacks.
 * @returns A promise that resolves to the frozen App object.
 * @example
 * ```ts
 * const app = await kernel({
 *   id: "my-site",
 *   configDefaults: { siteName: "Untitled" },
 *   frameworkPluginConfigs: {},
 *   flatPlugins: [],
 *   consumerOverrides: { siteName: "Blog" },
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
    consumerOverrides,
    onReady,
    onError
  } = parameters;

  // Step 4: Key discrimination
  const pluginNameSet = new Set(flatPlugins.map(plugin => plugin.name));
  const { configOverrides, consumerPluginConfigs } = discriminateKeys(
    pluginNameSet,
    consumerOverrides
  );

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

  // Step 8: Build event bus
  const { emit } = buildEventBus(flatPlugins);

  // Step 9: Build APIs (forward order)
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

  // Step 11: Build and freeze app
  return buildApp(
    id,
    flatPlugins,
    globalConfig,
    buildPluginContext,
    emit,
    apis,
    pluginNameSet,
    onError
  );
}

export { kernel };
export type { KernelParameters };
