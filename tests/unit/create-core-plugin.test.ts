import { describe, expect, it } from "vitest";
import { createCoreConfig, createCorePlugin } from "../../src";
import { checkCorePluginConflicts, validateCorePlugins } from "../../src/utilities";

// ---------------------------------------------------------------------------
// createCorePlugin - name validation
// ---------------------------------------------------------------------------

describe("createCorePlugin - name validation", () => {
  it("accepts valid non-empty string name", () => {
    const plugin = createCorePlugin("log", { api: () => ({ info: () => {} }) });
    expect(plugin.name).toBe("log");
  });

  it("throws on empty string name", () => {
    expect(() => createCorePlugin("", {})).toThrow(TypeError);
    expect(() => createCorePlugin("", {})).toThrow("non-empty string");
  });

  it("throws on non-string name", () => {
    // @ts-expect-error -- testing runtime validation
    expect(() => createCorePlugin(123, {})).toThrow(TypeError);
    // @ts-expect-error -- testing runtime validation
    // eslint-disable-next-line unicorn/no-null -- testing runtime null rejection
    expect(() => createCorePlugin(null, {})).toThrow(TypeError);
    // @ts-expect-error -- testing runtime validation
    expect(() => createCorePlugin(undefined, {})).toThrow(TypeError);
  });

  it("throws on reserved name 'config'", () => {
    expect(() => createCorePlugin("config", {})).toThrow(TypeError);
    expect(() => createCorePlugin("config", {})).toThrow("reserved");
  });

  it("throws on reserved name 'start'", () => {
    expect(() => createCorePlugin("start", {})).toThrow("reserved");
  });

  it("throws on reserved name 'emit'", () => {
    expect(() => createCorePlugin("emit", {})).toThrow("reserved");
  });

  it("throws on reserved name 'global'", () => {
    expect(() => createCorePlugin("global", {})).toThrow("reserved");
  });

  it("throws on reserved name 'state'", () => {
    expect(() => createCorePlugin("state", {})).toThrow("reserved");
  });

  it("throws on reserved name '__proto__'", () => {
    expect(() => createCorePlugin("__proto__", {})).toThrow("reserved");
  });
});

// ---------------------------------------------------------------------------
// createCorePlugin - spec validation
// ---------------------------------------------------------------------------

describe("createCorePlugin - spec validation", () => {
  it("throws on non-object spec", () => {
    // @ts-expect-error -- testing runtime validation
    expect(() => createCorePlugin("bad", 42)).toThrow(TypeError);
    // @ts-expect-error -- testing runtime validation
    expect(() => createCorePlugin("bad", 42)).toThrow("invalid spec");
  });

  it("throws on null spec", () => {
    // @ts-expect-error -- testing runtime validation
    // eslint-disable-next-line unicorn/no-null -- testing runtime null rejection
    expect(() => createCorePlugin("bad", null)).toThrow(TypeError);
  });

  it("throws on array spec", () => {
    // @ts-expect-error -- testing runtime validation
    expect(() => createCorePlugin("bad", [])).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// createCorePlugin - forbidden fields
// ---------------------------------------------------------------------------

describe("createCorePlugin - forbidden fields", () => {
  it("throws when spec contains 'depends'", () => {
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        depends: []
      })
    ).toThrow(TypeError);
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        depends: []
      })
    ).toThrow('cannot have "depends"');
  });

  it("throws when spec contains 'events'", () => {
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        events: () => ({})
      })
    ).toThrow(TypeError);
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        events: () => ({})
      })
    ).toThrow('cannot have "events"');
  });

  it("throws when spec contains 'hooks'", () => {
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        hooks: () => ({})
      })
    ).toThrow(TypeError);
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        hooks: () => ({})
      })
    ).toThrow('cannot have "hooks"');
  });
});

// ---------------------------------------------------------------------------
// createCorePlugin - callback validation
// ---------------------------------------------------------------------------

describe("createCorePlugin - callback validation", () => {
  it("accepts valid function for api", () => {
    const plugin = createCorePlugin("valid", {
      api: () => ({ info: () => {} })
    });
    expect(plugin.name).toBe("valid");
  });

  it("accepts valid function for createState", () => {
    const plugin = createCorePlugin("valid", {
      createState: () => ({ count: 0 })
    });
    expect(plugin.name).toBe("valid");
  });

  it("accepts valid function for onInit", () => {
    const plugin = createCorePlugin("valid", { onInit: () => {} });
    expect(plugin.name).toBe("valid");
  });

  it("accepts valid function for onStart", () => {
    const plugin = createCorePlugin("valid", { onStart: () => {} });
    expect(plugin.name).toBe("valid");
  });

  it("accepts valid function for onStop", () => {
    const plugin = createCorePlugin("valid", { onStop: () => {} });
    expect(plugin.name).toBe("valid");
  });

  it("throws on non-function api", () => {
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        api: "not a function"
      })
    ).toThrow(TypeError);
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        api: "not a function"
      })
    ).toThrow("invalid api");
  });

  it("throws on non-function createState", () => {
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        createState: { count: 0 }
      })
    ).toThrow(TypeError);
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        createState: { count: 0 }
      })
    ).toThrow("invalid createState");
  });

  it("throws on non-function onInit", () => {
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        onInit: 42
      })
    ).toThrow(TypeError);
  });

  it("throws on non-function onStart", () => {
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        onStart: {}
      })
    ).toThrow(TypeError);
  });

  it("throws on non-function onStop", () => {
    expect(() =>
      createCorePlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        onStop: []
      })
    ).toThrow(TypeError);
  });

  it("accepts undefined lifecycle methods (optional)", () => {
    const plugin = createCorePlugin("minimal", {});
    expect(plugin.name).toBe("minimal");
  });
});

// ---------------------------------------------------------------------------
// createCorePlugin - return value (CorePluginInstance shape)
// ---------------------------------------------------------------------------

describe("createCorePlugin - return value", () => {
  it("returns an object with name, spec, _corePlugin, _phantom", () => {
    const plugin = createCorePlugin("log", {
      config: { level: "info" }
    });

    expect(plugin).toHaveProperty("name");
    expect(plugin).toHaveProperty("spec");
    expect(plugin).toHaveProperty("_corePlugin");
    expect(plugin).toHaveProperty("_phantom");
    expect(plugin.name).toBe("log");
  });

  it("_corePlugin brand is true", () => {
    const plugin = createCorePlugin("log", {});
    expect(plugin._corePlugin).toBe(true);
  });

  it("spec retains all provided fields", () => {
    const plugin = createCorePlugin("full", {
      config: { x: 1 },
      createState: () => ({ count: 0 }),
      api: ctx => ({ get: () => ctx.state.count }),
      onInit: () => {},
      onStart: () => {},
      onStop: () => {}
    });

    expect(plugin.spec.config).toEqual({ x: 1 });
    expect(typeof plugin.spec.createState).toBe("function");
    expect(typeof plugin.spec.api).toBe("function");
    expect(typeof plugin.spec.onInit).toBe("function");
    expect(typeof plugin.spec.onStart).toBe("function");
    expect(typeof plugin.spec.onStop).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// validateCorePlugins - reserved names + duplicates
// ---------------------------------------------------------------------------

describe("validateCorePlugins", () => {
  it("throws on reserved core plugin name", () => {
    createCorePlugin("log", {});
    // Manually construct a bad one for testing (bypassing createCorePlugin's own validation)
    const bad = { name: "start", spec: {}, _corePlugin: true as const, _phantom: {} };

    expect(() => validateCorePlugins("test", [bad as never])).toThrow("reserved");
  });

  it("throws on duplicate core plugin names", () => {
    const a = createCorePlugin("log", {});
    const b = createCorePlugin("log", {});

    expect(() => validateCorePlugins("test", [a, b])).toThrow("Duplicate");
  });

  it("passes with unique valid names", () => {
    const a = createCorePlugin("log", {});
    const b = createCorePlugin("env", {});

    expect(() => validateCorePlugins("test", [a, b])).not.toThrow();
  });

  it("passes with empty list", () => {
    expect(() => validateCorePlugins("test", [])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// checkCorePluginConflicts - core vs regular name collision
// ---------------------------------------------------------------------------

describe("checkCorePluginConflicts", () => {
  it("throws when regular plugin name conflicts with core plugin", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });
    const regular = cc.createPlugin("log", {});
    const coreNames = new Set(["log", "env"]);

    expect(() => checkCorePluginConflicts("test", [regular], coreNames)).toThrow(TypeError);
    expect(() => checkCorePluginConflicts("test", [regular], coreNames)).toThrow(
      "conflicts with core plugin"
    );
  });

  it("passes when no name conflicts", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });
    const regular = cc.createPlugin("router", {});
    const coreNames = new Set(["log", "env"]);

    expect(() => checkCorePluginConflicts("test", [regular], coreNames)).not.toThrow();
  });
});
