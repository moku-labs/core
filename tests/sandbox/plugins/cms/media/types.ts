import type { MediaAsset } from "../types";

export type UploadInput = {
  filename: string;
  mimeType: string;
  size: number;
};

export type TransformOptions = {
  width?: number;
  height?: number;
  format?: "jpeg" | "png" | "webp";
};

export type MediaApi = {
  upload: (input: UploadInput) => MediaAsset;
  getAsset: (id: string) => MediaAsset | undefined;
  list: () => MediaAsset[];
  delete: (id: string) => boolean;
};
