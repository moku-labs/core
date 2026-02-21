import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";
import { flattenPlugins, validatePlugins } from "../../src/flatten";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

function setup(frameworkId = "test") {
  const cc = createCoreConfig<Record<string, never>, Record<string, never>>(frameworkId, {
    config: {}
  });
  return cc;
}

// ---------------------------------------------------------------------------
// validatePlugins - reserved names
// ---------------------------------------------------------------------------

describe("validatePlugins - reserved names", () => {
  it("throws on reserved name 'start'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("start", {});
    const flat = flattenPlugins([plugin]);

    expect(() => validatePlugins("test", flat)).toThrow(TypeError);
    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });

  it("throws on reserved name 'stop'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("stop", {});
    const flat = flattenPlugins([plugin]);

    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });

  it("throws on reserved name 'emit'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("emit", {});
    const flat = flattenPlugins([plugin]);

    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });

  it("throws on reserved name 'getPlugin'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("getPlugin", {});
    const flat = flattenPlugins([plugin]);

    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });

  it("throws on reserved name 'require'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("require", {});
    const flat = flattenPlugins([plugin]);

    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });

  it("throws on reserved name 'has'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("has", {});
    const flat = flattenPlugins([plugin]);

    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });
});

// ---------------------------------------------------------------------------
// validatePlugins - duplicate names
// ---------------------------------------------------------------------------

describe("validatePlugins - duplicate names", () => {
  it("throws on duplicate plugin names", () => {
    const { createPlugin } = setup();

    const a1 = createPlugin("router", {});
    const a2 = createPlugin("router", {});
    const flat = flattenPlugins([a1, a2]);

    expect(() => validatePlugins("test", flat)).toThrow(TypeError);
    expect(() => validatePlugins("test", flat)).toThrow("Duplicate plugin name");
    expect(() => validatePlugins("test", flat)).toThrow('"router"');
  });

  it("passes with unique names", () => {
    const { createPlugin } = setup();

    const a = createPlugin("a", {});
    const b = createPlugin("b", {});
    const flat = flattenPlugins([a, b]);

    expect(() => validatePlugins("test", flat)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validatePlugins - dependency existence and order
// ---------------------------------------------------------------------------

describe("validatePlugins - dependency order", () => {
  it("throws when dependency is not registered", () => {
    const { createPlugin } = setup();

    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", {
      depends: [dep] as const
    });

    // Only register consumer, not dep
    const flat = flattenPlugins([consumer]);

    expect(() => validatePlugins("test", flat)).toThrow(TypeError);
    expect(() => validatePlugins("test", flat)).toThrow('depends on "dep"');
    expect(() => validatePlugins("test", flat)).toThrow("not registered");
  });

  it("throws when dependency appears after dependent", () => {
    const { createPlugin } = setup();

    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", {
      depends: [dep] as const
    });

    // Wrong order: consumer before dep
    const flat = flattenPlugins([consumer, dep]);

    expect(() => validatePlugins("test", flat)).toThrow(TypeError);
    expect(() => validatePlugins("test", flat)).toThrow("appears after");
  });

  it("passes when dependency is before dependent", () => {
    const { createPlugin } = setup();

    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", {
      depends: [dep] as const
    });

    // Correct order
    const flat = flattenPlugins([dep, consumer]);

    expect(() => validatePlugins("test", flat)).not.toThrow();
  });

  it("passes with multiple dependencies in correct order", () => {
    const { createPlugin } = setup();

    const a = createPlugin("a", {});
    const b = createPlugin("b", {});
    const c = createPlugin("c", {
      depends: [a, b] as const
    });

    const flat = flattenPlugins([a, b, c]);

    expect(() => validatePlugins("test", flat)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validatePlugins - error message format
// ---------------------------------------------------------------------------

describe("validatePlugins - error message format", () => {
  it("error includes framework id", () => {
    const { createPlugin } = setup("my-framework");

    const a = createPlugin("router", {});
    const b = createPlugin("router", {});
    const flat = flattenPlugins([a, b]);

    try {
      validatePlugins("my-framework", flat);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toMatch(/^\[my-framework\]/);
    }
  });

  it("error includes actionable suggestion", () => {
    const { createPlugin } = setup();

    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", {
      depends: [dep] as const
    });
    const flat = flattenPlugins([consumer]);

    try {
      validatePlugins("test", flat);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("\n  ");
      expect((error as Error).message).toContain("Add");
    }
  });
});

// ---------------------------------------------------------------------------
// validatePlugins - passes on valid input
// ---------------------------------------------------------------------------

describe("validatePlugins - passes on valid input", () => {
  it("accepts empty plugin list", () => {
    expect(() => validatePlugins("test", [])).not.toThrow();
  });

  it("accepts single plugin without dependencies", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("solo", {});
    const flat = flattenPlugins([plugin]);

    expect(() => validatePlugins("test", flat)).not.toThrow();
  });

  it("accepts flattened sub-plugins (children before parent)", () => {
    const { createPlugin } = setup();

    const child = createPlugin("child", {});
    const parent = createPlugin("parent", {
      plugins: [child],
      depends: [child] as const
    });

    // flattenPlugins ensures child before parent
    const flat = flattenPlugins([parent]);

    expect(() => validatePlugins("test", flat)).not.toThrow();
  });
});
