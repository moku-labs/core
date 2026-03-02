import type { ComponentsCtx } from "./types";

/**
 * Create a `nav:start` handler that unmounts all currently mounted
 * components. Called from the components plugin's `hooks` to simulate
 * the SPA kernel's `unmountPageSpecific` behavior. Emits
 * `component:unmount` for each unmounted component.
 *
 * @param {ComponentsCtx} ctx - The components plugin context.
 * @returns {() => void} A handler for the `nav:start` event.
 */
export const handleNavStart = (ctx: ComponentsCtx) => () => {
  for (const [name, instance] of ctx.state.instances) {
    if (instance.mounted) {
      instance.mounted = false;
      ctx.emit("component:unmount", { name, selector: instance.selector });
    }
  }
};

/**
 * Create a `nav:end` handler that mounts components whose routes match
 * the new URL. Called from the components plugin's `hooks` to simulate
 * the SPA kernel's `scanAndMount` behavior. Creates new instances for
 * first-time mounts. Emits `component:mount` for each mounted component.
 *
 * @param {ComponentsCtx} ctx - The components plugin context.
 * @returns {(payload: { to: string }) => void} A handler for the `nav:end` event.
 */
export const handleNavEnd =
  (ctx: ComponentsCtx) =>
  ({ to }: { to: string }) => {
    for (const [, def] of ctx.state.registry) {
      const routes = def.routes ?? ["*"];
      const shouldMount = routes.includes("*") || routes.includes(to);
      if (shouldMount) {
        const existing = ctx.state.instances.get(def.name);
        if (existing) {
          existing.mounted = true;
        } else {
          ctx.state.instances.set(def.name, {
            name: def.name,
            selector: def.selector,
            routes,
            mounted: true
          });
        }
        ctx.emit("component:mount", {
          name: def.name,
          selector: def.selector
        });
      }
    }
  };
