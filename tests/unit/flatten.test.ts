import { describe, expect, it, vi } from "vitest";
import { flattenPlugins } from "../../src/flatten";
import { createCore } from "../../src/index";

describe("flattenPlugins", () => {
  const core = createCore("test", { config: {} });
  const { createPlugin, createComponent, createModule } = core;

  describe("basic flattening", () => {
    it("returns empty array for empty input", () => {
      const result = flattenPlugins([]);
      expect(result).toEqual([]);
    });

    it("passes through a single plugin unchanged", () => {
      const plugin = createPlugin("auth", {});
      const result = flattenPlugins([plugin]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(plugin);
    });

    it("passes through a single component unchanged", () => {
      const component = createComponent("sidebar", {});
      const result = flattenPlugins([component]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(component);
    });

    it("preserves order of multiple plugins", () => {
      const a = createPlugin("a", {});
      const b = createPlugin("b", {});
      const c = createPlugin("c", {});
      const result = flattenPlugins([a, b, c]);
      expect(result).toEqual([a, b, c]);
    });

    it("handles mixed plugins and components", () => {
      const plugin = createPlugin("auth", {});
      const component = createComponent("sidebar", {});
      const result = flattenPlugins([plugin, component]);
      expect(result).toEqual([plugin, component]);
    });
  });

  describe("module flattening (FLAT-01)", () => {
    it("inlines module plugins at the module's position", () => {
      const pluginX = createPlugin("x", {});
      const pluginY = createPlugin("y", {});
      const mod = createModule("mod", { plugins: [pluginX, pluginY] });
      const result = flattenPlugins([mod]);
      expect(result).toEqual([pluginX, pluginY]);
    });

    it("inlines module components at the module's position", () => {
      const comp = createComponent("comp", {});
      const mod = createModule("mod", { components: [comp] });
      const result = flattenPlugins([mod]);
      expect(result).toEqual([comp]);
    });

    it("inlines plugins then components (per spec order)", () => {
      const pluginX = createPlugin("x", {});
      const compZ = createComponent("z", {});
      const mod = createModule("mod", {
        plugins: [pluginX],
        components: [compZ]
      });
      const result = flattenPlugins([mod]);
      expect(result).toEqual([pluginX, compZ]);
    });

    it("silently skips empty module (no children)", () => {
      const mod = createModule("empty", {});
      const result = flattenPlugins([mod]);
      expect(result).toEqual([]);
    });

    it("silently skips module with only empty arrays", () => {
      const mod = createModule("empty", {
        plugins: [],
        components: [],
        modules: []
      });
      const result = flattenPlugins([mod]);
      expect(result).toEqual([]);
    });

    it("fires onRegister during flattening with the module's plugins array", () => {
      const pluginX = createPlugin("x", {});
      const onRegister = vi.fn();
      const mod = createModule("mod", {
        plugins: [pluginX],
        onRegister
      });
      flattenPlugins([mod]);
      expect(onRegister).toHaveBeenCalledOnce();
      expect(onRegister).toHaveBeenCalledWith([pluginX]);
    });

    it("ignores onRegister return value", () => {
      const pluginX = createPlugin("x", {});
      const onRegister = vi.fn().mockReturnValue("should be ignored");
      const mod = createModule("mod", {
        plugins: [pluginX],
        onRegister
      });
      const result = flattenPlugins([mod]);
      expect(result).toEqual([pluginX]);
    });

    it("does not error when module has no onRegister", () => {
      const pluginX = createPlugin("x", {});
      const mod = createModule("mod", { plugins: [pluginX] });
      expect(() => flattenPlugins([mod])).not.toThrow();
    });

    it("flattens nested modules depth-first", () => {
      const pluginA = createPlugin("a", {});
      const pluginB = createPlugin("b", {});
      const innerMod = createModule("inner", { plugins: [pluginA] });
      const outerMod = createModule("outer", {
        plugins: [pluginB],
        modules: [innerMod]
      });
      const result = flattenPlugins([outerMod]);
      // outer's plugins first, then inner module's plugins
      expect(result).toEqual([pluginB, pluginA]);
    });

    it("flattens deeply nested modules (3+ levels)", () => {
      const pluginDeep = createPlugin("deep", {});
      const level3 = createModule("l3", { plugins: [pluginDeep] });
      const level2 = createModule("l2", { modules: [level3] });
      const level1 = createModule("l1", { modules: [level2] });
      const result = flattenPlugins([level1]);
      expect(result).toEqual([pluginDeep]);
    });

    it("inlines module children at the correct position between plugins", () => {
      const before = createPlugin("before", {});
      const after = createPlugin("after", {});
      const child = createPlugin("child", {});
      const mod = createModule("mod", { plugins: [child] });
      const result = flattenPlugins([before, mod, after]);
      expect(result).toEqual([before, child, after]);
    });
  });

  describe("sub-plugin flattening (FLAT-02)", () => {
    it("places sub-plugins before parent plugin", () => {
      const sub = createPlugin("sub", {});
      const parent = createPlugin("parent", { plugins: [sub] });
      const result = flattenPlugins([parent]);
      expect(result).toEqual([sub, parent]);
    });

    it("handles nested sub-plugins depth-first", () => {
      const grandchild = createPlugin("grandchild", {});
      const child = createPlugin("child", { plugins: [grandchild] });
      const parent = createPlugin("parent", { plugins: [child] });
      const result = flattenPlugins([parent]);
      expect(result).toEqual([grandchild, child, parent]);
    });

    it("handles sub-plugins inside a module's plugin", () => {
      const sub = createPlugin("sub", {});
      const pluginWithSub = createPlugin("parent", { plugins: [sub] });
      const mod = createModule("mod", { plugins: [pluginWithSub] });
      const result = flattenPlugins([mod]);
      // Module flattening extracts pluginWithSub, then sub-plugin flattening puts sub first
      expect(result).toEqual([sub, pluginWithSub]);
    });
  });

  describe("combined scenarios", () => {
    it("matches the spec example exactly", () => {
      // Given:
      // [ModuleA { plugins: [PluginX, PluginY], components: [ComponentZ] },
      //  PluginW { plugins: [SubPluginV] }]
      // Expected: [PluginX, PluginY, ComponentZ, SubPluginV, PluginW]
      const pluginX = createPlugin("x", {});
      const pluginY = createPlugin("y", {});
      const compZ = createComponent("z", {});
      const subV = createPlugin("v", {});
      const pluginW = createPlugin("w", { plugins: [subV] });
      const moduleA = createModule("a", {
        plugins: [pluginX, pluginY],
        components: [compZ]
      });

      const result = flattenPlugins([moduleA, pluginW]);
      expect(result).toEqual([pluginX, pluginY, compZ, subV, pluginW]);
    });

    it("fires onRegister in correct order for nested modules", () => {
      const callOrder: string[] = [];
      const innerMod = createModule("inner", {
        plugins: [createPlugin("innerPlugin", {})],
        onRegister: () => callOrder.push("inner")
      });
      const outerMod = createModule("outer", {
        plugins: [createPlugin("outerPlugin", {})],
        modules: [innerMod],
        onRegister: () => callOrder.push("outer")
      });
      flattenPlugins([outerMod]);
      // Outer fires first (before recursing into children), then inner fires
      expect(callOrder).toEqual(["outer", "inner"]);
    });
  });
});
