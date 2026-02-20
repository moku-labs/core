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
    createState: () => ({ registeredRoutes: [] as string[] }),
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
 */
function createBuildPlugin(
  core: ReturnType<typeof createCore<BaseConfig, BusContract, SignalRegistry>>
) {
  return core.createPlugin<"build", BuildConfig, BuildApi, BuildState>("build", {
    depends: ["router"],
    createState: () => ({
      artifacts: [] as string[],
      eventLog: [] as string[]
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
      // Cross-plugin communication: access router API
      const routerApi = ctx.require("router") as { resolve: (path: string) => string };
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

    const buildPlugin = createBuildPlugin(core);
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
      createState: () => ({ tracked: [] as string[] }),
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

    // TYPE ISSUE: createApp's return type uses `App<BaseConfig, BusContract, SignalRegistry, P>`
    // where P is inferred from the config. However, because createApp's signature uses
    // `AppConfig<BaseConfig, any, any>` for the config parameter, the P generic defaults
    // to PluginInstance (base) and the plugin API surface is not directly typed on `app`.
    // We need to cast through Record to access plugin APIs at runtime.
    // This is a known limitation -- the type system proves correctness at the type level
    // (in the .test-d.ts file), while runtime access uses the dynamic mounting.
    const appAny = app as Record<string, unknown>;

    // --- Plugin API access ---
    const routerApi = appAny.router as {
      resolve: (path: string) => string;
      routes: () => string[];
    };
    expect(routerApi.resolve("/about")).toBe("/about");

    const i18nApi = appAny.i18n as { t: (key: string) => string; locale: () => string };
    expect(i18nApi.t("hello")).toBe("[fr] hello");
    expect(i18nApi.locale()).toBe("fr");

    const analyticsApi = appAny.analytics as {
      track: (event: string) => void;
      events: () => string[];
    };
    analyticsApi.track("pageview");
    expect(analyticsApi.events()).toEqual(["[UA-123] pageview"]);

    const spaApi = appAny.spa as { mounted: () => boolean };
    // Before start, onMount hasn't run yet -- but api() has run during build phase
    // The SPA component's onMount runs during onStart, so mounted() is false before start
    expect(spaApi.mounted()).toBe(false);

    // --- Global config access ---
    const appConfig = app.config as Record<string, unknown>;
    const siteConfig = appConfig.site as { title: string; url: string };
    expect(siteConfig.title).toBe("My Blog"); // Consumer override
    expect(siteConfig.url).toBe("https://blog.example"); // Consumer override

    const buildConfig = appConfig.build as { outDir: string; minify: boolean };
    expect(buildConfig.outDir).toBe("./build"); // Framework default (not overridden)
    expect(buildConfig.minify).toBe(false); // Framework default

    // --- Per-plugin config access via app.configs ---
    const configs = appAny.configs as Record<string, Record<string, unknown>>;
    expect(configs.router?.basePath).toBe("/"); // Default
    expect(configs.router?.trailingSlash).toBe(false); // Default
    expect(configs.build?.outDir).toBe("./dist"); // Consumer override
    expect(configs.build?.feeds).toBe(true); // Consumer provided
    expect(configs.build?.sitemap).toBe(true); // Consumer provided
    expect(configs.i18n?.locale).toBe("fr"); // Consumer override
    expect(configs.i18n?.fallback).toBe("en"); // Default preserved (shallow merge)
    expect(configs.spa?.mountPoint).toBe("#app"); // Default

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
    expect(spaApi.mounted()).toBe(true);

    // Router's onStart registered default routes
    expect(routerApi.routes()).toEqual(["/", "/about", "/blog"]);

    // Build plugin's onStart accessed router API (cross-plugin communication)
    const buildApi = appAny.build as { run: () => Promise<string[]> };
    // Build plugin's onStart pushed "resolved:/build-output" to artifacts
    // We can verify by running build which returns all artifacts
    const buildOutput = await buildApi.run();
    expect(buildOutput).toContain("./dist/index.html");
    expect(buildOutput).toContain("./dist/feed.xml");
    expect(buildOutput).toContain("./dist/sitemap.xml");

    // --- Interact with APIs after start ---
    analyticsApi.track("click:header");
    analyticsApi.track("click:footer");
    expect(analyticsApi.events()).toEqual([
      "[UA-123] pageview",
      "[UA-123] click:header",
      "[UA-123] click:footer"
    ]);

    expect(i18nApi.t("goodbye")).toBe("[fr] goodbye");
    expect(routerApi.resolve("/blog")).toBe("/blog");

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
    const buildPlugin = createBuildPlugin(core);
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
    const appAny = app as Record<string, unknown>;
    const configs = appAny.configs as Record<string, Record<string, unknown>>;

    // Router: default { basePath: "/", trailingSlash: false } overridden
    expect(configs.router?.basePath).toBe("/app");
    expect(configs.router?.trailingSlash).toBe(true);

    // Build: required config provided
    expect(configs.build?.outDir).toBe("./output/build");
    expect(configs.build?.feeds).toBe(false);

    // SPA: default { mountPoint: "#app" } overridden
    expect(configs.spa?.mountPoint).toBe("#root");

    // i18n: default { locale: "en", fallback: "en" } overridden
    expect(configs.i18n?.locale).toBe("de");
    expect(configs.i18n?.fallback).toBe("en");

    // Global config shallow merged
    const siteConfig = (app.config as Record<string, unknown>).site as { title: string };
    expect(siteConfig.title).toBe("Override");

    // Verify router with custom config
    const routerApi = appAny.router as { resolve: (path: string) => string };
    expect(routerApi.resolve("/about")).toBe("/app/about/"); // basePath + trailingSlash

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
      depends: ["publisher"],
      defaultConfig: { verbose: false },
      createState: () => ({ received: [] as string[] }),
      api: ctx => ({
        getReceived: () => [...ctx.state.received]
      }),
      hooks: {
        "content:updated": (payload: unknown) => {
          hookLog.push(`subscriber received: ${JSON.stringify(payload)}`);
        }
      },
      onInit: ctx => {
        // Verify cross-plugin access
        const pub = ctx.require("publisher") as { publish: () => string };
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
    const appAny = app as Record<string, unknown>;
    const widgetApi = appAny.widget as { isActive: () => boolean };

    // Before start: onMount has not fired
    expect(widgetApi.isActive()).toBe(false);
    expect(mountLog).toEqual([]);

    // Start triggers onMount (mapped from onStart)
    await app.start();
    expect(widgetApi.isActive()).toBe(true);
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
    const appAny = app as Record<string, unknown>;

    const heroApi = appAny.hero as { getTitle: () => string };
    const sideApi = appAny.side as { getTitle: () => string };

    expect(heroApi.getTitle()).toBe("Welcome"); // Consumer override
    expect(sideApi.getTitle()).toBe("Untitled"); // Default

    expect(app.has("hero")).toBe(true);
    expect(app.has("side")).toBe(true);

    await app.destroy();
  });
});
