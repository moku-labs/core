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

import { kernel } from "./create-app";
import { type BoundCreatePluginFunction, createPluginFactory } from "./create-plugin";
import { flattenPlugins, validatePlugins } from "./flatten";
import type { AnyPluginInstance } from "./type-utilities";
import type { App, CreateAppOptions } from "./types";

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
 * Carries the Plugins type parameter to thread type information through createApp.
 * @example
 * ```ts
 * const { createApp, createPlugin } = createCore(coreConfig, { plugins: [...] });
 * ```
 */
interface CreateCoreResult<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>,
  Plugins extends readonly AnyPluginInstance[] = readonly AnyPluginInstance[]
> {
  /**
   * Step 3: Creates and initializes the application.
   * Generic over ExtraPlugins to merge consumer plugins into the return type.
   * @param options - Consumer-level config overrides, plugin configs, extra plugins.
   * @returns A promise that resolves to the frozen, fully typed App object.
   */
  readonly createApp: <const ExtraPlugins extends readonly AnyPluginInstance[] = readonly []>(
    options?: CreateAppOptions<
      Config,
      Events,
      Plugins[number] | ExtraPlugins[number],
      [...ExtraPlugins]
    >
  ) => Promise<App<Config, Events, Plugins[number] | ExtraPlugins[number]>>;
  /** Re-exported createPlugin for consumer convenience. */
  readonly createPlugin: BoundCreatePluginFunction<Config, Events>;
}

/**
 * Bound createCore function type. Generic method captures the Plugins tuple
 * from options.plugins to thread type information into CreateCoreResult.
 * @example
 * ```ts
 * const framework = coreConfig.createCore(coreConfig, { plugins: [routerPlugin] });
 * ```
 */
type BoundCreateCoreFunction<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>
> = <const Plugins extends readonly AnyPluginInstance[]>(
  coreConfig: CoreConfigResult<Config, Events>,
  options: CreateCoreOptions<Config> & { readonly plugins: [...Plugins] }
) => CreateCoreResult<Config, Events, Plugins>;

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
    _coreConfig: CoreConfigResult<Config, Events>,
    coreOptions: CreateCoreOptions<Config> & { readonly plugins: readonly AnyPluginInstance[] }
    // biome-ignore lint/suspicious/noExplicitAny: Generic method implementation requires flexible types; type safety enforced by BoundCreateCoreFunction signature
  ): CreateCoreResult<Config, Events, any> => {
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
    // biome-ignore lint/suspicious/noExplicitAny: createApp options and return are dynamically typed; type safety at boundary via CreateCoreResult
    const createApp = async (consumerOptions?: any): Promise<any> => {
      const {
        plugins: extraPlugins,
        config: consumerConfig,
        pluginConfigs: consumerPluginConfigOverrides,
        onReady: consumerOnReady,
        onError: consumerOnError,
        onStart: consumerOnStart,
        onStop: consumerOnStop
      } = consumerOptions ?? {};

      // Merge plugin lists: framework defaults first, consumer extras second
      const allPlugins = [...defaultPlugins, ...(extraPlugins ?? [])];

      // Flatten sub-plugins depth-first (children before parent)
      const flatPlugins = flattenPlugins(allPlugins);

      // Validate: reserved names, duplicates, dependency existence and order
      validatePlugins(_frameworkId, flatPlugins);

      // Delegate to kernel function with pre-separated config and plugin configs
      return kernel({
        id: _frameworkId,
        configDefaults,
        frameworkPluginConfigs,
        flatPlugins,
        configOverrides: consumerConfig ?? {},
        consumerPluginConfigs: consumerPluginConfigOverrides ?? {},
        onReady,
        onError,
        consumer: {
          onReady: consumerOnReady,
          onError: consumerOnError,
          onStart: consumerOnStart,
          onStop: consumerOnStop
        }
      });
    };

    return { createApp, createPlugin };
  };

  return { createPlugin, createCore };
}

export { createCoreConfig };
export type { CoreConfigResult, CreateCoreOptions, CreateCoreResult, BoundCreateCoreFunction };
