import type { ComponentsState } from "./types";

/**
 * Create the initial components state. Both the registry (component
 * definitions) and instances (runtime mount state) start as empty Maps.
 * Components are added to the registry via `register()` and instances
 * are created on first mount during `nav:end`.
 *
 * @returns {ComponentsState} A fresh components state object.
 */
export const createComponentsState = (): ComponentsState => ({
  registry: new Map(),
  instances: new Map()
});
