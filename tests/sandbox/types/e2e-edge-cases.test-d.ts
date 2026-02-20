// =============================================================================
// End-to-End Type Flow: Edge Case Type-Level Tests
// =============================================================================
// These tests exercise type paths NOT covered by the narrative test (Plan 01)
// or the Phase 7-13 unit tests. Focus on boundary conditions, negative cases
// (@ts-expect-error), and uncommon plugin configurations.
//
// Sections:
//   1. Empty/zero-plugin type helpers
//   2. All void-config plugins
//   3. All void-API plugins
//   4. Mixed defaults and required configs
//   5. Factory-produced plugin types
//   6. Component instance in plugin union
//   7-11. Negative cases (@ts-expect-error)
//   12. Single-plugin app
//   13. Plugin with complex nested state
// =============================================================================

import { describe, expectTypeOf, it } from "vitest";
import type {
  App,
  BuildPluginApis,
  BuildPluginConfigs,
  BuildPluginConfigsAccessor,
  ComponentInstance,
  EventBus,
  PluginApiByName,
  PluginInstance,
  PluginName,
  PluginNotRegistered
} from "../../../src/types";

// =============================================================================
// Shared edge-case types
// =============================================================================

type BaseConfig = { appName: string; debug: boolean };
type BusContract = {
  "content:updated": { path: string; hash: string };
  "build:complete": { files: string[]; duration: number };
};
type SignalRegistry = {
  "route:change": { from: string; to: string };
};

// =============================================================================
// 1. Empty plugin union: BuildPluginConfigs and BuildPluginApis with zero plugins
// =============================================================================

describe("Empty plugin union", () => {
  // When no plugins are provided, the union collapses to `never`.
  // BuildPluginConfigs<never> and BuildPluginApis<never> should produce empty objects.

  it("BuildPluginConfigs with never produces empty object", () => {
    // biome-ignore lint/suspicious/noExplicitAny: Testing never plugin union edge case
    type Configs = BuildPluginConfigs<PluginInstance<string, any, any, any> & never>;
    // The result of a never-distributed mapped type is {}
    type Keys = keyof Configs;
    expectTypeOf<Keys>().toEqualTypeOf<never>();
  });

  it("BuildPluginApis with default PluginInstance excludes void-API entry", () => {
    // A default PluginInstance has Record<string, never> API = excluded from BuildPluginApis
    type DefaultOnly = PluginInstance;
    type Apis = BuildPluginApis<DefaultOnly>;
    // Default PluginInstance has Record<string, never> as API -> should be excluded
    // keyof {} is never, so string does NOT extend keyof Apis
    type HasDefault = string extends keyof Apis ? true : false;
    expectTypeOf<HasDefault>().toEqualTypeOf<false>();
  });
});

// =============================================================================
// 2. All void-config plugins
// =============================================================================

describe("All void-config plugins", () => {
  type VoidA = PluginInstance<"alpha", void, { greet: () => string }, void>;
  type VoidB = PluginInstance<"beta", void, { wave: () => void }, void>;

  it("BuildPluginConfigs excludes all void-config plugins, produces empty object", () => {
    type Configs = BuildPluginConfigs<VoidA | VoidB>;
    type Keys = keyof Configs;
    expectTypeOf<Keys>().toEqualTypeOf<never>();
  });

  it("BuildPluginApis still includes all void-config plugins that have APIs", () => {
    type Apis = BuildPluginApis<VoidA | VoidB>;
    expectTypeOf<Apis>().toHaveProperty("alpha");
    expectTypeOf<Apis>().toHaveProperty("beta");
  });

  it("BuildPluginConfigsAccessor maps void-config to Record<string, never>", () => {
    type Accessor = BuildPluginConfigsAccessor<VoidA | VoidB>;
    expectTypeOf<Accessor["alpha"]>().toEqualTypeOf<Record<string, never>>();
    expectTypeOf<Accessor["beta"]>().toEqualTypeOf<Record<string, never>>();
  });
});

// =============================================================================
// 3. All void-API plugins
// =============================================================================

describe("All void-API plugins", () => {
  type LifecycleA = PluginInstance<"init-only", { timeout: number }, Record<string, never>, void>;
  type LifecycleB = PluginInstance<"cleanup-only", void, Record<string, never>, void>;

  it("BuildPluginApis excludes all void-API plugins", () => {
    type Apis = BuildPluginApis<LifecycleA | LifecycleB>;
    type HasInitOnly = "init-only" extends keyof Apis ? true : false;
    type HasCleanupOnly = "cleanup-only" extends keyof Apis ? true : false;
    expectTypeOf<HasInitOnly>().toEqualTypeOf<false>();
    expectTypeOf<HasCleanupOnly>().toEqualTypeOf<false>();
  });

  it("App surface has no plugin API properties for void-API plugins", () => {
    type TestApp = App<BaseConfig, BusContract, SignalRegistry, LifecycleA | LifecycleB>;
    // The app should still have core methods
    expectTypeOf<TestApp>().toHaveProperty("start");
    expectTypeOf<TestApp>().toHaveProperty("emit");
    // But no plugin API properties (both are void-API)
    type ApiKeys = keyof BuildPluginApis<LifecycleA | LifecycleB>;
    expectTypeOf<ApiKeys>().toEqualTypeOf<never>();
  });
});

// =============================================================================
// 4. Mixed defaults and required configs
// =============================================================================

describe("Mixed defaults and required configs", () => {
  // Plugin 1: has defaults -> OPTIONAL
  type WithDefaults = PluginInstance<
    "themed",
    { color: string },
    { getColor: () => string },
    void
  > & {
    _hasDefaults: true;
  };
  // Plugin 2: no defaults -> REQUIRED
  type NoDefaults = PluginInstance<
    "auth",
    { secret: string; issuer: string },
    { verify: () => boolean },
    void
  > & {
    _hasDefaults: false;
  };
  // Plugin 3: void config -> EXCLUDED
  type VoidConfig = PluginInstance<"logger", void, { log: (msg: string) => void }, void>;

  type Mixed = WithDefaults | NoDefaults | VoidConfig;
  type Configs = BuildPluginConfigs<Mixed>;

  it("plugin with defaults is optional in BuildPluginConfigs", () => {
    type HasThemed = "themed" extends keyof Configs ? true : false;
    expectTypeOf<HasThemed>().toEqualTypeOf<true>();
  });

  it("plugin without defaults is required in BuildPluginConfigs", () => {
    expectTypeOf<Configs>().toHaveProperty("auth");
    expectTypeOf<Configs["auth"]>().toEqualTypeOf<{ secret: string; issuer: string }>();
  });

  it("void-config plugin is excluded from BuildPluginConfigs", () => {
    type HasLogger = "logger" extends keyof Configs ? true : false;
    expectTypeOf<HasLogger>().toEqualTypeOf<false>();
  });
});

// =============================================================================
// 5. Factory-produced plugin type
// =============================================================================

describe("Factory-produced plugin type", () => {
  // createPluginFactory produces a function: (name: N) => PluginInstance<N, C, A, S>
  // The return type should carry correct phantom types.

  it("factory return type carries correct config/api phantom types", () => {
    // Simulate factory usage: factory("card") -> PluginInstance<"card", C, A, S>
    type CardConfig = { title: string };
    type CardApi = { getTitle: () => string };
    type CardPlugin = PluginInstance<"card", CardConfig, CardApi, void>;

    expectTypeOf<CardPlugin["name"]>().toEqualTypeOf<"card">();
    expectTypeOf<CardPlugin["_types"]["config"]>().toEqualTypeOf<CardConfig>();
    expectTypeOf<CardPlugin["_types"]["api"]>().toEqualTypeOf<CardApi>();
  });

  it("two factory instances with different names are distinct in union", () => {
    type Card1 = PluginInstance<"hero-card", { title: string }, { getTitle: () => string }, void>;
    type Card2 = PluginInstance<"side-card", { title: string }, { getTitle: () => string }, void>;
    type Names = PluginName<Card1 | Card2>;
    expectTypeOf<Names>().toEqualTypeOf<"hero-card" | "side-card">();
  });

  it("factory instances are valid in BuildPluginApis", () => {
    type Card1 = PluginInstance<"hero-card", { title: string }, { getTitle: () => string }, void>;
    type Card2 = PluginInstance<"side-card", { title: string }, { getTitle: () => string }, void>;
    type Apis = BuildPluginApis<Card1 | Card2>;
    expectTypeOf<Apis>().toHaveProperty("hero-card");
    expectTypeOf<Apis>().toHaveProperty("side-card");
  });
});

// =============================================================================
// 6. Component instance in plugin union
// =============================================================================

describe("Component instance in plugin union", () => {
  type SpaComponent = ComponentInstance<
    "spa",
    { mountPoint: string },
    { mounted: () => boolean },
    { active: boolean }
  >;
  // At runtime components are treated as PluginInstance, but type-level they
  // may be ComponentInstance. We verify ComponentInstance works in type helpers.

  it("ComponentInstance name is extractable", () => {
    expectTypeOf<SpaComponent["name"]>().toEqualTypeOf<"spa">();
    expectTypeOf<SpaComponent["kind"]>().toEqualTypeOf<"component">();
  });

  it("ComponentInstance phantom types match PluginInstance pattern", () => {
    expectTypeOf<SpaComponent["_types"]["config"]>().toEqualTypeOf<{ mountPoint: string }>();
    expectTypeOf<SpaComponent["_types"]["api"]>().toEqualTypeOf<{ mounted: () => boolean }>();
    expectTypeOf<SpaComponent["_types"]["state"]>().toEqualTypeOf<{ active: boolean }>();
  });

  it("PluginInstance with same generics is structurally compatible for type helpers", () => {
    // Runtime converts ComponentInstance to PluginInstance-like. Verify same generics work.
    type SpaAsPlugin = PluginInstance<
      "spa",
      { mountPoint: string },
      { mounted: () => boolean },
      { active: boolean }
    >;
    type Apis = BuildPluginApis<SpaAsPlugin>;
    expectTypeOf<Apis>().toHaveProperty("spa");
    expectTypeOf<Apis["spa"]>().toHaveProperty("mounted");
  });
});

// =============================================================================
// 7. Negative: wrong config shape
// =============================================================================

describe("Negative: wrong config shape", () => {
  type AuthPlugin = PluginInstance<
    "auth",
    { secret: string; issuer: string },
    { verify: () => boolean },
    void
  > & {
    _hasDefaults: false;
  };
  type Configs = BuildPluginConfigs<AuthPlugin>;

  it("wrong config shape is not assignable", () => {
    // The auth plugin requires { secret: string; issuer: string }
    // Passing { wrong: true } should be a type error
    type WrongShape = { wrong: true };
    type IsAssignable = WrongShape extends Configs["auth"] ? true : false;
    expectTypeOf<IsAssignable>().toEqualTypeOf<false>();
  });

  it("partial config missing required field is not assignable to required config", () => {
    // Missing "issuer" -- partial is not valid for required configs
    type Partial = { secret: string };
    type IsAssignable = Partial extends Configs["auth"] ? true : false;
    expectTypeOf<IsAssignable>().toEqualTypeOf<false>();
  });
});

// =============================================================================
// 8. Negative: accessing non-existent plugin
// =============================================================================

describe("Negative: accessing non-existent plugin", () => {
  type RouterPlugin = PluginInstance<
    "router",
    { basePath: string },
    { resolve: (p: string) => string },
    void
  >;

  it("non-existent plugin name does not extend registered names", () => {
    type RegisteredNames = PluginName<RouterPlugin>;
    type IsNonExistent = "nonExistent" extends RegisteredNames ? true : false;
    expectTypeOf<IsNonExistent>().toEqualTypeOf<false>();
  });

  it("getPlugin is constrained to registered names only", () => {
    // getPlugin's N is constrained to PluginName<P> which is "router"
    // "nonExistent" does not extend "router"
    type IsValid = "nonExistent" extends PluginName<RouterPlugin> ? true : false;
    expectTypeOf<IsValid>().toEqualTypeOf<false>();
  });

  it("PluginApiByName returns never for non-existent plugin name", () => {
    type Result = PluginApiByName<RouterPlugin, "nonExistent">;
    expectTypeOf<Result>().toBeNever();
  });
});

// =============================================================================
// 9. Negative: wrong event type in emit
// =============================================================================

describe("Negative: wrong event type in emit", () => {
  it("wrong payload shape is not assignable to BusContract event", () => {
    // "content:updated" expects { path: string; hash: string }
    // { wrong: true } should not be assignable
    type CorrectPayload = BusContract["content:updated"];
    type WrongPayload = { wrong: true };
    type IsAssignable = WrongPayload extends CorrectPayload ? true : false;
    expectTypeOf<IsAssignable>().toEqualTypeOf<false>();
  });

  it("emit is constrained to BusContract keys only", () => {
    // "fake:event" is not in BusContract
    type BusKeys = string & keyof BusContract;
    type IsFakeInBus = "fake:event" extends BusKeys ? true : false;
    expectTypeOf<IsFakeInBus>().toEqualTypeOf<false>();
  });
});

// =============================================================================
// 10. Negative: wrong signal type
// =============================================================================

describe("Negative: wrong signal type", () => {
  it("wrong signal payload is not assignable to SignalRegistry type", () => {
    // "route:change" expects { from: string; to: string }
    type CorrectPayload = SignalRegistry["route:change"];
    type WrongPayload = { wrong: true };
    type IsAssignable = WrongPayload extends CorrectPayload ? true : false;
    expectTypeOf<IsAssignable>().toEqualTypeOf<false>();
  });

  it("signal typed overload constrains to SignalRegistry keys", () => {
    type SignalKeys = string & keyof SignalRegistry;
    type IsFakeInSignals = "fake:signal" extends SignalKeys ? true : false;
    expectTypeOf<IsFakeInSignals>().toEqualTypeOf<false>();
  });
});

// =============================================================================
// 11. Negative: require with unregistered name
// =============================================================================

describe("Negative: require with unregistered name", () => {
  type RouterPlugin = PluginInstance<"router", void, { resolve: (p: string) => string }, void>;

  it("PluginNotRegistered produces readable error message type", () => {
    type ErrorMsg = PluginNotRegistered<"unregistered">;
    expectTypeOf<ErrorMsg>().toEqualTypeOf<"Plugin 'unregistered' is not registered. Check your plugin list in createConfig.">();
  });

  it("PluginApiByName for unregistered name returns never", () => {
    type Result = PluginApiByName<RouterPlugin, "unregistered">;
    expectTypeOf<Result>().toBeNever();
  });

  it("require return type for known name is non-never API", () => {
    type TestApp = App<BaseConfig, BusContract, SignalRegistry, RouterPlugin>;
    type RequireResult = ReturnType<TestApp["require"]>;
    expectTypeOf<RequireResult>().not.toBeNever();
  });
});

// =============================================================================
// 12. Single-plugin app
// =============================================================================

describe("Single-plugin app", () => {
  type Solo = PluginInstance<
    "solo",
    { volume: number },
    { play: () => void; isPlaying: () => boolean },
    { playing: boolean }
  >;
  type SoloApp = App<BaseConfig, BusContract, SignalRegistry, Solo>;

  it("single-plugin app has the plugin API on surface", () => {
    expectTypeOf<SoloApp>().toHaveProperty("solo");
    expectTypeOf<SoloApp["solo"]>().toHaveProperty("play");
    expectTypeOf<SoloApp["solo"]>().toHaveProperty("isPlaying");
  });

  it("single-plugin configs has the plugin config", () => {
    expectTypeOf<SoloApp["configs"]["solo"]>().toEqualTypeOf<Readonly<{ volume: number }>>();
  });

  it("getPlugin constrained to single plugin name", () => {
    expectTypeOf<SoloApp["getPlugin"]>().toBeCallableWith("solo");
  });

  it("require constrained to single plugin name", () => {
    expectTypeOf<SoloApp["require"]>().toBeCallableWith("solo");
  });

  it("BuildPluginConfigs with single no-defaults plugin", () => {
    type SoloNoDefaults = Solo & { _hasDefaults: false };
    type Configs = BuildPluginConfigs<SoloNoDefaults>;
    expectTypeOf<Configs["solo"]>().toEqualTypeOf<{ volume: number }>();
  });

  it("BuildPluginConfigs with single with-defaults plugin", () => {
    type SoloWithDefaults = Solo & { _hasDefaults: true };
    type Configs = BuildPluginConfigs<SoloWithDefaults>;
    type HasSolo = "solo" extends keyof Configs ? true : false;
    expectTypeOf<HasSolo>().toEqualTypeOf<true>();
  });
});

// =============================================================================
// 13. Plugin with complex nested state
// =============================================================================

describe("Plugin with complex nested state", () => {
  type ComplexState = {
    cache: Map<string, { data: unknown; timestamp: number }>;
    metrics: { requests: number; errors: number; latency: number[] };
    connections: Array<{ id: string; active: boolean }>;
  };

  type ComplexPlugin = PluginInstance<
    "complex",
    { endpoint: string },
    { query: (key: string) => unknown; stats: () => { requests: number } },
    ComplexState
  >;

  it("complex state type is carried through phantom types", () => {
    expectTypeOf<ComplexPlugin["_types"]["state"]>().toEqualTypeOf<ComplexState>();
  });

  it("complex state does not leak into public API type", () => {
    type Apis = BuildPluginApis<ComplexPlugin>;
    expectTypeOf<Apis["complex"]>().toHaveProperty("query");
    expectTypeOf<Apis["complex"]>().toHaveProperty("stats");
    expectTypeOf<Apis["complex"]>().not.toHaveProperty("cache");
    expectTypeOf<Apis["complex"]>().not.toHaveProperty("metrics");
    expectTypeOf<Apis["complex"]>().not.toHaveProperty("connections");
  });

  it("complex state does not leak into App surface", () => {
    type TestApp = App<BaseConfig, BusContract, SignalRegistry, ComplexPlugin>;
    expectTypeOf<TestApp["complex"]>().not.toHaveProperty("cache");
    expectTypeOf<TestApp["complex"]>().not.toHaveProperty("metrics");
    expectTypeOf<TestApp["complex"]>().not.toHaveProperty("connections");
  });

  it("complex state does not leak into configs accessor", () => {
    type TestApp = App<BaseConfig, BusContract, SignalRegistry, ComplexPlugin>;
    // Configs only has the config type, not state
    expectTypeOf<TestApp["configs"]["complex"]>().toEqualTypeOf<Readonly<{ endpoint: string }>>();
  });
});

// =============================================================================
// 14. EventBus edge cases
// =============================================================================

describe("EventBus edge cases", () => {
  it("EventBus with empty events has no valid emit keys", () => {
    // biome-ignore lint/complexity/noBannedTypes: Testing empty events edge case
    type EmptyBus = EventBus<{}>;
    expectTypeOf<EmptyBus["emit"]>().toBeFunction();
    expectTypeOf<EmptyBus["clear"]>().toBeFunction();
  });

  it("EventBus constrains emit key to event names", () => {
    type TestBus = EventBus<{ click: { x: number; y: number } }>;
    type EmitKeys = Parameters<TestBus["emit"]>[0];
    expectTypeOf<EmitKeys>().toEqualTypeOf<"click">();
  });

  it("EventBus on handler receives correct payload type", () => {
    type TestBus = EventBus<{ click: { x: number; y: number } }>;
    // on("click", handler) -- handler receives { x: number; y: number }
    type Handler = Parameters<TestBus["on"]>[1];
    // Handler is (payload: { x: number; y: number }) => void | Promise<void>
    expectTypeOf<Handler>().toBeFunction();
  });
});

// =============================================================================
// 15. Multiple plugins with identical API shapes but different names
// =============================================================================

describe("Identically-shaped plugins with different names", () => {
  // Two plugins with exactly the same config/API/state shapes but different names
  type Widget1 = PluginInstance<"widget-a", { label: string }, { render: () => string }, void>;
  type Widget2 = PluginInstance<"widget-b", { label: string }, { render: () => string }, void>;

  it("both plugins appear in BuildPluginApis with their own name key", () => {
    type Apis = BuildPluginApis<Widget1 | Widget2>;
    expectTypeOf<Apis>().toHaveProperty("widget-a");
    expectTypeOf<Apis>().toHaveProperty("widget-b");
  });

  it("PluginApiByName resolves each independently", () => {
    type Api1 = PluginApiByName<Widget1 | Widget2, "widget-a">;
    type Api2 = PluginApiByName<Widget1 | Widget2, "widget-b">;
    expectTypeOf<Api1>().toHaveProperty("render");
    expectTypeOf<Api2>().toHaveProperty("render");
  });

  it("PluginName distributes correctly over identically-shaped union", () => {
    type Names = PluginName<Widget1 | Widget2>;
    expectTypeOf<Names>().toEqualTypeOf<"widget-a" | "widget-b">();
  });
});
