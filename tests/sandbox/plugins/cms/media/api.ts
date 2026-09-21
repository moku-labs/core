import type { CmsCtx, MediaAsset } from "../types";
import { isValidMimeType } from "./processing";
import type { MediaApi, UploadInput } from "./types";

/**
 * Build the media API of the CMS plugin, mounted at `app.cms.media`. The contract of each
 * method lives on the members of `MediaApi`: the factory is annotated with that type, so JSDoc on
 * the members below would never reach the published declarations.
 *
 * @param {CmsCtx} ctx - The CMS plugin context with config, state and emit.
 * @returns {MediaApi} The media API.
 */
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

    getAsset: (id: string): MediaAsset | undefined => {
      return ctx.state.media.get(id);
    },

    list: (): MediaAsset[] => {
      return [...ctx.state.media.values()];
    },

    delete: (id: string): boolean => {
      return ctx.state.media.delete(id);
    }
  };
};
