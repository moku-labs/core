// =============================================================================
// moku_core v3 - createCoreConfig (Step 1 of Factory Chain)
// =============================================================================
// This is the ONLY export from the package. It captures Config and Events
// generics in a closure and returns { createPlugin, createCore }.
//
// Config and Events flow from here into every downstream function. Plugin
// authors never see or repeat these generics.
//
// createCore (Step 2) is defined within this closure but its implementation
// body is deferred to Plan 03. The type signature is present so sandbox
// tests can compile.
// =============================================================================

import { type BoundCreatePluginFunction, createPluginFactory } from "./create-plugin";
import type { PluginInstance } from "./types";

/** Widened PluginInstance type for generic constraints on arrays. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint on PluginInstance arrays
type AnyPluginInstance = PluginInstance<string, any, any, any, any>;

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

/**
 * Options for createCore (Step 2).
 * @example
 * ```ts
 * createCore(coreConfig, { plugins: [routerPlugin], onReady: (ctx) => console.log(ctx.config) });
 * ```
 */
interface CreateCoreOptions<Config> {
  /** Framework default plugins. */
  readonly plugins: AnyPluginInstance[];
  /** Framework-level plugin config overrides keyed by plugin name. */
  readonly pluginConfigs?: Record<string, unknown>;
  /** Called after all plugins are initialized. */
  readonly onReady?: (context: { config: Readonly<Config> }) => void | Promise<void>;
  /** Global error handler. */
  readonly onError?: (error: Error) => void;
}

/**
 * Return type of createCore (Step 2).
 * @example
 * ```ts
 * const { createApp, createPlugin } = createCore(coreConfig, { plugins: [...] });
 * ```
 */
interface CreateCoreResult<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>
> {
  /**
   * Step 3: Creates and initializes the application.
   * @param options - Consumer-level config overrides, plugin configs, extra plugins.
   * @returns A promise that resolves to the frozen App object.
   */
  // biome-ignore lint/suspicious/noExplicitAny: createApp options are dynamically typed based on registered plugins
  readonly createApp: (options?: any) => Promise<any>;
  /** Re-exported createPlugin for consumer convenience. */
  readonly createPlugin: BoundCreatePluginFunction<Config, Events>;
}

/**
 * Bound createCore function type.
 * @example
 * ```ts
 * const framework = coreConfig.createCore(coreConfig, { plugins: [routerPlugin] });
 * ```
 */
type BoundCreateCoreFunction<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>
> = (
  coreConfig: CoreConfigResult<Config, Events>,
  options: CreateCoreOptions<Config>
) => CreateCoreResult<Config, Events>;

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
  // Capture in closure for downstream use by createCore (Plan 03).
  // configDefaults is referenced only at type-level now; runtime use added in Plan 03.
  const configDefaults: Config = options.config;
  const _frameworkId: string = id;

  // -------------------------------------------------------------------------
  // createPlugin (bound to Config/Events via factory)
  // -------------------------------------------------------------------------
  const createPlugin: BoundCreatePluginFunction<Config, Events> = createPluginFactory<
    Config,
    Events
  >(_frameworkId);

  // -------------------------------------------------------------------------
  // createCore (Step 2 -- type signature present, runtime deferred to Plan 03)
  // -------------------------------------------------------------------------

  /**
   * Step 2: Captures framework default plugins and returns createApp.
   * @param _coreConfig - The CoreConfigResult object (for type flow).
   * @param _options - Framework-level defaults: plugins, pluginConfigs, onReady, onError.
   * @example
   * ```ts
   * const framework = createCore(coreConfig, { plugins: [routerPlugin] });
   * ```
   */
  const createCore: BoundCreateCoreFunction<Config, Events> = (
    _coreConfig,
    _options
  ): CreateCoreResult<Config, Events> => {
    // configDefaults is captured in closure for runtime use in Plan 03.
    // Reference it here to prevent unused variable lint error until then.
    if (configDefaults === undefined) {
      // unreachable: configDefaults is always defined from options.config
    }

    // Runtime implementation deferred to Plan 03 (kernel, flatten, lifecycle).
    // This stub has the correct type signature so sandbox type tests compile.
    throw new Error(
      `[${_frameworkId}] createCore is not yet implemented.\n` +
        `  The kernel runtime will be added in plan 20-03.`
    );
  };

  return { createPlugin, createCore };
}

export { createCoreConfig };
export type { CoreConfigResult, CreateCoreOptions, CreateCoreResult, BoundCreateCoreFunction };
