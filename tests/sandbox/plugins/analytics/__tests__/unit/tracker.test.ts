import { describe, expect, it, vi } from "vitest";

import type { AnalyticsProvider } from "../../providers/types";
import { shouldSample, trackEvent } from "../../tracker";
import type { TrackedEvent } from "../../types";

// ---------------------------------------------------------------------------
// Unit test: tracker logic (no kernel)
// ---------------------------------------------------------------------------

const createMockProvider = (): AnalyticsProvider => ({
  name: "mock",
  track: vi.fn(),
  identify: vi.fn(),
  flush: vi.fn()
});

describe("shouldSample", () => {
  it("always samples when rate is 1.0", () => {
    for (let i = 0; i < 100; i++) {
      expect(shouldSample(1)).toBe(true);
    }
  });

  it("never samples when rate is 0.0", () => {
    for (let i = 0; i < 100; i++) {
      expect(shouldSample(0)).toBe(false);
    }
  });

  it("samples probabilistically for rates between 0 and 1", () => {
    // With rate 0.5, we expect ~50% of samples to be true
    let count = 0;
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      if (shouldSample(0.5)) count++;
    }
    // Allow wide margin for randomness
    expect(count).toBeGreaterThan(200);
    expect(count).toBeLessThan(800);
  });
});

describe("trackEvent", () => {
  it("tracks event and pushes to events array", () => {
    const provider = createMockProvider();
    const events: TrackedEvent[] = [];

    const result = trackEvent(provider, events, "click", { button: "submit" }, 1);

    expect(result).toBeDefined();
    expect(result?.event).toBe("click");
    expect(result?.properties).toEqual({ button: "submit" });
    expect(result?.timestamp).toBeTypeOf("number");
    expect(events).toHaveLength(1);
    expect(provider.track).toHaveBeenCalledWith("click", { button: "submit" });
  });

  it("returns undefined when sample rate filters it out", () => {
    const provider = createMockProvider();
    const events: TrackedEvent[] = [];

    const result = trackEvent(
      provider,
      events,
      "click",
      {},
      0 // never sample
    );

    expect(result).toBeUndefined();
    expect(events).toHaveLength(0);
    expect(provider.track).not.toHaveBeenCalled();
  });

  it("accumulates multiple events", () => {
    const provider = createMockProvider();
    const events: TrackedEvent[] = [];

    trackEvent(provider, events, "click", {}, 1);
    trackEvent(provider, events, "scroll", {}, 1);
    trackEvent(provider, events, "submit", {}, 1);

    expect(events).toHaveLength(3);
    expect(events.map(e => e.event)).toEqual(["click", "scroll", "submit"]);
  });
});
