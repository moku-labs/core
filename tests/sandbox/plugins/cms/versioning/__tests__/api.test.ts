import { describe, expect, it, vi } from "vitest";

import type { CmsCtx, CmsState, ContentItem } from "../../types";
import { createVersioningApi } from "../api";

// ---------------------------------------------------------------------------
// Unit test: createVersioningApi (mock context, no kernel)
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

const createContentItem = (overrides?: Partial<ContentItem>): ContentItem => ({
  id: "content-1",
  title: "Test",
  body: "Content",
  locale: "en",
  status: "draft",
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides
});

describe("createVersioningApi", () => {
  describe("commit", () => {
    it("creates a version snapshot of content", () => {
      const ctx = createMockCtx();
      const item = createContentItem();
      ctx.state.content.set(item.id, item);

      const api = createVersioningApi(ctx);
      const version = api.commit(item.id, "Initial commit");

      expect(version.id).toBe("version-1");
      expect(version.contentId).toBe(item.id);
      expect(version.message).toBe("Initial commit");
      expect(version.snapshot.title).toBe("Test");
    });

    it("stores version in state", () => {
      const ctx = createMockCtx();
      const item = createContentItem();
      ctx.state.content.set(item.id, item);

      const api = createVersioningApi(ctx);
      api.commit(item.id, "v1");

      expect(ctx.state.versions).toHaveLength(1);
    });

    it("snapshot is a copy, not a reference", () => {
      const ctx = createMockCtx();
      const item = createContentItem();
      ctx.state.content.set(item.id, item);

      const api = createVersioningApi(ctx);
      const version = api.commit(item.id, "v1");

      // Modify the original
      item.title = "Modified";

      // Snapshot should still have the original title
      expect(version.snapshot.title).toBe("Test");
    });

    it("throws for nonexistent content", () => {
      const ctx = createMockCtx();
      const api = createVersioningApi(ctx);

      expect(() => api.commit("fake-id", "v1")).toThrow('Content "fake-id" not found');
    });
  });

  describe("revert", () => {
    it("restores content to a previous version", () => {
      const ctx = createMockCtx();
      const item = createContentItem({ title: "Original" });
      ctx.state.content.set(item.id, item);

      const api = createVersioningApi(ctx);
      const version = api.commit(item.id, "v1");

      // Modify content
      item.title = "Modified";
      ctx.state.content.set(item.id, item);

      const result = api.revert(item.id, version.id);

      expect(result).toBe(true);
      expect(ctx.state.content.get(item.id)?.title).toBe("Original");
    });

    it("returns false for nonexistent version", () => {
      const ctx = createMockCtx();
      const api = createVersioningApi(ctx);

      expect(api.revert("content-1", "fake-version")).toBe(false);
    });
  });

  describe("diff", () => {
    it("shows differences between current and version", () => {
      const ctx = createMockCtx();
      const item = createContentItem({ title: "Original" });
      ctx.state.content.set(item.id, item);

      const api = createVersioningApi(ctx);
      const version = api.commit(item.id, "v1");

      // Modify content
      const modified = { ...item, title: "Modified", updatedAt: 2000 };
      ctx.state.content.set(item.id, modified);

      const diffs = api.diff(item.id, version.id);

      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        field: "title",
        before: "Original",
        after: "Modified"
      });
    });

    it("returns empty array when no differences", () => {
      const ctx = createMockCtx();
      const item = createContentItem();
      ctx.state.content.set(item.id, item);

      const api = createVersioningApi(ctx);
      const version = api.commit(item.id, "v1");

      const diffs = api.diff(item.id, version.id);
      expect(diffs).toEqual([]);
    });

    it("returns empty array for nonexistent content", () => {
      const ctx = createMockCtx();
      const api = createVersioningApi(ctx);

      expect(api.diff("fake", "fake")).toEqual([]);
    });
  });

  describe("history", () => {
    it("returns all versions for a content ID", () => {
      const ctx = createMockCtx();
      const item = createContentItem();
      ctx.state.content.set(item.id, item);

      const api = createVersioningApi(ctx);
      api.commit(item.id, "v1");
      api.commit(item.id, "v2");

      const versions = api.history(item.id);
      expect(versions).toHaveLength(2);
      expect(versions.map(v => v.message)).toEqual(["v1", "v2"]);
    });

    it("returns empty array for content with no versions", () => {
      const ctx = createMockCtx();
      const api = createVersioningApi(ctx);

      expect(api.history("content-1")).toEqual([]);
    });

    it("does not return versions for other content", () => {
      const ctx = createMockCtx();
      const item1 = createContentItem({ id: "content-1" });
      const item2 = createContentItem({ id: "content-2" });
      ctx.state.content.set(item1.id, item1);
      ctx.state.content.set(item2.id, item2);

      const api = createVersioningApi(ctx);
      api.commit("content-1", "v1");
      api.commit("content-2", "v2");

      expect(api.history("content-1")).toHaveLength(1);
      expect(api.history("content-2")).toHaveLength(1);
    });
  });
});
