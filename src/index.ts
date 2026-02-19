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
 * Throws a not-implemented error for a stub function.
 * @param name - The framework name used in the error prefix.
 * @param functionName - The name of the stub function that is not yet implemented.
 * @throws {Error} Kernel error format indicating function is not implemented.
 * @example
 * ```ts
 * notImplemented("myFramework", "createConfig");
 * // throws: [myFramework] createConfig is not yet implemented.
 * ```
 */
const notImplemented = (name: string, functionName: string): never => {
  throw new Error(
    `[${name}] ${functionName} is not yet implemented.\n  This is a stub from the skeleton phase.`
  );
};

/** Instance shape returned by createPlugin and createPluginFactory. Temporary loose type -- replaced in Phase 11. */
type PluginInstanceResult = {
  kind: "plugin";
  name: string;
  // biome-ignore lint/suspicious/noExplicitAny: Loose runtime type; full generic signature wired in Phase 11
  spec: any;
  _types: Record<string, never>;
  _hasDefaults: boolean;
};

/** Instance shape returned by createComponent. Temporary loose type -- replaced in Phase 11. */
type ComponentInstanceResult = {
  kind: "component";
  name: string;
  // biome-ignore lint/suspicious/noExplicitAny: Loose runtime type; full generic signature wired in Phase 11
  spec: any;
  _types: Record<string, never>;
  _hasDefaults: boolean;
};

/** Instance shape returned by createModule. Temporary loose type -- replaced in Phase 11. */
type ModuleInstanceResult = {
  kind: "module";
  name: string;
  // biome-ignore lint/suspicious/noExplicitAny: Loose runtime type; full generic signature wired in Phase 11
  spec: any;
};

/** The runtime CoreAPI shape returned by createCore. Temporary loose type -- replaced in Phase 11. */
type RuntimeCoreAPI = {
  createConfig: (...arguments_: unknown[]) => never;
  createApp: (...arguments_: unknown[]) => never;
  // biome-ignore lint/suspicious/noExplicitAny: Loose runtime type; full generic signature wired in Phase 11
  createPlugin: (pluginName: any, spec: any) => PluginInstanceResult;
  // biome-ignore lint/suspicious/noExplicitAny: Loose runtime type; full generic signature wired in Phase 11
  createComponent: (componentName: any, spec: any) => ComponentInstanceResult;
  // biome-ignore lint/suspicious/noExplicitAny: Loose runtime type; full generic signature wired in Phase 11
  createModule: (moduleName: any, spec: any) => ModuleInstanceResult;
  createEventBus: (...arguments_: unknown[]) => never;
  // biome-ignore lint/suspicious/noExplicitAny: Loose runtime type; full generic signature wired in Phase 11
  createPluginFactory: (spec: any) => (factoryName: any) => PluginInstanceResult;
};

/**
 * Creates a micro-kernel core instance with the given name and defaults.
 * Returns an object with all 7 CoreAPI functions. The 4 creation functions
 * (createPlugin, createComponent, createModule, createPluginFactory) are
 * implemented. createConfig, createApp, and createEventBus remain stubs.
 * @param name - The framework name used in error messages.
 * @param _defaults - Default configuration and optional lifecycle callbacks.
 * @returns The core API object with all 7 framework functions.
 * @example
 * ```ts
 * const core = createCore("myFramework", { config: { debug: false } });
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: createCore uses loose types at runtime; full generic signature wired in Phase 11
export function createCore(name: string, _defaults: Record<string, any>): RuntimeCoreAPI {
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

  return {
    /**
     * Creates a configuration object. Stub -- not yet implemented.
     * @returns Never - throws not implemented.
     * @example
     * ```ts
     * core.createConfig({});
     * ```
     */
    createConfig: (): never => notImplemented(name, "createConfig"),
    /**
     * Creates an application instance. Stub -- not yet implemented.
     * @returns Never - throws not implemented.
     * @example
     * ```ts
     * await core.createApp({});
     * ```
     */
    createApp: (): never => notImplemented(name, "createApp"),
    createPlugin,
    createComponent,
    createModule,
    /**
     * Creates an event bus instance. Stub -- not yet implemented.
     * @returns Never - throws not implemented.
     * @example
     * ```ts
     * core.createEventBus();
     * ```
     */
    createEventBus: (): never => notImplemented(name, "createEventBus"),
    createPluginFactory
  };
}
