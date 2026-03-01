import { describe, expect, expectTypeOf, it } from "vitest";

import { coreConfig, createPlugin } from "../../../config";
import { counterPlugin } from "../..";

// ---------------------------------------------------------------------------
// Micro tier: counter plugin (config + createState + api, 30-80 lines)
// ---------------------------------------------------------------------------

const createTestApp = async (counterConfig?: Partial<{ initial: number; step: number }>) => {
  const { createApp } = coreConfig.createCore(coreConfig, {
    plugins: [counterPlugin]
  });
  if (counterConfig) {
    return createApp({ pluginConfigs: { counter: counterConfig } });
  }
  return createApp();
};

describe("micro tier: counter plugin", () => {
  // -------------------------------------------------------------------------
  // Runtime: state mutations
  // -------------------------------------------------------------------------

  describe("runtime: state mutations", () => {
    it("starts at initial value (default 0)", async () => {
      const app = await createTestApp();

      expect(app.counter.value()).toBe(0);
    });

    it("increment increases by step (default 1)", async () => {
      const app = await createTestApp();

      app.counter.increment();
      expect(app.counter.value()).toBe(1);

      app.counter.increment();
      expect(app.counter.value()).toBe(2);
    });

    it("decrement decreases by step", async () => {
      const app = await createTestApp();

      app.counter.decrement();
      expect(app.counter.value()).toBe(-1);
    });

    it("reset returns to initial value", async () => {
      const app = await createTestApp();

      app.counter.increment();
      app.counter.increment();
      app.counter.increment();
      expect(app.counter.value()).toBe(3);

      app.counter.reset();
      expect(app.counter.value()).toBe(0);
    });

    it("respects custom initial value", async () => {
      const app = await createTestApp({ initial: 10 });

      expect(app.counter.value()).toBe(10);

      app.counter.increment();
      expect(app.counter.value()).toBe(11);

      app.counter.reset();
      expect(app.counter.value()).toBe(10);
    });

    it("respects custom step value", async () => {
      const app = await createTestApp({ step: 5 });

      app.counter.increment();
      expect(app.counter.value()).toBe(5);

      app.counter.decrement();
      expect(app.counter.value()).toBe(0);
    });

    it("respects both custom initial and step", async () => {
      const app = await createTestApp({ initial: 100, step: 10 });

      expect(app.counter.value()).toBe(100);

      app.counter.increment();
      expect(app.counter.value()).toBe(110);

      app.counter.decrement();
      app.counter.decrement();
      expect(app.counter.value()).toBe(90);

      app.counter.reset();
      expect(app.counter.value()).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: encapsulation
  // -------------------------------------------------------------------------

  describe("runtime: encapsulation", () => {
    it("state is not exposed on app surface", async () => {
      const app = await createTestApp();

      // State is private — only API methods are on the surface
      expect((app.counter as Record<string, unknown>)["count"]).toBeUndefined();
      expect((app.counter as Record<string, unknown>)["_state"]).toBeUndefined();
    });

    it("plugin appears on app surface with all API methods", async () => {
      const app = await createTestApp();

      expect(typeof app.counter.increment).toBe("function");
      expect(typeof app.counter.decrement).toBe("function");
      expect(typeof app.counter.value).toBe("function");
      expect(typeof app.counter.reset).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // Types: API signatures
  // -------------------------------------------------------------------------

  describe("types: API signatures", () => {
    it("value returns number", async () => {
      const app = await createTestApp();

      expectTypeOf(app.counter.value).toEqualTypeOf<() => number>();
    });

    it("increment and decrement return void", async () => {
      const app = await createTestApp();

      expectTypeOf(app.counter.increment).toEqualTypeOf<() => void>();
      expectTypeOf(app.counter.decrement).toEqualTypeOf<() => void>();
    });

    it("reset returns void", async () => {
      const app = await createTestApp();

      expectTypeOf(app.counter.reset).toEqualTypeOf<() => void>();
    });

    it("plugin name is literal type", () => {
      expectTypeOf(counterPlugin.name).toEqualTypeOf<"counter">();
    });
  });

  // -------------------------------------------------------------------------
  // Types: state and config inference
  // -------------------------------------------------------------------------

  describe("types: state and config inference", () => {
    it("state.count is number", () => {
      createPlugin("counter-state-check", {
        createState: () => ({ count: 0 }),
        api: ctx => {
          expectTypeOf(ctx.state.count).toEqualTypeOf<number>();

          // @ts-expect-error -- nonExistent is not in state
          ctx.state.nonExistent;

          return {};
        }
      });
    });

    it("config fields are typed", () => {
      createPlugin("counter-config-check", {
        config: { initial: 0, step: 1 },
        api: ctx => {
          expectTypeOf(ctx.config.initial).toEqualTypeOf<number>();
          expectTypeOf(ctx.config.step).toEqualTypeOf<number>();

          return {};
        }
      });
    });

    it("state is private — not on app surface", async () => {
      const app = await createTestApp();

      // @ts-expect-error -- state is private, not exposed on app.counter
      app.counter._state;

      // @ts-expect-error -- count is state, not API
      app.counter.count;

      expect(app).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Types: pluginConfigs
  // -------------------------------------------------------------------------

  describe("types: pluginConfigs", () => {
    it("rejects wrong config value types", async () => {
      const { createApp } = coreConfig.createCore(coreConfig, {
        plugins: [counterPlugin]
      });

      const app = await createApp({
        pluginConfigs: {
          // @ts-expect-error -- initial must be number, not string
          counter: { initial: "wrong" }
        }
      });

      expect(app).toBeDefined();
    });
  });
});
