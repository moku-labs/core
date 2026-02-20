// =============================================================================
// moku_core - Kernel Runtime (createApp)
// =============================================================================
// The runtime engine of moku_core. Implements createApp with all 9 lifecycle
// phases, dispatch infrastructure (emit/signal/hooks via shared hookMap),
// CoreDefaults framework callbacks, kernel-emitted events, and destroyed flag
// enforcement.
//
// This module is internal. It is imported by src/index.ts and wired into
// createCore's returned CoreAPI.
// =============================================================================

import type { RuntimeAppConfig } from "./config.js";

// =============================================================================
// Runtime types (internal)
// =============================================================================

/**
 * CoreDefaults shape accepted at runtime.
 * Uses structural typing (same pattern as config.ts / flatten.ts).
 * @example
 * ```ts
 * const defaults: RuntimeDefaults = {
 *   config: { debug: false },
 *   onBoot: ({ config }) => console.log("booting", config),
 * };
 * ```
 */
type RuntimeDefaults = {
  // biome-ignore lint/suspicious/noExplicitAny: Runtime defaults; full generic typing via CoreDefaults<BaseConfig> at type level
  config: Record<string, any>;
  onBoot?: (context: { config: Readonly<Record<string, unknown>> }) => void;
  onReady?: (context: { config: Readonly<Record<string, unknown>> }) => void | Promise<void>;
  onShutdown?: (context: { config: Readonly<Record<string, unknown>> }) => void | Promise<void>;
  onError?: (context: {
    error: unknown;
    phase: string;
    pluginName?: string;
  }) => void | Promise<void>;
};

/**
 * Runtime plugin item shape used internally by createApp.
 * @example
 * ```ts
 * const item: RuntimePluginItem = {
 *   kind: "plugin", name: "router", spec: {}, _hasDefaults: false,
 * };
 * ```
 */
type RuntimePluginItem = {
  readonly kind: string;
  readonly name: string;
  // biome-ignore lint/suspicious/noExplicitAny: spec is structurally accessed at runtime
  readonly spec: any;
  readonly _hasDefaults: boolean;
};

/**
 * Runtime shape of the app object returned by createAppImpl.
 * The full generic App type is asserted at the CoreAPI level in createCore.
 * @example
 * ```ts
 * const app: RuntimeApp = { config: {}, emit, signal, ... };
 * ```
 */
type RuntimeApp = {
  readonly config: Readonly<Record<string, unknown>>;
  readonly configs: Readonly<Record<string, unknown>>;
  emit: (hookName: string, payload: unknown) => Promise<void>;
  signal: (hookName: string, payload?: unknown) => Promise<void>;
  getPlugin: (name: string) => unknown;
  require: (name: string) => unknown;
  has: (name: string) => boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: Plugin APIs are dynamically mounted on the app object
  [key: string]: any;
};

// =============================================================================
// Internal helpers (extracted for cognitive complexity and testability)
// =============================================================================

/**
 * Registers all hooks from a plugin spec's hooks field into the shared hookMap.
 * @param spec - The plugin spec containing hooks.
 * @param hookMap - The shared hook dispatch map.
 * @example
 * ```ts
 * registerHooks({ hooks: { "app:start": () => {} } }, hookMap);
 * ```
 */
function registerHooks(
  // biome-ignore lint/suspicious/noExplicitAny: spec is structurally accessed at runtime
  spec: any,
  hookMap: Map<string, Array<(...arguments_: unknown[]) => void | Promise<void>>>
): void {
  if (!spec.hooks) return;
  for (const [hookName, handler] of Object.entries(spec.hooks)) {
    const list = hookMap.get(hookName) ?? [];
    list.push(handler as (...arguments_: unknown[]) => void | Promise<void>);
    hookMap.set(hookName, list);
  }
}

/**
 * Builds a full PluginContext for lifecycle methods that need full communication access.
 * @param globalConfig - The frozen global config.
 * @param config - The plugin's resolved config.
 * @param state - The plugin's mutable state.
 * @param emit - The emit function.
 * @param signal - The signal function.
 * @param getPlugin - The getPlugin function.
 * @param requirePlugin - The requirePlugin function bound to this plugin.
 * @param has - The has function.
 * @returns A full plugin context object.
 * @example
 * ```ts
 * const ctx = buildPluginContext(globalConfig, config, state, emit, signal, getPlugin, require, has);
 * ```
 */
function buildPluginContext(
  globalConfig: Readonly<Record<string, unknown>>,
  config: Readonly<Record<string, unknown>>,
  state: unknown,
  emit: (hookName: string, payload: unknown) => Promise<void>,
  signal: (hookName: string, payload?: unknown) => Promise<void>,
  getPlugin: (name: string) => unknown,
  requirePlugin: (name: string) => unknown,
  has: (name: string) => boolean
): Record<string, unknown> {
  return {
    global: globalConfig,
    config,
    state,
    emit,
    signal,
    getPlugin,
    require: requirePlugin,
    has
  };
}

/**
 * Builds an init context for onInit lifecycle methods (no state).
 * @param globalConfig - The frozen global config.
 * @param config - The plugin's resolved config.
 * @param emit - The emit function.
 * @param signal - The signal function.
 * @param getPlugin - The getPlugin function.
 * @param requirePlugin - The requirePlugin function bound to this plugin.
 * @param has - The has function.
 * @returns An init context object (no state field).
 * @example
 * ```ts
 * const ctx = buildInitContext(globalConfig, config, emit, signal, getPlugin, require, has);
 * ```
 */
function buildInitContext(
  globalConfig: Readonly<Record<string, unknown>>,
  config: Readonly<Record<string, unknown>>,
  emit: (hookName: string, payload: unknown) => Promise<void>,
  signal: (hookName: string, payload?: unknown) => Promise<void>,
  getPlugin: (name: string) => unknown,
  requirePlugin: (name: string) => unknown,
  has: (name: string) => boolean
): Record<string, unknown> {
  return {
    global: globalConfig,
    config,
    emit,
    signal,
    getPlugin,
    require: requirePlugin,
    has
  };
}

/**
 * Executes Phase 2 (Create) for all plugins sequentially.
 * For each plugin: createState, register hooks, onCreate.
 * @param items - The flattened plugin list.
 * @param globalConfig - The frozen global config.
 * @param pluginConfigs - Resolved per-plugin configs.
 * @param states - Map to store plugin states.
 * @param hookMap - Shared hook dispatch map.
 * @param defaults - Framework defaults with onError callback.
 * @example
 * ```ts
 * await executeCreatePhase(items, globalConfig, pluginConfigs, states, hookMap, defaults);
 * ```
 */
async function executeCreatePhase(
  items: RuntimePluginItem[],
  globalConfig: Readonly<Record<string, unknown>>,
  pluginConfigs: Map<string, Readonly<Record<string, unknown>>>,
  states: Map<string, unknown>,
  hookMap: Map<string, Array<(...arguments_: unknown[]) => void | Promise<void>>>,
  defaults: RuntimeDefaults
): Promise<void> {
  for (const item of items) {
    const config = pluginConfigs.get(item.name) ?? Object.freeze({});
    try {
      if (item.spec.createState) {
        const state = await item.spec.createState({ global: globalConfig, config });
        states.set(item.name, state);
      }
      registerHooks(item.spec, hookMap);
      if (item.spec.onCreate) {
        await item.spec.onCreate({ global: globalConfig, config });
      }
    } catch (error: unknown) {
      await defaults.onError?.({ error, phase: "create", pluginName: item.name });
      throw error;
    }
  }
}

/**
 * Executes Phase 3 (Build APIs) for all plugins sequentially.
 * For each plugin: call spec.api with full context, store in apis Map.
 * @param items - The flattened plugin list.
 * @param globalConfig - The frozen global config.
 * @param pluginConfigs - Resolved per-plugin configs.
 * @param states - Plugin state map.
 * @param apis - Map to store plugin APIs.
 * @param emit - The emit function.
 * @param signal - The signal function.
 * @param getPlugin - The getPlugin function.
 * @param requirePlugin - The requirePlugin factory.
 * @param has - The has function.
 * @param defaults - Framework defaults with onError callback.
 * @example
 * ```ts
 * await executeBuildPhase(items, globalConfig, pluginConfigs, states, apis, emit, signal, getPlugin, requirePlugin, has, defaults);
 * ```
 */
async function executeBuildPhase(
  items: RuntimePluginItem[],
  globalConfig: Readonly<Record<string, unknown>>,
  pluginConfigs: Map<string, Readonly<Record<string, unknown>>>,
  states: Map<string, unknown>,
  apis: Map<string, Record<string, unknown>>,
  emit: (hookName: string, payload: unknown) => Promise<void>,
  signal: (hookName: string, payload?: unknown) => Promise<void>,
  getPlugin: (name: string) => unknown,
  requirePlugin: (name: string, requester: string) => unknown,
  has: (name: string) => boolean,
  defaults: RuntimeDefaults
): Promise<void> {
  for (const item of items) {
    const config = pluginConfigs.get(item.name) ?? Object.freeze({});
    const state = states.get(item.name);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: API shape is dynamic at runtime
      let api: Record<string, any> = {};
      if (item.spec.api) {
        const context = buildPluginContext(
          globalConfig,
          config,
          state,
          emit,
          signal,
          getPlugin,
          (n: string) => requirePlugin(n, item.name),
          has
        );
        api = await item.spec.api(context);
      }
      apis.set(item.name, api);
    } catch (error: unknown) {
      await defaults.onError?.({ error, phase: "build", pluginName: item.name });
      throw error;
    }
  }
}

/**
 * Executes Phase 4 (Init) for all plugins sequentially.
 * For each plugin: call spec.onInit with init context (no state).
 * @param items - The flattened plugin list.
 * @param globalConfig - The frozen global config.
 * @param pluginConfigs - Resolved per-plugin configs.
 * @param emit - The emit function.
 * @param signal - The signal function.
 * @param getPlugin - The getPlugin function.
 * @param requirePlugin - The requirePlugin factory.
 * @param has - The has function.
 * @param defaults - Framework defaults with onError callback.
 * @example
 * ```ts
 * await executeInitPhase(items, globalConfig, pluginConfigs, emit, signal, getPlugin, requirePlugin, has, defaults);
 * ```
 */
async function executeInitPhase(
  items: RuntimePluginItem[],
  globalConfig: Readonly<Record<string, unknown>>,
  pluginConfigs: Map<string, Readonly<Record<string, unknown>>>,
  emit: (hookName: string, payload: unknown) => Promise<void>,
  signal: (hookName: string, payload?: unknown) => Promise<void>,
  getPlugin: (name: string) => unknown,
  requirePlugin: (name: string, requester: string) => unknown,
  has: (name: string) => boolean,
  defaults: RuntimeDefaults
): Promise<void> {
  for (const item of items) {
    if (item.spec.onInit) {
      const config = pluginConfigs.get(item.name) ?? Object.freeze({});
      try {
        const context = buildInitContext(
          globalConfig,
          config,
          emit,
          signal,
          getPlugin,
          (n: string) => requirePlugin(n, item.name),
          has
        );
        await item.spec.onInit(context);
      } catch (error: unknown) {
        await defaults.onError?.({ error, phase: "init", pluginName: item.name });
        throw error;
      }
    }
  }
}

/**
 * Executes Phase 5 (Start) for all plugins sequentially in forward order.
 * @param items - The flattened plugin list.
 * @param globalConfig - The frozen global config.
 * @param pluginConfigs - Resolved per-plugin configs.
 * @param states - Plugin state map.
 * @param emit - The emit function.
 * @param signal - The signal function.
 * @param getPlugin - The getPlugin function.
 * @param requirePlugin - The requirePlugin factory.
 * @param has - The has function.
 * @param defaults - Framework defaults with onError callback.
 * @example
 * ```ts
 * await executeStartPhase(items, globalConfig, pluginConfigs, states, emit, signal, getPlugin, requirePlugin, has, defaults);
 * ```
 */
async function executeStartPhase(
  items: RuntimePluginItem[],
  globalConfig: Readonly<Record<string, unknown>>,
  pluginConfigs: Map<string, Readonly<Record<string, unknown>>>,
  states: Map<string, unknown>,
  emit: (hookName: string, payload: unknown) => Promise<void>,
  signal: (hookName: string, payload?: unknown) => Promise<void>,
  getPlugin: (name: string) => unknown,
  requirePlugin: (name: string, requester: string) => unknown,
  has: (name: string) => boolean,
  defaults: RuntimeDefaults
): Promise<void> {
  for (const item of items) {
    if (item.spec.onStart) {
      const config = pluginConfigs.get(item.name) ?? Object.freeze({});
      const state = states.get(item.name);
      try {
        const context = buildPluginContext(
          globalConfig,
          config,
          state,
          emit,
          signal,
          getPlugin,
          (n: string) => requirePlugin(n, item.name),
          has
        );
        await item.spec.onStart(context);
      } catch (error: unknown) {
        await defaults.onError?.({ error, phase: "start", pluginName: item.name });
        throw error;
      }
    }
  }
}

/**
 * Executes Phase 7 (Stop) for all plugins sequentially in reverse order.
 * @param items - The flattened plugin list.
 * @param globalConfig - The frozen global config.
 * @param defaults - Framework defaults with onError callback.
 * @example
 * ```ts
 * await executeStopPhase(items, globalConfig, defaults);
 * ```
 */
async function executeStopPhase(
  items: RuntimePluginItem[],
  globalConfig: Readonly<Record<string, unknown>>,
  defaults: RuntimeDefaults
): Promise<void> {
  for (const item of items.toReversed()) {
    if (item.spec.onStop) {
      try {
        await item.spec.onStop({ global: globalConfig });
      } catch (error: unknown) {
        await defaults.onError?.({ error, phase: "stop", pluginName: item.name });
        throw error;
      }
    }
  }
}

/**
 * Executes Phase 8 (Destroy) for all plugins sequentially in reverse order.
 * @param items - The flattened plugin list.
 * @param globalConfig - The frozen global config.
 * @param defaults - Framework defaults with onError callback.
 * @example
 * ```ts
 * await executeDestroyPhase(items, globalConfig, defaults);
 * ```
 */
async function executeDestroyPhase(
  items: RuntimePluginItem[],
  globalConfig: Readonly<Record<string, unknown>>,
  defaults: RuntimeDefaults
): Promise<void> {
  for (const item of items.toReversed()) {
    if (item.spec.onDestroy) {
      try {
        await item.spec.onDestroy({ global: globalConfig });
      } catch (error: unknown) {
        await defaults.onError?.({ error, phase: "destroy", pluginName: item.name });
        throw error;
      }
    }
  }
}

// =============================================================================
// createAppImpl
// =============================================================================

/**
 * Creates an application instance by executing all lifecycle phases.
 * This is the kernel's runtime engine.
 * @param frameworkName - The framework name used in error messages.
 * @param defaults - CoreDefaults with framework callbacks.
 * @param appConfig - Pre-resolved AppConfig from createConfigImpl.
 * @returns A frozen App object with all plugin APIs mounted.
 * @example
 * ```ts
 * const app = await createAppImpl("myFramework", defaults, appConfig);
 * await app.start();
 * ```
 */
export async function createAppImpl(
  frameworkName: string,
  defaults: RuntimeDefaults,
  appConfig: RuntimeAppConfig
): Promise<RuntimeApp> {
  const items = appConfig._plugins as RuntimePluginItem[];
  const globalConfig = appConfig.global;
  const pluginConfigs = appConfig._pluginConfigs;

  // --- Internal registries ---
  const states = new Map<string, unknown>();
  const apis = new Map<string, Record<string, unknown>>();
  const hookMap = new Map<string, Array<(...arguments_: unknown[]) => void | Promise<void>>>();
  let started = false;
  let destroyed = false;

  /**
   * Throws if the app has been destroyed. Guards all public methods.
   * @param method - The method name for the error message.
   * @example
   * ```ts
   * assertNotDestroyed("start"); // throws if destroyed
   * ```
   */
  function assertNotDestroyed(method: string): void {
    if (destroyed) {
      throw new Error(
        `[${frameworkName}] Cannot call ${method}() on a destroyed app.\n  Create a new app instance.`
      );
    }
  }

  /**
   * Dispatches an event to all registered handlers sequentially.
   * @param hookName - The event/hook name to dispatch.
   * @param payload - The event payload.
   * @returns A promise that resolves when all handlers complete.
   * @example
   * ```ts
   * await dispatch("app:start", { config });
   * ```
   */
  async function dispatch(hookName: string, payload: unknown): Promise<void> {
    const handlers = hookMap.get(hookName);
    if (!handlers) return;
    for (const handler of handlers) {
      await handler(payload);
    }
  }

  /**
   * Emit a typed bus event. Checks destroyed flag first.
   * @param hookName - The event name.
   * @param payload - The event payload.
   * @returns A promise that resolves when all handlers complete.
   * @example
   * ```ts
   * await emit("page:render", { path: "/" });
   * ```
   */
  const emit = (hookName: string, payload: unknown): Promise<void> => {
    assertNotDestroyed("emit");
    return dispatch(hookName, payload);
  };

  /**
   * Fire a signal. Checks destroyed flag first.
   * @param hookName - The signal name.
   * @param payload - The signal payload.
   * @returns A promise that resolves when all handlers complete.
   * @example
   * ```ts
   * await signal("router:navigate", { from: "/a", to: "/b" });
   * ```
   */
  const signal = (hookName: string, payload?: unknown): Promise<void> => {
    assertNotDestroyed("signal");
    return dispatch(hookName, payload);
  };

  // --- Plugin name set for has() registration check ---
  const pluginNameSet = new Set(items.map(item => item.name));

  /**
   * Get a plugin API by name. Returns undefined if not found.
   * Throws on destroyed app.
   * @param pluginName - The plugin name to look up.
   * @returns The plugin API or undefined.
   * @example
   * ```ts
   * const api = getPlugin("router");
   * ```
   */
  const getPlugin = (pluginName: string): unknown => {
    assertNotDestroyed("getPlugin");
    return apis.get(pluginName);
  };

  /**
   * Get a plugin API or throw with clear error.
   * Internal version used by plugin contexts during lifecycle (no destroy guard).
   * @param pluginName - The plugin name to look up.
   * @param requester - The name of the requesting plugin (for error messages).
   * @returns The plugin's public API object.
   * @example
   * ```ts
   * const api = requirePlugin("router", "navigation");
   * ```
   */
  const requirePlugin = (pluginName: string, requester: string): unknown => {
    const api = apis.get(pluginName);
    if (!api) {
      throw new Error(
        `[${frameworkName}] Plugin "${requester}" requires "${pluginName}", but "${pluginName}" is not registered.\n  Add "${pluginName}" to your plugin list.`
      );
    }
    return api;
  };

  /**
   * Check if a plugin is registered (by name, not by API availability).
   * Throws on destroyed app.
   * @param pluginName - The plugin name to check.
   * @returns True if the plugin is registered.
   * @example
   * ```ts
   * if (has("logger")) { ... }
   * ```
   */
  const has = (pluginName: string): boolean => {
    assertNotDestroyed("has");
    return pluginNameSet.has(pluginName);
  };

  // --- Framework onBoot (sync, before Phase 2) ---
  defaults.onBoot?.({ config: globalConfig });

  // --- Phase 2: Create (async, sequential) ---
  await executeCreatePhase(items, globalConfig, pluginConfigs, states, hookMap, defaults);

  // --- Phase 3: Build APIs (async, sequential) ---
  await executeBuildPhase(
    items,
    globalConfig,
    pluginConfigs,
    states,
    apis,
    emit,
    signal,
    getPlugin,
    requirePlugin,
    has,
    defaults
  );

  // --- Name collision detection ---
  const reservedNames = new Set([
    "start",
    "stop",
    "destroy",
    "getPlugin",
    "require",
    "has",
    "config",
    "configs",
    "emit",
    "signal"
  ]);
  for (const item of items) {
    if (reservedNames.has(item.name)) {
      throw new Error(
        `[${frameworkName}] Plugin name "${item.name}" conflicts with built-in app method "${item.name}".\n  Choose a different plugin name.`
      );
    }
  }

  // --- Phase 4: Init (async, sequential) ---
  await executeInitPhase(
    items,
    globalConfig,
    pluginConfigs,
    emit,
    signal,
    getPlugin,
    requirePlugin,
    has,
    defaults
  );

  // --- Build app.configs accessor ---
  const configsAccessor: Record<string, unknown> = {};
  for (const item of items) {
    configsAccessor[item.name] = pluginConfigs.get(item.name) ?? Object.freeze({});
  }
  Object.freeze(configsAccessor);

  // --- Build app object ---
  /** The frozen app configuration. */
  const frozenAppConfig = Object.freeze({ ...globalConfig });

  /** The app object with all lifecycle methods and plugin APIs. */
  const app: RuntimeApp = {
    config: frozenAppConfig,
    configs: configsAccessor,
    emit,
    signal,
    getPlugin,
    /**
     * Require a plugin API from the app level or throw. Throws on destroyed app.
     * @param pluginName - The plugin name to look up.
     * @returns The plugin's public API object.
     * @example
     * ```ts
     * const api = app.require("router");
     * ```
     */
    require: (pluginName: string) => {
      assertNotDestroyed("require");
      return requirePlugin(pluginName, "app");
    },
    has,

    /**
     * Start the app. Emits warning signal on redundant call.
     * @example
     * ```ts
     * await app.start();
     * ```
     */
    start: async () => {
      assertNotDestroyed("start");
      if (started) {
        await signal("app:warn:redundant-start", {
          message: "start() called on already-started app"
        });
        return;
      }
      // started flag set before execution per decision:
      // prevents double-start of already-started plugins even on failure
      started = true;

      await defaults.onReady?.({ config: globalConfig });
      await dispatch("app:start", { config: globalConfig });
      await executeStartPhase(
        items,
        globalConfig,
        pluginConfigs,
        states,
        emit,
        signal,
        getPlugin,
        requirePlugin,
        has,
        defaults
      );
    },

    /**
     * Stop the app. Reverse order. Idempotent -- no-op if not started.
     * @example
     * ```ts
     * await app.stop();
     * ```
     */
    stop: async () => {
      assertNotDestroyed("stop");
      if (!started) return;
      started = false;

      await executeStopPhase(items, globalConfig, defaults);
      await dispatch("app:stop", { config: globalConfig });
      await defaults.onShutdown?.({ config: globalConfig });
    },

    /**
     * Destroy the app. Calls stop() if needed. Terminal -- second call throws.
     * @example
     * ```ts
     * await app.destroy();
     * ```
     */
    destroy: async () => {
      assertNotDestroyed("destroy");

      if (started) {
        await app.stop();
      }

      await executeDestroyPhase(items, globalConfig, defaults);
      await dispatch("app:destroy", {});

      states.clear();
      apis.clear();
      hookMap.clear();
      destroyed = true;
    }
  };

  // --- Mount only non-void API plugins on app ---
  for (const item of items) {
    if (item.spec.api) {
      const api = apis.get(item.name);
      if (api) {
        (app as Record<string, unknown>)[item.name] = api;
      }
    }
  }

  // --- Freeze and return ---
  return Object.freeze(app);
}
