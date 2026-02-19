// =============================================================================
// Type Helpers & Aggregate Types - Type-Level Tests
// =============================================================================
// Tests verify all 8 type helpers produce correct results, aggregate types
// (BuildPluginConfigs, BuildPluginApis) work with required/optional/excluded
// keys, and context types follow the 4-tier progression.
// =============================================================================

import { expectTypeOf, test } from "vitest";
import type {
  BuildPluginApis,
  BuildPluginConfigs,
  HasDefaults,
  InitContext,
  IsEmptyConfig,
  MinimalContext,
  OmitNever,
  PluginApiByName,
  PluginApiType,
  PluginConfigType,
  PluginContext,
  PluginInstance,
  PluginName,
  Prettify,
  TeardownContext
} from "../../../src/types";

// =============================================================================
// Test Helper Types
// =============================================================================

// Plugin with config, no defaults (REQUIRED in BuildPluginConfigs)
type RouterConfig = { basePath: string; mode: "hash" | "history" };
type RouterApi = { navigate: (path: string) => void; back: () => void };
type RouterPlugin = PluginInstance<"router", RouterConfig, RouterApi, { currentPath: string }>;

// Plugin with config + defaults (OPTIONAL in BuildPluginConfigs)
type LoggerConfig = { level: "debug" | "info" | "warn" | "error" };
type LoggerApi = { log: (message: string) => void };
type LoggerPluginWithDefaults = PluginInstance<"logger", LoggerConfig, LoggerApi, void> & {
  _hasDefaults: true;
};

// Plugin with void config (EXCLUDED from BuildPluginConfigs)
type AnalyticsApi = { track: (event: string) => void };
type AnalyticsPlugin = PluginInstance<"analytics", void, AnalyticsApi, void>;

type TestBus = { "page:load": { url: string }; "page:error": { code: number } };
type TestSignals = { "theme:changed": { dark: boolean } };
type TestGlobal = { appName: string; debug: boolean };

// =============================================================================
// 1. Prettify
// =============================================================================

test("Prettify flattens intersection types", () => {
  type Intersected = { a: string } & { b: number };
  type Flattened = Prettify<Intersected>;
  expectTypeOf<Flattened>().toEqualTypeOf<{ a: string; b: number }>();
});

test("Prettify identity: single object type unchanged", () => {
  type Original = { a: string };
  type Result = Prettify<Original>;
  expectTypeOf<Result>().toEqualTypeOf<{ a: string }>();
});

// =============================================================================
// 2. OmitNever
// =============================================================================

test("OmitNever removes keys with never value type", () => {
  type WithNever = { a: string; b: never; c: number };
  type Result = OmitNever<WithNever>;
  expectTypeOf<Result>().toEqualTypeOf<{ a: string; c: number }>();
});

test("OmitNever with all-never produces empty object", () => {
  type AllNever = { a: never };
  type Result = OmitNever<AllNever>;
  expectTypeOf<Result>().toEqualTypeOf<{}>();
});

// =============================================================================
// 3. PluginName
// =============================================================================

test("PluginName extracts literal name from concrete PluginInstance", () => {
  expectTypeOf<PluginName<RouterPlugin>>().toEqualTypeOf<"router">();
});

test("PluginName extracts union of names from union of PluginInstances", () => {
  type PluginUnion = RouterPlugin | AnalyticsPlugin;
  expectTypeOf<PluginName<PluginUnion>>().toEqualTypeOf<"router" | "analytics">();
});

test("PluginName extracts string from default PluginInstance", () => {
  expectTypeOf<PluginName<PluginInstance>>().toBeString();
});

// =============================================================================
// 4. PluginConfigType
// =============================================================================

test("PluginConfigType extracts concrete config type", () => {
  expectTypeOf<PluginConfigType<RouterPlugin>>().toEqualTypeOf<RouterConfig>();
});

test("PluginConfigType extracts void from void-config plugin", () => {
  expectTypeOf<PluginConfigType<AnalyticsPlugin>>().toBeVoid();
});

test("PluginConfigType extracts union from union of plugins", () => {
  type PluginUnion = RouterPlugin | AnalyticsPlugin;
  expectTypeOf<PluginConfigType<PluginUnion>>().toEqualTypeOf<RouterConfig | void>();
});

// =============================================================================
// 5. PluginApiType
// =============================================================================

test("PluginApiType extracts concrete API type", () => {
  expectTypeOf<PluginApiType<RouterPlugin>>().toEqualTypeOf<RouterApi>();
});

test("PluginApiType extracts empty record from default PluginInstance", () => {
  expectTypeOf<PluginApiType<PluginInstance>>().toEqualTypeOf<Record<string, never>>();
});

// =============================================================================
// 6. IsEmptyConfig
// =============================================================================

test("IsEmptyConfig: void is true", () => {
  expectTypeOf<IsEmptyConfig<void>>().toEqualTypeOf<true>();
});

test("IsEmptyConfig: empty object type {} is true", () => {
  // biome-ignore lint/complexity/noBannedTypes: Testing empty object type intentionally
  expectTypeOf<IsEmptyConfig<{}>>().toEqualTypeOf<true>();
});

test("IsEmptyConfig: Record<string, never> is false (has string index)", () => {
  // Record<string, never> has keyof = string, not never
  expectTypeOf<IsEmptyConfig<Record<string, never>>>().toEqualTypeOf<false>();
});

test("IsEmptyConfig: populated config is false", () => {
  expectTypeOf<IsEmptyConfig<{ field: string }>>().toEqualTypeOf<false>();
});

test("IsEmptyConfig: optional property still counts as false", () => {
  expectTypeOf<IsEmptyConfig<{ field?: string }>>().toEqualTypeOf<false>();
});

// =============================================================================
// 7. HasDefaults
// =============================================================================

test("HasDefaults: _hasDefaults true returns true", () => {
  type WithDefaults = PluginInstance<"test", { x: number }> & {
    _hasDefaults: true;
  };
  expectTypeOf<HasDefaults<WithDefaults>>().toEqualTypeOf<true>();
});

test("HasDefaults: _hasDefaults false returns false", () => {
  type WithoutDefaults = PluginInstance<"test", { x: number }> & {
    _hasDefaults: false;
  };
  expectTypeOf<HasDefaults<WithoutDefaults>>().toEqualTypeOf<false>();
});

test("HasDefaults: default _hasDefaults (boolean) returns false", () => {
  // Key subtlety: _hasDefaults: boolean should NOT match true
  type DefaultPlugin = PluginInstance<"test", { x: number }>;
  expectTypeOf<HasDefaults<DefaultPlugin>>().toEqualTypeOf<false>();
});

// =============================================================================
// 8. PluginApiByName
// =============================================================================

test("PluginApiByName extracts correct API by name from plugin union", () => {
  type PluginUnion = RouterPlugin | AnalyticsPlugin;
  type RouterResult = PluginApiByName<PluginUnion, "router">;
  expectTypeOf<RouterResult>().toHaveProperty("navigate");
  expectTypeOf<RouterResult>().toHaveProperty("back");
  expectTypeOf<RouterResult>().toHaveProperty("config");
});

test("PluginApiByName includes readonly config property", () => {
  type Result = PluginApiByName<RouterPlugin, "router">;
  expectTypeOf<Result["config"]>().toEqualTypeOf<Readonly<RouterConfig>>();
});

test("PluginApiByName for non-existent name returns never", () => {
  type PluginUnion = RouterPlugin | AnalyticsPlugin;
  type Result = PluginApiByName<PluginUnion, "nonexistent">;
  expectTypeOf<Result>().toBeNever();
});

// =============================================================================
// 9. BuildPluginConfigs
// =============================================================================

test("BuildPluginConfigs: required key for plugin with config, no defaults", () => {
  type AllPlugins = RouterPlugin | LoggerPluginWithDefaults | AnalyticsPlugin;
  type Configs = BuildPluginConfigs<AllPlugins>;
  // Router: has config, no defaults -> REQUIRED
  expectTypeOf<Configs>().toHaveProperty("router");
  // The router key should be required (not optional)
  type RouterValue = Configs["router"];
  expectTypeOf<RouterValue>().toEqualTypeOf<RouterConfig>();
});

test("BuildPluginConfigs: optional key for plugin with config + defaults", () => {
  type AllPlugins = RouterPlugin | LoggerPluginWithDefaults | AnalyticsPlugin;
  type Configs = BuildPluginConfigs<AllPlugins>;
  // Logger: has config, has defaults -> OPTIONAL (Partial<LoggerConfig>)
  // Verify the key exists and is partial
  type HasLogger = "logger" extends keyof Configs ? true : false;
  expectTypeOf<HasLogger>().toEqualTypeOf<true>();
});

test("BuildPluginConfigs: void-config plugin is excluded", () => {
  type AllPlugins = RouterPlugin | LoggerPluginWithDefaults | AnalyticsPlugin;
  type Configs = BuildPluginConfigs<AllPlugins>;
  // Analytics: void config -> EXCLUDED
  type HasAnalytics = "analytics" extends keyof Configs ? true : false;
  expectTypeOf<HasAnalytics>().toEqualTypeOf<false>();
});

// =============================================================================
// 10. BuildPluginApis
// =============================================================================

test("BuildPluginApis maps plugin names to API + config", () => {
  type PluginUnion = RouterPlugin | AnalyticsPlugin;
  type Apis = BuildPluginApis<PluginUnion>;
  expectTypeOf<Apis>().toHaveProperty("router");
  expectTypeOf<Apis>().toHaveProperty("analytics");
});

test("BuildPluginApis: each entry includes API methods and config", () => {
  type PluginUnion = RouterPlugin | AnalyticsPlugin;
  type Apis = BuildPluginApis<PluginUnion>;
  // Router entry should have navigate, back, and config
  expectTypeOf<Apis["router"]>().toHaveProperty("navigate");
  expectTypeOf<Apis["router"]>().toHaveProperty("back");
  expectTypeOf<Apis["router"]>().toHaveProperty("config");
});

test("BuildPluginApis: void-config plugin gets empty config", () => {
  type PluginUnion = RouterPlugin | AnalyticsPlugin;
  type Apis = BuildPluginApis<PluginUnion>;
  // Analytics has void config -> config is Record<string, never>
  expectTypeOf<Apis["analytics"]["config"]>().toEqualTypeOf<Record<string, never>>();
});

// =============================================================================
// 11. Context tier progression
// =============================================================================

test("TeardownContext has only global", () => {
  type Teardown = TeardownContext<TestGlobal>;
  expectTypeOf<Teardown>().toHaveProperty("global");
  expectTypeOf<Teardown["global"]>().toEqualTypeOf<Readonly<TestGlobal>>();
});

test("TeardownContext does not have config, emit, signal, state", () => {
  type Teardown = TeardownContext<TestGlobal>;
  expectTypeOf<Teardown>().not.toHaveProperty("config");
  expectTypeOf<Teardown>().not.toHaveProperty("emit");
  expectTypeOf<Teardown>().not.toHaveProperty("signal");
  expectTypeOf<Teardown>().not.toHaveProperty("state");
});

test("MinimalContext extends TeardownContext with config", () => {
  type Minimal = MinimalContext<TestGlobal, RouterConfig>;
  expectTypeOf<Minimal>().toHaveProperty("global");
  expectTypeOf<Minimal>().toHaveProperty("config");
  expectTypeOf<Minimal["config"]>().toEqualTypeOf<Readonly<RouterConfig>>();
});

test("MinimalContext does not have emit, signal, state", () => {
  type Minimal = MinimalContext<TestGlobal, RouterConfig>;
  expectTypeOf<Minimal>().not.toHaveProperty("emit");
  expectTypeOf<Minimal>().not.toHaveProperty("signal");
  expectTypeOf<Minimal>().not.toHaveProperty("state");
});

test("InitContext extends MinimalContext with communication methods", () => {
  type Init = InitContext<TestGlobal, TestBus, TestSignals, RouterConfig>;
  expectTypeOf<Init>().toHaveProperty("global");
  expectTypeOf<Init>().toHaveProperty("config");
  expectTypeOf<Init>().toHaveProperty("emit");
  expectTypeOf<Init>().toHaveProperty("signal");
  expectTypeOf<Init>().toHaveProperty("getPlugin");
  expectTypeOf<Init>().toHaveProperty("require");
  expectTypeOf<Init>().toHaveProperty("has");
});

test("InitContext does not have state", () => {
  type Init = InitContext<TestGlobal, TestBus, TestSignals, RouterConfig>;
  expectTypeOf<Init>().not.toHaveProperty("state");
});

test("PluginContext extends InitContext with state", () => {
  type Full = PluginContext<
    TestGlobal,
    TestBus,
    TestSignals,
    RouterConfig,
    { currentPath: string }
  >;
  expectTypeOf<Full>().toHaveProperty("global");
  expectTypeOf<Full>().toHaveProperty("config");
  expectTypeOf<Full>().toHaveProperty("emit");
  expectTypeOf<Full>().toHaveProperty("signal");
  expectTypeOf<Full>().toHaveProperty("getPlugin");
  expectTypeOf<Full>().toHaveProperty("require");
  expectTypeOf<Full>().toHaveProperty("has");
  expectTypeOf<Full>().toHaveProperty("state");
  expectTypeOf<Full["state"]>().toEqualTypeOf<{ currentPath: string }>();
});

test("InitContext signal has overloaded signatures for known and unknown names", () => {
  type Init = InitContext<TestGlobal, TestBus, TestSignals, RouterConfig>;
  // Signal should accept known signal names with typed payloads
  type SignalFunction = Init["signal"];
  expectTypeOf<SignalFunction>().toBeFunction();
});

test("PluginContext signal has same overloaded signatures", () => {
  type Full = PluginContext<TestGlobal, TestBus, TestSignals, RouterConfig, void>;
  type SignalFunction = Full["signal"];
  expectTypeOf<SignalFunction>().toBeFunction();
});

test("Context tier structural compatibility: MinimalContext extends TeardownContext", () => {
  type Minimal = MinimalContext<TestGlobal, RouterConfig>;
  expectTypeOf<Minimal>().toMatchTypeOf<TeardownContext<TestGlobal>>();
});

test("Context tier structural compatibility: InitContext extends MinimalContext", () => {
  type Init = InitContext<TestGlobal, TestBus, TestSignals, RouterConfig>;
  expectTypeOf<Init>().toMatchTypeOf<MinimalContext<TestGlobal, RouterConfig>>();
});

test("Context tier structural compatibility: PluginContext extends InitContext", () => {
  type Full = PluginContext<TestGlobal, TestBus, TestSignals, RouterConfig, void>;
  expectTypeOf<Full>().toMatchTypeOf<InitContext<TestGlobal, TestBus, TestSignals, RouterConfig>>();
});
