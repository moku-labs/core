import { describe, expect, expectTypeOf, it } from "vitest";

import { createRouterApi } from "../../api";
import type { RouterCtx, RouterState } from "../../types";

// ---------------------------------------------------------------------------
// Unit test: createRouterApi (mock context, no kernel)
// ---------------------------------------------------------------------------

const createMockCtx = (overrides?: Partial<RouterCtx>): RouterCtx => {
  const state: RouterState = {
    currentPath: "/",
    history: [],
    guards: [],
    initialized: false,
    ...overrides?.state
  };

  return {
    config: { basePath: "/", notFoundPath: "/404", ...overrides?.config },
    state,
    emit: overrides?.emit ?? (() => {})
  };
};

describe("createRouterApi", () => {
  describe("navigate", () => {
    it("updates currentPath and pushes to history", () => {
      const ctx = createMockCtx();
      const api = createRouterApi(ctx);

      const result = api.navigate("/about");

      expect(result).toEqual({ from: "/", to: "/about", blocked: false });
      expect(ctx.state.currentPath).toBe("/about");
      expect(ctx.state.history).toEqual(["/"]);
    });

    it("emits router:navigate event", () => {
      const emitted: Array<{ name: string; payload: unknown }> = [];
      const ctx = createMockCtx({
        emit: (name: string, payload: unknown) => {
          emitted.push({ name, payload });
        }
      });
      const api = createRouterApi(ctx);

      api.navigate("/contact");

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({
        name: "router:navigate",
        payload: { from: "/", to: "/contact" }
      });
    });

    it("tracks multiple navigations in history", () => {
      const ctx = createMockCtx();
      const api = createRouterApi(ctx);

      api.navigate("/a");
      api.navigate("/b");
      api.navigate("/c");

      expect(ctx.state.currentPath).toBe("/c");
      expect(ctx.state.history).toEqual(["/", "/a", "/b"]);
    });

    it("blocks navigation when a guard returns false", () => {
      const ctx = createMockCtx();
      ctx.state.guards.push(to => to !== "/blocked");
      const api = createRouterApi(ctx);

      const result = api.navigate("/blocked");

      expect(result).toEqual({ from: "/", to: "/blocked", blocked: true });
      expect(ctx.state.currentPath).toBe("/"); // unchanged
      expect(ctx.state.history).toEqual([]); // no history push
    });

    it("allows navigation when all guards return true", () => {
      const ctx = createMockCtx();
      ctx.state.guards.push(
        () => true,
        () => true
      );
      const api = createRouterApi(ctx);

      const result = api.navigate("/allowed");

      expect(result.blocked).toBe(false);
      expect(ctx.state.currentPath).toBe("/allowed");
    });
  });

  describe("current", () => {
    it("returns the current path", () => {
      const ctx = createMockCtx();
      const api = createRouterApi(ctx);

      expect(api.current()).toBe("/");

      api.navigate("/test");
      expect(api.current()).toBe("/test");
    });
  });

  describe("back", () => {
    it("navigates to the previous path", () => {
      const ctx = createMockCtx();
      const api = createRouterApi(ctx);

      api.navigate("/a");
      api.navigate("/b");

      const previous = api.back();

      expect(previous).toBe("/a");
      expect(ctx.state.currentPath).toBe("/a");
    });

    it("returns undefined when history is empty", () => {
      const ctx = createMockCtx();
      const api = createRouterApi(ctx);

      const previous = api.back();

      expect(previous).toBeUndefined();
      expect(ctx.state.currentPath).toBe("/");
    });

    it("emits router:navigate when going back", () => {
      const emitted: Array<{ name: string; payload: unknown }> = [];
      const ctx = createMockCtx({
        emit: (name: string, payload: unknown) => {
          emitted.push({ name, payload });
        }
      });
      const api = createRouterApi(ctx);

      api.navigate("/page");
      emitted.length = 0; // clear navigate emit

      api.back();

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({
        name: "router:navigate",
        payload: { from: "/page", to: "/" }
      });
    });
  });

  describe("addGuard", () => {
    it("adds a navigation guard", () => {
      const ctx = createMockCtx();
      const api = createRouterApi(ctx);

      expect(ctx.state.guards).toHaveLength(0);

      api.addGuard(() => true);

      expect(ctx.state.guards).toHaveLength(1);
    });
  });

  describe("getHistory", () => {
    it("returns the navigation history", () => {
      const ctx = createMockCtx();
      const api = createRouterApi(ctx);

      api.navigate("/a");
      api.navigate("/b");

      expect(api.getHistory()).toEqual(["/", "/a"]);
    });
  });

  describe("types: domain emit", () => {
    it("accepts correct event names and payloads", () => {
      const ctx = createMockCtx();

      // These compile — correct event name + payload shape
      ctx.emit("router:navigate", { from: "/", to: "/about" });
      ctx.emit("router:not-found", { path: "/missing" });

      expectTypeOf(ctx.emit).toBeFunction();
    });

    it("rejects unknown event names", () => {
      const ctx = createMockCtx();

      // @ts-expect-error -- "typo:event" is not a known router event
      ctx.emit("typo:event", { wrong: true });

      expect(ctx).toBeDefined();
    });

    it("rejects wrong payload shape", () => {
      const ctx = createMockCtx();

      // @ts-expect-error -- payload should be { from, to }, not { wrong }
      ctx.emit("router:navigate", { wrong: true });

      expect(ctx).toBeDefined();
    });

    it("rejects missing payload fields", () => {
      const ctx = createMockCtx();

      // @ts-expect-error -- payload is missing "to" field
      ctx.emit("router:navigate", { from: "/" });

      expect(ctx).toBeDefined();
    });
  });
});
