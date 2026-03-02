import { describe, expect, expectTypeOf, it } from "vitest";

import { coreConfig, createPlugin } from "../../../config";
import { envPlugin } from "../..";

// ---------------------------------------------------------------------------
// Nano tier: env plugin (config + api, < 30 lines)
// ---------------------------------------------------------------------------

const createTestApp = async (envConfig?: Partial<{ nodeEnv: string; isCI: boolean }>) => {
  const { createApp } = coreConfig.createCore(coreConfig, {
    plugins: [envPlugin]
  });
  if (envConfig) {
    return createApp({ pluginConfigs: { env: envConfig } });
  }
  return createApp();
};

describe("nano tier: env plugin", () => {
  // -------------------------------------------------------------------------
  // Runtime: API behavior
  // -------------------------------------------------------------------------

  describe("runtime: API behavior", () => {
    it("returns development defaults", async () => {
      const app = await createTestApp();

      expect(app.env.isDev()).toBe(true);
      expect(app.env.isProd()).toBe(false);
      expect(app.env.isCI()).toBe(false);
    });

    it("respects config overrides for production", async () => {
      const app = await createTestApp({ nodeEnv: "production" });

      expect(app.env.isDev()).toBe(false);
      expect(app.env.isProd()).toBe(true);
    });

    it("respects config overrides for CI", async () => {
      const app = await createTestApp({ isCI: true });

      expect(app.env.isCI()).toBe(true);
    });

    it("plugin appears on app surface", async () => {
      const app = await createTestApp();

      expect(app.env).toBeDefined();
      expect(typeof app.env.isDev).toBe("function");
      expect(typeof app.env.isProd).toBe("function");
      expect(typeof app.env.isCI).toBe("function");
    });

    it("app is frozen", async () => {
      const app = await createTestApp();

      expect(Object.isFrozen(app)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Types: API signatures
  // -------------------------------------------------------------------------

  describe("types: API signatures", () => {
    it("API methods return boolean", async () => {
      const app = await createTestApp();

      expectTypeOf(app.env.isDev).toEqualTypeOf<() => boolean>();
      expectTypeOf(app.env.isProd).toEqualTypeOf<() => boolean>();
      expectTypeOf(app.env.isCI).toEqualTypeOf<() => boolean>();
    });

    it("plugin name is literal type", () => {
      expectTypeOf(envPlugin.name).toEqualTypeOf<"env">();
    });

    it("config types are inferred correctly", () => {
      createPlugin("env-type-check", {
        config: { nodeEnv: "test" as string, isCI: true },
        api: ctx => {
          expectTypeOf(ctx.config.nodeEnv).toEqualTypeOf<string>();
          expectTypeOf(ctx.config.isCI).toEqualTypeOf<boolean>();

          // @ts-expect-error -- nonExistent is not in config
          ctx.config.nonExistent;

          return {};
        }
      });
    });

    it("rejects nonexistent API methods on app surface", async () => {
      const app = await createTestApp();

      // @ts-expect-error -- nonExistent is not in env API
      app.env.nonExistent;

      expect(app).toBeDefined();
    });

    it("rejects nonexistent plugins on app surface", async () => {
      const app = await createTestApp();

      // @ts-expect-error -- "fake" is not a registered plugin
      app.fake;

      expect(app).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Types: pluginConfigs
  // -------------------------------------------------------------------------

  describe("types: pluginConfigs", () => {
    it("accepts valid config overrides", async () => {
      const { createApp } = coreConfig.createCore(coreConfig, {
        plugins: [envPlugin]
      });

      const app = createApp({
        pluginConfigs: { env: { nodeEnv: "production" } }
      });

      expect(app).toBeDefined();
    });

    it("rejects wrong config value types", async () => {
      const { createApp } = coreConfig.createCore(coreConfig, {
        plugins: [envPlugin]
      });

      const app = createApp({
        pluginConfigs: {
          // @ts-expect-error -- nodeEnv must be string, not number
          env: { nodeEnv: 123 }
        }
      });

      expect(app).toBeDefined();
    });
  });
});
