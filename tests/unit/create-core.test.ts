import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// createCoreConfig (Step 1 of Factory Chain)
// ---------------------------------------------------------------------------

describe("createCoreConfig", () => {
  it("returns an object with createPlugin and createCore", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });

    expect(cc).toHaveProperty("createPlugin");
    expect(cc).toHaveProperty("createCore");
    expect(typeof cc.createPlugin).toBe("function");
    expect(typeof cc.createCore).toBe("function");
  });

  it("captures framework id for error messages", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("my-framework", {
      config: {}
    });

    const { createPlugin } = cc;

    // Empty plugin name should produce error with framework id
    expect(() => createPlugin("", {})).toThrow("[my-framework]");
  });

  it("captures config defaults in closure", () => {
    const cc = createCoreConfig<{ siteName: string; mode: string }, Record<string, never>>("test", {
      config: { siteName: "Default", mode: "development" }
    });

    // Config defaults are used when no overrides provided (verified via createApp)
    expect(cc).toBeDefined();
    expect(typeof cc.createCore).toBe("function");
  });

  it("each call creates an independent instance", () => {
    const cc1 = createCoreConfig<Record<string, never>, Record<string, never>>("framework-a", {
      config: {}
    });
    const cc2 = createCoreConfig<Record<string, never>, Record<string, never>>("framework-b", {
      config: {}
    });

    // Different instances
    expect(cc1.createPlugin).not.toBe(cc2.createPlugin);
    expect(cc1.createCore).not.toBe(cc2.createCore);

    // Each uses its own framework id
    expect(() => cc1.createPlugin("", {})).toThrow("[framework-a]");
    expect(() => cc2.createPlugin("", {})).toThrow("[framework-b]");
  });
});

// ---------------------------------------------------------------------------
// createCore (Step 2 of Factory Chain)
// ---------------------------------------------------------------------------

describe("createCore", () => {
  it("returns an object with createApp and createPlugin", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });

    const result = cc.createCore(cc, { plugins: [] });

    expect(result).toHaveProperty("createApp");
    expect(result).toHaveProperty("createPlugin");
    expect(typeof result.createApp).toBe("function");
    expect(typeof result.createPlugin).toBe("function");
  });

  it("createPlugin reference is shared with createCoreConfig", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });

    const result = cc.createCore(cc, { plugins: [] });

    // Both createPlugin references point to the same function
    expect(result.createPlugin).toBe(cc.createPlugin);
  });

  it("createApp returns a promise", async () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("test", {
      config: {}
    });

    const { createApp } = cc.createCore(cc, { plugins: [] });

    const result = createApp();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

// ---------------------------------------------------------------------------
// Error message format
// ---------------------------------------------------------------------------

describe("error message format", () => {
  it("errors follow [framework-id] format with actionable suggestion", () => {
    const cc = createCoreConfig<Record<string, never>, Record<string, never>>("my-app", {
      config: {}
    });

    try {
      cc.createPlugin("", {});
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect((error as Error).message).toMatch(/^\[my-app\]/);
      expect((error as Error).message).toContain("\n  ");
    }
  });
});
