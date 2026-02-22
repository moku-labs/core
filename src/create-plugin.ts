// =============================================================================
// moku_core v3 - createPlugin Factory
// =============================================================================
// This module exports a factory function that creates a bound createPlugin
// function. The bound function captures Config, Events, and frameworkId from
// the createCoreConfig closure and returns a fully typed PluginInstance.
//
// The consumer never imports this file directly. They receive createPlugin
// from createCoreConfig's return value.
//
// TYPE DESIGN: Two overloads handle the partial inference problem.
// Overload 1 (1 type param): for createPlugin<PluginEvents>(name, spec)
// Overload 2 (6 type params): for createPlugin(name, spec) -- zero explicit generics
// This works because TypeScript selects overloads by number of type arguments.
// =============================================================================

import type { DepsEvents, PluginInstance } from "./types";

/** Widened PluginInstance type for generic constraints on arrays. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint on PluginInstance arrays
type AnyPluginInstance = PluginInstance<string, any, any, any, any>;

/** Widened readonly tuple type for depends arrays. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint on depends tuples
type AnyDeps = ReadonlyArray<PluginInstance<string, any, any, any, any>>;

/**
 * Plugin context type used in api, onInit, and onStart callbacks.
 * Merged events includes global Events, plugin PluginEvents, and dependency events.
 * @example
 * ```ts
 * type Ctx = FullPluginContext<SiteConfig, SiteEvents, { basePath: string }, { currentPath: string }>;
 * ```
 */
type FullPluginContext<
  Config extends Record<string, unknown>,
  MergedEvents extends Record<string, unknown>,
  C,
  S
> = {
  readonly global: Readonly<Config>;
  readonly config: Readonly<C>;
  state: S;
  emit: <K extends string & keyof MergedEvents>(name: K, payload: MergedEvents[K]) => void;
  getPlugin: {
    <P extends AnyPluginInstance>(
      plugin: P
      // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching on PluginInstance
    ): P extends PluginInstance<string, any, any, infer PA, any> ? PA | undefined : never;
    (name: string): unknown;
  };
  require: {
    <P extends AnyPluginInstance>(
      plugin: P
      // biome-ignore lint/suspicious/noExplicitAny: Required for conditional type matching on PluginInstance
    ): P extends PluginInstance<string, any, any, infer PA, any> ? PA : never;
    (name: string): unknown;
  };
  has: (name: string) => boolean;
};

/**
 * Descriptor returned by register<T>(). Carries the payload type T
 * and an optional description string for runtime event catalogs.
 */
type EventDescriptor<T = unknown> = {
  readonly description: string;
  /** Phantom field — carries T for type inference. Never set at runtime. */
  readonly _type?: T;
};

/**
 * The register function passed to the events callback.
 * `register<{ userId: string }>("desc")` returns an EventDescriptor
 * that carries both the payload type and description.
 */
type RegisterFunction = <T>(description?: string) => EventDescriptor<T>;

/**
 * The spec shape passed to createPlugin.
 */
type CreatePluginSpec<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>,
  PluginEvents extends Record<string, unknown>,
  C,
  S,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  A extends Record<string, any>,
  Deps extends AnyDeps
> = {
  /**
   * Declare plugin-specific events via a register callback.
   * The kernel calls this at startup to build the event catalog.
   * @example
   * ```ts
   * events: (register) => ({
   *   "auth:login": register<{ userId: string }>("Triggered after user login"),
   *   "auth:logout": register<{ userId: string }>("Triggered after user logout"),
   * })
   * ```
   */
  events?: (register: RegisterFunction) => {
    [K in keyof PluginEvents]: EventDescriptor<PluginEvents[K]>;
  };
  defaultConfig?: C;
  depends?: Deps;
  plugins?: AnyPluginInstance[];
  createState?: (context: { readonly global: Readonly<Config>; readonly config: Readonly<C> }) => S;
  api?: (context: FullPluginContext<Config, Events & PluginEvents & DepsEvents<Deps>, C, S>) => A;
  onInit?: (
    context: FullPluginContext<Config, Events & PluginEvents & DepsEvents<Deps>, C, S>
  ) => void | Promise<void>;
  onStart?: (
    context: FullPluginContext<Config, Events & PluginEvents & DepsEvents<Deps>, C, S>
  ) => void | Promise<void>;
  onStop?: (context: { readonly global: Readonly<Config> }) => void | Promise<void>;
  hooks?: {
    [K in string]?: K extends keyof (Events & PluginEvents & DepsEvents<Deps>)
      ? (payload: (Events & PluginEvents & DepsEvents<Deps>)[K]) => void | Promise<void>
      : (payload: unknown) => void | Promise<void>;
  };
};

/**
 * Bound createPlugin function type, parameterized by the framework's Config and Events.
 *
 * Two overloads handle the partial inference problem:
 * - Overload 1 (1 type param): `createPlugin<PluginEvents>(name, spec)` -- PluginEvents explicit, rest inferred
 * - Overload 2 (0 or 6 type params): `createPlugin(name, spec)` -- all inferred
 *
 * TypeScript selects overloads by matching number of explicit type arguments.
 * @example
 * ```ts
 * const { createPlugin } = createCoreConfig<MyConfig, MyEvents>("my-app", { config: defaults });
 * const router = createPlugin("router", { defaultConfig: { basePath: "/" } });
 * const renderer = createPlugin<RendererEvents>("renderer", { api: ctx => ({ ... }) });
 * ```
 */
type BoundCreatePluginFunction<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>
> = {
  // Overload 1: Zero explicit generics. Everything inferred from spec.
  // Used as: createPlugin("router", { ... })
  // Must be first so TypeScript tries it before the less-specific overload.
  <
    const N extends string = string,
    C = Record<string, never>,
    S = Record<string, never>,
    // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
    A extends Record<string, any> = Record<string, never>,
    Deps extends AnyDeps = readonly [],
    // biome-ignore lint/complexity/noBannedTypes: {} is the identity element for intersection; Record<string, never> poisons event maps
    PluginEvents extends Record<string, unknown> = {}
  >(
    name: N,
    spec: CreatePluginSpec<Config, Events, PluginEvents, C, S, A, Deps>
  ): PluginInstance<N, C, S, A, PluginEvents>;

  // Overload 2: One explicit generic (PluginEvents). Rest inferred from spec.
  // Used as: createPlugin<RendererEvents>("renderer", { ... })
  // Falls back to this when overload 1 fails with explicit type arg.
  // Name type is `string` (not literal) due to TypeScript partial inference
  // limitation. BuildPluginApis filters out non-literal names to prevent
  // string index signature pollution on the App type.
  <PluginEvents extends Record<string, unknown>>(
    name: string,
    // biome-ignore lint/suspicious/noExplicitAny: Overload uses any for non-PluginEvents generics; inference happens at call site
    spec: CreatePluginSpec<Config, Events, PluginEvents, any, any, any, any>
    // biome-ignore lint/suspicious/noExplicitAny: Overload uses any for non-PluginEvents generics; type narrowing happens at call site
  ): PluginInstance<string, any, any, any, PluginEvents>;
};

/**
 * Creates a bound createPlugin function that captures Config, Events, and frameworkId in a closure.
 * @param frameworkId - The framework identifier for error messages.
 * @returns A createPlugin function bound to the framework's Config and Events types.
 * @example
 * ```ts
 * const createPlugin = createPluginFactory<MyConfig, MyEvents>("my-app");
 * const plugin = createPlugin("router", { defaultConfig: { basePath: "/" } });
 * ```
 */
function createPluginFactory<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>
>(frameworkId: string): BoundCreatePluginFunction<Config, Events> {
  /**
   * Creates a plugin instance with inferred types from the spec object.
   * @param name - Unique plugin name (inferred as literal string type).
   * @param spec - Plugin specification with config, state, api, lifecycle, hooks.
   * @returns A PluginInstance carrying phantom types for compile-time inference.
   * @example
   * ```ts
   * const router = createPlugin("router", {
   *   defaultConfig: { basePath: "/" },
   *   api: (ctx) => ({ navigate: (path: string) => path }),
   * });
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Generic factory requires flexible parameter types
  const createPlugin = (name: any, spec: any): any => {
    // -------------------------------------------------------------------------
    // Name validation
    // -------------------------------------------------------------------------
    if (typeof name !== "string" || name.length === 0) {
      throw new TypeError(
        `[${frameworkId}] Plugin name must be a non-empty string.\n` +
          `  Pass a non-empty string as the first argument.`
      );
    }

    // -------------------------------------------------------------------------
    // Lifecycle validation
    // -------------------------------------------------------------------------
    const lifecycleMethods = ["onInit", "onStart", "onStop"] as const;
    for (const method of lifecycleMethods) {
      if (spec[method] !== undefined && typeof spec[method] !== "function") {
        throw new TypeError(
          `[${frameworkId}] Plugin "${name}" has invalid ${method}: expected a function.\n` +
            `  Provide a function for ${method} or remove it from the spec.`
        );
      }
    }

    // -------------------------------------------------------------------------
    // Hooks validation
    // -------------------------------------------------------------------------
    if (spec.hooks !== undefined) {
      if (typeof spec.hooks !== "object" || spec.hooks === null) {
        throw new TypeError(
          `[${frameworkId}] Plugin "${name}" has invalid hooks: expected an object.\n` +
            `  Provide an object mapping event names to handler functions.`
        );
      }

      for (const [eventName, handler] of Object.entries(spec.hooks)) {
        if (typeof handler !== "function") {
          throw new TypeError(
            `[${frameworkId}] Plugin "${name}" has invalid hook for "${eventName}": expected a function.\n` +
              `  Provide a function as the hook handler for "${eventName}".`
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // Return PluginInstance with phantom types
    // -------------------------------------------------------------------------
    return {
      name,
      spec,
      _phantom: {} as {
        config: unknown;
        state: unknown;
        api: unknown;
        events: unknown;
      }
    };
  };

  return createPlugin as BoundCreatePluginFunction<Config, Events>;
}

export { createPluginFactory };
export type { BoundCreatePluginFunction };
