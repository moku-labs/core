import type { CmsCtx, ContentItem, Version } from "../types";
import type { Diff, VersioningApi } from "./types";

/**
 * Build the versioning API of the CMS plugin, mounted at `app.cms.versioning`. The contract of each
 * method lives on the members of `VersioningApi`: the factory is annotated with that type, so JSDoc on
 * the members below would never reach the published declarations.
 *
 * @param {CmsCtx} ctx - The CMS plugin context with config, state and emit.
 * @returns {VersioningApi} The versioning API.
 */
export const createVersioningApi = (ctx: CmsCtx): VersioningApi => {
  /**
   * Generate a sequential version ID using the shared `nextId` counter from
   * CMS state. Same pattern as content and media `generateId` to maintain
   * a single ID namespace across all CMS modules.
   *
   * @returns {string} A unique version ID (e.g. "version-3").
   */
  const generateId = (): string => {
    const id = `version-${ctx.state.nextId}`;
    ctx.state.nextId++;
    return id;
  };

  return {
    commit: (contentId: string, message: string): Version => {
      const content = ctx.state.content.get(contentId);
      if (!content) {
        throw new Error(
          `[plugin-test] Content "${contentId}" not found.\n  Verify the content ID exists before committing.`
        );
      }

      const version: Version = {
        id: generateId(),
        contentId,
        snapshot: { ...content },
        createdAt: Date.now(),
        message
      };

      ctx.state.versions.push(version);
      return version;
    },

    revert: (contentId: string, versionId: string): boolean => {
      const version = ctx.state.versions.find(v => v.id === versionId && v.contentId === contentId);
      if (!version) return false;

      ctx.state.content.set(contentId, { ...version.snapshot });
      return true;
    },

    diff: (contentId: string, versionId: string): Diff[] => {
      const current = ctx.state.content.get(contentId);
      const version = ctx.state.versions.find(v => v.id === versionId && v.contentId === contentId);

      if (!current || !version) return [];

      const diffs: Diff[] = [];
      const fields: (keyof ContentItem)[] = ["title", "body", "locale", "status"];

      for (const field of fields) {
        if (current[field] !== version.snapshot[field]) {
          diffs.push({
            field,
            before: version.snapshot[field],
            after: current[field]
          });
        }
      }

      return diffs;
    },

    history: (contentId: string): Version[] => {
      return ctx.state.versions.filter(v => v.contentId === contentId);
    }
  };
};
