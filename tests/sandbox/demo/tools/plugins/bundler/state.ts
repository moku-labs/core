import type { BundlerState } from "./types";

/**
 * Create the initial bundler state. Outputs map starts empty, phase is
 * `"idle"`, and build count is zero. The phase transitions through
 * `"idle"` → `"building"` → `"done"` (or `"error"`) during `build()`.
 * Build count increments on each successful build.
 *
 * @returns {BundlerState} A fresh bundler state object.
 */
export const createBundlerState = (): BundlerState => ({
  outputs: new Map(),
  phase: "idle",
  buildCount: 0
});
