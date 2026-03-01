import type { TransformOptions } from "./types";

/**
 * The result of a media asset transformation. Contains the computed
 * dimensions, output format, and the transformed URL with query parameters.
 * Returned by `transformAsset` for responsive image generation.
 */
export type TransformResult = {
  width: number;
  height: number;
  format: string;
  url: string;
};

/**
 * Generate a transformed URL for a media asset by appending width, height,
 * and format query parameters. Used for responsive image generation and
 * format conversion when serving media at different sizes.
 *
 * @param {string} originalUrl - The original asset URL to transform.
 * @param {TransformOptions} options - Desired dimensions and format (defaults: 800x600 jpeg).
 * @returns {TransformResult} The transformation result with computed dimensions and URL.
 */
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

/**
 * Check whether a MIME type is in the upload allowlist (JPEG, PNG, WebP,
 * GIF, PDF). Called by `media.upload()` to reject unsupported file types
 * before storing the asset.
 *
 * @param {string} mimeType - The MIME type string to validate.
 * @returns {boolean} True if the MIME type is allowed for upload.
 */
export const isValidMimeType = (mimeType: string): boolean => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
  return allowed.includes(mimeType);
};
