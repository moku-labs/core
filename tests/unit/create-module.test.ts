import { describe, expect, it } from "vitest";
import { createCore } from "../../src/index";

describe("createModule", () => {
  const core = createCore("test-framework", { config: {} });
  const { createModule, createPlugin, createComponent } = core;

  // PLUG-04: Module shape

  it("returns object with kind 'module'", () => {
    const mod = createModule("auth", {});
    expect(mod.kind).toBe("module");
  });

  it("returns object with the provided name", () => {
    const mod = createModule("auth", {});
    expect(mod.name).toBe("auth");
  });

  it("returns object with the provided spec", () => {
    const spec = {};
    const mod = createModule("auth", spec);
    expect(mod.spec).toBe(spec);
  });

  it("accepts spec with plugins array", () => {
    const plugin = createPlugin("auth-plugin", {});
    const mod = createModule("auth", { plugins: [plugin] });
    expect(mod.kind).toBe("module");
    expect(mod.spec.plugins).toHaveLength(1);
  });

  it("accepts spec with components array", () => {
    const comp = createComponent("login-form", {});
    const mod = createModule("auth", { components: [comp] });
    expect(mod.kind).toBe("module");
  });

  it("accepts spec with modules array (nested)", () => {
    const inner = createModule("inner", {});
    const mod = createModule("auth", { modules: [inner] });
    expect(mod.kind).toBe("module");
  });

  it("accepts spec with onRegister function", () => {
    const mod = createModule("auth", { onRegister: () => {} });
    expect(mod.kind).toBe("module");
  });

  it("accepts minimal spec (empty object)", () => {
    const mod = createModule("auth", {});
    expect(mod.kind).toBe("module");
    expect(mod.name).toBe("auth");
  });

  it("does NOT have _types property (ModuleInstance has no phantom types)", () => {
    const mod = createModule("auth", {});
    expect(mod).not.toHaveProperty("_types");
  });

  it("does NOT have _hasDefaults property (modules have no config resolution)", () => {
    const mod = createModule("auth", {});
    expect(mod).not.toHaveProperty("_hasDefaults");
  });

  // Validation

  it("throws when name is empty string", () => {
    expect(() => createModule("", {})).toThrowError("[test-framework]");
    expect(() => createModule("", {})).toThrowError("must not be empty");
  });

  it("throws when name is not a string", () => {
    // eslint-disable-next-line unicorn/no-null -- testing null rejection at runtime
    const nullValue = null;
    expect(() => createModule(nullValue as never, {})).toThrowError("[test-framework]");
    expect(() => createModule(nullValue as never, {})).toThrowError("must be a string");
  });

  it("throws when plugins is not an array (e.g., object)", () => {
    expect(() => createModule("auth", { plugins: {} as never })).toThrowError(
      "plugins must be an array"
    );
  });

  it("throws when components is not an array", () => {
    expect(() => createModule("auth", { components: "bad" as never })).toThrowError(
      "components must be an array"
    );
  });

  it("throws when modules is not an array", () => {
    expect(() => createModule("auth", { modules: 42 as never })).toThrowError(
      "modules must be an array"
    );
  });

  it("throws when onRegister is not a function", () => {
    expect(() => createModule("auth", { onRegister: "bad" as never })).toThrowError(
      "onRegister must be a function"
    );
  });

  it("error message includes framework name", () => {
    expect(() => createModule("", {})).toThrowError("[test-framework]");
  });

  it("error message includes 'Module' and the module name", () => {
    expect(() => createModule("auth", { plugins: {} as never })).toThrowError('Module "auth"');
  });
});
