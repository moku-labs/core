// =============================================================================
// moku_core v3 - createCoreConfig (Step 1 of Factory Chain)
// =============================================================================
// This is the ONLY export from the package. It captures Config and Events
// generics in a closure and returns { createPlugin, createCore }.
//
// Config and Events flow from here into every downstream function. Plugin
// authors never see or repeat these generics.
//
// createCore (Step 2) captures framework defaults (plugins, pluginConfigs,
// callbacks) and returns createApp + createPlugin. createApp delegates to the
// kernel function (create-app.ts, Plan 04) with all captured context.
// =============================================================================

import { type BoundCreatePluginFunction, createPluginFactory } from "./create-plugin";
import { flattenPlugins, validatePlugins } from "./flatten";
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
  // Capture in closure for downstream use by createCore and createApp.
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
  // createCore (Step 2 -- captures framework defaults, returns createApp)
  // -------------------------------------------------------------------------

  /**
   * Step 2: Captures framework default plugins and returns createApp.
   * @param _coreConfig - The CoreConfigResult object (for type flow).
   * @param coreOptions - Framework-level defaults: plugins, pluginConfigs, onReady, onError.
   * @returns An object with createApp (async function) and createPlugin (same reference).
   * @example
   * ```ts
   * const framework = createCore(coreConfig, { plugins: [routerPlugin] });
   * ```
   */
  const createCore: BoundCreateCoreFunction<Config, Events> = (
    _coreConfig,
    coreOptions
  ): CreateCoreResult<Config, Events> => {
    // Capture framework-level context for use by createApp
    const defaultPlugins = coreOptions.plugins;
    const frameworkPluginConfigs = coreOptions.pluginConfigs ?? {};
    const onReady = coreOptions.onReady;
    const onError = coreOptions.onError;

    /**
     * Step 3: Creates and initializes the application.
     * Merges consumer options with framework defaults, flattens and validates
     * plugins, then delegates to the kernel for lifecycle execution.
     * @param consumerOptions - Consumer-level config overrides, plugin configs, extra plugins.
     * @returns A promise that resolves to the frozen App object.
     * @example
     * ```ts
     * const app = await createApp({ siteName: "Blog", router: { basePath: "/blog" } });
     * ```
     */
    // biome-ignore lint/suspicious/noExplicitAny: createApp options and return are dynamically typed based on registered plugins
    const createApp = async (consumerOptions?: any): Promise<any> => {
      // Extract extra plugins from consumer options
      const { plugins: extraPlugins, ...rest } = consumerOptions ?? {};

      // Merge plugin lists: framework defaults first, consumer extras second
      const allPlugins = [...defaultPlugins, ...(extraPlugins ?? [])];

      // Flatten sub-plugins depth-first (children before parent)
      const flatPlugins = flattenPlugins(allPlugins);

      // Validate: reserved names, duplicates, dependency existence and order
      validatePlugins(_frameworkId, flatPlugins);

      // Delegate to kernel function (create-app.ts, Plan 04).
      // The kernel receives all captured context and handles:
      // config resolution, state creation, event bus, API building, lifecycle.
      // biome-ignore lint/suspicious/noExplicitAny: kernel context is loosely typed until Plan 04
      const kernelContext: any = {
        id: _frameworkId,
        configDefaults,
        defaultPlugins,
        frameworkPluginConfigs,
        onReady,
        onError,
        flatPlugins,
        consumerOverrides: rest
      };

      // Kernel implementation goes here in Plan 04 (create-app.ts).
      // For now, throw to indicate Plan 04 is needed.
      throw new Error(
        `[${_frameworkId}] createApp kernel is not yet implemented.\n` +
          `  The kernel runtime will be added in plan 20-04. Context captured: ${Object.keys(kernelContext).join(", ")}`
      );
    };

    return { createApp, createPlugin };
  };

  return { createPlugin, createCore };
}

export { createCoreConfig };
export type { CoreConfigResult, CreateCoreOptions, CreateCoreResult, BoundCreateCoreFunction };
