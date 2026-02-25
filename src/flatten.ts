// =============================================================================
// moku_core v3 - Plugin Validation
// =============================================================================
// Validates a plugin list for correctness: reserved names, duplicates,
// dependency order. Called by createCore (core.ts) during app initialization.
// =============================================================================

import type { AnyPluginInstance } from "./type-utilities";

/** Reserved app method names that cannot be used as plugin names. */
const RESERVED_NAMES = new Set(["start", "stop", "emit", "require", "has"]);

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
        `[${id}] Duplicate plugin name: "${name}".\n` + `  Each plugin must have a unique name.`
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

export { validatePlugins };
