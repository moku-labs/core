import type { ComponentDef, ComponentInstance, ComponentsCtx } from "./types";

export const createComponentsApi = (ctx: ComponentsCtx) => ({
  /**
   * Register a component definition. Called by consumer islands during
   * `onInit` to declare their selector and route constraints. Overwrites
   * any existing definition with the same name.
   *
   * @param {ComponentDef} def - The component definition to register.
   * @example
   * ```typescript
   * app.components.register({
   *   name: "sidebar", selector: "#sidebar", routes: ["*"]
   * });
   * ```
   */
  register: (def: ComponentDef) => {
    ctx.state.registry.set(def.name, def);
  },

  /**
   * Get the names of all currently mounted components. Used by tests
   * and diagnostic code to verify which components are active for the
   * current route.
   *
   * @returns {string[]} Array of mounted component names.
   */
  getMounted: (): string[] => {
    const mounted: string[] = [];
    for (const [name, instance] of ctx.state.instances) {
      if (instance.mounted) mounted.push(name);
    }
    return mounted;
  },

  /**
   * Look up a component instance by name. Returns the full runtime
   * state including mount status and resolved routes.
   *
   * @param {string} name - The component name to look up.
   * @returns {ComponentInstance | undefined} The instance, or undefined if not yet mounted.
   */
  getByName: (name: string): ComponentInstance | undefined => {
    return ctx.state.instances.get(name);
  }
});
