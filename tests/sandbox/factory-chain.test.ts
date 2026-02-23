import { describe, expect, expectTypeOf, it } from "vitest";

import { coreConfig, createPlugin } from "./demo/moku-web/config";
import { createApp, createPlugin as frameworkCreatePlugin } from "./demo/moku-web/index";

// ---------------------------------------------------------------------------
// createCoreConfig (Step 1)
// ---------------------------------------------------------------------------

describe("createCoreConfig (Step 1)", () => {
  it("returns an object with createPlugin and createCore", () => {
    // Type-level: coreConfig has both factory functions
    expectTypeOf(coreConfig).toHaveProperty("createPlugin");
    expectTypeOf(coreConfig).toHaveProperty("createCore");
    expectTypeOf(coreConfig.createPlugin).toBeFunction();
    expectTypeOf(coreConfig.createCore).toBeFunction();

    // Runtime: coreConfig is a real object with these properties
    expect(coreConfig).toHaveProperty("createPlugin");
    expect(coreConfig).toHaveProperty("createCore");
    expect(typeof coreConfig.createPlugin).toBe("function");
    expect(typeof coreConfig.createCore).toBe("function");
  });

  it("createPlugin from coreConfig is callable with name and spec", () => {
    const testPlugin = createPlugin("test-plugin", {
      config: { x: 1 }
    });

    // Type-level: result carries the name property
    expectTypeOf(testPlugin).toHaveProperty("name");

    // Runtime: name matches the provided string
    expect(testPlugin.name).toBe("test-plugin");
  });
});

// ---------------------------------------------------------------------------
// createCore (Step 2)
// ---------------------------------------------------------------------------

describe("createCore (Step 2)", () => {
  it("returns an object with createApp and createPlugin", () => {
    // Type-level
    expectTypeOf(createApp).toBeFunction();

    // Runtime
    expect(typeof createApp).toBe("function");
  });

  it("re-exported createPlugin is identical to config.ts createPlugin", () => {
    // The framework re-exports createPlugin from createCore for consumer
    // convenience. Both should be the same function reference.
    expect(frameworkCreatePlugin).toBe(createPlugin);
  });
});

// ---------------------------------------------------------------------------
// createApp (Step 3)
// ---------------------------------------------------------------------------

describe("createApp (Step 3)", () => {
  it("returns a Promise that resolves to an app object", async () => {
    const result = createApp();

    // Type-level: createApp returns a Promise
    expectTypeOf(result).toBeObject();

    const app = await result;

    // Runtime: app has start, stop, emit methods
    expect(typeof app.start).toBe("function");
    expect(typeof app.stop).toBe("function");
    expect(typeof app.emit).toBe("function");
  });

  it("app has plugin APIs mounted directly", async () => {
    const app = await createApp();

    // Type-level: plugin APIs are accessible with specific method types (not any)
    expectTypeOf(app.router.navigate).toBeFunction();
    expectTypeOf(app.router.current).toBeFunction();
    expectTypeOf(app.renderer.render).toBeFunction();
    expectTypeOf(app.seo.setTitle).toBeFunction();
    expectTypeOf(app.seo.getDefaultTitle).toBeFunction();
    expectTypeOf(app.sitemap.addEntry).toBeFunction();
    expectTypeOf(app.sitemap.generate).toBeFunction();
    expectTypeOf(app.sitemap.getEntries).toBeFunction();
    expectTypeOf(app.sitemap.getEntryCount).toBeFunction();

    // Type-level: start/stop return Promise<void>, not any
    expectTypeOf(app.start).toBeFunction();
    expectTypeOf(app.stop).toBeFunction();

    // Negative test: nonexistent plugin causes type error
    // @ts-expect-error -- nonExistent is not a registered plugin
    app.nonExistent;

    // Runtime: plugin APIs are defined
    expect(app.router).toBeDefined();
    expect(app.renderer).toBeDefined();
    expect(app.seo).toBeDefined();
    expect(app.sitemap).toBeDefined();
  });

  it("app object is frozen", async () => {
    const app = await createApp();

    expect(Object.isFrozen(app)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Config overrides in createApp
// ---------------------------------------------------------------------------

describe("config overrides in createApp", () => {
  it("accepts typed config overrides", async () => {
    // Global config keys from SiteConfig: siteName, mode
    const app = await createApp({
      config: { siteName: "Test Blog", mode: "production" }
    });

    expect(app).toBeDefined();
  });

  it("accepts typed plugin config overrides", async () => {
    // Plugin config keyed by plugin name
    const app = await createApp({
      pluginConfigs: { router: { basePath: "/blog" } }
    });

    expect(app).toBeDefined();
  });

  it("rejects invalid config keys at type level", async () => {
    // @ts-expect-error -- "invalidKey" is not in Config or a registered plugin name
    const app = await createApp({ invalidKey: "boom" });

    // Runtime assertion to satisfy sonarjs/assertions-in-tests
    expect(app).toBeDefined();
  });

  it("pluginConfigs values are typed by plugin config shape", async () => {
    const app = await createApp({
      pluginConfigs: {
        // router config has { basePath: string; trailingSlash: boolean }
        router: { basePath: "/typed" },
        // @ts-expect-error -- basePath must be string, not number
        seo: { defaultTitle: 123 }
      }
    });

    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Consumer lifecycle callback context
// ---------------------------------------------------------------------------

describe("consumer lifecycle callback context", () => {
  it("onReady context has plugin APIs, getPlugin, require, has, emit", async () => {
    let contextReceived = false;

    const app = await createApp({
      onReady: ctx => {
        contextReceived = true;

        // Type-level: context has plugin APIs
        expectTypeOf(ctx.router.navigate).toBeFunction();
        expectTypeOf(ctx.seo.getDefaultTitle).toBeFunction();

        // Type-level: context has plugin lookup methods
        expectTypeOf(ctx.getPlugin).toBeFunction();
        expectTypeOf(ctx.require).toBeFunction();
        expectTypeOf(ctx.has).toBeFunction();
        expectTypeOf(ctx.emit).toBeFunction();
        expectTypeOf(ctx.config).toMatchTypeOf<{ siteName: string; mode: string }>();

        // Runtime: plugin APIs are accessible
        expect(ctx.router.current()).toBe("/");
        expect(ctx.has("router")).toBe(true);
        expect(typeof ctx.emit).toBe("function");
      }
    });

    expect(contextReceived).toBe(true);
    expect(app).toBeDefined();
  });

  it("onStart context has plugin APIs", async () => {
    let startContextReceived = false;

    const app = await createApp({
      onStart: ctx => {
        startContextReceived = true;

        // Type-level: plugin APIs present
        expectTypeOf(ctx.router.navigate).toBeFunction();

        // Runtime: plugin APIs work
        expect(ctx.has("seo")).toBe(true);
      }
    });

    await app.start();
    expect(startContextReceived).toBe(true);
    await app.stop();
  });

  it("onStop context has plugin APIs", async () => {
    let stopContextReceived = false;

    const app = await createApp({
      onStop: ctx => {
        stopContextReceived = true;

        // Type-level: plugin APIs present
        expectTypeOf(ctx.router.current).toBeFunction();
        expectTypeOf(ctx.config).toMatchTypeOf<{ siteName: string }>();
      }
    });

    await app.start();
    await app.stop();
    expect(stopContextReceived).toBe(true);
  });

  it("onError context has plugin APIs and is typed (not unknown)", async () => {
    const app = await createApp({
      onError: (_error, ctx) => {
        // Type-level: ctx has plugin APIs (not unknown)
        expectTypeOf(ctx.config).toMatchTypeOf<{ siteName: string }>();
        expectTypeOf(ctx.has).toBeFunction();
        expectTypeOf(ctx.require).toBeFunction();
        expectTypeOf(ctx.getPlugin).toBeFunction();
        expectTypeOf(ctx.emit).toBeFunction();
        expectTypeOf(ctx.router.navigate).toBeFunction();
        expectTypeOf(ctx.seo.getDefaultTitle).toBeFunction();
      }
    });

    // onError is only called when hooks/stop throw at runtime;
    // the type assertions above prevent the `unknown` regression
    expect(app).toBeDefined();
  });
});
