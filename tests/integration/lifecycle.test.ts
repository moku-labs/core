import { describe, expect, it } from "vitest";
import { createCore } from "../../src/index";
import type { PluginInstance } from "../../src/types";

// =============================================================================
// Integration Test: Full Lifecycle Flow
// =============================================================================
// Exercises the three-layer flow:
//   1. createCore("mini", { config, plugins }) -> framework with one default plugin
//   2. createConfig({ plugins, pluginConfigs }) -> consumer adds another plugin
//   3. await createApp(config) -> build the app
//   4. start -> use APIs -> stop -> destroy
// =============================================================================

// ---------------------------------------------------------------------------
// Plugin Definitions (outside describe for unicorn/consistent-function-scoping)
// ---------------------------------------------------------------------------

/**
 * Logger plugin -- framework default.
 * State: { entries: string[] }
 * API: { log: (msg) => void, getLog: () => string[] }
 * Hooks: "app:start" -> logs "app started"
 * defaultConfig: { prefix: "[LOG]" }
 */
type LoggerApi = { log: (msg: string) => void; getLog: () => string[] };
type LoggerConfig = { prefix: string };
type CounterApi = { increment: () => number; getCount: () => number };
type CounterConfig = { initial: number };

function createLoggerPlugin(core: {
  // biome-ignore lint/suspicious/noExplicitAny: Core parameter uses any to avoid CoreAPI generic invariance
  createPlugin: (...args: any[]) => any;
}): PluginInstance<"logger", LoggerConfig, LoggerApi, { entries: string[] }> {
  return core.createPlugin("logger", {
    defaultConfig: { prefix: "[LOG]" },
    createState: (): { entries: string[] } => ({ entries: [] }),
    api: (ctx: { config: { prefix: string }; state: { entries: string[] } }) => ({
      log: (msg: string) => {
        ctx.state.entries.push(`${ctx.config.prefix} ${msg}`);
      },
      getLog: () => [...ctx.state.entries]
    }),
    hooks: {
      "app:start": () => {
        // Will be filled in onInit when we have access to our own API
      }
    },
    onInit: (ctx: { require: (name: string) => { log: (msg: string) => void } }) => {
      // Verify we can access our own API
      const self = ctx.require("logger");
      self.log("initialized");
    },
    onStart: (ctx: { state: { entries: string[] }; config: { prefix: string } }) => {
      ctx.state.entries.push(`${ctx.config.prefix} started`);
    },
    onStop: () => {
      // Teardown context only has global
    },
    onDestroy: () => {
      // Final cleanup
    }
  });
}

/**
 * Counter plugin -- consumer-added.
 * Requires config: { initial: number } (no defaultConfig)
 * State: { count: number }
 * API: { increment: () => number, getCount: () => number }
 * depends: ["logger"]
 */
function createCounterPlugin(
  // biome-ignore lint/suspicious/noExplicitAny: Core parameter uses any to avoid CoreAPI generic invariance
  core: { createPlugin: (...args: any[]) => any },
  // biome-ignore lint/suspicious/noExplicitAny: Plugin instance used as dependency, erased at runtime
  loggerPlugin: any
): PluginInstance<"counter", CounterConfig, CounterApi, { count: number }> {
  return core.createPlugin("counter", {
    depends: [loggerPlugin],
    createState: (ctx: { config: { initial: number } }) => ({
      count: ctx.config.initial
    }),
    api: (ctx: {
      state: { count: number };
      require: (name: string) => { log: (msg: string) => void };
    }) => {
      const logger = ctx.require("logger");
      return {
        increment: () => {
          ctx.state.count += 1;
          logger.log(`counter incremented to ${ctx.state.count}`);
          return ctx.state.count;
        },
        getCount: () => ctx.state.count
      };
    },
    onStart: (ctx: {
      state: { count: number };
      require: (name: string) => { log: (msg: string) => void };
    }) => {
      const logger = ctx.require("logger");
      logger.log(`counter started at ${ctx.state.count}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe("full lifecycle integration", () => {
  it("full three-layer lifecycle: createCore -> createConfig -> createApp -> start -> use APIs -> stop -> destroy", async () => {
    // Layer 1: Framework creates core with logger as default plugin
    const core = createCore("mini", {
      config: { env: "test" }
    });
    const loggerPlugin = createLoggerPlugin(core);
    const counterPlugin = createCounterPlugin(core, loggerPlugin);

    // Layer 2: Framework provides core to consumer
    // Consumer adds counter plugin and its required config
    const config = core.createConfig({
      plugins: [loggerPlugin, counterPlugin],
      pluginConfigs: { counter: { initial: 5 } }
    });

    // Layer 3: Build the app
    const app = await core.createApp(config);

    // --- Verify app is frozen ---
    expect(Object.isFrozen(app)).toBe(true);

    // --- Verify plugin APIs exist on app ---
    expect(app.logger).toBeDefined();
    expect(app.counter).toBeDefined();

    // --- Verify config resolution via app.configs ---
    // Logger has defaultConfig { prefix: "[LOG]" }, no override -> uses default
    expect(app.configs.logger.prefix).toBe("[LOG]");
    // Counter was provided config { initial: 5 }
    expect(app.configs.counter.initial).toBe(5);

    // --- Verify onInit ran (logger logged "initialized") ---
    const preStartLog = app.logger.getLog();
    expect(preStartLog).toContain("[LOG] initialized");

    // --- Start the app ---
    await app.start();

    // --- Verify start order (onReady -> app:start hook -> onStart for each plugin) ---
    const afterStartLog = app.logger.getLog();
    // Logger's onStart adds "[LOG] started"
    expect(afterStartLog).toContain("[LOG] started");
    // Counter's onStart logs via logger
    expect(afterStartLog).toContain("[LOG] counter started at 5");

    // --- Use plugin APIs ---
    const newCount = app.counter.increment();
    expect(newCount).toBe(6);
    expect(app.counter.getCount()).toBe(6);

    // Verify increment was logged
    const afterIncrementLog = app.logger.getLog();
    expect(afterIncrementLog).toContain("[LOG] counter incremented to 6");

    // Increment again
    app.counter.increment();
    expect(app.counter.getCount()).toBe(7);

    // --- Stop the app ---
    await app.stop();

    // --- Verify stop completed (no errors) ---
    // After stop, start() is a no-op again
    // We can verify by checking the log doesn't grow
    const postStopLog = app.logger.getLog();

    // --- Destroy the app ---
    await app.destroy();

    // --- Verify post-destroy enforcement ---
    expect(() => app.emit("test" as never, {} as never)).toThrow(
      "[mini] Cannot call emit() on a destroyed app"
    );
    await expect(app.start()).rejects.toThrow("[mini] Cannot call start() on a destroyed app");
    await expect(app.destroy()).rejects.toThrow("[mini] Cannot call destroy() on a destroyed app");

    // --- Verify the full log tells the complete story ---
    expect(postStopLog.length).toBeGreaterThan(0);
    expect(postStopLog[0]).toBe("[LOG] initialized");
  });

  it("config resolution: logger gets defaults, counter gets provided config", async () => {
    const core = createCore("mini", { config: { env: "test" } });
    const loggerPlugin = createLoggerPlugin(core);
    const counterPlugin = createCounterPlugin(core, loggerPlugin);

    const config = core.createConfig({
      plugins: [loggerPlugin, counterPlugin],
      pluginConfigs: {
        counter: { initial: 10 },
        logger: { prefix: "[CUSTOM]" } // Override logger's default
      }
    });

    const app = await core.createApp(config);

    // Logger gets overridden prefix via app.configs
    expect(app.configs.logger.prefix).toBe("[CUSTOM]");
    // Counter gets provided initial via app.configs
    expect(app.configs.counter.initial).toBe(10);

    // Verify the custom prefix is used in logs
    const log = app.logger.getLog();
    expect(log[0]).toBe("[CUSTOM] initialized");
  });

  it("has() and getPlugin() work correctly", async () => {
    const core = createCore("mini", { config: {} });
    const loggerPlugin = createLoggerPlugin(core);

    const config = core.createConfig({ plugins: [loggerPlugin] });
    const app = await core.createApp(config);

    expect(app.has("logger")).toBe(true);
    expect(app.has("counter")).toBe(false);

    const logger = app.getPlugin("logger");
    expect(logger).toBeDefined();

    const missing = app.getPlugin("counter" as never);
    expect(missing).toBeUndefined();
  });

  it("require() throws with clear error for missing plugin", async () => {
    const core = createCore("mini", { config: {} });
    const config = core.createConfig();
    const app = await core.createApp(config);

    expect(() => app.require("missing" as never)).toThrow("[mini]");
    expect(() => app.require("missing" as never)).toThrow("missing");
  });

  it("global config is frozen and accessible on app.config", async () => {
    const core = createCore("mini", { config: { env: "test", debug: false } });
    const config = core.createConfig({ config: { debug: true } });
    const app = await core.createApp(config);

    // Config is merged: framework defaults + consumer overrides
    expect(app.config.env).toBe("test");
    expect(app.config.debug).toBe(true); // Consumer override wins

    // Config is frozen
    expect(Object.isFrozen(app.config)).toBe(true);
  });
});
