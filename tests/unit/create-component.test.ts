import { describe, expect, it } from "vitest";
import { createCore } from "../../src/index";

// Shared noop functions for reference identity checks
const mountHandler = () => {};
const unmountHandler = () => {};

describe("createComponent", () => {
  const core = createCore("test-framework", { config: {} });
  const { createComponent, createPlugin } = core;

  // PLUG-03: Component mapping and shape

  it("returns object with kind 'component'", () => {
    const comp = createComponent("sidebar", {});
    expect(comp.kind).toBe("component");
  });

  it("returns object with the provided name", () => {
    const comp = createComponent("sidebar", {});
    expect(comp.name).toBe("sidebar");
  });

  it("spec has onStart mapped from onMount", () => {
    const comp = createComponent("sidebar", { onMount: mountHandler });
    expect((comp.spec as Record<string, unknown>).onStart).toBe(mountHandler);
  });

  it("spec has onStop mapped from onUnmount", () => {
    const comp = createComponent("sidebar", { onUnmount: unmountHandler });
    expect((comp.spec as Record<string, unknown>).onStop).toBe(unmountHandler);
  });

  it("works with onMount only (no onUnmount)", () => {
    const comp = createComponent("sidebar", { onMount: mountHandler });
    expect((comp.spec as Record<string, unknown>).onStart).toBe(mountHandler);
    expect((comp.spec as Record<string, unknown>).onStop).toBeUndefined();
  });

  it("works with onUnmount only (no onMount)", () => {
    const comp = createComponent("sidebar", { onUnmount: unmountHandler });
    expect((comp.spec as Record<string, unknown>).onStart).toBeUndefined();
    expect((comp.spec as Record<string, unknown>).onStop).toBe(unmountHandler);
  });

  it("works with neither onMount nor onUnmount", () => {
    const comp = createComponent("sidebar", {});
    expect((comp.spec as Record<string, unknown>).onStart).toBeUndefined();
    expect((comp.spec as Record<string, unknown>).onStop).toBeUndefined();
  });

  it("_hasDefaults is true when spec has defaultConfig", () => {
    const comp = createComponent("sidebar", { defaultConfig: { width: 200 } });
    expect(comp._hasDefaults).toBe(true);
  });

  it("_hasDefaults is false when spec has no defaultConfig", () => {
    const comp = createComponent("sidebar", {});
    expect(comp._hasDefaults).toBe(false);
  });

  it("returns _types as empty object", () => {
    const comp = createComponent("sidebar", {});
    expect(comp._types).toEqual({});
    expect(typeof comp._types).toBe("object");
    expect(Object.keys(comp._types)).toHaveLength(0);
  });

  it("accepts spec with api function", () => {
    const comp = createComponent("sidebar", {
      api: () => ({ toggle: () => {} })
    });
    expect(comp.kind).toBe("component");
  });

  it("accepts spec with createState function", () => {
    const comp = createComponent("sidebar", {
      createState: () => ({ open: false })
    });
    expect(comp.kind).toBe("component");
  });

  it("accepts spec with hooks object", () => {
    const comp = createComponent("sidebar", {
      hooks: { "sidebar:toggle": () => {} }
    });
    expect(comp.kind).toBe("component");
  });

  it("accepts spec with depends array", () => {
    const layoutRef = createPlugin("layout", {});
    const comp = createComponent("sidebar", {
      depends: [layoutRef]
    });
    expect(comp.kind).toBe("component");
  });

  // Validation

  it("throws when name is empty string", () => {
    expect(() => createComponent("", {})).toThrowError("[test-framework]");
    expect(() => createComponent("", {})).toThrowError("must not be empty");
  });

  it("throws when name is not a string", () => {
    expect(() => createComponent(123 as never, {})).toThrowError("[test-framework]");
    expect(() => createComponent(123 as never, {})).toThrowError("must be a string");
  });

  it("throws when onMount is not a function", () => {
    expect(() => createComponent("sidebar", { onMount: "bad" as never })).toThrowError(
      "onMount must be a function"
    );
  });

  it("throws when onUnmount is not a function", () => {
    expect(() => createComponent("sidebar", { onUnmount: 42 as never })).toThrowError(
      "onUnmount must be a function"
    );
  });

  it("throws when api is not a function", () => {
    expect(() => createComponent("sidebar", { api: "bad" as never })).toThrowError(
      "api must be a function"
    );
  });

  it("throws when createState is not a function", () => {
    expect(() => createComponent("sidebar", { createState: {} as never })).toThrowError(
      "createState must be a function"
    );
  });

  it("error message includes framework name", () => {
    expect(() => createComponent("", {})).toThrowError("[test-framework]");
  });

  it("error message includes 'Component' in description", () => {
    expect(() => createComponent("sidebar", { api: "bad" as never })).toThrowError(
      'Component "sidebar"'
    );
  });
});
