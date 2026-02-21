import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";
import { flattenPlugins } from "../../src/flatten";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

function setup() {
  const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
    config: {}
  });
  return cc;
}

// ---------------------------------------------------------------------------
// flattenPlugins - basic behavior
// ---------------------------------------------------------------------------

describe("flattenPlugins - basic behavior", () => {
  it("returns empty array for empty input", () => {
    const result = flattenPlugins([]);
    expect(result).toEqual([]);
  });

  it("returns same array for flat plugin list (no sub-plugins)", () => {
    const { createPlugin } = setup();

    const a = createPlugin("a", {});
    const b = createPlugin("b", {});
    const c = createPlugin("c", {});

    const result = flattenPlugins([a, b, c]);

    expect(result).toHaveLength(3);
    expect(result[0]?.name).toBe("a");
    expect(result[1]?.name).toBe("b");
    expect(result[2]?.name).toBe("c");
  });

  it("preserves order for flat plugin list", () => {
    const { createPlugin } = setup();

    const router = createPlugin("router", {});
    const logger = createPlugin("logger", {});

    const result = flattenPlugins([router, logger]);

    expect(result.map(p => p.name)).toEqual(["router", "logger"]);
  });
});

// ---------------------------------------------------------------------------
// flattenPlugins - sub-plugin flattening
// ---------------------------------------------------------------------------

describe("flattenPlugins - sub-plugin flattening", () => {
  it("children appear before parent (depth-first)", () => {
    const { createPlugin } = setup();

    const child = createPlugin("child", {});
    const parent = createPlugin("parent", {
      plugins: [child]
    });

    const result = flattenPlugins([parent]);

    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("child");
    expect(result[1]?.name).toBe("parent");
  });

  it("handles nested sub-plugins (grandchild before child before parent)", () => {
    const { createPlugin } = setup();

    const grandchild = createPlugin("grandchild", {});
    const child = createPlugin("child", {
      plugins: [grandchild]
    });
    const parent = createPlugin("parent", {
      plugins: [child]
    });

    const result = flattenPlugins([parent]);

    expect(result).toHaveLength(3);
    expect(result.map(p => p.name)).toEqual(["grandchild", "child", "parent"]);
  });

  it("handles multiple children in correct order", () => {
    const { createPlugin } = setup();

    const childA = createPlugin("child-a", {});
    const childB = createPlugin("child-b", {});
    const parent = createPlugin("parent", {
      plugins: [childA, childB]
    });

    const result = flattenPlugins([parent]);

    expect(result).toHaveLength(3);
    expect(result.map(p => p.name)).toEqual(["child-a", "child-b", "parent"]);
  });

  it("handles mixed flat and nested plugins", () => {
    const { createPlugin } = setup();

    const standalone = createPlugin("standalone", {});
    const child = createPlugin("child", {});
    const parent = createPlugin("parent", {
      plugins: [child]
    });

    const result = flattenPlugins([standalone, parent]);

    expect(result).toHaveLength(3);
    expect(result.map(p => p.name)).toEqual(["standalone", "child", "parent"]);
  });

  it("depth-first with nested sub-plugins across multiple parents", () => {
    const { createPlugin } = setup();

    const engine = createPlugin("engine", {});
    const renderer = createPlugin("renderer", {
      plugins: [engine]
    });

    const store = createPlugin("store", {});
    const dataPipeline = createPlugin("data-pipeline", {
      plugins: [store]
    });

    const result = flattenPlugins([renderer, dataPipeline]);

    expect(result.map(p => p.name)).toEqual(["engine", "renderer", "store", "data-pipeline"]);
  });

  it("plugins with empty plugins array treated as flat", () => {
    const { createPlugin } = setup();

    const plugin = createPlugin("solo", {
      plugins: []
    });

    const result = flattenPlugins([plugin]);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("solo");
  });
});
