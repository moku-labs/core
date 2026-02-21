import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// Shared setup: createCoreConfig with empty generics
// ---------------------------------------------------------------------------

function setup(frameworkId = "test") {
  const cc = createCoreConfig<Record<string, never>, Record<string, never>>(frameworkId, {
    config: {}
  });
  return cc;
}

// ---------------------------------------------------------------------------
// createPlugin - name validation
// ---------------------------------------------------------------------------

describe("createPlugin - name validation", () => {
  it("accepts valid non-empty string name", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {});
    expect(plugin.name).toBe("router");
  });

  it("throws on empty string name", () => {
    const { createPlugin } = setup();

    expect(() => createPlugin("", {})).toThrow(TypeError);
    expect(() => createPlugin("", {})).toThrow("non-empty string");
  });

  it("throws on non-string name", () => {
    const { createPlugin } = setup();

    // @ts-expect-error -- testing runtime validation
    expect(() => createPlugin(123, {})).toThrow(TypeError);
    // @ts-expect-error -- testing runtime validation
    // eslint-disable-next-line unicorn/no-null -- testing runtime null rejection
    expect(() => createPlugin(null, {})).toThrow(TypeError);
    // @ts-expect-error -- testing runtime validation
    expect(() => createPlugin(undefined, {})).toThrow(TypeError);
  });

  it("error includes framework id in message", () => {
    const { createPlugin } = setup("my-framework");

    expect(() => createPlugin("", {})).toThrow("[my-framework]");
  });
});

// ---------------------------------------------------------------------------
// createPlugin - lifecycle validation
// ---------------------------------------------------------------------------

describe("createPlugin - lifecycle validation", () => {
  it("accepts valid function for onInit", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("valid", {
      onInit: () => {}
    });
    expect(plugin.name).toBe("valid");
  });

  it("accepts valid function for onStart", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("valid", {
      onStart: () => {}
    });
    expect(plugin.name).toBe("valid");
  });

  it("accepts valid function for onStop", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("valid", {
      onStop: () => {}
    });
    expect(plugin.name).toBe("valid");
  });

  it("throws on non-function onInit", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        onInit: "not a function"
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        onInit: "not a function"
      })
    ).toThrow("invalid onInit");
  });

  it("throws on non-function onStart", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        onStart: 42
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        onStart: 42
      })
    ).toThrow("invalid onStart");
  });

  it("throws on non-function onStop", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        onStop: {}
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        onStop: {}
      })
    ).toThrow("invalid onStop");
  });

  it("accepts undefined lifecycle methods (optional)", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("minimal", {});
    expect(plugin.name).toBe("minimal");
  });
});

// ---------------------------------------------------------------------------
// createPlugin - hooks validation
// ---------------------------------------------------------------------------

describe("createPlugin - hooks validation", () => {
  it("accepts valid hooks object", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("valid", {
      hooks: {
        "some:event": () => {}
      }
    });
    expect(plugin.name).toBe("valid");
  });

  it("throws on non-object hooks", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        hooks: "not an object"
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        hooks: "not an object"
      })
    ).toThrow("invalid hooks");
  });

  it("throws on null hooks", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        // eslint-disable-next-line unicorn/no-null -- testing runtime null rejection
        hooks: null
      })
    ).toThrow(TypeError);
  });

  it("throws on non-function hook handler", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        hooks: {
          // @ts-expect-error -- testing runtime validation
          "some:event": "not a function"
        }
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        hooks: {
          // @ts-expect-error -- testing runtime validation
          "some:event": "not a function"
        }
      })
    ).toThrow('invalid hook for "some:event"');
  });
});

// ---------------------------------------------------------------------------
// createPlugin - return value (PluginInstance shape)
// ---------------------------------------------------------------------------

describe("createPlugin - return value", () => {
  it("returns an object with name and spec", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {
      defaultConfig: { basePath: "/" }
    });

    expect(plugin).toHaveProperty("name");
    expect(plugin).toHaveProperty("spec");
    expect(plugin.name).toBe("router");
  });

  it("carries _phantom field for type inference", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {
      defaultConfig: { basePath: "/" }
    });

    expect(plugin).toHaveProperty("_phantom");
  });

  it("spec retains all provided fields", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("full", {
      defaultConfig: { x: 1 },
      onInit: () => {},
      onStart: () => {},
      onStop: () => {},
      hooks: { "some:event": () => {} }
    });

    expect(plugin.spec.defaultConfig).toEqual({ x: 1 });
    expect(typeof plugin.spec.onInit).toBe("function");
    expect(typeof plugin.spec.onStart).toBe("function");
    expect(typeof plugin.spec.onStop).toBe("function");
    expect(plugin.spec.hooks).toBeDefined();
  });

  it("name is inferred as string literal type", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {});

    // Runtime check: name is the exact string
    expect(plugin.name).toBe("router");
  });
});

// ---------------------------------------------------------------------------
// createPlugin - sub-plugins
// ---------------------------------------------------------------------------

describe("createPlugin - sub-plugins", () => {
  it("accepts plugins array in spec", () => {
    const { createPlugin } = setup();

    const child = createPlugin("child", {});
    const parent = createPlugin("parent", {
      plugins: [child]
    });

    expect(parent.spec.plugins).toHaveLength(1);
    expect(parent.spec.plugins?.[0]).toBe(child);
  });

  it("accepts depends array in spec", () => {
    const { createPlugin } = setup();

    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", {
      depends: [dep] as const
    });

    expect(consumer.spec.depends).toHaveLength(1);
  });
});
