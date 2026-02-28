import { describe, expect, it } from "vitest";

import { validateContent } from "../validator";

// ---------------------------------------------------------------------------
// Unit test: content validator (no kernel)
// ---------------------------------------------------------------------------

describe("validateContent", () => {
  it("passes for valid input", () => {
    const errors = validateContent({ title: "Hello", body: "World" });
    expect(errors).toEqual([]);
  });

  it("fails when title is empty", () => {
    const errors = validateContent({ title: "", body: "Content" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("title");
    expect(errors[0]?.message).toBe("Title is required");
  });

  it("fails when title is whitespace only", () => {
    const errors = validateContent({ title: "   ", body: "Content" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("title");
  });

  it("fails when title exceeds 200 characters", () => {
    const errors = validateContent({
      title: "x".repeat(201),
      body: "Content"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("title");
    expect(errors[0]?.message).toBe("Title must be 200 characters or less");
  });

  it("fails when body is empty", () => {
    const errors = validateContent({ title: "Title", body: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe("body");
    expect(errors[0]?.message).toBe("Body is required");
  });

  it("reports multiple errors", () => {
    const errors = validateContent({ title: "", body: "" });
    expect(errors).toHaveLength(2);
    expect(errors.map(e => e.field)).toEqual(["title", "body"]);
  });
});
