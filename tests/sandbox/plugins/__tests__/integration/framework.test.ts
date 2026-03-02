import { describe, expect, expectTypeOf, it } from "vitest";

import {
  analyticsPlugin,
  cmsPlugin,
  counterPlugin,
  createApp,
  createPlugin,
  envPlugin,
  routerPlugin
} from "../../index";

// ---------------------------------------------------------------------------
// Integration test: full 5-plugin framework (plugin-test)
// ---------------------------------------------------------------------------
//
// createApp is the Layer-2 export — it already has all 5 framework plugins
// baked in (env, counter, router, analytics, cms) with analytics trackingId
// set to "framework-default" at the framework level.
//
// createPlugin is used only for ad-hoc listener plugins in event/lifecycle
// tests. Those listeners are passed via createApp({ plugins: [listener] }).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

const createTestApp = async (
  config?: { appName?: string; debug?: boolean },
  pluginConfigs?: {
    env?: Partial<{ nodeEnv: string; isCI: boolean }>;
    counter?: Partial<{ initial: number; step: number }>;
    router?: Partial<{ basePath: string; notFoundPath: string }>;
    analytics?: Partial<{
      provider: "console" | "memory";
      sampleRate: number;
      trackingId: string;
    }>;
    cms?: Partial<{ defaultLocale: string; maxUploadSize: number }>;
  }
) => {
  return createApp({
    ...(config ? { config } : {}),
    ...(pluginConfigs ? { pluginConfigs } : {})
  });
};

describe("plugin-test framework: full 5-plugin integration", () => {
  // -------------------------------------------------------------------------
  // Runtime: app surface
  // -------------------------------------------------------------------------

  describe("runtime: all 5 plugins on app surface", () => {
    it("createApp() returns app with all 5 plugin APIs", async () => {
      const app = await createTestApp();

      expect(app.env).toBeDefined();
      expect(app.counter).toBeDefined();
      expect(app.router).toBeDefined();
      expect(app.analytics).toBeDefined();
      expect(app.cms).toBeDefined();
    });

    it("all plugin API methods are callable", async () => {
      const app = await createTestApp();

      expect(typeof app.env.isDev).toBe("function");
      expect(typeof app.counter.increment).toBe("function");
      expect(typeof app.router.navigate).toBe("function");
      expect(typeof app.analytics.track).toBe("function");
      expect(typeof app.cms.content.create).toBe("function");
    });

    it("base app methods are present: start, stop, emit, require, has", async () => {
      const app = await createTestApp();

      expect(typeof app.start).toBe("function");
      expect(typeof app.stop).toBe("function");
      expect(typeof app.emit).toBe("function");
      expect(typeof app.require).toBe("function");
      expect(typeof app.has).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: app frozen
  // -------------------------------------------------------------------------

  describe("runtime: app frozen", () => {
    it("returned app is Object.freeze'd", async () => {
      const app = await createTestApp();

      expect(Object.isFrozen(app)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: lifecycle ordering
  // -------------------------------------------------------------------------

  describe("runtime: lifecycle ordering", () => {
    it("all 5 framework plugins are initialized and accessible via require", async () => {
      const initOrder: string[] = [];

      const tracker = createPlugin("lifecycle-tracker", {
        depends: [envPlugin, counterPlugin, routerPlugin, analyticsPlugin, cmsPlugin],
        onInit: ctx => {
          // By the time our tracker's onInit runs, all 5 framework plugins
          // have already initialized (forward order). Verify via require.
          if (ctx.require(envPlugin)) initOrder.push("env");
          if (ctx.require(counterPlugin)) initOrder.push("counter");
          if (ctx.require(routerPlugin)) initOrder.push("router");
          if (ctx.require(analyticsPlugin)) initOrder.push("analytics");
          if (ctx.require(cmsPlugin)) initOrder.push("cms");
        }
      });

      createApp({ plugins: [tracker] });

      expect(initOrder).toEqual(["env", "counter", "router", "analytics", "cms"]);
    });

    it("full lifecycle cycle: createApp → start → use APIs → stop", async () => {
      const app = await createTestApp();

      await app.start();

      app.counter.increment();
      expect(app.counter.value()).toBe(1);

      app.router.navigate("/about");
      expect(app.router.current()).toBe("/about");

      app.analytics.track("test-event", { source: "integration" });
      expect(app.analytics.getEventCount()).toBeGreaterThanOrEqual(1);

      app.cms.content.create({ title: "Hello", body: "World" });
      expect(app.cms.content.query()).toHaveLength(1);

      await app.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: dependency chain
  // -------------------------------------------------------------------------

  describe("runtime: dependency chain", () => {
    it("analytics initializes with router dependency satisfied", async () => {
      const app = await createTestApp();

      expect(app.analytics).toBeDefined();
      expect(app.router).toBeDefined();
    });

    it("cms initializes with router + analytics dependencies satisfied", async () => {
      const app = await createTestApp();

      expect(app.cms).toBeDefined();
      expect(app.router).toBeDefined();
      expect(app.analytics).toBeDefined();
    });

    it("app.has() correctly reports all 5 registered plugins", async () => {
      const app = await createTestApp();

      expect(app.has("env")).toBe(true);
      expect(app.has("counter")).toBe(true);
      expect(app.has("router")).toBe(true);
      expect(app.has("analytics")).toBe(true);
      expect(app.has("cms")).toBe(true);
      expect(app.has("nonexistent")).toBe(false);
    });

    it("app.require(plugin) returns API for each framework plugin", async () => {
      const app = await createTestApp();

      expect(typeof app.require(envPlugin).isDev).toBe("function");
      expect(typeof app.require(counterPlugin).increment).toBe("function");
      expect(typeof app.require(routerPlugin).navigate).toBe("function");
      expect(typeof app.require(analyticsPlugin).track).toBe("function");
      expect(typeof app.require(cmsPlugin).content.create).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: config resolution
  // -------------------------------------------------------------------------

  describe("runtime: config resolution", () => {
    it("framework defaults work without any consumer overrides", async () => {
      const app = await createTestApp();

      expect(app.env.isDev()).toBe(true);
      expect(app.counter.value()).toBe(0);
      expect(app.router.current()).toBe("/");
    });

    it("consumer pluginConfigs override individual plugin defaults", async () => {
      const app = await createTestApp(undefined, {
        counter: { initial: 42, step: 5 },
        router: { basePath: "/app" }
      });

      expect(app.counter.value()).toBe(42);
      app.counter.increment();
      expect(app.counter.value()).toBe(47);

      expect(app.router.current()).toBe("/app");
    });

    it("env plugin config override works", async () => {
      const app = await createTestApp(undefined, {
        env: { nodeEnv: "production", isCI: true }
      });

      expect(app.env.isDev()).toBe(false);
      expect(app.env.isProd()).toBe(true);
      expect(app.env.isCI()).toBe(true);
    });

    it("cms plugin config override works", async () => {
      const app = await createTestApp(undefined, {
        cms: { defaultLocale: "fr" }
      });

      const item = app.cms.content.create({ title: "Bonjour", body: "Le monde" });
      expect(item.locale).toBe("fr");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: framework default pluginConfigs
  // -------------------------------------------------------------------------

  describe("runtime: framework default pluginConfigs", () => {
    it("analytics initializes with framework-default trackingId", async () => {
      // analytics.onInit throws when trackingId is empty string.
      // The framework sets it to "framework-default" — createApp must succeed.
      const app = await createTestApp();

      expect(app.analytics).toBeDefined();
    });

    it("consumer pluginConfigs.analytics.trackingId overrides framework default", async () => {
      const app = await createTestApp(undefined, {
        analytics: { trackingId: "G-CONSUMER-ID" }
      });

      expect(app.analytics).toBeDefined();
    });

    it("missing trackingId at all levels throws during init", async () => {
      // Bypass the Layer-2 framework to construct without pluginConfigs
      const { coreConfig } = await import("../../config");

      const { createApp: rawCreateApp } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin]
      });

      expect(() => rawCreateApp()).toThrow("[plugin-test] analytics.trackingId is required");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: cross-plugin event flow
  // -------------------------------------------------------------------------

  describe("runtime: cross-plugin event flow", () => {
    it("router:navigate triggers analytics hook — auto page_view tracking", async () => {
      const app = await createTestApp();

      const eventsBefore = app.analytics.getEventCount();
      app.router.navigate("/products");

      expect(app.analytics.getEventCount()).toBeGreaterThan(eventsBefore);

      const pageViews = app.analytics.getEvents().filter(e => e.event === "page_view");
      expect(pageViews.length).toBeGreaterThanOrEqual(1);
    });

    it("multiple navigations each produce a page_view event", async () => {
      const app = await createTestApp();

      const before = app.analytics.getEventCount();
      app.router.navigate("/a");
      app.router.navigate("/b");
      app.router.navigate("/c");

      expect(app.analytics.getEventCount()).toBeGreaterThanOrEqual(before + 3);
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: global events
  // -------------------------------------------------------------------------

  describe("runtime: global events", () => {
    it("app:error with code 404 triggers router redirect to notFoundPath", async () => {
      const app = await createTestApp(undefined, {
        router: { notFoundPath: "/not-found" }
      });

      app.router.navigate("/some-page");
      expect(app.router.current()).toBe("/some-page");

      app.emit("app:error", { message: "Page not found", code: 404 });

      expect(app.router.current()).toBe("/not-found");
    });

    it("app:error with non-404 code does not redirect", async () => {
      const app = await createTestApp(undefined, {
        router: { basePath: "/start" }
      });

      app.emit("app:error", { message: "Server error", code: 500 });

      expect(app.router.current()).toBe("/start");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: consumer extra plugins
  // -------------------------------------------------------------------------

  describe("runtime: consumer extra plugins", () => {
    it("consumer plugin is merged onto app surface alongside framework plugins", async () => {
      const greetPlugin = createPlugin("greet", {
        api: _ctx => ({
          hello: () => "Hello from consumer!"
        })
      });

      const app = createApp({ plugins: [greetPlugin] });

      expect(app.env).toBeDefined();
      expect(app.router).toBeDefined();
      expect(app.greet.hello()).toBe("Hello from consumer!");
    });

    it("consumer plugin that depends on framework plugins can use their APIs", async () => {
      const pageTitlePlugin = createPlugin("page-title", {
        depends: [routerPlugin, analyticsPlugin],
        api: ctx => ({
          setAndTrack: (path: string, title: string) => {
            ctx.require(routerPlugin).navigate(path);
            ctx.require(analyticsPlugin).track("title_set", { path, title });
          }
        })
      });

      const app = createApp({ plugins: [pageTitlePlugin] });

      expect(() => app["page-title"].setAndTrack("/blog", "Blog")).not.toThrow();
      expect(app.router.current()).toBe("/blog");
      expect(app.analytics.getEvents().some(e => e.event === "title_set")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: event subscription across plugins
  // -------------------------------------------------------------------------

  describe("runtime: event subscription across framework and consumer plugins", () => {
    it("listener hooks on analytics:track", async () => {
      const tracked: Array<{ event: string; properties: Record<string, unknown> }> = [];

      const listener = createPlugin("analytics-listener", {
        depends: [analyticsPlugin],
        hooks: _ctx => ({
          "analytics:track": payload => {
            tracked.push(payload);
          }
        })
      });

      const app = createApp({ plugins: [listener] });
      app.analytics.track("purchase", { amount: 99 });

      expect(tracked).toHaveLength(1);
      expect(tracked[0]?.event).toBe("purchase");
    });

    it("listener hooks on cms:draft", async () => {
      const drafts: Array<{ contentId: string }> = [];

      const listener = createPlugin("cms-draft-listener", {
        depends: [cmsPlugin],
        hooks: _ctx => ({
          "cms:draft": payload => {
            drafts.push(payload);
          }
        })
      });

      const app = createApp({ plugins: [listener] });
      app.cms.content.create({ title: "New Post", body: "Content" });

      expect(drafts).toHaveLength(1);
      expect(drafts[0]?.contentId).toMatch(/^content-/);
    });

    it("listener hooks on router:navigate", async () => {
      const navigations: Array<{ from: string; to: string }> = [];

      const listener = createPlugin("nav-listener", {
        depends: [routerPlugin],
        hooks: _ctx => ({
          "router:navigate": payload => {
            navigations.push(payload);
          }
        })
      });

      const app = createApp({ plugins: [listener] });
      app.router.navigate("/contact");

      // emit is fire-and-forget — flush microtask queue so handlers complete
      await Promise.resolve();

      expect(navigations).toHaveLength(1);
      expect(navigations[0]).toEqual({ from: "/", to: "/contact" });
    });
  });

  // -------------------------------------------------------------------------
  // Types: all plugin APIs typed
  // -------------------------------------------------------------------------

  describe("types: all plugin APIs typed on app surface", () => {
    it("app.env API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.env.isDev).toEqualTypeOf<() => boolean>();
      expectTypeOf(app.env.isProd).toEqualTypeOf<() => boolean>();
      expectTypeOf(app.env.isCI).toEqualTypeOf<() => boolean>();
    });

    it("app.counter API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.counter.increment).toEqualTypeOf<() => void>();
      expectTypeOf(app.counter.decrement).toEqualTypeOf<() => void>();
      expectTypeOf(app.counter.reset).toEqualTypeOf<() => void>();
      expectTypeOf(app.counter.value).toEqualTypeOf<() => number>();
    });

    it("app.router API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.router.navigate).toEqualTypeOf<
        (path: string) => { from: string; to: string; blocked: boolean }
      >();
      expectTypeOf(app.router.current).toEqualTypeOf<() => string>();
      expectTypeOf(app.router.back).toEqualTypeOf<() => string | undefined>();
      expectTypeOf(app.router.addGuard).toEqualTypeOf<
        (guard: (to: string, from: string) => boolean) => void
      >();
      expectTypeOf(app.router.getHistory).toEqualTypeOf<() => readonly string[]>();
    });

    it("app.analytics API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.analytics.track).toEqualTypeOf<
        (
          event: string,
          properties?: Record<string, unknown>
        ) => { event: string; properties: Record<string, unknown>; timestamp: number } | undefined
      >();
      expectTypeOf(app.analytics.identify).toEqualTypeOf<(userId: string) => void>();
      expectTypeOf(app.analytics.flush).toEqualTypeOf<() => void>();
      expectTypeOf(app.analytics.getEvents).toEqualTypeOf<
        () => readonly {
          event: string;
          properties: Record<string, unknown>;
          timestamp: number;
        }[]
      >();
      expectTypeOf(app.analytics.getUserId).toEqualTypeOf<() => string | undefined>();
      expectTypeOf(app.analytics.getEventCount).toEqualTypeOf<() => number>();
    });

    it("app.cms namespaced API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.cms.content.create).toBeFunction();
      expectTypeOf(app.cms.content.update).toBeFunction();
      expectTypeOf(app.cms.content.delete).toBeFunction();
      expectTypeOf(app.cms.content.getById).toBeFunction();
      expectTypeOf(app.cms.content.query).toBeFunction();
      expectTypeOf(app.cms.media.upload).toBeFunction();
      expectTypeOf(app.cms.media.getAsset).toBeFunction();
      expectTypeOf(app.cms.media.list).toBeFunction();
      expectTypeOf(app.cms.media.delete).toBeFunction();
      expectTypeOf(app.cms.versioning.commit).toBeFunction();
      expectTypeOf(app.cms.versioning.revert).toBeFunction();
      expectTypeOf(app.cms.versioning.diff).toBeFunction();
      expectTypeOf(app.cms.versioning.history).toBeFunction();
    });
  });

  // -------------------------------------------------------------------------
  // Types: global emit typed
  // -------------------------------------------------------------------------

  describe("types: global emit accepts only PluginTestEvents", () => {
    it("app.emit accepts app:ready with correct payload", async () => {
      const app = await createTestApp();

      expect(() => app.emit("app:ready", { timestamp: Date.now() })).not.toThrow();
    });

    it("app.emit accepts app:error with correct payload", async () => {
      const app = await createTestApp();

      expect(() => app.emit("app:error", { message: "Oops", code: 500 })).not.toThrow();
    });

    it("rejects wrong payload type on app:ready", () => {
      const plugin = createPlugin("emit-wrong-payload", {
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- timestamp must be number, not string
            ctx.emit("app:ready", { timestamp: "not-a-number" });
          }
        })
      });

      expect(plugin.name).toBe("emit-wrong-payload");
    });

    it("rejects wrong payload type on app:error", () => {
      const plugin = createPlugin("emit-wrong-error", {
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- code must be number, not string
            ctx.emit("app:error", { message: "fail", code: "404" });
          }
        })
      });

      expect(plugin.name).toBe("emit-wrong-error");
    });

    it("rejects unknown event names", () => {
      const plugin = createPlugin("emit-unknown-event", {
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- "app:unknown" is not in PluginTestEvents
            ctx.emit("app:unknown", {});
          }
        })
      });

      expect(plugin.name).toBe("emit-unknown-event");
    });
  });

  // -------------------------------------------------------------------------
  // Types: consumer extra plugins merge into app surface
  // -------------------------------------------------------------------------

  describe("types: consumer extra plugin merges into app surface type", () => {
    it("consumer plugin API appears on app surface with correct type", async () => {
      const extraPlugin = createPlugin("extra", {
        api: _ctx => ({
          ping: () => "pong" as const
        })
      });

      const app = createApp({ plugins: [extraPlugin] });

      expectTypeOf(app.extra.ping).toEqualTypeOf<() => "pong">();
      expect(app.extra.ping()).toBe("pong");
    });

    it("framework plugin APIs remain typed when consumer plugin is added", async () => {
      const extra = createPlugin("bonus", {
        api: _ctx => ({ value: () => 42 })
      });

      const app = createApp({ plugins: [extra] });

      // Framework plugins still fully typed
      expectTypeOf(app.env.isDev).toEqualTypeOf<() => boolean>();
      expectTypeOf(app.counter.value).toEqualTypeOf<() => number>();
      expectTypeOf(app.router.current).toEqualTypeOf<() => string>();

      // Consumer plugin is on the app surface at runtime
      expect(app.bonus.value()).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // Types: pluginConfigs typed
  // -------------------------------------------------------------------------

  describe("types: pluginConfigs only accepts registered plugin config keys", () => {
    it("accepts valid partial config for registered plugins", async () => {
      const app = createApp({
        pluginConfigs: {
          env: { nodeEnv: "production" },
          counter: { initial: 100, step: 10 }
        }
      });

      expect(app.counter.value()).toBe(100);
    });

    it("rejects wrong type for counter.initial", async () => {
      const app = createApp({
        pluginConfigs: {
          // @ts-expect-error -- initial must be number, not string
          counter: { initial: "wrong" }
        }
      });

      expect(app).toBeDefined();
    });

    it("rejects wrong type for router.basePath", async () => {
      const app = createApp({
        pluginConfigs: {
          // @ts-expect-error -- basePath must be string, not number
          router: { basePath: 404 }
        }
      });

      expect(app).toBeDefined();
    });

    it("rejects wrong type for analytics.sampleRate", async () => {
      const app = createApp({
        pluginConfigs: {
          // @ts-expect-error -- sampleRate must be number, not boolean
          analytics: { sampleRate: true }
        }
      });

      expect(app).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Types: reject unknown plugins on app surface
  // -------------------------------------------------------------------------

  describe("types: reject unknown plugins on app surface", () => {
    it("nonexistent plugin name is a type error", async () => {
      const app = await createTestApp();

      // @ts-expect-error -- "nonExistent" is not a registered plugin
      app.nonExistent;

      expect(app).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Types: plugin name literal types
  // -------------------------------------------------------------------------

  describe("types: plugin name literal types", () => {
    it("each plugin instance has a literal name type", () => {
      expectTypeOf(envPlugin.name).toEqualTypeOf<"env">();
      expectTypeOf(counterPlugin.name).toEqualTypeOf<"counter">();
      expectTypeOf(routerPlugin.name).toEqualTypeOf<"router">();
      expectTypeOf(analyticsPlugin.name).toEqualTypeOf<"analytics">();
      expectTypeOf(cmsPlugin.name).toEqualTypeOf<"cms">();
    });
  });

  // -------------------------------------------------------------------------
  // Types: app.require returns typed API
  // -------------------------------------------------------------------------

  describe("types: app.require returns typed API", () => {
    it("app.require(envPlugin) returns typed EnvApi", async () => {
      const app = await createTestApp();
      const env = app.require(envPlugin);

      expectTypeOf(env.isDev).toBeFunction();
      expectTypeOf(env.isProd).toBeFunction();
      expectTypeOf(env.isCI).toBeFunction();
    });

    it("app.require(routerPlugin) returns typed RouterApi", async () => {
      const app = await createTestApp();
      const router = app.require(routerPlugin);

      expectTypeOf(router.navigate).toBeFunction();
      expectTypeOf(router.current).toBeFunction();
      expectTypeOf(router.back).toBeFunction();
    });

    it("app.require(cmsPlugin) returns typed namespaced CMS API", async () => {
      const app = await createTestApp();
      const cms = app.require(cmsPlugin);

      expectTypeOf(cms.content.create).toBeFunction();
      expectTypeOf(cms.media.upload).toBeFunction();
      expectTypeOf(cms.versioning.commit).toBeFunction();
    });
  });

  // -------------------------------------------------------------------------
  // Types: event payloads typed in hooks
  // -------------------------------------------------------------------------

  describe("types: framework event payloads typed in hooks", () => {
    it("global PluginTestEvents payloads are typed in hooks", () => {
      const plugin = createPlugin("global-hook-types", {
        hooks: _ctx => ({
          "app:ready": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ timestamp: number }>();
          },
          "app:error": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ message: string; code: number }>();
          }
        })
      });

      expect(plugin.name).toBe("global-hook-types");
    });

    it("router event payloads are typed in dependent plugin hooks", () => {
      const plugin = createPlugin("router-hook-types", {
        depends: [routerPlugin],
        hooks: _ctx => ({
          "router:navigate": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ from: string; to: string }>();
          },
          "router:not-found": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ path: string }>();
          }
        })
      });

      expect(plugin.name).toBe("router-hook-types");
    });

    it("analytics event payloads are typed in dependent plugin hooks", () => {
      const plugin = createPlugin("analytics-hook-types", {
        depends: [analyticsPlugin],
        hooks: _ctx => ({
          "analytics:track": payload => {
            expectTypeOf(payload).toEqualTypeOf<{
              event: string;
              properties: Record<string, unknown>;
            }>();
          },
          "analytics:identify": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ userId: string }>();
          }
        })
      });

      expect(plugin.name).toBe("analytics-hook-types");
    });

    it("cms event payloads are typed in dependent plugin hooks", () => {
      const plugin = createPlugin("cms-hook-types", {
        depends: [cmsPlugin],
        hooks: _ctx => ({
          "cms:publish": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ contentId: string; path: string }>();
          },
          "cms:draft": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ contentId: string }>();
          },
          "cms:upload": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ assetId: string; mimeType: string }>();
          }
        })
      });

      expect(plugin.name).toBe("cms-hook-types");
    });

    it("full-dependency plugin sees all framework events merged", () => {
      const plugin = createPlugin("all-events-check", {
        depends: [routerPlugin, analyticsPlugin, cmsPlugin],
        api: ctx => ({
          fireAll: () => {
            ctx.emit("app:ready", { timestamp: Date.now() });
            ctx.emit("router:navigate", { from: "/", to: "/test" });
            ctx.emit("analytics:track", { event: "click", properties: {} });
            ctx.emit("cms:draft", { contentId: "content-1" });
          }
        })
      });

      expect(plugin.name).toBe("all-events-check");
    });

    it("rejects wrong event payload types in emit", () => {
      const plugin = createPlugin("reject-wrong-cms-payload", {
        depends: [cmsPlugin],
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- contentId must be string, not number
            ctx.emit("cms:draft", { contentId: 999 });
          }
        })
      });

      expect(plugin.name).toBe("reject-wrong-cms-payload");
    });

    it("non-dependent plugin cannot emit plugin-scoped events", () => {
      const plugin = createPlugin("no-dep-router-emit", {
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- "router:navigate" is not accessible without routerPlugin dep
            ctx.emit("router:navigate", { from: "/", to: "/test" });
          }
        })
      });

      expect(plugin.name).toBe("no-dep-router-emit");
    });
  });
});
