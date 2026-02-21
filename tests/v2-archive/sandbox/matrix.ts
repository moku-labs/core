/**
 * Variant matrix for sandbox combinatorial testing.
 *
 * Four dimensions of test data consumed by sandbox variant test files.
 * Each dimension is an array of labeled test cases for use with `test.for()`.
 */

/** Config shape variants for testing createCore/createApp with different configurations */
export const configVariants = [
  { label: "empty config", global: {} },
  { label: "minimal config", global: { name: "test-app" } },
  {
    label: "full config",
    global: { name: "test-app", debug: true, version: "1.0.0" }
  }
] as const;

/** Plugin arrangement variants for testing different plugin compositions */
export const pluginVariants = [
  { label: "zero plugins", plugins: [] },
  { label: "single plugin", plugins: ["alpha"] },
  { label: "two independent plugins", plugins: ["alpha", "beta"] },
  {
    label: "plugin with dependency",
    plugins: ["alpha", "beta"],
    depends: { beta: ["alpha"] }
  },
  {
    label: "plugin with component",
    plugins: ["alpha"],
    components: ["widget"]
  },
  { label: "plugin with module", plugins: ["alpha"], modules: ["helpers"] }
] as const;

/** Lifecycle edge case scenarios for testing boundary conditions */
export const lifecycleEdgeCases = [
  { label: "normal flow", scenario: "init-start-stop-destroy" },
  { label: "double start", scenario: "init-start-start" },
  { label: "stop without start", scenario: "init-stop" },
  { label: "destroy without stop", scenario: "init-destroy" },
  { label: "async lifecycle", scenario: "init-async-start-async-stop-destroy" }
] as const;

/** Type boundary variants for testing type inference edge cases */
export const typeBoundaryVariants = [
  { label: "void config", configType: "void" },
  { label: "required config", configType: "required" },
  { label: "config with defaults", configType: "with-defaults" },
  { label: "empty api", apiType: "empty" },
  { label: "complex api", apiType: "complex" }
] as const;
