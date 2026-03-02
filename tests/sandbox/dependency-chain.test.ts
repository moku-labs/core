import { describe, expect, expectTypeOf, it } from "vitest";

import { createApp, createPlugin } from "./demo/framework/index";
import { rendererPlugin } from "./demo/framework/plugins/renderer";
import { seoPlugin } from "./demo/framework/plugins/seo";
import { sitemapPlugin } from "./demo/framework/plugins/sitemap";
import { templateEnginePlugin } from "./demo/framework/plugins/template-engine";

// ---------------------------------------------------------------------------
// 4-level dependency chain: type inference at every level (SAND-05)
// ---------------------------------------------------------------------------

describe("4-level dependency chain: type inference at every level (SAND-05)", () => {
  it("level 0 (template-engine) infers name as literal", () => {
    expectTypeOf(templateEnginePlugin.name).toEqualTypeOf<"template-engine">();
    expect(templateEnginePlugin.name).toBe("template-engine");
  });

  it("level 1 (renderer) infers name as literal", () => {
    expectTypeOf(rendererPlugin.name).toEqualTypeOf<"renderer">();
    expect(rendererPlugin.name).toBe("renderer");
  });

  it("level 2 (seo) infers name as literal", () => {
    expectTypeOf(seoPlugin.name).toEqualTypeOf<"seo">();
    expect(seoPlugin.name).toBe("seo");
  });

  it("level 3 (sitemap) infers name as literal", () => {
    expectTypeOf(sitemapPlugin.name).toEqualTypeOf<"sitemap">();
    expect(sitemapPlugin.name).toBe("sitemap");
  });
});

// ---------------------------------------------------------------------------
// ctx.require() returns correctly typed API at each level
// ---------------------------------------------------------------------------

describe("ctx.require() returns correctly typed API at each level", () => {
  it("all 4 levels expose typed APIs on the app object", async () => {
    const app = createApp();

    // Level 1: renderer (depends on template-engine)
    expectTypeOf(app.renderer.render).toBeFunction();

    // Level 2: seo (depends on router, renderer)
    expectTypeOf(app.seo.setTitle).toBeFunction();
    expectTypeOf(app.seo.getDefaultTitle).toBeFunction();

    // Level 3: sitemap (depends on seo, router)
    expectTypeOf(app.sitemap.addEntry).toBeFunction();
    expectTypeOf(app.sitemap.generate).toBeFunction();
    expectTypeOf(app.sitemap.getEntries).toBeFunction();
    expectTypeOf(app.sitemap.getEntryCount).toBeFunction();

    // Runtime: all APIs are defined (including sub-plugin template-engine)
    expect(app.has("template-engine")).toBe(true);
    expect(app.renderer).toBeDefined();
    expect(app.seo).toBeDefined();
    expect(app.sitemap).toBeDefined();
  });

  it("cross-level require: level 3 calls through level 2 and level 0", async () => {
    const app = createApp();

    // sitemap.addEntry calls seo.getDefaultTitle() and router.current()
    const entry = app.sitemap.addEntry("/about");
    expect(entry).toBeDefined();
    expect(entry.path).toBe("/about");
    expect(entry.title).toBe("Untitled"); // from seo default config

    // renderer.render calls templateEngine.compile()
    const html = app.renderer.render("/about");
    expect(html).toBe("<div>/about</div>");
  });

  it("app.require returns typed APIs for all chain levels", async () => {
    const app = createApp();

    const templateApi = app.require(templateEnginePlugin);
    expectTypeOf(templateApi.compile).toBeFunction();

    const rendererApi = app.require(rendererPlugin);
    expectTypeOf(rendererApi.render).toBeFunction();

    const seoApi = app.require(seoPlugin);
    expectTypeOf(seoApi.setTitle).toBeFunction();
    expectTypeOf(seoApi.getDefaultTitle).toBeFunction();

    const sitemapApi = app.require(sitemapPlugin);
    expectTypeOf(sitemapApi.addEntry).toBeFunction();
    expectTypeOf(sitemapApi.generate).toBeFunction();

    // Runtime: typed calls work
    expect(templateApi.compile("test")).toBe("test");
    expect(seoApi.getDefaultTitle()).toBe("Untitled");
  });
});

// ---------------------------------------------------------------------------
// Events flow through the 4-level dependency chain
// ---------------------------------------------------------------------------

describe("events flow through the 4-level dependency chain", () => {
  it("level 3 (sitemap) emits its own events at runtime", async () => {
    const app = createApp();

    app.sitemap.addEntry("/page1");
    app.sitemap.addEntry("/page2");

    const xml = app.sitemap.generate();
    expect(xml).toContain("<urlset>");
    expect(xml).toContain("/page1");
    expect(xml).toContain("/page2");
    expect(app.sitemap.getEntryCount()).toBe(2);
  });

  it("plugin depending on sitemap can emit sitemap events (type merging)", () => {
    const probe = createPlugin("sitemap-probe", {
      depends: [sitemapPlugin],
      api: ctx => ({
        test: () => {
          // Can emit sitemap's own events via depends chain
          ctx.emit("sitemap:generated", { url: "test", entryCount: 0 });
          ctx.emit("sitemap:entry-added", { path: "/", title: "Home" });

          // Can emit global events
          ctx.emit("page:render", { path: "/", html: "<div/>" });

          // @ts-expect-error -- wrong payload for sitemap:generated
          ctx.emit("sitemap:generated", { wrongKey: true });

          // @ts-expect-error -- wrong payload for sitemap:entry-added
          ctx.emit("sitemap:entry-added", { badField: 42 });
        }
      })
    });

    expect(probe.name).toBe("sitemap-probe");
  });
});

// ---------------------------------------------------------------------------
// Type-level error detection across the chain
// ---------------------------------------------------------------------------

describe("type-level error detection across the chain", () => {
  it("rejects wrong payload types for sitemap events", () => {
    const plugin = createPlugin("emit-error-check", {
      depends: [sitemapPlugin],
      api: ctx => {
        // @ts-expect-error -- entryCount should be number, not string
        ctx.emit("sitemap:generated", { url: "x", entryCount: "not-a-number" });

        // @ts-expect-error -- path should be string, not number
        ctx.emit("sitemap:entry-added", { path: 123, title: "ok" });

        return {};
      }
    });

    expect(plugin.name).toBe("emit-error-check");
  });

  it("rejects nonexistent properties on plugin APIs at every level", async () => {
    const app = createApp();

    // @ts-expect-error -- sitemap does not have "nonexistent"
    expect(app.sitemap.nonexistent).toBeUndefined();

    // @ts-expect-error -- seo does not have "nonexistent"
    expect(app.seo.nonexistent).toBeUndefined();

    // @ts-expect-error -- renderer does not have "nonexistent"
    expect(app.renderer.nonexistent).toBeUndefined();
  });
});
