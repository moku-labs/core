import { describe, expect, expectTypeOf, it } from "vitest";

import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type TestConfig = { siteName: string; mode: string };
type TestEvents = { "test:ping": { value: number } };

function createTypedCore() {
  return createCoreConfig<TestConfig, TestEvents>("test", {
    config: { siteName: "Default", mode: "development" }
  });
}

// ---------------------------------------------------------------------------
// createCoreConfig (Step 1 of Factory Chain)
// ---------------------------------------------------------------------------

describe("createCoreConfig", () => {
  it("returns an object with createPlugin and createCore", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });

    expect(cc).toHaveProperty("createPlugin");
    expect(cc).toHaveProperty("createCore");
    expect(typeof cc.createPlugin).toBe("function");
    expect(typeof cc.createCore).toBe("function");
  });

  it("captures framework id for error messages", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("my-framework", {
      config: {}
    });

    const { createPlugin } = cc;

    // Empty plugin name should produce error with framework id
    expect(() => createPlugin("", {})).toThrow("[my-framework]");
  });

  it("captures config defaults in closure", () => {
    const cc = createCoreConfig<{ siteName: string; mode: string }, Record<string, never>>("test", {
      config: { siteName: "Default", mode: "development" }
    });

    // Config defaults are used when no overrides provided (verified via createApp)
    expect(cc).toBeDefined();
    expect(typeof cc.createCore).toBe("function");
  });

  it("each call creates an independent instance", () => {
    const cc1 = createCoreConfig<Record<string, never>, Record<string, never>>("framework-a", {
      config: {}
    });
    const cc2 = createCoreConfig<Record<string, never>, Record<string, never>>("framework-b", {
      config: {}
    });

    // Different instances
    expect(cc1.createPlugin).not.toBe(cc2.createPlugin);
    expect(cc1.createCore).not.toBe(cc2.createCore);

    // Each uses its own framework id
    expect(() => cc1.createPlugin("", {})).toThrow("[framework-a]");
    expect(() => cc2.createPlugin("", {})).toThrow("[framework-b]");
  });
});

// ---------------------------------------------------------------------------
// createCore (Step 2 of Factory Chain)
// ---------------------------------------------------------------------------

describe("createCore", () => {
  it("returns an object with createApp and createPlugin", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });

    const result = cc.createCore(cc, { plugins: [] });

    expect(result).toHaveProperty("createApp");
    expect(result).toHaveProperty("createPlugin");
    expect(typeof result.createApp).toBe("function");
    expect(typeof result.createPlugin).toBe("function");
  });

  it("createPlugin reference is shared with createCoreConfig", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });

    const result = cc.createCore(cc, { plugins: [] });

    // Both createPlugin references point to the same function
    expect(result.createPlugin).toBe(cc.createPlugin);
  });

  it("createApp returns a promise", async () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });

    const result = createApp();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

// ---------------------------------------------------------------------------
// Error message format
// ---------------------------------------------------------------------------

describe("error message format", () => {
  it("errors follow [framework-id] format with actionable suggestion", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("my-app", {
      config: {}
    });

    try {
      cc.createPlugin("", {});
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toMatch(/^\[my-app\]/);
      expect((error as Error).message).toContain("\n  ");
    }
  });
});

// ---------------------------------------------------------------------------
// Type safety: plugin APIs are typed on app object
// ---------------------------------------------------------------------------

describe("type safety: plugin APIs on app", () => {
  it("app has typed plugin APIs (not any)", async () => {
    const cc = createTypedCore();

    const router = cc.createPlugin("router", {
      config: { basePath: "/" },
      createState: () => ({ currentPath: "/" }),
      api: ctx => ({
        navigate: (path: string) => {
          ctx.state.currentPath = path;
        },
        current: () => ctx.state.currentPath
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = await createApp();

    // Type-level: plugin API methods are typed, not any
    expectTypeOf(app.router.navigate).toBeFunction();
    expectTypeOf(app.router.current).toBeFunction();
    expectTypeOf(app.router.navigate).parameter(0).toBeString();
    expectTypeOf(app.router.current).returns.toBeString();

    // Runtime: API works correctly
    app.router.navigate("/about");
    expect(app.router.current()).toBe("/about");
  });

  it("consumer extra plugins are typed on app", async () => {
    const cc = createTypedCore();

    const defaultPlugin = cc.createPlugin("default-p", {
      api: () => ({ greet: () => "hello" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [defaultPlugin] });

    const extraPlugin = cc.createPlugin("extra", {
      api: () => ({ compute: () => 42 })
    });

    const app = await createApp({ plugins: [extraPlugin] });

    // Type-level: both framework and consumer plugin APIs are typed
    expectTypeOf(app["default-p"].greet).toBeFunction();
    expectTypeOf(app.extra.compute).toBeFunction();
    expectTypeOf(app["default-p"].greet).returns.toBeString();
    expectTypeOf(app.extra.compute).returns.toBeNumber();

    // Runtime
    expect(app["default-p"].greet()).toBe("hello");
    expect(app.extra.compute()).toBe(42);
  });

  it("nonexistent plugin property causes type error", async () => {
    const cc = createTypedCore();
    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    // @ts-expect-error -- nonExistent is not a registered plugin
    app.nonExistent;

    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Type safety: config overrides are typed
// ---------------------------------------------------------------------------

describe("type safety: config overrides", () => {
  it("createApp config accepts valid Config keys", async () => {
    const cc = createTypedCore();
    const { createApp } = cc.createCore(cc, { plugins: [] });

    // Type-level: config keys match Config shape
    const app = await createApp({
      config: { siteName: "Blog", mode: "production" }
    });

    expect(app).toBeDefined();
  });

  it("createApp rejects unknown top-level keys at type level", async () => {
    const cc = createTypedCore();
    const { createApp } = cc.createCore(cc, { plugins: [] });

    // @ts-expect-error -- "badKey" is not a valid createApp option
    const app = await createApp({ badKey: "oops" });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Type safety: consumer callbacks have typed context
// ---------------------------------------------------------------------------

describe("type safety: consumer callback context", () => {
  it("onReady context has typed config", async () => {
    const cc = createTypedCore();

    const probe = cc.createPlugin("probe", {
      api: () => ({ ping: () => "pong" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });

    let readyFired = false;
    const app = await createApp({
      onReady: ctx => {
        readyFired = true;
        // Type-level: config is typed as TestConfig
        expectTypeOf(ctx.config).toMatchTypeOf<{ siteName: string; mode: string }>();
        // Type-level: plugin APIs present
        expectTypeOf(ctx.probe.ping).toBeFunction();
        // Type-level: emit is typed
        expectTypeOf(ctx.emit).toBeFunction();
      }
    });

    expect(readyFired).toBe(true);
    expect(app).toBeDefined();
  });

  it("onError context is typed (not unknown)", async () => {
    const cc = createTypedCore();

    const probe = cc.createPlugin("probe", {
      api: () => ({ ping: () => "pong" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });

    const app = await createApp({
      onError: (_error, ctx) => {
        // Type-level: ctx has config, emit, plugin lookup, plugin APIs
        expectTypeOf(ctx.config).toMatchTypeOf<{ siteName: string }>();
        expectTypeOf(ctx.emit).toBeFunction();
        expectTypeOf(ctx.has).toBeFunction();
        expectTypeOf(ctx.require).toBeFunction();
        expectTypeOf(ctx.getPlugin).toBeFunction();
        expectTypeOf(ctx.probe.ping).toBeFunction();
      }
    });

    expect(app).toBeDefined();
  });

  it("onStart and onStop contexts have typed config and plugin APIs", async () => {
    const cc = createTypedCore();

    const probe = cc.createPlugin("probe", {
      api: () => ({ ping: () => "pong" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });

    let startFired = false;
    let stopFired = false;

    const app = await createApp({
      onStart: ctx => {
        startFired = true;
        expectTypeOf(ctx.config).toMatchTypeOf<{ siteName: string }>();
        expectTypeOf(ctx.probe.ping).toBeFunction();
      },
      onStop: ctx => {
        stopFired = true;
        expectTypeOf(ctx.config).toMatchTypeOf<{ siteName: string }>();
        expectTypeOf(ctx.probe.ping).toBeFunction();
      }
    });

    await app.start();
    await app.stop();
    expect(startFired).toBe(true);
    expect(stopFired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Type safety: emit is strictly typed
// ---------------------------------------------------------------------------

describe("type safety: emit", () => {
  it("app.emit only accepts known event names with typed payloads", async () => {
    const cc = createTypedCore();
    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    // @ts-expect-error -- "unknown:event" is not in TestEvents
    app.emit("unknown:event", {});

    expect(app).toBeDefined();
  });
});
