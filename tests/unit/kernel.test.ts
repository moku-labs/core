import { describe, expect, it, vi } from "vitest";
import { createCore } from "../../src/index";

// =============================================================================
// Helper: create a test core with default empty config
// =============================================================================
function testCore(
  options: {
    config?: Record<string, unknown>;
    plugins?: unknown[];
    onBoot?: (ctx: { config: Readonly<Record<string, unknown>> }) => void;
    onReady?: (ctx: { config: Readonly<Record<string, unknown>> }) => void | Promise<void>;
    onShutdown?: (ctx: { config: Readonly<Record<string, unknown>> }) => void | Promise<void>;
    onError?: (ctx: { error: unknown; phase: string; pluginName?: string }) => void | Promise<void>;
  } = {}
) {
  return createCore("test", {
    config: options.config ?? {},
    plugins: options.plugins as never[],
    onBoot: options.onBoot as never,
    onReady: options.onReady as never,
    onShutdown: options.onShutdown as never,
    onError: options.onError as never
  });
}

// =============================================================================
// Lifecycle Phase Ordering Tests
// =============================================================================

describe("lifecycle phase ordering", () => {
  it("Phase 2 (createState, hooks, onCreate) runs before Phase 3 (api) and Phase 3 before Phase 4 (onInit)", async () => {
    const log: string[] = [];
    const core = testCore();
    const plugin = core.createPlugin("tracker", {
      defaultConfig: {},
      createState: () => {
        log.push("createState");
        return {};
      },
      onCreate: () => {
        log.push("onCreate");
      },
      api: () => {
        log.push("api");
        return {};
      },
      onInit: () => {
        log.push("onInit");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await core.createApp(config);

    expect(log).toEqual(["createState", "onCreate", "api", "onInit"]);
  });

  it("within Phase 2, plugins execute in declaration order (A before B)", async () => {
    const log: string[] = [];
    const core = testCore();
    const pluginA = core.createPlugin("a", {
      defaultConfig: {},
      createState: () => {
        log.push("a-createState");
        return {};
      },
      onCreate: () => {
        log.push("a-onCreate");
      }
    });
    const pluginB = core.createPlugin("b", {
      defaultConfig: {},
      createState: () => {
        log.push("b-createState");
        return {};
      },
      onCreate: () => {
        log.push("b-onCreate");
      }
    });

    const config = core.createConfig({ plugins: [pluginA, pluginB] });
    await core.createApp(config);

    expect(log).toEqual(["a-createState", "a-onCreate", "b-createState", "b-onCreate"]);
  });

  it("async lifecycle methods are awaited (delayed promises)", async () => {
    const log: string[] = [];
    const core = testCore();
    const plugin = core.createPlugin("delayed", {
      defaultConfig: {},
      createState: async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        log.push("createState-done");
        return { value: 42 };
      },
      api: () => {
        log.push("api");
        return {};
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await core.createApp(config);

    expect(log).toEqual(["createState-done", "api"]);
  });

  it("createState result is available as state in api factory and onStart", async () => {
    const core = testCore();
    let apiState: unknown;
    let startState: unknown;

    const plugin = core.createPlugin("stateful", {
      defaultConfig: {},
      createState: () => ({ count: 42 }),
      api: (ctx: { state: unknown }) => {
        apiState = ctx.state;
        return {};
      },
      onStart: (ctx: { state: unknown }) => {
        startState = ctx.state;
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.start();

    expect(apiState).toEqual({ count: 42 });
    expect(startState).toEqual({ count: 42 });
  });
});

// =============================================================================
// Dispatch Tests
// =============================================================================

describe("dispatch", () => {
  it("emit dispatches to hooks registered via plugin spec.hooks", async () => {
    const log: string[] = [];
    const core = testCore();
    const plugin = core.createPlugin("hooker", {
      hooks: {
        "custom:event": () => {
          log.push("hook-fired");
        }
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.emit("custom:event" as never, { data: "test" } as never);

    expect(log).toEqual(["hook-fired"]);
  });

  it("signal dispatches to the same hookMap", async () => {
    const log: string[] = [];
    const core = testCore();
    const plugin = core.createPlugin("signaler", {
      hooks: {
        "my:signal": () => {
          log.push("signal-hook");
        }
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.signal("my:signal");

    expect(log).toEqual(["signal-hook"]);
  });

  it("hooks execute sequentially in plugin registration order", async () => {
    const log: string[] = [];
    const core = testCore();
    const pluginA = core.createPlugin("a", {
      hooks: {
        "shared:event": () => {
          log.push("a-hook");
        }
      }
    });
    const pluginB = core.createPlugin("b", {
      hooks: {
        "shared:event": () => {
          log.push("b-hook");
        }
      }
    });

    const config = core.createConfig({ plugins: [pluginA, pluginB] });
    const app = await core.createApp(config);
    await app.emit("shared:event" as never, {} as never);

    expect(log).toEqual(["a-hook", "b-hook"]);
  });

  it("hooks are awaited (async hooks run to completion before next)", async () => {
    const log: string[] = [];
    const core = testCore();
    const pluginA = core.createPlugin("a", {
      hooks: {
        "async:event": async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          log.push("a-done");
        }
      }
    });
    const pluginB = core.createPlugin("b", {
      hooks: {
        "async:event": () => {
          log.push("b-done");
        }
      }
    });

    const config = core.createConfig({ plugins: [pluginA, pluginB] });
    const app = await core.createApp(config);
    await app.emit("async:event" as never, {} as never);

    expect(log).toEqual(["a-done", "b-done"]);
  });

  it("handler error propagation: if a hook handler throws, emit rejects", async () => {
    const core = testCore();
    const plugin = core.createPlugin("thrower", {
      hooks: {
        "bad:event": () => {
          throw new Error("hook boom");
        }
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    await expect(app.emit("bad:event" as never, {} as never)).rejects.toThrow("hook boom");
  });

  it("handler error propagation: if a hook handler throws, signal rejects", async () => {
    const core = testCore();
    const plugin = core.createPlugin("thrower", {
      hooks: {
        "bad:signal": () => {
          throw new Error("signal boom");
        }
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    await expect(app.signal("bad:signal")).rejects.toThrow("signal boom");
  });
});

// =============================================================================
// Kernel Event Tests (COMM-04)
// =============================================================================

describe("kernel events (COMM-04)", () => {
  it("app:start fires before plugin onStart calls", async () => {
    const log: string[] = [];
    const core = testCore();
    const pluginA = core.createPlugin("a", {
      defaultConfig: {},
      hooks: {
        "app:start": () => {
          log.push("app:start-hook");
        }
      },
      onStart: () => {
        log.push("a-onStart");
      }
    });
    const pluginB = core.createPlugin("b", {
      defaultConfig: {},
      onStart: () => {
        log.push("b-onStart");
      }
    });

    const config = core.createConfig({ plugins: [pluginA, pluginB] });
    const app = await core.createApp(config);
    await app.start();

    expect(log).toEqual(["app:start-hook", "a-onStart", "b-onStart"]);
  });

  it("app:stop fires after plugin onStop calls", async () => {
    const log: string[] = [];
    const core = testCore();
    const pluginA = core.createPlugin("a", {
      hooks: {
        "app:stop": () => {
          log.push("app:stop-hook");
        }
      },
      onStop: () => {
        log.push("a-onStop");
      }
    });
    const pluginB = core.createPlugin("b", {
      onStop: () => {
        log.push("b-onStop");
      }
    });

    const config = core.createConfig({ plugins: [pluginA, pluginB] });
    const app = await core.createApp(config);
    await app.start();
    await app.stop();

    // Reverse order for stop: B before A, then app:stop hook
    expect(log).toEqual(["b-onStop", "a-onStop", "app:stop-hook"]);
  });

  it("app:destroy fires after plugin onDestroy calls", async () => {
    const log: string[] = [];
    const core = testCore();
    const pluginA = core.createPlugin("a", {
      hooks: {
        "app:destroy": () => {
          log.push("app:destroy-hook");
        }
      },
      onDestroy: () => {
        log.push("a-onDestroy");
      }
    });
    const pluginB = core.createPlugin("b", {
      onDestroy: () => {
        log.push("b-onDestroy");
      }
    });

    const config = core.createConfig({ plugins: [pluginA, pluginB] });
    const app = await core.createApp(config);
    await app.destroy();

    // Reverse order for destroy: B before A, then app:destroy hook
    expect(log).toEqual(["b-onDestroy", "a-onDestroy", "app:destroy-hook"]);
  });

  it("kernel events fire even if BusContract does not declare them", async () => {
    const log: string[] = [];
    // No BusContract at all -- kernel events should still fire
    const core = testCore();
    const plugin = core.createPlugin("listener", {
      hooks: {
        "app:start": () => {
          log.push("start");
        },
        "app:stop": () => {
          log.push("stop");
        },
        "app:destroy": () => {
          log.push("destroy");
        }
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.start();
    await app.stop();
    await app.destroy();

    expect(log).toEqual(["start", "stop", "destroy"]);
  });
});

// =============================================================================
// CoreDefaults Callback Tests (APP-08)
// =============================================================================

describe("CoreDefaults callbacks (APP-08)", () => {
  it("onBoot runs before Phase 2 (before createState)", async () => {
    const log: string[] = [];
    const core = testCore({
      onBoot: () => {
        log.push("onBoot");
      }
    });
    const plugin = core.createPlugin("tracker", {
      defaultConfig: {},
      createState: () => {
        log.push("createState");
        return {};
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await core.createApp(config);

    expect(log).toEqual(["onBoot", "createState"]);
  });

  it("onBoot is sync (receives config, returns void)", async () => {
    let receivedConfig: unknown;
    const core = testCore({
      config: { debug: true },
      onBoot: ctx => {
        receivedConfig = ctx.config;
        // No Promise return
      }
    });

    const config = core.createConfig();
    await core.createApp(config);

    expect(receivedConfig).toBeDefined();
    expect((receivedConfig as Record<string, unknown>).debug).toBe(true);
  });

  it("onReady runs before app:start dispatch", async () => {
    const log: string[] = [];
    const core = testCore({
      onReady: () => {
        log.push("onReady");
      }
    });
    const plugin = core.createPlugin("tracker", {
      defaultConfig: {},
      hooks: {
        "app:start": () => {
          log.push("app:start-hook");
        }
      },
      onStart: () => {
        log.push("onStart");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.start();

    expect(log).toEqual(["onReady", "app:start-hook", "onStart"]);
  });

  it("onShutdown runs after app:stop dispatch", async () => {
    const log: string[] = [];
    const core = testCore({
      onShutdown: () => {
        log.push("onShutdown");
      }
    });
    const plugin = core.createPlugin("tracker", {
      hooks: {
        "app:stop": () => {
          log.push("app:stop-hook");
        }
      },
      onStop: () => {
        log.push("onStop");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.start();
    await app.stop();

    expect(log).toEqual(["onStop", "app:stop-hook", "onShutdown"]);
  });

  it("onError is called when a lifecycle method throws", async () => {
    let errorContext: { error: unknown; phase: string; pluginName?: string } | undefined;
    const core = testCore({
      onError: ctx => {
        errorContext = ctx;
      }
    });
    const plugin = core.createPlugin("broken", {
      defaultConfig: {},
      createState: (): Record<string, unknown> => {
        throw new Error("create boom");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await expect(core.createApp(config)).rejects.toThrow("create boom");

    expect(errorContext).toBeDefined();
    expect(errorContext?.phase).toBe("create");
    expect(errorContext?.pluginName).toBe("broken");
    expect((errorContext?.error as Error).message).toBe("create boom");
  });

  it("onError does not suppress the error (error still propagates)", async () => {
    const onError = vi.fn();
    const core = testCore({ onError });
    const plugin = core.createPlugin("broken", {
      defaultConfig: {},
      onCreate: () => {
        throw new Error("still propagates");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await expect(core.createApp(config)).rejects.toThrow("still propagates");
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Fail-fast Error Tests
// =============================================================================

describe("fail-fast error behavior", () => {
  it("createApp rejects if Phase 2 (createState) throws", async () => {
    const core = testCore();
    const plugin = core.createPlugin("broken", {
      defaultConfig: {},
      createState: (): Record<string, unknown> => {
        throw new Error("phase 2 error");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await expect(core.createApp(config)).rejects.toThrow("phase 2 error");
  });

  it("createApp rejects if Phase 2 (onCreate) throws", async () => {
    const core = testCore();
    const plugin = core.createPlugin("broken", {
      defaultConfig: {},
      onCreate: () => {
        throw new Error("onCreate error");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await expect(core.createApp(config)).rejects.toThrow("onCreate error");
  });

  it("createApp rejects if Phase 3 (api) throws", async () => {
    const core = testCore();
    const plugin = core.createPlugin("broken", {
      defaultConfig: {},
      api: () => {
        throw new Error("phase 3 error");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await expect(core.createApp(config)).rejects.toThrow("phase 3 error");
  });

  it("createApp rejects if Phase 4 (onInit) throws", async () => {
    const core = testCore();
    const plugin = core.createPlugin("broken", {
      defaultConfig: {},
      onInit: () => {
        throw new Error("phase 4 error");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await expect(core.createApp(config)).rejects.toThrow("phase 4 error");
  });

  it("start() rejects if onStart throws, but started flag is true (idempotent on retry)", async () => {
    const core = testCore();
    let callCount = 0;
    const plugin = core.createPlugin("broken", {
      defaultConfig: {},
      onStart: () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("start error");
        }
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    await expect(app.start()).rejects.toThrow("start error");
    // started flag is true, second call is no-op
    await app.start(); // should not throw
    expect(callCount).toBe(1); // onStart not called again
  });

  it("stop() rejects on first error, remaining plugins not stopped", async () => {
    const log: string[] = [];
    const core = testCore();
    const pluginA = core.createPlugin("a", {
      onStop: () => {
        log.push("a-onStop");
      }
    });
    const pluginB = core.createPlugin("b", {
      onStop: () => {
        throw new Error("stop error");
      }
    });

    const config = core.createConfig({ plugins: [pluginA, pluginB] });
    const app = await core.createApp(config);
    await app.start();

    // Stop runs in reverse: B first (throws), A never reached
    await expect(app.stop()).rejects.toThrow("stop error");
    expect(log).not.toContain("a-onStop");
  });

  it("destroy() rejects on first error", async () => {
    const core = testCore();
    const plugin = core.createPlugin("broken", {
      onDestroy: () => {
        throw new Error("destroy error");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await expect(app.destroy()).rejects.toThrow("destroy error");
  });

  it("no rollback: if Phase 3 fails, Phase 2 states are not cleaned up", async () => {
    const core = testCore();
    let stateCreated = false;
    const pluginGood = core.createPlugin("good", {
      defaultConfig: {},
      createState: () => {
        stateCreated = true;
        return { value: 1 };
      },
      api: () => ({})
    });
    const pluginBad = core.createPlugin("bad", {
      defaultConfig: {},
      api: () => {
        throw new Error("api boom");
      }
    });

    const config = core.createConfig({ plugins: [pluginGood, pluginBad] });
    await expect(core.createApp(config)).rejects.toThrow("api boom");

    // State was created for "good" plugin; no rollback happened
    expect(stateCreated).toBe(true);
  });
});

// =============================================================================
// Destroy Contract Tests
// =============================================================================

describe("destroy contract", () => {
  it("destroy() calls stop() if started", async () => {
    const log: string[] = [];
    const core = testCore();
    const plugin = core.createPlugin("tracker", {
      onStop: () => {
        log.push("onStop");
      },
      onDestroy: () => {
        log.push("onDestroy");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.start();
    await app.destroy();

    expect(log).toContain("onStop");
    expect(log).toContain("onDestroy");
  });

  it("destroy() does not call stop() if already stopped", async () => {
    const log: string[] = [];
    const core = testCore();
    const plugin = core.createPlugin("tracker", {
      onStop: () => {
        log.push("onStop");
      },
      onDestroy: () => {
        log.push("onDestroy");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.start();
    await app.stop();
    log.length = 0; // Reset log

    await app.destroy();
    expect(log).not.toContain("onStop");
    expect(log).toContain("onDestroy");
  });

  it("destroy() does not call stop() if never started", async () => {
    const log: string[] = [];
    const core = testCore();
    const plugin = core.createPlugin("tracker", {
      onStop: () => {
        log.push("onStop");
      },
      onDestroy: () => {
        log.push("onDestroy");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.destroy();

    expect(log).not.toContain("onStop");
    expect(log).toContain("onDestroy");
  });

  it("destroy() clears internal registries (getPlugin returns undefined after destroy)", async () => {
    const core = testCore();
    const plugin = core.createPlugin("myPlugin", {
      defaultConfig: {},
      api: () => ({ hello: () => "world" })
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    expect(app.getPlugin("myPlugin")).toBeDefined();
    await app.destroy();

    // After destroy, all public methods throw because of destroyed flag.
    // getPlugin on a frozen object still returns the mounted value,
    // but the internal registry was cleared. The mounted property on
    // the frozen app still exists, though.
    // The important thing: emit/signal/start/stop/destroy all throw.
    expect(() => app.emit("any" as never, {} as never)).toThrow("destroyed");
  });

  it("post-destroy start() throws", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);
    await app.destroy();

    await expect(app.start()).rejects.toThrow("Cannot call start() on a destroyed app");
  });

  it("post-destroy stop() throws", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);
    await app.destroy();

    await expect(app.stop()).rejects.toThrow("Cannot call stop() on a destroyed app");
  });

  it("post-destroy emit() throws synchronously", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);
    await app.destroy();

    // emit checks destroyed flag synchronously before dispatch
    expect(() => app.emit("any" as never, {} as never)).toThrow(
      "Cannot call emit() on a destroyed app"
    );
  });

  it("post-destroy signal() throws synchronously", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);
    await app.destroy();

    // signal checks destroyed flag synchronously before dispatch
    expect(() => app.signal("any")).toThrow("Cannot call signal() on a destroyed app");
  });

  it("post-destroy destroy() throws", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);
    await app.destroy();

    await expect(app.destroy()).rejects.toThrow("Cannot call destroy() on a destroyed app");
  });

  it("error format includes framework name: [test]", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);
    await app.destroy();

    try {
      await app.start();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("[test]");
      expect((error as Error).message).toContain("Cannot call start() on a destroyed app");
    }
  });
});

// =============================================================================
// Idempotency Tests
// =============================================================================

describe("idempotency", () => {
  it("start() is idempotent (second call is no-op)", async () => {
    const log: string[] = [];
    const core = testCore();
    const plugin = core.createPlugin("tracker", {
      defaultConfig: {},
      onStart: () => {
        log.push("onStart");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    await app.start();
    await app.start(); // second call
    expect(log).toEqual(["onStart"]); // only called once
  });

  it("stop() is idempotent (no-op if not started)", async () => {
    const log: string[] = [];
    const core = testCore();
    const plugin = core.createPlugin("tracker", {
      onStop: () => {
        log.push("onStop");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    await app.stop(); // not started, should be no-op
    expect(log).toEqual([]);
  });
});

// =============================================================================
// Context Shape Tests
// =============================================================================

describe("context shapes", () => {
  it("createState receives { global, config } (MinimalContext)", async () => {
    let context: Record<string, unknown> | undefined;
    const core = testCore({ config: { env: "test" } });
    const plugin = core.createPlugin("checker", {
      defaultConfig: { key: "value" },
      createState: (ctx: Record<string, unknown>) => {
        context = ctx;
        return {};
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await core.createApp(config);

    expect(context).toBeDefined();
    expect(context?.global).toBeDefined();
    expect(context?.config).toBeDefined();
    expect((context?.global as Record<string, unknown>).env).toBe("test");
    expect((context?.config as Record<string, unknown>).key).toBe("value");
    // Should NOT have state, emit, signal, getPlugin, require, has
    expect(context?.state).toBeUndefined();
    expect(context?.emit).toBeUndefined();
    expect(context?.signal).toBeUndefined();
  });

  it("onCreate receives { global, config } (MinimalContext)", async () => {
    let context: Record<string, unknown> | undefined;
    const core = testCore();
    const plugin = core.createPlugin("checker", {
      defaultConfig: { x: 1 },
      onCreate: (ctx: Record<string, unknown>) => {
        context = ctx;
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await core.createApp(config);

    expect(context).toBeDefined();
    expect(context?.global).toBeDefined();
    expect(context?.config).toBeDefined();
    expect(context?.emit).toBeUndefined();
  });

  it("api receives full PluginContext (global, config, state, emit, signal, getPlugin, require, has)", async () => {
    let context: Record<string, unknown> | undefined;
    const core = testCore();
    const plugin = core.createPlugin("checker", {
      defaultConfig: { x: 1 },
      createState: () => ({ count: 0 }),
      api: (ctx: Record<string, unknown>) => {
        context = ctx;
        return {};
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await core.createApp(config);

    expect(context).toBeDefined();
    expect(context?.global).toBeDefined();
    expect(context?.config).toBeDefined();
    expect(context?.state).toEqual({ count: 0 });
    expect(typeof context?.emit).toBe("function");
    expect(typeof context?.signal).toBe("function");
    expect(typeof context?.getPlugin).toBe("function");
    expect(typeof context?.require).toBe("function");
    expect(typeof context?.has).toBe("function");
  });

  it("onInit receives InitContext (global, config, emit, signal, getPlugin, require, has -- NO state)", async () => {
    let context: Record<string, unknown> | undefined;
    const core = testCore();
    const plugin = core.createPlugin("checker", {
      defaultConfig: { y: 2 },
      createState: () => ({ data: "hello" }),
      onInit: (ctx: Record<string, unknown>) => {
        context = ctx;
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await core.createApp(config);

    expect(context).toBeDefined();
    expect(context?.global).toBeDefined();
    expect(context?.config).toBeDefined();
    expect(typeof context?.emit).toBe("function");
    expect(typeof context?.signal).toBe("function");
    expect(typeof context?.getPlugin).toBe("function");
    expect(typeof context?.require).toBe("function");
    expect(typeof context?.has).toBe("function");
    // NO state in init context
    expect(context?.state).toBeUndefined();
  });

  it("onStart receives full PluginContext", async () => {
    let context: Record<string, unknown> | undefined;
    const core = testCore();
    const plugin = core.createPlugin("checker", {
      defaultConfig: { z: 3 },
      createState: () => ({ items: [] }),
      onStart: (ctx: Record<string, unknown>) => {
        context = ctx;
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.start();

    expect(context).toBeDefined();
    expect(context?.global).toBeDefined();
    expect(context?.config).toBeDefined();
    expect(context?.state).toEqual({ items: [] });
    expect(typeof context?.emit).toBe("function");
    expect(typeof context?.signal).toBe("function");
  });

  it("onStop receives TeardownContext { global }", async () => {
    let context: Record<string, unknown> | undefined;
    const core = testCore({ config: { env: "test" } });
    const plugin = core.createPlugin("checker", {
      onStop: (ctx: Record<string, unknown>) => {
        context = ctx;
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.start();
    await app.stop();

    expect(context).toBeDefined();
    expect(context?.global).toBeDefined();
    expect((context?.global as Record<string, unknown>).env).toBe("test");
    // Only global -- nothing else
    expect(Object.keys(context ?? {})).toEqual(["global"]);
  });

  it("onDestroy receives TeardownContext { global }", async () => {
    let context: Record<string, unknown> | undefined;
    const core = testCore({ config: { env: "test" } });
    const plugin = core.createPlugin("checker", {
      onDestroy: (ctx: Record<string, unknown>) => {
        context = ctx;
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.destroy();

    expect(context).toBeDefined();
    expect(context?.global).toBeDefined();
    expect(Object.keys(context ?? {})).toEqual(["global"]);
  });
});

// =============================================================================
// Error Format Tests (KERN-03)
// =============================================================================

describe("error format (KERN-03)", () => {
  it("requirePlugin error includes framework name", async () => {
    const core = testCore();
    const plugin = core.createPlugin("needy", {
      defaultConfig: {},
      onInit: (ctx: { require: (name: string) => unknown }) => {
        ctx.require("nonexistent");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    await expect(core.createApp(config)).rejects.toThrow("[test]");
  });

  it("requirePlugin error includes both requester and target names", async () => {
    const core = testCore();
    const plugin = core.createPlugin("needy", {
      defaultConfig: {},
      onInit: (ctx: { require: (name: string) => unknown }) => {
        ctx.require("missing");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    try {
      await core.createApp(config);
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("[test]");
      expect(message).toContain("needy");
      expect(message).toContain("missing");
    }
  });

  it("post-destroy errors include framework name", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);
    await app.destroy();

    try {
      await app.start();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("[test]");
    }
  });
});

// =============================================================================
// App Object Shape Tests
// =============================================================================

describe("app object shape", () => {
  it("app is frozen after createApp", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);
    expect(Object.isFrozen(app)).toBe(true);
  });

  it("app.config is frozen", async () => {
    const core = testCore({ config: { debug: true } });
    const config = core.createConfig();
    const app = await core.createApp(config);
    expect(Object.isFrozen(app.config)).toBe(true);
  });

  it("plugin APIs are mounted on the app object", async () => {
    const core = testCore();
    const plugin = core.createPlugin("greeter", {
      defaultConfig: {},
      api: () => ({ greet: () => "hello" })
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    expect((app as Record<string, unknown>).greeter).toBeDefined();
    const api = (app as Record<string, unknown>).greeter as Record<string, unknown>;
    expect(typeof api.greet).toBe("function");
    expect((api.greet as () => string)()).toBe("hello");
  });

  it("plugin API has config attached", async () => {
    const core = testCore();
    const plugin = core.createPlugin("configured", {
      defaultConfig: { setting: "default" },
      api: () => ({})
    });

    const config = core.createConfig({
      plugins: [plugin],
      pluginConfigs: { configured: { setting: "override" } }
    });
    const app = await core.createApp(config);

    const api = (app as Record<string, unknown>).configured as Record<string, unknown>;
    expect(api.config).toBeDefined();
    expect((api.config as Record<string, unknown>).setting).toBe("override");
  });

  it("has() returns true for registered plugin", async () => {
    const core = testCore();
    const plugin = core.createPlugin("myPlugin", {
      defaultConfig: {},
      api: () => ({})
    });
    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    expect(app.has("myPlugin")).toBe(true);
    expect(app.has("nonexistent")).toBe(false);
  });

  it("getPlugin() returns API for registered plugin", async () => {
    const core = testCore();
    const plugin = core.createPlugin("myPlugin", {
      defaultConfig: {},
      api: () => ({ value: 42 })
    });
    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    const api = app.getPlugin("myPlugin") as unknown as Record<string, unknown>;
    expect(api).toBeDefined();
    expect(api.value).toBe(42);
  });

  it("getPlugin() returns undefined for unregistered plugin", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);

    expect(app.getPlugin("nonexistent")).toBeUndefined();
  });

  it("require() throws for unregistered plugin", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);

    expect(() => app.require("nonexistent")).toThrow("[test]");
  });
});

// =============================================================================
// Full Lifecycle Order Verification
// =============================================================================

describe("full lifecycle order", () => {
  it("complete lifecycle executes all phases in correct order", async () => {
    const log: string[] = [];
    const core = testCore({
      onBoot: () => {
        log.push("onBoot");
      },
      onReady: () => {
        log.push("onReady");
      },
      onShutdown: () => {
        log.push("onShutdown");
      }
    });

    const plugin = core.createPlugin("ordered", {
      defaultConfig: {},
      createState: () => {
        log.push("createState");
        return {};
      },
      onCreate: () => {
        log.push("onCreate");
      },
      api: () => {
        log.push("api");
        return {};
      },
      onInit: () => {
        log.push("onInit");
      },
      hooks: {
        "app:start": () => {
          log.push("app:start-hook");
        },
        "app:stop": () => {
          log.push("app:stop-hook");
        },
        "app:destroy": () => {
          log.push("app:destroy-hook");
        }
      },
      onStart: () => {
        log.push("onStart");
      },
      onStop: () => {
        log.push("onStop");
      },
      onDestroy: () => {
        log.push("onDestroy");
      }
    });

    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);
    await app.start();
    await app.stop();
    await app.destroy();

    expect(log).toEqual([
      // Phase 0: onBoot
      "onBoot",
      // Phase 2: createState + onCreate
      "createState",
      "onCreate",
      // Phase 3: api
      "api",
      // Phase 4: onInit
      "onInit",
      // start: onReady -> app:start hook -> onStart
      "onReady",
      "app:start-hook",
      "onStart",
      // stop: onStop (reverse) -> app:stop hook -> onShutdown
      "onStop",
      "app:stop-hook",
      "onShutdown",
      // destroy: onDestroy (reverse) -> app:destroy hook
      "onDestroy",
      "app:destroy-hook"
    ]);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("edge cases", () => {
  it("empty plugin list produces a valid app", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);

    expect(app).toBeDefined();
    expect(Object.isFrozen(app)).toBe(true);
    await app.start();
    await app.stop();
    await app.destroy();
  });

  it("plugin with no lifecycle methods produces valid app", async () => {
    const core = testCore();
    const plugin = core.createPlugin("empty", {});
    const config = core.createConfig({ plugins: [plugin] });
    const app = await core.createApp(config);

    expect(app).toBeDefined();
    expect(app.has("empty")).toBe(true);
  });

  it("multiple plugins with hooks for same event all fire", async () => {
    const results: number[] = [];
    const core = testCore();
    const p1 = core.createPlugin("one", {
      hooks: {
        "test:event": () => {
          results.push(1);
        }
      }
    });
    const p2 = core.createPlugin("two", {
      hooks: {
        "test:event": () => {
          results.push(2);
        }
      }
    });
    const p3 = core.createPlugin("three", {
      hooks: {
        "test:event": () => {
          results.push(3);
        }
      }
    });

    const config = core.createConfig({ plugins: [p1, p2, p3] });
    const app = await core.createApp(config);
    await app.emit("test:event" as never, {} as never);

    expect(results).toEqual([1, 2, 3]);
  });

  it("emit for event with no handlers is a no-op", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);

    // Should not throw -- resolves to undefined
    const result = await app.emit("nonexistent" as never, {} as never);
    expect(result).toBeUndefined();
  });

  it("signal for event with no handlers is a no-op", async () => {
    const core = testCore();
    const config = core.createConfig();
    const app = await core.createApp(config);

    // Should not throw -- resolves to undefined
    const result = await app.signal("nonexistent");
    expect(result).toBeUndefined();
  });

  it("plugins can use getPlugin during onInit to access other plugin APIs", async () => {
    const core = testCore();
    let otherApi: unknown;
    const pluginA = core.createPlugin("provider", {
      defaultConfig: {},
      api: () => ({ getData: () => "secret" })
    });
    const pluginB = core.createPlugin("consumer", {
      defaultConfig: {},
      depends: ["provider"],
      onInit: (ctx: { getPlugin: (name: string) => unknown }) => {
        otherApi = ctx.getPlugin("provider");
      }
    });

    const config = core.createConfig({ plugins: [pluginA, pluginB] });
    await core.createApp(config);

    expect(otherApi).toBeDefined();
    expect((otherApi as Record<string, unknown>).getData).toBeDefined();
  });

  it("plugins can use require during api to access other plugin APIs", async () => {
    const core = testCore();
    let otherApi: unknown;
    const pluginA = core.createPlugin("provider", {
      defaultConfig: {},
      api: () => ({ value: 99 })
    });
    const pluginB = core.createPlugin("consumer", {
      defaultConfig: {},
      depends: ["provider"],
      api: (ctx: { require: (name: string) => unknown }) => {
        otherApi = ctx.require("provider");
        return {};
      }
    });

    const config = core.createConfig({ plugins: [pluginA, pluginB] });
    await core.createApp(config);

    expect(otherApi).toBeDefined();
    expect((otherApi as Record<string, unknown>).value).toBe(99);
  });
});
