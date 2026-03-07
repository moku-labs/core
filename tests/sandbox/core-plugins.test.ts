import { describe, expect, expectTypeOf, it } from "vitest";

import { createCoreConfig, createCorePlugin } from "../../src";

// =============================================================================
// Core Plugins — Sandbox Tests
// =============================================================================
// End-to-end tests for core plugins through the full 3-step factory chain:
// createCorePlugin → createCoreConfig(plugins) → createCore → createApp
// =============================================================================

// ---------------------------------------------------------------------------
// Shared core plugins
// ---------------------------------------------------------------------------

const logPlugin = createCorePlugin("log", {
  config: { level: "info" as string },
  createState: () => ({ entries: [] as string[] }),
  api: ctx => ({
    info: (msg: string) => {
      ctx.state.entries.push(msg);
    },
    error: (msg: string) => {
      ctx.state.entries.push(`[ERROR] ${msg}`);
    },
    getEntries: () => ctx.state.entries,
    getLevel: () => ctx.config.level
  })
});

const envPlugin = createCorePlugin("env", {
  config: { nodeEnv: "development" as string },
  api: ctx => ({
    isDev: () => ctx.config.nodeEnv === "development",
    isProd: () => ctx.config.nodeEnv === "production",
    get: () => ctx.config.nodeEnv
  })
});

// ---------------------------------------------------------------------------
// Full factory chain with core plugins
// ---------------------------------------------------------------------------

describe("full factory chain with core plugins", () => {
  it("createCoreConfig accepts core plugins and returns createPlugin + createCore", () => {
    const cc = createCoreConfig("test-chain", {
      config: { siteName: "Test" },
      plugins: [logPlugin, envPlugin]
    });

    expectTypeOf(cc).toHaveProperty("createPlugin");
    expectTypeOf(cc).toHaveProperty("createCore");
    expect(typeof cc.createPlugin).toBe("function");
    expect(typeof cc.createCore).toBe("function");
  });

  it("core plugin APIs are typed on regular plugin context", () => {
    const cc = createCoreConfig("test-ctx", {
      config: { siteName: "Test" },
      plugins: [logPlugin, envPlugin]
    });

    const router = cc.createPlugin("router", {
      config: { basePath: "/" },
      api: ctx => ({
        navigate: (path: string) => {
          // Type-level: core APIs are on context
          expectTypeOf(ctx.log.info).toBeFunction();
          expectTypeOf(ctx.log.error).toBeFunction();
          expectTypeOf(ctx.log.getEntries).toBeFunction();
          expectTypeOf(ctx.env.isDev).toBeFunction();
          expectTypeOf(ctx.env.isProd).toBeFunction();

          ctx.log.info(`navigating to ${path}`);
          return path;
        }
      })
    });

    expect(router.name).toBe("router");
  });

  it("app has core APIs mounted on surface", () => {
    const cc = createCoreConfig("test-surface", {
      config: { siteName: "Test" },
      plugins: [logPlugin, envPlugin]
    });

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = createApp();

    // Core APIs on app surface
    expectTypeOf(app.log.info).toBeFunction();
    expectTypeOf(app.log.error).toBeFunction();
    expectTypeOf(app.log.getEntries).returns.toEqualTypeOf<string[]>();
    expectTypeOf(app.env.isDev).returns.toBeBoolean();
    expectTypeOf(app.env.isProd).returns.toBeBoolean();

    // Regular plugin API also on surface
    expectTypeOf(app.router.current).returns.toBeString();

    // Runtime: core APIs work
    app.log.info("hello");
    expect(app.log.getEntries()).toEqual(["hello"]);
    expect(app.env.isDev()).toBe(true);
    expect(app.router.current()).toBe("/");
  });

  it("app.has() recognizes core plugins", () => {
    const cc = createCoreConfig("test-has", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    expect(app.has("log")).toBe(true);
    expect(app.has("nonexistent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Core plugin config resolution
// ---------------------------------------------------------------------------

describe("core plugin config resolution — 4-level cascade", () => {
  it("level 1 (spec defaults): uses 'info' when nothing overrides", () => {
    const cc = createCoreConfig("test-L1", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });
    const app = cc.createCore(cc, { plugins: [] }).createApp();

    expect(app.log.getLevel()).toBe("info");
  });

  it("level 2 (createCoreConfig): 'debug' overrides spec default 'info'", () => {
    const cc = createCoreConfig("test-L2", {
      config: { siteName: "Test" },
      plugins: [logPlugin],
      pluginConfigs: { log: { level: "debug" } }
    });
    const app = cc.createCore(cc, { plugins: [] }).createApp();

    expect(app.log.getLevel()).toBe("debug");
  });

  it("level 3 (createCore): 'warn' overrides L2 'debug'", () => {
    const cc = createCoreConfig("test-L3", {
      config: { siteName: "Test" },
      plugins: [logPlugin],
      pluginConfigs: { log: { level: "debug" } }
    });
    const app = cc
      .createCore(cc, {
        plugins: [],
        pluginConfigs: { log: { level: "warn" } }
      })
      .createApp();

    expect(app.log.getLevel()).toBe("warn");
  });

  it("level 4 (createApp): 'error' overrides L3 'warn'", () => {
    const cc = createCoreConfig("test-L4", {
      config: { siteName: "Test" },
      plugins: [logPlugin],
      pluginConfigs: { log: { level: "debug" } }
    });
    const { createApp } = cc.createCore(cc, {
      plugins: [],
      pluginConfigs: { log: { level: "warn" } }
    });
    const app = createApp({ pluginConfigs: { log: { level: "error" } } });

    expect(app.log.getLevel()).toBe("error");
  });

  it("full cascade: all 4 levels with different values, checked at each step", () => {
    // L1 only — spec default "info"
    const ccL1 = createCoreConfig("cascade-L1", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });
    const appL1 = ccL1.createCore(ccL1, { plugins: [] }).createApp();
    expect(appL1.log.getLevel()).toBe("info");

    // L2 — createCoreConfig sets "debug", overrides L1 "info"
    const ccL2 = createCoreConfig("cascade-L2", {
      config: { siteName: "Test" },
      plugins: [logPlugin],
      pluginConfigs: { log: { level: "debug" } }
    });
    const appL2 = ccL2.createCore(ccL2, { plugins: [] }).createApp();
    expect(appL2.log.getLevel()).toBe("debug");

    // L3 — createCore sets "warn", overrides L2 "debug"
    const ccL3 = createCoreConfig("cascade-L3", {
      config: { siteName: "Test" },
      plugins: [logPlugin],
      pluginConfigs: { log: { level: "debug" } }
    });
    const appL3 = ccL3
      .createCore(ccL3, {
        plugins: [],
        pluginConfigs: { log: { level: "warn" } }
      })
      .createApp();
    expect(appL3.log.getLevel()).toBe("warn");

    // L4 — createApp sets "error", overrides L3 "warn"
    const ccL4 = createCoreConfig("cascade-L4", {
      config: { siteName: "Test" },
      plugins: [logPlugin],
      pluginConfigs: { log: { level: "debug" } }
    });
    const { createApp: createAppL4 } = ccL4.createCore(ccL4, {
      plugins: [],
      pluginConfigs: { log: { level: "warn" } }
    });
    const appL4 = createAppL4({ pluginConfigs: { log: { level: "error" } } });
    expect(appL4.log.getLevel()).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Core plugin lifecycle ordering
// ---------------------------------------------------------------------------

describe("core plugin lifecycle ordering", () => {
  it("core plugin onInit runs before regular plugin onInit", () => {
    const order: string[] = [];

    const tracker = createCorePlugin("tracker", {
      api: () => ({ noop: () => {} }),
      onInit: () => {
        order.push("core:init");
      }
    });

    const cc = createCoreConfig("test-order", {
      config: { siteName: "Test" },
      plugins: [tracker]
    });

    const regular = cc.createPlugin("regular", {
      onInit: () => {
        order.push("regular:init");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [regular] });
    createApp();

    expect(order).toEqual(["core:init", "regular:init"]);
  });

  it("core plugin onStart runs before regular plugin onStart", async () => {
    const order: string[] = [];

    const tracker = createCorePlugin("tracker", {
      api: () => ({ noop: () => {} }),
      onStart: () => {
        order.push("core:start");
      }
    });

    const cc = createCoreConfig("test-start", {
      config: { siteName: "Test" },
      plugins: [tracker]
    });

    const regular = cc.createPlugin("regular", {
      onStart: () => {
        order.push("regular:start");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [regular] });
    const app = createApp();
    await app.start();

    expect(order).toEqual(["core:start", "regular:start"]);
  });

  it("regular plugin onStop runs before core plugin onStop", async () => {
    const order: string[] = [];

    const tracker = createCorePlugin("tracker", {
      api: () => ({ noop: () => {} }),
      onStop: () => {
        order.push("core:stop");
      }
    });

    const cc = createCoreConfig("test-stop", {
      config: { siteName: "Test" },
      plugins: [tracker]
    });

    const regular = cc.createPlugin("regular", {
      onStop: () => {
        order.push("regular:stop");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [regular] });
    const app = createApp();
    await app.start();
    await app.stop();

    expect(order).toEqual(["regular:stop", "core:stop"]);
  });

  it("full lifecycle: core init → regular init → core start → regular start → regular stop → core stop", async () => {
    const order: string[] = [];

    const coreA = createCorePlugin("core-a", {
      api: () => ({ noop: () => {} }),
      onInit: () => {
        order.push("core-a:init");
      },
      onStart: () => {
        order.push("core-a:start");
      },
      onStop: () => {
        order.push("core-a:stop");
      }
    });

    const coreB = createCorePlugin("core-b", {
      api: () => ({ noop: () => {} }),
      onInit: () => {
        order.push("core-b:init");
      },
      onStart: () => {
        order.push("core-b:start");
      },
      onStop: () => {
        order.push("core-b:stop");
      }
    });

    const cc = createCoreConfig("test-full", {
      config: { siteName: "Test" },
      plugins: [coreA, coreB]
    });

    const regA = cc.createPlugin("reg-a", {
      onInit: () => {
        order.push("reg-a:init");
      },
      onStart: () => {
        order.push("reg-a:start");
      },
      onStop: () => {
        order.push("reg-a:stop");
      }
    });

    const regB = cc.createPlugin("reg-b", {
      onInit: () => {
        order.push("reg-b:init");
      },
      onStart: () => {
        order.push("reg-b:start");
      },
      onStop: () => {
        order.push("reg-b:stop");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [regA, regB] });
    const app = createApp();
    await app.start();
    await app.stop();

    expect(order).toEqual([
      "core-a:init",
      "core-b:init",
      "reg-a:init",
      "reg-b:init",
      "core-a:start",
      "core-b:start",
      "reg-a:start",
      "reg-b:start",
      "reg-b:stop",
      "reg-a:stop",
      "core-b:stop",
      "core-a:stop"
    ]);
  });
});

// ---------------------------------------------------------------------------
// Core plugin state management
// ---------------------------------------------------------------------------

describe("core plugin state management", () => {
  it("core plugin state is mutable and persists across API calls", () => {
    const cc = createCoreConfig("test-state", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    app.log.info("first");
    app.log.info("second");
    expect(app.log.getEntries()).toEqual(["first", "second"]);
  });
});

// ---------------------------------------------------------------------------
// Consumer lifecycle callbacks with core APIs
// ---------------------------------------------------------------------------

describe("consumer lifecycle callbacks with core APIs", () => {
  it("onReady context has core APIs", () => {
    let readyReceived = false;

    const cc = createCoreConfig("test-ready", {
      config: { siteName: "Test" },
      plugins: [logPlugin, envPlugin]
    });

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    createApp({
      onReady: ctx => {
        readyReceived = true;

        // Type-level: core APIs on callback context
        expectTypeOf(ctx.log.info).toBeFunction();
        expectTypeOf(ctx.env.isDev).toBeFunction();
        expectTypeOf(ctx.router.current).toBeFunction();

        // Runtime: core APIs work
        ctx.log.info("ready");
        expect(ctx.env.isDev()).toBe(true);
      }
    });

    expect(readyReceived).toBe(true);
  });

  it("onStart context has core APIs", async () => {
    let startReceived = false;

    const cc = createCoreConfig("test-start-cb", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp({
      onStart: ctx => {
        startReceived = true;
        expectTypeOf(ctx.log.info).toBeFunction();
        ctx.log.info("starting");
      }
    });

    await app.start();
    expect(startReceived).toBe(true);
  });

  it("onStop context has core APIs", async () => {
    let stopReceived = false;

    const cc = createCoreConfig("test-stop-cb", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp({
      onStop: ctx => {
        stopReceived = true;
        expectTypeOf(ctx.log.info).toBeFunction();
      }
    });

    await app.start();
    await app.stop();
    expect(stopReceived).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility (no core plugins)
// ---------------------------------------------------------------------------

describe("backward compatibility (no core plugins)", () => {
  it("createCoreConfig without plugins option works unchanged", () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("compat", {
      config: { siteName: "Test" }
    });

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = createApp();

    expect(app.router.current()).toBe("/");
    expectTypeOf(app.router.current).returns.toBeString();
  });
});

// ---------------------------------------------------------------------------
// Regular plugins using core APIs at runtime
// ---------------------------------------------------------------------------

describe("regular plugins using core APIs at runtime", () => {
  it("regular plugin api() can call core plugin methods", () => {
    const cc = createCoreConfig("test-usage", {
      config: { siteName: "Test" },
      plugins: [logPlugin, envPlugin]
    });

    const router = cc.createPlugin("router", {
      config: { basePath: "/" },
      api: ctx => ({
        navigate: (path: string) => {
          ctx.log.info(`navigate: ${path}`);
          if (ctx.env.isDev()) {
            ctx.log.info(`[dev] ${path}`);
          }
          return path;
        }
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = createApp();

    app.router.navigate("/about");
    expect(app.log.getEntries()).toEqual(["navigate: /about", "[dev] /about"]);
  });

  it("regular plugin onInit can call core plugin methods", () => {
    const cc = createCoreConfig("test-init-usage", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    const probe = cc.createPlugin("probe", {
      onInit: ctx => {
        ctx.log.info("probe initialized");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    const app = createApp();

    expect(app.log.getEntries()).toEqual(["probe initialized"]);
  });

  it("regular plugin hooks callback can access core APIs", () => {
    const cc = createCoreConfig("test-hooks", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    type TestEvents = { "test:fired": { value: number } };

    const emitter = cc.createPlugin("emitter", {
      events: register => register.map<TestEvents>(),
      api: ctx => ({
        fire: () => ctx.emit("test:fired", { value: 42 })
      })
    });

    const listener = cc.createPlugin("listener", {
      depends: [emitter],
      hooks: ctx => ({
        "test:fired": payload => {
          ctx.log.info(`received: ${payload.value}`);
        }
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [emitter, listener] });
    const app = createApp();

    app.emitter.fire();
    expect(app.log.getEntries()).toEqual(["received: 42"]);
  });
});

// ---------------------------------------------------------------------------
// Core plugin without API
// ---------------------------------------------------------------------------

describe("core plugin without API", () => {
  it("lifecycle-only core plugin is excluded from context and app surface", () => {
    const lifecycleOnly = createCorePlugin("lifecycle-core", {
      onInit: () => {},
      onStart: () => {},
      onStop: () => {}
    });

    const cc = createCoreConfig("test-no-api", {
      config: { siteName: "Test" },
      plugins: [lifecycleOnly]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    // Lifecycle-only core plugin does NOT appear on app surface
    // @ts-expect-error -- "lifecycle-core" has no API, excluded from BuildCorePluginApis
    app["lifecycle-core"];

    // But it IS registered
    expect(app.has("lifecycle-core")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// App object frozen with core APIs
// ---------------------------------------------------------------------------

describe("app object frozen with core APIs", () => {
  it("app is frozen even with core plugins", () => {
    const cc = createCoreConfig("test-frozen", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    expect(Object.isFrozen(app)).toBe(true);
  });
});
