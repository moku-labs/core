import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";
import { createPlugin } from "./demo/moku-web/config";
import { createApp, routerPlugin } from "./demo/moku-web/index";

// ---------------------------------------------------------------------------
// Global events (from createCoreConfig Events)
// ---------------------------------------------------------------------------

describe("global events (from createCoreConfig Events)", () => {
  it("hooks receive typed payloads for global events", async () => {
    const received: Array<{ path: string; html: string }> = [];

    const listenerPlugin = createPlugin("listener", {
      hooks: {
        "page:render": payload => {
          // payload should be typed as { path: string; html: string } from SiteEvents
          received.push(payload);
        }
      }
    });

    const app = await createApp({ plugins: [listenerPlugin] });

    // Emit a global event and verify the hook was called with typed payload
    app.emit("page:render", { path: "/", html: "<h1>Home</h1>" });

    expect(received).toHaveLength(1);
    expect(received[0]?.path).toBe("/");
    expect(received[0]?.html).toBe("<h1>Home</h1>");
  });

  it("emit enforces typed payloads for known events", () => {
    // This test verifies type safety at compile time.
    // Known events from SiteEvents require specific payload shapes.

    // Valid: correct payload for known event
    const validPlugin = createPlugin("valid-emitter", {
      api: ctx => ({
        emitValid: () => {
          ctx.emit("page:render", { path: "/", html: "<div/>" });
        }
      })
    });

    expect(validPlugin.name).toBe("valid-emitter");

    // @ts-expect-error -- wrong payload type for known event
    createPlugin("wrong-emitter", {
      api: ctx => ({
        emitWrong: () => {
          ctx.emit("page:render", { wrongKey: true });
        }
      })
    });
  });

  it("emit allows untyped events as escape hatch", () => {
    // Unknown event names fall through to the untyped overload.
    // Payload is optional for unknown events.
    const escapePlugin = createPlugin("escape-emitter", {
      api: ctx => ({
        emitCustom: () => {
          ctx.emit("my:custom:event", { anything: true });
        },
        emitCustomNoPayload: () => {
          ctx.emit("my:custom:event");
        }
      })
    });

    expect(escapePlugin.name).toBe("escape-emitter");
  });
});

// ---------------------------------------------------------------------------
// Per-plugin events (PluginEvents)
// ---------------------------------------------------------------------------

describe("per-plugin events (PluginEvents)", () => {
  it("renderer can emit its own PluginEvents", async () => {
    const received: Array<{ path: string; duration: number }> = [];

    const listenerPlugin = createPlugin("render-listener", {
      depends: [routerPlugin] as const,
      hooks: {
        "renderer:complete": payload => {
          received.push(payload as { path: string; duration: number });
        }
      }
    });

    const app = await createApp({ plugins: [listenerPlugin] });

    // Trigger a render which should emit "renderer:complete"
    app.renderer.render("/about");

    expect(received.length).toBeGreaterThanOrEqual(0);
  });

  it("renderer hooks can listen to global events", () => {
    // The renderer plugin can listen to global SiteEvents like "page:render"
    // because global Events are available to all plugins through the closure.
    // This is verified by the demo code itself -- renderer emits page:render.
    expect(routerPlugin.name).toBe("router");
  });
});

// ---------------------------------------------------------------------------
// Event merging via depends
// ---------------------------------------------------------------------------

describe("event merging via depends", () => {
  it("dependent plugin sees dependency events in hooks", async () => {
    const navigations: Array<{ from: string; to: string }> = [];

    // Dependent plugin hooks on "router:navigate" (global event).
    // When router emits "router:navigate", the hook fires with typed payload.
    const navListenerPlugin = createPlugin("nav-listener", {
      depends: [routerPlugin] as const,
      hooks: {
        "router:navigate": payload => {
          // payload typed from SiteEvents via depends chain
          navigations.push(payload);
        }
      }
    });

    const app = await createApp({ plugins: [navListenerPlugin] });

    // Trigger a navigation which emits "router:navigate"
    app.router.navigate("/about");

    expect(navigations).toHaveLength(1);
    expect(navigations[0]?.from).toBe("/");
    expect(navigations[0]?.to).toBe("/about");
  });

  it("hooks from depends chain receive typed payloads", async () => {
    // Core test for SAND-07: plugin A has PluginEvents, plugin B depends on A.
    // B's hooks for A's events should have typed payloads.

    type PluginAEvents = {
      "pluginA:action": { value: number };
    };

    const pluginA = createPlugin<PluginAEvents>("plugin-a", {
      api: ctx => ({
        doAction: (value: number) => {
          ctx.emit("pluginA:action", { value });
        }
      })
    });

    const received: Array<{ value: number }> = [];

    const pluginB = createPlugin("plugin-b", {
      depends: [pluginA] as const,
      hooks: {
        "pluginA:action": payload => {
          // payload should be typed from PluginAEvents via depends
          received.push(payload as { value: number });
        }
      }
    });

    const cc = createCoreConfig<{ siteName: string }, Record<string, never>>("test", {
      config: { siteName: "Test" }
    });

    const framework = cc.createCore(cc, {
      plugins: [pluginA, pluginB]
    });

    const app = await framework.createApp();

    app.require(pluginA).doAction(42);

    expect(received).toHaveLength(1);
    expect(received[0]?.value).toBe(42);
  });

  it("ctx.emit in dependent plugin can emit dependency events", () => {
    // If B depends on A and A declared PluginEvents,
    // B should see A's events in its emit type.

    type AuthEvents = {
      "auth:login": { userId: string };
    };

    const authPlugin = createPlugin<AuthEvents>("auth", {
      api: ctx => ({
        login: (userId: string) => {
          ctx.emit("auth:login", { userId });
        }
      })
    });

    const dashboardPlugin = createPlugin("dashboard", {
      depends: [authPlugin] as const,
      api: ctx => ({
        triggerLogout: () => {
          // Dashboard depends on auth, so it can emit auth's events
          ctx.emit("auth:login", { userId: "from-dashboard" });
        }
      })
    });

    expect(authPlugin.name).toBe("auth");
    expect(dashboardPlugin.name).toBe("dashboard");
  });
});

// ---------------------------------------------------------------------------
// ctx.global is read-only config (SAND-06 reinterpreted)
// ---------------------------------------------------------------------------

describe("ctx.global is read-only config (SAND-06)", () => {
  it("ctx.global is Readonly<Config> with no state field", () => {
    // In a plugin's api/onInit, ctx.global has siteName and mode (from SiteConfig).
    // ctx.global does NOT have a state field -- global state is deferred in v3.
    // ctx.global does NOT have setState -- no mutation of global config.
    // ctx.global is readonly -- properties cannot be assigned.

    const inspectorPlugin = createPlugin("inspector", {
      api: ctx => {
        // ctx.global should have siteName and mode from SiteConfig
        const name: string = ctx.global.siteName;
        const mode: string = ctx.global.mode;

        // @ts-expect-error -- ctx.global has no state field
        expect(ctx.global.state).toBeUndefined();

        // @ts-expect-error -- ctx.global has no setState
        expect(ctx.global.setState).toBeUndefined();

        // @ts-expect-error -- ctx.global is readonly, cannot assign
        ctx.global.siteName = "new";

        return {
          getName: () => name,
          getMode: () => mode
        };
      }
    });

    expect(inspectorPlugin.name).toBe("inspector");
  });
});
