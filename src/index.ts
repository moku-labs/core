// =============================================================================
// @moku-labs/core - Package Entry Point
// =============================================================================
// This file is the SOLE authority on the public API surface.
// Everything exported here is public. Everything NOT exported here is internal.
//
// Consumers use: import { createCoreConfig } from "@moku-labs/core";
//                import type { PluginCtx, EmitFn } from "@moku-labs/core";
// =============================================================================

export { createCoreConfig } from "./config";

// -----------------------------------------------------------------------------
// Public Type Utilities
// -----------------------------------------------------------------------------
// Types for plugin authors at Standard+ tier. Used in domain context files
// (types.ts, api.ts, handlers.ts) to type-check extracted domain logic.
// -----------------------------------------------------------------------------

/** Domain context type for extracted plugin files. Auto-generates emit overloads. */
export type { PluginCtx } from "./types";

/** Emit overload builder. Converts an event map to overloaded call signatures. */
export type { EmitFn } from "./utilities";
