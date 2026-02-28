// Shared types across all CMS modules.
// Module directories import from here; they do NOT import from each other.

export type CmsConfig = {
  defaultLocale: string;
  maxUploadSize: number;
};

export type ContentItem = {
  id: string;
  title: string;
  body: string;
  locale: string;
  status: "draft" | "published";
  createdAt: number;
  updatedAt: number;
};

export type MediaAsset = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedAt: number;
};

export type Version = {
  id: string;
  contentId: string;
  snapshot: ContentItem;
  createdAt: number;
  message: string;
};

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

export type CmsState = {
  content: Map<string, ContentItem>;
  media: Map<string, MediaAsset>;
  versions: Version[];
  nextId: number;
};
