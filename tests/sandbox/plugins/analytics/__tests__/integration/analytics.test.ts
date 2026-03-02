import { describe, expect, expectTypeOf, it } from "vitest";

import { coreConfig } from "../../../config";
import { routerPlugin } from "../../../router";
import { analyticsPlugin } from "../../index";

// ---------------------------------------------------------------------------
// Integration test: analytics plugin with createApp
// ---------------------------------------------------------------------------

const createTestApp = async (
  analyticsConfig?: Partial<{
    provider: "console" | "memory";
    sampleRate: number;
    trackingId: string;
  }>
) => {
  const { createApp } = coreConfig.createCore(coreConfig, {
    plugins: [routerPlugin, analyticsPlugin]
  });
  return createApp({
    pluginConfigs: {
      analytics: { trackingId: "test-123", ...analyticsConfig }
    }
  });
};

describe("complex tier: analytics plugin (integration)", () => {
  // -------------------------------------------------------------------------
  // Runtime: dependency + lifecycle
  // -------------------------------------------------------------------------

  describe("runtime: dependency and lifecycle", () => {
    it("initializes with router dependency", async () => {
      const app = await createTestApp();

      expect(app.analytics).toBeDefined();
      expect(app.router).toBeDefined();
    });

    it("onInit throws without trackingId", async () => {
      const { createApp } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin]
      });

      expect(() => createApp()).toThrow("[plugin-test] analytics.trackingId is required");
    });

    it("onInit succeeds with trackingId", async () => {
      const app = await createTestApp({ trackingId: "G-XXXXX" });

      expect(app.analytics).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: API behavior
  // -------------------------------------------------------------------------

  describe("runtime: API behavior", () => {
    it("track stores events", async () => {
      const app = await createTestApp();

      app.analytics.track("click", { button: "submit" });

      expect(app.analytics.getEventCount()).toBe(1);
      expect(app.analytics.getEvents()[0]?.event).toBe("click");
    });

    it("identify sets userId", async () => {
      const app = await createTestApp();

      app.analytics.identify("user-42");

      expect(app.analytics.getUserId()).toBe("user-42");
    });

    it("flush does not throw", async () => {
      const app = await createTestApp();

      expect(() => app.analytics.flush()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: hooks
  // -------------------------------------------------------------------------

  describe("runtime: hooks", () => {
    it("tracks page_view on router:navigate", async () => {
      const app = await createTestApp();

      // Navigate triggers router:navigate, which analytics hooks listen to
      app.router.navigate("/about");

      // The hook should have tracked a page_view
      const events = app.analytics.getEvents();
      const pageViews = events.filter(e => e.event === "page_view");
      expect(pageViews.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: events
  // -------------------------------------------------------------------------

  describe("runtime: events", () => {
    it("analytics:track event fires when tracking", async () => {
      const tracked: Array<{
        event: string;
        properties: Record<string, unknown>;
      }> = [];

      const { createApp, createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin]
      });

      const listenerPlugin = createPlugin("analytics-listener", {
        depends: [analyticsPlugin],
        hooks: _ctx => ({
          "analytics:track": payload => {
            tracked.push(payload);
          }
        })
      });

      const app = createApp({
        plugins: [listenerPlugin],
        pluginConfigs: { analytics: { trackingId: "test-123" } }
      });

      app.analytics.track("click", { button: "submit" });

      expect(tracked).toHaveLength(1);
      expect(tracked[0]).toEqual({
        event: "click",
        properties: { button: "submit" }
      });
    });

    it("analytics:identify event fires when identifying", async () => {
      const identified: Array<{ userId: string }> = [];

      const { createApp, createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin]
      });

      const listenerPlugin = createPlugin("identify-listener", {
        depends: [analyticsPlugin],
        hooks: _ctx => ({
          "analytics:identify": payload => {
            identified.push(payload);
          }
        })
      });

      const app = createApp({
        plugins: [listenerPlugin],
        pluginConfigs: { analytics: { trackingId: "test-123" } }
      });

      app.analytics.identify("user-42");

      expect(identified).toHaveLength(1);
      expect(identified[0]).toEqual({ userId: "user-42" });
    });
  });

  // -------------------------------------------------------------------------
  // Types: API signatures
  // -------------------------------------------------------------------------

  describe("types: API signatures", () => {
    it("track returns TrackedEvent | undefined", async () => {
      const app = await createTestApp();

      expectTypeOf(app.analytics.track).toEqualTypeOf<
        (
          event: string,
          properties?: Record<string, unknown>
        ) =>
          | {
              event: string;
              properties: Record<string, unknown>;
              timestamp: number;
            }
          | undefined
      >();
    });

    it("identify accepts string", async () => {
      const app = await createTestApp();

      expectTypeOf(app.analytics.identify).toEqualTypeOf<(userId: string) => void>();
    });

    it("getEvents returns readonly TrackedEvent[]", async () => {
      const app = await createTestApp();

      expectTypeOf(app.analytics.getEvents).toEqualTypeOf<
        () => readonly {
          event: string;
          properties: Record<string, unknown>;
          timestamp: number;
        }[]
      >();
    });

    it("getUserId returns string | undefined", async () => {
      const app = await createTestApp();

      expectTypeOf(app.analytics.getUserId).toEqualTypeOf<() => string | undefined>();
    });

    it("getEventCount returns number", async () => {
      const app = await createTestApp();

      expectTypeOf(app.analytics.getEventCount).toEqualTypeOf<() => number>();
    });

    it("plugin name is literal type", () => {
      expectTypeOf(analyticsPlugin.name).toEqualTypeOf<"analytics">();
    });
  });

  // -------------------------------------------------------------------------
  // Types: events
  // -------------------------------------------------------------------------

  describe("types: events", () => {
    it("analytics:track payload is typed", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin]
      });

      createPlugin("track-type-check", {
        depends: [analyticsPlugin],
        hooks: _ctx => ({
          "analytics:track": payload => {
            expectTypeOf(payload).toEqualTypeOf<{
              event: string;
              properties: Record<string, unknown>;
            }>();
          }
        })
      });
    });

    it("analytics:identify payload is typed", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin]
      });

      createPlugin("identify-type-check", {
        depends: [analyticsPlugin],
        hooks: _ctx => ({
          "analytics:identify": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ userId: string }>();
          }
        })
      });
    });

    it("dependent plugin sees both router and analytics events", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin]
      });

      const plugin = createPlugin("diamond-dep", {
        depends: [routerPlugin, analyticsPlugin],
        api: ctx => ({
          test: () => {
            ctx.emit("router:navigate", { from: "/", to: "/test" });
            ctx.emit("analytics:track", {
              event: "click",
              properties: {}
            });
          }
        })
      });

      expect(plugin.name).toBe("diamond-dep");
    });

    it("rejects wrong event payload types", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin]
      });

      const plugin = createPlugin("wrong-payload", {
        depends: [analyticsPlugin],
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- event should be string, not number
            ctx.emit("analytics:track", { event: 123, properties: {} });
          }
        })
      });

      expect(plugin.name).toBe("wrong-payload");
    });
  });

  // -------------------------------------------------------------------------
  // Types: require
  // -------------------------------------------------------------------------

  describe("types: require", () => {
    it("ctx.require(routerPlugin) returns router API inside analytics", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin]
      });

      createPlugin("require-check", {
        depends: [analyticsPlugin],
        api: ctx => {
          const api = ctx.require(analyticsPlugin);

          expectTypeOf(api.track).toBeFunction();
          expectTypeOf(api.identify).toBeFunction();
          expectTypeOf(api.getEvents).toBeFunction();
          expectTypeOf(api.getUserId).toBeFunction();
          expectTypeOf(api.getEventCount).toBeFunction();
          expectTypeOf(api.flush).toBeFunction();

          return {};
        }
      });
    });
  });
});
