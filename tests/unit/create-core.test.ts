import { describe, expect, it } from "vitest";
import { createCore } from "../../src/index";

const CORE_API_FUNCTIONS = [
  "createConfig",
  "createApp",
  "createPlugin",
  "createComponent",
  "createModule",
  "createEventBus",
  "createPluginFactory"
] as const;

describe("createCore", () => {
  // Permanent structural tests (survive kernel implementation)

  it("is a function", () => {
    expect(typeof createCore).toBe("function");
  });

  it("returns an object with all 7 CoreAPI functions", () => {
    const core = createCore("test", { config: {} });

    for (const functionName of CORE_API_FUNCTIONS) {
      expect(core).toHaveProperty(functionName);
      expect(typeof core[functionName]).toBe("function");
    }
  });

  // Stub-phase throw tests (replaced during kernel implementation)

  it("createConfig throws not implemented", () => {
    const core = createCore("test", { config: {} });
    expect(() => core.createConfig()).toThrowError("[moku_core]");
  });

  it("createApp throws not implemented", () => {
    const core = createCore("test", { config: {} });
    expect(() => core.createApp()).toThrowError("[moku_core]");
  });

  it("createPlugin throws not implemented", () => {
    const core = createCore("test", { config: {} });
    expect(() => core.createPlugin()).toThrowError("[moku_core]");
  });

  it("createComponent throws not implemented", () => {
    const core = createCore("test", { config: {} });
    expect(() => core.createComponent()).toThrowError("[moku_core]");
  });

  it("createModule throws not implemented", () => {
    const core = createCore("test", { config: {} });
    expect(() => core.createModule()).toThrowError("[moku_core]");
  });

  it("createEventBus throws not implemented", () => {
    const core = createCore("test", { config: {} });
    expect(() => core.createEventBus()).toThrowError("[moku_core]");
  });

  it("createPluginFactory throws not implemented", () => {
    const core = createCore("test", { config: {} });
    expect(() => core.createPluginFactory()).toThrowError("[moku_core]");
  });

  // Error format test (permanent)

  it("stub errors include function name and skeleton message", () => {
    const core = createCore("test", { config: {} });

    try {
      core.createConfig();
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("[moku_core]");
      expect(message).toContain("createConfig");
      expect(message).toContain("is not yet implemented");
      expect(message).toContain("stub from the skeleton phase");
    }
  });
});
