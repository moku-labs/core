import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function createTestCore() {
  return createCoreConfig<{ siteName: string }, Record<string, unknown>>("test", {
    config: { siteName: "Test" }
  });
}

// ---------------------------------------------------------------------------
// Lifecycle ordering
// ---------------------------------------------------------------------------

describe("lifecycle ordering", () => {
  it("onInit runs in forward order during createApp", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onInit: () => {
        order.push("a:init");
      }
    });
    const b = cc.createPlugin("b", {
      onInit: () => {
        order.push("b:init");
      }
    });
    const c = cc.createPlugin("c", {
      onInit: () => {
        order.push("c:init");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b, c] });
    await createApp();

    expect(order).toEqual(["a:init", "b:init", "c:init"]);
  });

  it("onStart runs in forward order during app.start()", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onStart: () => {
        order.push("a:start");
      }
    });
    const b = cc.createPlugin("b", {
      onStart: () => {
        order.push("b:start");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    const app = await createApp();
    await app.start();

    expect(order).toEqual(["a:start", "b:start"]);
  });

  it("onStop runs in REVERSE order during app.stop()", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onStop: () => {
        order.push("a:stop");
      }
    });
    const b = cc.createPlugin("b", {
      onStop: () => {
        order.push("b:stop");
      }
    });
    const c = cc.createPlugin("c", {
      onStop: () => {
        order.push("c:stop");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b, c] });
    const app = await createApp();
    await app.start();
    await app.stop();

    expect(order).toEqual(["c:stop", "b:stop", "a:stop"]);
  });

  it("full lifecycle: init forward, start forward, stop reverse", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const makePlugin = (name: string) =>
      cc.createPlugin(name, {
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

    const a = makePlugin("a");
    const b = makePlugin("b");

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    const app = await createApp();
    await app.start();
    await app.stop();

    expect(order).toEqual(["a:init", "b:init", "a:start", "b:start", "b:stop", "a:stop"]);
  });
});

// ---------------------------------------------------------------------------
// Dispatch and hooks
// ---------------------------------------------------------------------------

describe("dispatch and hooks", () => {
  it("hooks registered in spec receive events from emit", async () => {
    const received: unknown[] = [];
    const cc = createTestCore();

    const plugin = cc.createPlugin("listener", {
      hooks: {
        "test:event": (payload: unknown) => {
          received.push(payload);
        }
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    const app = await createApp();

    app.emit("test:event", { data: 42 });

    // emit is fire-and-forget (void dispatch). Allow microtasks to settle.
    await new Promise(resolve => {
      setTimeout(resolve, 0);
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ data: 42 });
  });

  it("multiple plugins can listen to the same event", async () => {
    const callOrder: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      hooks: {
        "shared:event": () => {
          callOrder.push("a");
        }
      }
    });
    const b = cc.createPlugin("b", {
      hooks: {
        "shared:event": () => {
          callOrder.push("b");
        }
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    const app = await createApp();

    app.emit("shared:event", {});

    // emit is fire-and-forget (void dispatch). Allow microtasks to settle.
    await new Promise(resolve => {
      setTimeout(resolve, 0);
    });

    expect(callOrder).toEqual(["a", "b"]);
  });

  it("emit with no listeners does not throw", async () => {
    const cc = createTestCore();
    const plugin = cc.createPlugin("silent", {});

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    const app = await createApp();

    expect(() => app.emit("nonexistent:event", {})).not.toThrow();
  });

  it("hooks can be dispatched during onInit via ctx.emit", async () => {
    const received: string[] = [];
    const cc = createTestCore();

    const listener = cc.createPlugin("listener", {
      hooks: {
        "setup:done": () => {
          received.push("heard");
        }
      }
    });

    const emitter = cc.createPlugin("emitter", {
      onInit: context => {
        context.emit("setup:done", {});
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [listener, emitter] });
    await createApp();

    expect(received).toHaveLength(1);
  });

  it("hooks can be dispatched during api building via ctx.emit", async () => {
    const received: string[] = [];
    const cc = createTestCore();

    const listener = cc.createPlugin("listener", {
      hooks: {
        "api:ready": () => {
          received.push("heard");
        }
      }
    });

    const emitter = cc.createPlugin("emitter", {
      api: context => {
        context.emit("api:ready", {});
        return { noop: () => {} };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [listener, emitter] });
    await createApp();

    expect(received).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Context shape tests
// ---------------------------------------------------------------------------

describe("context tiers", () => {
  it("createState receives MinimalContext (global + config only)", async () => {
    let contextKeys: string[] = [];
    const cc = createTestCore();

    const plugin = cc.createPlugin("probe", {
      defaultConfig: { debug: true },
      createState: context => {
        contextKeys = Object.keys(context);
        return {};
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    await createApp();

    expect(contextKeys).toContain("global");
    expect(contextKeys).toContain("config");
    expect(contextKeys).not.toContain("emit");
    expect(contextKeys).not.toContain("require");
    expect(contextKeys).not.toContain("getPlugin");
    expect(contextKeys).not.toContain("state");
  });

  it("onInit receives PluginContext (full context)", async () => {
    let contextKeys: string[] = [];
    const cc = createTestCore();

    const plugin = cc.createPlugin("probe", {
      defaultConfig: { debug: true },
      createState: () => ({ count: 0 }),
      onInit: context => {
        contextKeys = Object.keys(context);
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    await createApp();

    expect(contextKeys).toContain("global");
    expect(contextKeys).toContain("config");
    expect(contextKeys).toContain("state");
    expect(contextKeys).toContain("emit");
    expect(contextKeys).toContain("getPlugin");
    expect(contextKeys).toContain("require");
    expect(contextKeys).toContain("has");
  });

  it("onStop receives TeardownContext (global only)", async () => {
    let contextKeys: string[] = [];
    const cc = createTestCore();

    const plugin = cc.createPlugin("probe", {
      onStop: context => {
        contextKeys = Object.keys(context);
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    const app = await createApp();
    await app.start();
    await app.stop();

    expect(contextKeys).toContain("global");
    expect(contextKeys).not.toContain("config");
    expect(contextKeys).not.toContain("state");
    expect(contextKeys).not.toContain("emit");
  });
});

// ---------------------------------------------------------------------------
// App object shape
// ---------------------------------------------------------------------------

describe("app object shape", () => {
  it("app has start, stop, emit, getPlugin, require, has methods", async () => {
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    expect(typeof app.start).toBe("function");
    expect(typeof app.stop).toBe("function");
    expect(typeof app.emit).toBe("function");
    expect(typeof app.getPlugin).toBe("function");
    expect(typeof app.require).toBe("function");
    expect(typeof app.has).toBe("function");
  });

  it("plugin APIs are mounted directly on app object", async () => {
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      api: () => ({
        navigate: (path: string) => path,
        current: () => "/"
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = await createApp();

    expect(app.router).toBeDefined();
    expect(typeof app.router.navigate).toBe("function");
    expect(typeof app.router.current).toBe("function");
  });

  it("app object is frozen", async () => {
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    expect(Object.isFrozen(app)).toBe(true);
  });

  it("plugins without api are not mounted on app", async () => {
    const cc = createTestCore();

    const noApi = cc.createPlugin("no-api", {
      onInit: () => {}
    });

    const { createApp } = cc.createCore(cc, { plugins: [noApi] });
    const app = await createApp();

    // Plugin is registered (has returns true) but has no mounted API
    expect(app.has("no-api")).toBe(true);
    // Plugin without api is excluded from App type surface (BuildPluginApis filters it out).
    // Use runtime check via getPlugin since bracket access is not typed for no-api plugins.
    expect(app.getPlugin("no-api")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  it("start() can only be called once", async () => {
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    await app.start();
    await expect(app.start()).rejects.toThrow("already started");
  });

  it("stop() can only be called once", async () => {
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    await app.start();
    await app.stop();
    await expect(app.stop()).rejects.toThrow("stopped");
  });

  it("stop() requires start() first", async () => {
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    await expect(app.stop()).rejects.toThrow("not started");
  });

  it("app is terminal after stop -- no further operations", async () => {
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    await app.start();
    await app.stop();

    // All operations should throw after stop
    await expect(app.start()).rejects.toThrow("stopped");
    expect(() => app.emit("test", {})).toThrow("stopped");
    expect(() => app.has("router")).toThrow("stopped");
    expect(() => app.getPlugin("router")).toThrow("stopped");
    expect(() => app.require("router")).toThrow("stopped");
  });
});

// ---------------------------------------------------------------------------
// Plugin state privacy
// ---------------------------------------------------------------------------

describe("plugin state privacy", () => {
  it("plugin state is not exposed on app object", async () => {
    const cc = createTestCore();

    const stateful = cc.createPlugin("stateful", {
      createState: () => ({ secret: "hidden" }),
      api: context => ({
        getSecret: () => context.state.secret
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [stateful] });
    const app = await createApp();

    // API method can access state
    expect(app.stateful.getSecret()).toBe("hidden");

    // But state is not directly on app.stateful
    expect((app.stateful as Record<string, unknown>).secret).toBeUndefined();
    expect((app.stateful as Record<string, unknown>).state).toBeUndefined();
  });

  it("plugin state is mutable via context", async () => {
    const cc = createTestCore();

    const counter = cc.createPlugin("counter", {
      createState: () => ({ count: 0 }),
      api: context => ({
        increment: () => {
          context.state.count += 1;
        },
        getCount: () => context.state.count
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [counter] });
    const app = await createApp();

    expect(app.counter.getCount()).toBe(0);
    app.counter.increment();
    app.counter.increment();
    expect(app.counter.getCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Error message format
// ---------------------------------------------------------------------------

describe("kernel error messages", () => {
  it("errors follow [framework-id] format", async () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("my-app", {
      config: {}
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    await app.start();

    try {
      await app.start();
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toMatch(/^\[my-app\]/);
    }
  });

  it("require throws with framework error format when plugin not found", async () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("my-app", {
      config: {}
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    try {
      app.require("missing");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toMatch(/^\[my-app\]/);
      expect((error as Error).message).toContain("missing");
    }
  });
});

// ---------------------------------------------------------------------------
// getPlugin / require / has
// ---------------------------------------------------------------------------

describe("getPlugin, require, has", () => {
  it("getPlugin returns API for registered plugin", async () => {
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = await createApp();

    const api = app.getPlugin("router");
    expect(api).toBeDefined();
    // String-based getPlugin returns unknown; use runtime assertion
    expect((api as { current: () => string }).current()).toBe("/");
  });

  it("getPlugin returns undefined for unregistered plugin", async () => {
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    expect(app.getPlugin("nonexistent")).toBeUndefined();
  });

  it("require returns API for registered plugin", async () => {
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = await createApp();

    const api = app.require("router");
    // String-based require returns unknown; use runtime assertion
    expect((api as { current: () => string }).current()).toBe("/");
  });

  it("require throws for unregistered plugin", async () => {
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    expect(() => app.require("missing")).toThrow();
  });

  it("has returns true for registered plugins", async () => {
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = await createApp();

    expect(app.has("router")).toBe(true);
  });

  it("has returns false for unregistered plugins", async () => {
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = await createApp();

    expect(app.has("nonexistent")).toBe(false);
  });

  it("has checks name registration not API presence", async () => {
    const cc = createTestCore();

    // Plugin with no api() -- registered but no API
    const noApi = cc.createPlugin("no-api", {});

    const { createApp } = cc.createCore(cc, { plugins: [noApi] });
    const app = await createApp();

    // Registered by name -> true
    expect(app.has("no-api")).toBe(true);
    // No API mounted -> getPlugin returns undefined
    expect(app.getPlugin("no-api")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// onReady callback
// ---------------------------------------------------------------------------

describe("onReady callback", () => {
  it("onReady fires after all onInit", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const plugin = cc.createPlugin("probe", {
      onInit: () => {
        order.push("onInit");
      }
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [plugin],
      onReady: () => {
        order.push("onReady");
      }
    });
    await createApp();

    expect(order).toEqual(["onInit", "onReady"]);
  });

  it("onReady receives global config", async () => {
    let receivedConfig: Record<string, unknown> = {};
    const cc = createTestCore();

    const { createApp } = cc.createCore(cc, {
      plugins: [],
      onReady: context => {
        receivedConfig = { ...context.config };
      }
    });
    await createApp();

    expect(receivedConfig.siteName).toBe("Test");
  });
});

// ---------------------------------------------------------------------------
// Best-effort stop
// ---------------------------------------------------------------------------

describe("best-effort stop", () => {
  it("continues stopping all plugins even if one throws", async () => {
    const stopOrder: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onStop: () => {
        stopOrder.push("a");
      }
    });
    const b = cc.createPlugin("b", {
      onStop: () => {
        stopOrder.push("b");
        throw new Error("b failed");
      }
    });
    const c = cc.createPlugin("c", {
      onStop: () => {
        stopOrder.push("c");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b, c] });
    const app = await createApp();
    await app.start();

    // stop() re-throws first error but runs all plugins
    await expect(app.stop()).rejects.toThrow("b failed");

    // All plugins received onStop in reverse order
    expect(stopOrder).toEqual(["c", "b", "a"]);
  });

  it("onError callback receives errors during stop", async () => {
    const errors: Error[] = [];
    const cc = createTestCore();

    const plugin = cc.createPlugin("failing", {
      onStop: () => {
        throw new Error("stop failed");
      }
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [plugin],
      onError: error => {
        errors.push(error);
      }
    });
    const app = await createApp();
    await app.start();

    await expect(app.stop()).rejects.toThrow("stop failed");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("stop failed");
  });
});

// ---------------------------------------------------------------------------
// Async lifecycle
// ---------------------------------------------------------------------------

describe("async lifecycle", () => {
  it("onInit supports async functions", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onInit: async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 10);
        });
        order.push("a:init");
      }
    });
    const b = cc.createPlugin("b", {
      onInit: () => {
        order.push("b:init");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    await createApp();

    // Sequential: a finishes before b starts
    expect(order).toEqual(["a:init", "b:init"]);
  });

  it("onStart supports async functions", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onStart: async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 10);
        });
        order.push("a:start");
      }
    });
    const b = cc.createPlugin("b", {
      onStart: () => {
        order.push("b:start");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    const app = await createApp();
    await app.start();

    expect(order).toEqual(["a:start", "b:start"]);
  });

  it("onStop supports async functions", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onStop: async () => {
        await new Promise(resolve => {
          setTimeout(resolve, 10);
        });
        order.push("a:stop");
      }
    });
    const b = cc.createPlugin("b", {
      onStop: () => {
        order.push("b:stop");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    const app = await createApp();
    await app.start();
    await app.stop();

    // Reverse + sequential: b finishes before a starts
    expect(order).toEqual(["b:stop", "a:stop"]);
  });
});
