import { describe, expect, it } from "vitest";

import * as core from "../../src";

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------
// src/index.ts is the sole authority on the public API. The docs (README,
// llms.txt, llms-full.txt, CLAUDE.md) claim exactly two runtime exports —
// this test keeps that claim honest.
// ---------------------------------------------------------------------------

describe("public API surface", () => {
  it("exposes exactly two runtime exports: createCoreConfig and createCorePlugin", () => {
    const runtimeExports = Object.keys(core).toSorted();

    expect(runtimeExports).toEqual(["createCoreConfig", "createCorePlugin"]);
  });

  it("both runtime exports are functions", () => {
    expect(typeof core.createCoreConfig).toBe("function");
    expect(typeof core.createCorePlugin).toBe("function");
  });
});
