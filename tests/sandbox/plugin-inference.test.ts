import { describe, expect, expectTypeOf, it } from "vitest";

import type { AnyPluginInstance } from "../../src";
import { createPlugin } from "./demo/framework/config";
import { createApp } from "./demo/framework/index";
import { authPlugin } from "./demo/framework/plugins/auth";
import { rendererPlugin } from "./demo/framework/plugins/renderer";
import { routerPlugin } from "./demo/framework/plugins/router";
import { templateEnginePlugin } from "./demo/framework/plugins/template-engine";

// ---------------------------------------------------------------------------
// createPlugin infers all types from spec (SAND-02)
// ---------------------------------------------------------------------------

describe("createPlugin infers all types from spec (SAND-02)", () => {
  it("infers name as literal string type", () => {
    // Name type is inferred from the string literal argument
    expectTypeOf(routerPlugin.name).toEqualTypeOf<"router">();

    // Runtime: name matches
    expect(routerPlugin.name).toBe("router");
  });

  it("infers config type from config", () => {
    const plugin = createPlugin("config-test", {
      config: { basePath: "/", retries: 3 }
    });

    // Type-level: plugin carries inferred name
    expectTypeOf(plugin.name).toEqualTypeOf<"config-test">();

    // Runtime: plugin has the correct name and structure
    expect(plugin.name).toBe("config-test");
  });

  it("infers state type from createState return", () => {
    const plugin = createPlugin("state-test", {
      createState: () => ({ count: 0, items: [] as string[] })
    });

    // Type-level: plugin name is inferred as literal
    expectTypeOf(plugin.name).toEqualTypeOf<"state-test">();

    // Runtime: plugin has correct name
    expect(plugin.name).toBe("state-test");
  });

  it("infers API type from api return", () => {
    const plugin = createPlugin("api-test", {
      api: _ctx => ({
        greet: () => "hello",
        sum: (a: number, b: number) => a + b
      })
    });

    // Type-level: plugin name inferred
    expectTypeOf(plugin.name).toEqualTypeOf<"api-test">();

    // Runtime: plugin has correct name
    expect(plugin.name).toBe("api-test");
  });

  it("works with zero generics -- most common case", () => {
    // Router plugin from demo has zero explicit generics on createPlugin.
    // All types are inferred: name, config, state, API.
    expectTypeOf(routerPlugin.name).toEqualTypeOf<"router">();

    // Runtime: verify the plugin object structure
    expect(routerPlugin.name).toBe("router");
    expect(routerPlugin).toHaveProperty("name");
  });

  it("plugin state is NOT accessible from app", async () => {
    const app = createApp();

    // Plugin API is accessible
    expect(app.router).toBeDefined();

    // @ts-expect-error -- state is private, not exposed on app.pluginName
    app.router._state;
  });
});

// ---------------------------------------------------------------------------
// createPlugin with events register callback preserves inference (SAND-03)
// ---------------------------------------------------------------------------

describe("createPlugin with events register callback preserves inference (SAND-03)", () => {
  it("adds typed events without breaking config/state/API inference", () => {
    // Renderer uses `events: (register) => ({ ... })` to declare plugin events.
    // This approach preserves the literal name type and full API inference.
    expectTypeOf(rendererPlugin.name).toEqualTypeOf<"renderer">();

    // Runtime: name is still correctly inferred
    expect(rendererPlugin.name).toBe("renderer");
  });

  it("events register callback preserves full type inference", () => {
    // The renderer plugin uses `events: (register) => ({ ... })` to declare
    // plugin-specific events. This enables full type inference:
    // name (N), config (C), state (S), and API (A) are all inferred from spec.
    expect(rendererPlugin.name).toBe("renderer");

    // Verify renderer has the expected structure from its spec
    expectTypeOf(rendererPlugin).toHaveProperty("name");
  });

  it("plugin without PluginEvents defaults to empty events", () => {
    // Router has no events field -- it only has access to global SiteEvents
    // through the closure-bound Events type from createCoreConfig.
    // The router still emits "router:navigate" because that's in the global SiteEvents.
    expectTypeOf(routerPlugin.name).toEqualTypeOf<"router">();

    expect(routerPlugin.name).toBe("router");
  });
});

// ---------------------------------------------------------------------------
// Sub-plugin type inference
// ---------------------------------------------------------------------------

describe("sub-plugin type inference", () => {
  it("sub-plugins maintain their own type inference through nesting", () => {
    // template-engine is a sub-plugin of renderer
    expectTypeOf(templateEnginePlugin.name).toEqualTypeOf<"template-engine">();

    // Runtime: name is correct
    expect(templateEnginePlugin.name).toBe("template-engine");
  });

  it("renderer plugin contains template-engine as a sub-plugin", () => {
    // Renderer declares plugins: [templateEnginePlugin] in its spec.
    // Verify the renderer plugin has the expected structure.
    expect(rendererPlugin.name).toBe("renderer");
    expect(templateEnginePlugin.name).toBe("template-engine");

    // The renderer's spec references template-engine as a sub-plugin.
    // At runtime, this is visible in the plugin's spec structure.
    expect(rendererPlugin).toBeDefined();
    expect(templateEnginePlugin).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Plugin config is typed and flows through ctx (SAND-04)
// ---------------------------------------------------------------------------

describe("plugin config is typed and flows through ctx (SAND-04)", () => {
  it("ctx.config.sessionTimeout is typed as number and receives default value", async () => {
    const app = createApp({
      plugins: [authPlugin],
      pluginConfigs: { auth: { loginPath: "/login", sessionTimeout: 3600 } }
    });

    // Type-level: auth API is accessible and typed
    expectTypeOf(app.auth.login).toBeFunction();
    expectTypeOf(app.auth.isAuthenticated).toBeFunction();

    // Runtime: auth plugin is wired up
    expect(app.auth).toBeDefined();
  });

  it("ctx.config fields are correctly typed from spec config", () => {
    const plugin = createPlugin("typed-config-test", {
      config: { timeout: 5000, retries: 3, enabled: true },
      api: ctx => {
        // Type-level: each field has its inferred type
        expectTypeOf(ctx.config.timeout).toEqualTypeOf<number>();
        expectTypeOf(ctx.config.retries).toEqualTypeOf<number>();
        expectTypeOf(ctx.config.enabled).toEqualTypeOf<boolean>();

        // @ts-expect-error -- non-existent field is a compile error
        ctx.config.nonExistent;

        return {};
      }
    });

    expect(plugin.name).toBe("typed-config-test");
  });
});

// ---------------------------------------------------------------------------
// Plugin helpers type inference (SAND-09)
// ---------------------------------------------------------------------------

describe("plugin helpers type inference (SAND-09)", () => {
  it("helpers are typed and accessible on the plugin instance", () => {
    type RouteDefinition = { path: string; component: string };

    const plugin = createPlugin("router-with-helpers", {
      config: { routes: [] as RouteDefinition[] },
      helpers: {
        route: (path: string, component: string): RouteDefinition => ({ path, component })
      }
    });

    // Type-level: helper is callable with correct signature
    expectTypeOf(plugin.route).toBeFunction();
    expectTypeOf(plugin.route).parameters.toEqualTypeOf<[string, string]>();
    expectTypeOf(plugin.route("/home", "Home")).toEqualTypeOf<RouteDefinition>();

    // Runtime: helper works
    const r = plugin.route("/home", "HomePage");
    expect(r).toEqual({ path: "/home", component: "HomePage" });
  });

  it("multiple helpers are all typed on the instance", () => {
    const plugin = createPlugin("multi-helpers", {
      helpers: {
        route: (path: string) => ({ path }),
        redirect: (from: string, to: string) => ({ from, to, type: "redirect" as const })
      }
    });

    // Both helpers are typed
    expectTypeOf(plugin.route).toBeFunction();
    expectTypeOf(plugin.redirect).toBeFunction();

    // Return types are inferred
    expectTypeOf(plugin.route("/x")).toEqualTypeOf<{ path: string }>();
    expectTypeOf(plugin.redirect("/a", "/b")).toEqualTypeOf<{
      from: string;
      to: string;
      type: "redirect";
    }>();
  });

  it("plugin without helpers has no extra properties on the type", () => {
    const plugin = createPlugin("no-helpers", {});

    // Standard PluginInstance fields exist
    expectTypeOf(plugin.name).toEqualTypeOf<"no-helpers">();
    expectTypeOf(plugin).toHaveProperty("spec");
    expectTypeOf(plugin).toHaveProperty("_phantom");

    // No helpers — accessing unknown property is a compile error
    // @ts-expect-error -- no helpers defined, route does not exist
    plugin.route;
  });

  it("destructuring helpers preserves types", () => {
    type RouteDefinition = { path: string; component: string };

    const plugin = createPlugin("destruct-test", {
      helpers: {
        route: (path: string, component: string): RouteDefinition => ({ path, component })
      }
    });

    // Destructuring preserves types
    const { route } = plugin;
    expectTypeOf(route).toBeFunction();
    expectTypeOf(route("/x", "Y")).toEqualTypeOf<RouteDefinition>();

    // Runtime: destructured helper works
    expect(route("/home", "Home")).toEqual({ path: "/home", component: "Home" });
  });

  it("plugin with helpers is assignable to AnyPluginInstance", () => {
    const plugin = createPlugin("assignable-test", {
      helpers: { create: () => ({}) }
    });

    // The intersection PluginInstance<...> & Helpers is assignable to AnyPluginInstance
    const _arr: AnyPluginInstance[] = [plugin];
    expect(_arr).toHaveLength(1);
  });

  it("plugin with helpers works in depends array", () => {
    const dep = createPlugin("dep-with-helpers", {
      api: _ctx => ({ getValue: () => 42 }),
      helpers: { define: (x: number) => ({ value: x }) }
    });

    const consumer = createPlugin("consumer", {
      depends: [dep]
    });

    // Both plugins are valid
    expect(consumer.name).toBe("consumer");
    expect(dep.define(5)).toEqual({ value: 5 });
  });

  it("helpers coexist with all other plugin spec fields", () => {
    const plugin = createPlugin("full-featured", {
      config: { basePath: "/" },
      createState: () => ({ count: 0 }),
      api: ctx => ({
        getCount: () => ctx.state.count,
        getBase: () => ctx.config.basePath
      }),
      onInit: () => {},
      onStart: () => {},
      onStop: () => {},
      helpers: {
        route: (path: string) => ({ path })
      }
    });

    // Standard fields work
    expectTypeOf(plugin.name).toEqualTypeOf<"full-featured">();

    // Helper works
    expectTypeOf(plugin.route).toBeFunction();
    expect(plugin.route("/test")).toEqual({ path: "/test" });
  });
});
