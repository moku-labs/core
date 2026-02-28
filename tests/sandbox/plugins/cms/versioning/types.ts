import type { Version } from "../types";

export type Diff = {
  field: string;
  before: unknown;
  after: unknown;
};

export type VersioningApi = {
  commit: (contentId: string, message: string) => Version;
  revert: (contentId: string, versionId: string) => boolean;
  diff: (contentId: string, versionId: string) => Diff[];
  history: (contentId: string) => Version[];
};
