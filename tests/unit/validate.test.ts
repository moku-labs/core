import { describe, expect, it } from "vitest";
import { validatePlugins } from "../../src/flatten";
import { createCore } from "../../src/index";

describe("validatePlugins", () => {
  const core = createCore("test-fw", { config: {} });
  const { createPlugin, createComponent } = core;

  describe("happy path (no errors)", () => {
    it("does not throw for empty list", () => {
      expect(() => validatePlugins("test-fw", [])).not.toThrow();
    });

    it("does not throw for single plugin", () => {
      const plugin = createPlugin("auth", {});
      expect(() => validatePlugins("test-fw", [plugin])).not.toThrow();
    });

    it("does not throw for multiple plugins with unique names", () => {
      const a = createPlugin("a", {});
      const b = createPlugin("b", {});
      const c = createPlugin("c", {});
      expect(() => validatePlugins("test-fw", [a, b, c])).not.toThrow();
    });

    it("does not throw when depends is satisfied in correct order", () => {
      const logger = createPlugin("logger", {});
      const router = createPlugin("router", { depends: [logger] });
      expect(() => validatePlugins("test-fw", [logger, router])).not.toThrow();
    });

    it("does not throw when depends is an empty array", () => {
      const plugin = createPlugin("auth", { depends: [] });
      expect(() => validatePlugins("test-fw", [plugin])).not.toThrow();
    });

    it("does not throw when plugin has no depends field", () => {
      const plugin = createPlugin("auth", {});
      expect(() => validatePlugins("test-fw", [plugin])).not.toThrow();
    });

    it("does not throw for a component with unique name", () => {
      const comp = createComponent("sidebar", {});
      expect(() => validatePlugins("test-fw", [comp])).not.toThrow();
    });
  });

  describe("duplicate detection (FLAT-03)", () => {
    it("throws when two plugins have the same name", () => {
      const a1 = createPlugin("auth", {});
      const a2 = createPlugin("auth", {});
      expect(() => validatePlugins("test-fw", [a1, a2])).toThrow(/Duplicate plugin name "auth"/);
    });

    it("error includes both 0-based positions", () => {
      const a = createPlugin("x", {});
      const b = createPlugin("y", {});
      const c = createPlugin("x", {});
      expect(() => validatePlugins("test-fw", [a, b, c])).toThrow(/positions 0 and 2/);
    });

    it("throws on first duplicate pair when three plugins share a name", () => {
      const a1 = createPlugin("dup", {});
      const a2 = createPlugin("dup", {});
      const a3 = createPlugin("dup", {});
      expect(() => validatePlugins("test-fw", [a1, a2, a3])).toThrow(/positions 0 and 1/);
    });

    it("error message includes framework name in brackets", () => {
      const a1 = createPlugin("auth", {});
      const a2 = createPlugin("auth", {});
      expect(() => validatePlugins("myFramework", [a1, a2])).toThrow(/\[myFramework\]/);
    });

    it("error message matches expected format", () => {
      const a1 = createPlugin("auth", {});
      const a2 = createPlugin("auth", {});
      try {
        validatePlugins("test-fw", [a1, a2]);
        expect.unreachable("should have thrown");
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        expect(error.message).toContain('[test-fw] Duplicate plugin name "auth"');
        expect(error.message).toContain("Found at positions 0 and 1");
        expect(error.message).toContain("\n  Rename one of the plugins or remove the duplicate.");
      }
    });
  });

  describe("missing dependency (FLAT-04)", () => {
    it("throws when plugin depends on non-existent plugin", () => {
      const authRef = createPlugin("auth", {});
      const router = createPlugin("router", { depends: [authRef] });
      // authRef is NOT in the plugin list -- only router is
      expect(() => validatePlugins("test-fw", [router])).toThrow(
        /depends on "auth", but "auth" is not registered/
      );
    });

    it("error message includes dependent name and missing dependency name", () => {
      const authRef = createPlugin("auth", {});
      const dashboard = createPlugin("dashboard", { depends: [authRef] });
      expect(() => validatePlugins("test-fw", [dashboard])).toThrow(
        /Plugin "dashboard" depends on "auth"/
      );
    });

    it("error message suggests adding the plugin", () => {
      const authRef = createPlugin("auth", {});
      const dashboard = createPlugin("dashboard", { depends: [authRef] });
      try {
        validatePlugins("test-fw", [dashboard]);
        expect.unreachable("should have thrown");
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        expect(error.message).toContain('Add "auth" to your plugin list before "dashboard"');
      }
    });

    it("error message matches expected format", () => {
      const authRef = createPlugin("auth", {});
      const dashboard = createPlugin("dashboard", { depends: [authRef] });
      try {
        validatePlugins("test-fw", [dashboard]);
        expect.unreachable("should have thrown");
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        expect(error.message).toBe(
          '[test-fw] Plugin "dashboard" depends on "auth", but "auth" is not registered.\n  Add "auth" to your plugin list before "dashboard".'
        );
      }
    });
  });

  describe("wrong dependency order (FLAT-05)", () => {
    it("throws when plugin depends on plugin that appears after it", () => {
      const auth = createPlugin("auth", {});
      const dashboard = createPlugin("dashboard", { depends: [auth] });
      expect(() => validatePlugins("test-fw", [dashboard, auth])).toThrow(
        /depends on "auth", but "auth" appears after "dashboard"/
      );
    });

    it("error message includes both plugin names", () => {
      const auth = createPlugin("auth", {});
      const dashboard = createPlugin("dashboard", { depends: [auth] });
      expect(() => validatePlugins("test-fw", [dashboard, auth])).toThrow(
        /Plugin "dashboard" depends on "auth"/
      );
    });

    it("error message suggests moving", () => {
      const auth = createPlugin("auth", {});
      const dashboard = createPlugin("dashboard", { depends: [auth] });
      try {
        validatePlugins("test-fw", [dashboard, auth]);
        expect.unreachable("should have thrown");
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        expect(error.message).toContain('Move "auth" before "dashboard"');
      }
    });

    it("error message matches expected format", () => {
      const auth = createPlugin("auth", {});
      const dashboard = createPlugin("dashboard", { depends: [auth] });
      try {
        validatePlugins("test-fw", [dashboard, auth]);
        expect.unreachable("should have thrown");
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        expect(error.message).toBe(
          '[test-fw] Plugin "dashboard" depends on "auth", but "auth" appears after "dashboard".\n  Move "auth" before "dashboard" in your plugin list.'
        );
      }
    });
  });

  describe("circular dependency detection", () => {
    it("detects A depends on B, B depends on A", () => {
      // Create instances first, then use them in depends
      // A at position 0 depends on B at position 1 -> A sees B after it -> throws
      const b = createPlugin("b", {});
      const a = createPlugin("a", { depends: [b] });
      // Recreate b with depends on a (circular)
      const bWithDep = createPlugin("b", { depends: [a] });
      expect(() => validatePlugins("test-fw", [a, bWithDep])).toThrow(
        /Plugin "a" depends on "b", but "b" appears after "a"/
      );
    });

    it("detects A depends on B, B depends on C, C depends on A", () => {
      // Create reference instances for circular deps
      const cRef = createPlugin("c", {});
      const aRef = createPlugin("a", {});
      const bRef = createPlugin("b", {});
      const a = createPlugin("a", { depends: [cRef] });
      const b = createPlugin("b", { depends: [aRef] });
      const c = createPlugin("c", { depends: [bRef] });
      // a at 0 depends on c at 2 -> a sees c after it -> throws
      expect(() => validatePlugins("test-fw", [a, b, c])).toThrow(
        /Plugin "a" depends on "c", but "c" appears after "a"/
      );
    });
  });

  describe("edge cases", () => {
    it("validates multiple dependencies correctly", () => {
      const logger = createPlugin("logger", {});
      const db = createPlugin("db", {});
      const service = createPlugin("service", { depends: [logger, db] });
      expect(() => validatePlugins("test-fw", [logger, db, service])).not.toThrow();
    });

    it("throws on first failing dependency in a list", () => {
      const logger = createPlugin("logger", {});
      const nonexistentRef = createPlugin("nonexistent", {});
      const service = createPlugin("service", {
        depends: [logger, nonexistentRef]
      });
      expect(() => validatePlugins("test-fw", [logger, service])).toThrow(
        /depends on "nonexistent", but "nonexistent" is not registered/
      );
    });

    it("validates components with depends", () => {
      const auth = createPlugin("auth", {});
      const sidebar = createComponent("sidebar", { depends: [auth] });
      expect(() => validatePlugins("test-fw", [auth, sidebar])).not.toThrow();
    });

    it("uses the provided framework name in all error messages", () => {
      const a1 = createPlugin("x", {});
      const a2 = createPlugin("x", {});
      expect(() => validatePlugins("my-custom-name", [a1, a2])).toThrow(/\[my-custom-name\]/);
    });
  });
});
