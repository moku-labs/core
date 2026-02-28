import type { ContentItem } from "../types";

export type CreateContentInput = {
  title: string;
  body: string;
  locale?: string;
};

export type UpdateContentInput = {
  title?: string;
  body?: string;
  locale?: string;
  status?: "draft" | "published";
};

export type ContentQuery = {
  status?: "draft" | "published";
  locale?: string;
};

export type ContentApi = {
  create: (input: CreateContentInput) => ContentItem;
  update: (id: string, input: UpdateContentInput) => ContentItem;
  delete: (id: string) => boolean;
  getById: (id: string) => ContentItem | undefined;
  query: (query?: ContentQuery) => ContentItem[];
};
