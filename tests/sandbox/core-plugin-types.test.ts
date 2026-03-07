import { describe, expect, expectTypeOf, it } from "vitest";
import type { CoreApisFromTuple } from "../../src";
import { createCoreConfig, createCorePlugin } from "../../src";

// =============================================================================
// Core Plugin Type Tests
// =============================================================================
// Type-level assertions using expectTypeOf and @ts-expect-error to verify
// core plugin type inference, context injection, and compile-time constraints.
// =============================================================================

// ---------------------------------------------------------------------------
// CorePluginInstance phantom types
// ---------------------------------------------------------------------------

describe("CorePluginInstance phantom types", () => {
  it("name is inferred as literal string type", () => {
    const plugin = createCorePlugin("log", {
      api: () => ({ info: () => {} })
    });

    expectTypeOf(plugin.name).toEqualTypeOf<"log">();
  });

  it("config phantom carries the config shape", () => {
    const plugin = createCorePlugin("typed", {
      config: { level: "info" as string, verbose: true }
    });

    expectTypeOf(plugin._phantom.config).toEqualTypeOf<{
      level: string;
      verbose: boolean;
    }>();
  });

  it("api phantom carries the API shape", () => {
    const plugin = createCorePlugin("typed-api", {
      api: () => ({
        info: (msg: string) => msg,
        greet: (name: string) => `hello ${name}`
      })
    });

    // _phantom is {} at runtime but carries type info at compile time
    type Api = typeof plugin._phantom.api;
    expectTypeOf<Api["info"]>().toEqualTypeOf<(msg: string) => string>();
    expectTypeOf<Api["greet"]>().toEqualTypeOf<(name: string) => string>();
  });

  it("state phantom carries the state shape", () => {
    const plugin = createCorePlugin("typed-state", {
      createState: () => ({ entries: [] as string[], count: 0 })
    });

    expectTypeOf(plugin._phantom.state).toEqualTypeOf<{
      entries: string[];
      count: number;
    }>();
  });

  it("_corePlugin brand is true literal type", () => {
    const plugin = createCorePlugin("branded", {});

    expectTypeOf(plugin._corePlugin).toEqualTypeOf<true>();
  });
});

// ---------------------------------------------------------------------------
// CoreApisFromTuple type resolution
// ---------------------------------------------------------------------------

describe("CoreApisFromTuple type resolution", () => {
  const logPlugin = createCorePlugin("log", {
    api: () => ({
      info: (msg: string) => msg,
      error: (msg: string) => msg
    })
  });

  const envPlugin = createCorePlugin("env", {
    api: () => ({
      isDev: () => true,
      get: () => "development" as string
    })
  });

  it("maps core plugin tuple to { [Name]: Api }", () => {
    type Apis = CoreApisFromTuple<readonly [typeof logPlugin, typeof envPlugin]>;

    expectTypeOf<Apis>().toHaveProperty("log");
    expectTypeOf<Apis>().toHaveProperty("env");

    type LogApi = Apis["log"];
    expectTypeOf<LogApi>().toHaveProperty("info");
    expectTypeOf<LogApi>().toHaveProperty("error");

    type EnvApi = Apis["env"];
    expectTypeOf<EnvApi>().toHaveProperty("isDev");
    expectTypeOf<EnvApi>().toHaveProperty("get");
  });

  it("empty tuple produces empty object", () => {
    type Apis = CoreApisFromTuple<readonly []>;

    // Empty tuple → no keys
    // biome-ignore lint/complexity/noBannedTypes: testing that empty tuple produces {}
    expectTypeOf<Apis>().toEqualTypeOf<{}>();
  });

  it("excludes core plugins with no API", () => {
    const noApi = createCorePlugin("no-api", {
      onInit: () => {}
    });

    type Apis = CoreApisFromTuple<readonly [typeof logPlugin, typeof noApi]>;

    // log has API → present
    expectTypeOf<Apis>().toHaveProperty("log");

    // no-api has Record<string, never> → excluded
    // This is verified by the fact that Apis only has "log"
    type Keys = keyof Apis;
    expectTypeOf<Keys>().toEqualTypeOf<"log">();
  });
});

// ---------------------------------------------------------------------------
// Core plugin forbidden fields (compile-time)
// ---------------------------------------------------------------------------

describe("core plugin forbidden fields at type level", () => {
  it("rejects depends in spec", () => {
    // @ts-expect-error -- core plugins cannot have depends
    expect(() => createCorePlugin("bad", { depends: [] })).toThrow(TypeError);
  });

  it("rejects events in spec", () => {
    // @ts-expect-error -- core plugins cannot have events
    expect(() => createCorePlugin("bad", { events: () => ({}) })).toThrow(TypeError);
  });

  it("rejects hooks in spec", () => {
    // @ts-expect-error -- core plugins cannot have hooks
    expect(() => createCorePlugin("bad", { hooks: () => ({}) })).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Core APIs on regular plugin context
// ---------------------------------------------------------------------------

describe("core APIs on regular plugin context", () => {
  const logPlugin = createCorePlugin("log", {
    api: () => ({
      info: (msg: string) => msg,
      error: (msg: string) => msg
    })
  });

  const envPlugin = createCorePlugin("env", {
    api: () => ({
      isDev: () => true as boolean
    })
  });

  it("api callback context has typed core APIs", () => {
    const cc = createCoreConfig("type-test", {
      config: { siteName: "Test" },
      plugins: [logPlugin, envPlugin]
    });

    cc.createPlugin("probe", {
      api: ctx => {
        // Core APIs are typed on context
        expectTypeOf(ctx.log.info).toEqualTypeOf<(msg: string) => string>();
        expectTypeOf(ctx.log.error).toEqualTypeOf<(msg: string) => string>();
        expectTypeOf(ctx.env.isDev).toEqualTypeOf<() => boolean>();

        // Standard context fields still present
        expectTypeOf(ctx.global).toMatchTypeOf<{ siteName: string }>();
        expectTypeOf(ctx.emit).toBeFunction();
        expectTypeOf(ctx.require).toBeFunction();
        expectTypeOf(ctx.has).toBeFunction();

        return {};
      }
    });
  });

  it("onInit callback context has typed core APIs", () => {
    const cc = createCoreConfig("type-test-init", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    cc.createPlugin("probe", {
      onInit: ctx => {
        expectTypeOf(ctx.log.info).toEqualTypeOf<(msg: string) => string>();
      }
    });
  });

  it("onStart callback context has typed core APIs", () => {
    const cc = createCoreConfig("type-test-start", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    cc.createPlugin("probe", {
      onStart: ctx => {
        expectTypeOf(ctx.log.info).toEqualTypeOf<(msg: string) => string>();
      }
    });
  });

  it("hooks callback context has typed core APIs", () => {
    const cc = createCoreConfig("type-test-hooks", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    type TE = { "test:event": { value: number } };

    const emitter = cc.createPlugin("emitter", {
      events: register => register.map<TE>(),
      api: () => ({ noop: () => {} })
    });

    cc.createPlugin("listener", {
      depends: [emitter],
      hooks: ctx => {
        expectTypeOf(ctx.log.info).toEqualTypeOf<(msg: string) => string>();
        return {
          "test:event": _payload => {}
        };
      }
    });
  });

  it("context without core plugins has no extra properties", () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("no-core", {
      config: { siteName: "Test" }
    });

    const probe = cc.createPlugin("probe", {
      api: ctx => {
        // @ts-expect-error -- no core plugins, so ctx.log does not exist
        ctx.log;

        // @ts-expect-error -- no core plugins, so ctx.env does not exist
        ctx.env;

        return {};
      }
    });

    expect(probe).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Core APIs on App type
// ---------------------------------------------------------------------------

describe("core APIs on App type", () => {
  const logPlugin = createCorePlugin("log", {
    api: () => ({
      info: (msg: string) => msg,
      getAll: () => [] as string[]
    })
  });

  it("app surface has typed core APIs", () => {
    const cc = createCoreConfig("app-type", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = createApp();

    // Core API
    expectTypeOf(app.log.info).toEqualTypeOf<(msg: string) => string>();
    expectTypeOf(app.log.getAll).returns.toEqualTypeOf<string[]>();

    // Regular plugin API
    expectTypeOf(app.router.current).returns.toBeString();

    // Standard app methods
    expectTypeOf(app.start).toBeFunction();
    expectTypeOf(app.stop).toBeFunction();
    expectTypeOf(app.emit).toBeFunction();
    expectTypeOf(app.require).toBeFunction();
    expectTypeOf(app.has).toBeFunction();

    expect(app).toBeDefined();
  });

  it("app without core plugins has no core API properties", () => {
    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("no-core-app", {
      config: { siteName: "Test" }
    });

    const router = cc.createPlugin("router", {
      api: () => ({ current: () => "/" })
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    const app = createApp();

    // @ts-expect-error -- no core plugins registered
    app.log;

    expect(app.router.current()).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Core plugin pluginConfigs typing
// ---------------------------------------------------------------------------

describe("core plugin pluginConfigs typing", () => {
  const logPlugin = createCorePlugin("log", {
    config: { level: "info" as string, verbose: false }
  });

  const noConfigPlugin = createCorePlugin("no-cfg", {
    api: () => ({ noop: () => {} })
  });

  it("createCoreConfig pluginConfigs accepts core plugin config keys", () => {
    const cc = createCoreConfig("pc-accept", {
      config: { siteName: "Test" },
      plugins: [logPlugin],
      pluginConfigs: {
        log: { level: "debug" }
      }
    });

    expect(cc).toBeDefined();
  });

  it("createCoreConfig pluginConfigs values are partial", () => {
    // Only need to provide some keys
    const cc = createCoreConfig("pc-partial", {
      config: { siteName: "Test" },
      plugins: [logPlugin],
      pluginConfigs: {
        log: { verbose: true } // level not required
      }
    });

    expect(cc).toBeDefined();
  });

  it("createCoreConfig pluginConfigs rejects config-less core plugins", () => {
    const cc = createCoreConfig("pc-reject", {
      config: { siteName: "Test" },
      plugins: [logPlugin, noConfigPlugin],
      pluginConfigs: {
        // @ts-expect-error -- "no-cfg" has no config (Record<string, never>)
        "no-cfg": { anything: true }
      }
    });

    expect(cc).toBeDefined();
  });

  it("createCoreConfig pluginConfigs rejects wrong value types", () => {
    const cc = createCoreConfig("pc-wrong-type", {
      config: { siteName: "Test" },
      plugins: [logPlugin],
      pluginConfigs: {
        // @ts-expect-error -- level must be string, not number
        log: { level: 42 }
      }
    });

    expect(cc).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Consumer callback context with core APIs
// ---------------------------------------------------------------------------

describe("consumer callback context core API typing", () => {
  const logPlugin = createCorePlugin("log", {
    api: () => ({
      info: (msg: string) => msg
    })
  });

  it("onReady context has core APIs typed", () => {
    const cc = createCoreConfig("cb-ready", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp({
      onReady: ctx => {
        expectTypeOf(ctx.log.info).toEqualTypeOf<(msg: string) => string>();
        expectTypeOf(ctx.config).toEqualTypeOf<Readonly<{ siteName: string }>>();
      }
    });

    expect(app).toBeDefined();
  });

  it("onError context has core APIs typed", () => {
    const cc = createCoreConfig("cb-error", {
      config: { siteName: "Test" },
      plugins: [logPlugin]
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });
    const app = createApp({
      onError: (error, ctx) => {
        expectTypeOf(error).toEqualTypeOf<Error>();
        expectTypeOf(ctx.log.info).toEqualTypeOf<(msg: string) => string>();
      }
    });

    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CorePluginInstance is NOT assignable to PluginInstance
// ---------------------------------------------------------------------------

describe("CorePluginInstance vs PluginInstance", () => {
  it("core plugin instance has _corePlugin brand", () => {
    const plugin = createCorePlugin("branded", {});

    // CorePluginInstance has _corePlugin: true
    expectTypeOf(plugin).toHaveProperty("_corePlugin");
    expectTypeOf(plugin._corePlugin).toEqualTypeOf<true>();

    // CorePluginInstance does NOT have _phantom.events (regular plugins do)
    expectTypeOf(plugin._phantom).not.toHaveProperty("events");
  });
});

// ---------------------------------------------------------------------------
// Core plugin context typing (CorePluginContext)
// ---------------------------------------------------------------------------

describe("core plugin context typing", () => {
  it("api receives CorePluginContext with config and state", () => {
    createCorePlugin("ctx-test", {
      config: { level: "info" as string },
      createState: () => ({ count: 0 }),
      api: ctx => {
        // config is readonly
        expectTypeOf(ctx.config).toEqualTypeOf<Readonly<{ level: string }>>();

        // state is mutable
        expectTypeOf(ctx.state).toEqualTypeOf<{ count: number }>();
        ctx.state.count = 5; // mutation compiles

        // No global, emit, require, has on core plugin context
        // @ts-expect-error -- core plugins have no global
        ctx.global;
        // @ts-expect-error -- core plugins have no emit
        ctx.emit;
        // @ts-expect-error -- core plugins have no require
        ctx.require;
        // @ts-expect-error -- core plugins have no has
        ctx.has;

        return { getCount: () => ctx.state.count };
      }
    });
  });

  it("onInit receives CorePluginContext", () => {
    createCorePlugin("init-ctx", {
      config: { debug: true },
      createState: () => ({ ready: false }),
      onInit: ctx => {
        expectTypeOf(ctx.config).toEqualTypeOf<Readonly<{ debug: boolean }>>();
        expectTypeOf(ctx.state).toEqualTypeOf<{ ready: boolean }>();

        // @ts-expect-error -- no emit on core plugin context
        ctx.emit;
      }
    });
  });

  it("createState receives { config } only", () => {
    createCorePlugin("state-ctx", {
      config: { level: "info" as string },
      createState: ctx => {
        expectTypeOf(ctx.config).toEqualTypeOf<Readonly<{ level: string }>>();

        // @ts-expect-error -- createState has no state
        ctx.state;

        return { initialized: true };
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Multiple core plugins — API namespace isolation
// ---------------------------------------------------------------------------

describe("multiple core plugins API namespace isolation", () => {
  it("each core plugin maps to its own namespace on context", () => {
    const storage = createCorePlugin("storage", {
      api: () => ({
        get: (key: string) => key,
        set: (_key: string, _value: string) => {}
      })
    });

    const metrics = createCorePlugin("metrics", {
      api: () => ({
        track: (_event: string) => {},
        getCount: () => 0
      })
    });

    const cc = createCoreConfig("multi-core", {
      config: { appName: "Test" },
      plugins: [storage, metrics]
    });

    cc.createPlugin("consumer", {
      api: ctx => {
        // Each core plugin is on its own namespace
        expectTypeOf(ctx.storage.get).toEqualTypeOf<(key: string) => string>();
        expectTypeOf(ctx.storage.set).toBeFunction();
        expectTypeOf(ctx.metrics.track).toBeFunction();
        expectTypeOf(ctx.metrics.getCount).returns.toBeNumber();

        // No cross-contamination
        // @ts-expect-error -- 'track' is not on storage
        ctx.storage.track;
        // @ts-expect-error -- 'get' is not on metrics
        ctx.metrics.get;

        return {};
      }
    });
  });
});
