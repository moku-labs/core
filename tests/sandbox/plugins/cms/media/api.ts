import type { CmsCtx, MediaAsset } from "../types";
import { isValidMimeType } from "./processing";
import type { MediaApi, UploadInput } from "./types";

export const createMediaApi = (ctx: CmsCtx): MediaApi => {
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
