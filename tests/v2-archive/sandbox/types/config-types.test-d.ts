// =============================================================================
// Config Types - Type-Level Tests
// =============================================================================
// Tests verify BuildPluginConfigs produces correct required/optional/excluded
// keys, and AppConfig phantom types carry the correct union of plugins via
// direct type instantiation with explicit generics.
// =============================================================================

import { expectTypeOf, test } from "vitest";
import type { AppConfig, BuildPluginConfigs, PluginInstance } from "../../../src/types";

// =============================================================================
// Test Helper Types
// =============================================================================

// Plugin with config, no defaults (REQUIRED in BuildPluginConfigs)
type AuthConfig = { secret: string; expiresIn: number };
type AuthApi = { login: () => void; logout: () => void };
type AuthPlugin = PluginInstance<"auth", AuthConfig, AuthApi, void>;

// Another plugin with config, no defaults (REQUIRED)
type RouterConfig = { basePath: string; mode: "hash" | "history" };
type RouterApi = { navigate: (path: string) => void };
type RouterPlugin = PluginInstance<"router", RouterConfig, RouterApi, void>;

// Plugin with config + defaults (OPTIONAL in BuildPluginConfigs)
type LoggerConfig = { level: "debug" | "info" | "warn" | "error" };
type LoggerApi = { log: (message: string) => void };
type LoggerPluginWithDefaults = PluginInstance<"logger", LoggerConfig, LoggerApi, void> & {
  _hasDefaults: true;
};

// Another plugin with config + defaults (OPTIONAL)
type CacheConfig = { ttl: number; maxSize: number };
type CacheApi = { get: (key: string) => unknown };
type CachePluginWithDefaults = PluginInstance<"cache", CacheConfig, CacheApi, void> & {
  _hasDefaults: true;
};

// Plugin with void config (EXCLUDED from BuildPluginConfigs)
type MetricsApi = { track: (event: string) => void };
type MetricsPlugin = PluginInstance<"metrics", void, MetricsApi, void>;

// Plugin with empty object config (EXCLUDED from BuildPluginConfigs)
// biome-ignore lint/complexity/noBannedTypes: Testing empty object type intentionally
type EmptyConfigPlugin = PluginInstance<"empty", {}, Record<string, never>, void>;

// =============================================================================
// 1. BuildPluginConfigs
// =============================================================================

test("BuildPluginConfigs: plugin with config, no defaults -> key is REQUIRED", () => {
  type Configs = BuildPluginConfigs<AuthPlugin>;
  expectTypeOf<Configs>().toHaveProperty("auth");
  // Auth key must be required (full AuthConfig)
  expectTypeOf<Configs["auth"]>().toEqualTypeOf<AuthConfig>();
});

test("BuildPluginConfigs: plugin with config + defaults -> key is OPTIONAL (Partial<C>)", () => {
  type Configs = BuildPluginConfigs<LoggerPluginWithDefaults>;
  // Logger key must be optional
  type HasLogger = "logger" extends keyof Configs ? true : false;
  expectTypeOf<HasLogger>().toEqualTypeOf<true>();
});

test("BuildPluginConfigs: plugin with void config -> key is EXCLUDED", () => {
  type Configs = BuildPluginConfigs<MetricsPlugin>;
  type HasMetrics = "metrics" extends keyof Configs ? true : false;
  expectTypeOf<HasMetrics>().toEqualTypeOf<false>();
});

test("BuildPluginConfigs: plugin with {} config -> key is EXCLUDED", () => {
  type Configs = BuildPluginConfigs<EmptyConfigPlugin>;
  type HasEmpty = "empty" extends keyof Configs ? true : false;
  expectTypeOf<HasEmpty>().toEqualTypeOf<false>();
});

test("BuildPluginConfigs: union of required + optional + excluded produces correct type", () => {
  type AllPlugins = AuthPlugin | LoggerPluginWithDefaults | MetricsPlugin;
  type Configs = BuildPluginConfigs<AllPlugins>;

  // auth: required
  expectTypeOf<Configs["auth"]>().toEqualTypeOf<AuthConfig>();

  // logger: present (optional)
  type HasLogger = "logger" extends keyof Configs ? true : false;
  expectTypeOf<HasLogger>().toEqualTypeOf<true>();

  // metrics: excluded
  type HasMetrics = "metrics" extends keyof Configs ? true : false;
  expectTypeOf<HasMetrics>().toEqualTypeOf<false>();
});

test("BuildPluginConfigs: multiple required plugins -> all keys present and required", () => {
  type AllRequired = AuthPlugin | RouterPlugin;
  type Configs = BuildPluginConfigs<AllRequired>;
  expectTypeOf<Configs["auth"]>().toEqualTypeOf<AuthConfig>();
  expectTypeOf<Configs["router"]>().toEqualTypeOf<RouterConfig>();
});

test("BuildPluginConfigs: multiple optional plugins -> all keys present and optional", () => {
  type AllOptional = LoggerPluginWithDefaults | CachePluginWithDefaults;
  type Configs = BuildPluginConfigs<AllOptional>;
  type HasLogger = "logger" extends keyof Configs ? true : false;
  type HasCache = "cache" extends keyof Configs ? true : false;
  expectTypeOf<HasLogger>().toEqualTypeOf<true>();
  expectTypeOf<HasCache>().toEqualTypeOf<true>();
});

// =============================================================================
// 2. AppConfig phantom types
// =============================================================================

test("AppConfig carries _allPlugins as union of DefaultP | ExtraPlugins[number]", () => {
  type TestConfig = AppConfig<{ debug: boolean }, AuthPlugin, [MetricsPlugin]>;
  expectTypeOf<TestConfig["_allPlugins"]>().toEqualTypeOf<AuthPlugin | MetricsPlugin>();
});

test("AppConfig with no extras (empty tuple): _allPlugins equals DefaultP only", () => {
  type TestConfig = AppConfig<{ debug: boolean }, AuthPlugin, []>;
  expectTypeOf<TestConfig["_allPlugins"]>().toEqualTypeOf<AuthPlugin>();
});

test("AppConfig with extras: _allPlugins includes both default and extra plugin types", () => {
  type TestConfig = AppConfig<{ debug: boolean }, AuthPlugin, [MetricsPlugin, RouterPlugin]>;
  expectTypeOf<TestConfig["_allPlugins"]>().toEqualTypeOf<
    AuthPlugin | MetricsPlugin | RouterPlugin
  >();
});

test("AppConfig _brand is literal 'AppConfig'", () => {
  type TestConfig = AppConfig<{ debug: boolean }, AuthPlugin, []>;
  expectTypeOf<TestConfig["_brand"]>().toEqualTypeOf<"AppConfig">();
});

test("AppConfig global is Readonly<G> (fully resolved, not Partial)", () => {
  type TestConfig = AppConfig<{ debug: boolean; name: string }, AuthPlugin, []>;
  expectTypeOf<TestConfig["global"]>().toEqualTypeOf<Readonly<{ debug: boolean; name: string }>>();
});

test("AppConfig _pluginConfigs is ReadonlyMap<string, Readonly<Record<string, unknown>>>", () => {
  type TestConfig = AppConfig<{ debug: boolean }, AuthPlugin, []>;
  expectTypeOf<TestConfig["_pluginConfigs"]>().toEqualTypeOf<
    ReadonlyMap<string, Readonly<Record<string, unknown>>>
  >();
});

test("AppConfig _plugins is ReadonlyArray<PluginInstance>", () => {
  type TestConfig = AppConfig<{ debug: boolean }, AuthPlugin, []>;
  expectTypeOf<TestConfig["_plugins"]>().toEqualTypeOf<ReadonlyArray<PluginInstance>>();
});
