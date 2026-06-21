import type { IslandsState } from "./types";

/**
 * Create the initial islands state. Both the registry (island
 * definitions) and instances (runtime mount state) start as empty Maps.
 * Islands are added to the registry via `register()` and instances
 * are created on first mount during `nav:end`.
 *
 * @returns {IslandsState} A fresh islands state object.
 */
export const createIslandsState = (): IslandsState => ({
  registry: new Map(),
  instances: new Map()
});
