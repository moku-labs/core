import type { IslandsCtx } from "./types";

/**
 * Create a `nav:start` handler that unmounts all currently mounted
 * islands. Called from the islands plugin's `hooks` to simulate
 * the SPA kernel's `unmountPageSpecific` behavior. Emits
 * `island:unmount` for each unmounted island.
 *
 * @param {IslandsCtx} ctx - The islands plugin context.
 * @returns {() => void} A handler for the `nav:start` event.
 */
export const handleNavStart = (ctx: IslandsCtx) => () => {
  for (const [name, instance] of ctx.state.instances) {
    if (instance.mounted) {
      instance.mounted = false;
      ctx.emit("island:unmount", { name, selector: instance.selector });
    }
  }
};

/**
 * Create a `nav:end` handler that mounts islands whose routes match
 * the new URL. Called from the islands plugin's `hooks` to simulate
 * the SPA kernel's `scanAndMount` behavior. Creates new instances for
 * first-time mounts. Emits `island:mount` for each mounted island.
 *
 * @param {IslandsCtx} ctx - The islands plugin context.
 * @returns {(payload: { to: string }) => void} A handler for the `nav:end` event.
 */
export const handleNavEnd =
  (ctx: IslandsCtx) =>
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
        ctx.emit("island:mount", {
          name: def.name,
          selector: def.selector
        });
      }
    }
  };
