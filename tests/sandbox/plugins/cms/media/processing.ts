import type { TransformOptions } from "./types";

export type TransformResult = {
  width: number;
  height: number;
  format: string;
  url: string;
};

export const transformAsset = (originalUrl: string, options: TransformOptions): TransformResult => {
  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const format = options.format ?? "jpeg";

  return {
    width,
    height,
    format,
    url: `${originalUrl}?w=${width}&h=${height}&fmt=${format}`
  };
};

export const isValidMimeType = (mimeType: string): boolean => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
  return allowed.includes(mimeType);
};
