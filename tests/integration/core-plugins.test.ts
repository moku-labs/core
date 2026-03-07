import { describe, expect, it } from "vitest";

import { createCoreConfig, createCorePlugin } from "../../src";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function createLogPlugin() {
  return createCorePlugin("log", {
    config: { level: "info" },
    createState: () => ({ entries: [] as string[] }),
    api: ctx => ({
      info: (msg: string) => {
        ctx.state.entries.push(`[${ctx.config.level}] ${msg}`);
      },
      getEntries: () => ctx.state.entries
    })
  });
}

function createEnvPlugin() {
  return createCorePlugin("env", {
    config: { nodeEnv: "development" },
    api: ctx => ({
      isDev: () => ctx.config.nodeEnv === "development",
      getEnv: () => ctx.config.nodeEnv
    })
  });
}

// ---------------------------------------------------------------------------
// Core plugin API injection on regular plugin context
// ---------------------------------------------------------------------------

describe("core plugin API injection", () => {
  it("regular plugins can access core plugin APIs on context", () => {
    const log = createLogPlugin();
    const env = createEnvPlugin();

    // Let inference capture CorePlugins tuple — do NOT specify explicit generics
    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log, env]
    });

    let logAvailable = false;
    let envAvailable = false;

    const probe = cc.createPlugin("probe", {
      onInit: ctx => {
        logAvailable = typeof ctx.log.info === "function";
        envAvailable = typeof ctx.env.isDev === "function";
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    createApp();

    expect(logAvailable).toBe(true);
    expect(envAvailable).toBe(true);
  });

  it("core plugin APIs work correctly from regular plugin context", () => {
    const log = createLogPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log]
    });

    const writer = cc.createPlugin("writer", {
      onInit: ctx => {
        ctx.log.info("hello from writer");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [writer] });
    const app = createApp();

    expect(app.log.getEntries()).toEqual(["[info] hello from writer"]);
  });

  it("core APIs are available in api, onInit, and onStart callbacks", async () => {
    const log = createLogPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log]
    });

    const phases: string[] = [];

    const probe = cc.createPlugin("probe", {
      api: ctx => {
        if (ctx.log) phases.push("api");
        return { noop: () => {} };
      },
      onInit: ctx => {
        if (ctx.log) phases.push("onInit");
      },
      onStart: ctx => {
        if (ctx.log) phases.push("onStart");
      },
      hooks: ctx => ({
        "test:event": () => {
          if (ctx.log) phases.push("hooks");
        }
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    const app = createApp();
    await app.start();

    expect(phases).toContain("api");
    expect(phases).toContain("onInit");
    expect(phases).toContain("onStart");
  });
});

// ---------------------------------------------------------------------------
// Core plugin APIs on app object
// ---------------------------------------------------------------------------

describe("core plugin APIs on app object", () => {
  it("core plugin APIs are mounted on the app object", () => {
    const log = createLogPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    expect(app.log).toBeDefined();
    expect(typeof app.log.info).toBe("function");
    expect(typeof app.log.getEntries).toBe("function");
  });

  it("app.has returns true for core plugins", () => {
    const log = createLogPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    expect(app.has("log")).toBe(true);
  });

  it("core plugin APIs are accessible directly, not via require", () => {
    const log = createLogPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    // Core plugins are accessed directly on the app object, not through require
    expect(typeof app.log.info).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Core plugin config resolution (4-level merge)
// ---------------------------------------------------------------------------

describe("core plugin config resolution", () => {
  it("uses core plugin spec defaults when no overrides", () => {
    const log = createLogPlugin(); // defaults: { level: "info" }

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    // Default level is "info"
    app.log.info("test");
    expect(app.log.getEntries()).toEqual(["[info] test"]);
  });

  it("createCoreConfig pluginConfigs override spec defaults (level 2)", () => {
    const log = createLogPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log],
      pluginConfigs: { log: { level: "debug" } }
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    app.log.info("test");
    expect(app.log.getEntries()).toEqual(["[debug] test"]);
  });

  it("createCore pluginConfigs override createCoreConfig (level 3)", () => {
    const log = createLogPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log],
      pluginConfigs: { log: { level: "debug" } }
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [],
      pluginConfigs: { log: { level: "warn" } }
    });
    const app = createApp();

    app.log.info("test");
    expect(app.log.getEntries()).toEqual(["[warn] test"]);
  });

  it("createApp pluginConfigs override all previous levels (level 4)", () => {
    const log = createLogPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log],
      pluginConfigs: { log: { level: "debug" } }
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [],
      pluginConfigs: { log: { level: "warn" } }
    });
    const app = createApp({
      pluginConfigs: { log: { level: "error" } }
    });

    app.log.info("test");
    expect(app.log.getEntries()).toEqual(["[error] test"]);
  });

  it("core plugin configs are frozen", () => {
    let configFrozen = false;
    const plugin = createCorePlugin("probe", {
      config: { x: 1 },
      api: ctx => {
        configFrozen = Object.isFrozen(ctx.config);
        return {};
      }
    });

    const cc = createCoreConfig("test", {
      config: {},
      plugins: [plugin]
    });
    const { createApp } = cc.createCore(cc, { plugins: [] });
    createApp();

    expect(configFrozen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Core plugin state
// ---------------------------------------------------------------------------

describe("core plugin state", () => {
  it("createState receives config context", () => {
    let receivedConfig: unknown;

    const plugin = createCorePlugin("probe", {
      config: { x: 42 },
      createState: ctx => {
        receivedConfig = ctx.config;
        return {};
      }
    });

    const cc = createCoreConfig("test", {
      config: {},
      plugins: [plugin]
    });
    const { createApp } = cc.createCore(cc, { plugins: [] });
    createApp();

    expect(receivedConfig).toEqual({ x: 42 });
  });

  it("state is mutable via core plugin context", () => {
    const counter = createCorePlugin("counter", {
      createState: () => ({ count: 0 }),
      api: ctx => ({
        increment: () => {
          ctx.state.count += 1;
        },
        getCount: () => ctx.state.count
      })
    });

    const cc = createCoreConfig("test", {
      config: {},
      plugins: [counter]
    });
    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    expect(app.counter.getCount()).toBe(0);
    app.counter.increment();
    app.counter.increment();
    expect(app.counter.getCount()).toBe(2);
  });

  it("plugins without createState get empty object state", () => {
    let stateValue: unknown;

    const plugin = createCorePlugin("probe", {
      api: ctx => {
        stateValue = ctx.state;
        return {};
      }
    });

    const cc = createCoreConfig("test", {
      config: {},
      plugins: [plugin]
    });
    const { createApp } = cc.createCore(cc, { plugins: [] });
    createApp();

    expect(stateValue).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Core plugin lifecycle ordering
// ---------------------------------------------------------------------------

describe("core plugin lifecycle ordering", () => {
  it("core onInit runs before regular onInit", () => {
    const order: string[] = [];

    const coreLog = createCorePlugin("log", {
      onInit: () => {
        order.push("core:init");
      }
    });

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [coreLog]
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

  it("core onStart runs before regular onStart", async () => {
    const order: string[] = [];

    const coreLog = createCorePlugin("log", {
      onStart: () => {
        order.push("core:start");
      }
    });

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [coreLog]
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

  it("regular onStop runs before core onStop", async () => {
    const order: string[] = [];

    const coreLog = createCorePlugin("log", {
      onStop: () => {
        order.push("core:stop");
      }
    });

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [coreLog]
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

    const coreLog = createCorePlugin("log", {
      onInit: () => {
        order.push("core:init");
      },
      onStart: () => {
        order.push("core:start");
      },
      onStop: () => {
        order.push("core:stop");
      }
    });

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [coreLog]
    });

    const regular = cc.createPlugin("regular", {
      onInit: () => {
        order.push("regular:init");
      },
      onStart: () => {
        order.push("regular:start");
      },
      onStop: () => {
        order.push("regular:stop");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [regular] });
    const app = createApp();
    await app.start();
    await app.stop();

    expect(order).toEqual([
      "core:init",
      "regular:init",
      "core:start",
      "regular:start",
      "regular:stop",
      "core:stop"
    ]);
  });

  it("multiple core plugins follow forward init/start and reverse stop", async () => {
    const order: string[] = [];

    const a = createCorePlugin("a", {
      onInit: () => {
        order.push("a:init");
      },
      onStart: () => {
        order.push("a:start");
      },
      onStop: () => {
        order.push("a:stop");
      }
    });
    const b = createCorePlugin("b", {
      onInit: () => {
        order.push("b:init");
      },
      onStart: () => {
        order.push("b:start");
      },
      onStop: () => {
        order.push("b:stop");
      }
    });

    const cc = createCoreConfig("test", {
      config: {},
      plugins: [a, b]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();
    await app.start();
    await app.stop();

    expect(order).toEqual(["a:init", "b:init", "a:start", "b:start", "b:stop", "a:stop"]);
  });

  it("core onStart supports async functions", async () => {
    const order: string[] = [];

    const coreLog = createCorePlugin("log", {
      onStart: async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 10);
        });
        order.push("core:start");
      }
    });

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [coreLog]
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

  it("core onStop supports async functions", async () => {
    const order: string[] = [];

    const coreLog = createCorePlugin("log", {
      onStop: async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 10);
        });
        order.push("core:stop");
      }
    });

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [coreLog]
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
});

// ---------------------------------------------------------------------------
// Core plugin context is minimal
// ---------------------------------------------------------------------------

describe("core plugin context", () => {
  it("core plugin API context has only config and state", () => {
    let contextKeys: string[] = [];

    const plugin = createCorePlugin("probe", {
      config: { x: 1 },
      createState: () => ({ y: 2 }),
      api: ctx => {
        contextKeys = Object.keys(ctx);
        return {};
      }
    });

    const cc = createCoreConfig("test", {
      config: {},
      plugins: [plugin]
    });
    const { createApp } = cc.createCore(cc, { plugins: [] });
    createApp();

    expect(contextKeys).toContain("config");
    expect(contextKeys).toContain("state");
    expect(contextKeys).not.toContain("global");
    expect(contextKeys).not.toContain("emit");
    expect(contextKeys).not.toContain("require");
    expect(contextKeys).not.toContain("has");
  });

  it("core plugin onInit context has only config and state", () => {
    let contextKeys: string[] = [];

    const plugin = createCorePlugin("probe", {
      onInit: ctx => {
        contextKeys = Object.keys(ctx);
      }
    });

    const cc = createCoreConfig("test", {
      config: {},
      plugins: [plugin]
    });
    const { createApp } = cc.createCore(cc, { plugins: [] });
    createApp();

    expect(contextKeys).toContain("config");
    expect(contextKeys).toContain("state");
    expect(contextKeys).not.toContain("global");
    expect(contextKeys).not.toContain("emit");
  });
});

// ---------------------------------------------------------------------------
// Validation: name conflicts
// ---------------------------------------------------------------------------

describe("core plugin name conflict detection", () => {
  it("throws when regular plugin name matches core plugin name", () => {
    const coreLog = createCorePlugin("log", {
      api: () => ({ info: () => {} })
    });

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [coreLog]
    });

    const conflicting = cc.createPlugin("log", {});

    expect(() => {
      const { createApp } = cc.createCore(cc, { plugins: [conflicting] });
      createApp();
    }).toThrow(TypeError);

    expect(() => {
      const { createApp } = cc.createCore(cc, { plugins: [conflicting] });
      createApp();
    }).toThrow("conflicts with core plugin");
  });
});

// ---------------------------------------------------------------------------
// No core plugins (backward compatibility)
// ---------------------------------------------------------------------------

describe("backward compatibility without core plugins", () => {
  it("createCoreConfig works without plugins option", () => {
    const cc = createCoreConfig("test", {
      config: { siteName: "Test" }
    });

    const plugin = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    const app = createApp();

    expect(app.router.current()).toBe("/");
  });

  it("regular plugin context has no extra core API properties", () => {
    let contextKeys: string[] = [];

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" }
    });

    const probe = cc.createPlugin("probe", {
      onInit: ctx => {
        contextKeys = Object.keys(ctx);
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    createApp();

    // Standard context keys only — no extra core API injections
    expect(contextKeys).toEqual(
      expect.arrayContaining(["global", "config", "state", "emit", "require", "has"])
    );
    expect(contextKeys).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Multiple core plugins
// ---------------------------------------------------------------------------

describe("multiple core plugins", () => {
  it("all core plugin APIs are injected on regular plugin context", () => {
    const log = createLogPlugin();
    const env = createEnvPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log, env]
    });

    let hasLog = false;
    let hasEnv = false;

    const probe = cc.createPlugin("probe", {
      onInit: ctx => {
        hasLog = typeof ctx.log.info === "function";
        hasEnv = typeof ctx.env.isDev === "function";
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    createApp();

    expect(hasLog).toBe(true);
    expect(hasEnv).toBe(true);
  });

  it("all core plugin APIs are mounted on app", () => {
    const log = createLogPlugin();
    const env = createEnvPlugin();

    const cc = createCoreConfig("test", {
      config: { siteName: "Test" },
      plugins: [log, env]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    expect(app.log).toBeDefined();
    expect(app.env).toBeDefined();
    expect(app.env.isDev()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Core plugin without API
// ---------------------------------------------------------------------------

describe("core plugin without API", () => {
  it("core plugin without api still runs lifecycle", async () => {
    const order: string[] = [];

    const noApi = createCorePlugin("lifecycle-only", {
      onInit: () => {
        order.push("init");
      },
      onStart: () => {
        order.push("start");
      },
      onStop: () => {
        order.push("stop");
      }
    });

    const cc = createCoreConfig("test", {
      config: {},
      plugins: [noApi]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp();

    expect(order).toEqual(["init"]);

    await app.start();
    expect(order).toEqual(["init", "start"]);

    await app.stop();
    expect(order).toEqual(["init", "start", "stop"]);
  });

  it("core plugin without api is registered but not mounted as API", () => {
    const noApi = createCorePlugin("invisible", {});

    const cc = createCoreConfig("test", {
      config: {},
      plugins: [noApi]
    });

    let contextKeys: string[] = [];
    const probe = cc.createPlugin("probe", {
      onInit: ctx => {
        contextKeys = Object.keys(ctx);
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    const app = createApp();

    expect(contextKeys).not.toContain("invisible");
    expect(app.has("invisible")).toBe(true); // registered but no API
  });
});
