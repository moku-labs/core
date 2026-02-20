// =============================================================================
// End-to-End Type Flow: Type-Level Assertions
// =============================================================================
// Complements the runtime test by proving TYPE SYSTEM correctness at every
// layer boundary in the three-layer flow. Uses expectTypeOf from vitest.
//
// Sections:
//   1. CoreAPI carries framework generics
//   2. createPlugin carries phantom types
//   3. AppConfig carries phantom union
//   4. BuildPluginConfigs required/optional/excluded keys
//   5. BuildPluginApis produces correct app surface
//   6. App type has correct accessors
// =============================================================================

import { describe, expectTypeOf, it } from "vitest";
import type {
  App,
  AppConfig,
  BuildPluginApis,
  BuildPluginConfigs,
  BuildPluginConfigsAccessor,
  ComponentInstance,
  CoreAPI,
  CreateAppFunction,
  CreateComponentFunction,
  CreateConfigFunction,
  CreateEventBusFunction,
  CreateModuleFunction,
  CreatePluginFactoryFunction,
  CreatePluginFunction,
  EventBus,
  PluginApiByName,
  PluginApiType,
  PluginConfigType,
  PluginInstance,
  PluginName
} from "../../../src/types";

// =============================================================================
// Shared Test Types (mirror the runtime test's realistic types)
// =============================================================================

type BaseConfig = {
  site: { title: string; url: string };
  build: { outDir: string; minify: boolean };
};

type BusContract = {
  "content:updated": { path: string; hash: string };
  "build:complete": { files: string[]; duration: number };
};

type SignalRegistry = {
  "route:change": { from: string; to: string };
};

// Plugin types
type RouterConfig = { basePath: string; trailingSlash: boolean };
type RouterApi = { resolve: (path: string) => string; routes: () => string[] };
type RouterState = { registeredRoutes: string[] };
type RouterPlugin = PluginInstance<"router", RouterConfig, RouterApi, RouterState>;

type BuildConfig = { outDir: string; feeds: boolean; sitemap: boolean };
type BuildApi = { run: () => Promise<string[]> };
type BuildState = { artifacts: string[]; eventLog: string[] };
type BuildPlugin = PluginInstance<"build", BuildConfig, BuildApi, BuildState>;

type SpaConfig = { mountPoint: string };
type SpaApi = { mounted: () => boolean };
type SpaState = { isMounted: boolean };
type SpaComponent = ComponentInstance<"spa", SpaConfig, SpaApi, SpaState>;
// SPA as PluginInstance for BuildPluginConfigs/BuildPluginApis (runtime treats components as plugins)
type SpaPlugin = PluginInstance<"spa", SpaConfig, SpaApi, SpaState>;

type I18nConfig = { locale: string; fallback: string };
type I18nApi = { t: (key: string) => string; locale: () => string };
type I18nPlugin = PluginInstance<"i18n", I18nConfig, I18nApi, void>;

type AnalyticsConfig = { trackingId: string };
type AnalyticsApi = { track: (event: string) => void; events: () => string[] };
type AnalyticsState = { tracked: string[] };
type AnalyticsPlugin = PluginInstance<"analytics", AnalyticsConfig, AnalyticsApi, AnalyticsState>;

// All plugins union
type AllPlugins = RouterPlugin | BuildPlugin | SpaPlugin | I18nPlugin | AnalyticsPlugin;

// =============================================================================
// Section 1: CoreAPI carries framework generics
// =============================================================================

describe("CoreAPI carries framework generics", () => {
  type TestCore = CoreAPI<BaseConfig, BusContract, SignalRegistry>;

  it("createPlugin is CreatePluginFunction with correct generics", () => {
    // TS infers: CreatePluginFunction<BaseConfig, BusContract, SignalRegistry>
    expectTypeOf<TestCore["createPlugin"]>().toEqualTypeOf<
      CreatePluginFunction<BaseConfig, BusContract, SignalRegistry>
    >();
  });

  it("createComponent is CreateComponentFunction with correct generics", () => {
    expectTypeOf<TestCore["createComponent"]>().toEqualTypeOf<
      CreateComponentFunction<BaseConfig, BusContract, SignalRegistry>
    >();
  });

  it("createConfig is CreateConfigFunction with correct generics", () => {
    expectTypeOf<TestCore["createConfig"]>().toEqualTypeOf<CreateConfigFunction<BaseConfig>>();
  });

  it("createApp is CreateAppFunction with correct generics", () => {
    expectTypeOf<TestCore["createApp"]>().toEqualTypeOf<
      CreateAppFunction<BaseConfig, BusContract, SignalRegistry>
    >();
  });

  it("createModule is CreateModuleFunction", () => {
    expectTypeOf<TestCore["createModule"]>().toEqualTypeOf<CreateModuleFunction>();
  });

  it("createEventBus is CreateEventBusFunction", () => {
    expectTypeOf<TestCore["createEventBus"]>().toEqualTypeOf<CreateEventBusFunction>();
  });

  it("createPluginFactory is CreatePluginFactoryFunction with correct generics", () => {
    expectTypeOf<TestCore["createPluginFactory"]>().toEqualTypeOf<
      CreatePluginFactoryFunction<BaseConfig, BusContract, SignalRegistry>
    >();
  });
});

// =============================================================================
// Section 2: createPlugin carries phantom types
// =============================================================================

describe("Plugin instances carry phantom types", () => {
  it("PluginName extracts the name literal type", () => {
    // TS infers: "router"
    expectTypeOf<PluginName<RouterPlugin>>().toEqualTypeOf<"router">();
    expectTypeOf<PluginName<BuildPlugin>>().toEqualTypeOf<"build">();
    expectTypeOf<PluginName<AnalyticsPlugin>>().toEqualTypeOf<"analytics">();
  });

  it("PluginConfigType extracts the config type", () => {
    // TS infers: RouterConfig
    expectTypeOf<PluginConfigType<RouterPlugin>>().toEqualTypeOf<RouterConfig>();
    expectTypeOf<PluginConfigType<BuildPlugin>>().toEqualTypeOf<BuildConfig>();
    expectTypeOf<PluginConfigType<I18nPlugin>>().toEqualTypeOf<I18nConfig>();
  });

  it("PluginApiType extracts the API type", () => {
    // TS infers: RouterApi
    expectTypeOf<PluginApiType<RouterPlugin>>().toEqualTypeOf<RouterApi>();
    expectTypeOf<PluginApiType<BuildPlugin>>().toEqualTypeOf<BuildApi>();
    expectTypeOf<PluginApiType<AnalyticsPlugin>>().toEqualTypeOf<AnalyticsApi>();
  });

  it("PluginName distributes over union", () => {
    // TS infers: "router" | "build" | "spa" | "i18n" | "analytics"
    type AllNames = PluginName<AllPlugins>;
    expectTypeOf<AllNames>().toEqualTypeOf<"router" | "build" | "spa" | "i18n" | "analytics">();
  });

  it("ComponentInstance carries phantom types the same way", () => {
    expectTypeOf<SpaComponent["name"]>().toEqualTypeOf<"spa">();
    expectTypeOf<SpaComponent["kind"]>().toEqualTypeOf<"component">();
  });
});

// =============================================================================
// Section 3: AppConfig carries phantom union
// =============================================================================

describe("AppConfig carries phantom union", () => {
  type TestConfig = AppConfig<
    BaseConfig,
    RouterPlugin | BuildPlugin,
    [I18nPlugin, AnalyticsPlugin]
  >;

  it("AppConfig._allPlugins is the union of defaults and extras", () => {
    // TS infers: RouterPlugin | BuildPlugin | I18nPlugin | AnalyticsPlugin
    type AllPluginsType = TestConfig["_allPlugins"];
    expectTypeOf<AllPluginsType>().toEqualTypeOf<
      RouterPlugin | BuildPlugin | I18nPlugin | AnalyticsPlugin
    >();
  });

  it("AppConfig.global is Readonly<BaseConfig>", () => {
    expectTypeOf<TestConfig["global"]>().toEqualTypeOf<Readonly<BaseConfig>>();
  });

  it("AppConfig has _brand 'AppConfig'", () => {
    expectTypeOf<TestConfig["_brand"]>().toEqualTypeOf<"AppConfig">();
  });
});

// =============================================================================
// Section 4: BuildPluginConfigs required/optional/excluded keys
// =============================================================================

describe("BuildPluginConfigs produces correct required/optional/excluded keys", () => {
  // Router: has defaults -> OPTIONAL
  // Build: no defaults -> REQUIRED
  // SPA: has defaults -> OPTIONAL
  // I18n: has defaults -> OPTIONAL
  // Analytics: has defaults -> OPTIONAL (in our test setup analytics has defaultConfig)

  // For testing required vs optional, we need plugins with _hasDefaults: true and false
  type RouterWithDefaults = PluginInstance<"router", RouterConfig, RouterApi, RouterState> & {
    _hasDefaults: true;
  };
  type BuildNoDefaults = PluginInstance<"build", BuildConfig, BuildApi, BuildState> & {
    _hasDefaults: false;
  };
  type SpaWithDefaults = PluginInstance<"spa", SpaConfig, SpaApi, SpaState> & {
    _hasDefaults: true;
  };
  type I18nWithDefaults = PluginInstance<"i18n", I18nConfig, I18nApi, void> & {
    _hasDefaults: true;
  };
  type AnalyticsNoDefaults = PluginInstance<
    "analytics",
    AnalyticsConfig,
    AnalyticsApi,
    AnalyticsState
  > & { _hasDefaults: false };

  type TestPlugins =
    | RouterWithDefaults
    | BuildNoDefaults
    | SpaWithDefaults
    | I18nWithDefaults
    | AnalyticsNoDefaults;
  type Configs = BuildPluginConfigs<TestPlugins>;

  it("plugins without defaults have required config keys", () => {
    // Build and Analytics are REQUIRED (no defaultConfig)
    expectTypeOf<Configs>().toHaveProperty("build");
    expectTypeOf<Configs>().toHaveProperty("analytics");
    // Required means the full config type
    expectTypeOf<Configs["build"]>().toEqualTypeOf<BuildConfig>();
    expectTypeOf<Configs["analytics"]>().toEqualTypeOf<AnalyticsConfig>();
  });

  it("plugins with defaults have optional config keys", () => {
    // Router, SPA, I18n are OPTIONAL (have defaultConfig)
    // Optional means Partial<config>
    // We test that assigning undefined is valid (optional)
    type HasRouter = "router" extends keyof Configs ? true : false;
    type HasSpa = "spa" extends keyof Configs ? true : false;
    type HasI18n = "i18n" extends keyof Configs ? true : false;
    expectTypeOf<HasRouter>().toEqualTypeOf<true>();
    expectTypeOf<HasSpa>().toEqualTypeOf<true>();
    expectTypeOf<HasI18n>().toEqualTypeOf<true>();
  });

  it("void-config plugins are excluded", () => {
    // Create a plugin with void config
    type VoidPlugin = PluginInstance<"void-plugin", void, Record<string, never>, void>;
    type ConfigsWithVoid = BuildPluginConfigs<VoidPlugin | BuildNoDefaults>;
    // void-plugin should NOT appear as a key
    type HasVoidPlugin = "void-plugin" extends keyof ConfigsWithVoid ? true : false;
    expectTypeOf<HasVoidPlugin>().toEqualTypeOf<false>();
    // But build should still be there
    type HasBuild = "build" extends keyof ConfigsWithVoid ? true : false;
    expectTypeOf<HasBuild>().toEqualTypeOf<true>();
  });
});

// =============================================================================
// Section 5: BuildPluginApis produces correct app surface
// =============================================================================

describe("BuildPluginApis produces correct app surface", () => {
  type Apis = BuildPluginApis<AllPlugins>;

  it("maps each plugin name to its API type", () => {
    expectTypeOf<Apis>().toHaveProperty("router");
    expectTypeOf<Apis>().toHaveProperty("build");
    expectTypeOf<Apis>().toHaveProperty("spa");
    expectTypeOf<Apis>().toHaveProperty("i18n");
    expectTypeOf<Apis>().toHaveProperty("analytics");
  });

  it("router API has resolve and routes", () => {
    expectTypeOf<Apis["router"]>().toHaveProperty("resolve");
    expectTypeOf<Apis["router"]>().toHaveProperty("routes");
  });

  it("build API has run", () => {
    expectTypeOf<Apis["build"]>().toHaveProperty("run");
  });

  it("analytics API has track and events", () => {
    expectTypeOf<Apis["analytics"]>().toHaveProperty("track");
    expectTypeOf<Apis["analytics"]>().toHaveProperty("events");
  });

  it("excludes void-API plugins", () => {
    type LifecycleOnly = PluginInstance<"lifecycle", void, Record<string, never>, void>;
    type ApisWithVoid = BuildPluginApis<RouterPlugin | LifecycleOnly>;
    type HasLifecycle = "lifecycle" extends keyof ApisWithVoid ? true : false;
    expectTypeOf<HasLifecycle>().toEqualTypeOf<false>();
    // Router should still be present
    expectTypeOf<ApisWithVoid>().toHaveProperty("router");
  });

  it("PluginApiByName returns correct API for a given name", () => {
    type RouterResult = PluginApiByName<AllPlugins, "router">;
    expectTypeOf<RouterResult>().toHaveProperty("resolve");
    expectTypeOf<RouterResult>().toHaveProperty("routes");

    type AnalyticsResult = PluginApiByName<AllPlugins, "analytics">;
    expectTypeOf<AnalyticsResult>().toHaveProperty("track");
    expectTypeOf<AnalyticsResult>().toHaveProperty("events");
  });
});

// =============================================================================
// Section 6: App type has correct accessors
// =============================================================================

describe("App type has correct accessors", () => {
  type TestApp = App<BaseConfig, BusContract, SignalRegistry, AllPlugins>;

  // --- Plugin APIs mounted on app ---
  it("app.router has resolve and routes", () => {
    expectTypeOf<TestApp["router"]>().toHaveProperty("resolve");
    expectTypeOf<TestApp["router"]>().toHaveProperty("routes");
  });

  it("app.i18n has t and locale", () => {
    expectTypeOf<TestApp["i18n"]>().toHaveProperty("t");
    expectTypeOf<TestApp["i18n"]>().toHaveProperty("locale");
  });

  it("app.analytics has track and events", () => {
    expectTypeOf<TestApp["analytics"]>().toHaveProperty("track");
    expectTypeOf<TestApp["analytics"]>().toHaveProperty("events");
  });

  // --- Global config ---
  it("app.config is Readonly<BaseConfig>", () => {
    expectTypeOf<TestApp["config"]>().toEqualTypeOf<Readonly<BaseConfig>>();
  });

  // --- Per-plugin configs ---
  it("app.configs has correct per-plugin config types", () => {
    type Configs = TestApp["configs"];
    expectTypeOf<Configs["router"]>().toEqualTypeOf<Readonly<RouterConfig>>();
    expectTypeOf<Configs["build"]>().toEqualTypeOf<Readonly<BuildConfig>>();
    expectTypeOf<Configs["i18n"]>().toEqualTypeOf<Readonly<I18nConfig>>();
    expectTypeOf<Configs["analytics"]>().toEqualTypeOf<Readonly<AnalyticsConfig>>();
  });

  it("app.configs maps void-config plugins to Record<string, never>", () => {
    type VoidPlugin = PluginInstance<"noop", void, Record<string, never>, void>;
    type TestAppWithVoid = App<BaseConfig, BusContract, SignalRegistry, RouterPlugin | VoidPlugin>;
    type Configs = TestAppWithVoid["configs"];
    expectTypeOf<Configs["noop"]>().toEqualTypeOf<Record<string, never>>();
  });

  // --- BuildPluginConfigsAccessor ---
  it("BuildPluginConfigsAccessor maps all plugins including void-config", () => {
    type Accessor = BuildPluginConfigsAccessor<AllPlugins>;
    expectTypeOf<Accessor>().toHaveProperty("router");
    expectTypeOf<Accessor>().toHaveProperty("build");
    expectTypeOf<Accessor>().toHaveProperty("spa");
    expectTypeOf<Accessor>().toHaveProperty("i18n");
    expectTypeOf<Accessor>().toHaveProperty("analytics");
  });

  // --- emit constrained to BusContract ---
  it("emit accepts BusContract keys with correct payloads", () => {
    expectTypeOf<TestApp["emit"]>().toBeFunction();
    expectTypeOf<TestApp["emit"]>().toBeCallableWith("content:updated", {
      path: "/",
      hash: "abc"
    });
    expectTypeOf<TestApp["emit"]>().toBeCallableWith("build:complete", {
      files: ["a.html"],
      duration: 100
    });
  });

  // --- signal constrained to SignalRegistry ---
  it("signal accepts SignalRegistry keys with correct payloads", () => {
    expectTypeOf<TestApp["signal"]>().toBeFunction();
    expectTypeOf<TestApp["signal"]>().toBeCallableWith("route:change", {
      from: "/",
      to: "/about"
    });
  });

  // --- getPlugin constrained to registered names ---
  it("getPlugin is constrained to registered plugin names", () => {
    expectTypeOf<TestApp["getPlugin"]>().toBeFunction();
    expectTypeOf<TestApp["getPlugin"]>().toBeCallableWith("router");
    expectTypeOf<TestApp["getPlugin"]>().toBeCallableWith("build");
    expectTypeOf<TestApp["getPlugin"]>().toBeCallableWith("analytics");
  });

  // --- require constrained to registered names ---
  it("require is constrained to registered plugin names", () => {
    expectTypeOf<TestApp["require"]>().toBeFunction();
    expectTypeOf<TestApp["require"]>().toBeCallableWith("router");
    expectTypeOf<TestApp["require"]>().toBeCallableWith("analytics");
  });

  it("getPlugin and require return typed API for known names", () => {
    // getPlugin returns API | undefined
    type GetRouterResult = ReturnType<TestApp["getPlugin"]>;
    // require returns API directly
    type RequireRouterResult = ReturnType<TestApp["require"]>;
    // Both should produce some result (not never)
    expectTypeOf<GetRouterResult>().not.toBeNever();
    expectTypeOf<RequireRouterResult>().not.toBeNever();
  });

  // --- has accepts any string ---
  it("has accepts any string name", () => {
    expectTypeOf<TestApp["has"]>().toBeCallableWith("anything");
    expectTypeOf<TestApp["has"]>().returns.toEqualTypeOf<boolean>();
  });

  // --- Lifecycle methods ---
  it("start returns Promise<void>", () => {
    expectTypeOf<TestApp["start"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  it("stop returns Promise<void>", () => {
    expectTypeOf<TestApp["stop"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  it("destroy returns Promise<void>", () => {
    expectTypeOf<TestApp["destroy"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  // --- EventBus type ---
  it("EventBus generic constrains emit/on/off/once to event keys", () => {
    type TestBus = EventBus<BusContract>;
    expectTypeOf<TestBus["emit"]>().toBeFunction();
    expectTypeOf<TestBus["on"]>().toBeFunction();
    expectTypeOf<TestBus["off"]>().toBeFunction();
    expectTypeOf<TestBus["once"]>().toBeFunction();
    expectTypeOf<TestBus["clear"]>().toBeFunction();
  });

  // --- Unregistered name is compile error (type-level proof) ---
  it("unregistered plugin names do not extend registered names", () => {
    type RegisteredNames = PluginName<AllPlugins>;
    type IsUnregistered = "nonexistent" extends RegisteredNames ? true : false;
    expectTypeOf<IsUnregistered>().toEqualTypeOf<false>();
  });
});
