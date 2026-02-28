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

describe("integration placeholder", () => {
  it("confirms integration tier is wired", () => {
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multi-plugin lifecycle: partial start rollback
// ---------------------------------------------------------------------------

describe("partial start rollback", () => {
  it("rolls back already-started plugins when onStart throws", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onStart: () => {
        order.push("a:start");
      },
      onStop: () => {
        order.push("a:stop");
      }
    });
    const b = cc.createPlugin("b", {
      onStart: () => {
        order.push("b:start");
        throw new Error("b start failed");
      },
      onStop: () => {
        order.push("b:stop");
      }
    });
    const c = cc.createPlugin("c", {
      onStart: () => {
        order.push("c:start");
      },
      onStop: () => {
        order.push("c:stop");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b, c] });
    const app = await createApp();

    await expect(app.start()).rejects.toThrow("b start failed");

    // a started successfully and gets rolled back; b failed, not rolled back; c never started
    expect(order).toEqual(["a:start", "b:start", "a:stop"]);
  });

  it("app enters terminal state after partial start failure", async () => {
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onStart: () => {},
      onStop: () => {}
    });
    const b = cc.createPlugin("b", {
      onStart: () => {
        throw new Error("fail");
      }
    });

    const dummy = cc.createPlugin("dummy", {});

    const { createApp } = cc.createCore(cc, { plugins: [a, b] });
    const app = await createApp();

    await expect(app.start()).rejects.toThrow("fail");

    // App is terminal — all operations throw
    await expect(app.start()).rejects.toThrow("stopped");
    expect(() => app.emit("any", {})).toThrow("stopped");
    expect(() => app.has("any")).toThrow("stopped");
    expect(() => app.require(dummy)).toThrow("stopped");
  });

  it("rollback stop errors are reported via onError but don't replace start error", async () => {
    const errors: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onStart: () => {},
      onStop: () => {
        throw new Error("a stop failed");
      }
    });
    const b = cc.createPlugin("b", {
      onStart: () => {
        throw new Error("b start failed");
      }
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [a, b],
      onError: err => {
        errors.push(err.message);
      }
    });
    const app = await createApp();

    // The start error is the one that propagates
    await expect(app.start()).rejects.toThrow("b start failed");

    // The stop error during rollback was reported via onError
    expect(errors).toContain("a stop failed");
  });

  it("plugins without onStart still get onStop during rollback", async () => {
    const order: string[] = [];
    const cc = createTestCore();

    const a = cc.createPlugin("a", {
      onStart: () => {
        order.push("a:start");
      },
      onStop: () => {
        order.push("a:stop");
      }
    });
    // b has onStop but no onStart — should still get rolled back
    const b = cc.createPlugin("b", {
      onStop: () => {
        order.push("b:stop");
      }
    });
    const c = cc.createPlugin("c", {
      onStart: () => {
        order.push("c:start");
        throw new Error("c failed");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [a, b, c] });
    const app = await createApp();

    await expect(app.start()).rejects.toThrow("c failed");

    // a and b were before the failure point — both get onStop in reverse
    expect(order).toEqual(["a:start", "c:start", "b:stop", "a:stop"]);
  });
});

// ---------------------------------------------------------------------------
// Multi-plugin lifecycle: plugin API guard after stop
// ---------------------------------------------------------------------------

describe("plugin API guard after stop", () => {
  it("plugin API methods throw after stop", async () => {
    const cc = createTestCore();

    const counter = cc.createPlugin("counter", {
      createState: () => ({ count: 0 }),
      api: ctx => ({
        increment: () => {
          ctx.state.count += 1;
        },
        getCount: () => ctx.state.count
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [counter] });
    const app = await createApp();

    // Works before stop
    expect(app.counter.getCount()).toBe(0);
    app.counter.increment();
    expect(app.counter.getCount()).toBe(1);

    await app.start();
    await app.stop();

    // Throws after stop
    expect(() => app.counter.getCount()).toThrow("stopped");
    expect(() => app.counter.increment()).toThrow("stopped");
  });

  it("plugin API property access throws after stop", async () => {
    const cc = createTestCore();

    const plugin = cc.createPlugin("myplugin", {
      api: () => ({
        method: () => "hello"
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    const app = await createApp();

    await app.start();
    await app.stop();

    // Property access on mounted API throws
    expect(() => app.myplugin.method).toThrow("stopped");
  });

  it("plugin APIs throw after partial start failure", async () => {
    const cc = createTestCore();

    const good = cc.createPlugin("good", {
      api: () => ({
        value: () => 42
      }),
      onStop: () => {}
    });
    const bad = cc.createPlugin("bad", {
      onStart: () => {
        throw new Error("start failed");
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [good, bad] });
    const app = await createApp();

    // Works before start
    expect(app.good.value()).toBe(42);

    // Start fails, triggers rollback
    await expect(app.start()).rejects.toThrow("start failed");

    // API is guarded after rollback
    expect(() => app.good.value()).toThrow("stopped");
  });
});
