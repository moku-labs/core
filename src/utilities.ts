// =============================================================================
// @moku-labs/core - Shared Utilities
// =============================================================================
// Generic type utilities and runtime validation functions shared across multiple
// source files. No domain knowledge — just reusable machinery.
//
// NOTE: This file has a type-only circular import with types.ts.
//       types.ts imports IsLiteralString and UnionToIntersection from here.
//       This file imports AnyPluginInstance from types.ts.
//       This cycle MUST remain `import type` only to prevent runtime coupling.
//
// -----------------------------------------------------------------------------
// Sections
// -----------------------------------------------------------------------------
//
//   §1 Framework Base Constraints — FrameworkConfig, FrameworkEventMap, EmptyPluginEventMap
//      Base type constraints for generic parameters across the framework.
//   §2 Pure Type Utilities        — UnionToIntersection, IsLiteralString
//      Reusable type-level transformations. No domain knowledge.
//   §3 Plugin Validation          — validatePlugins
//      Runtime validation: reserved names, duplicates, dependency order.
// =============================================================================

// Type-only import -- must NOT become a value import (see file header).
import type { AnyPluginInstance } from "./types";

// =============================================================================
// Section 1: Framework Base Constraints
// =============================================================================

/**
 * Base constraint for framework configuration objects.
 * @example
 * ```ts
 * function createConfig<C extends FrameworkConfig>(defaults: C): C { return defaults; }
 * ```
 */
type FrameworkConfig = Record<string, unknown>;

/**
 * Base constraint for framework event maps.
 * @example
 * ```ts
 * function createEvents<E extends FrameworkEventMap>(events: E): E { return events; }
 * ```
 */
type FrameworkEventMap = Record<string, unknown>;

/**
 * Empty event map used as the default when a plugin declares no custom events.
 * `Record<never, never>` is the identity element for intersection (`T & {} = T`).
 * @example
 * ```ts
 * type PluginEvents = EmptyPluginEventMap; // default when no events declared
 * ```
 */
type EmptyPluginEventMap = Record<never, never>;

// =============================================================================
// Section 2: Pure Type Utilities
// =============================================================================

/**
 * Convert a union to an intersection via distributive conditional + contra-variance.
 * @example
 * ```ts
 * type Result = UnionToIntersection<{ a: 1 } | { b: 2 }>; // { a: 1 } & { b: 2 }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Required for union-to-intersection inference trick
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/**
 * Detect if a string type is a literal (e.g. "router") vs the general `string` type.
 * Used by BuildPluginApis to exclude plugins with non-literal names from the mapped type.
 * @example
 * ```ts
 * type Yes = IsLiteralString<"router">; // true
 * type No = IsLiteralString<string>;    // false
 * ```
 */
type IsLiteralString<S extends string> = string extends S ? false : true;

// =============================================================================
// Section 3: Runtime Guards
// =============================================================================

/**
 * Checks whether a value is a non-null, non-array object record.
 * @param value - Value to inspect.
 * @returns `true` when value is an object record.
 * @example
 * ```ts
 * isRecord({ key: "value" }); // => true
 * isRecord([1, 2, 3]);        // => false
 * isRecord(null);              // => false
 * ```
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// =============================================================================
// Section 4: Plugin Validation
// =============================================================================

/**
 * Reserved app method names that cannot be used as plugin names.
 * @example
 * ```ts
 * RESERVED_NAMES.has("start"); // true
 * RESERVED_NAMES.has("router"); // false
 * ```
 */
const RESERVED_NAMES = new Set([
  "start",
  "stop",
  "emit",
  "require",
  "has",
  "config",
  "__proto__",
  "constructor",
  "prototype"
]);

/**
 * Check that no plugin name collides with reserved app method names.
 * @param id - Framework identifier for error messages.
 * @param names - Array of plugin names to check.
 * @example
 * ```ts
 * checkReservedNames("my-site", ["router", "seo"]); // ok
 * checkReservedNames("my-site", ["start"]); // throws TypeError
 * ```
 */
function checkReservedNames(id: string, names: string[]): void {
  for (const name of names) {
    if (RESERVED_NAMES.has(name)) {
      throw new TypeError(
        `[${id}] Plugin name "${name}" conflicts with a reserved app method.\n` +
          `  Choose a different plugin name.`
      );
    }
  }
}

/**
 * Check that no duplicate plugin names exist.
 * @param id - Framework identifier for error messages.
 * @param names - Array of plugin names to check.
 * @example
 * ```ts
 * checkDuplicateNames("my-site", ["router", "seo"]); // ok
 * checkDuplicateNames("my-site", ["router", "router"]); // throws TypeError
 * ```
 */
function checkDuplicateNames(id: string, names: string[]): void {
  const seen = new Set<string>();

  for (const name of names) {
    if (seen.has(name)) {
      throw new TypeError(
        `[${id}] Duplicate plugin name: "${name}".\n  Each plugin must have a unique name.`
      );
    }
    seen.add(name);
  }
}

/**
 * Check that all dependencies exist and appear before the dependent plugin.
 * @param id - Framework identifier for error messages.
 * @param plugins - The plugin list.
 * @param names - Array of plugin names (same order as plugins).
 * @example
 * ```ts
 * checkDependencyOrder("my-site", [routerPlugin, loggerPlugin], ["router", "logger"]);
 * ```
 */
function checkDependencyOrder(id: string, plugins: AnyPluginInstance[], names: string[]): void {
  for (const [index, plugin] of plugins.entries()) {
    if (!plugin.spec.depends) continue;

    for (const dependency of plugin.spec.depends) {
      const depName = (dependency as AnyPluginInstance).name;
      const depIndex = names.indexOf(depName);

      if (depIndex === -1) {
        throw new TypeError(
          `[${id}] Plugin "${plugin.name}" depends on "${depName}", but "${depName}" is not registered.\n` +
            `  Add "${depName}" to your plugin list before "${plugin.name}".`
        );
      }

      if (depIndex >= index) {
        throw new TypeError(
          `[${id}] Plugin "${plugin.name}" depends on "${depName}", but "${depName}" appears after "${plugin.name}".\n` +
            `  Move "${depName}" before "${plugin.name}" in your plugin list.`
        );
      }
    }
  }
}

/**
 * Validate a plugin list for correctness.
 * Checks: no reserved names, no duplicates, dependencies exist and are ordered.
 * @param id - Framework identifier for error messages.
 * @param plugins - The plugin list to validate.
 * @throws {TypeError} If validation fails.
 * @example
 * ```ts
 * validatePlugins("my-site", plugins); // throws if invalid
 * ```
 */
function validatePlugins(id: string, plugins: AnyPluginInstance[]): void {
  const names = plugins.map(p => p.name);

  checkReservedNames(id, names);
  checkDuplicateNames(id, names);
  checkDependencyOrder(id, plugins, names);
}

// =============================================================================
// Exports
// =============================================================================

export type {
  // Framework base constraints
  FrameworkConfig,
  FrameworkEventMap,
  EmptyPluginEventMap,
  // Pure type utilities
  UnionToIntersection,
  IsLiteralString
};

export { isRecord, validatePlugins };
