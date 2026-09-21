import { describe, expect, expectTypeOf, it } from "vitest";
import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal core where lifecycle order is tracked via a shared array.
 * Each plugin pushes "{name}:{phase}" into `order` at onInit/onStart/onStop.
 */
function createTrackingPlugin(
  coreCreatePlugin: ReturnType<typeof createCoreConfig>["createPlugin"],
  name: string,
  order: string[]
) {
  return coreCreatePlugin(name, {
    onInit: () => {
      order.push(`${name}:init`);
    },
    onStart: () => {
      order.push(`${name}:start`);
    },
    onStop: () => {
      order.push(`${name}:stop`);
    }
  });
}

// ---------------------------------------------------------------------------
// 3-Layer Flow (SAND-04)
// ---------------------------------------------------------------------------

describe("3-layer flow (SAND-04)", () => {
  it("framework config.ts -> framework index.ts -> consumer main.ts", async () => {
    const { createApp } = await import("./demo/framework/index");

    const app = createApp();

    expect(app).toBeDefined();
    expect(app.router).toBeDefined();
    expect(app.renderer).toBeDefined();
    expect(app.seo).toBeDefined();
    expect(app.sitemap).toBeDefined();
  });

  it("consumer can add extra plugins via createApp", async () => {
    const { createApp, createPlugin } = await import("./demo/framework/index");

    const blogPlugin = createPlugin("blog", {
      api: () => ({ list: () => [] })
    });

    const app = createApp({ plugins: [blogPlugin] });

    expect(app.blog).toBeDefined();
    expect(app.router).toBeDefined();
  });

  it("cross-file import chain preserves types", async () => {
    const { createApp } = await import("./demo/framework/index");

    const app = createApp({ config: { siteName: "Test Blog" } });

    // Verify specific API methods are typed (would FAIL on `any`)
    expectTypeOf(app.router.navigate).toBeFunction();
    expectTypeOf(app.router.current).toBeFunction();
    expectTypeOf(app.start).toBeFunction();
    expectTypeOf(app.stop).toBeFunction();
  });
});

// ---------------------------------------------------------------------------
// Lifecycle Execution Order
// ---------------------------------------------------------------------------

describe("lifecycle execution order", () => {
  it("onInit runs during createApp (all plugins initialized)", async () => {
    const order: string[] = [];

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const a = cc.createPlugin("a", {
      onInit: () => {
        order.push("A:init");
      }
    });

    const b = cc.createPlugin("b", {
      onInit: () => {
        order.push("B:init");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    createApp();

    expect(order).toEqual(["A:init", "B:init"]);
  });

  it("onStart runs during app.start() in forward order", async () => {
    const order: string[] = [];

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const a = cc.createPlugin("a", {
      onStart: () => {
        order.push("A:start");
      }
    });

    const b = cc.createPlugin("b", {
      onStart: () => {
        order.push("B:start");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    const app = createApp();
    await app.start();

    expect(order).toEqual(["A:start", "B:start"]);
  });

  it("onStop runs during app.stop() in REVERSE order", async () => {
    const order: string[] = [];

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const a = cc.createPlugin("a", {
      onStop: () => {
        order.push("A:stop");
      }
    });

    const b = cc.createPlugin("b", {
      onStop: () => {
        order.push("B:stop");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    const app = createApp();
    await app.start();
    await app.stop();

    expect(order).toEqual(["B:stop", "A:stop"]);
  });

  it("full lifecycle: init forward, start forward, stop reverse", async () => {
    const order: string[] = [];

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const a = createTrackingPlugin(cc.createPlugin, "a", order);
    const b = createTrackingPlugin(cc.createPlugin, "b", order);
    const c = createTrackingPlugin(cc.createPlugin, "c", order);

    const { createApp } = cc.createCore(cc, { plugins: [a, b, c] });
    const app = createApp();

    expect(order).toEqual(["a:init", "b:init", "c:init"]);

    await app.start();

    expect(order).toEqual(["a:init", "b:init", "c:init", "a:start", "b:start", "c:start"]);

    await app.stop();

    expect(order).toEqual([
      "a:init",
      "b:init",
      "c:init",
      "a:start",
      "b:start",
      "c:start",
      "c:stop",
      "b:stop",
      "a:stop"
    ]);
  });

  it("createState receives MinimalContext (global + config only)", async () => {
    let capturedCtx: Record<string, unknown> = {};

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const plugin = cc.createPlugin("probe", {
      config: { debug: true },
      createState: ctx => {
        capturedCtx = { ...ctx };

        // Type-level: MinimalContext has global and config
        expectTypeOf(ctx.global).toMatchTypeOf<{ siteName: string }>();
        expectTypeOf(ctx.config).toMatchTypeOf<{ debug: boolean }>();

        // @ts-expect-error -- createState ctx has no emit
        expect(ctx.emit).toBeUndefined();

        // @ts-expect-error -- createState ctx has no require
        expect(ctx.require).toBeUndefined();

        // @ts-expect-error -- createState ctx has no state
        expect(ctx.state).toBeUndefined();

        return { initialized: true };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    createApp();

    // Runtime: MinimalContext has global and config
    expect(capturedCtx).toHaveProperty("global");
    expect(capturedCtx).toHaveProperty("config");

    // Runtime: MinimalContext does NOT have emit, require, state
    expect(capturedCtx).not.toHaveProperty("emit");
    expect(capturedCtx).not.toHaveProperty("require");
    expect(capturedCtx).not.toHaveProperty("state");
  });

  it("onStop receives TeardownContext (global, own config, own state)", async () => {
    let capturedCtx: Record<string, unknown> = {};

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const plugin = cc.createPlugin("probe", {
      config: { retries: 3 },
      createState: () => ({ open: true }),
      onStop: ctx => {
        capturedCtx = { ...ctx };

        // Type-level: global, the plugin's own config and its own state
        expectTypeOf(ctx.global).toMatchTypeOf<{ siteName: string }>();
        expectTypeOf(ctx.config).toMatchTypeOf<{ retries: number }>();
        expectTypeOf(ctx.state).toMatchTypeOf<{ open: boolean }>();

        // @ts-expect-error -- onStop ctx has no emit: other plugins may already be stopped
        expect(ctx.emit).toBeUndefined();

        // @ts-expect-error -- onStop ctx has no require: other plugins may already be stopped
        expect(ctx.require).toBeUndefined();
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    const app = createApp();
    await app.start();
    await app.stop();

    // Runtime: TeardownContext has global, config and state
    expect(capturedCtx).toHaveProperty("global");
    expect(capturedCtx).toHaveProperty("config", { retries: 3 });
    expect(capturedCtx).toHaveProperty("state", { open: true });

    // Runtime: TeardownContext has NO communication methods
    expect(capturedCtx).not.toHaveProperty("emit");
    expect(capturedCtx).not.toHaveProperty("require");
    expect(capturedCtx).not.toHaveProperty("has");
  });
});

// ---------------------------------------------------------------------------
// Config Resolution
// ---------------------------------------------------------------------------

describe("config resolution", () => {
  it("config defaults are used when no overrides provided", async () => {
    let capturedGlobal: Record<string, unknown> = {};

    const cc = createCoreConfig<
      { siteName: string; mode: "development" | "production" },
      Record<string, never>
    >("test", {
      config: { siteName: "Untitled", mode: "development" }
    });

    const probe = cc.createPlugin("probe", {
      onInit: ctx => {
        capturedGlobal = { ...ctx.global };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    createApp();

    expect(capturedGlobal.siteName).toBe("Untitled");
    expect(capturedGlobal.mode).toBe("development");
  });

  it("consumer config overrides merge with defaults (shallow merge)", async () => {
    let capturedGlobal: Record<string, unknown> = {};

    const cc = createCoreConfig<
      { siteName: string; mode: "development" | "production" },
      Record<string, never>
    >("test", {
      config: { siteName: "Untitled", mode: "development" }
    });

    const probe = cc.createPlugin("probe", {
      onInit: ctx => {
        capturedGlobal = { ...ctx.global };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    createApp({ config: { siteName: "Blog", mode: "production" } });

    expect(capturedGlobal.siteName).toBe("Blog");
    expect(capturedGlobal.mode).toBe("production");
  });

  it("plugin config overrides merge with plugin defaults", async () => {
    let capturedConfig: Record<string, unknown> = {};

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const router = cc.createPlugin("router", {
      config: { basePath: "/", trailingSlash: false },
      onInit: ctx => {
        capturedConfig = { ...ctx.config };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    createApp({ pluginConfigs: { router: { basePath: "/blog" } } });

    expect(capturedConfig.basePath).toBe("/blog");
    expect(capturedConfig.trailingSlash).toBe(false);
  });

  it("resolved config is frozen", async () => {
    let globalFrozen = false;
    let configFrozen = false;
    let assignmentThrew = false;

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const probe = cc.createPlugin("probe", {
      config: { debug: true },
      onInit: ctx => {
        globalFrozen = Object.isFrozen(ctx.global);
        configFrozen = Object.isFrozen(ctx.config);

        // Assignment to frozen config throws TypeError in strict mode (ESM)
        try {
          // @ts-expect-error -- global config is readonly
          ctx.global.siteName = "new";
        } catch {
          assignmentThrew = true;
        }
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    createApp();

    expect(globalFrozen).toBe(true);
    expect(configFrozen).toBe(true);
    expect(assignmentThrew).toBe(true);
  });
});
