/**
 * Env plugin — Nano tier.
 *
 * Environment detection: development, production, CI.
 * @see README.md
 */
import { createPlugin } from "../config";

/**
 * Env plugin configuration.
 * @example
 * ```typescript
 * { nodeEnv: "production", isCI: true }
 * ```
 */
export type EnvConfig = {
  /** Current Node environment string. */
  nodeEnv: string;
  /** Whether running in a CI environment. */
  isCI: boolean;
};

/**
 * Env plugin public API.
 * @example
 * ```typescript
 * app.env.isDev();  // true in development
 * app.env.isProd(); // true in production
 * app.env.isCI();   // true in CI environments
 * ```
 */
export type EnvApi = {
  /** Check if environment is development. */
  isDev: () => boolean;
  /** Check if environment is production. */
  isProd: () => boolean;
  /** Check if running in CI. */
  isCI: () => boolean;
};

export const envPlugin = createPlugin("env", {
  config: {
    nodeEnv: "development" as string,
    isCI: false
  },
  api: ctx => ({
    isDev: () => ctx.config.nodeEnv === "development",
    isProd: () => ctx.config.nodeEnv === "production",
    isCI: () => ctx.config.isCI
  })
});
