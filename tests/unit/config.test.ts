import { describe, expect, it } from "vitest";
import { createCore } from "../../src/index";

describe("createConfig", () => {
  // Shared core for all tests
  const defaultGlobal = { debug: false, appName: "test-app", logLevel: "info" };

  /**
   * Helper: create a core with specific framework defaults.
   * @param config - Framework default global config.
   * @param plugins - Framework default plugins.
   * @returns Core API.
   */
  // biome-ignore lint/suspicious/noExplicitAny: test helper accepts any config shape and any plugins
  function makeCore(config: Record<string, any> = defaultGlobal, plugins: any[] = []) {
    return createCore("testFramework", { config, plugins });
  }

  // ===========================================================================
  // 1. Global config resolution (CONF-02)
  // ===========================================================================

  describe("global config resolution (CONF-02)", () => {
    it("returns frozen global config equal to framework defaults when no consumer overrides", () => {
      const core = makeCore();
      const result = core.createConfig();
      expect(result.global).toEqual({ debug: false, appName: "test-app", logLevel: "info" });
      expect(Object.isFrozen(result.global)).toBe(true);
    });

    it("consumer partial override merges with defaults", () => {
      const core = makeCore();
      const result = core.createConfig({ config: { debug: true } });
      expect(result.global).toEqual({ debug: true, appName: "test-app", logLevel: "info" });
    });

    it("shallow merge: nested objects are replaced, not deep-merged", () => {
      const core = makeCore({
        database: { host: "localhost", port: 5432 }
      });
      const result = core.createConfig({
        config: { database: { host: "prod.example.com" } }
      });
      // port is gone -- shallow merge replaces the entire nested object
      expect(result.global).toEqual({ database: { host: "prod.example.com" } });
    });

    it("global config is frozen: mutations do not take effect", () => {
      const core = makeCore();
      const result = core.createConfig();
      expect(() => {
        // biome-ignore lint/suspicious/noExplicitAny: testing mutation on frozen object
        (result.global as any).debug = true;
      }).toThrow();
    });

    it("consumer can override all fields", () => {
      const core = makeCore();
      const result = core.createConfig({
        config: { debug: true, appName: "overridden", logLevel: "debug" }
      });
      expect(result.global).toEqual({ debug: true, appName: "overridden", logLevel: "debug" });
    });

    it("empty consumer config {} preserves all defaults", () => {
      const core = makeCore();
      const result = core.createConfig({ config: {} });
      expect(result.global).toEqual(defaultGlobal);
    });

    it("calling createConfig() with no arguments uses framework defaults", () => {
      const core = makeCore();
      const result = core.createConfig();
      expect(result.global).toEqual(defaultGlobal);
    });
  });

  // ===========================================================================
  // 2. Per-plugin config resolution (CONF-03)
  // ===========================================================================

  describe("per-plugin config resolution (CONF-03)", () => {
    it("plugin with defaultConfig + no consumer config: resolved config equals defaultConfig, frozen", () => {
      const core = makeCore();
      const plugin = core.createPlugin("logger", {
        defaultConfig: { level: "info", prefix: "[app]" }
      });
      const result = core.createConfig({ plugins: [plugin] });
      const pluginConfig = result._pluginConfigs.get("logger");
      expect(pluginConfig).toEqual({ level: "info", prefix: "[app]" });
      expect(Object.isFrozen(pluginConfig)).toBe(true);
    });

    it("plugin with defaultConfig + consumer partial override: shallow merge, frozen", () => {
      const core = makeCore();
      const plugin = core.createPlugin("logger", {
        defaultConfig: { level: "info", prefix: "[app]" }
      });
      const result = core.createConfig({
        plugins: [plugin],
        pluginConfigs: { logger: { level: "debug" } }
      });
      const pluginConfig = result._pluginConfigs.get("logger");
      expect(pluginConfig).toEqual({ level: "debug", prefix: "[app]" });
      expect(Object.isFrozen(pluginConfig)).toBe(true);
    });

    it("plugin with defaultConfig + consumer full override: consumer values win", () => {
      const core = makeCore();
      const plugin = core.createPlugin("logger", {
        defaultConfig: { level: "info", prefix: "[app]" }
      });
      const result = core.createConfig({
        plugins: [plugin],
        pluginConfigs: { logger: { level: "error", prefix: "[err]" } }
      });
      expect(result._pluginConfigs.get("logger")).toEqual({ level: "error", prefix: "[err]" });
    });

    it("plugin without defaultConfig + consumer provides full config: resolved equals consumer config, frozen", () => {
      const core = makeCore();
      const plugin = core.createPlugin("router", {
        onCreate: () => {}
      });
      const result = core.createConfig({
        plugins: [plugin],
        pluginConfigs: { router: { basePath: "/", mode: "history" } }
      });
      const pluginConfig = result._pluginConfigs.get("router");
      expect(pluginConfig).toEqual({ basePath: "/", mode: "history" });
      expect(Object.isFrozen(pluginConfig)).toBe(true);
    });

    it("plugin with void config (no defaultConfig, no lifecycle using config): resolves to frozen {}", () => {
      const core = makeCore();
      const plugin = core.createPlugin("noop", {});
      const result = core.createConfig({ plugins: [plugin] });
      const pluginConfig = result._pluginConfigs.get("noop");
      expect(pluginConfig).toEqual({});
      expect(Object.isFrozen(pluginConfig)).toBe(true);
    });

    it("shallow merge for plugin config: nested object replaced, not deep-merged", () => {
      const core = makeCore();
      const plugin = core.createPlugin("db", {
        defaultConfig: { connection: { host: "localhost", port: 5432 }, pool: 10 }
      });
      const result = core.createConfig({
        plugins: [plugin],
        pluginConfigs: { db: { connection: { host: "prod.example.com" } } }
      });
      // pool is gone because shallow merge replaces at top level
      expect(result._pluginConfigs.get("db")).toEqual({
        connection: { host: "prod.example.com" },
        pool: 10
      });
    });

    it("each plugin resolved config is independently frozen", () => {
      const core = makeCore();
      const plugin1 = core.createPlugin("a", { defaultConfig: { x: 1 } });
      const plugin2 = core.createPlugin("b", { defaultConfig: { y: 2 } });
      const result = core.createConfig({ plugins: [plugin1, plugin2] });
      expect(Object.isFrozen(result._pluginConfigs.get("a"))).toBe(true);
      expect(Object.isFrozen(result._pluginConfigs.get("b"))).toBe(true);
    });
  });

  // ===========================================================================
  // 3. Runtime validation (CONF-04)
  // ===========================================================================

  describe("runtime validation (CONF-04)", () => {
    it("throws when plugin with onCreate requires config but none provided", () => {
      const core = makeCore();
      const plugin = core.createPlugin("auth", { onCreate: () => {} });
      expect(() => core.createConfig({ plugins: [plugin] })).toThrowError(
        'Plugin "auth" requires config (no defaultConfig)'
      );
    });

    it("throws when plugin with api requires config but none provided", () => {
      const core = makeCore();
      const plugin = core.createPlugin("auth", { api: () => ({}) });
      expect(() => core.createConfig({ plugins: [plugin] })).toThrowError(
        'Plugin "auth" requires config (no defaultConfig)'
      );
    });

    it("throws when plugin with createState requires config but none provided", () => {
      const core = makeCore();
      const plugin = core.createPlugin("auth", { createState: () => ({}) });
      expect(() => core.createConfig({ plugins: [plugin] })).toThrowError(
        'Plugin "auth" requires config (no defaultConfig)'
      );
    });

    it("throws when plugin with onInit requires config but none provided", () => {
      const core = makeCore();
      const plugin = core.createPlugin("auth", { onInit: () => {} });
      expect(() => core.createConfig({ plugins: [plugin] })).toThrowError(
        'Plugin "auth" requires config (no defaultConfig)'
      );
    });

    it("throws when plugin with onStart requires config but none provided", () => {
      const core = makeCore();
      const plugin = core.createPlugin("auth", { onStart: () => {} });
      expect(() => core.createConfig({ plugins: [plugin] })).toThrowError(
        'Plugin "auth" requires config (no defaultConfig)'
      );
    });

    it("fails on first missing required config (not collecting all errors)", () => {
      const core = makeCore();
      const plugin1 = core.createPlugin("auth", { onCreate: () => {} });
      const plugin2 = core.createPlugin("router", { onCreate: () => {} });
      expect(() => core.createConfig({ plugins: [plugin1, plugin2] })).toThrowError(
        'Plugin "auth"'
      );
      // Only the first error is thrown (auth appears before router)
    });

    it("plugin with defaultConfig but no consumer config does NOT throw (optional)", () => {
      const core = makeCore();
      const plugin = core.createPlugin("logger", {
        defaultConfig: { level: "info" },
        onCreate: () => {}
      });
      expect(() => core.createConfig({ plugins: [plugin] })).not.toThrow();
    });

    it("plugin with void config (no lifecycle methods) and no entry does NOT throw", () => {
      const core = makeCore();
      const plugin = core.createPlugin("noop", {});
      expect(() => core.createConfig({ plugins: [plugin] })).not.toThrow();
    });

    it("plugin with ONLY onStop/onDestroy (no config-receiving methods) and no entry does NOT throw", () => {
      const core = makeCore();
      const plugin = core.createPlugin("cleanup", {
        onStop: () => {},
        onDestroy: () => {}
      });
      expect(() => core.createConfig({ plugins: [plugin] })).not.toThrow();
    });

    it("plugin with ONLY hooks and no entry does NOT throw (heuristic limitation)", () => {
      const core = makeCore();
      const plugin = core.createPlugin("eventOnly", {
        hooks: { "app:start": () => {} }
      });
      expect(() => core.createConfig({ plugins: [plugin] })).not.toThrow();
    });

    it("error message includes plugin name and reason", () => {
      const core = makeCore();
      const plugin = core.createPlugin("myPlugin", { onCreate: () => {} });
      expect(() => core.createConfig({ plugins: [plugin] })).toThrowError(
        'Plugin "myPlugin" requires config (no defaultConfig). Provide config in pluginConfigs.'
      );
    });
  });

  // ===========================================================================
  // 4. createConfig options and AppConfig shape (CONF-01)
  // ===========================================================================

  describe("createConfig options and AppConfig shape (CONF-01)", () => {
    it("returns object with _brand: 'AppConfig'", () => {
      const core = makeCore();
      const result = core.createConfig();
      expect(result._brand).toBe("AppConfig");
    });

    it("accepts extra plugins via plugins option", () => {
      const core = makeCore();
      const extra = core.createPlugin("extra", {});
      const result = core.createConfig({ plugins: [extra] });
      expect(result._plugins).toHaveLength(1);
      expect(result._plugins.at(0)?.name).toBe("extra");
    });

    it("extra plugins appended after framework defaults", () => {
      const core = makeCore(defaultGlobal, []);
      const frameworkCore = createCore("fw", {
        config: {},
        plugins: [core.createPlugin("framework-plugin", {})]
      });
      const extra = frameworkCore.createPlugin("consumer-plugin", {});
      const result = frameworkCore.createConfig({ plugins: [extra] });
      expect(result._plugins.at(0)?.name).toBe("framework-plugin");
      expect(result._plugins.at(1)?.name).toBe("consumer-plugin");
    });

    it("extra plugins participate in config resolution", () => {
      const core = makeCore();
      const extra = core.createPlugin("extra", {
        defaultConfig: { enabled: true }
      });
      const result = core.createConfig({ plugins: [extra] });
      expect(result._pluginConfigs.get("extra")).toEqual({ enabled: true });
    });

    it("extra plugins validated: duplicate names detected via flatten/validate", () => {
      const core = makeCore();
      const plugin1 = core.createPlugin("dup", {});
      const plugin2 = core.createPlugin("dup", {});
      expect(() => core.createConfig({ plugins: [plugin1, plugin2] })).toThrowError(
        'Duplicate plugin name "dup"'
      );
    });

    it("unknown plugin names in pluginConfigs silently ignored", () => {
      const core = makeCore();
      const plugin = core.createPlugin("known", {
        defaultConfig: { x: 1 }
      });
      expect(() =>
        core.createConfig({
          plugins: [plugin],
          pluginConfigs: { known: { x: 2 }, unknownPlugin: { y: 3 } }
        })
      ).not.toThrow();
    });

    it("extra keys in plugin config objects pass through", () => {
      const core = makeCore();
      const plugin = core.createPlugin("db", {
        defaultConfig: { host: "localhost" }
      });
      const result = core.createConfig({
        plugins: [plugin],
        pluginConfigs: { db: { host: "prod", extraField: "bonus" } }
      });
      expect(result._pluginConfigs.get("db")).toEqual({
        host: "prod",
        extraField: "bonus"
      });
    });
  });

  // ===========================================================================
  // 5. Edge cases
  // ===========================================================================

  describe("edge cases", () => {
    it("no plugins at all: returns valid AppConfig", () => {
      const core = makeCore();
      const result = core.createConfig();
      expect(result._brand).toBe("AppConfig");
      expect(result._plugins).toEqual([]);
      expect(result._pluginConfigs.size).toBe(0);
    });

    it("framework has plugins, consumer adds none: only framework plugins resolved", () => {
      const baseCore = createCore("fw", {
        config: { debug: false },
        plugins: []
      });
      const fwPlugin = baseCore.createPlugin("fw-plugin", {
        defaultConfig: { mode: "standard" }
      });
      const fwCore = createCore("fw", {
        config: { debug: false },
        plugins: [fwPlugin]
      });
      const result = fwCore.createConfig();
      expect(result._plugins).toHaveLength(1);
      expect(result._plugins.at(0)?.name).toBe("fw-plugin");
      expect(result._pluginConfigs.get("fw-plugin")).toEqual({ mode: "standard" });
    });

    it("multiple plugins: mix of required, optional, and void configs", () => {
      const core = makeCore();
      const required = core.createPlugin("required", { onCreate: () => {} });
      const optional = core.createPlugin("optional", {
        defaultConfig: { x: 1 },
        onCreate: () => {}
      });
      const voidConfig = core.createPlugin("void", {});

      const result = core.createConfig({
        plugins: [required, optional, voidConfig],
        pluginConfigs: { required: { key: "value" } }
      });

      expect(result._pluginConfigs.get("required")).toEqual({ key: "value" });
      expect(result._pluginConfigs.get("optional")).toEqual({ x: 1 });
      expect(result._pluginConfigs.get("void")).toEqual({});
    });

    it("calling createConfig multiple times with same core returns independent AppConfigs", () => {
      const core = makeCore();
      const plugin = core.createPlugin("p", { defaultConfig: { x: 1 } });

      const result1 = core.createConfig({ plugins: [plugin] });
      const result2 = core.createConfig({
        plugins: [plugin],
        pluginConfigs: { p: { x: 99 } }
      });

      expect(result1._pluginConfigs.get("p")).toEqual({ x: 1 });
      expect(result2._pluginConfigs.get("p")).toEqual({ x: 99 });
      // They are independent
      expect(result1).not.toBe(result2);
    });

    it("component works the same as plugin for config resolution", () => {
      const core = makeCore();
      const comp = core.createComponent("sidebar", {
        defaultConfig: { position: "left" }
      });
      const result = core.createConfig({ plugins: [comp] });
      expect(result._pluginConfigs.get("sidebar")).toEqual({ position: "left" });
    });

    it("component that requires config throws same as plugin", () => {
      const core = makeCore();
      // onMount maps to onStart which is a config-receiving method
      const comp = core.createComponent("sidebar", {
        onMount: () => {}
      });
      expect(() => core.createConfig({ plugins: [comp] })).toThrowError(
        'Plugin "sidebar" requires config (no defaultConfig)'
      );
    });

    it("module children are flattened and participate in config resolution", () => {
      const core = makeCore();
      const plugin = core.createPlugin("inner", {
        defaultConfig: { nested: true }
      });
      const mod = core.createModule("mod", { plugins: [plugin] });
      const result = core.createConfig({ plugins: [mod] });
      expect(result._plugins).toHaveLength(1);
      expect(result._plugins.at(0)?.name).toBe("inner");
      expect(result._pluginConfigs.get("inner")).toEqual({ nested: true });
    });
  });
});
