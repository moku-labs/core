import type { IslandDef, IslandInstance, IslandsCtx } from "./types";

export const createIslandsApi = (ctx: IslandsCtx) => ({
  /**
   * Register a island definition. Called by consumer islands during
   * `onInit` to declare their selector and route constraints. Overwrites
   * any existing definition with the same name.
   *
   * @param {IslandDef} def - The island definition to register.
   * @example
   * ```typescript
   * app.islands.register({
   *   name: "sidebar", selector: "#sidebar", routes: ["*"]
   * });
   * ```
   */
  register: (def: IslandDef) => {
    ctx.state.registry.set(def.name, def);
  },

  /**
   * Get the names of all currently mounted islands. Used by tests
   * and diagnostic code to verify which islands are active for the
   * current route.
   *
   * @returns {string[]} Array of mounted island names.
   */
  getMounted: (): string[] => {
    const mounted: string[] = [];
    for (const [name, instance] of ctx.state.instances) {
      if (instance.mounted) mounted.push(name);
    }
    return mounted;
  },

  /**
   * Look up a island instance by name. Returns the full runtime
   * state including mount status and resolved routes.
   *
   * @param {string} name - The island name to look up.
   * @returns {IslandInstance | undefined} The instance, or undefined if not yet mounted.
   */
  getByName: (name: string): IslandInstance | undefined => {
    return ctx.state.instances.get(name);
  }
});
