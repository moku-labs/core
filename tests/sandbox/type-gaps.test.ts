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
  type BEvents = { "b:action": { x: number } };
  type CEvents = { "c:action": { y: string } };

  const pluginB = cp("b-events", {
    events: register => register.map<BEvents>({ "b:action": "B action" }),
    api: ctx => ({
      fireB: () => {
        ctx.emit("b:action", { x: 1 });
      }
    })
  });

  const pluginC = cp("c-events", {
    events: register => register.map<CEvents>({ "c:action": "C action" }),
    api: ctx => ({
      fireC: () => {
        ctx.emit("c:action", { y: "hello" });
      }
    })
  });

  it("plugin depending on B and C can emit both event types", () => {
    const pluginD = cp("d-diamond", {
      depends: [pluginB, pluginC],
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
      depends: [pluginB, pluginC],
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
    const app = createApp();

    app.require(pluginB).fireB();
    app.require(pluginC).fireC();

    expect(receivedB).toHaveLength(1);
    expect(receivedB[0]?.x).toBe(1);
    expect(receivedC).toHaveLength(1);
    expect(receivedC[0]?.y).toBe("hello");
  });

  it("rejects wrong payload types for diamond dependency events", () => {
    const plugin = cp("d-wrong-payloads", {
      depends: [pluginB, pluginC],
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
  type EventsOnlyEvents = { "events-only:fired": { data: string } };

  const eventsOnlyPlugin = cp("events-only", {
    events: register =>
      register.map<EventsOnlyEvents>({ "events-only:fired": "Events-only event" }),
    onInit: ctx => {
      ctx.emit("events-only:fired", { data: "init" });
    }
  });

  it("dependent plugin can emit events-only plugin's events", () => {
    const listener = cp("eo-listener", {
      depends: [eventsOnlyPlugin],
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
      depends: [eventsOnlyPlugin],
      api: () => ({ noop: () => {} })
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [eventsOnlyPlugin, withApi]
    });
    const app = createApp();

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
  type SourceEvents = { "source:custom": { detail: string } };

  const eventSource = cp("event-source", {
    events: register => register.map<SourceEvents>({ "source:custom": "Source-specific event" }),
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
      depends: [eventSource],
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
      depends: [preciseApi],
      api: ctx => {
        const api = ctx.require(preciseApi);

        expectTypeOf(api.add).toEqualTypeOf<(item: string) => void>();
        expectTypeOf(api.getAll).returns.toEqualTypeOf<string[]>();
        expectTypeOf(api.count).returns.toBeNumber();
        expectTypeOf(api.find).toEqualTypeOf<(predicate: (s: string) => boolean) => string[]>();

        return { check: () => true };
      }
    });
  });

  it("app.require() returns exact parameter and return types", async () => {
    const { createApp } = cc.createCore(cc, { plugins: [preciseApi] });
    const app = createApp();

    const api = app.require(preciseApi);
    expectTypeOf(api.add).toEqualTypeOf<(item: string) => void>();
    expectTypeOf(api.getAll).returns.toEqualTypeOf<string[]>();
    expectTypeOf(api.count).returns.toBeNumber();
    expectTypeOf(api.find).toEqualTypeOf<(predicate: (s: string) => boolean) => string[]>();
  });

  it("app.pluginName methods have exact types", async () => {
    const { createApp } = cc.createCore(cc, { plugins: [preciseApi] });
    const app = createApp();

    expectTypeOf(app["precise-api"].add).toEqualTypeOf<(item: string) => void>();
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

    const app = createApp({ plugins: [blogPlugin] });

    // Extra plugin API is fully typed
    expectTypeOf(app.blog.list).toBeFunction();
    expectTypeOf(app.blog.list).returns.toEqualTypeOf<string[]>();
    expectTypeOf(app.blog.getById).toEqualTypeOf<(id: string) => { id: string; title: string }>();
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
    const app = createApp();

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
  // FIXED: HookHandlerMap generic on BoundCreatePluginFunction captures the
  // return object's keys and maps unknown event names to `never`, catching them
  // at compile time. Previously this was a TS limitation with mapped types.

  it("hooks with ONLY unknown keys are rejected (error on function)", () => {
    const plugin = cp("only-bad-hooks", {
      // @ts-expect-error -- hooks return has no valid keys
      hooks: _ctx => ({
        "nonexistent:event": (_payload: unknown) => {}
      })
    });
    expect(plugin.name).toBe("only-bad-hooks");
  });

  it("hooks with valid + unknown keys: unknown keys ARE now rejected", () => {
    const plugin = cp("mixed-hook-keys", {
      // @ts-expect-error -- "fake:event" is not a known event, mapped to never
      hooks: _ctx => ({
        "global:action": _payload => {},
        "fake:event": (_payload: unknown) => {}
      })
    });
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
    const app = createApp();

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

    const app = createApp({
      pluginConfigs: {
        "has-config": { timeout: 3000 }
      }
    });

    expect(app).toBeDefined();
  });

  it("pluginConfigs rejects any key for config-less plugins", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [withConfig, withoutConfig]
    });

    // FIXED: Filter now uses `ExtractConfig<K> extends Record<string, never>`
    // which matches the config-less default. The key "no-config" is fully
    // excluded from pluginConfigs — error is on the key, not just the value.
    const app = createApp({
      pluginConfigs: {
        // @ts-expect-error -- "no-config" is not a valid key (config-less plugin excluded)
        "no-config": { anything: true }
      }
    });
    expect(app).toBeDefined();
  });

  it("pluginConfigs rejects even empty object for config-less plugins", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [withConfig, withoutConfig]
    });

    // FIXED: Previously {} was accepted because {} satisfies Partial<Record<string, never>>.
    // Now "no-config" is excluded from the key set entirely.
    const app = createApp({
      pluginConfigs: {
        // @ts-expect-error -- "no-config" is not a valid key (config-less plugin excluded)
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

  type ChainAEvents = { "chain-a:event": { aData: number } };
  type ChainBEvents = { "chain-b:event": { bData: string } };

  it("B's phantom events contain only B's own events (diagnostic)", () => {
    const pluginA = cp("chain-a-diag", {
      events: register => register.map<ChainAEvents>({ "chain-a:event": "Chain A event" }),
      api: () => ({ aMethod: () => "a" })
    });

    const pluginB = cp("chain-b-diag", {
      depends: [pluginA],
      events: register => register.map<ChainBEvents>({ "chain-b:event": "Chain B event" }),
      api: () => ({ bMethod: () => "b" })
    });

    // Verify B's phantom only carries B's own events
    expectTypeOf(pluginB._phantom.events).toEqualTypeOf<{
      "chain-b:event": { bData: string };
    }>();
  });

  it("C depending only on B sees B's events and global events", () => {
    const pluginA = cp("chain-a-iso", {
      events: register => register.map<ChainAEvents>({ "chain-a:event": "Chain A event" }),
      api: () => ({ aMethod: () => "a" })
    });

    const pluginB = cp("chain-b-iso", {
      depends: [pluginA],
      events: register => register.map<ChainBEvents>({ "chain-b:event": "Chain B event" }),
      api: () => ({ bMethod: () => "b" })
    });

    const pluginC = cp("chain-c-iso", {
      depends: [pluginB],
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
      events: register => register.map<ChainAEvents>({ "chain-a:event": "Chain A event" }),
      api: () => ({ aMethod: () => "a" })
    });

    const pluginB = cp("chain-b-both", {
      depends: [pluginA],
      events: register => register.map<ChainBEvents>({ "chain-b:event": "Chain B event" }),
      api: () => ({ bMethod: () => "b" })
    });

    const pluginC = cp("chain-c-both", {
      depends: [pluginA, pluginB],
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
      events: register => register.map<ChainAEvents>({ "chain-a:event": "Chain A event" }),
      api: () => ({ aMethod: () => "a" })
    });

    const pluginB = cp("chain-b-rt", {
      depends: [pluginA],
      events: register => register.map<ChainBEvents>({ "chain-b:event": "Chain B event" }),
      api: () => ({ bMethod: () => "b" })
    });

    const cPlugin = cp("chain-c-rt", {
      depends: [pluginB],
      hooks: _ctx => ({
        "chain-b:event": _payload => {}
      })
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [pluginA, pluginB, cPlugin]
    });
    const app = createApp();

    expect(app.has("chain-a-rt")).toBe(true);
    expect(app.has("chain-b-rt")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gap 12: Same event name from multiple plugins
// ---------------------------------------------------------------------------

describe("same event name from multiple plugins", () => {
  it("conflicting payload types collapse to never via UnionToIntersection", () => {
    type AlphaEvents = { "shared:update": { version: number } };
    type BetaEvents = { "shared:update": { version: string } };

    const pluginAlpha = cp("alpha", {
      events: register => register.map<AlphaEvents>({ "shared:update": "Alpha update" }),
      api: () => ({ noop: () => {} })
    });

    const pluginBeta = cp("beta", {
      events: register => register.map<BetaEvents>({ "shared:update": "Beta update" }),
      api: () => ({ noop: () => {} })
    });

    const consumer = cp("conflict-consumer", {
      depends: [pluginAlpha, pluginBeta],
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
    type NotifyEvents = { "common:notify": { message: string } };

    const pluginGamma = cp("gamma", {
      events: register => register.map<NotifyEvents>({ "common:notify": "Gamma notification" }),
      api: () => ({ noop: () => {} })
    });

    const pluginDelta = cp("delta", {
      events: register => register.map<NotifyEvents>({ "common:notify": "Delta notification" }),
      api: () => ({ noop: () => {} })
    });

    const consumer = cp("compat-consumer", {
      depends: [pluginGamma, pluginDelta],
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

// ---------------------------------------------------------------------------
// Gap 13: Callback context has typed plugin APIs
// ---------------------------------------------------------------------------

describe("callback context has typed plugin APIs", () => {
  const routerPlugin = cp("router", {
    config: { basePath: "/" },
    api: ctx => ({
      navigate: (path: string) => path,
      current: () => ctx.config.basePath
    })
  });

  const authPlugin = cp("auth", {
    api: () => ({
      isLoggedIn: () => false,
      login: (user: string) => user
    })
  });

  it("onReady callback context has typed plugin APIs", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [routerPlugin, authPlugin]
    });

    const app = createApp({
      onReady: ctx => {
        // Plugin APIs should be on the context
        expectTypeOf(ctx.router.navigate).toBeFunction();
        expectTypeOf(ctx.router.navigate).toEqualTypeOf<(path: string) => string>();
        expectTypeOf(ctx.auth.isLoggedIn).returns.toBeBoolean();

        // Config should be typed
        expectTypeOf(ctx.config).toEqualTypeOf<Readonly<TestConfig>>();

        // Emit should be typed
        ctx.emit("global:action", { id: "ready" });
      }
    });

    expect(app).toBeDefined();
  });

  it("onStart callback context has typed plugin APIs", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [routerPlugin, authPlugin]
    });

    const app = createApp({
      onStart: ctx => {
        expectTypeOf(ctx.router.current).returns.toBeString();
        expectTypeOf(ctx.auth.login).toEqualTypeOf<(user: string) => string>();
      }
    });

    await app.start();
    expect(app).toBeDefined();
  });

  it("onStop callback context has typed plugin APIs", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [routerPlugin, authPlugin]
    });

    const app = createApp({
      onStop: ctx => {
        expectTypeOf(ctx.router.navigate).toBeFunction();
        expectTypeOf(ctx.auth.isLoggedIn).toBeFunction();
      }
    });

    await app.start();
    await app.stop();
    expect(app).toBeDefined();
  });

  it("onError callback receives Error and typed context", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [routerPlugin]
    });

    const app = createApp({
      onError: (error, ctx) => {
        expectTypeOf(error).toEqualTypeOf<Error>();
        expectTypeOf(ctx.router.navigate).toBeFunction();
        expectTypeOf(ctx.config).toEqualTypeOf<Readonly<TestConfig>>();
      }
    });

    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Gap 14: `as const` not required on depends
// ---------------------------------------------------------------------------

describe("as const not required on depends", () => {
  // The `const` modifier on `PluginName` in BoundCreatePluginFunction narrows
  // ALL inferred types in the generic call, including the depends tuple.
  // This means `as const` is unnecessary — TypeScript infers specific plugin
  // types from the array without it.

  type DepEvents = { "dep:fired": { value: number } };

  const depPlugin = cp("dep-target", {
    events: register => register.map<DepEvents>({ "dep:fired": "Dep event" }),
    api: () => ({
      getValue: () => 42,
      format: (n: number) => `#${n}`
    })
  });

  it("require() returns exact API types without as const", () => {
    const consumer = cp("dep-require", {
      depends: [depPlugin],
      api: ctx => {
        const api = ctx.require(depPlugin);
        expectTypeOf(api.getValue).returns.toBeNumber();
        expectTypeOf(api.format).toEqualTypeOf<(n: number) => string>();
        expectTypeOf(api.format).returns.toBeString();
        return {};
      }
    });
    expect(consumer.name).toBe("dep-require");
  });

  it("dependency events are visible without as const", () => {
    const consumer = cp("dep-events", {
      depends: [depPlugin],
      api: ctx => ({
        test: () => {
          ctx.emit("dep:fired", { value: 1 });
        }
      })
    });
    expect(consumer.name).toBe("dep-events");
  });

  it("hooks on dependency events are typed without as const", () => {
    const consumer = cp("dep-hooks", {
      depends: [depPlugin],
      hooks: _ctx => ({
        "dep:fired": payload => {
          expectTypeOf(payload).toEqualTypeOf<{ value: number }>();
        }
      })
    });
    expect(consumer.name).toBe("dep-hooks");
  });
});

// ---------------------------------------------------------------------------
// Gap 15: Sub-plugin API visibility on app surface
// ---------------------------------------------------------------------------

describe("all plugins listed explicitly have full type visibility", () => {
  const childPlugin = cp("child", {
    api: () => ({
      childMethod: () => "from-child"
    })
  });

  const parentPlugin = cp("parent", {
    depends: [childPlugin],
    api: ctx => ({
      parentMethod: () => "from-parent",
      childValue: () => ctx.require(childPlugin).childMethod()
    })
  });

  it("both parent and child APIs are typed on app surface", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [childPlugin, parentPlugin]
    });
    const app = createApp();

    expectTypeOf(app.parent.parentMethod).toBeFunction();
    expectTypeOf(app.parent.parentMethod).returns.toBeString();
    expectTypeOf(app.child.childMethod).toBeFunction();
    expectTypeOf(app.child.childMethod).returns.toBeString();

    expect(app.parent.parentMethod()).toBe("from-parent");
    expect(app.child.childMethod()).toBe("from-child");
    expect(app.parent.childValue()).toBe("from-child");
  });

  it("require() works for both parent and child", async () => {
    const { createApp } = cc.createCore(cc, {
      plugins: [childPlugin, parentPlugin]
    });
    const app = createApp();

    const childApi = app.require(childPlugin);
    const parentApi = app.require(parentPlugin);

    expectTypeOf(childApi.childMethod).toBeFunction();
    expectTypeOf(parentApi.parentMethod).toBeFunction();

    expect(childApi.childMethod()).toBe("from-child");
    expect(parentApi.parentMethod()).toBe("from-parent");
  });
});

// ---------------------------------------------------------------------------
// Gap 16: register.map<Events>() bulk event registration
// ---------------------------------------------------------------------------

describe("register.map<Events>() bulk event registration", () => {
  type MapEvents = {
    "map:created": { id: string };
    "map:deleted": { id: string; reason: string };
  };

  it("infers correct PluginEventMap from register.map", () => {
    const plugin = cp("map-basic", {
      events: register =>
        register.map<MapEvents>({
          "map:created": "Item created",
          "map:deleted": "Item deleted"
        }),
      api: ctx => ({
        create: (id: string) => {
          ctx.emit("map:created", { id });
        },
        remove: (id: string) => {
          ctx.emit("map:deleted", { id, reason: "user" });
        }
      })
    });

    // Phantom events carry the correct type
    expectTypeOf(plugin._phantom.events).toEqualTypeOf<MapEvents>();
    expect(plugin.name).toBe("map-basic");
  });

  it("works without descriptions", () => {
    const plugin = cp("map-no-desc", {
      events: register => register.map<MapEvents>(),
      api: ctx => ({
        create: (id: string) => {
          ctx.emit("map:created", { id });
        }
      })
    });

    expectTypeOf(plugin._phantom.events).toEqualTypeOf<MapEvents>();
    expect(plugin.name).toBe("map-no-desc");
  });

  it("works with partial descriptions", () => {
    const plugin = cp("map-partial-desc", {
      events: register =>
        register.map<MapEvents>({
          "map:created": "Only this one has a description"
        }),
      api: () => ({})
    });

    expectTypeOf(plugin._phantom.events).toEqualTypeOf<MapEvents>();
    expect(plugin.name).toBe("map-partial-desc");
  });

  it("rejects wrong payload types in emit", () => {
    const plugin = cp("map-wrong-payload", {
      events: register => register.map<MapEvents>(),
      api: ctx => ({
        test: () => {
          // @ts-expect-error -- wrong payload: { name } is not { id: string }
          ctx.emit("map:created", { name: "wrong" });
          // @ts-expect-error -- missing field: reason is required
          ctx.emit("map:deleted", { id: "1" });
        }
      })
    });
    expect(plugin.name).toBe("map-wrong-payload");
  });

  it("rejects unknown event names in emit", () => {
    const plugin = cp("map-unknown-event", {
      events: register => register.map<MapEvents>(),
      api: ctx => ({
        test: () => {
          // @ts-expect-error -- "map:unknown" is not in MapEvents
          ctx.emit("map:unknown", {});
        }
      })
    });
    expect(plugin.name).toBe("map-unknown-event");
  });

  it("preserves hook typing for dependencies", () => {
    const source = cp("map-source", {
      events: register => register.map<MapEvents>(),
      api: ctx => ({
        create: (id: string) => {
          ctx.emit("map:created", { id });
        }
      })
    });

    const listener = cp("map-listener", {
      depends: [source],
      hooks: _ctx => ({
        "map:created": payload => {
          expectTypeOf(payload).toEqualTypeOf<{ id: string }>();
        },
        "map:deleted": payload => {
          expectTypeOf(payload).toEqualTypeOf<{ id: string; reason: string }>();
        }
      })
    });

    expect(listener.name).toBe("map-listener");
  });

  it("merges correctly with dependency events via depends", async () => {
    type SourceEvents = { "src:ping": { ts: number } };

    const sourcePlugin = cp("map-dep-source", {
      events: register => register.map<SourceEvents>(),
      api: ctx => ({
        ping: () => {
          ctx.emit("src:ping", { ts: Date.now() });
        }
      })
    });

    const consumer = cp("map-dep-consumer", {
      depends: [sourcePlugin],
      events: register => register.map<MapEvents>(),
      api: ctx => ({
        test: () => {
          // Own events via register.map
          ctx.emit("map:created", { id: "1" });
          // Dependency events
          ctx.emit("src:ping", { ts: 0 });
          // Global events
          ctx.emit("global:action", { id: "from-consumer" });
        }
      })
    });

    expectTypeOf(consumer._phantom.events).toEqualTypeOf<MapEvents>();
    expect(consumer.name).toBe("map-dep-consumer");
  });

  it("individual register<T>() still works alongside register.map", () => {
    // Backward compatibility: the old pattern is unaffected
    const plugin = cp("individual-register", {
      events: register => ({
        "old:event": register<{ value: number }>("Old style")
      }),
      api: ctx => ({
        fire: () => {
          ctx.emit("old:event", { value: 42 });
        }
      })
    });

    expectTypeOf(plugin._phantom.events).toEqualTypeOf<{ "old:event": { value: number } }>();
    expect(plugin.name).toBe("individual-register");
  });
});
