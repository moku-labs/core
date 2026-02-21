import { describe, expect, expectTypeOf, it } from "vitest";
import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// ctx.require returns typed API (SAND-05)
// ---------------------------------------------------------------------------

describe("ctx.require returns typed API (SAND-05)", () => {
  it("instance-based require returns fully typed API", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    let capturedRouterApi: { resolve: (path: string) => string } | undefined;

    const router = cc.createPlugin("router", {
      defaultConfig: { basePath: "/" },
      api: () => ({
        resolve: (path: string) => path
      })
    });

    const logger = cc.createPlugin("logger", {
      depends: [router] as const,
      api: ctx => {
        const routerApi = ctx.require(router);

        // Type-level: routerApi has resolve method
        expectTypeOf(routerApi.resolve).toBeFunction();

        capturedRouterApi = routerApi;
        return {
          logRoute: () => routerApi.resolve("/test")
        };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router, logger] });
    const app = await createApp();

    expect(capturedRouterApi).toBeDefined();
    expect(app.logger.logRoute()).toBe("/test");
  });

  it("string-based require for declared dependency returns typed API", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const router = cc.createPlugin("router", {
      api: () => ({
        current: () => "/home"
      })
    });

    let capturedResult: string | undefined;

    const consumer = cc.createPlugin("consumer", {
      depends: [router] as const,
      api: ctx => {
        // Tier 2: string-based require with name from depends tuple
        const routerApi = ctx.require("router");
        capturedResult = routerApi.current();
        return { check: () => capturedResult };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router, consumer] });
    const app = await createApp();

    expect(capturedResult).toBe("/home");
    expect(app.consumer.check()).toBe("/home");
  });

  it("string-based require for non-dependency returns unknown", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const probe = cc.createPlugin("probe", {
      api: ctx => {
        // Tier 3: arbitrary string not in depends -> unknown
        const result = ctx.require("some-dynamic-name");
        expectTypeOf(result).toBeUnknown();
        return { noop: () => {} };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router, probe] });
    // This will throw at runtime because "some-dynamic-name" is not registered,
    // but the TYPE assertion above is the point of this test
    await expect(createApp()).rejects.toThrow();
  });

  it("require throws when plugin is not registered", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const probe = cc.createPlugin("probe", {
      api: ctx => {
        ctx.require("nonexistent");
        return {};
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });

    // Runtime: require should throw with framework error message
    await expect(createApp()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ctx.getPlugin
// ---------------------------------------------------------------------------

describe("ctx.getPlugin", () => {
  it("returns typed API | undefined for declared dependency", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    let capturedResult: string | undefined;

    const router = cc.createPlugin("router", {
      api: () => ({
        current: () => "/home"
      })
    });

    const consumer = cc.createPlugin("consumer", {
      depends: [router] as const,
      api: ctx => {
        const routerApi = ctx.getPlugin(router);
        // Type-level: result is RouterApi | undefined
        expectTypeOf(routerApi).not.toBeUndefined();

        if (routerApi) {
          capturedResult = routerApi.current();
        }
        return { check: () => capturedResult };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router, consumer] });
    const app = await createApp();

    expect(capturedResult).toBe("/home");
    expect(app.consumer.check()).toBe("/home");
  });

  it("returns undefined when plugin not registered", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    let capturedResult: unknown;

    const probe = cc.createPlugin("probe", {
      api: ctx => {
        capturedResult = ctx.getPlugin("nonexistent");
        return { noop: () => {} };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    await createApp();

    expect(capturedResult).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ctx.has
// ---------------------------------------------------------------------------

describe("ctx.has", () => {
  it("returns true for registered plugins", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    let hasRouter = false;
    let hasLogger = false;

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const logger = cc.createPlugin("logger", {
      depends: [router] as const,
      api: ctx => {
        hasRouter = ctx.has("router");
        hasLogger = ctx.has("logger");
        return { noop: () => {} };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router, logger] });
    await createApp();

    expect(hasRouter).toBe(true);
    expect(hasLogger).toBe(true);
  });

  it("returns false for unregistered plugins", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    let hasNonexistent = true;

    const probe = cc.createPlugin("probe", {
      api: ctx => {
        hasNonexistent = ctx.has("nonexistent");
        return { noop: () => {} };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    await createApp();

    expect(hasNonexistent).toBe(false);
  });

  it("works for plugins not in depends (global check)", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    let hasRenderer = false;

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const renderer = cc.createPlugin("renderer", {
      api: () => ({ render: () => "<div/>" })
    });

    const logger = cc.createPlugin("logger", {
      depends: [router] as const,
      api: ctx => {
        // logger depends on router only, but has() checks global registration
        hasRenderer = ctx.has("renderer");
        return { noop: () => {} };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router, renderer, logger] });
    await createApp();

    expect(hasRenderer).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// depends validation at startup
// ---------------------------------------------------------------------------

describe("depends validation at startup", () => {
  it("plugins with depends load correctly when dependencies are registered and ordered", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const logger = cc.createPlugin("logger", {
      depends: [router] as const,
      api: ctx => ({
        log: () => ctx.require(router).current()
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router, logger] });
    const app = await createApp();

    expect(app.logger).toBeDefined();
    expect(app.logger.log()).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// sub-plugin flattening and dependencies
// ---------------------------------------------------------------------------

describe("sub-plugin flattening and dependencies", () => {
  it("sub-plugins are accessible after flattening", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const templateEngine = cc.createPlugin("template-engine", {
      api: () => ({
        compile: (template: string) => template
      })
    });

    const renderer = cc.createPlugin("renderer", {
      plugins: [templateEngine],
      depends: [templateEngine] as const,
      api: ctx => ({
        render: (path: string) => {
          const engine = ctx.require(templateEngine);
          return engine.compile(`<div>${path}</div>`);
        }
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [renderer] });
    const app = await createApp();

    // template-engine should be registered after flattening
    expect(app.has("template-engine")).toBe(true);
    expect(app.renderer.render("/")).toBe("<div>/</div>");
  });

  it("parent plugin can require its sub-plugin", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const templateEngine = cc.createPlugin("template-engine", {
      api: () => ({
        compile: (template: string) => template
      })
    });

    const renderer = cc.createPlugin("renderer", {
      plugins: [templateEngine],
      depends: [templateEngine] as const,
      api: ctx => ({
        render: (path: string) => ctx.require(templateEngine).compile(`<div>${path}</div>`)
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [renderer] });
    const app = await createApp();

    expect(app.renderer.render("/about")).toBe("<div>/about</div>");
  });

  it("flattening order: children before parent", async () => {
    const order: string[] = [];

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const templateEngine = cc.createPlugin("template-engine", {
      onInit: () => {
        order.push("template-engine:init");
      },
      api: () => ({
        compile: (template: string) => template
      })
    });

    const renderer = cc.createPlugin("renderer", {
      plugins: [templateEngine],
      depends: [templateEngine] as const,
      onInit: () => {
        order.push("renderer:init");
      },
      api: ctx => ({
        render: (path: string) => ctx.require(templateEngine).compile(path)
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [renderer] });
    await createApp();

    // Depth-first flattening: template-engine should init before renderer
    expect(order).toEqual(["template-engine:init", "renderer:init"]);
  });
});

// ---------------------------------------------------------------------------
// cross-plugin API access via app object
// ---------------------------------------------------------------------------

describe("cross-plugin API access via app object", () => {
  it("app.pluginName returns the API object (not the full plugin)", async () => {
    const { createApp } = await import("./demo/moku-web/index");

    const app = await createApp();

    // Type-level: app.router has navigate and current methods
    expectTypeOf(app.router).toHaveProperty("navigate");
    expectTypeOf(app.router).toHaveProperty("current");

    // Runtime: API methods are accessible
    expect(app.router.current).toBeTypeOf("function");
    expect(app.router.navigate).toBeTypeOf("function");

    // @ts-expect-error -- app.router does not expose internal state
    expect(app.router.currentPath).toBeUndefined();
  });

  it("app.require works the same as ctx.require at app level", async () => {
    const { createApp } = await import("./demo/moku-web/index");

    const app = await createApp();

    const routerApi = app.require("router");
    expect(routerApi).toBeDefined();
    expect(routerApi.current()).toBeDefined();
  });
});
