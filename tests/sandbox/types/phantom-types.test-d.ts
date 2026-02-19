// =============================================================================
// Phantom Types & Instance Interfaces - Type-Level Tests
// =============================================================================
// Tests verify that phantom types carry generic information correctly through
// instance interfaces, default generics work as expected, and spec interfaces
// enforce correct context types per lifecycle phase.
// =============================================================================

import { expectTypeOf, test } from "vitest";
import type {
  ComponentInstance,
  ComponentSpec,
  HasDefaults,
  InitContext,
  MinimalContext,
  ModuleInstance,
  ModuleSpec,
  PluginContext,
  PluginInstance,
  PluginSpec,
  TeardownContext
} from "../../../src/types";

// =============================================================================
// Test Helper Types
// =============================================================================

type RouterConfig = { basePath: string };
type RouterApi = { navigate: (path: string) => void };
type RouterState = { currentPath: string };

type LoggerConfig = { level: "debug" | "info" | "warn" | "error" };
type LoggerApi = { log: (message: string) => void };

type TestBus = { "page:load": { url: string }; "page:error": { code: number } };
type TestSignals = { "theme:changed": { dark: boolean } };
type TestGlobal = { appName: string; debug: boolean };

// =============================================================================
// 1. PluginInstance phantom types
// =============================================================================

test("PluginInstance carries phantom config type", () => {
  type Router = PluginInstance<"router", RouterConfig, RouterApi, RouterState>;
  expectTypeOf<Router["_types"]["config"]>().toEqualTypeOf<RouterConfig>();
});

test("PluginInstance carries phantom api type", () => {
  type Router = PluginInstance<"router", RouterConfig, RouterApi, RouterState>;
  expectTypeOf<Router["_types"]["api"]>().toEqualTypeOf<RouterApi>();
});

test("PluginInstance carries phantom state type", () => {
  type Router = PluginInstance<"router", RouterConfig, RouterApi, RouterState>;
  expectTypeOf<Router["_types"]["state"]>().toEqualTypeOf<RouterState>();
});

test("PluginInstance kind is literal 'plugin'", () => {
  type Router = PluginInstance<"router", RouterConfig, RouterApi, RouterState>;
  expectTypeOf<Router["kind"]>().toEqualTypeOf<"plugin">();
});

test("PluginInstance name is literal string type", () => {
  type Router = PluginInstance<"router", RouterConfig, RouterApi, RouterState>;
  expectTypeOf<Router["name"]>().toEqualTypeOf<"router">();
});

// =============================================================================
// 2. ComponentInstance phantom types
// =============================================================================

test("ComponentInstance kind is literal 'component'", () => {
  type Button = ComponentInstance<
    "button",
    { size: number },
    { click: () => void },
    { pressed: boolean }
  >;
  expectTypeOf<Button["kind"]>().toEqualTypeOf<"component">();
});

test("ComponentInstance carries phantom types identically to PluginInstance", () => {
  type Button = ComponentInstance<
    "button",
    { size: number },
    { click: () => void },
    { pressed: boolean }
  >;
  expectTypeOf<Button["_types"]["config"]>().toEqualTypeOf<{ size: number }>();
  expectTypeOf<Button["_types"]["api"]>().toEqualTypeOf<{ click: () => void }>();
  expectTypeOf<Button["_types"]["state"]>().toEqualTypeOf<{ pressed: boolean }>();
});

test("ComponentInstance name carries literal type", () => {
  type Button = ComponentInstance<"button">;
  expectTypeOf<Button["name"]>().toEqualTypeOf<"button">();
});

// =============================================================================
// 3. ModuleInstance structure
// =============================================================================

test("ModuleInstance kind is literal 'module'", () => {
  type AuthModule = ModuleInstance<"auth">;
  expectTypeOf<AuthModule["kind"]>().toEqualTypeOf<"module">();
});

test("ModuleInstance name carries literal type", () => {
  type AuthModule = ModuleInstance<"auth">;
  expectTypeOf<AuthModule["name"]>().toEqualTypeOf<"auth">();
});

test("ModuleInstance does not have _types field", () => {
  type AuthModule = ModuleInstance<"auth">;
  expectTypeOf<AuthModule>().not.toHaveProperty("_types");
});

test("ModuleInstance does not have _hasDefaults field", () => {
  type AuthModule = ModuleInstance<"auth">;
  expectTypeOf<AuthModule>().not.toHaveProperty("_hasDefaults");
});

// =============================================================================
// 4. Default generic parameters
// =============================================================================

test("PluginInstance defaults: string name, void config, empty api, void state", () => {
  type DefaultPlugin = PluginInstance;
  expectTypeOf<DefaultPlugin["name"]>().toBeString();
  expectTypeOf<DefaultPlugin["_types"]["config"]>().toBeVoid();
  expectTypeOf<DefaultPlugin["_types"]["api"]>().toEqualTypeOf<Record<string, never>>();
  expectTypeOf<DefaultPlugin["_types"]["state"]>().toBeVoid();
});

test("ComponentInstance defaults match PluginInstance defaults", () => {
  type DefaultComponent = ComponentInstance;
  expectTypeOf<DefaultComponent["name"]>().toBeString();
  expectTypeOf<DefaultComponent["_types"]["config"]>().toBeVoid();
  expectTypeOf<DefaultComponent["_types"]["api"]>().toEqualTypeOf<Record<string, never>>();
  expectTypeOf<DefaultComponent["_types"]["state"]>().toBeVoid();
});

test("ModuleInstance defaults: string name, void config", () => {
  type DefaultModule = ModuleInstance;
  expectTypeOf<DefaultModule["name"]>().toBeString();
});

// =============================================================================
// 5. _hasDefaults phantom
// =============================================================================

test("PluginInstance _hasDefaults is boolean by default", () => {
  type DefaultPlugin = PluginInstance;
  expectTypeOf<DefaultPlugin["_hasDefaults"]>().toBeBoolean();
});

test("HasDefaults extracts true from _hasDefaults: true", () => {
  type WithDefaults = PluginInstance<"test", { x: number }> & { _hasDefaults: true };
  expectTypeOf<HasDefaults<WithDefaults>>().toEqualTypeOf<true>();
});

test("HasDefaults extracts false from _hasDefaults: false", () => {
  type WithoutDefaults = PluginInstance<"test", { x: number }> & { _hasDefaults: false };
  expectTypeOf<HasDefaults<WithoutDefaults>>().toEqualTypeOf<false>();
});

test("HasDefaults returns false for default _hasDefaults (boolean)", () => {
  type DefaultPlugin = PluginInstance<"test", { x: number }>;
  expectTypeOf<HasDefaults<DefaultPlugin>>().toEqualTypeOf<false>();
});

// =============================================================================
// 6. PluginSpec lifecycle method contexts
// =============================================================================

test("PluginSpec createState accepts MinimalContext and returns S | Promise<S>", () => {
  type Spec = PluginSpec<
    "test",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  type CreateState = NonNullable<Spec["createState"]>;
  expectTypeOf<CreateState>()
    .parameter(0)
    .toMatchTypeOf<MinimalContext<TestGlobal, RouterConfig>>();
  expectTypeOf<CreateState>().returns.toEqualTypeOf<RouterState | Promise<RouterState>>();
});

test("PluginSpec onCreate accepts MinimalContext", () => {
  type Spec = PluginSpec<
    "test",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  type OnCreate = NonNullable<Spec["onCreate"]>;
  expectTypeOf<OnCreate>().parameter(0).toMatchTypeOf<MinimalContext<TestGlobal, RouterConfig>>();
});

test("PluginSpec api accepts PluginContext (full context)", () => {
  type Spec = PluginSpec<
    "test",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  type ApiMethod = NonNullable<Spec["api"]>;
  expectTypeOf<ApiMethod>()
    .parameter(0)
    .toMatchTypeOf<PluginContext<TestGlobal, TestBus, TestSignals, RouterConfig, RouterState>>();
});

test("PluginSpec onInit accepts InitContext (no state)", () => {
  type Spec = PluginSpec<
    "test",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  type OnInit = NonNullable<Spec["onInit"]>;
  expectTypeOf<OnInit>()
    .parameter(0)
    .toMatchTypeOf<InitContext<TestGlobal, TestBus, TestSignals, RouterConfig>>();
});

test("PluginSpec onStart accepts PluginContext (full context)", () => {
  type Spec = PluginSpec<
    "test",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  type OnStart = NonNullable<Spec["onStart"]>;
  expectTypeOf<OnStart>()
    .parameter(0)
    .toMatchTypeOf<PluginContext<TestGlobal, TestBus, TestSignals, RouterConfig, RouterState>>();
});

test("PluginSpec onStop accepts TeardownContext", () => {
  type Spec = PluginSpec<
    "test",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  type OnStop = NonNullable<Spec["onStop"]>;
  expectTypeOf<OnStop>().parameter(0).toMatchTypeOf<TeardownContext<TestGlobal>>();
});

test("PluginSpec onDestroy accepts TeardownContext", () => {
  type Spec = PluginSpec<
    "test",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  type OnDestroy = NonNullable<Spec["onDestroy"]>;
  expectTypeOf<OnDestroy>().parameter(0).toMatchTypeOf<TeardownContext<TestGlobal>>();
});

test("PluginSpec lifecycle methods accept both sync and async returns", () => {
  type Spec = PluginSpec<
    "test",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  // onCreate returns void | Promise<void>
  type OnCreate = NonNullable<Spec["onCreate"]>;
  expectTypeOf<OnCreate>().returns.toEqualTypeOf<void | Promise<void>>();
  // onInit returns void | Promise<void>
  type OnInit = NonNullable<Spec["onInit"]>;
  expectTypeOf<OnInit>().returns.toEqualTypeOf<void | Promise<void>>();
  // onStart returns void | Promise<void>
  type OnStart = NonNullable<Spec["onStart"]>;
  expectTypeOf<OnStart>().returns.toEqualTypeOf<void | Promise<void>>();
  // onStop returns void | Promise<void>
  type OnStop = NonNullable<Spec["onStop"]>;
  expectTypeOf<OnStop>().returns.toEqualTypeOf<void | Promise<void>>();
  // onDestroy returns void | Promise<void>
  type OnDestroy = NonNullable<Spec["onDestroy"]>;
  expectTypeOf<OnDestroy>().returns.toEqualTypeOf<void | Promise<void>>();
});

// =============================================================================
// 7. ComponentSpec lifecycle method contexts
// =============================================================================

test("ComponentSpec onMount accepts PluginContext (maps to onStart)", () => {
  type Spec = ComponentSpec<
    "button",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  type OnMount = NonNullable<Spec["onMount"]>;
  expectTypeOf<OnMount>()
    .parameter(0)
    .toMatchTypeOf<PluginContext<TestGlobal, TestBus, TestSignals, RouterConfig, RouterState>>();
});

test("ComponentSpec onUnmount accepts TeardownContext (maps to onStop)", () => {
  type Spec = ComponentSpec<
    "button",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  type OnUnmount = NonNullable<Spec["onUnmount"]>;
  expectTypeOf<OnUnmount>().parameter(0).toMatchTypeOf<TeardownContext<TestGlobal>>();
});

test("ComponentSpec does not have onInit field", () => {
  type Spec = ComponentSpec<
    "button",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  expectTypeOf<Spec>().not.toHaveProperty("onInit");
});

test("ComponentSpec does not have onStart field", () => {
  type Spec = ComponentSpec<
    "button",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  expectTypeOf<Spec>().not.toHaveProperty("onStart");
});

test("ComponentSpec does not have onStop field", () => {
  type Spec = ComponentSpec<
    "button",
    RouterConfig,
    RouterApi,
    RouterState,
    TestGlobal,
    TestBus,
    TestSignals
  >;
  expectTypeOf<Spec>().not.toHaveProperty("onStop");
});

// =============================================================================
// 8. ModuleSpec structure
// =============================================================================

test("ModuleSpec plugins field accepts PluginInstance array", () => {
  type Spec = ModuleSpec<"auth">;
  expectTypeOf<NonNullable<Spec["plugins"]>>().toMatchTypeOf<
    Array<PluginInstance<string, unknown, Record<string, unknown>, unknown>>
  >();
});

test("ModuleSpec components field accepts ComponentInstance array", () => {
  type Spec = ModuleSpec<"auth">;
  expectTypeOf<NonNullable<Spec["components"]>>().toMatchTypeOf<
    Array<ComponentInstance<string, unknown, Record<string, unknown>, unknown>>
  >();
});

test("ModuleSpec modules field accepts ModuleInstance array", () => {
  type Spec = ModuleSpec<"auth">;
  expectTypeOf<NonNullable<Spec["modules"]>>().toMatchTypeOf<
    Array<ModuleInstance<string, unknown>>
  >();
});

test("ModuleSpec onRegister callback exists and receives config context", () => {
  type Spec = ModuleSpec<"auth", { secret: string }>;
  type OnRegister = NonNullable<Spec["onRegister"]>;
  expectTypeOf<OnRegister>().toBeFunction();
  expectTypeOf<OnRegister>().parameter(0).toHaveProperty("global");
  expectTypeOf<OnRegister>().parameter(0).toHaveProperty("config");
});
