// Public type exports for framework authors + internal type imports
import type { CoreAPI, CoreDefaults } from "./types.js";

export { createEventBusImpl as createEventBus } from "./event-bus.js";
export type {
  AppConfig,
  ComponentInstance,
  ComponentSpec,
  CoreAPI,
  CoreDefaults,
  EventBus,
  ModuleInstance,
  ModuleSpec,
  PluginInstance,
  PluginSpec
} from "./types.js";

import { createConfigImpl } from "./config.js";
import { createEventBusImpl } from "./event-bus.js";
import { createAppImpl } from "./kernel.js";

/**
 * Creates a micro-kernel core instance with the given name and defaults.
 * Returns an object with all 7 CoreAPI functions typed against the framework's
 * BaseConfig, BusContract, and SignalRegistry generics.
 * @param name - The framework name used in error messages.
 * @param defaults - Default configuration, built-in plugins, and optional lifecycle callbacks.
 * @returns The core API object with all 7 framework functions.
 * @example
 * ```ts
 * const core = createCore("myFramework", { config: { debug: false } });
 * const config = core.createConfig({ config: { debug: true } });
 * const app = await core.createApp(config);
 * ```
 */
export function createCore<
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BaseConfig extends Record<string, any> = Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  BusContract extends Record<string, any> = Record<string, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability in TypeScript
  SignalRegistry extends Record<string, any> = Record<string, unknown>
>(
  name: string,
  defaults: CoreDefaults<BaseConfig>
): CoreAPI<BaseConfig, BusContract, SignalRegistry> {
  // ---------------------------------------------------------------------------
  // Shared validation helpers (internal to createCore)
  // ---------------------------------------------------------------------------

  /**
   * Validates that a plugin/component/module name is a non-empty string.
   * @param pluginName - The name to validate.
   * @throws {TypeError} If name is not a string or is empty.
   * @example
   * ```ts
   * validateName("router"); // passes
   * validateName(""); // throws
   * ```
   */
  function validateName(pluginName: unknown): asserts pluginName is string {
    if (typeof pluginName !== "string") {
      throw new TypeError(
        `[${name}] Plugin name must be a string, got ${typeof pluginName}.\n  Pass a non-empty string as the first argument.`
      );
    }
    if (pluginName === "") {
      throw new Error(
        `[${name}] Plugin name must not be empty.\n  Pass a non-empty string as the first argument.`
      );
    }
  }

  /**
   * Validates that lifecycle-related fields in a spec are functions if present.
   * @param pluginName - Name of the plugin/component for error messages.
   * @param spec - The spec object to validate.
   * @param specType - "plugin" | "component" | "factory" for error messages.
   * @param fields - List of field names to check.
   * @example
   * ```ts
   * validateLifecycleMethods("router", { api: () => ({}) }, "plugin", ["api"]);
   * ```
   */
  function validateLifecycleMethods(
    pluginName: string,
    // biome-ignore lint/suspicious/noExplicitAny: spec is untyped at runtime validation level
    spec: Record<string, any>,
    specType: string,
    fields: readonly string[]
  ): void {
    for (const field of fields) {
      if (field in spec && typeof spec[field] !== "function") {
        const label =
          specType === "factory"
            ? `Factory spec`
            : `${specType.charAt(0).toUpperCase()}${specType.slice(1)} "${pluginName}"`;
        throw new Error(
          `[${name}] ${label}: ${field} must be a function, got ${typeof spec[field]}.\n  Provide a function or remove the ${field} property.`
        );
      }
    }
  }

  /**
   * Validates that the hooks field is a plain object if present.
   * @param pluginName - Name of the plugin/component for error messages.
   * @param spec - The spec object to validate.
   * @param specType - "plugin" | "component" | "factory" for error messages.
   * @example
   * ```ts
   * validateHooks("router", { hooks: { "app:start": () => {} } }, "plugin");
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: spec is untyped at runtime validation level
  function validateHooks(pluginName: string, spec: Record<string, any>, specType: string): void {
    if ("hooks" in spec) {
      const hooks = spec.hooks;
      if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
        const label =
          specType === "factory"
            ? `Factory spec`
            : `${specType.charAt(0).toUpperCase()}${specType.slice(1)} "${pluginName}"`;
        throw new Error(
          `[${name}] ${label}: hooks must be a plain object, got ${Array.isArray(hooks) ? "array" : typeof hooks}.\n  Provide a plain object with event handler functions or remove the hooks property.`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Plugin lifecycle field lists
  // ---------------------------------------------------------------------------

  const PLUGIN_LIFECYCLE_FIELDS = [
    "api",
    "createState",
    "onCreate",
    "onInit",
    "onStart",
    "onStop",
    "onDestroy"
  ] as const;

  const COMPONENT_LIFECYCLE_FIELDS = ["api", "createState", "onMount", "onUnmount"] as const;

  // ---------------------------------------------------------------------------
  // Creation functions
  // ---------------------------------------------------------------------------

  /**
   * Creates a plugin instance from a name and spec.
   * @param pluginName - Unique plugin name.
   * @param spec - Plugin specification with lifecycle methods and config.
   * @returns A PluginInstance with kind "plugin".
   * @example
   * ```ts
   * const plugin = createPlugin("router", { defaultConfig: { basePath: "/" } });
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Runtime function; full generic typing handled by type-level signature
  function createPlugin(pluginName: any, spec: any) {
    validateName(pluginName);
    validateLifecycleMethods(pluginName, spec, "plugin", PLUGIN_LIFECYCLE_FIELDS);
    validateHooks(pluginName, spec, "plugin");
    return {
      kind: "plugin" as const,
      name: pluginName,
      spec,
      _types: {},
      _hasDefaults: "defaultConfig" in spec
    };
  }

  /**
   * Creates a component instance. Maps onMount to onStart and onUnmount to onStop.
   * @param componentName - Unique component name.
   * @param spec - Component specification with onMount/onUnmount lifecycle.
   * @returns A ComponentInstance with kind "component".
   * @example
   * ```ts
   * const comp = createComponent("sidebar", { onMount: (ctx) => {} });
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Runtime function; full generic typing handled by type-level signature
  function createComponent(componentName: any, spec: any) {
    validateName(componentName);
    validateLifecycleMethods(componentName, spec, "component", COMPONENT_LIFECYCLE_FIELDS);
    validateHooks(componentName, spec, "component");
    const mappedSpec = {
      ...spec,
      onStart: spec.onMount,
      onStop: spec.onUnmount
    };
    return {
      kind: "component" as const,
      name: componentName,
      spec: mappedSpec,
      _types: {},
      _hasDefaults: "defaultConfig" in spec
    };
  }

  /**
   * Creates a module instance. Modules are flattening containers with no runtime lifecycle.
   * @param moduleName - Unique module name.
   * @param spec - Module specification with plugins, components, modules arrays.
   * @returns A ModuleInstance with kind "module".
   * @example
   * ```ts
   * const mod = createModule("auth", { plugins: [authPlugin] });
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Runtime function; full generic typing handled by type-level signature
  function createModule(moduleName: any, spec: any) {
    validateName(moduleName);

    // Validate array fields
    for (const field of ["plugins", "components", "modules"] as const) {
      if (field in spec && !Array.isArray(spec[field])) {
        throw new Error(
          `[${name}] Module "${moduleName}": ${field} must be an array, got ${typeof spec[field]}.\n  Provide an array of ${field} or remove the property.`
        );
      }
    }

    // Validate onRegister is a function if present
    if ("onRegister" in spec && typeof spec.onRegister !== "function") {
      throw new Error(
        `[${name}] Module "${moduleName}": onRegister must be a function, got ${typeof spec.onRegister}.\n  Provide a function or remove the onRegister property.`
      );
    }

    return {
      kind: "module" as const,
      name: moduleName,
      spec
    };
  }

  /**
   * Creates a factory function that produces named PluginInstances sharing the same spec.
   * Validates the spec once at factory creation time.
   * @param spec - Plugin specification shared by all factory-produced instances.
   * @returns A function that takes a name and returns a PluginInstance.
   * @example
   * ```ts
   * const factory = createPluginFactory({ api: (ctx) => ({ greet: () => "hi" }) });
   * const instance = factory("greeter");
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Runtime function; full generic typing handled by type-level signature
  function createPluginFactory(spec: any) {
    // Validate spec at factory creation time
    validateLifecycleMethods("factory", spec, "factory", PLUGIN_LIFECYCLE_FIELDS);
    validateHooks("factory", spec, "factory");
    const hasDefaults = "defaultConfig" in spec;

    // biome-ignore lint/suspicious/noExplicitAny: Factory name parameter is validated at runtime
    return (factoryName: any) => {
      validateName(factoryName);
      return {
        kind: "plugin" as const,
        name: factoryName,
        spec,
        _types: {},
        _hasDefaults: hasDefaults
      };
    };
  }

  // ---------------------------------------------------------------------------
  // Return CoreAPI
  // ---------------------------------------------------------------------------

  // Cast defaults for internal functions that use structural runtime types.
  // The generic CoreDefaults<BaseConfig> is fully compatible at runtime,
  // but createConfigImpl and createAppImpl use looser structural types.
  // biome-ignore lint/suspicious/noExplicitAny: Runtime bridge between generic CoreDefaults and internal structural types
  const runtimeDefaults = defaults as any;

  return {
    /**
     * Creates a configuration object by resolving global and per-plugin configs.
     * Flattens and validates plugins, shallow-merges configs, and freezes results.
     * @param options - Optional config overrides, extra plugins, and per-plugin configs.
     * @param options.config - Partial global config overrides from the consumer.
     * @param options.plugins - Extra plugins to append after framework defaults.
     * @param options.pluginConfigs - Per-plugin config overrides keyed by plugin name.
     * @returns An opaque AppConfig with resolved configs and the flattened plugin list.
     * @example
     * ```ts
     * const config = core.createConfig({ config: { debug: true } });
     * ```
     */
    createConfig: (options?: {
      config?: Partial<BaseConfig>;
      plugins?: readonly unknown[];
      pluginConfigs?: Record<string, unknown>;
    }) => createConfigImpl(name, runtimeDefaults, options),
    /**
     * Creates an application instance by executing all lifecycle phases.
     * @param appConfig - Pre-resolved AppConfig from createConfig.
     * @returns A frozen App object with all plugin APIs mounted.
     * @example
     * ```ts
     * const app = await core.createApp(config);
     * ```
     */
    // biome-ignore lint/suspicious/noExplicitAny: AppConfig uses any for plugin union at call site; full typing via CoreAPI
    createApp: (appConfig: any) => createAppImpl(name, runtimeDefaults, appConfig),
    createPlugin,
    createComponent,
    createModule,
    /**
     * Creates a standalone typed event bus instance.
     * @param busConfig - Optional config with maxListeners and onError.
     * @param busConfig.maxListeners - Maximum listeners per event before console.warn.
     * @param busConfig.onError - Called before re-throwing when a handler throws.
     * @returns A frozen EventBus with emit, on, off, once, and clear methods.
     * @example
     * ```ts
     * const bus = core.createEventBus<{ "user:login": { id: string } }>();
     * bus.on("user:login", (payload) => console.log(payload.id));
     * ```
     */
    createEventBus: (busConfig?: { maxListeners?: number; onError?: (error: unknown) => void }) =>
      createEventBusImpl(busConfig),
    createPluginFactory
  } as unknown as CoreAPI<BaseConfig, BusContract, SignalRegistry>;
}
