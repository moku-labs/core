// =============================================================================
// moku_core v3 — Core Factory (Step 2+3 of Factory Chain)
// =============================================================================
// Creates the bound createCore function that captures framework defaults
// (plugins, pluginConfigs, callbacks) and returns createApp + createPlugin.
//
// createApp (Step 3) is defined inside createCore. It merges consumer options
// with framework defaults, flattens and validates plugins, then delegates to
// the kernel (app.ts).
//
// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------
//
//   §1 Options Types             — CreateCoreOptions, ConsumerAppOptions
//      Typed shapes for createCore and createApp options at the runtime boundary.
//   §2 Core Result Type          — CreateCoreResult
//      Return of createCore: createApp + createPlugin.
//   §3 Bound Core Function       — BoundCreateCoreFunction
//      Generic method signature capturing the Plugins tuple.
//   §4 Core Factory              — createCoreFactory
//      Creates a bound createCore closed over frameworkId, configDefaults,
//      and createPlugin.
//
// =============================================================================

import { kernel } from "./app";
import type { BoundCreatePluginFunction } from "./plugin";
import type { AnyPluginInstance, App, CreateAppOptions } from "./types";
import { validatePlugins } from "./utilities";

// =============================================================================
// Section 1: Options Types
// =============================================================================

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
 * Runtime shape for createApp consumer options.
 * Type safety is enforced at compile time by the CreateCoreResult.createApp
 * signature (which uses CreateAppOptions with full generics). This interface
 * provides typed destructuring at the runtime boundary so that individual
 * fields don't degrade to `unknown`.
 */
interface ConsumerAppOptions {
  readonly plugins?: readonly AnyPluginInstance[];
  readonly config?: Record<string, unknown>;
  readonly pluginConfigs?: Record<string, unknown>;
  readonly onReady?: (context: unknown) => void | Promise<void>;
  readonly onError?: (error: Error, context?: unknown) => void;
  readonly onStart?: (context: unknown) => void | Promise<void>;
  readonly onStop?: (context: unknown) => void | Promise<void>;
}

// =============================================================================
// Section 2: Core Result Type
// =============================================================================

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

// =============================================================================
// Section 3: Bound Core Function Type
// =============================================================================

/**
 * Bound createCore function type. Generic method captures the Plugins tuple
 * from options.plugins to thread type information into CreateCoreResult.
 * @example
 * ```ts
 * const framework = createCore(coreConfig, { plugins: [routerPlugin] });
 * ```
 */
type BoundCreateCoreFunction<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>
> = <const Plugins extends readonly AnyPluginInstance[]>(
  coreConfig: {
    readonly createPlugin: BoundCreatePluginFunction<Config, Events>;
  },
  options: CreateCoreOptions<Config> & { readonly plugins: [...Plugins] }
) => CreateCoreResult<Config, Events, Plugins>;

// =============================================================================
// Section 4: Core Factory
// =============================================================================

/**
 * Creates a bound `createCore` function that captures framework context.
 *
 * Generic parameters:
 * - `Config`: app-wide config from `createCoreConfig`
 * - `Events`: app-wide events from `createCoreConfig`
 * @param frameworkId - The framework identifier for error messages.
 * @param configDefaults - Default config values captured from Step 1.
 * @param createPlugin - Bound createPlugin function from Step 1.
 * @returns A createCore function bound to the framework's Config and Events types.
 * @example
 * ```ts
 * const createCore = createCoreFactory<MyConfig, MyEvents>(
 *   "my-app", configDefaults, createPlugin
 * );
 * ```
 */
function createCoreFactory<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>
>(
  frameworkId: string,
  configDefaults: Config,
  createPlugin: BoundCreatePluginFunction<Config, Events>
): BoundCreateCoreFunction<Config, Events> {
  /**
   * Step 2: Captures framework default plugins and returns createApp.
   * @param _coreConfig - The CoreConfigResult object (for type flow only).
   * @param coreOptions - Framework-level defaults: plugins, pluginConfigs, onReady, onError.
   * @returns An object with createApp (async function) and createPlugin (same reference).
   * @example
   * ```ts
   * const { createApp, createPlugin } = createCore(coreConfig, { plugins: [routerPlugin] });
   * ```
   */
  const createCore = (_coreConfig: unknown, coreOptions: unknown): unknown => {
    // Cast to expected shape — type safety enforced by BoundCreateCoreFunction signature
    const options = coreOptions as CreateCoreOptions<Config>;

    // Capture framework-level context for use by createApp
    const defaultPlugins = options.plugins;
    const frameworkPluginConfigs = options.pluginConfigs ?? {};
    const onReady = options.onReady;
    const onError = options.onError;

    /**
     * Step 3: Creates and initializes the application.
     * Merges consumer options with framework defaults, flattens and validates
     * plugins, then delegates to the kernel for lifecycle execution.
     * @param consumerOptions - Consumer-level config, plugins, and callbacks.
     * @returns A promise that resolves to the frozen App object.
     * @example
     * ```ts
     * const app = await createApp({ config: { siteName: "Blog" } });
     * ```
     */
    const createApp = async (consumerOptions?: unknown): Promise<unknown> => {
      // Cast to expected shape — type safety enforced by CreateCoreResult.createApp signature
      const appOptions = (consumerOptions ?? {}) as ConsumerAppOptions;

      // Merge plugin lists: framework defaults first, consumer extras second
      const allPlugins = [...defaultPlugins, ...(appOptions.plugins ?? [])];

      // Validate: reserved names, duplicates, dependency existence and order
      validatePlugins(frameworkId, allPlugins);

      // Delegate to kernel with pre-separated config and plugin configs
      return kernel({
        id: frameworkId,
        configDefaults,
        frameworkPluginConfigs,
        flatPlugins: allPlugins,
        configOverrides: appOptions.config ?? {},
        consumerPluginConfigs: appOptions.pluginConfigs ?? {},
        onReady,
        onError,
        consumer: {
          onReady: appOptions.onReady,
          onError: appOptions.onError,
          onStart: appOptions.onStart,
          onStop: appOptions.onStop
        }
      });
    };

    return { createApp, createPlugin };
  };

  return createCore as BoundCreateCoreFunction<Config, Events>;
}

export { createCoreFactory };
export type { CreateCoreOptions, CreateCoreResult, BoundCreateCoreFunction };
