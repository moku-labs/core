// =============================================================================
// @moku-labs/core — Config Factory (Step 1 of Factory Chain)
// =============================================================================
// This is the ONLY export from the package. It captures Config and Events
// generics in a closure and returns { createPlugin, createCore }.
//
// Config and Events flow from here into every downstream function. Plugin
// authors never see or repeat these generics.
//
// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------
//
//   §1 Config Result Type      — CoreConfigResult
//      Return type of createCoreConfig. Named for isolatedDeclarations.
//   §2 Config Factory          — createCoreConfig
//      Step 1: captures framework ID, config defaults, and generic parameters.
//      Delegates to createPluginFactory and createCoreFactory.
//
// =============================================================================

import { type BoundCreateCoreFunction, createCoreFactory } from "./core";
import type {
  AnyCorePluginInstance,
  CoreApisFromTuple,
  ExtractCoreConfig,
  ExtractCoreName
} from "./core-plugin";
import { type BoundCreatePluginFunction, createPluginFactory } from "./plugin";
import type { IsLiteralString } from "./utilities";
import { validateCorePlugins } from "./utilities";

// =============================================================================
// Section 1: Config Result Type
// =============================================================================

/**
 * Return type of createCoreConfig. Named type required for isolatedDeclarations.
 *
 * @example
 * ```ts
 * const result: CoreConfigResult<SiteConfig, SiteEvents> = createCoreConfig("app", { config: defaults });
 * ```
 */
interface CoreConfigResult<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>,
  CorePlugins extends readonly AnyCorePluginInstance[] = readonly []
> {
  /** Creates a plugin instance with all types inferred from the spec object. */
  readonly createPlugin: BoundCreatePluginFunction<Config, Events, CoreApisFromTuple<CorePlugins>>;
  /** Step 2 factory: captures default plugins and returns createApp + createPlugin. */
  readonly createCore: BoundCreateCoreFunction<Config, Events, CorePlugins>;
}

// =============================================================================
// Section 2: Config Factory
// =============================================================================

/**
 * Step 1 of the 3-step factory chain. Captures Config and Events generics
 * in a closure and returns { createPlugin, createCore }.
 *
 * This is the ONLY export from `@moku-labs/core`. All downstream types flow from
 * the generics captured here.
 *
 * @param id - Framework identifier used in error messages.
 * @param options - Configuration options containing the default config values.
 * @param options.config - Default configuration values for the framework.
 * @param options.plugins - Optional core plugin instances to register.
 * @param options.pluginConfigs - Optional config overrides for core plugins.
 * @returns An object with createPlugin (bound to Config/Events) and createCore.
 * @example
 * ```ts
 * const coreConfig = createCoreConfig<SiteConfig, SiteEvents>("my-site", {
 *   config: { siteName: "Untitled", mode: "development" }
 * });
 * const { createPlugin, createCore } = coreConfig;
 * ```
 */
function createCoreConfig<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown> = Record<string, never>,
  const CorePlugins extends readonly AnyCorePluginInstance[] = readonly []
>(
  id: string,
  options: {
    config: Config;
    plugins?: [...CorePlugins];
    pluginConfigs?: {
      [K in CorePlugins[number] as ExtractCoreConfig<K> extends Record<string, never>
        ? never
        : IsLiteralString<ExtractCoreName<K>> extends true
          ? ExtractCoreName<K>
          : never]?: Partial<ExtractCoreConfig<K>>;
    };
  }
): CoreConfigResult<Config, Events, CorePlugins> {
  const configDefaults: Config = options.config;
  const frameworkId: string = id;
  const corePlugins = (options.plugins ?? []) as CorePlugins;
  const corePluginConfigs: Record<string, unknown> = (options.pluginConfigs ?? {}) as Record<
    string,
    unknown
  >;

  // Validate core plugins: reserved names, duplicates
  validateCorePlugins(frameworkId, corePlugins);

  const createPlugin = createPluginFactory<Config, Events, CoreApisFromTuple<CorePlugins>>(
    frameworkId
  );

  const createCore = createCoreFactory<Config, Events, CorePlugins>(
    frameworkId,
    configDefaults,
    createPlugin,
    corePlugins,
    corePluginConfigs
  );

  return { createPlugin, createCore };
}

export { createCoreConfig };
export type { CoreConfigResult };
