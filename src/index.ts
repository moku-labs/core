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
export { createCorePlugin } from "./core-plugin";

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

// -----------------------------------------------------------------------------
// Framework-Facing Types (required for declaration emit)
// -----------------------------------------------------------------------------
// These types appear in return-type positions of createCoreConfig, createCore,
// and createApp. Downstream framework packages need them exported so TypeScript
// can reference them in generated .d.ts files (prevents TS4023).
// Type-only — zero runtime/bundle cost.
// -----------------------------------------------------------------------------

export type { CoreConfigResult } from "./config";
export type { BoundCreateCoreFunction, CreateCoreOptions, CreateCoreResult } from "./core";
export type {
  AnyCorePluginInstance,
  CoreApisFromTuple,
  CorePluginContext,
  CorePluginInstance
} from "./core-plugin";
export type { BoundCreatePluginFunction, RegisterFunction } from "./plugin";
export type { AnyPluginInstance, App, CreateAppOptions, PluginInstance } from "./types";
