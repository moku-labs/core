import { describe, expect, it } from "vitest";

import { createRouterState } from "../state";

// ---------------------------------------------------------------------------
// Unit test: createRouterState (no kernel needed)
// ---------------------------------------------------------------------------

describe("createRouterState", () => {
  it("creates initial state with basePath as currentPath", () => {
    const state = createRouterState({ config: { basePath: "/" } });

    expect(state.currentPath).toBe("/");
    expect(state.history).toEqual([]);
    expect(state.guards).toEqual([]);
    expect(state.initialized).toBe(false);
  });

  it("uses custom basePath", () => {
    const state = createRouterState({ config: { basePath: "/app" } });

    expect(state.currentPath).toBe("/app");
  });

  it("returns a fresh state object each call", () => {
    const ctx = { config: { basePath: "/" } };
    const state1 = createRouterState(ctx);
    const state2 = createRouterState(ctx);

    expect(state1).not.toBe(state2);
    expect(state1.history).not.toBe(state2.history);
    expect(state1.guards).not.toBe(state2.guards);
  });
});
