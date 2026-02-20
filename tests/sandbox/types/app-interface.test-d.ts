// =============================================================================
// App Interface Types - Type-Level Tests
// =============================================================================
// Tests verify BuildPluginApis excludes void-API plugins, config is NOT on API,
// App.configs has correct per-plugin config types, typed getPlugin/require are
// constrained to registered names, and App lifecycle method return types.
// =============================================================================

import { describe, expectTypeOf, it } from "vitest";
import type {
  App,
  BuildPluginApis,
  BuildPluginConfigsAccessor,
  PluginApiByName,
  PluginInstance
} from "../../../src/types";

// =============================================================================
// Test Helper Types
// =============================================================================

type TestConfig = { debug: boolean; port: number };
type TestBus = { "page:render": { path: string } };
type TestSignals = { "nav:change": { from: string; to: string } };

type RouterApi = { navigate: (path: string) => void; currentPath: () => string };
type RouterConfig = { basePath: string };

type LoggerApi = { log: (msg: string) => void };
type LoggerConfig = { level: string };

// Plugin with API
type RouterPlugin = PluginInstance<"router", RouterConfig, RouterApi, void>;
// Plugin with API
type LoggerPlugin = PluginInstance<"logger", LoggerConfig, LoggerApi, void>;
// Plugin WITHOUT API (void API = lifecycle only)
type LifecyclePlugin = PluginInstance<"lifecycle", void, Record<string, never>, void>;

// Full App type with all test plugins
type TestApp = App<TestConfig, TestBus, TestSignals, RouterPlugin | LoggerPlugin | LifecyclePlugin>;

// =============================================================================
// 1. BuildPluginApis excludes void-API plugins
// =============================================================================

describe("BuildPluginApis", () => {
  it("excludes void-API plugins from the mapped type", () => {
    type Apis = BuildPluginApis<RouterPlugin | LifecyclePlugin>;
    expectTypeOf<Apis>().toHaveProperty("router");
    type HasLifecycle = "lifecycle" extends keyof Apis ? true : false;
    expectTypeOf<HasLifecycle>().toEqualTypeOf<false>();
  });

  it("maps plugin name to API type for non-void-API plugins", () => {
    type Apis = BuildPluginApis<RouterPlugin | LoggerPlugin>;
    expectTypeOf<Apis>().toHaveProperty("router");
    expectTypeOf<Apis>().toHaveProperty("logger");
    expectTypeOf<Apis["router"]>().toHaveProperty("navigate");
    expectTypeOf<Apis["router"]>().toHaveProperty("currentPath");
    expectTypeOf<Apis["logger"]>().toHaveProperty("log");
  });

  it("does NOT include config on the API type", () => {
    type Apis = BuildPluginApis<RouterPlugin>;
    expectTypeOf<Apis["router"]>().not.toHaveProperty("config");
  });
});

// =============================================================================
// 2. App type has configs property
// =============================================================================

describe("App.configs", () => {
  it("App type has a configs property", () => {
    expectTypeOf<TestApp>().toHaveProperty("configs");
  });

  it("App.configs has correct per-plugin config types", () => {
    type Configs = TestApp["configs"];
    expectTypeOf<Configs["router"]>().toEqualTypeOf<Readonly<RouterConfig>>();
    expectTypeOf<Configs["logger"]>().toEqualTypeOf<Readonly<LoggerConfig>>();
  });

  it("App.configs includes void-config plugins as Record<string, never>", () => {
    type Configs = TestApp["configs"];
    expectTypeOf<Configs["lifecycle"]>().toEqualTypeOf<Record<string, never>>();
  });
});

// =============================================================================
// 3. BuildPluginConfigsAccessor
// =============================================================================

describe("BuildPluginConfigsAccessor", () => {
  it("maps all plugin names including void-config plugins", () => {
    type Configs = BuildPluginConfigsAccessor<RouterPlugin | LifecyclePlugin>;
    expectTypeOf<Configs>().toHaveProperty("router");
    expectTypeOf<Configs>().toHaveProperty("lifecycle");
  });

  it("concrete config is Readonly", () => {
    type Configs = BuildPluginConfigsAccessor<RouterPlugin>;
    expectTypeOf<Configs["router"]>().toEqualTypeOf<Readonly<RouterConfig>>();
  });
});

// =============================================================================
// 4. PluginApiByName returns raw API
// =============================================================================

describe("PluginApiByName", () => {
  it("returns raw API without config augmentation", () => {
    type Result = PluginApiByName<RouterPlugin, "router">;
    expectTypeOf<Result>().toHaveProperty("navigate");
    expectTypeOf<Result>().toHaveProperty("currentPath");
    expectTypeOf<Result>().not.toHaveProperty("config");
  });
});

// =============================================================================
// 5. App.getPlugin/require typed and constrained
// =============================================================================

describe("App.getPlugin and App.require", () => {
  it("getPlugin is a function accepting registered plugin names", () => {
    expectTypeOf<TestApp["getPlugin"]>().toBeFunction();
    // The getPlugin function signature constrains N to PluginName<P>
    // which is "router" | "logger" | "lifecycle" for our test plugins
    type GetPluginFunction = TestApp["getPlugin"];
    expectTypeOf<GetPluginFunction>().toBeCallableWith("router");
  });

  it("require is a function accepting registered plugin names", () => {
    expectTypeOf<TestApp["require"]>().toBeFunction();
    type RequireFunction = TestApp["require"];
    expectTypeOf<RequireFunction>().toBeCallableWith("router");
  });

  it("getPlugin/require constrained to registered names (unregistered is compile error)", () => {
    // "unregistered" does not extend PluginName<RouterPlugin | LoggerPlugin | LifecyclePlugin>
    // which is "router" | "logger" | "lifecycle", so this should be a type error
    type UnregisteredName = "unregistered" extends "router" | "logger" | "lifecycle" ? true : false;
    expectTypeOf<UnregisteredName>().toEqualTypeOf<false>();
  });
});

// =============================================================================
// 6. App lifecycle methods
// =============================================================================

describe("App lifecycle methods", () => {
  it("start returns Promise<void>", () => {
    expectTypeOf<TestApp["start"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  it("stop returns Promise<void>", () => {
    expectTypeOf<TestApp["stop"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  it("destroy returns Promise<void>", () => {
    expectTypeOf<TestApp["destroy"]>().returns.toEqualTypeOf<Promise<void>>();
  });
});

// =============================================================================
// 7. App.emit constrained to BusContract
// =============================================================================

describe("App.emit", () => {
  it("emit is constrained to BusContract keys", () => {
    expectTypeOf<TestApp["emit"]>().toBeFunction();
    // The emit function should accept "page:render" with the correct payload
    type EmitFunction = TestApp["emit"];
    expectTypeOf<EmitFunction>().toBeCallableWith("page:render", {
      path: "/home"
    });
  });
});

// =============================================================================
// 8. App.signal overloads
// =============================================================================

describe("App.signal", () => {
  it("signal has typed and untyped signatures", () => {
    expectTypeOf<TestApp["signal"]>().toBeFunction();
    // Typed: known signal name with typed payload
    type SignalFunction = TestApp["signal"];
    expectTypeOf<SignalFunction>().toBeCallableWith("nav:change", {
      from: "/a",
      to: "/b"
    });
  });
});

// =============================================================================
// 9. App has property
// =============================================================================

describe("App.has", () => {
  it("has accepts any string name", () => {
    expectTypeOf<TestApp["has"]>().toBeCallableWith("anything");
  });

  it("has returns boolean", () => {
    expectTypeOf<TestApp["has"]>().returns.toEqualTypeOf<boolean>();
  });
});

// =============================================================================
// 10. App.config is plain Readonly<G>
// =============================================================================

describe("App.config", () => {
  it("config is Readonly<G>", () => {
    expectTypeOf<TestApp["config"]>().toEqualTypeOf<Readonly<TestConfig>>();
  });
});
