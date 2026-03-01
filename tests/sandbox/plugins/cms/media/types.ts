import type { MediaAsset } from "../types";

/**
 * Input for uploading a media file.
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
   * @param input - The upload descriptor (filename, mimeType, size).
   * @returns The created media asset with generated ID and URL.
   * @throws {Error} When the mime type is not in the allowlist.
   * @throws {Error} When the file size exceeds `maxUploadSize`.
   */
  upload: (input: UploadInput) => MediaAsset;

  /**
   * Retrieve a media asset by its ID. Used to look up a single asset
   * for display or download.
   * @param id - The media asset ID.
   * @returns The media asset, or undefined if not found.
   */
  getAsset: (id: string) => MediaAsset | undefined;

  /**
   * List all uploaded media assets. Returns a snapshot array —
   * useful for media library views and admin panels.
   * @returns An array of all stored media assets.
   */
  list: () => MediaAsset[];

  /**
   * Delete a media asset by ID. Removes it from the state store.
   * @param id - The media asset ID to delete.
   * @returns True if the asset was found and deleted, false otherwise.
   */
  delete: (id: string) => boolean;
};
