// =============================================================================
// Typed ctx.require via Instance-Based Depends: Runtime Tests
// =============================================================================
// Proves the runtime enforcement of depends-scoped ctx.require and ctx.getPlugin
// works correctly. Tests cover:
//   - ctx.require(instance) returns correct API
//   - ctx.require('name') returns correct API (string from depends)
//   - ctx.require for undeclared deps throws
//   - ctx.getPlugin for undeclared deps returns undefined
//   - plugins without depends have unrestricted access
//   - cross-plugin scoping (A depends on B, B depends on C)
//   - component with depends
//   - ctx.has is NOT restricted by depends
//   - depends enforcement during onStart (PluginContext)
// =============================================================================

import { describe, expect, it } from "vitest";
import { createCore } from "../../src/index";

// =============================================================================
// Setup: Create core and plugins for tests
// =============================================================================

type TestConfig = { env: string };
type TestBus = { "test:event": { data: string } };
type TestSignals = { "test:signal": { value: number } };

function createTestCore() {
  return createCore<TestConfig, TestBus, TestSignals>("test-framework", {
    config: { env: "test" }
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("typed ctx.require via depends instances", () => {
  it("ctx.require(routerPlugin) during onInit returns router's API object", async () => {
    const core = createTestCore();
    let requiredApi: unknown;

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: { basePath: "/" },
      api: () => ({
        resolve: (path: string) => path
      })
    });

    const loggerPlugin = core.createPlugin("logger", {
      defaultConfig: {},
      depends: [routerPlugin],
      onInit: (ctx: { require: (plugin: unknown) => unknown }) => {
        requiredApi = ctx.require(routerPlugin);
      }
    });

    const config = core.createConfig({ plugins: [routerPlugin, loggerPlugin] });
    await core.createApp(config);

    expect(requiredApi).toBeDefined();
    expect((requiredApi as { resolve: (p: string) => string }).resolve("/home")).toBe("/home");
  });

  it("ctx.require('router') during onInit returns router's API object (same result)", async () => {
    const core = createTestCore();
    let requiredApi: unknown;

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: { basePath: "/" },
      api: () => ({
        resolve: (path: string) => `/${path}`
      })
    });

    const loggerPlugin = core.createPlugin("logger", {
      defaultConfig: {},
      depends: [routerPlugin],
      onInit: (ctx: { require: (name: string) => unknown }) => {
        requiredApi = ctx.require("router");
      }
    });

    const config = core.createConfig({ plugins: [routerPlugin, loggerPlugin] });
    await core.createApp(config);

    expect(requiredApi).toBeDefined();
    expect((requiredApi as { resolve: (p: string) => string }).resolve("about")).toBe("/about");
  });

  it("ctx.require for plugin NOT in depends throws with correct error message", async () => {
    const core = createTestCore();

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: () => "/" })
    });

    const authPlugin = core.createPlugin("auth", {
      defaultConfig: {},
      api: () => ({ verify: () => true })
    });

    const loggerPlugin = core.createPlugin("logger", {
      defaultConfig: {},
      depends: [routerPlugin], // only depends on router, NOT auth
      onInit: (ctx: { require: (name: string) => unknown }) => {
        ctx.require("auth"); // should throw
      }
    });

    const config = core.createConfig({
      plugins: [routerPlugin, authPlugin, loggerPlugin]
    });

    await expect(core.createApp(config)).rejects.toThrow(
      '[test-framework] Plugin "auth" not in depends for "logger".\n  Add the plugin to your depends array.'
    );
  });

  it("ctx.getPlugin(routerPlugin) during api() returns router's API", async () => {
    const core = createTestCore();
    let gottenApi: unknown;

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({
        resolve: (path: string) => path
      })
    });

    const loggerPlugin = core.createPlugin("logger", {
      defaultConfig: {},
      depends: [routerPlugin],
      api: (ctx: { getPlugin: (plugin: unknown) => unknown }) => {
        gottenApi = ctx.getPlugin(routerPlugin);
        return {};
      }
    });

    const config = core.createConfig({ plugins: [routerPlugin, loggerPlugin] });
    await core.createApp(config);

    expect(gottenApi).toBeDefined();
    expect((gottenApi as { resolve: (p: string) => string }).resolve("/test")).toBe("/test");
  });

  it("ctx.getPlugin for plugin NOT in depends returns undefined (no throw)", async () => {
    const core = createTestCore();
    let result: unknown = "sentinel";

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: () => "/" })
    });

    const authPlugin = core.createPlugin("auth", {
      defaultConfig: {},
      api: () => ({ verify: () => true })
    });

    const loggerPlugin = core.createPlugin("logger", {
      defaultConfig: {},
      depends: [routerPlugin], // only depends on router, NOT auth
      onInit: (ctx: { getPlugin: (name: string) => unknown }) => {
        result = ctx.getPlugin("auth"); // should return undefined, not throw
      }
    });

    const config = core.createConfig({
      plugins: [routerPlugin, authPlugin, loggerPlugin]
    });
    await core.createApp(config);

    expect(result).toBeUndefined();
  });

  it("plugin with no depends can access any plugin via ctx.require (no restriction)", async () => {
    const core = createTestCore();
    let routerApi: unknown;
    let authApi: unknown;

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: () => "/" })
    });

    const authPlugin = core.createPlugin("auth", {
      defaultConfig: {},
      api: () => ({ verify: () => true })
    });

    // No depends field at all -- unrestricted
    const unrestrictedPlugin = core.createPlugin("unrestricted", {
      defaultConfig: {},
      onInit: (ctx: { require: (name: string) => unknown }) => {
        routerApi = ctx.require("router");
        authApi = ctx.require("auth");
      }
    });

    const config = core.createConfig({
      plugins: [routerPlugin, authPlugin, unrestrictedPlugin]
    });
    await core.createApp(config);

    expect(routerApi).toBeDefined();
    expect(authApi).toBeDefined();
  });

  it("plugin with empty depends array cannot access any plugin via ctx.require", async () => {
    const core = createTestCore();

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: () => "/" })
    });

    const restrictedPlugin = core.createPlugin("restricted", {
      defaultConfig: {},
      depends: [], // explicit empty depends -- all access restricted
      onInit: (ctx: { require: (name: string) => unknown }) => {
        ctx.require("router"); // should throw
      }
    });

    const config = core.createConfig({
      plugins: [routerPlugin, restrictedPlugin]
    });

    await expect(core.createApp(config)).rejects.toThrow(
      '[test-framework] Plugin "router" not in depends for "restricted"'
    );
  });

  it("cross-plugin access: A depends on B, B depends on C. A can access B but NOT C", async () => {
    const core = createTestCore();
    let accessedBApi: unknown;

    const pluginC = core.createPlugin("c", {
      defaultConfig: {},
      api: () => ({ cMethod: () => "c-result" })
    });

    const pluginB = core.createPlugin("b", {
      depends: [pluginC],
      defaultConfig: {},
      api: () => ({ bMethod: () => "b-result" })
    });

    // Plugin A depends on B but NOT C
    const pluginA = core.createPlugin("a", {
      defaultConfig: {},
      depends: [pluginB],
      onInit: (ctx: { require: (name: string) => unknown }) => {
        // Can access B (declared in depends)
        accessedBApi = ctx.require("b");
        // Cannot access C (not declared in depends)
        try {
          ctx.require("c");
          // If we get here, the test should fail
          throw new Error("should have thrown for undeclared dep");
        } catch (error) {
          const message = (error as Error).message;
          if (!message.includes("not in depends")) {
            throw error; // Re-throw unexpected errors
          }
          // Expected: "c" not in depends for "a"
        }
      }
    });

    const config = core.createConfig({
      plugins: [pluginC, pluginB, pluginA]
    });
    await core.createApp(config);

    expect(accessedBApi).toBeDefined();
    expect((accessedBApi as { bMethod: () => string }).bMethod()).toBe("b-result");
  });

  it("component with depends works the same as plugin with depends", async () => {
    const core = createTestCore();
    let requiredApi: unknown;

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: (path: string) => path })
    });

    const sidebarComponent = core.createComponent("sidebar", {
      depends: [routerPlugin],
      defaultConfig: { width: 300 },
      createState: () => ({ open: false }),
      api: (ctx: { getPlugin: (name: string) => unknown }) => {
        requiredApi = ctx.getPlugin("router");
        return {
          toggle: () => {},
          isOpen: () => false
        };
      }
    });

    const config = core.createConfig({
      plugins: [routerPlugin, sidebarComponent]
    });
    await core.createApp(config);

    expect(requiredApi).toBeDefined();
    expect((requiredApi as { resolve: (p: string) => string }).resolve("/sidebar")).toBe(
      "/sidebar"
    );
  });

  it("ctx.has() is NOT restricted by depends (always checks global registration)", async () => {
    const core = createTestCore();
    let hasRouter: boolean | undefined;
    let hasAuth: boolean | undefined;
    let hasNonexistent: boolean | undefined;

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: () => "/" })
    });

    const authPlugin = core.createPlugin("auth", {
      defaultConfig: {},
      api: () => ({ verify: () => true })
    });

    const loggerPlugin = core.createPlugin("logger", {
      defaultConfig: {},
      depends: [routerPlugin], // only depends on router
      onInit: (ctx: { has: (name: string) => boolean }) => {
        hasRouter = ctx.has("router"); // in depends -> true
        hasAuth = ctx.has("auth"); // NOT in depends but registered -> should still be true
        hasNonexistent = ctx.has("nonexistent"); // not registered -> false
      }
    });

    const config = core.createConfig({
      plugins: [routerPlugin, authPlugin, loggerPlugin]
    });
    await core.createApp(config);

    expect(hasRouter).toBe(true);
    expect(hasAuth).toBe(true); // has() is NOT restricted by depends
    expect(hasNonexistent).toBe(false);
  });

  it("depends enforcement works correctly during onStart (PluginContext, not just InitContext)", async () => {
    const core = createTestCore();

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: () => "/" })
    });

    const authPlugin = core.createPlugin("auth", {
      defaultConfig: {},
      api: () => ({ verify: () => true })
    });

    const enforcedPlugin = core.createPlugin("enforced", {
      depends: [routerPlugin], // only router
      defaultConfig: {},
      createState: () => ({ accessed: false }),
      onStart: (ctx: { require: (name: string) => unknown }) => {
        // Should throw for auth (not in depends), even during onStart
        ctx.require("auth");
      }
    });

    const config = core.createConfig({
      plugins: [routerPlugin, authPlugin, enforcedPlugin]
    });
    const app = await core.createApp(config);

    await expect(app.start()).rejects.toThrow(
      '[test-framework] Plugin "auth" not in depends for "enforced"'
    );
  });

  it("depends enforcement during api() phase", async () => {
    const core = createTestCore();

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: () => "/" })
    });

    const authPlugin = core.createPlugin("auth", {
      defaultConfig: {},
      api: () => ({ verify: () => true })
    });

    const enforcedPlugin = core.createPlugin("enforced", {
      defaultConfig: {},
      depends: [routerPlugin], // only router
      api: (ctx: { require: (name: string) => unknown }) => {
        ctx.require("auth"); // should throw -- auth not in depends
        return {};
      }
    });

    const config = core.createConfig({
      plugins: [routerPlugin, authPlugin, enforcedPlugin]
    });

    await expect(core.createApp(config)).rejects.toThrow(
      '[test-framework] Plugin "auth" not in depends for "enforced"'
    );
  });

  it("ctx.require with instance resolves plugin name correctly at runtime", async () => {
    const core = createTestCore();
    let requiredViaInstance: unknown;
    let requiredViaString: unknown;

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: (p: string) => `resolved:${p}` })
    });

    const consumer = core.createPlugin("consumer", {
      defaultConfig: {},
      depends: [routerPlugin],
      onInit: (ctx: { require: (nameOrPlugin: unknown) => unknown }) => {
        requiredViaInstance = ctx.require(routerPlugin);
        requiredViaString = ctx.require("router");
      }
    });

    const config = core.createConfig({ plugins: [routerPlugin, consumer] });
    await core.createApp(config);

    // Both should return the same API object
    expect(requiredViaInstance).toBeDefined();
    expect(requiredViaString).toBeDefined();
    expect(requiredViaInstance).toBe(requiredViaString); // Same reference
  });

  it("error message format matches specification", async () => {
    const core = createTestCore();

    const routerPlugin = core.createPlugin("router", {
      defaultConfig: {},
      api: () => ({ resolve: () => "/" })
    });

    const loggerPlugin = core.createPlugin("logger", {
      defaultConfig: {},
      depends: [routerPlugin],
      onInit: (ctx: { require: (name: string) => unknown }) => {
        ctx.require("unknown-plugin");
      }
    });

    const config = core.createConfig({ plugins: [routerPlugin, loggerPlugin] });

    try {
      await core.createApp(config);
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      // Verify exact format: [frameworkName] Plugin "X" not in depends for "Y".\n  Add the plugin to your depends array.
      expect(message).toBe(
        '[test-framework] Plugin "unknown-plugin" not in depends for "logger".\n  Add the plugin to your depends array.'
      );
    }
  });
});
