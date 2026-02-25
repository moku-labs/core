// =============================================================================
// Prototype: Hook key constraint using generic parameter
// =============================================================================
// Tests whether TypeScript can infer a HookHandlerMap generic from the return
// value of hooks(), then use it to reject unknown event keys via `never`.
//
// Approach: Add a 7th generic to BoundCreatePluginFunction that captures the
// hook return type's keys, then constrain each key to be a valid event or never.
// =============================================================================

import { describe, expect, expectTypeOf, it } from "vitest";
import { createCoreConfig } from "../../src/config";

// ---------------------------------------------------------------------------
// Setup: Framework with known global events
// ---------------------------------------------------------------------------

type SiteConfig = { siteName: string };
type SiteEvents = {
  "global:action": { type: string };
  "global:navigate": { path: string };
};

const cc = createCoreConfig<SiteConfig, SiteEvents>("test-hooks", {
  config: { siteName: "Test" }
});
const cp = cc.createPlugin;

// ---------------------------------------------------------------------------
// Test 1: Current behavior — document the gap
// ---------------------------------------------------------------------------

describe("hooks constraint prototype", () => {
  it("current: hooks with ONLY unknown keys ARE rejected", () => {
    const plugin = cp("only-bad", {
      // @ts-expect-error -- no valid keys in return, TS catches this
      hooks: _ctx => ({
        "nonexistent:event": (_payload: unknown) => {}
      })
    });
    expect(plugin.name).toBe("only-bad");
  });

  it("FIXED: hooks with valid + unknown keys — unknown IS now rejected", () => {
    const plugin = cp("mixed-keys", {
      // @ts-expect-error -- "fake:event" is not a known event, mapped to never
      hooks: _ctx => ({
        "global:action": _payload => {},
        "fake:event": (_payload: unknown) => {}
      })
    });
    expect(plugin.name).toBe("mixed-keys");
  });

  it("valid hooks with known events pass", () => {
    const plugin = cp("valid-hooks", {
      hooks: _ctx => ({
        "global:action": _payload => {
          expectTypeOf(_payload).toEqualTypeOf<{ type: string }>();
        },
        "global:navigate": _payload => {
          expectTypeOf(_payload).toEqualTypeOf<{ path: string }>();
        }
      })
    });
    expect(plugin.name).toBe("valid-hooks");
  });

  it("valid hooks with subset of events pass", () => {
    const plugin = cp("subset-hooks", {
      hooks: _ctx => ({
        "global:action": _payload => {}
      })
    });
    expect(plugin.name).toBe("subset-hooks");
  });

  it("empty hooks object passes", () => {
    const plugin = cp("empty-hooks", {
      hooks: _ctx => ({})
    });
    expect(plugin.name).toBe("empty-hooks");
  });

  it("plugin with own events can hook into them", () => {
    const plugin = cp("own-events", {
      events: register => ({
        "own:thing": register<{ data: number }>("Something happened")
      }),
      hooks: _ctx => ({
        "own:thing": _payload => {
          expectTypeOf(_payload).toEqualTypeOf<{ data: number }>();
        },
        "global:action": _payload => {}
      })
    });
    expect(plugin.name).toBe("own-events");
  });

  it("hooks with dependency events work", () => {
    const depPlugin = cp("dep", {
      events: register => ({
        "dep:ready": register<{ timestamp: number }>("Dep is ready")
      }),
      api: _ctx => ({ ping: () => "pong" })
    });

    const consumer = cp("consumer", {
      depends: [depPlugin] as const,
      hooks: _ctx => ({
        "dep:ready": _payload => {
          expectTypeOf(_payload).toEqualTypeOf<{ timestamp: number }>();
        },
        "global:action": _payload => {}
      })
    });
    expect(consumer.name).toBe("consumer");
  });
});
