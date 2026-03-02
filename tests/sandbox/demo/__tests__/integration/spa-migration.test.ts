import { describe, expect, expectTypeOf, it } from "vitest";
import {
  bundlerPlugin,
  cliPlugin,
  componentsPlugin,
  contentPlugin,
  createApp,
  createPlugin,
  headPlugin,
  progressPlugin,
  routerPlugin
} from "../../tools";
import type { BundleOutput } from "../../tools/plugins/bundler";
import type { CommandResult } from "../../tools/plugins/cli";
import type { Article } from "../../tools/plugins/content";

// ---------------------------------------------------------------------------
// Integration test: unified framework — 7-plugin framework (SPA + Build + CLI)
// ---------------------------------------------------------------------------
//
// createApp is the Layer-2 export — it already has all 7 framework plugins
// baked in (router, progress, components, head, content, bundler, cli).
//
// createPlugin is used for ad-hoc listener/tracker plugins in event and
// lifecycle tests. Those are passed via createApp({ plugins: [...] }).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Flush all pending microtasks (fire-and-forget dispatches from emit). */
const flush = () => new Promise(r => setTimeout(r, 0));

const createTestApp = async (
  config?: {
    appName?: string;
    debug?: boolean;
    mode?: "ssg" | "spa" | "hybrid";
    contentDir?: string;
    outputDir?: string;
    version?: string;
  },
  pluginConfigs?: {
    router?: Partial<{ basePath: string }>;
    components?: Partial<{ swapSelector: string }>;
  }
) => {
  return createApp({
    ...(config ? { config } : {}),
    ...(pluginConfigs ? { pluginConfigs } : {})
  });
};

describe("moku-spa framework: SPA migration integration", () => {
  // -------------------------------------------------------------------------
  // Runtime: app surface
  // -------------------------------------------------------------------------

  describe("runtime: all SPA plugins on app surface", () => {
    it("createApp() returns app with all 4 SPA plugin APIs", async () => {
      const app = await createTestApp();

      expect(app.router).toBeDefined();
      expect(app.progress).toBeDefined();
      expect(app.components).toBeDefined();
      expect(app.head).toBeDefined();
    });

    it("all plugin API methods are callable", async () => {
      const app = await createTestApp();

      expect(typeof app.router.navigate).toBe("function");
      expect(typeof app.router.current).toBe("function");
      expect(typeof app.router.back).toBe("function");
      expect(typeof app.progress.isActive).toBe("function");
      expect(typeof app.progress.getPercent).toBe("function");
      expect(typeof app.components.register).toBe("function");
      expect(typeof app.components.getMounted).toBe("function");
      expect(typeof app.components.getByName).toBe("function");
      expect(typeof app.head.getTitle).toBe("function");
      expect(typeof app.head.getDescription).toBe("function");
      expect(typeof app.head.setTitle).toBe("function");
      expect(typeof app.head.setDescription).toBe("function");
    });

    it("base app methods present: start, stop, emit, require, has", async () => {
      const app = await createTestApp();

      expect(typeof app.start).toBe("function");
      expect(typeof app.stop).toBe("function");
      expect(typeof app.emit).toBe("function");
      expect(typeof app.require).toBe("function");
      expect(typeof app.has).toBe("function");
    });

    it("returned app is Object.freeze'd", async () => {
      const app = await createTestApp();
      expect(Object.isFrozen(app)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: full lifecycle
  // -------------------------------------------------------------------------

  describe("runtime: full lifecycle createApp -> start -> navigate -> stop", () => {
    it("complete SPA lifecycle", async () => {
      const app = await createTestApp();

      await app.start();

      expect(app.router.current()).toBe("/");

      app.router.navigate("/about");
      expect(app.router.current()).toBe("/about");

      app.router.navigate("/contact");
      expect(app.router.current()).toBe("/contact");

      const previous = app.router.back();
      expect(previous).toBe("/about");
      expect(app.router.current()).toBe("/about");

      await app.stop();
    });

    it("config override: consumer changes basePath", async () => {
      const app = await createTestApp(undefined, {
        router: { basePath: "/blog" }
      });

      expect(app.router.current()).toBe("/blog");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: navigation event flow
  // -------------------------------------------------------------------------

  describe("runtime: navigation triggers event flow", () => {
    it("nav:start fires before nav:end", async () => {
      const events: string[] = [];

      const tracker = createPlugin("event-tracker", {
        depends: [routerPlugin],
        hooks: _ctx => ({
          "nav:start": () => {
            events.push("nav:start");
          },
          "nav:end": () => {
            events.push("nav:end");
          }
        })
      });

      const app = createApp({ plugins: [tracker] });
      await app.start();
      await flush(); // flush pending dispatches from onStart

      events.length = 0;

      app.router.navigate("/test");
      await flush();

      expect(events).toContain("nav:start");
      expect(events).toContain("nav:end");
      expect(events.indexOf("nav:start")).toBeLessThan(events.indexOf("nav:end"));

      await app.stop();
    });

    it("progress plugin completes after navigation", async () => {
      const app = await createTestApp();
      await app.start();

      expect(app.progress.isActive()).toBe(false);

      app.router.navigate("/page");
      await flush();

      expect(app.progress.isActive()).toBe(false);
      expect(app.progress.getPercent()).toBe(100);

      await app.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: component lifecycle
  // -------------------------------------------------------------------------

  describe("runtime: component lifecycle", () => {
    it("wildcard components mount on any route", async () => {
      const app = await createTestApp();

      app.components.register({
        name: "header",
        selector: "#header",
        routes: ["*"]
      });

      await app.start();
      await flush();

      const header = app.components.getByName("header");
      expect(header?.mounted).toBe(true);

      await app.stop();
    });

    it("route-specific components only mount on matching routes", async () => {
      const app = await createTestApp();

      app.components.register({
        name: "header",
        selector: "#header",
        routes: ["*"]
      });
      app.components.register({
        name: "gallery-widget",
        selector: "#gallery",
        routes: ["/gallery"]
      });

      await app.start();
      await flush();

      expect(app.components.getByName("header")?.mounted).toBe(true);
      expect(app.components.getByName("gallery-widget")?.mounted).toBeFalsy();

      app.router.navigate("/gallery");
      await flush();

      expect(app.components.getByName("gallery-widget")?.mounted).toBe(true);

      await app.stop();
    });

    it("components unmount on nav:start then remount on nav:end", async () => {
      const mountEvents: string[] = [];

      const mountTracker = createPlugin("mount-tracker", {
        depends: [componentsPlugin],
        hooks: _ctx => ({
          "component:mount": ({ name }) => {
            mountEvents.push(`mount:${name}`);
          },
          "component:unmount": ({ name }) => {
            mountEvents.push(`unmount:${name}`);
          }
        })
      });

      const app = createApp({ plugins: [mountTracker] });

      app.components.register({
        name: "sidebar",
        selector: "#sidebar",
        routes: ["*"]
      });

      await app.start();
      await flush();

      mountEvents.length = 0;

      app.router.navigate("/page-2");
      await flush();

      expect(mountEvents).toContain("unmount:sidebar");
      expect(mountEvents).toContain("mount:sidebar");
      expect(mountEvents.indexOf("unmount:sidebar")).toBeLessThan(
        mountEvents.indexOf("mount:sidebar")
      );

      await app.stop();
    });

    it("route-specific component unmounts when navigating away", async () => {
      const app = await createTestApp();

      app.components.register({
        name: "gallery-view",
        selector: "#gallery",
        routes: ["/gallery"]
      });

      await app.start();
      await flush();

      app.router.navigate("/gallery");
      await flush();
      expect(app.components.getByName("gallery-view")?.mounted).toBe(true);

      app.router.navigate("/about");
      await flush();
      expect(app.components.getByName("gallery-view")?.mounted).toBe(false);

      await app.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: head updates on navigation
  // -------------------------------------------------------------------------

  describe("runtime: head updates on navigation", () => {
    it("head title updates after navigation", async () => {
      const app = await createTestApp();
      await app.start();

      app.router.navigate("/about");
      await flush();

      expect(app.head.getTitle()).toBe("Page: /about");
      expect(app.head.getDescription()).toBe("Description for /about");

      app.router.navigate("/contact");
      await flush();

      expect(app.head.getTitle()).toBe("Page: /contact");

      await app.stop();
    });

    it("head initializes with app name from global config", async () => {
      const app = await createTestApp({ appName: "Test Blog" });

      expect(app.head.getTitle()).toBe("Test Blog");
      expect(app.head.getDescription()).toBe("SPA powered by Test Blog");
    });

    it("manual setTitle overrides automatic update", async () => {
      const app = await createTestApp();
      await app.start();

      app.head.setTitle("Custom Title");
      expect(app.head.getTitle()).toBe("Custom Title");

      await app.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: consumer island plugins
  // -------------------------------------------------------------------------

  describe("runtime: consumer island plugins", () => {
    it("consumer islands appear on app surface alongside framework plugins", async () => {
      const island = createPlugin("test-island", {
        depends: [componentsPlugin],
        api: _ctx => ({
          ping: () => "pong"
        }),
        onInit: ctx => {
          ctx.require(componentsPlugin).register({
            name: "test-island",
            selector: "[data-island='test']"
          });
        }
      });

      const app = createApp({ plugins: [island] });

      expect(app.router).toBeDefined();
      expect(app.progress).toBeDefined();
      expect(app.components).toBeDefined();
      expect(app.head).toBeDefined();
      expect(app["test-island"].ping()).toBe("pong");
    });

    it("islands register with component manager and participate in lifecycle", async () => {
      const island = createPlugin("counter-island", {
        depends: [componentsPlugin],
        createState: () => ({ count: 0 }),
        api: ctx => ({
          increment: () => {
            ctx.state.count += 1;
          },
          getCount: (): number => ctx.state.count
        }),
        onInit: ctx => {
          ctx.require(componentsPlugin).register({
            name: "counter-island",
            selector: "[data-island='counter']",
            routes: ["*"]
          });
        }
      });

      const app = createApp({ plugins: [island] });
      await app.start();
      await flush();

      const instance = app.components.getByName("counter-island");
      expect(instance?.mounted).toBe(true);

      app["counter-island"].increment();
      expect(app["counter-island"].getCount()).toBe(1);

      await app.stop();
    });

    it("route-specific island mounts only on matching routes", async () => {
      const galleryIsland = createPlugin("gallery-island", {
        depends: [componentsPlugin],
        api: _ctx => ({
          render: () => "gallery content"
        }),
        onInit: ctx => {
          ctx.require(componentsPlugin).register({
            name: "gallery-island",
            selector: "[data-island='gallery']",
            routes: ["/gallery"]
          });
        }
      });

      const app = createApp({ plugins: [galleryIsland] });
      await app.start();
      await flush();

      expect(app.components.getByName("gallery-island")?.mounted).toBeFalsy();

      app.router.navigate("/gallery");
      await flush();

      expect(app.components.getByName("gallery-island")?.mounted).toBe(true);

      app.router.navigate("/other");
      await flush();

      expect(app.components.getByName("gallery-island")?.mounted).toBe(false);

      await app.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: consumer main simulation
  // -------------------------------------------------------------------------

  describe("runtime: consumer main simulation", () => {
    it("SPA client entry boots with islands end-to-end", async () => {
      const { app } = await import("../../blog/spa");

      expect(app).toBeDefined();
      expect(Object.isFrozen(app)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: dependency chain
  // -------------------------------------------------------------------------

  describe("runtime: dependency chain", () => {
    it("app.has() reports all 4 framework plugins", async () => {
      const app = await createTestApp();

      expect(app.has("router")).toBe(true);
      expect(app.has("progress")).toBe(true);
      expect(app.has("components")).toBe(true);
      expect(app.has("head")).toBe(true);
      expect(app.has("nonexistent")).toBe(false);
    });

    it("app.require() returns API for each framework plugin", async () => {
      const app = await createTestApp();

      expect(typeof app.require(routerPlugin).navigate).toBe("function");
      expect(typeof app.require(progressPlugin).isActive).toBe("function");
      expect(typeof app.require(componentsPlugin).register).toBe("function");
      expect(typeof app.require(headPlugin).getTitle).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // Types: all plugin APIs typed on app surface
  // -------------------------------------------------------------------------

  describe("types: all plugin APIs typed on app surface", () => {
    it("app.router API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.router.navigate).toEqualTypeOf<(url: string) => void>();
      expectTypeOf(app.router.current).toEqualTypeOf<() => string>();
      expectTypeOf(app.router.back).toEqualTypeOf<() => string | undefined>();
    });

    it("app.progress API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.progress.isActive).toEqualTypeOf<() => boolean>();
      expectTypeOf(app.progress.getPercent).toEqualTypeOf<() => number>();
    });

    it("app.components API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.components.register).toBeFunction();
      expectTypeOf(app.components.getMounted).toEqualTypeOf<() => string[]>();
      expectTypeOf(app.components.getByName).toBeFunction();
    });

    it("app.head API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.head.getTitle).toEqualTypeOf<() => string>();
      expectTypeOf(app.head.getDescription).toEqualTypeOf<() => string>();
      expectTypeOf(app.head.setTitle).toEqualTypeOf<(title: string) => void>();
      expectTypeOf(app.head.setDescription).toEqualTypeOf<(description: string) => void>();
    });
  });

  // -------------------------------------------------------------------------
  // Types: event payloads typed in hooks
  // -------------------------------------------------------------------------

  describe("types: event payloads typed in hooks", () => {
    it("nav:start and nav:end payloads typed in dependent plugin hooks", () => {
      const plugin = createPlugin("nav-type-check", {
        depends: [routerPlugin],
        hooks: _ctx => ({
          "nav:start": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ from: string; to: string }>();
          },
          "nav:end": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ from: string; to: string }>();
          }
        })
      });

      expect(plugin.name).toBe("nav-type-check");
    });

    it("component:mount and component:unmount payloads typed", () => {
      const plugin = createPlugin("component-type-check", {
        depends: [componentsPlugin],
        hooks: _ctx => ({
          "component:mount": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ name: string; selector: string }>();
          },
          "component:unmount": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ name: string; selector: string }>();
          }
        })
      });

      expect(plugin.name).toBe("component-type-check");
    });

    it("global events typed without depends", () => {
      const plugin = createPlugin("global-type-check", {
        hooks: _ctx => ({
          "app:ready": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ timestamp: number }>();
          },
          "app:error": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ message: string; code: number }>();
          }
        })
      });

      expect(plugin.name).toBe("global-type-check");
    });
  });

  // -------------------------------------------------------------------------
  // Types: consumer plugin merges into app surface
  // -------------------------------------------------------------------------

  describe("types: consumer plugin merges into app surface type", () => {
    it("consumer plugin API appears on app with correct type", async () => {
      const extra = createPlugin("my-widget", {
        api: _ctx => ({
          ping: () => "pong" as const
        })
      });

      const app = createApp({ plugins: [extra] });

      expectTypeOf(app["my-widget"].ping).toEqualTypeOf<() => "pong">();
      expect(app["my-widget"].ping()).toBe("pong");
    });

    it("framework plugins remain typed when consumer plugin is added", async () => {
      const extra = createPlugin("bonus", {
        api: _ctx => ({ value: () => 42 })
      });

      const app = createApp({ plugins: [extra] });

      expectTypeOf(app.router.navigate).toBeFunction();
      expectTypeOf(app.progress.isActive).toBeFunction();
      expectTypeOf(app.components.register).toBeFunction();
      expectTypeOf(app.head.getTitle).toBeFunction();
      expect(app.bonus.value()).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // Types: emit rejects unknown events
  // -------------------------------------------------------------------------

  describe("types: emit rejects unknown events", () => {
    it("rejects unknown event names in emit", () => {
      const plugin = createPlugin("emit-unknown", {
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- "unknown:event" is not in MokuEvents
            ctx.emit("unknown:event", {});
          }
        })
      });

      expect(plugin.name).toBe("emit-unknown");
    });

    it("rejects wrong payload type on nav:start", () => {
      const plugin = createPlugin("emit-wrong-nav", {
        depends: [routerPlugin],
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- from must be string, not number
            ctx.emit("nav:start", { from: 123, to: "/test" });
          }
        })
      });

      expect(plugin.name).toBe("emit-wrong-nav");
    });

    it("non-dependent plugin cannot emit nav:start", () => {
      const plugin = createPlugin("no-dep-nav", {
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- "nav:start" requires depends on routerPlugin
            ctx.emit("nav:start", { from: "/", to: "/test" });
          }
        })
      });

      expect(plugin.name).toBe("no-dep-nav");
    });
  });

  // -------------------------------------------------------------------------
  // Types: plugin name literal types
  // -------------------------------------------------------------------------

  describe("types: plugin name literal types", () => {
    it("each plugin instance has a literal name type", () => {
      expectTypeOf(routerPlugin.name).toEqualTypeOf<"router">();
      expectTypeOf(progressPlugin.name).toEqualTypeOf<"progress">();
      expectTypeOf(componentsPlugin.name).toEqualTypeOf<"components">();
      expectTypeOf(headPlugin.name).toEqualTypeOf<"head">();
    });
  });

  // -------------------------------------------------------------------------
  // Types: app.require returns typed API
  // -------------------------------------------------------------------------

  describe("types: app.require returns typed API", () => {
    it("app.require(routerPlugin) returns typed API", async () => {
      const app = await createTestApp();
      const router = app.require(routerPlugin);

      expectTypeOf(router.navigate).toBeFunction();
      expectTypeOf(router.current).toBeFunction();
      expectTypeOf(router.back).toBeFunction();
    });

    it("app.require(componentsPlugin) returns typed API", async () => {
      const app = await createTestApp();
      const components = app.require(componentsPlugin);

      expectTypeOf(components.register).toBeFunction();
      expectTypeOf(components.getMounted).toBeFunction();
      expectTypeOf(components.getByName).toBeFunction();
    });
  });

  // =========================================================================
  // Build domain
  // =========================================================================

  describe("runtime: content pipeline", () => {
    it("content plugin loads articles into state", async () => {
      const app = await createTestApp();

      expect(app.content.isLoaded()).toBe(false);

      app.content.load([
        { slug: "a", title: "A", date: "2025-02-01", tags: ["x"], content: "Hello world" },
        { slug: "b", title: "B", date: "2025-01-01", tags: ["y"], content: "Second post" }
      ]);

      expect(app.content.isLoaded()).toBe(true);
      expect(app.content.getAllArticles()).toHaveLength(2);
    });

    it("getAllArticles returns sorted by date descending", async () => {
      const app = await createTestApp();

      app.content.load([
        { slug: "old", title: "Old", date: "2024-01-01", tags: [], content: "old" },
        { slug: "new", title: "New", date: "2025-06-01", tags: [], content: "new" },
        { slug: "mid", title: "Mid", date: "2025-01-01", tags: [], content: "mid" }
      ]);

      const articles = app.content.getAllArticles();
      expect(articles[0]?.slug).toBe("new");
      expect(articles[1]?.slug).toBe("mid");
      expect(articles[2]?.slug).toBe("old");
    });

    it("getArticle returns single article by slug", async () => {
      const app = await createTestApp();

      app.content.load([
        { slug: "target", title: "Target", date: "2025-01-01", tags: ["a"], content: "found" }
      ]);

      const article = app.content.getArticle("target");
      expect(article?.title).toBe("Target");
      expect(article?.url).toBe("/target");
      expect(article?.html).toBe("<p>found</p>");
      expect(article?.readingTime).toBeGreaterThanOrEqual(1);
      expect(app.content.getArticle("nonexistent")).toBeUndefined();
    });

    it("getByTag filters articles by tag", async () => {
      const app = await createTestApp();

      app.content.load([
        { slug: "a", title: "A", date: "2025-01-01", tags: ["js", "web"], content: "a" },
        { slug: "b", title: "B", date: "2025-01-02", tags: ["rust"], content: "b" },
        { slug: "c", title: "C", date: "2025-01-03", tags: ["js"], content: "c" }
      ]);

      expect(app.content.getByTag("js")).toHaveLength(2);
      expect(app.content.getByTag("rust")).toHaveLength(1);
      expect(app.content.getByTag("go")).toHaveLength(0);
    });

    it("content:loaded event fires with correct count", async () => {
      const events: Array<{ count: number }> = [];

      const tracker = createPlugin("content-tracker", {
        depends: [contentPlugin],
        hooks: _ctx => ({
          "content:loaded": payload => {
            events.push(payload);
          }
        })
      });

      const app = createApp({ plugins: [tracker] });
      app.content.load([
        { slug: "a", title: "A", date: "2025-01-01", tags: [], content: "a" },
        { slug: "b", title: "B", date: "2025-01-02", tags: [], content: "b" }
      ]);
      await flush();

      expect(events).toHaveLength(1);
      expect(events[0]?.count).toBe(2);
    });
  });

  describe("runtime: bundler pipeline", () => {
    it("bundler starts in idle phase", async () => {
      const app = await createTestApp();
      expect(app.bundler.getPhase()).toBe("idle");
      expect(app.bundler.getOutputs()).toHaveLength(0);
    });

    it("build() produces outputs for each entrypoint", async () => {
      const app = await createTestApp();
      app.bundler.build();

      const outputs = app.bundler.getOutputs();
      expect(outputs).toHaveLength(2);
      expect(outputs.map(o => o.name)).toContain("index.css");
      expect(outputs.map(o => o.name)).toContain("spa.tsx");
    });

    it("build() transitions phase: idle → building → done", async () => {
      const phases: string[] = [];

      const tracker = createPlugin("phase-tracker", {
        depends: [bundlerPlugin],
        hooks: _ctx => ({
          "bundle:start": () => {
            phases.push("start-seen");
          },
          "bundle:complete": () => {
            phases.push("complete-seen");
          }
        })
      });

      const app = createApp({ plugins: [tracker] });
      expect(app.bundler.getPhase()).toBe("idle");

      app.bundler.build();
      await flush();

      expect(app.bundler.getPhase()).toBe("done");
      expect(phases).toContain("start-seen");
      expect(phases).toContain("complete-seen");
      expect(phases.indexOf("start-seen")).toBeLessThan(phases.indexOf("complete-seen"));
    });

    it("getOutput returns specific bundle by entrypoint name", async () => {
      const app = await createTestApp();
      app.bundler.build();

      const css = app.bundler.getOutput("index.css");
      expect(css).toBeDefined();
      expect(css?.name).toBe("index.css");
      expect(css?.path).toMatch(/^assets\/index-[a-z0-9]+\.css$/);
      expect(css?.size).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // CLI domain
  // =========================================================================

  describe("runtime: CLI command dispatch", () => {
    it("built-in commands registered during onInit", async () => {
      const app = await createTestApp();
      const commands = app.cli.getCommands();

      expect(commands).toContain("build");
      expect(commands).toContain("version");
    });

    it("cli.run('version') returns framework version", async () => {
      const app = await createTestApp();
      const output = app.cli.run("version");

      expect(output).toContain("moku");
      expect(output).toContain("0.1.0");
    });

    it("cli.run('build') orchestrates content + bundler", async () => {
      const app = await createTestApp();

      // Load content first so build has articles
      app.content.load([{ slug: "a", title: "A", date: "2025-01-01", tags: [], content: "hello" }]);

      const output = app.cli.run("build");

      expect(output).toContain("1 articles");
      expect(output).toContain("bundles");
      expect(app.bundler.getPhase()).toBe("done");
    });

    it("cli.run('build') reports no content when not loaded", async () => {
      const app = await createTestApp();
      const output = app.cli.run("build");

      expect(output).toBe("No content loaded");
    });

    it("command history tracks all executions", async () => {
      const app = await createTestApp();

      app.cli.run("version");
      app.cli.run("nonexistent");

      const history = app.cli.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.command).toBe("version");
      expect(history[0]?.success).toBe(true);
      expect(history[1]?.command).toBe("nonexistent");
      expect(history[1]?.success).toBe(false);
    });

    it("consumer can register custom commands", async () => {
      const app = await createTestApp();

      app.cli.register("hello", "Greet the user", () => "Hello, world!");

      const output = app.cli.run("hello");
      expect(output).toBe("Hello, world!");
      expect(app.cli.getCommands()).toContain("hello");
    });

    it("cli:run and cli:complete events fire", async () => {
      const events: string[] = [];

      const tracker = createPlugin("cli-tracker", {
        depends: [cliPlugin],
        hooks: _ctx => ({
          "cli:run": ({ command }) => {
            events.push(`run:${command}`);
          },
          "cli:complete": ({ command, success }) => {
            events.push(`complete:${command}:${String(success)}`);
          }
        })
      });

      const app = createApp({ plugins: [tracker] });
      app.cli.run("version");
      await flush();

      expect(events).toContain("run:version");
      expect(events).toContain("complete:version:true");
    });
  });

  // =========================================================================
  // Cross-domain: the proof
  // =========================================================================

  describe("cross-domain: SPA + Build + CLI coexist in one framework", () => {
    it("all 7 framework plugins appear on app surface", async () => {
      const app = await createTestApp();

      // SPA
      expect(app.router).toBeDefined();
      expect(app.progress).toBeDefined();
      expect(app.components).toBeDefined();
      expect(app.head).toBeDefined();
      // Build
      expect(app.content).toBeDefined();
      expect(app.bundler).toBeDefined();
      // CLI
      expect(app.cli).toBeDefined();
    });

    it("has() reports plugins from all three domains", async () => {
      const app = await createTestApp();

      expect(app.has("router")).toBe(true);
      expect(app.has("content")).toBe(true);
      expect(app.has("bundler")).toBe(true);
      expect(app.has("cli")).toBe(true);
    });

    it("require() returns typed APIs across domains", async () => {
      const app = await createTestApp();

      expect(typeof app.require(routerPlugin).navigate).toBe("function");
      expect(typeof app.require(contentPlugin).load).toBe("function");
      expect(typeof app.require(bundlerPlugin).build).toBe("function");
      expect(typeof app.require(cliPlugin).run).toBe("function");
    });

    it("SPA navigation and build commands work on same app", async () => {
      const app = await createTestApp();
      await app.start();
      await flush();

      // SPA domain works
      app.router.navigate("/about");
      expect(app.router.current()).toBe("/about");

      // Build domain works
      app.content.load([{ slug: "x", title: "X", date: "2025-01-01", tags: [], content: "test" }]);
      expect(app.content.isLoaded()).toBe(true);

      app.bundler.build();
      expect(app.bundler.getPhase()).toBe("done");

      // CLI domain works
      const version = app.cli.run("version");
      expect(version).toContain("moku");

      await app.stop();
    });

    it("consumer adds plugins from all domains: SPA island + build plugin", async () => {
      const { feedPlugin } = await import("../../blog/plugins/feed");
      const { lightboxIsland } = await import("../../blog/islands/lightbox");

      const app = createApp({
        plugins: [lightboxIsland, feedPlugin]
      });

      // SPA consumer island
      expect(app.lightbox).toBeDefined();
      expect(typeof app.lightbox.open).toBe("function");

      // Build consumer plugin
      expect(app.feed).toBeDefined();
      expect(typeof app.feed.generate).toBe("function");

      // Framework plugins from all domains still present
      expect(app.router).toBeDefined();
      expect(app.content).toBeDefined();
      expect(app.cli).toBeDefined();
    });

    it("content:loaded hook fires in consumer feed plugin", async () => {
      const { feedPlugin } = await import("../../blog/plugins/feed");

      const app = createApp({ plugins: [feedPlugin] });

      app.content.load([{ slug: "a", title: "A", date: "2025-01-01", tags: [], content: "text" }]);
      await flush();

      // Feed plugin generate after content loaded
      app.feed.generate();
      expect(app.feed.isGenerated()).toBe(true);
      expect(app.feed.getFeed("rss")?.itemCount).toBe(1);
    });

    it("build/CLI main.ts runs end-to-end across server domains", async () => {
      const { app } = await import("../../blog/main");

      expect(app).toBeDefined();
      expect(Object.isFrozen(app)).toBe(true);
    });
  });

  // =========================================================================
  // Types: Build + CLI plugins
  // =========================================================================

  describe("types: build plugin APIs typed on app surface", () => {
    it("app.content API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.content.load).toBeFunction();
      expectTypeOf(app.content.getArticle).toBeFunction();
      expectTypeOf(app.content.getAllArticles).toEqualTypeOf<() => Article[]>();
      expectTypeOf(app.content.getByTag).toBeFunction();
      expectTypeOf(app.content.isLoaded).toEqualTypeOf<() => boolean>();
    });

    it("app.bundler API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.bundler.build).toEqualTypeOf<() => void>();
      expectTypeOf(app.bundler.getOutput).toBeFunction();
      expectTypeOf(app.bundler.getOutputs).toEqualTypeOf<() => BundleOutput[]>();
      expectTypeOf(app.bundler.getPhase).toBeFunction();
    });

    it("app.cli API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.cli.register).toBeFunction();
      expectTypeOf(app.cli.run).toBeFunction();
      expectTypeOf(app.cli.getCommands).toEqualTypeOf<() => string[]>();
      expectTypeOf(app.cli.getHistory).toEqualTypeOf<() => CommandResult[]>();
    });
  });

  describe("types: build/CLI event payloads typed in hooks", () => {
    it("content events typed in dependent plugin hooks", () => {
      const plugin = createPlugin("content-type-check", {
        depends: [contentPlugin],
        hooks: _ctx => ({
          "content:loaded": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ count: number }>();
          },
          "content:error": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ slug: string; message: string }>();
          }
        })
      });
      expect(plugin.name).toBe("content-type-check");
    });

    it("bundler events typed in dependent plugin hooks", () => {
      const plugin = createPlugin("bundler-type-check", {
        depends: [bundlerPlugin],
        hooks: _ctx => ({
          "bundle:start": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ entrypoints: string[] }>();
          },
          "bundle:complete": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ outputs: string[]; elapsed: number }>();
          }
        })
      });
      expect(plugin.name).toBe("bundler-type-check");
    });

    it("CLI events typed in dependent plugin hooks", () => {
      const plugin = createPlugin("cli-type-check", {
        depends: [cliPlugin],
        hooks: _ctx => ({
          "cli:run": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ command: string; args: string[] }>();
          },
          "cli:complete": payload => {
            expectTypeOf(payload).toEqualTypeOf<{
              command: string;
              success: boolean;
              elapsed: number;
            }>();
          }
        })
      });
      expect(plugin.name).toBe("cli-type-check");
    });
  });

  describe("types: cross-domain emit isolation", () => {
    it("SPA plugin cannot emit build events without depends", () => {
      const plugin = createPlugin("spa-no-build", {
        depends: [routerPlugin],
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- "content:loaded" requires depends on contentPlugin
            ctx.emit("content:loaded", { count: 0 });
          }
        })
      });
      expect(plugin.name).toBe("spa-no-build");
    });

    it("build plugin cannot emit SPA events without depends", () => {
      const plugin = createPlugin("build-no-spa", {
        depends: [contentPlugin],
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- "nav:start" requires depends on routerPlugin
            ctx.emit("nav:start", { from: "/", to: "/test" });
          }
        })
      });
      expect(plugin.name).toBe("build-no-spa");
    });

    it("plugin name literal types for new plugins", () => {
      expectTypeOf(contentPlugin.name).toEqualTypeOf<"content">();
      expectTypeOf(bundlerPlugin.name).toEqualTypeOf<"bundler">();
      expectTypeOf(cliPlugin.name).toEqualTypeOf<"cli">();
    });
  });
});
