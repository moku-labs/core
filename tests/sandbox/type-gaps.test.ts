import { describe, expect, expectTypeOf, it } from "vitest";

import { createCoreConfig } from "../../src";

// =============================================================================
// Shared test framework setup
// =============================================================================

type TestConfig = { appName: string };
type TestEvents = { "global:action": { id: string } };

const cc = createCoreConfig<TestConfig, TestEvents>("type-test", {
  config: { appName: "TypeTest" }
});
const cp = cc.createPlugin;

// ---------------------------------------------------------------------------
// Gap 1: Diamond dependency event merging
// ---------------------------------------------------------------------------

describe("diamond dependency event merging", () => {
  const pluginB = cp("b-events", {
    events: register => ({
      "b:action": register<{ x: number }>("B action")
    }),
    api: ctx => ({
      fireB: () => {
        ctx.emit("b:action", { x: 1 });
      }
    })
  });

  const pluginC = cp("c-events", {
    events: register => ({
      "c:action": register<{ y: string }>("C action")
    }),
    api: ctx => ({
      fireC: () => {
        ctx.emit("c:action", { y: "hello" });
      }
    })
  });

  it("plugin depending on B and C can emit both event types", () => {
    const pluginD = cp("d-diamond", {
      depends: [pluginB, pluginC] as const,
      api: ctx => ({
        emitBoth: () => {
          ctx.emit("b:action", { x: 42 });
          ctx.emit("c:action", { y: "world" });
          ctx.emit("global:action", { id: "from-d" });
        }
      })
    });

    expect(pluginD.name).toBe("d-diamond");
  });

  it("hook payloads are typed for both dependency event sources", async () => {
    const receivedB: Array<{ x: number }> = [];
    const receivedC: Array<{ y: string }> = [];

    const pluginD = cp("d-hooks", {
      depends: [pluginB, pluginC] as const,
      hooks: _ctx => ({
        "b:action": payload => {
          expectTypeOf(payload).toEqualTypeOf<{ x: number }>();
          receivedB.push(payload);
        },
        "c:action": payload => {
          expectTypeOf(payload).toEqualTypeOf<{ y: string }>();
          receivedC.push(payload);
        }
      })
    });

    const { createApp } = cc.createCore(cc, { plugins: [pluginB, pluginC, pluginD] });
    const app = await createApp();

    app.require(pluginB).fireB();
    app.require(pluginC).fireC();

    expect(receivedB).toHaveLength(1);
    expect(receivedB[0]?.x).toBe(1);
    expect(receivedC).toHaveLength(1);
    expect(receivedC[0]?.y).toBe("hello");
  });

  it("rejects wrong payload types for diamond dependency events", () => {
    const plugin = cp("d-wrong-payloads", {
      depends: [pluginB, pluginC] as const,
      api: ctx => ({
        test: () => {
          // @ts-expect-error -- x should be number, not string
          ctx.emit("b:action", { x: "wrong" });
          // @ts-expect-error -- y should be string, not number
          ctx.emit("c:action", { y: 123 });
        }
      })
    });
    expect(plugin.name).toBe("d-wrong-payloads");
  });
});

// ---------------------------------------------------------------------------
// Gap 2: Events-only plugin (no API)
// ---------------------------------------------------------------------------

describe("events-only plugin (no API)", () => {
  const eventsOnlyPlugin = cp("events-only", {
    events: register => ({
      "events-only:fired": register<{ data: string }>("Events-only event")
    }),
    onInit: ctx => {
      ctx.emit("events-only:fired", { data: "init" });
    }
  });

  it("dependent plugin can emit events-only plugin's events", () => {
    const listener = cp("eo-listener", {
      depends: [eventsOnlyPlugin] as const,
      api: ctx => ({
        trigger: () => {
          ctx.emit("events-only:fired", { data: "from-listener" });
        }
      })
    });

    expect(listener.name).toBe("eo-listener");
  });

  it("events-only plugin does NOT appear on app surface", async () => {
    const withApi = cp("eo-with-api", {
      depends: [eventsOnlyPlugin] as const,
      api: () => ({ noop: () => {} })
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [eventsOnlyPlugin, withApi]
    });
    const app = await createApp();

    // Plugin with API appears on surface
    expectTypeOf(app).toHaveProperty("eo-with-api");

    // Events-only plugin is registered but NOT on app surface
    expect(app.has("events-only")).toBe(true);
    // @ts-expect-error -- "events-only" has no API, excluded from BuildPluginApis
    app["events-only"];
  });
});

// ---------------------------------------------------------------------------
// Gap 3: Non-dependency events are inaccessible
// ---------------------------------------------------------------------------

describe("non-dependency events are inaccessible", () => {
  const eventSource = cp("event-source", {
    events: register => ({
      "source:custom": register<{ detail: string }>("Source-specific event")
    }),
    api: () => ({ noop: () => {} })
  });

  it("plugin without dependency cannot emit dependency-specific events", () => {
    const plugin = cp("unrelated-emitter", {
      // No depends on eventSource
      api: ctx => ({
        attempt: () => {
          // Global events are fine
          ctx.emit("global:action", { id: "ok" });
          // @ts-expect-error -- "source:custom" is not in global events and not a dependency
          ctx.emit("source:custom", { detail: "should-fail" });
        }
      })
    });
    expect(plugin.name).toBe("unrelated-emitter");
  });

  it("plugin without dependency cannot hook dependency-specific events", () => {
    const plugin = cp("unrelated-hooker", {
      // No depends on eventSource
      // @ts-expect-error -- hooks return has no valid keys (only unknown event "source:custom")
      hooks: _ctx => ({
        "source:custom": (_payload: unknown) => {}
      })
    });
    expect(plugin.name).toBe("unrelated-hooker");
  });

  it("plugin WITH dependency CAN emit and hook those events", () => {
    const plugin = cp("related-emitter", {
      depends: [eventSource] as const,
      api: ctx => ({
        emitSource: () => {
          ctx.emit("source:custom", { detail: "allowed" });
        }
      }),
      hooks: _ctx => ({
        "source:custom": _payload => {
          // This compiles -- dependency events are visible
        }
      })
    });
    expect(plugin.name).toBe("related-emitter");
  });
});

// ---------------------------------------------------------------------------
// Gap 4: Precise require() return types
// ---------------------------------------------------------------------------

describe("precise require() return types", () => {
  const preciseApi = cp("precise-api", {
    createState: () => ({ items: [] as string[] }),
    api: ctx => ({
      add: (item: string) => {
        ctx.state.items.push(item);
      },
      getAll: () => ctx.state.items,
      count: () => ctx.state.items.length,
      find: (predicate: (s: string) => boolean) => ctx.state.items.filter(s => predicate(s))
    })
  });

  it("ctx.require() returns exact parameter and return types", () => {
    cp("precise-consumer", {
      depends: [preciseApi] as const,
      api: ctx => {
        const api = ctx.require(preciseApi);

        expectTypeOf(api.add).parameter(0).toBeString();
        expectTypeOf(api.getAll).returns.toEqualTypeOf<string[]>();
        expectTypeOf(api.count).returns.toBeNumber();
        expectTypeOf(api.find).parameter(0).toEqualTypeOf<(s: string) => boolean>();
        expectTypeOf(api.find).returns.toEqualTypeOf<string[]>();

        return { check: () => true };
      }
    });
  });

  it("app.require() returns exact parameter and return types", async () => {
    const { createApp } = cc.createCore(cc, { plugins: [preciseApi] });
    const app = await createApp();

    const api = app.require(preciseApi);
    expectTypeOf(api.add).parameter(0).toBeString();
    expectTypeOf(api.getAll).returns.toEqualTypeOf<string[]>();
    expectTypeOf(api.count).returns.toBeNumber();
    expectTypeOf(api.find).parameter(0).toEqualTypeOf<(s: string) => boolean>();
    expectTypeOf(api.find).returns.toEqualTypeOf<string[]>();
  });

  it("app.pluginName methods have exact types", async () => {
    const { createApp } = cc.createCore(cc, { plugins: [preciseApi] });
    const app = await createApp();

    expectTypeOf(app["precise-api"].add).parameter(0).toBeString();
    expectTypeOf(app["precise-api"].getAll).returns.toEqualTypeOf<string[]>();
    expectTypeOf(app["precise-api"].count).returns.toBeNumber();
  });
});

// ---------------------------------------------------------------------------
// Gap 5: Consumer extra plugin typing
// ---------------------------------------------------------------------------

describe("consumer extra plugin typing", () => {
  it("extra plugins added via createApp are typed on the app object", async () => {
    const { createApp, createPlugin } = await import("./demo/moku-web/index");

    const blogPlugin = createPlugin("blog", {
      api: () => ({
        list: () => ["post-1", "post-2"],
        getById: (id: string) => ({ id, title: "Post" })
      })
    });

    const app = await createApp({ plugins: [blogPlugin] });

    // Extra plugin API is fully typed
    expectTypeOf(app.blog.list).toBeFunction();
    expectTypeOf(app.blog.list).returns.toEqualTypeOf<string[]>();
    expectTypeOf(app.blog.getById).parameter(0).toBeString();
    expectTypeOf(app.blog.getById).returns.toEqualTypeOf<{ id: string; title: string }>();

    // Framework defaults are still typed
    expectTypeOf(app.router.navigate).toBeFunction();
    expectTypeOf(app.router.current).toBeFunction();

    // Runtime: both work
    expect(app.blog.list()).toEqual(["post-1", "post-2"]);
    expect(app.router.current()).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Gap 6: No-API plugin excluded from app surface
// ---------------------------------------------------------------------------

describe("no-API plugin excluded from app surface", () => {
  it("lifecycle-only plugin is not on app.pluginName", async () => {
    const lifecycleOnly = cp("lifecycle-only", {
      onInit: () => {},
      onStart: () => {},
      onStop: () => {}
    });

    const withApi = cp("with-api", {
      api: () => ({ hello: () => "world" })
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [lifecycleOnly, withApi]
    });
    const app = await createApp();

    // Plugin with API appears on surface
    expectTypeOf(app["with-api"].hello).toBeFunction();
    expect(app["with-api"].hello()).toBe("world");

    // Lifecycle-only plugin does NOT appear on app surface
    // @ts-expect-error -- "lifecycle-only" has no API, excluded from BuildPluginApis
    app["lifecycle-only"];

    // But it IS still registered
    expect(app.has("lifecycle-only")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap 7: Hooks key constraint rejects unknown events
// ---------------------------------------------------------------------------

describe("hooks key constraint rejects unknown events", () => {
  // FINDING: TypeScript's mapped type excess property checking is inconsistent.
  // When hooks return an object with ONLY unknown keys, the error fires at the
  // function level (proven in Gap 3). But when there's a MIX of valid and
  // unknown keys, TypeScript does NOT flag the unknown keys. This is a known
  // TypeScript limitation with mapped types — documented here for awareness.

  it("hooks with ONLY unknown keys are rejected (error on function)", () => {
    const plugin = cp("only-bad-hooks", {
      // @ts-expect-error -- hooks return has no valid keys
      hooks: _ctx => ({
        "nonexistent:event": (_payload: unknown) => {}
      })
    });
    expect(plugin.name).toBe("only-bad-hooks");
  });

  it("hooks with valid + unknown keys: unknown keys are NOT rejected (TS limitation)", () => {
    // This test DOCUMENTS the behavior, not enforces it.
    // TypeScript's mapped type excess property checking does not catch
    // unknown keys when valid keys are also present in the return object.
    const plugin = cp("mixed-hook-keys", {
      hooks: _ctx => ({
        "global:action": _payload => {},
        // No @ts-expect-error here: TypeScript allows this despite "fake:event"
        // not being in the merged event map. The payload is typed as `unknown`
        // (not the specific event payload), which is the only hint something is wrong.
        "fake:event": (_payload: unknown) => {}
      })
    });
    // The test passes to document this known limitation.
    expect(plugin.name).toBe("mixed-hook-keys");
  });
});

// ---------------------------------------------------------------------------
// Gap 8: Empty spec plugin inferred types
// ---------------------------------------------------------------------------

describe("empty spec plugin inferred types", () => {
  it("createPlugin with empty spec infers correct defaults", () => {
    const emptyPlugin = cp("empty", {});

    // Name is literal
    expectTypeOf(emptyPlugin.name).toEqualTypeOf<"empty">();

    // Runtime: name matches
    expect(emptyPlugin.name).toBe("empty");
  });

  it("empty-spec plugin is excluded from app surface", async () => {
    const emptyPlugin = cp("empty-surface", {});

    const withApi = cp("surface-api", {
      api: () => ({ hello: () => "hi" })
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [emptyPlugin, withApi]
    });
    const app = await createApp();

    // @ts-expect-error -- empty API means excluded from app surface
    app["empty-surface"];

    // But it IS registered
    expect(app.has("empty-surface")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap 9: ctx.state exact type
// ---------------------------------------------------------------------------

describe("ctx.state exact type", () => {
  it("state fields have exact inferred types", () => {
    cp("exact-state", {
      createState: () => ({
        count: 0,
        items: [] as string[],
        metadata: { created: new Date() },
        optional: undefined as string | undefined
      }),
      api: ctx => {
        // Exact type assertions on each field
        expectTypeOf(ctx.state.count).toEqualTypeOf<number>();
        expectTypeOf(ctx.state.items).toEqualTypeOf<string[]>();
        expectTypeOf(ctx.state.metadata).toEqualTypeOf<{ created: Date }>();
        expectTypeOf(ctx.state.optional).toEqualTypeOf<string | undefined>();

        // @ts-expect-error -- nonExistent is not in state
        ctx.state.nonExistent;

        return {};
      }
    });
  });

  it("state is mutable", () => {
    const plugin = cp("mutable-state", {
      createState: () => ({ count: 0, items: [] as string[] }),
      api: ctx => {
        // Assignments compile (state is mutable)
        ctx.state.count = 5;
        ctx.state.items.push("test");
        ctx.state.items = ["new"];

        return {};
      }
    });
    expect(plugin.name).toBe("mutable-state");
  });
});

// ---------------------------------------------------------------------------
// Gap 10: pluginConfigs excludes void-config plugins
// ---------------------------------------------------------------------------

describe("pluginConfigs excludes void-config plugins", () => {
  const withConfig = cp("has-config", {
    config: { timeout: 5000 },
    api: () => ({ noop: () => {} })
  });

  const withoutConfig = cp("no-config", {
    api: () => ({ noop: () => {} })
  });

  it("pluginConfigs accepts keys for plugins with config", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [withConfig, withoutConfig]
    });

    const app = await createApp({
      pluginConfigs: {
        "has-config": { timeout: 3000 }
      }
    });

    expect(app).toBeDefined();
  });

  it("pluginConfigs rejects non-empty overrides for config-less plugins", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [withConfig, withoutConfig]
    });

    // NOTE: The "no-config" key IS present in pluginConfigs (filter checks
    // ExtractConfig<K> extends void, but config-less plugins have
    // Record<string, never>, not void). However, the VALUE type is
    // Partial<Record<string, never>> = { [key: string]?: never }, which makes
    // any non-empty object a type error. The type error is on the value, not the key.
    const app = await createApp({
      pluginConfigs: {
        // @ts-expect-error -- value type is Partial<Record<string, never>>; true is not never
        "no-config": { anything: true }
      }
    });
    expect(app).toBeDefined();
  });

  it("pluginConfigs accepts empty object for config-less plugins (accidental)", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [withConfig, withoutConfig]
    });

    // This compiles because {} satisfies Partial<Record<string, never>>.
    // Ideally, "no-config" should be excluded from pluginConfigs entirely,
    // but the filter uses `extends void` while config-less plugins have
    // Record<string, never>. This is a minor type system gap to address
    // during refactoring.
    const app = await createApp({
      pluginConfigs: {
        "no-config": {}
      }
    });

    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Gap 11: Transitive dependency event isolation
// ---------------------------------------------------------------------------

describe("transitive dependency event isolation", () => {
  // Diagnostic: verify what ExtractPluginEvents sees on pluginB's phantom type.
  // If B stores only its own events (not A's), C should not see A's events.

  it("B's phantom events contain only B's own events (diagnostic)", () => {
    const pluginA = cp("chain-a-diag", {
      events: register => ({
        "chain-a:event": register<{ aData: number }>("Chain A event")
      }),
      api: () => ({ aMethod: () => "a" })
    });

    const pluginB = cp("chain-b-diag", {
      depends: [pluginA] as const,
      events: register => ({
        "chain-b:event": register<{ bData: string }>("Chain B event")
      }),
      api: () => ({ bMethod: () => "b" })
    });

    // Verify B's phantom only carries B's own events
    expectTypeOf(pluginB._phantom.events).toEqualTypeOf<{
      "chain-b:event": { bData: string };
    }>();
  });

  it("C depending only on B sees B's events and global events", () => {
    const pluginA = cp("chain-a-iso", {
      events: register => ({
        "chain-a:event": register<{ aData: number }>("Chain A event")
      }),
      api: () => ({ aMethod: () => "a" })
    });

    const pluginB = cp("chain-b-iso", {
      depends: [pluginA] as const,
      events: register => ({
        "chain-b:event": register<{ bData: string }>("Chain B event")
      }),
      api: () => ({ bMethod: () => "b" })
    });

    const pluginC = cp("chain-c-iso", {
      depends: [pluginB] as const,
      api: ctx => ({
        test: () => {
          // C CAN emit B's events (direct dependency)
          ctx.emit("chain-b:event", { bData: "ok" });
          // C CAN emit global events
          ctx.emit("global:action", { id: "from-c" });

          // FINDING: TypeScript may or may not isolate transitive events.
          // If the next line compiles without error, it means transitive
          // events leak through the type system (a type system gap).
          // If it errors, transitive isolation works correctly.

          // Attempt to emit A's event from C (which only depends on B):
          // @ts-expect-error -- C should NOT see A's events (transitive, not direct)
          ctx.emit("chain-a:event", { aData: 1 });
        }
      })
    });
    expect(pluginC.name).toBe("chain-c-iso");
  });

  it("C depending on both A and B CAN emit A's events", () => {
    const pluginA = cp("chain-a-both", {
      events: register => ({
        "chain-a:event": register<{ aData: number }>("Chain A event")
      }),
      api: () => ({ aMethod: () => "a" })
    });

    const pluginB = cp("chain-b-both", {
      depends: [pluginA] as const,
      events: register => ({
        "chain-b:event": register<{ bData: string }>("Chain B event")
      }),
      api: () => ({ bMethod: () => "b" })
    });

    const pluginC = cp("chain-c-both", {
      depends: [pluginA, pluginB] as const,
      api: ctx => ({
        test: () => {
          // Direct dep on both: all events visible
          ctx.emit("chain-a:event", { aData: 1 });
          ctx.emit("chain-b:event", { bData: "ok" });
          ctx.emit("global:action", { id: "from-c" });
        }
      })
    });
    expect(pluginC.name).toBe("chain-c-both");
  });

  it("runtime: C depending on B still has access to all registered plugins", async () => {
    const pluginA = cp("chain-a-rt", {
      events: register => ({
        "chain-a:event": register<{ aData: number }>("Chain A event")
      }),
      api: () => ({ aMethod: () => "a" })
    });

    const pluginB = cp("chain-b-rt", {
      depends: [pluginA] as const,
      events: register => ({
        "chain-b:event": register<{ bData: string }>("Chain B event")
      }),
      api: () => ({ bMethod: () => "b" })
    });

    const cPlugin = cp("chain-c-rt", {
      depends: [pluginB] as const,
      hooks: _ctx => ({
        "chain-b:event": _payload => {}
      })
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [pluginA, pluginB, cPlugin]
    });
    const app = await createApp();

    expect(app.has("chain-a-rt")).toBe(true);
    expect(app.has("chain-b-rt")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap 12: Same event name from multiple plugins
// ---------------------------------------------------------------------------

describe("same event name from multiple plugins", () => {
  it("conflicting payload types collapse to never via UnionToIntersection", () => {
    const pluginAlpha = cp("alpha", {
      events: register => ({
        "shared:update": register<{ version: number }>("Alpha update")
      }),
      api: () => ({ noop: () => {} })
    });

    const pluginBeta = cp("beta", {
      events: register => ({
        "shared:update": register<{ version: string }>("Beta update")
      }),
      api: () => ({ noop: () => {} })
    });

    const consumer = cp("conflict-consumer", {
      depends: [pluginAlpha, pluginBeta] as const,
      api: ctx => ({
        test: () => {
          // version becomes number & string = never
          // @ts-expect-error -- number is not assignable to never
          ctx.emit("shared:update", { version: 42 });
          // @ts-expect-error -- string is not assignable to never
          ctx.emit("shared:update", { version: "v2" });
        }
      })
    });
    expect(consumer.name).toBe("conflict-consumer");
  });

  it("compatible payload types merge correctly", () => {
    const pluginGamma = cp("gamma", {
      events: register => ({
        "common:notify": register<{ message: string }>("Gamma notification")
      }),
      api: () => ({ noop: () => {} })
    });

    const pluginDelta = cp("delta", {
      events: register => ({
        "common:notify": register<{ message: string }>("Delta notification")
      }),
      api: () => ({ noop: () => {} })
    });

    const consumer = cp("compat-consumer", {
      depends: [pluginGamma, pluginDelta] as const,
      api: ctx => ({
        test: () => {
          // Same payload type: intersection preserves type
          ctx.emit("common:notify", { message: "hello" });
        }
      })
    });
    expect(consumer.name).toBe("compat-consumer");
  });
});
