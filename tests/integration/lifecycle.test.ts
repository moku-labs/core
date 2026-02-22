import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// Full 3-phase lifecycle integration test
// ---------------------------------------------------------------------------

describe("full lifecycle integration", () => {
  it("complete flow: createCoreConfig -> createCore -> createApp -> start -> stop", async () => {
    const order: string[] = [];

    // Step 1: createCoreConfig
    const cc = createCoreConfig<{ siteName: string; mode: string }, Record<string, unknown>>(
      "lifecycle-test",
      {
        config: { siteName: "Integration Test", mode: "test" }
      }
    );

    // Create plugins with full lifecycle tracking
    const database = cc.createPlugin("database", {
      config: { host: "localhost", port: 5432 },
      createState: () => ({ connected: false }),
      api: context => ({
        isConnected: () => context.state.connected
      }),
      onInit: context => {
        order.push("database:init");
        expect(context.config.host).toBe("localhost");
      },
      onStart: context => {
        order.push("database:start");
        context.state.connected = true;
      },
      onStop: () => {
        order.push("database:stop");
      }
    });

    const cache = cc.createPlugin("cache", {
      depends: [database] as const,
      createState: () => ({ entries: 0 }),
      api: context => ({
        getEntries: () => context.state.entries,
        addEntry: () => {
          context.state.entries += 1;
        }
      }),
      onInit: context => {
        order.push("cache:init");
        // Dependency access works during onInit
        const db = context.require(database);
        expect(db).toBeDefined();
      },
      onStart: () => {
        order.push("cache:start");
      },
      onStop: () => {
        order.push("cache:stop");
      }
    });

    const logger = cc.createPlugin("logger", {
      hooks: _ctx => ({
        "app:log": (payload: unknown) => {
          order.push(`logger:hook:${JSON.stringify(payload)}`);
        }
      }),
      onInit: () => {
        order.push("logger:init");
      },
      onStart: () => {
        order.push("logger:start");
      },
      onStop: () => {
        order.push("logger:stop");
      }
    });

    // Step 2: createCore with framework defaults
    const { createApp } = cc.createCore(cc, {
      plugins: [database, cache, logger],
      onReady: () => {
        order.push("onReady");
      }
    });

    // Step 3: createApp (init phase)
    const app = await createApp({
      siteName: "My App",
      database: { port: 3306 }
    });

    // Verify init phase completed
    expect(order).toEqual(["database:init", "cache:init", "logger:init", "onReady"]);

    // Verify app structure
    expect(Object.isFrozen(app)).toBe(true);
    expect(typeof app.start).toBe("function");
    expect(typeof app.stop).toBe("function");
    expect(typeof app.emit).toBe("function");
    expect(app.has("database")).toBe(true);
    expect(app.has("cache")).toBe(true);
    expect(app.has("logger")).toBe(true);

    // Start phase
    await app.start();

    expect(order).toEqual([
      "database:init",
      "cache:init",
      "logger:init",
      "onReady",
      "database:start",
      "cache:start",
      "logger:start"
    ]);

    // Verify state mutation via API
    expect(app.database.isConnected()).toBe(true);
    expect(app.cache.getEntries()).toBe(0);
    app.cache.addEntry();
    expect(app.cache.getEntries()).toBe(1);

    // Test event dispatch
    app.emit("app:log", { message: "test" });
    expect(order).toContain('logger:hook:{"message":"test"}');

    // Stop phase (reverse order)
    await app.stop();

    const stopEvents = order.filter(event => event.endsWith(":stop"));
    expect(stopEvents).toEqual(["logger:stop", "cache:stop", "database:stop"]);
  });

  it("async lifecycle methods run sequentially", async () => {
    const order: string[] = [];

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("async-test", {
      config: { siteName: "Async Test" }
    });

    const slow = cc.createPlugin("slow", {
      onInit: async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 20);
        });
        order.push("slow:init");
      },
      onStart: async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 20);
        });
        order.push("slow:start");
      },
      onStop: async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 20);
        });
        order.push("slow:stop");
      }
    });

    const fast = cc.createPlugin("fast", {
      onInit: () => {
        order.push("fast:init");
      },
      onStart: () => {
        order.push("fast:start");
      },
      onStop: () => {
        order.push("fast:stop");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [slow, fast] });
    const app = await createApp();

    // Sequential: slow finishes before fast
    expect(order).toEqual(["slow:init", "fast:init"]);

    await app.start();
    expect(order).toEqual(["slow:init", "fast:init", "slow:start", "fast:start"]);

    await app.stop();
    // Reverse: fast first, then slow
    expect(order).toEqual([
      "slow:init",
      "fast:init",
      "slow:start",
      "fast:start",
      "fast:stop",
      "slow:stop"
    ]);
  });

  it("error in onStop still runs remaining plugins (best-effort teardown)", async () => {
    const stopOrder: string[] = [];

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("error-test", {
      config: { siteName: "Error Test" }
    });

    const a = cc.createPlugin("a", {
      onStop: () => {
        stopOrder.push("a:stop");
      }
    });

    const b = cc.createPlugin("b", {
      onStop: () => {
        stopOrder.push("b:stop");
        throw new Error("b onStop failed");
      }
    });

    const c = cc.createPlugin("c", {
      onStop: () => {
        stopOrder.push("c:stop");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b, c] });
    const app = await createApp();
    await app.start();

    // First error is re-thrown but all plugins get stopped
    await expect(app.stop()).rejects.toThrow("b onStop failed");

    // All ran in reverse order despite error
    expect(stopOrder).toEqual(["c:stop", "b:stop", "a:stop"]);
  });

  it("terminal state after stop prevents further operations", async () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, unknown>>("terminal-test", {
      config: { siteName: "Terminal Test" }
    });

    const dummy = cc.createPlugin("dummy", {});

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();
    await app.start();
    await app.stop();

    // All operations throw after stop
    await expect(app.start()).rejects.toThrow();
    expect(() => app.emit("any", {})).toThrow();
    expect(() => app.has("any")).toThrow();
    expect(() => app.getPlugin(dummy)).toThrow();
    expect(() => app.require(dummy)).toThrow();
  });
});
