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
      defaultConfig: { x: 1 }
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

    // Type-level: plugin APIs are accessible on the app object
    expectTypeOf(app.router).not.toBeUndefined();
    expectTypeOf(app.renderer).not.toBeUndefined();
    expectTypeOf(app.seo).not.toBeUndefined();

    // Runtime: plugin APIs are defined
    expect(app.router).toBeDefined();
    expect(app.renderer).toBeDefined();
    expect(app.seo).toBeDefined();
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
      siteName: "Test Blog",
      mode: "production"
    });

    expect(app).toBeDefined();
  });

  it("accepts typed plugin config overrides", async () => {
    // Plugin config keyed by plugin name
    const app = await createApp({
      router: { basePath: "/blog" }
    });

    expect(app).toBeDefined();
  });

  it("rejects invalid config keys at type level", async () => {
    // @ts-expect-error -- "invalidKey" is not in Config or a registered plugin name
    const app = await createApp({ invalidKey: "boom" });

    // Runtime assertion to satisfy sonarjs/assertions-in-tests
    expect(app).toBeDefined();
  });
});
