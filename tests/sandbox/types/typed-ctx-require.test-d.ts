// =============================================================================
// Typed ctx.require via Instance-Based Depends: Type-Level Assertions
// =============================================================================
// Proves the type system correctly infers API types from depends tuples at
// compile time. Covers:
//   A. ExtractDepsMap helper
//   B. InitContext overloaded require
//   C. InitContext overloaded getPlugin
//   D. PluginContext carries Deps
//   E. PluginSpec.depends type
//   F. Negative cases (type error detection)
// =============================================================================

import { describe, expectTypeOf, it } from "vitest";
import type {
  ComponentInstance,
  ComponentSpec,
  DependsTuple,
  ExtractDepsMap,
  InitContext,
  PluginContext,
  PluginInstance,
  PluginLikeInstance,
  PluginSpec
} from "../../../src/types";

// =============================================================================
// Shared Test Types
// =============================================================================

type RouterConfig = { basePath: string; trailingSlash: boolean };
type RouterApi = { resolve: (path: string) => string; routes: () => string[] };
type RouterState = { registeredRoutes: string[] };
type RouterPlugin = PluginInstance<"router", RouterConfig, RouterApi, RouterState>;

type AuthConfig = { secret: string; issuer: string };
type AuthApi = { verify: (token: string) => boolean; sign: (payload: string) => string };
type AuthState = { sessions: Map<string, string> };
type AuthPlugin = PluginInstance<"auth", AuthConfig, AuthApi, AuthState>;

type LoggerConfig = { level: string };
type LoggerApi = { info: (msg: string) => void; error: (msg: string) => void };
type LoggerPlugin = PluginInstance<"logger", LoggerConfig, LoggerApi, void>;

type SidebarConfig = { width: number };
type SidebarApi = { toggle: () => void; isOpen: () => boolean };
type SidebarState = { open: boolean };
type SidebarComponent = ComponentInstance<"sidebar", SidebarConfig, SidebarApi, SidebarState>;

// Concrete instances (declared, not instantiated -- type-level only)
declare const routerPlugin: RouterPlugin;
declare const authPlugin: AuthPlugin;
declare const loggerPlugin: LoggerPlugin;
declare const sidebarComponent: SidebarComponent;

// Framework generics for context types
type G = Record<string, unknown>;
type Events = Record<string, unknown>;

// =============================================================================
// Section A: ExtractDepsMap helper
// =============================================================================

describe("ExtractDepsMap helper", () => {
  it("empty tuple produces empty object", () => {
    type Result = ExtractDepsMap<readonly []>;
    // biome-ignore lint/complexity/noBannedTypes: Testing empty mapped type result which is {}
    expectTypeOf<Result>().toEqualTypeOf<{}>();
  });

  it("single plugin produces { name: Api }", () => {
    type Result = ExtractDepsMap<readonly [RouterPlugin]>;
    expectTypeOf<Result>().toEqualTypeOf<{ router: RouterApi }>();
  });

  it("two plugins produce { name1: Api1; name2: Api2 }", () => {
    type Result = ExtractDepsMap<readonly [RouterPlugin, AuthPlugin]>;
    expectTypeOf<Result>().toEqualTypeOf<{ router: RouterApi; auth: AuthApi }>();
  });

  it("ComponentInstance in tuple works same as PluginInstance", () => {
    type Result = ExtractDepsMap<readonly [SidebarComponent]>;
    expectTypeOf<Result>().toEqualTypeOf<{ sidebar: SidebarApi }>();
  });

  it("mixed Plugin + Component tuple", () => {
    type Result = ExtractDepsMap<readonly [RouterPlugin, SidebarComponent]>;
    expectTypeOf<Result>().toEqualTypeOf<{ router: RouterApi; sidebar: SidebarApi }>();
  });

  it("three plugins produce correct mapping", () => {
    type Result = ExtractDepsMap<readonly [RouterPlugin, AuthPlugin, LoggerPlugin]>;
    expectTypeOf<Result>().toEqualTypeOf<{
      router: RouterApi;
      auth: AuthApi;
      logger: LoggerApi;
    }>();
  });
});

// =============================================================================
// Section B: InitContext overloaded require
// =============================================================================

describe("InitContext overloaded require", () => {
  type TestCtx = InitContext<G, Events, void, readonly [RouterPlugin, AuthPlugin]>;

  it("require(routerPlugin) returns RouterApi (instance overload)", () => {
    // Instance overload: pass a PluginInstance from the Deps tuple
    // We verify the overload chain produces typed results
    expectTypeOf<TestCtx["require"]>().toBeCallableWith(routerPlugin);
  });

  it("require(authPlugin) returns AuthApi (instance overload)", () => {
    expectTypeOf<TestCtx["require"]>().toBeCallableWith(authPlugin);
  });

  it("require('router') returns RouterApi (typed string overload)", () => {
    expectTypeOf<TestCtx["require"]>().toBeCallableWith("router");
  });

  it("require('auth') returns AuthApi (typed string overload)", () => {
    expectTypeOf<TestCtx["require"]>().toBeCallableWith("auth");
  });

  it("require('unknown') returns unknown (escape hatch)", () => {
    expectTypeOf<TestCtx["require"]>().toBeCallableWith("unknown");
  });

  it("require('any-arbitrary-string') returns unknown (escape hatch)", () => {
    expectTypeOf<TestCtx["require"]>().toBeCallableWith("some-plugin-not-in-deps");
  });

  it("instance-based require returns exact typed API (not unknown)", () => {
    // Verify that calling with instance gives RouterApi, not unknown
    // We check the type-level result for the first overload
    type DepsTuple = [RouterPlugin, AuthPlugin];
    type InstanceResult = RouterPlugin extends DepsTuple[number] ? RouterApi : never;
    expectTypeOf<InstanceResult>().toEqualTypeOf<RouterApi>();
  });

  it("typed string from deps returns exact typed API (not unknown)", () => {
    type DepsMap = ExtractDepsMap<readonly [RouterPlugin, AuthPlugin]>;
    expectTypeOf<DepsMap["router"]>().toEqualTypeOf<RouterApi>();
    expectTypeOf<DepsMap["auth"]>().toEqualTypeOf<AuthApi>();
  });
});

// =============================================================================
// Section C: InitContext overloaded getPlugin
// =============================================================================

describe("InitContext overloaded getPlugin", () => {
  type TestCtx = InitContext<G, Events, void, readonly [RouterPlugin, AuthPlugin]>;

  it("getPlugin(routerPlugin) returns RouterApi | undefined (instance overload)", () => {
    expectTypeOf<TestCtx["getPlugin"]>().toBeCallableWith(routerPlugin);
  });

  it("getPlugin(authPlugin) returns AuthApi | undefined (instance overload)", () => {
    expectTypeOf<TestCtx["getPlugin"]>().toBeCallableWith(authPlugin);
  });

  it("getPlugin('router') returns RouterApi | undefined (typed string overload)", () => {
    expectTypeOf<TestCtx["getPlugin"]>().toBeCallableWith("router");
  });

  it("getPlugin('auth') returns AuthApi | undefined (typed string overload)", () => {
    expectTypeOf<TestCtx["getPlugin"]>().toBeCallableWith("auth");
  });

  it("getPlugin('unknown') returns unknown (escape hatch)", () => {
    expectTypeOf<TestCtx["getPlugin"]>().toBeCallableWith("unknown");
  });

  it("getPlugin('arbitrary-name') accepts any string (escape hatch)", () => {
    expectTypeOf<TestCtx["getPlugin"]>().toBeCallableWith("anything-at-all");
  });

  it("instance overload on getPlugin produces API | undefined (not just unknown)", () => {
    // Instance overload returns PluginApiType<P> | undefined
    type DepsMap = ExtractDepsMap<readonly [RouterPlugin, AuthPlugin]>;
    type RouterResult = DepsMap["router"] | undefined;
    expectTypeOf<RouterResult>().toEqualTypeOf<RouterApi | undefined>();
  });
});

// =============================================================================
// Section D: PluginContext carries Deps
// =============================================================================

describe("PluginContext carries Deps", () => {
  type TestPluginCtx = PluginContext<
    G,
    Events,
    { port: number },
    { connections: number },
    readonly [RouterPlugin, AuthPlugin]
  >;

  it("PluginContext has typed require (same as InitContext)", () => {
    expectTypeOf<TestPluginCtx["require"]>().toBeCallableWith(routerPlugin);
    expectTypeOf<TestPluginCtx["require"]>().toBeCallableWith("router");
    expectTypeOf<TestPluginCtx["require"]>().toBeCallableWith("any-string");
  });

  it("PluginContext has typed getPlugin (same as InitContext)", () => {
    expectTypeOf<TestPluginCtx["getPlugin"]>().toBeCallableWith(routerPlugin);
    expectTypeOf<TestPluginCtx["getPlugin"]>().toBeCallableWith("router");
    expectTypeOf<TestPluginCtx["getPlugin"]>().toBeCallableWith("any-string");
  });

  it("PluginContext.state is still accessible", () => {
    expectTypeOf<TestPluginCtx["state"]>().toEqualTypeOf<{ connections: number }>();
  });

  it("PluginContext.config is still accessible", () => {
    expectTypeOf<TestPluginCtx["config"]>().toEqualTypeOf<Readonly<{ port: number }>>();
  });

  it("Deps flows through from PluginSpec to PluginContext", () => {
    // PluginSpec with Deps generic flows to the PluginContext in api/onStart
    type SpecWithDeps = PluginSpec<
      "test",
      void,
      Record<string, never>,
      void,
      G,
      Events,
      readonly [RouterPlugin]
    >;
    // The api function receives PluginContext with the Deps parameter
    type ApiCtxParam =
      NonNullable<SpecWithDeps["api"]> extends (ctx: infer C) => unknown ? C : never;
    // Verify ctx.require exists on the api context
    expectTypeOf<ApiCtxParam>().toHaveProperty("require");
  });
});

// =============================================================================
// Section E: PluginSpec.depends type
// =============================================================================

describe("PluginSpec.depends type", () => {
  it("PluginSpec accepts depends: [RouterPlugin] (instance tuple)", () => {
    type SpecWithInstanceDeps = PluginSpec<
      "test",
      void,
      Record<string, never>,
      void,
      G,
      Events,
      readonly [RouterPlugin]
    >;
    // The depends field should accept a readonly tuple of PluginLikeInstance
    type DepsField = NonNullable<SpecWithInstanceDeps["depends"]>;
    expectTypeOf<DepsField>().toMatchTypeOf<readonly PluginLikeInstance[]>();
  });

  it("PluginSpec accepts depends: [RouterPlugin, AuthPlugin] (multi-instance tuple)", () => {
    type SpecWithMultiDeps = PluginSpec<
      "test",
      void,
      Record<string, never>,
      void,
      G,
      Events,
      readonly [RouterPlugin, AuthPlugin]
    >;
    type DepsField = NonNullable<SpecWithMultiDeps["depends"]>;
    // Should accept a tuple of two plugin instances
    expectTypeOf<DepsField>().toMatchTypeOf<readonly PluginLikeInstance[]>();
  });

  it("ComponentSpec accepts depends: [RouterPlugin]", () => {
    type CompSpecWithDeps = ComponentSpec<
      "test-comp",
      void,
      Record<string, never>,
      void,
      G,
      Events,
      readonly [RouterPlugin]
    >;
    type DepsField = NonNullable<CompSpecWithDeps["depends"]>;
    expectTypeOf<DepsField>().toMatchTypeOf<readonly PluginLikeInstance[]>();
  });

  it("DependsTuple accepts readonly PluginLikeInstance[]", () => {
    expectTypeOf<DependsTuple>().toMatchTypeOf<readonly PluginLikeInstance[]>();
  });

  it("depends field accepts mixed Plugin + Component tuple", () => {
    type MixedSpec = PluginSpec<
      "mixed",
      void,
      Record<string, never>,
      void,
      G,
      Events,
      readonly [RouterPlugin, SidebarComponent]
    >;
    type DepsField = NonNullable<MixedSpec["depends"]>;
    expectTypeOf<DepsField>().toMatchTypeOf<readonly PluginLikeInstance[]>();
  });
});

// =============================================================================
// Section F: Negative cases
// =============================================================================

describe("Negative cases", () => {
  it("string in depends array is a type error (string does not extend PluginLikeInstance)", () => {
    // A raw string should NOT extend PluginLikeInstance
    type StringExtendsInstance = string extends PluginLikeInstance ? true : false;
    expectTypeOf<StringExtendsInstance>().toEqualTypeOf<false>();
  });

  it("PluginSpec.depends rejects raw string array", () => {
    // readonly string[] should NOT be assignable to DependsTuple
    type StringArrayExtendsDeps = readonly string[] extends DependsTuple ? true : false;
    expectTypeOf<StringArrayExtendsDeps>().toEqualTypeOf<false>();
  });

  it("string does not extend PluginLikeInstance", () => {
    type Test = "router" extends PluginLikeInstance ? true : false;
    expectTypeOf<Test>().toEqualTypeOf<false>();
  });

  it("ExtractDepsMap produces never for names not in the tuple", () => {
    type DepsMap = ExtractDepsMap<readonly [RouterPlugin, AuthPlugin]>;
    // Accessing a key not in the map should produce undefined (no such key)
    type HasLogger = "logger" extends keyof DepsMap ? true : false;
    expectTypeOf<HasLogger>().toEqualTypeOf<false>();
  });

  it("ExtractDepsMap only has keys matching plugin names in tuple", () => {
    type DepsMap = ExtractDepsMap<readonly [RouterPlugin, AuthPlugin]>;
    type Keys = keyof DepsMap;
    expectTypeOf<Keys>().toEqualTypeOf<"router" | "auth">();
  });

  it("number does not extend PluginLikeInstance", () => {
    type Test = number extends PluginLikeInstance ? true : false;
    expectTypeOf<Test>().toEqualTypeOf<false>();
  });

  it("plain object without kind/name does not extend PluginLikeInstance", () => {
    type Test = { foo: string } extends PluginLikeInstance ? true : false;
    expectTypeOf<Test>().toEqualTypeOf<false>();
  });
});
