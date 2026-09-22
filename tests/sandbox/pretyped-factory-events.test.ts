// =============================================================================
// Pre-typed api factory + own events + a dependency that declares events
// =============================================================================
// moku-labs/core#26. `events: r => ...` without a parameter annotation is
// context-sensitive, so TypeScript defers it to the second inference pass and
// checks a pre-typed `api` factory in the first pass, where PluginEventMap is
// still the default (empty). Two fixes: annotate the register parameter so
// `events` joins the first pass, or wrap the factory in an arrow so `api`
// joins the second pass.
// =============================================================================

import { describe, expect, expectTypeOf, it } from "vitest";

import type { PluginCtx, RegisterFunction } from "../../src";
import { createPlugin } from "./demo/framework/config";

type ModelEvents = { "model:committed": { id: string } };
type ProbeEvents = { "probe:fired": { at: number } };

const modelPlugin = createPlugin("model", {
  events: register => register.map<ModelEvents>({ "model:committed": "Model committed" }),
  api: () => ({ commit: () => {} })
});

type ProbeCtx = PluginCtx<Record<string, never>, Record<string, never>, ProbeEvents>;

const createProbeApi = (ctx: ProbeCtx) => ({
  fire: () => ctx.emit("probe:fired", { at: 1 })
});

const createWrongApi = (
  ctx: PluginCtx<Record<string, never>, Record<string, never>, { "probe:nope": { at: number } }>
) => ({
  fire: () => ctx.emit("probe:nope", { at: 1 })
});

type ExtractEvents<P> = P extends { readonly _phantom: { readonly events: infer E } } ? E : never;

describe("pre-typed api factory with own events and a dependency that declares events", () => {
  it("compiles when the register parameter is annotated", () => {
    const probe = createPlugin("probe", {
      depends: [modelPlugin],
      events: (register: RegisterFunction) =>
        register.map<ProbeEvents>({ "probe:fired": "Probe fired" }),
      api: createProbeApi
    });

    expectTypeOf<ExtractEvents<typeof probe>>().toEqualTypeOf<ProbeEvents>();
    expect(probe.name).toBe("probe");
  });

  it("compiles when the factory is wrapped in an arrow", () => {
    const probe = createPlugin("probe-wrapped", {
      depends: [modelPlugin],
      events: register => register.map<ProbeEvents>({ "probe:fired": "Probe fired" }),
      api: ctx => createProbeApi(ctx)
    });

    expectTypeOf<ExtractEvents<typeof probe>>().toEqualTypeOf<ProbeEvents>();
    expect(probe.name).toBe("probe-wrapped");
  });

  it("wrapped factory still rejects an undeclared event", () => {
    const probe = createPlugin("probe-wrapped-wrong", {
      depends: [modelPlugin],
      events: register => register.map<ProbeEvents>({ "probe:fired": "Probe fired" }),
      // @ts-expect-error -- "probe:nope" is not declared in events
      api: ctx => createWrongApi(ctx)
    });

    expect(probe.name).toBe("probe-wrapped-wrong");
  });

  it("still rejects a factory typed against an undeclared event", () => {
    const probe = createPlugin("probe-wrong", {
      depends: [modelPlugin],
      events: (register: RegisterFunction) =>
        register.map<ProbeEvents>({ "probe:fired": "Probe fired" }),
      // @ts-expect-error -- "probe:nope" is not declared in events
      api: createWrongApi
    });

    expect(probe.name).toBe("probe-wrong");
  });

  it("documents the gap: an unannotated register parameter drops own events from the factory check", () => {
    const probe = createPlugin("probe-unannotated", {
      depends: [modelPlugin],
      events: register => register.map<ProbeEvents>({ "probe:fired": "Probe fired" }),
      // @ts-expect-error -- first inference pass sees EmptyPluginEventMap, see moku-labs/core#26
      api: createProbeApi
    });

    expect(probe.name).toBe("probe-unannotated");
  });

  it("inline api factories are unaffected", () => {
    const probe = createPlugin("probe-inline", {
      depends: [modelPlugin],
      events: register => register.map<ProbeEvents>({ "probe:fired": "Probe fired" }),
      api: ctx => ({
        fire: () => {
          ctx.emit("probe:fired", { at: 1 });
          ctx.emit("model:committed", { id: "x" });
        }
      })
    });

    expect(probe.name).toBe("probe-inline");
  });
});
