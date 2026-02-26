import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";
import { validatePlugins } from "../../src/utilities";

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
// validatePlugins - reserved names
// ---------------------------------------------------------------------------

describe("validatePlugins - reserved names", () => {
  it("throws for reserved plugin name 'start'", () => {
    const { createPlugin } = setup();
    const plugin = createPlugin("start", {});
    expect(() => validatePlugins("test", [plugin])).toThrow(/reserved/);
  });

  it("throws for reserved plugin name 'stop'", () => {
    const { createPlugin } = setup();
    const plugin = createPlugin("stop", {});
    expect(() => validatePlugins("test", [plugin])).toThrow(/reserved/);
  });

  it("throws for reserved plugin name 'emit'", () => {
    const { createPlugin } = setup();
    const plugin = createPlugin("emit", {});
    expect(() => validatePlugins("test", [plugin])).toThrow(/reserved/);
  });

  it("throws for reserved plugin name 'require'", () => {
    const { createPlugin } = setup();
    const plugin = createPlugin("require", {});
    expect(() => validatePlugins("test", [plugin])).toThrow(/reserved/);
  });

  it("throws for reserved plugin name 'has'", () => {
    const { createPlugin } = setup();
    const plugin = createPlugin("has", {});
    expect(() => validatePlugins("test", [plugin])).toThrow(/reserved/);
  });
});

// ---------------------------------------------------------------------------
// validatePlugins - duplicate names
// ---------------------------------------------------------------------------

describe("validatePlugins - duplicate names", () => {
  it("throws for duplicate plugin names", () => {
    const { createPlugin } = setup();
    const a1 = createPlugin("a", {});
    const a2 = createPlugin("a", {});
    expect(() => validatePlugins("test", [a1, a2])).toThrow(/Duplicate/);
  });

  it("passes for unique plugin names", () => {
    const { createPlugin } = setup();
    const a = createPlugin("a", {});
    const b = createPlugin("b", {});
    expect(() => validatePlugins("test", [a, b])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validatePlugins - dependency order
// ---------------------------------------------------------------------------

describe("validatePlugins - dependency order", () => {
  it("throws when dependency is missing", () => {
    const { createPlugin } = setup();
    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", { depends: [dep] });
    expect(() => validatePlugins("test", [consumer])).toThrow(/not registered/);
  });

  it("throws when dependency appears after dependent", () => {
    const { createPlugin } = setup();
    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", { depends: [dep] });
    expect(() => validatePlugins("test", [consumer, dep])).toThrow(/appears after/);
  });

  it("passes when dependency appears before dependent", () => {
    const { createPlugin } = setup();
    const dep = createPlugin("dep", {});
    const consumer = createPlugin("consumer", { depends: [dep] });
    expect(() => validatePlugins("test", [dep, consumer])).not.toThrow();
  });
});
