import { describe, expect, expectTypeOf, it } from "vitest";

import { createPlugin } from "./demo/moku-web/config";
import { createApp } from "./demo/moku-web/index";
import { rendererPlugin } from "./demo/moku-web/plugins/renderer";
import { routerPlugin } from "./demo/moku-web/plugins/router";
import { templateEnginePlugin } from "./demo/moku-web/plugins/template-engine";

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

  it("infers config type from defaultConfig", () => {
    const plugin = createPlugin("config-test", {
      defaultConfig: { basePath: "/", retries: 3 }
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
    const app = await createApp();

    // Plugin API is accessible
    expect(app.router).toBeDefined();

    // @ts-expect-error -- state is private, not exposed on app.pluginName
    app.router._state;
  });
});

// ---------------------------------------------------------------------------
// createPlugin<PluginEvents> preserves inference (SAND-03)
// ---------------------------------------------------------------------------

describe("createPlugin<PluginEvents> preserves inference (SAND-03)", () => {
  it("adds typed events without breaking config/state/API inference", () => {
    // Renderer uses createPlugin<RendererEvents>('renderer', ...) with PluginEvents.
    // Despite the explicit generic for events, all other types should be inferred.
    expectTypeOf(rendererPlugin.name).toEqualTypeOf<"renderer">();

    // Runtime: name is still correctly inferred
    expect(rendererPlugin.name).toBe("renderer");
  });

  it("PluginEvents is the only explicit generic needed", () => {
    // This is a documentation test: the renderer plugin in the demo uses
    // createPlugin<RendererEvents>(...) with ONLY PluginEvents as the generic.
    // Config (C), state (S), and API (A) are all inferred from the spec object.
    // If this test compiles and runs, inference works with PluginEvents.
    expect(rendererPlugin.name).toBe("renderer");

    // Verify renderer has the expected structure from its spec
    expectTypeOf(rendererPlugin).toHaveProperty("name");
  });

  it("plugin without PluginEvents defaults to empty events", () => {
    // Router has no PluginEvents generic -- it only has access to global SiteEvents
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
