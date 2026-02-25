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
// createPlugin - spec validation
// ---------------------------------------------------------------------------

describe("createPlugin - spec validation", () => {
  it("throws on non-object spec", () => {
    const { createPlugin } = setup();

    // @ts-expect-error -- testing runtime validation
    expect(() => createPlugin("bad-spec", 42)).toThrow(TypeError);
    // @ts-expect-error -- testing runtime validation
    expect(() => createPlugin("bad-spec", 42)).toThrow("invalid spec");
  });

  it("throws on null spec", () => {
    const { createPlugin } = setup();

    // @ts-expect-error -- testing runtime validation
    // eslint-disable-next-line unicorn/no-null -- testing runtime null rejection
    expect(() => createPlugin("bad-spec", null)).toThrow(TypeError);
  });

  it("throws on array spec", () => {
    const { createPlugin } = setup();

    // @ts-expect-error -- testing runtime validation
    expect(() => createPlugin("bad-spec", [])).toThrow(TypeError);
    // @ts-expect-error -- testing runtime validation
    expect(() => createPlugin("bad-spec", [])).toThrow("invalid spec");
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
// createPlugin - events validation
// ---------------------------------------------------------------------------

describe("createPlugin - events validation", () => {
  it("accepts valid events function", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("valid", {
      events: register => ({
        "test:event": register<{ id: string }>("A test event")
      })
    });
    expect(plugin.name).toBe("valid");
  });

  it("throws on non-function events", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        events: { "test:event": {} }
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        events: { "test:event": {} }
      })
    ).toThrow("invalid events");
  });
});

// ---------------------------------------------------------------------------
// createPlugin - hooks validation
// ---------------------------------------------------------------------------

describe("createPlugin - hooks validation", () => {
  it("accepts valid hooks function", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("valid", {
      hooks: _ctx => ({
        "some:event": () => {}
      })
    });
    expect(plugin.name).toBe("valid");
  });

  it("throws on non-function hooks", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        hooks: "not a function"
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation
        hooks: "not a function"
      })
    ).toThrow("invalid hooks");
  });

  it("throws on non-function hooks (object instead of function)", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation: object not allowed, must be a function
        hooks: { "some:event": () => {} }
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        // @ts-expect-error -- testing runtime validation: object not allowed, must be a function
        hooks: { "some:event": () => {} }
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
});

// ---------------------------------------------------------------------------
// createPlugin - return value (PluginInstance shape)
// ---------------------------------------------------------------------------

describe("createPlugin - return value", () => {
  it("returns an object with name and spec", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {
      config: { basePath: "/" }
    });

    expect(plugin).toHaveProperty("name");
    expect(plugin).toHaveProperty("spec");
    expect(plugin.name).toBe("router");
  });

  it("carries _phantom field for type inference", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {
      config: { basePath: "/" }
    });

    expect(plugin).toHaveProperty("_phantom");
  });

  it("spec retains all provided fields", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("full", {
      config: { x: 1 },
      onInit: () => {},
      onStart: () => {},
      onStop: () => {},
      hooks: _ctx => ({ "some:event": () => {} })
    });

    expect(plugin.spec.config).toEqual({ x: 1 });
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
// createPlugin - depends
// ---------------------------------------------------------------------------

describe("createPlugin - depends", () => {
  it("accepts depends array in spec", () => {
    const { createPlugin } = setup();

    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", {
      depends: [dep]
    });

    expect(consumer.spec.depends).toHaveLength(1);
  });
});
