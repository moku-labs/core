import type { PluginCtx } from "../../../../../../src";

/**
 * Island definition for registration.
 *
 * @example
 * ```typescript
 * { name: "sidebar", selector: "#sidebar", routes: ["*"] }
 * { name: "gallery", selector: "#gallery", routes: ["/gallery", "/photos"] }
 * ```
 */
export type IslandDef = {
  /** Unique island name for identification and event bus. */
  name: string;
  /** CSS selector for the island's DOM element. */
  selector: string;
  /** Routes where this island mounts. Defaults to `["*"]` (all routes). */
  routes?: string[];
};

/**
 * Runtime instance tracking for a mounted island.
 *
 * @example
 * ```typescript
 * { name: "sidebar", selector: "#sidebar", routes: ["*"], mounted: true }
 * ```
 */
export type IslandInstance = {
  /** Island name matching its `IslandDef`. */
  name: string;
  /** CSS selector from the island definition. */
  selector: string;
  /** Resolved routes (defaults applied). */
  routes: string[];
  /** Whether the island is currently mounted. */
  mounted: boolean;
};

/**
 * Events emitted by the islands plugin.
 *
 * @example
 * ```typescript
 * hooks: ctx => ({
 *   "island:mount": ({ name, selector }) => console.log(`Mounted ${name}`),
 *   "island:unmount": ({ name }) => console.log(`Unmounted ${name}`),
 * })
 * ```
 */
export type IslandEvents = {
  /** Emitted after a island is mounted to the DOM. */
  "island:mount": { name: string; selector: string };
  /** Emitted after a island is unmounted from the DOM. */
  "island:unmount": { name: string; selector: string };
};

/**
 * Internal mutable state for the islands plugin.
 *
 * @example
 * ```typescript
 * {
 *   registry: Map { "sidebar" => { name: "sidebar", selector: "#sidebar" } },
 *   instances: Map { "sidebar" => { mounted: true, ... } }
 * }
 * ```
 */
export type IslandsState = {
  /** Registered island definitions. Keyed by name (last registered wins). */
  registry: Map<string, IslandDef>;
  /** Runtime instances keyed by island name. */
  instances: Map<string, IslandInstance>;
};

export type IslandsCtx = PluginCtx<{ swapSelector: string }, IslandsState, IslandEvents>;
