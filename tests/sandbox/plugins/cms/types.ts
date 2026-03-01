// Shared types across all CMS modules.
// Module directories import from here; they do NOT import from each other.

/**
 * CMS plugin configuration.
 *
 * @example
 * ```typescript
 * { defaultLocale: "en", maxUploadSize: 10 * 1024 * 1024 }
 * ```
 */
export type CmsConfig = {
  /** Default locale for new content. */
  defaultLocale: string;
  /** Maximum file upload size in bytes. */
  maxUploadSize: number;
};

/**
 * A content item managed by the CMS.
 *
 * @example
 * ```typescript
 * const item = app.cms.content.create({ title: "Hello", body: "World" });
 * // { id: "content-1", title: "Hello", body: "World", status: "draft", ... }
 * ```
 */
export type ContentItem = {
  id: string;
  title: string;
  body: string;
  locale: string;
  status: "draft" | "published";
  createdAt: number;
  updatedAt: number;
};

/**
 * A media asset uploaded to the CMS.
 *
 * @example
 * ```typescript
 * const asset = app.cms.media.upload({ filename: "photo.jpg", mimeType: "image/jpeg", size: 1024 });
 * // { id: "media-1", filename: "photo.jpg", url: "/media/photo.jpg", ... }
 * ```
 */
export type MediaAsset = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: number;
};

/**
 * A versioned snapshot of a content item.
 *
 * @example
 * ```typescript
 * const version = app.cms.versioning.commit(item.id, "Initial draft");
 * // { id: "version-1", contentId: "content-1", message: "Initial draft", ... }
 * ```
 */
export type Version = {
  id: string;
  contentId: string;
  snapshot: ContentItem;
  createdAt: number;
  message: string;
};

/**
 * Events emitted by the CMS plugin.
 *
 * @example
 * ```typescript
 * hooks: ctx => ({
 *   "cms:publish": ({ contentId, path }) => console.log(`Published at ${path}`),
 *   "cms:draft": ({ contentId }) => console.log(`Draft saved: ${contentId}`),
 *   "cms:upload": ({ assetId, mimeType }) => console.log(`Uploaded ${mimeType}`),
 * })
 * ```
 */
export type CmsEvents = {
  "cms:publish": { contentId: string; path: string };
  "cms:draft": { contentId: string };
  "cms:upload": { assetId: string; mimeType: string };
};

export type CmsCtx = {
  config: CmsConfig;
  state: CmsState;
  emit: {
    (name: "cms:publish", payload: CmsEvents["cms:publish"]): void;
    (name: "cms:draft", payload: CmsEvents["cms:draft"]): void;
    (name: "cms:upload", payload: CmsEvents["cms:upload"]): void;
  };
};

/**
 * Internal mutable state for the CMS plugin. Shared across all CMS modules
 * (content, media, versioning) via the `CmsCtx` context.
 *
 * @example
 * ```typescript
 * // After creating one content item and uploading one media asset
 * {
 *   content: Map { "content-1" => { id: "content-1", title: "Hello", ... } },
 *   media: Map { "media-2" => { id: "media-2", filename: "photo.jpg", ... } },
 *   versions: [{ id: "version-3", contentId: "content-1", message: "Initial", ... }],
 *   nextId: 4
 * }
 * ```
 */
export type CmsState = {
  /** All content items keyed by ID. Created by `content.create()`, updated by `content.update()`. */
  content: Map<string, ContentItem>;
  /** All media assets keyed by ID. Created by `media.upload()`. */
  media: Map<string, MediaAsset>;
  /** Chronological list of version snapshots. Appended by `versioning.commit()`. */
  versions: Version[];
  /** Auto-incrementing counter for generating unique IDs across all modules. Shared to avoid collisions. */
  nextId: number;
};
