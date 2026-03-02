import { describe, expect, expectTypeOf, it } from "vitest";
import { analyticsPlugin } from "../../../analytics";
import { coreConfig } from "../../../config";
import { routerPlugin } from "../../../router";
import { cmsPlugin } from "../../index";

// ---------------------------------------------------------------------------
// Integration test: CMS plugin (very complex tier) with createApp
// ---------------------------------------------------------------------------

const createTestApp = async (
  cmsConfig?: Partial<{ defaultLocale: string; maxUploadSize: number }>
) => {
  const { createApp } = coreConfig.createCore(coreConfig, {
    plugins: [routerPlugin, analyticsPlugin, cmsPlugin]
  });
  if (cmsConfig) {
    return createApp({
      pluginConfigs: {
        analytics: { trackingId: "test-123" },
        cms: cmsConfig
      }
    });
  }
  return createApp({
    pluginConfigs: { analytics: { trackingId: "test-123" } }
  });
};

describe("very complex tier: cms plugin (integration)", () => {
  // -------------------------------------------------------------------------
  // Runtime: namespaced API
  // -------------------------------------------------------------------------

  describe("runtime: namespaced API", () => {
    it("CMS plugin provides content, media, versioning namespaces", async () => {
      const app = await createTestApp();

      expect(app.cms).toBeDefined();
      expect(app.cms.content).toBeDefined();
      expect(app.cms.media).toBeDefined();
      expect(app.cms.versioning).toBeDefined();
    });

    it("content CRUD operations work end-to-end", async () => {
      const app = await createTestApp();

      // Create
      const item = app.cms.content.create({
        title: "Hello World",
        body: "My first post"
      });
      expect(item.title).toBe("Hello World");
      expect(item.status).toBe("draft");

      // Read
      const found = app.cms.content.getById(item.id);
      expect(found?.title).toBe("Hello World");

      // Update
      const updated = app.cms.content.update(item.id, {
        title: "Updated Title"
      });
      expect(updated.title).toBe("Updated Title");

      // Query
      expect(app.cms.content.query()).toHaveLength(1);

      // Delete
      expect(app.cms.content.delete(item.id)).toBe(true);
      expect(app.cms.content.query()).toHaveLength(0);
    });

    it("media upload and retrieval work", async () => {
      const app = await createTestApp();

      const asset = app.cms.media.upload({
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        size: 1024
      });

      expect(asset.filename).toBe("photo.jpg");
      expect(app.cms.media.getAsset(asset.id)).toBeDefined();
      expect(app.cms.media.list()).toHaveLength(1);
    });

    it("versioning commit and revert work", async () => {
      const app = await createTestApp();

      const item = app.cms.content.create({
        title: "Original",
        body: "Content"
      });

      const version = app.cms.versioning.commit(item.id, "Initial");
      expect(version.message).toBe("Initial");

      app.cms.content.update(item.id, { title: "Modified" });
      expect(app.cms.content.getById(item.id)?.title).toBe("Modified");

      app.cms.versioning.revert(item.id, version.id);
      expect(app.cms.content.getById(item.id)?.title).toBe("Original");
    });

    it("versioning diff shows changes", async () => {
      const app = await createTestApp();

      const item = app.cms.content.create({
        title: "Original",
        body: "Content"
      });

      const version = app.cms.versioning.commit(item.id, "v1");
      app.cms.content.update(item.id, { title: "Changed" });

      const diffs = app.cms.versioning.diff(item.id, version.id);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.field).toBe("title");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: config overrides
  // -------------------------------------------------------------------------

  describe("runtime: config overrides", () => {
    it("respects custom defaultLocale", async () => {
      const app = await createTestApp({ defaultLocale: "fr" });

      const item = app.cms.content.create({
        title: "Bonjour",
        body: "Le monde"
      });

      expect(item.locale).toBe("fr");
    });

    it("respects custom maxUploadSize", async () => {
      const app = await createTestApp({ maxUploadSize: 100 });

      expect(() =>
        app.cms.media.upload({
          filename: "big.jpg",
          mimeType: "image/jpeg",
          size: 200
        })
      ).toThrow("exceeds max upload size");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: dependency interaction
  // -------------------------------------------------------------------------

  describe("runtime: dependency interaction", () => {
    it("router and analytics are accessible", async () => {
      const app = await createTestApp();

      expect(app.router).toBeDefined();
      expect(app.analytics).toBeDefined();
      expect(app.router.current()).toBe("/");
    });

    it("all three plugins coexist on the app surface", async () => {
      const app = await createTestApp();

      // All plugins are on the surface
      expect(Object.isFrozen(app)).toBe(true);
      expect(typeof app.router.navigate).toBe("function");
      expect(typeof app.analytics.track).toBe("function");
      expect(typeof app.cms.content.create).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // Runtime: events
  // -------------------------------------------------------------------------

  describe("runtime: events", () => {
    it("cms:draft fires on content create", async () => {
      const drafts: Array<{ contentId: string }> = [];

      const { createApp, createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin, cmsPlugin]
      });

      const listenerPlugin = createPlugin("draft-listener", {
        depends: [cmsPlugin],
        hooks: _ctx => ({
          "cms:draft": payload => {
            drafts.push(payload);
          }
        })
      });

      const app = createApp({
        plugins: [listenerPlugin],
        pluginConfigs: { analytics: { trackingId: "test-123" } }
      });

      app.cms.content.create({ title: "Test", body: "Content" });

      expect(drafts).toHaveLength(1);
      expect(drafts[0]?.contentId).toMatch(/^content-/);
    });

    it("cms:publish fires on status change to published", async () => {
      const published: Array<{ contentId: string; path: string }> = [];

      const { createApp, createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin, cmsPlugin]
      });

      const listenerPlugin = createPlugin("publish-listener", {
        depends: [cmsPlugin],
        hooks: _ctx => ({
          "cms:publish": payload => {
            published.push(payload);
          }
        })
      });

      const app = createApp({
        plugins: [listenerPlugin],
        pluginConfigs: { analytics: { trackingId: "test-123" } }
      });

      const item = app.cms.content.create({
        title: "My Post",
        body: "Content"
      });
      app.cms.content.update(item.id, { status: "published" });

      expect(published).toHaveLength(1);
      expect(published[0]?.contentId).toBe(item.id);
    });

    it("cms:upload fires on media upload", async () => {
      const uploads: Array<{ assetId: string; mimeType: string }> = [];

      const { createApp, createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin, cmsPlugin]
      });

      const listenerPlugin = createPlugin("upload-listener", {
        depends: [cmsPlugin],
        hooks: _ctx => ({
          "cms:upload": payload => {
            uploads.push(payload);
          }
        })
      });

      const app = createApp({
        plugins: [listenerPlugin],
        pluginConfigs: { analytics: { trackingId: "test-123" } }
      });

      app.cms.media.upload({
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        size: 1024
      });

      expect(uploads).toHaveLength(1);
      expect(uploads[0]?.mimeType).toBe("image/jpeg");
    });
  });

  // -------------------------------------------------------------------------
  // Types: namespaced API
  // -------------------------------------------------------------------------

  describe("types: namespaced API", () => {
    it("content API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.cms.content.create).toBeFunction();
      expectTypeOf(app.cms.content.update).toBeFunction();
      expectTypeOf(app.cms.content.delete).toBeFunction();
      expectTypeOf(app.cms.content.getById).toBeFunction();
      expectTypeOf(app.cms.content.query).toBeFunction();
    });

    it("media API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.cms.media.upload).toBeFunction();
      expectTypeOf(app.cms.media.getAsset).toBeFunction();
      expectTypeOf(app.cms.media.list).toBeFunction();
      expectTypeOf(app.cms.media.delete).toBeFunction();
    });

    it("versioning API methods are typed", async () => {
      const app = await createTestApp();

      expectTypeOf(app.cms.versioning.commit).toBeFunction();
      expectTypeOf(app.cms.versioning.revert).toBeFunction();
      expectTypeOf(app.cms.versioning.diff).toBeFunction();
      expectTypeOf(app.cms.versioning.history).toBeFunction();
    });

    it("content.create returns ContentItem", async () => {
      const app = await createTestApp();

      expectTypeOf(app.cms.content.create).returns.toMatchTypeOf<{
        id: string;
        title: string;
        body: string;
        locale: string;
        status: "draft" | "published";
      }>();
    });

    it("media.upload returns MediaAsset", async () => {
      const app = await createTestApp();

      expectTypeOf(app.cms.media.upload).returns.toMatchTypeOf<{
        id: string;
        filename: string;
        mimeType: string;
        size: number;
        url: string;
      }>();
    });

    it("versioning.commit returns Version", async () => {
      const app = await createTestApp();

      expectTypeOf(app.cms.versioning.commit).returns.toMatchTypeOf<{
        id: string;
        contentId: string;
        message: string;
      }>();
    });

    it("plugin name is literal type", () => {
      expectTypeOf(cmsPlugin.name).toEqualTypeOf<"cms">();
    });
  });

  // -------------------------------------------------------------------------
  // Types: events
  // -------------------------------------------------------------------------

  describe("types: events", () => {
    it("cms event payloads are typed in hooks", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin, cmsPlugin]
      });

      createPlugin("cms-event-types", {
        depends: [cmsPlugin],
        hooks: _ctx => ({
          "cms:publish": payload => {
            expectTypeOf(payload).toEqualTypeOf<{
              contentId: string;
              path: string;
            }>();
          },
          "cms:draft": payload => {
            expectTypeOf(payload).toEqualTypeOf<{ contentId: string }>();
          },
          "cms:upload": payload => {
            expectTypeOf(payload).toEqualTypeOf<{
              assetId: string;
              mimeType: string;
            }>();
          }
        })
      });
    });

    it("dependent sees router + analytics + cms events", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin, cmsPlugin]
      });

      const plugin = createPlugin("multi-dep", {
        depends: [routerPlugin, analyticsPlugin, cmsPlugin],
        api: ctx => ({
          test: () => {
            ctx.emit("router:navigate", { from: "/", to: "/test" });
            ctx.emit("analytics:track", {
              event: "click",
              properties: {}
            });
            ctx.emit("cms:draft", { contentId: "content-1" });
          }
        })
      });

      expect(plugin.name).toBe("multi-dep");
    });

    it("rejects wrong cms event payloads", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin, cmsPlugin]
      });

      const plugin = createPlugin("wrong-cms-payload", {
        depends: [cmsPlugin],
        api: ctx => ({
          test: () => {
            // @ts-expect-error -- contentId should be string, not number
            ctx.emit("cms:draft", { contentId: 123 });
          }
        })
      });

      expect(plugin.name).toBe("wrong-cms-payload");
    });
  });

  // -------------------------------------------------------------------------
  // Types: require
  // -------------------------------------------------------------------------

  describe("types: require", () => {
    it("ctx.require returns typed namespaced API", () => {
      const { createPlugin } = coreConfig.createCore(coreConfig, {
        plugins: [routerPlugin, analyticsPlugin, cmsPlugin]
      });

      createPlugin("require-cms", {
        depends: [cmsPlugin],
        api: ctx => {
          const cms = ctx.require(cmsPlugin);

          expectTypeOf(cms.content).toHaveProperty("create");
          expectTypeOf(cms.media).toHaveProperty("upload");
          expectTypeOf(cms.versioning).toHaveProperty("commit");

          return {};
        }
      });
    });

    it("app.require returns typed namespaced API", async () => {
      const app = await createTestApp();

      const cms = app.require(cmsPlugin);

      expectTypeOf(cms.content.create).toBeFunction();
      expectTypeOf(cms.media.upload).toBeFunction();
      expectTypeOf(cms.versioning.commit).toBeFunction();
    });
  });
});
