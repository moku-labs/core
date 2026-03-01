import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createContentApi } from "../../content/api";
import type { CmsCtx, CmsState } from "../../types";

// ---------------------------------------------------------------------------
// Unit test: createContentApi (mock context, no kernel)
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

describe("createContentApi", () => {
  describe("create", () => {
    it("creates content with defaults", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      const item = api.create({ title: "Hello", body: "World" });

      expect(item.id).toBe("content-1");
      expect(item.title).toBe("Hello");
      expect(item.body).toBe("World");
      expect(item.locale).toBe("en");
      expect(item.status).toBe("draft");
      expect(item.createdAt).toBeTypeOf("number");
    });

    it("stores content in state", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      api.create({ title: "Test", body: "Content" });

      expect(ctx.state.content.size).toBe(1);
    });

    it("emits cms:draft event", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      api.create({ title: "Test", body: "Content" });

      expect(ctx.emit).toHaveBeenCalledWith("cms:draft", {
        contentId: "content-1"
      });
    });

    it("uses custom locale", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      const item = api.create({
        title: "Bonjour",
        body: "Le monde",
        locale: "fr"
      });

      expect(item.locale).toBe("fr");
    });

    it("throws on validation failure", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      expect(() => api.create({ title: "", body: "Content" })).toThrow("Invalid content");
    });

    it("generates unique IDs", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      const a = api.create({ title: "A", body: "a" });
      const b = api.create({ title: "B", body: "b" });

      expect(a.id).not.toBe(b.id);
    });
  });

  describe("update", () => {
    it("updates content fields", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      const item = api.create({ title: "Original", body: "Body" });
      const updated = api.update(item.id, { title: "Updated" });

      expect(updated.title).toBe("Updated");
      expect(updated.body).toBe("Body"); // unchanged
    });

    it("emits cms:publish on status change to published", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      const item = api.create({ title: "Post", body: "Content" });
      api.update(item.id, { status: "published" });

      expect(ctx.emit).toHaveBeenCalledWith("cms:publish", {
        contentId: item.id,
        path: "/post"
      });
    });

    it("throws for nonexistent content", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      expect(() => api.update("fake-id", { title: "X" })).toThrow('Content "fake-id" not found');
    });
  });

  describe("delete", () => {
    it("removes content from state", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      const item = api.create({ title: "Delete me", body: "Gone" });
      const result = api.delete(item.id);

      expect(result).toBe(true);
      expect(ctx.state.content.size).toBe(0);
    });

    it("returns false for nonexistent content", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      expect(api.delete("fake-id")).toBe(false);
    });
  });

  describe("getById", () => {
    it("returns content by ID", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      const item = api.create({ title: "Find me", body: "Here" });
      const found = api.getById(item.id);

      expect(found).toBeDefined();
      expect(found?.title).toBe("Find me");
    });

    it("returns undefined for nonexistent ID", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      expect(api.getById("fake-id")).toBeUndefined();
    });
  });

  describe("query", () => {
    it("returns all content without query", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      api.create({ title: "A", body: "a" });
      api.create({ title: "B", body: "b" });

      expect(api.query()).toHaveLength(2);
    });

    it("filters by status", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      const item = api.create({ title: "A", body: "a" });
      api.create({ title: "B", body: "b" });
      api.update(item.id, { status: "published" });

      expect(api.query({ status: "published" })).toHaveLength(1);
      expect(api.query({ status: "draft" })).toHaveLength(1);
    });

    it("filters by locale", () => {
      const ctx = createMockCtx();
      const api = createContentApi(ctx);

      api.create({ title: "English", body: "en" });
      api.create({ title: "French", body: "fr", locale: "fr" });

      expect(api.query({ locale: "en" })).toHaveLength(1);
      expect(api.query({ locale: "fr" })).toHaveLength(1);
    });
  });

  describe("types: domain emit", () => {
    it("accepts correct CMS event names and payloads", () => {
      const ctx = createMockCtx();

      ctx.emit("cms:draft", { contentId: "content-1" });
      ctx.emit("cms:publish", { contentId: "content-1", path: "/hello" });
      ctx.emit("cms:upload", { assetId: "media-1", mimeType: "image/jpeg" });

      expectTypeOf(ctx.emit).toBeFunction();
    });

    it("rejects unknown event names", () => {
      const ctx = createMockCtx();

      // @ts-expect-error -- "cms:unknown" is not a known CMS event
      ctx.emit("cms:unknown", { wrong: true });

      expect(ctx).toBeDefined();
    });

    it("rejects wrong payload shape", () => {
      const ctx = createMockCtx();

      // @ts-expect-error -- payload should be { contentId }, not { id }
      ctx.emit("cms:draft", { id: "content-1" });

      expect(ctx).toBeDefined();
    });

    it("rejects incomplete publish payload", () => {
      const ctx = createMockCtx();

      // @ts-expect-error -- cms:publish requires both contentId and path
      ctx.emit("cms:publish", { contentId: "content-1" });

      expect(ctx).toBeDefined();
    });
  });
});
