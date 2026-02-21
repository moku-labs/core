// =============================================================================
// moku_core v3 - createPlugin Factory
// =============================================================================
// This module exports a factory function that creates a bound createPlugin
// function. The bound function captures Config, Events, and frameworkId from
// the createCoreConfig closure and returns a fully typed PluginInstance.
//
// The consumer never imports this file directly. They receive createPlugin
// from createCoreConfig's return value.
// =============================================================================

import type { DepsEvents, PluginInstance, PluginSpec } from "./types";

/** Widened PluginInstance type for generic constraints on arrays. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint on PluginInstance arrays
type AnyPluginInstance = PluginInstance<string, any, any, any, any>;

/** Widened readonly tuple type for depends arrays. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint on depends tuples
type AnyDeps = ReadonlyArray<PluginInstance<string, any, any, any, any>>;

/**
 * Bound createPlugin function type, parameterized by the framework's Config and Events.
 * @example
 * ```ts
 * const { createPlugin } = createCoreConfig<MyConfig, MyEvents>("my-app", { config: defaults });
 * const router = createPlugin("router", { defaultConfig: { basePath: "/" } });
 * ```
 */
type BoundCreatePluginFunction<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown>
> = <
  PluginEvents extends Record<string, unknown> = Record<string, never>,
  const N extends string = string,
  C = Record<string, never>,
  S = Record<string, never>,
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability
  A extends Record<string, any> = Record<string, never>,
  Deps extends AnyDeps = readonly []
>(
  name: N,
  spec: PluginSpec<Config, Events, PluginEvents, C, S, A, Deps> & {
    defaultConfig?: C;
    depends?: Deps;
    plugins?: AnyPluginInstance[];
    createState?: (context: {
      readonly global: Readonly<Config>;
      readonly config: Readonly<C>;
    }) => S;
    api?: (context: {
      readonly global: Readonly<Config>;
      readonly config: Readonly<C>;
      state: S;
      emit: {
        <K extends string & keyof (Events & PluginEvents & DepsEvents<Deps>)>(
          name: K,
          payload: (Events & PluginEvents & DepsEvents<Deps>)[K]
        ): void;
        (name: string, payload?: unknown): void;
      };
      getPlugin: {
        <P extends AnyPluginInstance>(
          plugin: P
        ): P extends PluginInstance<string, any, any, infer PA, any> ? PA | undefined : never;
        (name: string): unknown;
      };
      require: {
        <P extends AnyPluginInstance>(
          plugin: P
        ): P extends PluginInstance<string, any, any, infer PA, any> ? PA : never;
        (name: string): unknown;
      };
      has: (name: string) => boolean;
    }) => A;
    onInit?: (context: {
      readonly global: Readonly<Config>;
      readonly config: Readonly<C>;
      state: S;
      emit: {
        <K extends string & keyof (Events & PluginEvents & DepsEvents<Deps>)>(
          name: K,
          payload: (Events & PluginEvents & DepsEvents<Deps>)[K]
        ): void;
        (name: string, payload?: unknown): void;
      };
      getPlugin: {
        <P extends AnyPluginInstance>(
          plugin: P
        ): P extends PluginInstance<string, any, any, infer PA, any> ? PA | undefined : never;
        (name: string): unknown;
      };
      require: {
        <P extends AnyPluginInstance>(
          plugin: P
        ): P extends PluginInstance<string, any, any, infer PA, any> ? PA : never;
        (name: string): unknown;
      };
      has: (name: string) => boolean;
    }) => void | Promise<void>;
    onStart?: (context: {
      readonly global: Readonly<Config>;
      readonly config: Readonly<C>;
      state: S;
      emit: {
        <K extends string & keyof (Events & PluginEvents & DepsEvents<Deps>)>(
          name: K,
          payload: (Events & PluginEvents & DepsEvents<Deps>)[K]
        ): void;
        (name: string, payload?: unknown): void;
      };
      getPlugin: {
        <P extends AnyPluginInstance>(
          plugin: P
        ): P extends PluginInstance<string, any, any, infer PA, any> ? PA | undefined : never;
        (name: string): unknown;
      };
      require: {
        <P extends AnyPluginInstance>(
          plugin: P
        ): P extends PluginInstance<string, any, any, infer PA, any> ? PA : never;
        (name: string): unknown;
      };
      has: (name: string) => boolean;
    }) => void | Promise<void>;
    onStop?: (context: { readonly global: Readonly<Config> }) => void | Promise<void>;
    hooks?: {
      [K in string]?: K extends keyof (Events & PluginEvents & DepsEvents<Deps>)
        ? (payload: (Events & PluginEvents & DepsEvents<Deps>)[K]) => void | Promise<void>
        : (payload: unknown) => void | Promise<void>;
    };
  }
) => PluginInstance<N, C, S, A, PluginEvents>;

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
