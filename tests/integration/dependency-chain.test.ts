import { describe, expect, expectTypeOf, it } from "vitest";

import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// 4-level dependency chain: lifecycle ordering
// ---------------------------------------------------------------------------

describe("4-level dependency chain: lifecycle ordering", () => {
  it("all 4 levels init forward, start forward, stop reverse", async () => {
    const order: string[] = [];

    const cc = createCoreConfig<
      { siteName: string },
      { "page:render": { path: string; html: string } }
    >("chain-lifecycle", {
      config: { siteName: "Lifecycle Test" }
    });

    // Level 0: template-engine (sub-plugin of renderer)
    const templateEngine = cc.createPlugin("template-engine", {
      api: () => ({ compile: (t: string) => t }),
      onInit: () => {
        order.push("template-engine:init");
      },
      onStart: () => {
        order.push("template-engine:start");
      },
      onStop: () => {
        order.push("template-engine:stop");
      }
    });

    // Level 0: router (independent base)
    const router = cc.createPlugin("router", {
      createState: () => ({ currentPath: "/" }),
      api: ctx => ({
        navigate: (path: string) => {
          ctx.state.currentPath = path;
        },
        current: () => ctx.state.currentPath
      }),
      onInit: () => {
        order.push("router:init");
      },
      onStart: () => {
        order.push("router:start");
      },
      onStop: () => {
        order.push("router:stop");
      }
    });

    // Level 1: renderer (depends on template-engine)
    const renderer = cc.createPlugin("renderer", {
      events: register => ({
        "renderer:complete": register<{ path: string; duration: number }>("Render complete")
      }),
      depends: [templateEngine],
      api: ctx => ({
        render: (path: string) => {
          const html = ctx.require(templateEngine).compile(`<div>${path}</div>`);
          ctx.emit("renderer:complete", { path, duration: 0 });
          return html;
        }
      }),
      onInit: () => {
        order.push("renderer:init");
      },
      onStart: () => {
        order.push("renderer:start");
      },
      onStop: () => {
        order.push("renderer:stop");
      }
    });

    // Level 2: seo (depends on router, renderer)
    const seo = cc.createPlugin("seo", {
      depends: [router, renderer],
      config: { defaultTitle: "Untitled" },
      api: ctx => ({
        setTitle: (title: string) => `<title>${title}</title>`,
        getDefaultTitle: () => ctx.config.defaultTitle
      }),
      onInit: () => {
        order.push("seo:init");
      },
      onStart: () => {
        order.push("seo:start");
      },
      onStop: () => {
        order.push("seo:stop");
      }
    });

    // Level 3: sitemap (depends on seo, router)
    const sitemap = cc.createPlugin("sitemap", {
      events: register => ({
        "sitemap:generated": register<{ url: string; entryCount: number }>("Sitemap generated")
      }),
      depends: [seo, router],
      config: { baseUrl: "https://test.com" },
      createState: () => ({
        entries: [] as Array<{ path: string; title: string }>
      }),
      api: ctx => ({
        addEntry: (path: string) => {
          const title = ctx.require(seo).getDefaultTitle();
          ctx.state.entries.push({ path, title });
          return { path, title };
        },
        generate: () => {
          ctx.emit("sitemap:generated", {
            url: `${ctx.config.baseUrl}/sitemap.xml`,
            entryCount: ctx.state.entries.length
          });
          return `<urlset>${ctx.state.entries.length} entries</urlset>`;
        },
        getEntries: () => ctx.state.entries,
        getEntryCount: () => ctx.state.entries.length
      }),
      onInit: () => {
        order.push("sitemap:init");
      },
      onStart: () => {
        order.push("sitemap:start");
      },
      onStop: () => {
        order.push("sitemap:stop");
      }
    });

    // All plugins listed explicitly in dependency order
    const { createApp } = cc.createCore(cc, {
      plugins: [router, templateEngine, renderer, seo, sitemap]
    });

    const app = await createApp();

    // Init: forward order (after flattening)
    expect(order).toEqual([
      "router:init",
      "template-engine:init",
      "renderer:init",
      "seo:init",
      "sitemap:init"
    ]);

    await app.start();

    const startEvents = order.filter(e => e.endsWith(":start"));
    expect(startEvents).toEqual([
      "router:start",
      "template-engine:start",
      "renderer:start",
      "seo:start",
      "sitemap:start"
    ]);

    await app.stop();

    const stopEvents = order.filter(e => e.endsWith(":stop"));
    expect(stopEvents).toEqual([
      "sitemap:stop",
      "seo:stop",
      "renderer:stop",
      "template-engine:stop",
      "router:stop"
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4-level dependency chain: cross-level API calls
// ---------------------------------------------------------------------------

describe("4-level dependency chain: cross-level API calls", () => {
  it("level 3 calls through level 2, level 1, and level 0 at runtime", async () => {
    const cc = createCoreConfig<
      { siteName: string },
      { "page:render": { path: string; html: string } }
    >("cross-level", {
      config: { siteName: "Cross-Level" }
    });

    const templateEngine = cc.createPlugin("template-engine", {
      api: () => ({
        compile: (template: string) => `compiled:${template}`
      })
    });

    const router = cc.createPlugin("router", {
      createState: () => ({ currentPath: "/" }),
      api: ctx => ({
        navigate: (path: string) => {
          ctx.state.currentPath = path;
        },
        current: () => ctx.state.currentPath
      })
    });

    const renderer = cc.createPlugin("renderer", {
      depends: [templateEngine],
      api: ctx => ({
        render: (path: string) => ctx.require(templateEngine).compile(`<div>${path}</div>`)
      })
    });

    const seo = cc.createPlugin("seo", {
      depends: [router, renderer],
      config: { defaultTitle: "Default" },
      api: ctx => ({
        setTitle: (title: string) => {
          const currentPath = ctx.require(router).current();
          return `<title>${title} - ${currentPath}</title>`;
        },
        getDefaultTitle: () => ctx.config.defaultTitle,
        renderWithSeo: (path: string) => {
          const html = ctx.require(renderer).render(path);
          return `<head><title>${ctx.config.defaultTitle}</title></head>${html}`;
        }
      })
    });

    const sitemap = cc.createPlugin("sitemap", {
      depends: [seo, router],
      createState: () => ({
        entries: [] as Array<{ path: string; title: string; html: string }>
      }),
      api: ctx => ({
        indexPage: (path: string) => {
          // Level 3 -> Level 2 -> Level 1 -> Level 0 (full chain)
          const title = ctx.require(seo).getDefaultTitle();
          const fullHtml = ctx.require(seo).renderWithSeo(path);
          const currentRoute = ctx.require(router).current();
          ctx.state.entries.push({ path, title, html: fullHtml });
          return {
            path,
            title,
            html: fullHtml,
            currentRoute,
            entryCount: ctx.state.entries.length
          };
        },
        getEntries: () => ctx.state.entries
      })
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [router, templateEngine, renderer, seo, sitemap]
    });

    const app = await createApp();

    // Full chain call: sitemap -> seo -> renderer -> template-engine
    const result = app.sitemap.indexPage("/about");

    expect(result.path).toBe("/about");
    expect(result.title).toBe("Default");
    expect(result.html).toContain("compiled:");
    expect(result.html).toContain("<div>/about</div>");
    expect(result.html).toContain("<title>Default</title>");
    expect(result.currentRoute).toBe("/");
    expect(result.entryCount).toBe(1);

    // State persists across calls
    app.sitemap.indexPage("/contact");
    const entries = app.sitemap.getEntries();
    expect(entries).toHaveLength(2);

    // Type-level: APIs are typed through the chain
    expectTypeOf(app.sitemap.indexPage).toBeFunction();
    expectTypeOf(app.seo.renderWithSeo).toBeFunction();
    expectTypeOf(app.renderer.render).toBeFunction();
  });
});

// ---------------------------------------------------------------------------
// 4-level dependency chain: event propagation through hooks
// ---------------------------------------------------------------------------

describe("4-level dependency chain: event propagation through hooks", () => {
  it("events cascade through hooks at every level", async () => {
    const hookCalls: string[] = [];

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("event-chain", {
      config: { siteName: "Event Chain" }
    });

    const level0 = cc.createPlugin("level0", {
      events: register => ({
        "level0:action": register<{ value: string }>("Level 0 action")
      }),
      api: ctx => ({
        act: (value: string) => {
          ctx.emit("level0:action", { value });
        }
      })
    });

    const level1 = cc.createPlugin("level1", {
      events: register => ({
        "level1:action": register<{ value: string }>("Level 1 action")
      }),
      depends: [level0],
      api: ctx => ({
        act: (value: string) => {
          ctx.require(level0).act(`from-level1:${value}`);
          ctx.emit("level1:action", { value });
        }
      }),
      hooks: _ctx => ({
        "level0:action": payload => {
          hookCalls.push(`level1-heard-level0:${payload.value}`);
        }
      })
    });

    const level2 = cc.createPlugin("level2", {
      events: register => ({
        "level2:action": register<{ value: string }>("Level 2 action")
      }),
      depends: [level1],
      api: ctx => ({
        act: (value: string) => {
          ctx.require(level1).act(`from-level2:${value}`);
          ctx.emit("level2:action", { value });
        }
      }),
      hooks: _ctx => ({
        "level1:action": payload => {
          hookCalls.push(`level2-heard-level1:${payload.value}`);
        }
      })
    });

    const level3 = cc.createPlugin("level3", {
      depends: [level2],
      api: ctx => ({
        act: (value: string) => {
          ctx.require(level2).act(`from-level3:${value}`);
        }
      }),
      hooks: _ctx => ({
        "level2:action": payload => {
          hookCalls.push(`level3-heard-level2:${payload.value}`);
        }
      })
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [level0, level1, level2, level3]
    });

    const app = await createApp();

    // Trigger from level 3 — cascades through entire chain
    app.level3.act("test");

    // Each level's hook heard its dependency's event
    expect(hookCalls).toContain("level1-heard-level0:from-level1:from-level2:from-level3:test");
    expect(hookCalls).toContain("level2-heard-level1:from-level2:from-level3:test");
    expect(hookCalls).toContain("level3-heard-level2:from-level3:test");
  });
});
