import { describe, expect, it } from "vitest";

import { createAnalyticsState } from "../../state";

// ---------------------------------------------------------------------------
// Unit test: createAnalyticsState (no kernel needed)
// ---------------------------------------------------------------------------

describe("createAnalyticsState", () => {
  it("creates initial state with empty events", () => {
    const state = createAnalyticsState();

    expect(state.events).toEqual([]);
  });

  it("creates initial state with no identified user", () => {
    const state = createAnalyticsState();

    expect(state.userId).toBeUndefined();
  });

  it("creates initial state as uninitialized", () => {
    const state = createAnalyticsState();

    expect(state.initialized).toBe(false);
  });

  it("returns a fresh state object each call", () => {
    const state1 = createAnalyticsState();
    const state2 = createAnalyticsState();

    expect(state1).not.toBe(state2);
    expect(state1.events).not.toBe(state2.events);
  });
});
