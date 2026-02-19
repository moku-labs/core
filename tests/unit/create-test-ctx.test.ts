import { describe, expect, it } from "vitest";
import { createTestCtx } from "../../src/testing/index";

describe("createTestCtx", () => {
  // Stub-phase throw test

  it("throws not implemented", () => {
    expect(() => createTestCtx()).toThrowError("[moku_core]");
  });

  // Error format test

  it("error includes function name and skeleton message", () => {
    try {
      createTestCtx();
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("[moku_core]");
      expect(message).toContain("createTestCtx");
      expect(message).toContain("is not yet implemented");
      expect(message).toContain("stub from the skeleton phase");
    }
  });
});
