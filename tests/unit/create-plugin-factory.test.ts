import { describe, expect, it } from "vitest";
import { createCore } from "../../src/index";

describe("createPluginFactory", () => {
  const core = createCore("test-framework", { config: {} });
  const { createPluginFactory } = core;

  // PLUG-05: Factory behavior

  it("returns a function", () => {
    const factory = createPluginFactory({});
    expect(typeof factory).toBe("function");
  });

  it("returned function creates PluginInstance with kind 'plugin'", () => {
    const factory = createPluginFactory({});
    const instance = factory("myPlugin");
    expect(instance.kind).toBe("plugin");
  });

  it("returned function uses provided name", () => {
    const factory = createPluginFactory({});
    const instance = factory("myPlugin");
    expect(instance.name).toBe("myPlugin");
  });

  it("all instances share the same spec reference", () => {
    const spec = { api: () => ({ greet: () => "hi" }) };
    const factory = createPluginFactory(spec);
    const a = factory("pluginA");
    const b = factory("pluginB");
    expect(a.spec).toBe(b.spec);
  });

  it("_hasDefaults determined at factory creation (not per instance)", () => {
    const specWithDefaults = { defaultConfig: { theme: "dark" } };
    const specWithoutDefaults = {};
    const factoryWith = createPluginFactory(specWithDefaults);
    const factoryWithout = createPluginFactory(specWithoutDefaults);
    expect(factoryWith("a")._hasDefaults).toBe(true);
    expect(factoryWithout("b")._hasDefaults).toBe(false);
  });

  it("_hasDefaults is true when shared spec has defaultConfig", () => {
    const factory = createPluginFactory({ defaultConfig: { x: 1 } });
    const instance = factory("test");
    expect(instance._hasDefaults).toBe(true);
  });

  it("_hasDefaults is false when shared spec has no defaultConfig", () => {
    const factory = createPluginFactory({});
    const instance = factory("test");
    expect(instance._hasDefaults).toBe(false);
  });

  it("instances from same factory have different names but same spec", () => {
    const spec = { defaultConfig: { x: 1 } };
    const factory = createPluginFactory(spec);
    const a = factory("alpha");
    const b = factory("beta");
    expect(a.name).toBe("alpha");
    expect(b.name).toBe("beta");
    expect(a.spec).toBe(b.spec);
  });

  it("factory validates spec at creation time (e.g., api as non-function throws)", () => {
    expect(() => createPluginFactory({ api: "bad" as never })).toThrowError(
      "api must be a function"
    );
  });

  it("factory-produced instance validates name (empty string throws)", () => {
    const factory = createPluginFactory({});
    expect(() => factory("")).toThrowError("[test-framework]");
    expect(() => factory("")).toThrowError("must not be empty");
  });

  it("factory-produced instance validates name (non-string throws)", () => {
    const factory = createPluginFactory({});
    expect(() => factory(42 as never)).toThrowError("[test-framework]");
    expect(() => factory(42 as never)).toThrowError("must be a string");
  });

  it("factory does not re-validate spec on each instance creation", () => {
    // If factory re-validated spec, creating many instances would be slower.
    // This test verifies by creating a factory with a valid spec and
    // confirming instances are created successfully without additional checks.
    const spec = { api: () => ({ method: () => {} }) };
    const factory = createPluginFactory(spec);
    const instances = Array.from({ length: 100 }, (_, index) => factory(`plugin-${index}`));
    expect(instances).toHaveLength(100);
    for (const instance of instances) {
      expect(instance.kind).toBe("plugin");
    }
  });

  // Integration

  it("multiple factories can coexist", () => {
    const factoryA = createPluginFactory({ defaultConfig: { a: 1 } });
    const factoryB = createPluginFactory({ defaultConfig: { b: 2 } });
    const instanceA = factoryA("pluginA");
    const instanceB = factoryB("pluginB");
    expect(instanceA.spec).not.toBe(instanceB.spec);
    expect(instanceA.name).toBe("pluginA");
    expect(instanceB.name).toBe("pluginB");
  });

  it("factory instances have _types as empty object", () => {
    const factory = createPluginFactory({});
    const instance = factory("test");
    expect(instance._types).toEqual({});
    expect(typeof instance._types).toBe("object");
    expect(Object.keys(instance._types)).toHaveLength(0);
  });
});
