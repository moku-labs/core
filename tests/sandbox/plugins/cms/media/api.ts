import type { CmsCtx, MediaAsset } from "../types";
import { isValidMimeType } from "./processing";
import type { MediaApi, UploadInput } from "./types";

export const createMediaApi = (ctx: CmsCtx): MediaApi => {
  /**
   * Generate a sequential media ID using the shared `nextId` counter from
   * CMS state. Same pattern as content's `generateId` to maintain a single
   * ID namespace across all CMS modules.
   *
   * @returns {string} A unique media ID (e.g. "media-2").
   */
  const generateId = (): string => {
    const id = `media-${ctx.state.nextId}`;
    ctx.state.nextId++;
    return id;
  };

  return {
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
     * const asset = app.cms.media.upload({
     *   filename: "photo.jpg",
     *   mimeType: "image/jpeg",
     *   size: 1024
     * });
     * console.log(asset.url); // "/media/media-1/photo.jpg"
     * ```
     */
    upload: (input: UploadInput): MediaAsset => {
      if (!isValidMimeType(input.mimeType)) {
        throw new Error(
          `[plugin-test] Invalid mime type "${input.mimeType}".\n  Allowed types: image/jpeg, image/png, image/webp, image/gif, application/pdf.`
        );
      }

      if (input.size > ctx.config.maxUploadSize) {
        throw new Error(
          `[plugin-test] File size ${input.size} exceeds max upload size ${ctx.config.maxUploadSize}.\n  Reduce file size or increase maxUploadSize.`
        );
      }

      const id = generateId();
      const asset: MediaAsset = {
        id,
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.size,
        url: `/media/${id}/${input.filename}`,
        uploadedAt: Date.now()
      };

      ctx.state.media.set(id, asset);
      ctx.emit("cms:upload", { assetId: id, mimeType: input.mimeType });
      return asset;
    },

    /**
     * Retrieve a media asset by its ID. Used to look up a single asset
     * for display or download.
     *
     * @param {string} id - The media asset ID.
     * @returns {MediaAsset | undefined} The media asset, or undefined if not found.
     */
    getAsset: (id: string): MediaAsset | undefined => {
      return ctx.state.media.get(id);
    },

    /**
     * List all uploaded media assets. Returns a snapshot array —
     * useful for media library views and admin panels.
     *
     * @returns {MediaAsset[]} An array of all stored media assets.
     */
    list: (): MediaAsset[] => {
      return [...ctx.state.media.values()];
    },

    /**
     * Delete a media asset by ID. Removes it from the state store.
     *
     * @param {string} id - The media asset ID to delete.
     * @returns {boolean} True if the asset was found and deleted, false otherwise.
     */
    delete: (id: string): boolean => {
      return ctx.state.media.delete(id);
    }
  };
};
