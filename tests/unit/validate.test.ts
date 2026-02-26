import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";
import { validatePlugins } from "../../src/utilities";

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
    const flat = [plugin];

    expect(() => validatePlugins("test", flat)).toThrow(TypeError);
    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });

  it("throws on reserved name 'stop'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("stop", {});
    const flat = [plugin];

    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });

  it("throws on reserved name 'emit'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("emit", {});
    const flat = [plugin];

    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });

  it("throws on reserved name 'require'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("require", {});
    const flat = [plugin];

    expect(() => validatePlugins("test", flat)).toThrow("reserved app method");
  });

  it("throws on reserved name 'has'", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("has", {});
    const flat = [plugin];

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
    const flat = [a1, a2];

    expect(() => validatePlugins("test", flat)).toThrow(TypeError);
    expect(() => validatePlugins("test", flat)).toThrow("Duplicate plugin name");
    expect(() => validatePlugins("test", flat)).toThrow('"router"');
  });

  it("passes with unique names", () => {
    const { createPlugin } = setup();

    const a = createPlugin("a", {});
    const b = createPlugin("b", {});
    const flat = [a, b];

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
      depends: [dep]
    });

    // Only register consumer, not dep
    const flat = [consumer];

    expect(() => validatePlugins("test", flat)).toThrow(TypeError);
    expect(() => validatePlugins("test", flat)).toThrow('depends on "dep"');
    expect(() => validatePlugins("test", flat)).toThrow("not registered");
  });

  it("throws when dependency appears after dependent", () => {
    const { createPlugin } = setup();

    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", {
      depends: [dep]
    });

    // Wrong order: consumer before dep
    const flat = [consumer, dep];

    expect(() => validatePlugins("test", flat)).toThrow(TypeError);
    expect(() => validatePlugins("test", flat)).toThrow("appears after");
  });

  it("passes when dependency is before dependent", () => {
    const { createPlugin } = setup();

    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", {
      depends: [dep]
    });

    // Correct order
    const flat = [dep, consumer];

    expect(() => validatePlugins("test", flat)).not.toThrow();
  });

  it("passes with multiple dependencies in correct order", () => {
    const { createPlugin } = setup();

    const a = createPlugin("a", {});
    const b = createPlugin("b", {});
    const c = createPlugin("c", {
      depends: [a, b]
    });

    const flat = [a, b, c];

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
    const flat = [a, b];

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
      depends: [dep]
    });
    const flat = [consumer];

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
    const flat = [plugin];

    expect(() => validatePlugins("test", flat)).not.toThrow();
  });

  it("accepts dependency listed before dependent", () => {
    const { createPlugin } = setup();

    const child = createPlugin("child", {});
    const parent = createPlugin("parent", {
      depends: [child]
    });

    expect(() => validatePlugins("test", [child, parent])).not.toThrow();
  });
});
