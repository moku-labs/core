// Public type exports for framework authors
export type {
  ComponentInstance,
  ComponentSpec,
  ModuleInstance,
  ModuleSpec,
  PluginInstance,
  PluginSpec
} from "./types.js";

/**
 * Lifecycle context object passed to plugin lifecycle callbacks.
 * @example
 * ```ts
 * const context: LifecycleContext = { config: Object.freeze({ key: "value" }) };
 * ```
 */
type LifecycleContext = {
  config: Readonly<Record<string, unknown>>;
};

/**
 * Default configuration and optional lifecycle callbacks for a core instance.
 * @example
 * ```ts
 * const defaults: CoreDefaults = {
 *   config: { debug: false },
 *   plugins: [],
 *   onBoot: (context) => console.log(context.config)
 * };
 * ```
 */
type CoreDefaults = {
  config: Record<string, unknown>;
  plugins?: unknown[];
  components?: unknown[];
  modules?: unknown[];
  onBoot?: (context: LifecycleContext) => void;
  onReady?: (context: LifecycleContext) => void | Promise<void>;
  onShutdown?: (context: LifecycleContext) => void | Promise<void>;
};

/**
 * The core API object returned by `createCore`, containing all 7 framework functions.
 * @example
 * ```ts
 * const api: CoreAPI = createCore("myFramework", { config: {} });
 * const cfg = api.createConfig({});
 * ```
 */
type CoreAPI = {
  createConfig: (...arguments_: unknown[]) => unknown;
  createApp: (...arguments_: unknown[]) => Promise<unknown>;
  createPlugin: (...arguments_: unknown[]) => unknown;
  createComponent: (...arguments_: unknown[]) => unknown;
  createModule: (...arguments_: unknown[]) => unknown;
  createEventBus: (...arguments_: unknown[]) => unknown;
  createPluginFactory: (...arguments_: unknown[]) => unknown;
};

/**
 * Throws a not-implemented error for a stub function.
 * @param functionName - The name of the stub function that is not yet implemented.
 * @throws {Error} Kernel error format indicating function is not implemented.
 * @example
 * ```ts
 * notImplemented("createConfig");
 * // throws: [moku_core] createConfig is not yet implemented.
 * ```
 */
const notImplemented = (functionName: string): never => {
  throw new Error(
    `[moku_core] ${functionName} is not yet implemented.\n  This is a stub from the skeleton phase.`
  );
};

/**
 * Creates a micro-kernel core instance with the given name and defaults.
 * Returns an object with all 7 CoreAPI functions. In the skeleton phase,
 * every function throws a "not yet implemented" error.
 * @param _name - The framework name used in error messages (unused in stub).
 * @param _defaults - Default configuration and optional lifecycle callbacks (unused in stub).
 * @returns The core API object with all 7 framework functions.
 * @example
 * ```ts
 * const core = createCore("myFramework", { config: { debug: false } });
 * ```
 */
export function createCore(_name: string, _defaults: CoreDefaults): CoreAPI {
  return {
    /**
     * Creates a configuration object.
     * @example
     * ```ts
     * core.createConfig({});
     * ```
     * @returns Never - throws not implemented.
     */
    createConfig: () => notImplemented("createConfig"),
    /**
     * Creates an application instance.
     * @example
     * ```ts
     * await core.createApp({});
     * ```
     * @returns Never - throws not implemented.
     */
    createApp: () => notImplemented("createApp"),
    /**
     * Creates a plugin specification.
     * @example
     * ```ts
     * core.createPlugin({ name: "test" });
     * ```
     * @returns Never - throws not implemented.
     */
    createPlugin: () => notImplemented("createPlugin"),
    /**
     * Creates a component specification.
     * @example
     * ```ts
     * core.createComponent({ name: "test" });
     * ```
     * @returns Never - throws not implemented.
     */
    createComponent: () => notImplemented("createComponent"),
    /**
     * Creates a module specification.
     * @example
     * ```ts
     * core.createModule({ name: "test" });
     * ```
     * @returns Never - throws not implemented.
     */
    createModule: () => notImplemented("createModule"),
    /**
     * Creates an event bus instance.
     * @example
     * ```ts
     * core.createEventBus();
     * ```
     * @returns Never - throws not implemented.
     */
    createEventBus: () => notImplemented("createEventBus"),
    /**
     * Creates a plugin factory function.
     * @example
     * ```ts
     * core.createPluginFactory(() => ({}));
     * ```
     * @returns Never - throws not implemented.
     */
    createPluginFactory: () => notImplemented("createPluginFactory")
  };
}
