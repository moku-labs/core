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
// createPlugin - helpers validation
// ---------------------------------------------------------------------------

describe("createPlugin - helpers validation", () => {
  it("accepts valid helpers object of functions", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {
      helpers: {
        route: (path: string) => ({ path }),
        redirect: (from: string, to: string) => ({ from, to })
      }
    });
    expect(plugin.name).toBe("router");
  });

  it("accepts undefined helpers (optional)", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("minimal", {});
    expect(plugin.name).toBe("minimal");
  });

  it("throws on null helpers", () => {
    const { createPlugin } = setup();

    expect(() =>
      createPlugin("bad", {
        // eslint-disable-next-line unicorn/no-null -- testing runtime null rejection
        helpers: null as never
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        // eslint-disable-next-line unicorn/no-null -- testing runtime null rejection
        helpers: null as never
      })
    ).toThrow("invalid helpers");
  });

  it("throws on non-object helpers", () => {
    const { createPlugin } = setup();

    // Type system accepts these (Helpers falls back to {}), but runtime catches them
    expect(() =>
      createPlugin("bad", {
        helpers: "not an object" as never
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        helpers: "not an object" as never
      })
    ).toThrow("invalid helpers");
  });

  it("throws on non-function helper value", () => {
    const { createPlugin } = setup();

    // Type system accepts these (Helpers falls back to {}), but runtime catches them
    expect(() =>
      createPlugin("bad", {
        helpers: { route: "not a function" } as never
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        helpers: { route: "not a function" } as never
      })
    ).toThrow('invalid helper "route"');
  });

  it("throws on helper name conflicting with PluginInstance fields", () => {
    const { createPlugin } = setup();

    // These are valid at the type level (functions in a helpers object),
    // but conflict with PluginInstance fields at runtime
    expect(() =>
      createPlugin("bad", {
        helpers: { name: () => {} }
      })
    ).toThrow(TypeError);
    expect(() =>
      createPlugin("bad", {
        helpers: { name: () => {} }
      })
    ).toThrow("conflicts with a PluginInstance property");

    expect(() =>
      createPlugin("bad", {
        helpers: { spec: () => {} }
      })
    ).toThrow("conflicts with a PluginInstance property");

    expect(() =>
      createPlugin("bad", {
        helpers: { _phantom: () => {} }
      })
    ).toThrow("conflicts with a PluginInstance property");
  });

  it("error includes framework id and plugin name", () => {
    const { createPlugin } = setup("my-framework");

    // Type system accepts (Helpers falls back to {}), but runtime catches
    expect(() =>
      createPlugin("router", {
        helpers: 42 as never
      })
    ).toThrow("[my-framework]");
    expect(() =>
      createPlugin("router", {
        helpers: 42 as never
      })
    ).toThrow('"router"');
  });
});

// ---------------------------------------------------------------------------
// createPlugin - helpers on return value
// ---------------------------------------------------------------------------

describe("createPlugin - helpers on return value", () => {
  it("spreads helpers onto the plugin instance", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {
      helpers: {
        route: (path: string) => ({ path })
      }
    });

    expect(plugin.route).toBeTypeOf("function");
    expect(plugin.route("/home")).toEqual({ path: "/home" });
  });

  it("helpers are callable with correct types", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {
      helpers: {
        route: (path: string, component: string) => ({ path, component }),
        redirect: (from: string, to: string) => ({ from, to, type: "redirect" as const })
      }
    });

    const r = plugin.route("/home", "HomePage");
    expect(r).toEqual({ path: "/home", component: "HomePage" });

    const rd = plugin.redirect("/old", "/new");
    expect(rd).toEqual({ from: "/old", to: "/new", type: "redirect" });
  });

  it("plugin without helpers has no extra properties", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("minimal", {});

    expect(Object.keys(plugin)).toEqual(expect.arrayContaining(["name", "spec", "_phantom"]));
    expect(Object.keys(plugin)).toHaveLength(3);
  });

  it("plugin with helpers retains name, spec, _phantom", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("router", {
      config: { basePath: "/" },
      helpers: { route: (path: string) => ({ path }) }
    });

    expect(plugin.name).toBe("router");
    expect(plugin.spec).toBeDefined();
    expect(plugin._phantom).toBeDefined();
    expect(plugin.spec.config).toEqual({ basePath: "/" });
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

  it("plugin with helpers works as dependency", () => {
    const { createPlugin } = setup();

    const dep = createPlugin("dep", {
      helpers: { create: () => ({}) }
    });
    const consumer = createPlugin("consumer", {
      depends: [dep]
    });

    expect(consumer.spec.depends).toHaveLength(1);
  });
});
