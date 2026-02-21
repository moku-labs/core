// Type-level tests have been moved to dedicated files:
// - phantom-types.test-d.ts: Instance interfaces, phantom type extraction, lifecycle contexts
// - type-helpers.test-d.ts: All 8 type helpers, BuildPluginConfigs, BuildPluginApis, context tiers
//
// This placeholder is kept for backward compatibility with the sandbox test project.

import { expectTypeOf, test } from "vitest";

test("type infrastructure works", () => {
  expectTypeOf<string>().toBeString();
  expectTypeOf<number>().not.toBeString();
});
