import type { PluginCtx } from "../../../../../../src";

/**
 * Component definition for registration.
 *
 * @example
 * ```typescript
 * { name: "sidebar", selector: "#sidebar", routes: ["*"] }
 * { name: "gallery", selector: "#gallery", routes: ["/gallery", "/photos"] }
 * ```
 */
export type ComponentDef = {
  /** Unique component name for identification and event bus. */
  name: string;
  /** CSS selector for the component's DOM element. */
  selector: string;
  /** Routes where this component mounts. Defaults to `["*"]` (all routes). */
  routes?: string[];
};

/**
 * Runtime instance tracking for a mounted component.
 *
 * @example
 * ```typescript
 * { name: "sidebar", selector: "#sidebar", routes: ["*"], mounted: true }
 * ```
 */
export type ComponentInstance = {
  /** Component name matching its `ComponentDef`. */
  name: string;
  /** CSS selector from the component definition. */
  selector: string;
  /** Resolved routes (defaults applied). */
  routes: string[];
  /** Whether the component is currently mounted. */
  mounted: boolean;
};

/**
 * Events emitted by the components plugin.
 *
 * @example
 * ```typescript
 * hooks: ctx => ({
 *   "component:mount": ({ name, selector }) => console.log(`Mounted ${name}`),
 *   "component:unmount": ({ name }) => console.log(`Unmounted ${name}`),
 * })
 * ```
 */
export type ComponentEvents = {
  /** Emitted after a component is mounted to the DOM. */
  "component:mount": { name: string; selector: string };
  /** Emitted after a component is unmounted from the DOM. */
  "component:unmount": { name: string; selector: string };
};

/**
 * Internal mutable state for the components plugin.
 *
 * @example
 * ```typescript
 * {
 *   registry: Map { "sidebar" => { name: "sidebar", selector: "#sidebar" } },
 *   instances: Map { "sidebar" => { mounted: true, ... } }
 * }
 * ```
 */
export type ComponentsState = {
  /** Registered component definitions. Keyed by name (last registered wins). */
  registry: Map<string, ComponentDef>;
  /** Runtime instances keyed by component name. */
  instances: Map<string, ComponentInstance>;
};

export type ComponentsCtx = PluginCtx<{ swapSelector: string }, ComponentsState, ComponentEvents>;
