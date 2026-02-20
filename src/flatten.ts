// =============================================================================
// moku_core - Flattening and Validation (Phase 0)
// =============================================================================
// Two internal functions that implement Phase 0 of createApp:
//   1. flattenPlugins: Take a mixed list of plugins, components, and modules,
//      produce a flat ordered list of plugins and components.
//   2. validatePlugins: Check the flat list for duplicate names, missing
//      dependencies, and wrong dependency order.
//
// These are internal to the package. Not re-exported from src/index.ts.
// Wiring into createApp happens in Phase 11.
// =============================================================================

import type { ComponentInstance, ModuleInstance, PluginInstance } from "./types.js";

/** PluginInstance with widened generics for accepting any plugin. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability -- instances use any for framework generics
type PluginInstanceAny = PluginInstance<string, any, any, any>;
/** ComponentInstance with widened generics for accepting any component. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability -- instances use any for framework generics
type ComponentInstanceAny = ComponentInstance<string, any, any, any>;
/** ModuleInstance with widened generics for accepting any module. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint assignability -- instances use any for framework generics
type ModuleInstanceAny = ModuleInstance<string, any>;

/**
 * Union type for items that can appear in a plugin list:
 * plugins, components, or modules.
 */
type PluginLike = PluginInstanceAny | ComponentInstanceAny | ModuleInstanceAny;

/**
 * Union type for flattened items: plugins and components only.
 * Modules are consumed during flattening and do not survive.
 */
type FlattenedItem = PluginInstanceAny | ComponentInstanceAny;

/**
 * Flattens a mixed list of plugins, components, and modules into a flat
 * ordered list of plugins and components. Implements the Phase 0 flatten
 * algorithm from specification/13-KERNEL-PSEUDOCODE.md Section 3.
 * @param items - Array of plugins, components, and/or modules to flatten.
 * @returns A flat ordered array of plugins and components. No modules survive.
 * @example
 * ```ts
 * const flat = flattenPlugins([moduleA, pluginW]);
 * // moduleA's children are inlined, pluginW's sub-plugins appear before it
 * ```
 */
export function flattenPlugins(items: ReadonlyArray<PluginLike>): Array<FlattenedItem> {
  const result: Array<FlattenedItem> = [];

  for (const item of items) {
    if (item.kind === "module") {
      // Fire onRegister before recursing into children.
      // At flatten time there is no global config yet (resolved later in Phase 1).
      // Pass the module's plugins array as the argument per user decision.
      // The spec's context-based signature will be wired in Phase 11.
      // biome-ignore lint/suspicious/noExplicitAny: onRegister argument is loosely typed at flatten time; full context wired in Phase 11
      (item.spec.onRegister as ((plugins: any) => void) | undefined)?.(item.spec.plugins ?? []);

      // Recursively flatten module children: plugins, then components, then sub-modules
      result.push(
        ...flattenPlugins(item.spec.plugins ?? []),
        ...flattenPlugins(item.spec.components ?? []),
        ...flattenPlugins(item.spec.modules ?? [])
      );
    } else {
      // Plugin or Component
      // If the item has sub-plugins, flatten them first (children before parent)
      // biome-ignore lint/suspicious/noExplicitAny: spec.plugins accessed loosely at runtime; full typing in Phase 11
      const spec = item.spec as any;
      if (spec.plugins) {
        result.push(...flattenPlugins(spec.plugins));
      }
      result.push(item);
    }
  }

  return result;
}

/**
 * Validates a flattened plugin list for duplicate names, missing dependencies,
 * and wrong dependency order. Implements Phase 0 validation from
 * specification/13-KERNEL-PSEUDOCODE.md Section 1.
 * @param frameworkName - The framework name used in error message prefixes.
 * @param items - The flattened list of plugins and components to validate.
 * @throws {Error} If duplicate names, missing dependencies, or wrong order found.
 * @example
 * ```ts
 * validatePlugins("myFramework", flattenedList);
 * // throws if any validation rule is violated
 * ```
 */
export function validatePlugins(frameworkName: string, items: ReadonlyArray<FlattenedItem>): void {
  // --- Duplicate name check (FLAT-03) ---
  // Build a map of name -> first position for lookup, and check for duplicates.
  const namePositions = new Map<string, number>();

  for (const [index, item] of items.entries()) {
    const existingPosition = namePositions.get(item.name);

    if (existingPosition !== undefined) {
      // Fail-fast: throw on the first duplicate found
      throw new Error(
        `[${frameworkName}] Duplicate plugin name "${item.name}". Found at positions ${String(existingPosition)} and ${String(index)}.\n  Rename one of the plugins or remove the duplicate.`
      );
    }

    namePositions.set(item.name, index);
  }

  // --- Dependency validation (FLAT-04, FLAT-05) ---
  // Circular dependency detection is inherently covered by the ordering check:
  // if A depends on B and B depends on A, whichever appears first will see the
  // other after it, triggering the wrong-order error.
  for (const [index, item] of items.entries()) {
    // biome-ignore lint/suspicious/noExplicitAny: spec.depends accessed loosely at runtime; full typing in Phase 11
    const depends: readonly string[] | undefined = (item.spec as any).depends;
    if (!depends) continue;

    for (const dependency of depends) {
      const dependencyIndex = namePositions.get(dependency);

      if (dependencyIndex === undefined) {
        // FLAT-04: dependency not registered
        throw new Error(
          `[${frameworkName}] Plugin "${item.name}" depends on "${dependency}", but "${dependency}" is not registered.\n  Add "${dependency}" to your plugin list before "${item.name}".`
        );
      }

      if (dependencyIndex >= index) {
        // FLAT-05: dependency appears after the dependent
        throw new Error(
          `[${frameworkName}] Plugin "${item.name}" depends on "${dependency}", but "${dependency}" appears after "${item.name}".\n  Move "${dependency}" before "${item.name}" in your plugin list.`
        );
      }
    }
  }
}
