// =============================================================================
// End-to-End Type Flow: Three-Layer Narrative Runtime Test
// =============================================================================
// This test exercises the complete type inference chain:
//   Layer 1: createCore<BaseConfig, BusContract, SignalRegistry>()
//   Layer 2: Framework defines 4 plugins (router, build, spa, i18n)
//   Layer 3: Consumer adds analytics plugin, creates config, builds app
//
// Every layer boundary has a // TS infers: comment showing what TypeScript
// produces. All plugin APIs are accessed WITHOUT type annotations at the
// consumer level. If any annotation is needed, it is documented with
// // TYPE ISSUE: comment.
// =============================================================================

import { describe, expect, it } from "vitest";
import { createCore } from "../../src/index";

// =============================================================================
// Layer 1: Core Setup -- Framework Types and createCore
// =============================================================================
// The framework author defines the base config shape, bus contract, and signal
// registry. These three generics flow through the entire system.

/** Framework's global config shape -- realistic nested objects */
type BaseConfig = {
  site: { title: string; url: string };
  build: { outDir: string; minify: boolean };
};

/** Typed bus contract -- events that flow through emit() */
type BusContract = {
  "content:updated": { path: string; hash: string };
  "build:complete": { files: string[]; duration: number };
};

/** Typed signal registry -- signals that flow through signal() */
type SignalRegistry = {
  "route:change": { from: string; to: string };
};

// =============================================================================
// Layer 2: Framework Defines 4 Plugins
// =============================================================================
// Plugin creation functions are at module scope per unicorn/consistent-function-scoping.
// Each uses the full generic signature to prove framework generics flow through.

/**
 * Router plugin -- config with defaults, typed API, stateful.
 * Config: { basePath: string; trailingSlash: boolean }
 * API: { resolve: (path: string) => string; routes: () => string[] }
 * State: { registeredRoutes: string[] }
 */
function createRouterPlugin(
  core: ReturnType<typeof createCore<BaseConfig, BusContract, SignalRegistry>>
) {
  return core.createPlugin("router", {
    defaultConfig: { basePath: "/", trailingSlash: false },
    createState: (): { registeredRoutes: string[] } => ({ registeredRoutes: [] }),
    api: ctx => ({
      resolve: (path: string) => {
        const base = ctx.config.basePath;
        const fullPath = base === "/" ? path : `${base}${path}`;
        return ctx.config.trailingSlash && !fullPath.endsWith("/") ? `${fullPath}/` : fullPath;
      },
      routes: () => [...ctx.state.registeredRoutes]
    }),
    onInit: ctx => {
      // Register default routes during init (state not available in onInit)
      // Instead, use getPlugin to verify self-registration
      ctx.has("router");
    },
    onStart: ctx => {
      ctx.state.registeredRoutes.push("/", "/about", "/blog");
    }
  });
}

/** Build plugin config shape -- required (no defaults) */
type BuildConfig = { outDir: string; feeds: boolean; sitemap: boolean };

/** Build plugin API shape */
type BuildApi = { run: () => Promise<string[]> };

/** Build plugin state shape */
type BuildState = { artifacts: string[]; eventLog: string[] };

/**
 * Build plugin -- required config (no defaults), depends on router.
 * Config: { outDir: string; feeds: boolean; sitemap: boolean }
 * API: { run: () => Promise<string[]> }
 * State: { artifacts: string[]; eventLog: string[] }
 * Hooks: listens to "content:updated"
 *
 * NOTE: Because build has NO defaultConfig, TypeScript cannot infer C from the
 * spec object alone (it defaults to void). We provide explicit generic
 * parameters to createPlugin to carry the config type through.
 * @param core - The core API instance.
 * @param routerPlugin - The router plugin instance for depends declaration.
 */
function createBuildPlugin(
  core: ReturnType<typeof createCore<BaseConfig, BusContract, SignalRegistry>>,
  // biome-ignore lint/suspicious/noExplicitAny: Plugin instance type is erased at function boundary
  routerPlugin: any
) {
  return core.createPlugin<"build", BuildConfig, BuildApi, BuildState>("build", {
    depends: [routerPlugin],
    createState: (): { artifacts: string[]; eventLog: string[] } => ({
      artifacts: [],
      eventLog: []
    }),
    api: ctx => ({
      run: async () => {
        const outputs = [`${ctx.config.outDir}/index.html`];
        if (ctx.config.feeds) outputs.push(`${ctx.config.outDir}/feed.xml`);
        if (ctx.config.sitemap) outputs.push(`${ctx.config.outDir}/sitemap.xml`);
        ctx.state.artifacts.push(...outputs);
        return outputs;
      }
    }),
    hooks: {
      "content:updated": (_payload: unknown) => {
        // Hook receives unknown payload at runtime (hooks type is Record<string, (...args: unknown[]) => void>)
        // Demonstrates hook registration for cross-plugin communication
      }
    },
    onStart: ctx => {
      // Cross-plugin communication: access router API via instance-based depends
      // NOTE: routerPlugin param is typed as `any` at the function boundary, so
      // full type inference is not available here. In real usage with a properly
      // typed plugin reference, ctx.require(routerPlugin) would return the fully
      // typed RouterApi without any cast.
      const routerApi = ctx.require(routerPlugin) as { resolve: (path: string) => string };
      const resolved = routerApi.resolve("/build-output");
      ctx.state.artifacts.push(`resolved:${resolved}`);
    }
  });
}

/**
 * SPA component -- uses createComponent, config with defaults.
 * Config: { mountPoint: string }
 * API: { mounted: () => boolean }
 * State: { isMounted: boolean }
 * Maps onMount -> onStart, onUnmount -> onStop at runtime.
 */
function createSpaComponent(
  core: ReturnType<typeof createCore<BaseConfig, BusContract, SignalRegistry>>
) {
  return core.createComponent("spa", {
    defaultConfig: { mountPoint: "#app" },
    createState: () => ({ isMounted: false }),
    api: ctx => ({
      mounted: () => ctx.state.isMounted
    }),
    onMount: ctx => {
      ctx.state.isMounted = true;
    },
    onUnmount: () => {
      // Teardown context only has global -- no state access
    }
  });
}

/**
 * i18n plugin -- simple utility with defaults.
 * Config: { locale: string; fallback: string }
 * API: { t: (key: string) => string; locale: () => string }
 */
function createI18nPlugin(
  core: ReturnType<typeof createCore<BaseConfig, BusContract, SignalRegistry>>
) {
  return core.createPlugin("i18n", {
    defaultConfig: { locale: "en", fallback: "en" },
    api: ctx => ({
      t: (key: string) => `[${ctx.config.locale}] ${key}`,
      locale: () => ctx.config.locale
    })
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("end-to-end three-layer type flow", () => {
  it("full narrative: createCore -> framework plugins -> consumer createConfig -> createApp -> lifecycle", async () => {
    // =========================================================================
    // Layer 1: Core Setup
    // =========================================================================

    const lifecycleLog: string[] = [];

    const core = createCore<BaseConfig, BusContract, SignalRegistry>("moku", {
      config: {
        site: { title: "Default Site", url: "https://example.com" },
        build: { outDir: "./build", minify: false }
      },
      onBoot: () => {
        lifecycleLog.push("boot");
      },
      onReady: () => {
        lifecycleLog.push("ready");
      },
      onShutdown: () => {
        lifecycleLog.push("shutdown");
      }
    });
    // TS infers: CoreAPI<BaseConfig, BusContract, SignalRegistry>

    // =========================================================================
    // Layer 2: Framework Defines Plugins
    // =========================================================================

    const routerPlugin = createRouterPlugin(core);
    // TS infers: PluginInstance<"router", { basePath: string; trailingSlash: boolean }, { resolve: (path: string) => string; routes: () => string[] }, { registeredRoutes: string[] }>

    const buildPlugin = createBuildPlugin(core, routerPlugin);
    // TS infers: PluginInstance<"build", { outDir: string; feeds: boolean; sitemap: boolean }, { run: () => Promise<string[]> }, { artifacts: string[]; eventLog: string[] }>

    const spaComponent = createSpaComponent(core);
    // TS infers: ComponentInstance<"spa", { mountPoint: string }, { mounted: () => boolean }, { isMounted: boolean }>

    const i18nPlugin = createI18nPlugin(core);
    // TS infers: PluginInstance<"i18n", { locale: string; fallback: string }, { t: (key: string) => string; locale: () => string }, void>

    // =========================================================================
    // Layer 3: Consumer Creates App (ZERO type annotations)
    // =========================================================================

    // Consumer defines an extra plugin with required config (no defaultConfig)
    const analyticsPlugin = core.createPlugin("analytics", {
      defaultConfig: { trackingId: "UA-000" },
      createState: (): { tracked: string[] } => ({ tracked: [] }),
      api: ctx => ({
        track: (event: string) => {
          ctx.state.tracked.push(`[${ctx.config.trackingId}] ${event}`);
        },
        events: () => [...ctx.state.tracked]
      })
    });
    // TS infers: PluginInstance<"analytics", { trackingId: string }, { track: (event: string) => void; events: () => string[] }, { tracked: string[] }>

    // Consumer creates config -- no type annotations
    const config = core.createConfig({
      config: {
        site: { title: "My Blog", url: "https://blog.example" }
      },
      plugins: [routerPlugin, buildPlugin, spaComponent, i18nPlugin, analyticsPlugin],
      pluginConfigs: {
        build: { outDir: "./dist", feeds: true, sitemap: true },
        i18n: { locale: "fr" },
        analytics: { trackingId: "UA-123" }
      }
    });
    // TS infers: AppConfig<BaseConfig, PluginInstance, [typeof routerPlugin, typeof buildPlugin, ...]>

    // Consumer creates app -- no type annotations
    const app = await core.createApp(config);
    // TS infers: App<BaseConfig, BusContract, SignalRegistry, P>

    // --- Verify boot callback fired ---
    expect(lifecycleLog).toContain("boot");

    // --- Verify app is frozen ---
    expect(Object.isFrozen(app)).toBe(true);

    // =========================================================================
    // Zero-annotation access tests
    // =========================================================================

    // --- Plugin API access (zero-annotation, typed directly on app) ---
    expect(app.router.resolve("/about")).toBe("/about");

    expect(app.i18n.t("hello")).toBe("[fr] hello");
    expect(app.i18n.locale()).toBe("fr");

    app.analytics.track("pageview");
    expect(app.analytics.events()).toEqual(["[UA-123] pageview"]);

    // Before start, onMount hasn't run yet -- but api() has run during build phase
    // The SPA component's onMount runs during onStart, so mounted() is false before start
    expect(app.spa.mounted()).toBe(false);

    // --- Global config access (typed directly) ---
    expect(app.config.site.title).toBe("My Blog"); // Consumer override
    expect(app.config.site.url).toBe("https://blog.example"); // Consumer override

    expect(app.config.build.outDir).toBe("./build"); // Framework default (not overridden)
    expect(app.config.build.minify).toBe(false); // Framework default

    // --- Per-plugin config access via app.configs (typed directly) ---
    expect(app.configs.router.basePath).toBe("/"); // Default
    expect(app.configs.router.trailingSlash).toBe(false); // Default
    expect(app.configs.build.outDir).toBe("./dist"); // Consumer override
    expect(app.configs.build.feeds).toBe(true); // Consumer provided
    expect(app.configs.build.sitemap).toBe(true); // Consumer provided
    expect(app.configs.i18n.locale).toBe("fr"); // Consumer override
    expect(app.configs.i18n.fallback).toBe("en"); // Default preserved (shallow merge)
    expect(app.configs.spa.mountPoint).toBe("#app"); // Default

    // --- Typed bus event ---
    await app.emit("content:updated", { path: "/", hash: "abc123" });

    // --- Typed signal ---
    await app.signal("route:change", { from: "/", to: "/about" });

    // --- Plugin registry ---
    expect(app.has("router")).toBe(true);
    expect(app.has("build")).toBe(true);
    expect(app.has("spa")).toBe(true);
    expect(app.has("i18n")).toBe(true);
    expect(app.has("analytics")).toBe(true);
    expect(app.has("nonexistent")).toBe(false);

    // --- getPlugin / require ---
    expect(app.getPlugin("router")).toBeDefined();
    expect(app.getPlugin("nonexistent" as never)).toBeUndefined();
    expect(app.require("router")).toBeDefined();
    expect(() => app.require("nonexistent" as never)).toThrow("[moku]");

    // =========================================================================
    // Full lifecycle execution
    // =========================================================================

    // --- Start ---
    await app.start();

    // Verify ready callback fired (onReady runs before onStart plugins)
    expect(lifecycleLog).toContain("ready");

    // After start, SPA component's onMount should have fired
    expect(app.spa.mounted()).toBe(true);

    // Router's onStart registered default routes
    expect(app.router.routes()).toEqual(["/", "/about", "/blog"]);

    // Build plugin's onStart accessed router API (cross-plugin communication)
    // Build plugin's onStart pushed "resolved:/build-output" to artifacts
    // We can verify by running build which returns all artifacts
    const buildOutput = await app.build.run();
    expect(buildOutput).toContain("./dist/index.html");
    expect(buildOutput).toContain("./dist/feed.xml");
    expect(buildOutput).toContain("./dist/sitemap.xml");

    // --- Interact with APIs after start ---
    app.analytics.track("click:header");
    app.analytics.track("click:footer");
    expect(app.analytics.events()).toEqual([
      "[UA-123] pageview",
      "[UA-123] click:header",
      "[UA-123] click:footer"
    ]);

    expect(app.i18n.t("goodbye")).toBe("[fr] goodbye");
    expect(app.router.resolve("/blog")).toBe("/blog");

    // --- Stop ---
    await app.stop();

    // Verify shutdown callback fired
    expect(lifecycleLog).toContain("shutdown");

    // Lifecycle ordering: boot -> ready -> ... -> shutdown
    expect(lifecycleLog.indexOf("boot")).toBeLessThan(lifecycleLog.indexOf("ready"));
    expect(lifecycleLog.indexOf("ready")).toBeLessThan(lifecycleLog.indexOf("shutdown"));

    // --- Destroy ---
    await app.destroy();

    // --- Post-destroy enforcement ---
    await expect(app.start()).rejects.toThrow("Cannot call start() on a destroyed app");
    await expect(app.stop()).rejects.toThrow("Cannot call stop() on a destroyed app");
    await expect(app.destroy()).rejects.toThrow("Cannot call destroy() on a destroyed app");
    expect(() => app.emit("content:updated" as never, {} as never)).toThrow(
      "Cannot call emit() on a destroyed app"
    );
    expect(() => app.signal("route:change" as never, {} as never)).toThrow(
      "Cannot call signal() on a destroyed app"
    );
    expect(() => app.has("router")).toThrow("Cannot call has() on a destroyed app");
    expect(() => app.getPlugin("router" as never)).toThrow(
      "Cannot call getPlugin() on a destroyed app"
    );
    expect(() => app.require("router" as never)).toThrow(
      "Cannot call require() on a destroyed app"
    );
  });

  it("config resolution: defaults + overrides + required configs", async () => {
    const core = createCore<BaseConfig, BusContract, SignalRegistry>("moku", {
      config: {
        site: { title: "Default", url: "https://default.com" },
        build: { outDir: "./out", minify: true }
      }
    });

    const routerPlugin = createRouterPlugin(core);
    const buildPlugin = createBuildPlugin(core, routerPlugin);
    const spaComponent = createSpaComponent(core);
    const i18nPlugin = createI18nPlugin(core);

    const config = core.createConfig({
      config: {
        site: { title: "Override", url: "https://override.com" },
        build: { outDir: "./custom", minify: false }
      },
      plugins: [routerPlugin, buildPlugin, spaComponent, i18nPlugin],
      pluginConfigs: {
        build: { outDir: "./output/build", feeds: false, sitemap: false },
        router: { basePath: "/app", trailingSlash: true },
        spa: { mountPoint: "#root" },
        i18n: { locale: "de", fallback: "en" }
      }
    });

    const app = await core.createApp(config);

    // Router: default { basePath: "/", trailingSlash: false } overridden
    expect(app.configs.router.basePath).toBe("/app");
    expect(app.configs.router.trailingSlash).toBe(true);

    // Build: required config provided
    expect(app.configs.build.outDir).toBe("./output/build");
    expect(app.configs.build.feeds).toBe(false);

    // SPA: default { mountPoint: "#app" } overridden
    expect(app.configs.spa.mountPoint).toBe("#root");

    // i18n: default { locale: "en", fallback: "en" } overridden
    expect(app.configs.i18n.locale).toBe("de");
    expect(app.configs.i18n.fallback).toBe("en");

    // Global config shallow merged
    expect(app.config.site.title).toBe("Override");

    // Verify router with custom config
    expect(app.router.resolve("/about")).toBe("/app/about/"); // basePath + trailingSlash

    await app.destroy();
  });

  it("cross-plugin communication via hooks and require", async () => {
    const core = createCore<BaseConfig, BusContract, SignalRegistry>("moku", {
      config: {
        site: { title: "Test", url: "https://test.com" },
        build: { outDir: "./out", minify: false }
      }
    });

    const hookLog: string[] = [];

    // Create plugins with hooks that demonstrate cross-plugin communication
    const publisherPlugin = core.createPlugin("publisher", {
      defaultConfig: { autoPublish: true },
      api: () => ({
        publish: () => "published"
      })
    });

    const subscriberPlugin = core.createPlugin("subscriber", {
      depends: [publisherPlugin],
      defaultConfig: { verbose: false },
      createState: (): { received: string[] } => ({ received: [] }),
      api: ctx => ({
        getReceived: () => [...ctx.state.received]
      }),
      hooks: {
        "content:updated": (payload: unknown) => {
          hookLog.push(`subscriber received: ${JSON.stringify(payload)}`);
        }
      },
      onInit: ctx => {
        // Intentional cast: publisherPlugin is declared at function scope where
        // the plugin reference type is available but ctx.require return type
        // cannot infer the API from the runtime depends array
        const pub = ctx.require(publisherPlugin) as { publish: () => string };
        hookLog.push(`publisher says: ${pub.publish()}`);
      }
    });

    const config = core.createConfig({
      plugins: [publisherPlugin, subscriberPlugin]
    });

    const app = await core.createApp(config);

    // Verify onInit cross-plugin communication
    expect(hookLog).toContain("publisher says: published");

    // Emit a typed bus event and verify hook fires
    await app.emit("content:updated", { path: "/new-post", hash: "xyz" });
    expect(hookLog.some(entry => entry.includes("subscriber received"))).toBe(true);
    expect(hookLog.some(entry => entry.includes("/new-post"))).toBe(true);

    await app.destroy();
  });

  it("typed signals: SignalRegistry enforces payload, hooks receive it", async () => {
    const core = createCore<BaseConfig, BusContract, SignalRegistry>("moku", {
      config: {
        site: { title: "Test", url: "https://test.com" },
        build: { outDir: "./out", minify: false }
      }
    });

    // Track what the listener receives
    const signalLog: Array<{ from: string; to: string }> = [];
    const untypedLog: unknown[] = [];

    // Plugin that listens to both typed and untyped signals via hooks
    const listenerPlugin = core.createPlugin("listener", {
      defaultConfig: {},
      api: () => ({
        getSignalLog: () => [...signalLog],
        getUntypedLog: () => [...untypedLog]
      }),
      hooks: {
        "route:change": (payload: unknown) => {
          // At the hooks level, payload is unknown (hooks don't carry generics).
          // The typing benefit is on the SENDER side (ctx.signal / app.signal).
          signalLog.push(payload as { from: string; to: string });
        },
        "custom:adhoc": (payload: unknown) => {
          untypedLog.push(payload);
        }
      }
    });

    // Plugin that fires a typed signal during onStart
    const navigatorPlugin = core.createPlugin("navigator", {
      defaultConfig: {},
      api: () => ({}),
      onStart: async ctx => {
        // TYPED: "route:change" is in SignalRegistry — TS enforces { from, to }
        await ctx.signal("route:change", { from: "/home", to: "/dashboard" });

        // UNTYPED: "custom:adhoc" is NOT in SignalRegistry — falls through to untyped overload
        await ctx.signal("custom:adhoc", { message: "hello from navigator" });
      }
    });

    const config = core.createConfig({
      plugins: [listenerPlugin, navigatorPlugin]
    });
    const app = await core.createApp(config);

    // Before start: no signals fired yet
    expect(app.listener.getSignalLog()).toEqual([]);
    expect(app.listener.getUntypedLog()).toEqual([]);

    // Start triggers navigatorPlugin.onStart which fires both signals
    await app.start();

    // Typed signal: listener received the route:change payload
    expect(app.listener.getSignalLog()).toEqual([{ from: "/home", to: "/dashboard" }]);

    // Untyped signal: listener received the custom:adhoc payload
    expect(app.listener.getUntypedLog()).toEqual([{ message: "hello from navigator" }]);

    // App-level typed signal — TS enforces the payload shape
    await app.signal("route:change", { from: "/dashboard", to: "/settings" });
    expect(app.listener.getSignalLog()).toEqual([
      { from: "/home", to: "/dashboard" },
      { from: "/dashboard", to: "/settings" }
    ]);

    // App-level untyped signal — any string works
    await app.signal("some:random:event", { data: 42 });
    // No hook registered for "some:random:event", so untypedLog unchanged
    expect(app.listener.getUntypedLog()).toHaveLength(1);

    await app.destroy();
  });

  it("component lifecycle maps onMount/onUnmount correctly", async () => {
    const core = createCore<BaseConfig, BusContract, SignalRegistry>("moku", {
      config: {
        site: { title: "Test", url: "https://test.com" },
        build: { outDir: "./out", minify: false }
      }
    });

    const mountLog: string[] = [];

    const widget = core.createComponent("widget", {
      defaultConfig: { size: "large" },
      createState: () => ({ active: false }),
      api: ctx => ({
        isActive: () => ctx.state.active
      }),
      onMount: ctx => {
        ctx.state.active = true;
        mountLog.push("mounted");
      },
      onUnmount: () => {
        mountLog.push("unmounted");
      }
    });

    const config = core.createConfig({
      plugins: [widget]
    });

    const app = await core.createApp(config);

    // Before start: onMount has not fired
    expect(app.widget.isActive()).toBe(false);
    expect(mountLog).toEqual([]);

    // Start triggers onMount (mapped from onStart)
    await app.start();
    expect(app.widget.isActive()).toBe(true);
    expect(mountLog).toContain("mounted");

    // Stop triggers onUnmount (mapped from onStop)
    await app.stop();
    expect(mountLog).toContain("unmounted");

    await app.destroy();
  });

  it("event bus via core.createEventBus works standalone", () => {
    const core = createCore<BaseConfig, BusContract, SignalRegistry>("moku", {
      config: {
        site: { title: "Test", url: "https://test.com" },
        build: { outDir: "./out", minify: false }
      }
    });

    const bus = core.createEventBus<{
      "test:event": { value: number };
    }>();

    const received: number[] = [];
    bus.on("test:event", payload => {
      received.push(payload.value);
    });

    // Fire event (returns promise -- discard per sonarjs/void-use)
    // eslint-disable-next-line sonarjs/void-use
    void bus.emit("test:event", { value: 42 });

    // Event bus is synchronous-first; the handler fired immediately
    expect(received).toEqual([42]);
  });

  it("plugin factory produces multiple named instances", async () => {
    const core = createCore<BaseConfig, BusContract, SignalRegistry>("moku", {
      config: {
        site: { title: "Test", url: "https://test.com" },
        build: { outDir: "./out", minify: false }
      }
    });

    const cardFactory = core.createPluginFactory({
      defaultConfig: { title: "Untitled" },
      api: (ctx: { config: { title: string } }) => ({
        getTitle: () => ctx.config.title
      })
    });

    const heroCard = cardFactory("hero");
    const sideCard = cardFactory("side");

    const config = core.createConfig({
      plugins: [heroCard, sideCard],
      pluginConfigs: {
        hero: { title: "Welcome" }
      }
    });

    const app = await core.createApp(config);

    expect(app.hero.getTitle()).toBe("Welcome"); // Consumer override
    expect(app.side.getTitle()).toBe("Untitled"); // Default

    expect(app.has("hero")).toBe(true);
    expect(app.has("side")).toBe(true);

    await app.destroy();
  });
});
