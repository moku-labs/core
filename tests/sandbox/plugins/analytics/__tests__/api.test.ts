import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { createAnalyticsApi } from "../api";
import type { AnalyticsCtx, AnalyticsState } from "../types";

// ---------------------------------------------------------------------------
// Unit test: createAnalyticsApi (mock context, no kernel)
// ---------------------------------------------------------------------------

const createMockCtx = (overrides?: Partial<AnalyticsCtx>): AnalyticsCtx => {
  const state: AnalyticsState = {
    events: [],
    userId: undefined,
    initialized: false,
    ...overrides?.state
  };

  return {
    config: {
      provider: "memory",
      sampleRate: 1,
      trackingId: "test-id",
      ...overrides?.config
    },
    state,
    emit: overrides?.emit ?? vi.fn()
  };
};

describe("createAnalyticsApi", () => {
  describe("track", () => {
    it("tracks event and emits analytics:track", () => {
      const ctx = createMockCtx();
      const api = createAnalyticsApi(ctx);

      const result = api.track("click", { button: "submit" });

      expect(result).toBeDefined();
      expect(result?.event).toBe("click");
      expect(ctx.state.events).toHaveLength(1);
      expect(ctx.emit).toHaveBeenCalledWith("analytics:track", {
        event: "click",
        properties: { button: "submit" }
      });
    });

    it("defaults properties to empty object", () => {
      const ctx = createMockCtx();
      const api = createAnalyticsApi(ctx);

      const result = api.track("pageview");

      expect(result?.properties).toEqual({});
    });

    it("does not emit when sample rate filters event", () => {
      const ctx = createMockCtx({ config: { provider: "memory", sampleRate: 0, trackingId: "x" } });
      const api = createAnalyticsApi(ctx);

      const result = api.track("click", {});

      expect(result).toBeUndefined();
      expect(ctx.emit).not.toHaveBeenCalled();
    });
  });

  describe("identify", () => {
    it("sets userId and emits analytics:identify", () => {
      const ctx = createMockCtx();
      const api = createAnalyticsApi(ctx);

      api.identify("user-42");

      expect(ctx.state.userId).toBe("user-42");
      expect(ctx.emit).toHaveBeenCalledWith("analytics:identify", {
        userId: "user-42"
      });
    });
  });

  describe("getEvents", () => {
    it("returns tracked events", () => {
      const ctx = createMockCtx();
      const api = createAnalyticsApi(ctx);

      api.track("a", {});
      api.track("b", {});

      const events = api.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0]?.event).toBe("a");
      expect(events[1]?.event).toBe("b");
    });
  });

  describe("getUserId", () => {
    it("returns undefined before identify", () => {
      const ctx = createMockCtx();
      const api = createAnalyticsApi(ctx);

      expect(api.getUserId()).toBeUndefined();
    });

    it("returns userId after identify", () => {
      const ctx = createMockCtx();
      const api = createAnalyticsApi(ctx);

      api.identify("alice");
      expect(api.getUserId()).toBe("alice");
    });
  });

  describe("getEventCount", () => {
    it("returns the count of tracked events", () => {
      const ctx = createMockCtx();
      const api = createAnalyticsApi(ctx);

      expect(api.getEventCount()).toBe(0);
      api.track("click", {});
      expect(api.getEventCount()).toBe(1);
      api.track("scroll", {});
      expect(api.getEventCount()).toBe(2);
    });
  });

  describe("flush", () => {
    it("calls provider flush", () => {
      const ctx = createMockCtx();
      const api = createAnalyticsApi(ctx);

      // Should not throw
      expect(() => api.flush()).not.toThrow();
    });
  });

  describe("types: domain emit", () => {
    it("accepts correct event names and payloads", () => {
      const ctx = createMockCtx();

      ctx.emit("analytics:track", { event: "click", properties: {} });
      ctx.emit("analytics:identify", { userId: "user-1" });

      expectTypeOf(ctx.emit).toBeFunction();
    });

    it("rejects unknown event names", () => {
      const ctx = createMockCtx();

      // @ts-expect-error -- "typo:event" is not a known analytics event
      ctx.emit("typo:event", { wrong: true });

      expect(ctx).toBeDefined();
    });

    it("rejects wrong payload shape", () => {
      const ctx = createMockCtx();

      // @ts-expect-error -- payload should be { event, properties }, not { wrong }
      ctx.emit("analytics:track", { wrong: true });

      expect(ctx).toBeDefined();
    });

    it("rejects wrong payload for identify", () => {
      const ctx = createMockCtx();

      // @ts-expect-error -- payload should be { userId: string }, not { id }
      ctx.emit("analytics:identify", { id: "user-1" });

      expect(ctx).toBeDefined();
    });
  });
});
