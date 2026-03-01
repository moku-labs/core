import { describe, expect, it } from "vitest";

import { isValidMimeType, transformAsset } from "../../media/processing";

// ---------------------------------------------------------------------------
// Unit test: media processing (no kernel)
// ---------------------------------------------------------------------------

describe("transformAsset", () => {
  it("generates transform URL with dimensions and format", () => {
    const result = transformAsset("/media/img.jpg", {
      width: 300,
      height: 200,
      format: "webp"
    });

    expect(result).toEqual({
      width: 300,
      height: 200,
      format: "webp",
      url: "/media/img.jpg?w=300&h=200&fmt=webp"
    });
  });

  it("uses defaults when options are partial", () => {
    const result = transformAsset("/media/img.jpg", {});

    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.format).toBe("jpeg");
  });

  it("respects only width override", () => {
    const result = transformAsset("/media/img.jpg", { width: 400 });

    expect(result.width).toBe(400);
    expect(result.height).toBe(600); // default
  });
});

describe("isValidMimeType", () => {
  it("accepts image/jpeg", () => {
    expect(isValidMimeType("image/jpeg")).toBe(true);
  });

  it("accepts image/png", () => {
    expect(isValidMimeType("image/png")).toBe(true);
  });

  it("accepts image/webp", () => {
    expect(isValidMimeType("image/webp")).toBe(true);
  });

  it("accepts image/gif", () => {
    expect(isValidMimeType("image/gif")).toBe(true);
  });

  it("accepts application/pdf", () => {
    expect(isValidMimeType("application/pdf")).toBe(true);
  });

  it("rejects text/plain", () => {
    expect(isValidMimeType("text/plain")).toBe(false);
  });

  it("rejects application/json", () => {
    expect(isValidMimeType("application/json")).toBe(false);
  });
});
