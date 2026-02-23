// =============================================================================
// moku_core v3 — Config Factory (Step 1 of Factory Chain)
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
import { type BoundCreatePluginFunction, createPluginFactory } from "./create-plugin";

// =============================================================================
// Section 1: Config Result Type
// =============================================================================

/**
 * Return type of createCoreConfig. Named type required for isolatedDeclarations.
 * @example
 * ```ts
 * const result: CoreConfigResult<SiteConfig, SiteEvents> = createCoreConfig("app", { config: defaults });
 * ```
 */
interface CoreConfigResult<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>
> {
  /** Creates a plugin instance with all types inferred from the spec object. */
  readonly createPlugin: BoundCreatePluginFunction<Config, Events>;
  /** Step 2 factory: captures default plugins and returns createApp + createPlugin. */
  readonly createCore: BoundCreateCoreFunction<Config, Events>;
}

// =============================================================================
// Section 2: Config Factory
// =============================================================================

/**
 * Step 1 of the 3-step factory chain. Captures Config and Events generics
 * in a closure and returns { createPlugin, createCore }.
 *
 * This is the ONLY export from moku_core. All downstream types flow from
 * the generics captured here.
 * @param id - Framework identifier used in error messages.
 * @param options - Configuration options containing the default config values.
 * @param options.config - Default configuration values for the framework.
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
  Events extends Record<string, unknown> = Record<string, never>
>(id: string, options: { config: Config }): CoreConfigResult<Config, Events> {
  const configDefaults: Config = options.config;
  const frameworkId: string = id;

  const createPlugin: BoundCreatePluginFunction<Config, Events> = createPluginFactory<
    Config,
    Events
  >(frameworkId);

  const createCore: BoundCreateCoreFunction<Config, Events> = createCoreFactory<Config, Events>(
    frameworkId,
    configDefaults,
    createPlugin
  );

  return { createPlugin, createCore };
}

export { createCoreConfig };
export type { CoreConfigResult };
