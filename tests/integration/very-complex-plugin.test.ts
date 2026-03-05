import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// Assumption 1: Nested plugin config shallow merge
// ---------------------------------------------------------------------------

describe("nested plugin config (Very Complex pattern)", () => {
  it("consumer overrides one sub-key, others survive from defaults", () => {
    let captured: Record<string, unknown> = {};

    const cc = createCoreConfig<{ name: string }, Record<string, never>>("test", {
      config: { name: "test" }
    });

    const spa = cc.createPlugin("spa", {
      config: {
        router: { viewTransitions: false, progressBar: true },
        progress: { enabled: true, color: "#0076ff" },
        components: { swapSelector: "main" }
      },
      onInit: ctx => {
        captured = { ...ctx.config };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [spa] });

    // Consumer overrides only router
    createApp({
      pluginConfigs: {
        spa: { router: { viewTransitions: true, progressBar: false } }
      }
    });

    // router replaced entirely with consumer value
    const router = captured.router as { viewTransitions: boolean; progressBar: boolean };
    expect(router.viewTransitions).toBe(true);
    expect(router.progressBar).toBe(false);

    // progress and components survive from plugin defaults
    const progress = captured.progress as { enabled: boolean; color: string };
    expect(progress.enabled).toBe(true);
    expect(progress.color).toBe("#0076ff");

    const components = captured.components as { swapSelector: string };
    expect(components.swapSelector).toBe("main");
  });

  it("partial sub-object replaces entire sub-key (fields lost, not deep merged)", () => {
    let captured: Record<string, unknown> = {};

    const cc = createCoreConfig<{ name: string }, Record<string, never>>("test", {
      config: { name: "test" }
    });

    const spa = cc.createPlugin("spa", {
      config: {
        router: { viewTransitions: false, progressBar: true }
      },
      onInit: ctx => {
        captured = { ...ctx.config };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [spa] });

    // Consumer provides only viewTransitions — progressBar should be LOST
    // Type assertion needed: the test intentionally provides an incomplete sub-object
    // to prove shallow merge behavior (fields are lost, not deep merged)
    createApp({
      pluginConfigs: {
        spa: { router: { viewTransitions: true } as any }
      }
    });

    const router = captured.router as Record<string, unknown>;
    expect(router.viewTransitions).toBe(true);
    // progressBar is GONE — shallow merge replaces the entire router object
    expect(router.progressBar).toBeUndefined();
  });

  it("3-level stacking: plugin defaults → framework → consumer", () => {
    let captured: Record<string, unknown> = {};

    const cc = createCoreConfig<{ name: string }, Record<string, never>>("test", {
      config: { name: "test" }
    });

    const spa = cc.createPlugin("spa", {
      config: {
        router: { viewTransitions: false, progressBar: true },
        progress: { enabled: true, color: "#0076ff" },
        components: { swapSelector: "main" }
      },
      onInit: ctx => {
        captured = { ...ctx.config };
      }
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [spa],
      // Framework overrides router
      pluginConfigs: { spa: { router: { viewTransitions: true, progressBar: true } } }
    });

    // Consumer overrides progress only
    createApp({
      pluginConfigs: {
        spa: { progress: { enabled: false, color: "#ff0000" } }
      }
    });

    // router: from framework (consumer didn't touch it)
    const router = captured.router as { viewTransitions: boolean; progressBar: boolean };
    expect(router.viewTransitions).toBe(true);
    expect(router.progressBar).toBe(true);

    // progress: from consumer (overrides both framework and plugin default)
    const progress = captured.progress as { enabled: boolean; color: string };
    expect(progress.enabled).toBe(false);
    expect(progress.color).toBe("#ff0000");

    // components: from plugin defaults (nobody overrode it)
    const components = captured.components as { swapSelector: string };
    expect(components.swapSelector).toBe("main");
  });
});

// ---------------------------------------------------------------------------
// Assumption 2: Very Complex plugin wires correctly
// ---------------------------------------------------------------------------

describe("Very Complex plugin pattern (namespaced API, composed state, events)", () => {
  it("end-to-end: namespaced API, composed state, register.map events, depends, lifecycle", async () => {
    const order: string[] = [];
    const hookPayloads: unknown[] = [];

    // Events type for register.map
    type CmsEvents = {
      "cms:publish": { title: string };
      "cms:upload": { name: string };
    };

    const cc = createCoreConfig<{ name: string }, Record<string, unknown>>("test", {
      config: { name: "test" }
    });

    // Base plugin (dependency)
    const base = cc.createPlugin("base", {
      config: { version: 1 },
      api: ctx => ({
        getVersion: () => ctx.config.version
      }),
      onInit: () => {
        order.push("base:init");
      },
      onStart: () => {
        order.push("base:start");
      },
      onStop: () => {
        order.push("base:stop");
      }
    });

    // Very Complex "cms" plugin — mirrors the SPA pattern
    const cms = cc.createPlugin("cms", {
      depends: [base] as const,

      config: {
        content: { maxItems: 100, drafts: true },
        media: { maxSize: 10, formats: ["jpg", "png"] }
      },

      createState: () => ({
        content: { items: [] as string[] },
        media: { uploads: [] as string[] }
      }),

      events: register =>
        register.map<CmsEvents>({
          "cms:publish": "Content published",
          "cms:upload": "Media uploaded"
        }),

      api: ctx => ({
        // Namespaced API — content sub-module
        content: {
          add: (item: string) => {
            ctx.state.content.items.push(item);
          },
          list: () => [...ctx.state.content.items],
          count: () => ctx.state.content.items.length
        },
        // Namespaced API — media sub-module
        media: {
          upload: (name: string) => {
            ctx.state.media.uploads.push(name);
          },
          list: () => [...ctx.state.media.uploads]
        }
      }),

      onInit: ctx => {
        order.push("cms:init");
        // Dependency access works
        const baseApi = ctx.require(base);
        expect(baseApi.getVersion()).toBe(1);
      },

      onStart: () => {
        order.push("cms:start");
      },

      onStop: () => {
        order.push("cms:stop");
      }
    });

    // Consumer plugin that depends on cms and hooks its events
    const analytics = cc.createPlugin("analytics", {
      depends: [cms] as const,
      hooks: () => ({
        "cms:publish": (payload: { title: string }) => {
          hookPayloads.push({ event: "publish", ...payload });
        },
        "cms:upload": (payload: { name: string }) => {
          hookPayloads.push({ event: "upload", ...payload });
        }
      }),
      onInit: () => {
        order.push("analytics:init");
      },
      onStart: () => {
        order.push("analytics:start");
      },
      onStop: () => {
        order.push("analytics:stop");
      }
    });

    // Build framework and app
    const { createApp } = cc.createCore(cc, {
      plugins: [base, cms, analytics]
    });

    const app = createApp({
      pluginConfigs: {
        cms: { content: { maxItems: 50, drafts: false } }
      }
    });

    // Init phase — forward order
    expect(order).toEqual(["base:init", "cms:init", "analytics:init"]);

    // Namespaced API exists
    expect(typeof app.cms.content.add).toBe("function");
    expect(typeof app.cms.content.list).toBe("function");
    expect(typeof app.cms.content.count).toBe("function");
    expect(typeof app.cms.media.upload).toBe("function");
    expect(typeof app.cms.media.list).toBe("function");

    // Start phase
    await app.start();
    expect(order).toEqual([
      "base:init",
      "cms:init",
      "analytics:init",
      "base:start",
      "cms:start",
      "analytics:start"
    ]);

    // State mutation via namespaced API
    app.cms.content.add("post-1");
    app.cms.content.add("post-2");
    expect(app.cms.content.count()).toBe(2);
    expect(app.cms.content.list()).toEqual(["post-1", "post-2"]);

    app.cms.media.upload("hero.jpg");
    expect(app.cms.media.list()).toEqual(["hero.jpg"]);

    // State slices are independent
    expect(app.cms.content.count()).toBe(2); // unaffected by media upload

    // Events fire and hooks in dependent plugin trigger
    app.emit("cms:publish", { title: "My Post" });
    app.emit("cms:upload", { name: "photo.png" });

    expect(hookPayloads).toEqual([
      { event: "publish", title: "My Post" },
      { event: "upload", name: "photo.png" }
    ]);

    // Stop phase — reverse order
    await app.stop();
    const stopEvents = order.filter(e => e.endsWith(":stop"));
    expect(stopEvents).toEqual(["analytics:stop", "cms:stop", "base:stop"]);
  });

  it("config overrides resolve correctly per sub-key", () => {
    let captured: Record<string, unknown> = {};

    const cc = createCoreConfig<{ name: string }, Record<string, never>>("test", {
      config: { name: "test" }
    });

    const cms = cc.createPlugin("cms", {
      config: {
        content: { maxItems: 100, drafts: true },
        media: { maxSize: 10, formats: ["jpg"] }
      },
      onInit: ctx => {
        captured = { ...ctx.config };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [cms] });

    // Override only content sub-key
    createApp({
      pluginConfigs: {
        cms: { content: { maxItems: 50, drafts: false } }
      }
    });

    // content: fully replaced by consumer
    const content = captured.content as { maxItems: number; drafts: boolean };
    expect(content.maxItems).toBe(50);
    expect(content.drafts).toBe(false);

    // media: untouched, from plugin defaults
    const media = captured.media as { maxSize: number; formats: string[] };
    expect(media.maxSize).toBe(10);
    expect(media.formats).toEqual(["jpg"]);
  });
});
