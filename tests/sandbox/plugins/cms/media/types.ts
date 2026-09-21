import type { MediaAsset } from "../types";

/**
 * Input for uploading a media file.
 *
 * @example
 * ```typescript
 * app.cms.media.upload({ filename: "photo.jpg", mimeType: "image/jpeg", size: 1024 })
 * ```
 */
export type UploadInput = {
  filename: string;
  mimeType: string;
  size: number;
};

/**
 * Options for transforming a media asset (resize, format conversion).
 *
 * @example
 * ```typescript
 * transformAsset(asset.url, { width: 300, height: 200, format: "webp" })
 * ```
 */
export type TransformOptions = {
  width?: number;
  height?: number;
  format?: "jpeg" | "png" | "webp";
};

/**
 * Media module API.
 *
 * @example
 * ```typescript
 * const asset = app.cms.media.upload({ filename: "photo.jpg", mimeType: "image/jpeg", size: 1024 });
 * app.cms.media.getAsset(asset.id);
 * app.cms.media.list();
 * ```
 */
export type MediaApi = {
  /**
   * Upload a media file. Validates the mime type against the allowlist
   * and checks the file size against `maxUploadSize`. Stores the asset
   * in state and emits `cms:upload` on success.
   *
   * @param {UploadInput} input - The upload descriptor (filename, mimeType, size).
   * @returns {MediaAsset} The created media asset with generated ID and URL.
   * @throws {Error} When the mime type is not in the allowlist.
   * @throws {Error} When the file size exceeds `maxUploadSize`.
   * @example
   * ```typescript
   * // The editor attaches a cover image.
   * const asset = app.cms.media.upload({ filename: "cover.png", mimeType: "image/png", size: 2048 });
   * asset.url; // `/media/${asset.id}/cover.png`
   * ```
   */
  upload: (input: UploadInput) => MediaAsset;

  /**
   * Retrieve a media asset by its ID. Used to look up a single asset
   * for display or download.
   *
   * @param {string} id - The media asset ID.
   * @returns {MediaAsset | undefined} The media asset, or undefined if not found.
   * @example
   * ```typescript
   * // Show the attachment next to the post.
   * app.cms.media.getAsset(asset.id)?.filename; // "cover.png"
   * app.cms.media.getAsset("missing"); // undefined
   * ```
   */
  getAsset: (id: string) => MediaAsset | undefined;

  /**
   * List all uploaded media assets. Returns a snapshot array —
   * useful for media library views and admin panels.
   *
   * @returns {MediaAsset[]} An array of all stored media assets.
   * @example
   * ```typescript
   * // The media library page, after one upload.
   * app.cms.media.list().map(item => item.filename); // ["cover.png"]
   * ```
   */
  list: () => MediaAsset[];

  /**
   * Delete a media asset by ID. Removes it from the state store.
   *
   * @param {string} id - The media asset ID to delete.
   * @returns {boolean} True if the asset was found and deleted, false otherwise.
   * @example
   * ```typescript
   * // The editor removes an attachment.
   * app.cms.media.delete(asset.id); // true
   * app.cms.media.delete(asset.id); // false: already gone
   * ```
   */
  delete: (id: string) => boolean;
};
