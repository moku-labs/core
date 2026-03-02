import { describe, expect, expectTypeOf, it } from "vitest";

import { coreConfig } from "../../../config";
import { routerPlugin } from "../../index";

// ---------------------------------------------------------------------------
// Integration test: router plugin with createApp
// ---------------------------------------------------------------------------

const createTestApp = async (
  routerConfig?: Partial<{ basePath: string; notFoundPath: string }>
) => {
  const { createApp } = coreConfig.createCore(coreConfig, {
    plugins: [routerPlugin]
  });
  if (routerConfig) {
    return createApp({ pluginConfigs: { router: routerConfig } });
  }
  return createApp();
};

describe("standard tier: router plugin (integration)", () => {
  // -------------------------------------------------------------------------
  // Runtime: full lifecycle
  // -------------------------------------------------------------------------

  describe("runtime: lifecycle", () => {
    it("plugin initializes with default config", async () => {
      const app = await createTestApp();

      expect(app.router).toBeDefined();
      expect(app.router.current()).toBe("/");
    });

    it("navigate updates path and returns result", async () => {
      const app = await createTestApp();

      const result = app.router.navigate("/about");

      expect(result).toEqual({ from: "/", to: "/about", blocked: false });
      expect(app.router.current()).toBe("/about");
    });

    it("back returns to previous path", async () => {
      const app = await createTestApp();

      app.router.navigate("/a");
      app.router.navigate("/b");

      const previous = app.router.back();

      expect(previous).toBe("/a");
      expect(app.router.current()).toBe("/a");
    });

    it("addGuard blocks navigation", async () => {
      const app = await createTestApp();

      app.router.addGuard(to => to !== "/restricted");

      const result = app.router.navigate("/restricted");

      expect(result.blocked).toBe(true);
      expect(app.router.current()).toBe("/");
    });

    it("getHistory tracks navigation", async () => {
      const app = await createTestApp();

      app.router.navigate("/a");
      app.router.navigate("/b");
      app.router.navigate("/c");

      expect(app.router.getHistory()).toEqual(["/", "/a", "/b"]);
    });

    it("config overrides work", async () => {
      const app = await createTestApp({ basePath: "/app" });

      expect(app.router.current()).toBe("/app");
    });

    it("start emits initial navigate event", async () => {
      const navigations: Array<{ from: string; to: string }> = [];

      const { createApp, createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin]
      });

      const listenerPlugin = createPlugin("start-listener", {
        depends: [routerPlugin],
        hooks: _ctx => ({
          "router:navigate": payload => {
            navigations.push(payload);
          }
        })
      });

      const app = createApp({ plugins: [listenerPlugin] });
      await app.start();

      // onStart emits router:navigate with from: "" to: basePath
      expect(navigations.length).toBeGreaterThanOrEqual(1);

      await app.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: hooks
  // -------------------------------------------------------------------------

  describe("runtime: hooks", () => {
    it("hooks fire on router:navigate events", async () => {
      const navigations: Array<{ from: string; to: string }> = [];

      const { createApp, createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin]
      });

      const listenerPlugin = createPlugin("nav-listener", {
        depends: [routerPlugin],
        hooks: _ctx => ({
          "router:navigate": payload => {
            navigations.push(payload);
          }
        })
      });

      const app = createApp({ plugins: [listenerPlugin] });
      app.router.navigate("/test");

      expect(navigations).toHaveLength(1);
      expect(navigations[0]).toEqual({ from: "/", to: "/test" });
    });

    it("app:error hook redirects to notFoundPath on 404", async () => {
      const app = await createTestApp({ notFoundPath: "/not-found" });

      app.emit("app:error", { message: "Page not found", code: 404 });

      expect(app.router.current()).toBe("/not-found");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: events
  // -------------------------------------------------------------------------

  describe("runtime: events", () => {
    it("dependent plugin can emit router events", async () => {
      const { createApp, createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin]
      });

      const emitterPlugin = createPlugin("route-emitter", {
        depends: [routerPlugin],
        api: ctx => ({
          emitNav: () => {
            ctx.emit("router:navigate", { from: "/a", to: "/b" });
          }
        })
      });

      const app = createApp({ plugins: [emitterPlugin] });

      // Should not throw — dependency events are emittable
      expect(() => app["route-emitter"].emitNav()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Types: API signatures
  // -------------------------------------------------------------------------

  describe("types: API signatures", () => {
    it("navigate returns NavigationResult", async () => {
      const app = await createTestApp();

      expectTypeOf(app.router.navigate).toEqualTypeOf<
        (path: string) => { from: string; to: string; blocked: boolean }
      >();
    });

    it("current returns string", async () => {
      const app = await createTestApp();

      expectTypeOf(app.router.current).toEqualTypeOf<() => string>();
    });

    it("back returns string | undefined", async () => {
      const app = await createTestApp();

      expectTypeOf(app.router.back).toEqualTypeOf<() => string | undefined>();
    });

    it("addGuard accepts NavigationGuard", async () => {
      const app = await createTestApp();

      expectTypeOf(app.router.addGuard).toEqualTypeOf<
        (guard: (to: string, from: string) => boolean) => void
      >();
    });

    it("getHistory returns readonly string[]", async () => {
      const app = await createTestApp();

      expectTypeOf(app.router.getHistory).toEqualTypeOf<() => readonly string[]>();
    });

    it("plugin name is literal type", () => {
      expectTypeOf(routerPlugin.name).toEqualTypeOf<"router">();
    });
  });

  // -------------------------------------------------------------------------
  // Types: events
  // -------------------------------------------------------------------------

  describe("types: events", () => {
    it("router:navigate event payload is typed", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin]
      });

      createPlugin("event-type-check", {
        depends: [routerPlugin],
        hooks: _ctx => ({
          "router:navigate": payload => {
            expectTypeOf(payload).toEqualTypeOf<{
              from: string;
              to: string;
            }>();
          }
        })
      });
    });

    it("router:not-found event payload is typed", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin]
      });

      createPlugin("not-found-type-check", {
        depends: [routerPlugin],
        hooks: _ctx => ({
          "router:not-found": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ path: string }>();
          }
        })
      });
    });

    it("rejects wrong event payload types", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin]
      });

      const plugin = createPlugin("wrong-payload-check", {
        depends: [routerPlugin],
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- from should be string, not number
            ctx.emit("router:navigate", { from: 123, to: "/test" });
          }
        })
      });

      expect(plugin.name).toBe("wrong-payload-check");
    });

    it("non-dependent plugin cannot emit router events", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin]
      });

      const plugin = createPlugin("no-dep-emitter", {
        // No depends on routerPlugin
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- "router:navigate" is not in global events and not a dependency
            ctx.emit("router:navigate", { from: "/", to: "/test" });
          }
        })
      });

      expect(plugin.name).toBe("no-dep-emitter");
    });
  });

  // -------------------------------------------------------------------------
  // Types: require
  // -------------------------------------------------------------------------

  describe("types: require", () => {
    it("ctx.require(routerPlugin) returns typed API", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin]
      });

      createPlugin("require-type-check", {
        depends: [routerPlugin],
        api: ctx => {
          const api = ctx.require(routerPlugin);

          expectTypeOf(api.navigate).toBeFunction();
          expectTypeOf(api.current).toBeFunction();
          expectTypeOf(api.back).toBeFunction();
          expectTypeOf(api.addGuard).toBeFunction();
          expectTypeOf(api.getHistory).toBeFunction();

          return {};
        }
      });
    });
  });
});
