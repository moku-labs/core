import { describe, expect, it, vi } from "vitest";

import type { CmsCtx, CmsState } from "../../types";
import { createMediaApi } from "../api";

// ---------------------------------------------------------------------------
// Unit test: createMediaApi (mock context, no kernel)
// ---------------------------------------------------------------------------

const createMockCtx = (): CmsCtx => {
  const state: CmsState = {
    content: new Map(),
    media: new Map(),
    versions: [],
    nextId: 1
  };

  return {
    config: { defaultLocale: "en", maxUploadSize: 10 * 1024 * 1024 },
    state,
    emit: vi.fn()
  };
};

describe("createMediaApi", () => {
  describe("upload", () => {
    it("uploads a valid file", () => {
      const ctx = createMockCtx();
      const api = createMediaApi(ctx);

      const asset = api.upload({
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        size: 1024
      });

      expect(asset.id).toBe("media-1");
      expect(asset.filename).toBe("photo.jpg");
      expect(asset.mimeType).toBe("image/jpeg");
      expect(asset.size).toBe(1024);
      expect(asset.url).toContain("photo.jpg");
    });

    it("emits cms:upload event", () => {
      const ctx = createMockCtx();
      const api = createMediaApi(ctx);

      api.upload({
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        size: 1024
      });

      expect(ctx.emit).toHaveBeenCalledWith("cms:upload", {
        assetId: "media-1",
        mimeType: "image/jpeg"
      });
    });

    it("rejects invalid mime type", () => {
      const ctx = createMockCtx();
      const api = createMediaApi(ctx);

      expect(() =>
        api.upload({
          filename: "data.json",
          mimeType: "application/json",
          size: 100
        })
      ).toThrow("Invalid mime type");
    });

    it("rejects files exceeding max upload size", () => {
      const ctx = createMockCtx();
      const api = createMediaApi(ctx);

      expect(() =>
        api.upload({
          filename: "big.jpg",
          mimeType: "image/jpeg",
          size: 100 * 1024 * 1024 // 100MB
        })
      ).toThrow("exceeds max upload size");
    });
  });

  describe("getAsset", () => {
    it("returns uploaded asset by ID", () => {
      const ctx = createMockCtx();
      const api = createMediaApi(ctx);

      const uploaded = api.upload({
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        size: 1024
      });
      const found = api.getAsset(uploaded.id);

      expect(found).toBeDefined();
      expect(found?.filename).toBe("photo.jpg");
    });

    it("returns undefined for nonexistent ID", () => {
      const ctx = createMockCtx();
      const api = createMediaApi(ctx);

      expect(api.getAsset("fake-id")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("returns all uploaded assets", () => {
      const ctx = createMockCtx();
      const api = createMediaApi(ctx);

      api.upload({
        filename: "a.jpg",
        mimeType: "image/jpeg",
        size: 100
      });
      api.upload({
        filename: "b.png",
        mimeType: "image/png",
        size: 200
      });

      expect(api.list()).toHaveLength(2);
    });
  });

  describe("delete", () => {
    it("removes asset from state", () => {
      const ctx = createMockCtx();
      const api = createMediaApi(ctx);

      const asset = api.upload({
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        size: 100
      });

      expect(api.delete(asset.id)).toBe(true);
      expect(api.getAsset(asset.id)).toBeUndefined();
    });

    it("returns false for nonexistent asset", () => {
      const ctx = createMockCtx();
      const api = createMediaApi(ctx);

      expect(api.delete("fake-id")).toBe(false);
    });
  });
});
