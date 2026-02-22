// =============================================================================
// moku_core v3 - Shared Type Utilities
// =============================================================================
// Pure type-level utilities and framework base constraints shared across
// multiple source files. No domain knowledge — just reusable type machinery.
//
// Sections:
//   1. Framework Base Constraints (FrameworkConfig, FrameworkEventMap, EmptyPluginEventMap)
//   2. Pure Type Utilities (UnionToIntersection, IsLiteralString)
//   3. Widened Plugin Alias (AnyPluginInstance)
// =============================================================================

import type { PluginInstance } from "./types";

// =============================================================================
// Section 1: Framework Base Constraints
// =============================================================================

/** Base constraint for framework configuration objects. */
type FrameworkConfig = Record<string, unknown>;

/** Base constraint for framework event maps. */
type FrameworkEventMap = Record<string, unknown>;

/**
 * Empty event map used as the default when a plugin declares no custom events.
 * `Record<never, never>` is the identity element for intersection (`T & {} = T`).
 */
type EmptyPluginEventMap = Record<never, never>;

// =============================================================================
// Section 2: Pure Type Utilities
// =============================================================================

/** Convert a union to an intersection via distributive conditional + contra-variance. */
// biome-ignore lint/suspicious/noExplicitAny: Required for union-to-intersection inference trick
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
  ? I
  : never;

/**
 * Detect if a string type is a literal (e.g. "router") vs the general `string` type.
 * Used by BuildPluginApis to exclude plugins with non-literal names from the mapped type.
 */
type IsLiteralString<S extends string> = string extends S ? false : true;

// =============================================================================
// Section 3: Widened Plugin Alias
// =============================================================================

/** Widened PluginInstance type for generic constraints on arrays. */
// biome-ignore lint/suspicious/noExplicitAny: Required for generic constraint on PluginInstance arrays
type AnyPluginInstance = PluginInstance<string, any, any, any, any>;

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
  IsLiteralString,
  // Widened plugin alias
  AnyPluginInstance
};
