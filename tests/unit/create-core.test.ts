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

  it("createApp returns a frozen app when called with valid config", async () => {
    const core = createCore("test", { config: {} });
    const config = core.createConfig();
    const app = await core.createApp(config);
    expect(app).toBeDefined();
    expect(typeof app.start).toBe("function");
    expect(typeof app.stop).toBe("function");
    expect(typeof app.destroy).toBe("function");
    expect(Object.isFrozen(app)).toBe(true);
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

  it("createEventBus returns a frozen event bus with expected methods", () => {
    const core = createCore("test", { config: {} });
    const bus = core.createEventBus();
    expect(bus).toBeDefined();
    expect(typeof bus.emit).toBe("function");
    expect(typeof bus.on).toBe("function");
    expect(typeof bus.off).toBe("function");
    expect(typeof bus.once).toBe("function");
    expect(typeof bus.clear).toBe("function");
    expect(Object.isFrozen(bus)).toBe(true);
  });

  it("createPluginFactory returns a function when called with valid arguments", () => {
    const core = createCore("test", { config: {} });
    const factory = core.createPluginFactory({});
    expect(typeof factory).toBe("function");
  });

  // Error format test (permanent)

  it("kernel errors include framework name in error messages", () => {
    const core = createCore("test", { config: {} });

    // Verify error format using plugin name validation (empty name)
    try {
      core.createPlugin("", {});
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("[test]");
      expect(message).toContain("Plugin name must not be empty");
    }
  });
});
