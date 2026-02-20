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

  it("createConfig returns an AppConfig when called", () => {
    const core = createCore("test", { config: {} });
    const result = core.createConfig();
    expect(result).toBeDefined();
    expect(result._brand).toBe("AppConfig");
  });

  it("createApp throws not implemented", () => {
    const core = createCore("test", { config: {} });
    expect(() => core.createApp()).toThrowError("[test]");
  });

  it("createPlugin returns an object when called with valid arguments", () => {
    const core = createCore("test", { config: {} });
    const result = core.createPlugin("myPlugin", {});
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(result.kind).toBe("plugin");
  });

  it("createComponent returns an object when called with valid arguments", () => {
    const core = createCore("test", { config: {} });
    const result = core.createComponent("myComponent", {});
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(result.kind).toBe("component");
  });

  it("createModule returns an object when called with valid arguments", () => {
    const core = createCore("test", { config: {} });
    const result = core.createModule("myModule", {});
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(result.kind).toBe("module");
  });

  it("createEventBus throws not implemented", () => {
    const core = createCore("test", { config: {} });
    expect(() => core.createEventBus()).toThrowError("[test]");
  });

  it("createPluginFactory returns a function when called with valid arguments", () => {
    const core = createCore("test", { config: {} });
    const factory = core.createPluginFactory({});
    expect(typeof factory).toBe("function");
  });

  // Error format test (permanent)

  it("stub errors include framework name, function name, and skeleton message", () => {
    const core = createCore("test", { config: {} });

    // Test with createApp (still a stub)
    try {
      core.createApp();
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("[test]");
      expect(message).toContain("createApp");
      expect(message).toContain("is not yet implemented");
      expect(message).toContain("stub from the skeleton phase");
    }
  });
});
