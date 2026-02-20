// =============================================================================
// moku_core - Config Resolution (Phase 1)
// =============================================================================
// Internal config resolution functions used by createConfig in src/index.ts.
// Not re-exported from the package entry point (same pattern as src/flatten.ts).
//
// Three functions:
//   1. resolveGlobalConfig: Shallow merge framework defaults + consumer overrides, freeze.
//   2. resolvePluginConfigs: For each plugin, validate required configs then shallow merge + freeze.
//   3. createConfigImpl: Orchestrates flatten, validate, resolve global, resolve plugins.
// =============================================================================

import { flattenPlugins, validatePlugins } from "./flatten.js";

// =============================================================================
// Structural types (same pattern as flatten.ts -- avoids phantom type mismatches)
// =============================================================================

/**
 * Structural type for a plugin-like item that config resolution operates on.
 * Uses structural typing rather than nominal PluginInstance to accept both
 * the full generic types and the temporary RuntimeCoreAPI result types.
 */
type ConfigPluginItem = {
  readonly kind: "plugin" | "component";
  readonly name: string;
  readonly _hasDefaults: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: spec is structurally accessed at runtime; full generic typing in Phase 11
  readonly spec: any;
};

// =============================================================================
// Lifecycle methods that receive config in their context
// =============================================================================

/**
 * Lifecycle methods whose context includes a `config` field.
 * Used by the runtime heuristic to detect plugins that likely need config.
 * - createState: receives MinimalContext (has config)
 * - onCreate: receives MinimalContext (has config)
 * - api: receives PluginContext (has config)
 * - onInit: receives InitContext (has config)
 * - onStart: receives PluginContext (has config)
 *
 * NOT included: onStop, onDestroy (receive TeardownContext -- no config field).
 */
const CONFIG_RECEIVING_METHODS = ["createState", "onCreate", "api", "onInit", "onStart"] as const;

// =============================================================================
// Config resolution functions
// =============================================================================

/**
 * Resolves the global config by shallow-merging framework defaults with consumer overrides.
 * The result is frozen via Object.freeze.
 * @param frameworkDefaults - The framework's complete default config object.
 * @param consumerOverrides - The consumer's partial overrides.
 * @returns A frozen resolved global config object.
 * @example
 * ```ts
 * const global = resolveGlobalConfig({ debug: false, name: "app" }, { debug: true });
 * // { debug: true, name: "app" } -- frozen
 * ```
 */
export function resolveGlobalConfig(
  frameworkDefaults: Record<string, unknown>,
  consumerOverrides: Record<string, unknown>
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...frameworkDefaults, ...consumerOverrides });
}

/**
 * Resolves per-plugin configs by validating required configs and shallow-merging
 * defaultConfig with consumer-provided config. Each resolved config is frozen.
 * Validation heuristic: A plugin "requires config" at runtime if ALL of:
 * `_hasDefaults === false` (no defaultConfig in spec),
 * `pluginConfigs[name]` is undefined (consumer did not provide config),
 * and the spec has at least one lifecycle method that receives config
 * (createState, onCreate, api, onInit, onStart).
 * @param plugins - The flattened, validated plugin list.
 * @param pluginConfigs - Consumer-provided per-plugin config overrides.
 * @returns A Map of plugin name to frozen resolved config object.
 * @throws {Error} If a plugin requires config but none was provided.
 * @example
 * ```ts
 * const resolved = resolvePluginConfigs(flatPlugins, { router: { basePath: "/" } });
 * resolved.get("router"); // { basePath: "/" } -- frozen
 * ```
 */
export function resolvePluginConfigs(
  plugins: ReadonlyArray<ConfigPluginItem>,
  pluginConfigs: Record<string, unknown> | undefined
): Map<string, Readonly<Record<string, unknown>>> {
  const resolved = new Map<string, Readonly<Record<string, unknown>>>();

  for (const plugin of plugins) {
    const { name, spec } = plugin;
    const userConfig = pluginConfigs?.[name] as Record<string, unknown> | undefined;

    // Runtime validation: plugin likely needs config but none provided
    if (!plugin._hasDefaults && userConfig === undefined) {
      const usesConfig = CONFIG_RECEIVING_METHODS.some(method => method in spec);
      if (usesConfig) {
        throw new Error(
          `Plugin "${name}" requires config (no defaultConfig). Provide config in pluginConfigs.`
        );
      }
    }

    // Resolve via shallow merge + freeze
    const base = plugin._hasDefaults ? (spec.defaultConfig as Record<string, unknown>) : undefined;
    resolved.set(name, Object.freeze({ ...base, ...userConfig }));
  }

  return resolved;
}

/**
 * The internal createConfig implementation. Orchestrates flattening, validation,
 * global config resolution, and per-plugin config resolution.
 * @param frameworkName - The framework name for error messages in validation.
 * @param defaults - The framework defaults (config, plugins, etc.).
 * @param options - Consumer-provided options: config overrides, extra plugins, plugin configs.
 * @param options.config - Partial global config overrides from the consumer.
 * @param options.plugins - Extra plugins to append after framework defaults.
 * @param options.pluginConfigs - Per-plugin config overrides keyed by plugin name.
 * @returns An opaque AppConfig object with resolved configs and the flattened plugin list.
 * @example
 * ```ts
 * const appConfig = createConfigImpl("myFramework", defaults, { config: { debug: true } });
 * appConfig._brand; // "AppConfig"
 * ```
 */
export function createConfigImpl(
  frameworkName: string,
  // biome-ignore lint/suspicious/noExplicitAny: defaults is untyped at runtime boundary; full generic typing in Phase 11
  defaults: Record<string, any>,
  options?: {
    config?: Record<string, unknown>;
    // biome-ignore lint/suspicious/noExplicitAny: options.plugins is untyped at runtime boundary; full generic typing in Phase 11
    plugins?: ReadonlyArray<any>;
    pluginConfigs?: Record<string, unknown>;
  }
): RuntimeAppConfig {
  // Flatten framework defaults + consumer extras
  const allInputs = [...(defaults.plugins ?? []), ...(options?.plugins ?? [])];
  const flatList = flattenPlugins(allInputs);

  // Validate the flattened list (duplicates, dependencies)
  validatePlugins(frameworkName, flatList);

  // Resolve global config: shallow merge + freeze
  const resolvedGlobal = resolveGlobalConfig(defaults.config, options?.config ?? {});

  // Resolve per-plugin configs: validate + shallow merge + freeze
  // flatList items from flattenPlugins are structurally compatible with ConfigPluginItem
  // at runtime (they all have _hasDefaults), but the flatten.ts types don't declare it.
  // Cast through unknown to bridge the structural type gap.
  const resolvedPluginMap = resolvePluginConfigs(
    flatList as unknown as ReadonlyArray<ConfigPluginItem>,
    options?.pluginConfigs as Record<string, unknown> | undefined
  );

  return {
    _brand: "AppConfig" as const,
    global: resolvedGlobal,
    extras: options?.plugins ?? [],
    _pluginConfigs: resolvedPluginMap,
    _plugins: flatList as Array<{
      kind: string;
      name: string;
      spec: unknown;
      _hasDefaults: boolean;
    }>,
    _allPlugins: undefined as never // phantom, never read at runtime
  };
}

// =============================================================================
// Runtime type for isolatedDeclarations compatibility
// =============================================================================

/** Runtime shape of the AppConfig object returned by createConfigImpl. */
type RuntimeAppConfig = {
  _brand: "AppConfig";
  global: Readonly<Record<string, unknown>>;
  extras: readonly unknown[];
  _pluginConfigs: Map<string, Readonly<Record<string, unknown>>>;
  _plugins: Array<{ kind: string; name: string; spec: unknown; _hasDefaults: boolean }>;
  _allPlugins: never;
};

export type { RuntimeAppConfig };
