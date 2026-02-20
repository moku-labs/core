import { describe, expect, it } from "vitest";
import { createCore } from "../../src/index";

describe("createPlugin", () => {
  const core = createCore("test-framework", { config: {} });
  const { createPlugin } = core;

  // PLUG-01: Returns PluginInstance shape

  it("returns object with kind 'plugin'", () => {
    const plugin = createPlugin("router", {});
    expect(plugin.kind).toBe("plugin");
  });

  it("returns object with the provided name", () => {
    const plugin = createPlugin("router", {});
    expect(plugin.name).toBe("router");
  });

  it("returns object with the provided spec", () => {
    const spec = { defaultConfig: { basePath: "/" } };
    const plugin = createPlugin("router", spec);
    expect(plugin.spec).toBe(spec);
  });

  it("returns object with _types as empty object", () => {
    const plugin = createPlugin("router", {});
    expect(plugin._types).toEqual({});
  });

  it("_types is an empty object (not undefined, not null)", () => {
    const plugin = createPlugin("router", {});
    expect(plugin._types).toBeDefined();
    expect(plugin._types).not.toBeNull();
    expect(typeof plugin._types).toBe("object");
    expect(Object.keys(plugin._types)).toHaveLength(0);
  });

  // PLUG-02: _hasDefaults detection

  it("_hasDefaults is true when spec has defaultConfig property", () => {
    const plugin = createPlugin("router", { defaultConfig: { basePath: "/" } });
    expect(plugin._hasDefaults).toBe(true);
  });

  it("_hasDefaults is true even when defaultConfig is undefined (in operator, not truthiness)", () => {
    const plugin = createPlugin("router", { defaultConfig: undefined });
    expect(plugin._hasDefaults).toBe(true);
  });

  it("_hasDefaults is false when spec has no defaultConfig property", () => {
    const plugin = createPlugin("router", {});
    expect(plugin._hasDefaults).toBe(false);
  });

  // PLUG-06: Async lifecycle acceptance (runtime -- functions that return promises are accepted)

  it("accepts spec with async createState (returns Promise)", () => {
    const plugin = createPlugin("router", {
      createState: async () => ({ count: 0 })
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with async onCreate", () => {
    const plugin = createPlugin("router", {
      onCreate: async () => {}
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with async api", () => {
    const plugin = createPlugin("router", {
      api: async () => ({ navigate: () => {} })
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with async onInit", () => {
    const plugin = createPlugin("router", {
      onInit: async () => {}
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with async onStart", () => {
    const plugin = createPlugin("router", {
      onStart: async () => {}
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with async onStop", () => {
    const plugin = createPlugin("router", {
      onStop: async () => {}
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with async onDestroy", () => {
    const plugin = createPlugin("router", {
      onDestroy: async () => {}
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with all sync lifecycle methods", () => {
    const plugin = createPlugin("router", {
      createState: () => ({}),
      onCreate: () => {},
      api: () => ({ navigate: () => {} }),
      onInit: () => {},
      onStart: () => {},
      onStop: () => {},
      onDestroy: () => {}
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with hooks object", () => {
    const plugin = createPlugin("router", {
      hooks: { "app:start": () => {} }
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with depends array", () => {
    const loggerRef = createPlugin("logger", {});
    const plugin = createPlugin("router", {
      depends: [loggerRef]
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts spec with plugins array (sub-plugins)", () => {
    const sub = createPlugin("sub", {});
    const plugin = createPlugin("router", {
      plugins: [sub]
    });
    expect(plugin.kind).toBe("plugin");
  });

  it("accepts minimal spec (empty object)", () => {
    const plugin = createPlugin("router", {});
    expect(plugin.kind).toBe("plugin");
    expect(plugin.name).toBe("router");
  });

  it("accepts spec with only defaultConfig", () => {
    const plugin = createPlugin("router", {
      defaultConfig: { basePath: "/" }
    });
    expect(plugin.kind).toBe("plugin");
    expect(plugin._hasDefaults).toBe(true);
  });

  // Validation errors

  it("throws when name is empty string (with actionable error message)", () => {
    expect(() => createPlugin("", {})).toThrowError("[test-framework]");
    expect(() => createPlugin("", {})).toThrowError("must not be empty");
  });

  it("throws when name is not a string (number)", () => {
    expect(() => createPlugin(42 as never, {})).toThrowError("[test-framework]");
    expect(() => createPlugin(42 as never, {})).toThrowError("must be a string");
  });

  it("throws when name is not a string (null)", () => {
    // eslint-disable-next-line unicorn/no-null -- testing null rejection at runtime
    const nullValue = null;
    expect(() => createPlugin(nullValue as never, {})).toThrowError("[test-framework]");
    expect(() => createPlugin(nullValue as never, {})).toThrowError("must be a string");
  });

  it("throws when name is not a string (undefined)", () => {
    expect(() => createPlugin(undefined as never, {})).toThrowError("[test-framework]");
    expect(() => createPlugin(undefined as never, {})).toThrowError("must be a string");
  });

  it("error message includes framework name in brackets", () => {
    expect(() => createPlugin("", {})).toThrowError("[test-framework]");
  });

  it("error message includes actionable suggestion on second line", () => {
    try {
      createPlugin("", {});
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("\n  ");
      expect(message).toContain("Pass a non-empty string");
    }
  });

  it("throws when api is not a function", () => {
    expect(() => createPlugin("router", { api: "bad" as never })).toThrowError(
      "api must be a function"
    );
  });

  it("throws when createState is not a function", () => {
    expect(() => createPlugin("router", { createState: 42 as never })).toThrowError(
      "createState must be a function"
    );
  });

  it("throws when onCreate is not a function (e.g., string)", () => {
    expect(() => createPlugin("router", { onCreate: "bad" as never })).toThrowError(
      "onCreate must be a function"
    );
  });

  it("throws when onInit is not a function", () => {
    expect(() => createPlugin("router", { onInit: true as never })).toThrowError(
      "onInit must be a function"
    );
  });

  it("throws when onStart is not a function", () => {
    expect(() => createPlugin("router", { onStart: {} as never })).toThrowError(
      "onStart must be a function"
    );
  });

  it("throws when onStop is not a function", () => {
    expect(() => createPlugin("router", { onStop: [] as never })).toThrowError(
      "onStop must be a function"
    );
  });

  it("throws when onDestroy is not a function", () => {
    expect(() => createPlugin("router", { onDestroy: 0 as never })).toThrowError(
      "onDestroy must be a function"
    );
  });

  it("throws when hooks is not an object (e.g., string)", () => {
    expect(() => createPlugin("router", { hooks: "bad" as never })).toThrowError(
      "hooks must be a plain object"
    );
  });

  it("throws when hooks is an array (arrays are not valid hooks)", () => {
    expect(() => createPlugin("router", { hooks: [] as never })).toThrowError(
      "hooks must be a plain object"
    );
  });

  it("throws when hooks is null", () => {
    // eslint-disable-next-line unicorn/no-null -- testing null rejection at runtime
    const nullHooks = null;
    expect(() => createPlugin("router", { hooks: nullHooks as never })).toThrowError(
      "hooks must be a plain object"
    );
  });

  it("does not throw when hooks is a plain object with function values", () => {
    expect(() =>
      createPlugin("router", {
        hooks: { "app:start": () => {}, "app:stop": () => {} }
      })
    ).not.toThrow();
  });
});
