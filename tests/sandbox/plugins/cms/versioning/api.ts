import type { CmsCtx, ContentItem, Version } from "../types";
import type { Diff, VersioningApi } from "./types";

export const createVersioningApi = (ctx: CmsCtx): VersioningApi => {
  const generateId = (): string => {
    const id = `version-${ctx.state.nextId}`;
    ctx.state.nextId++;
    return id;
  };

  return {
    /**
     * Create a versioned snapshot of a content item. The snapshot is a
     * shallow copy — subsequent edits to the content do not affect the
     * stored version. Used to create save points before making changes.
     * @param contentId - The ID of the content item to snapshot.
     * @param message - A human-readable description of the version (e.g. "Initial draft").
     * @returns The created version record with snapshot data.
     * @throws {Error} When the content ID does not exist.
     * @example
     * ```typescript
     * const version = app.cms.versioning.commit(item.id, "Before redesign");
     * ```
     */
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

    /**
     * Revert a content item to a previously committed version. Replaces the
     * current content state with a copy of the version's snapshot.
     * @param contentId - The ID of the content item to revert.
     * @param versionId - The ID of the version to restore.
     * @returns True if the version was found and content was reverted, false otherwise.
     * @example
     * ```typescript
     * const success = app.cms.versioning.revert(item.id, version.id);
     * ```
     */
    revert: (contentId: string, versionId: string): boolean => {
      const version = ctx.state.versions.find(v => v.id === versionId && v.contentId === contentId);
      if (!version) return false;

      ctx.state.content.set(contentId, { ...version.snapshot });
      return true;
    },

    /**
     * Compare a content item's current state with a committed version.
     * Checks title, body, locale, and status fields for differences.
     * Useful for showing change summaries before reverting.
     * @param contentId - The ID of the content item to compare.
     * @param versionId - The ID of the version to compare against.
     * @returns An array of field-level diffs. Empty if no differences or if content/version not found.
     * @example
     * ```typescript
     * const diffs = app.cms.versioning.diff(item.id, version.id);
     * diffs.forEach(d => console.log(`${d.field}: ${d.before} → ${d.after}`));
     * ```
     */
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

    /**
     * Get the version history for a content item. Returns all committed
     * versions in chronological order. Useful for version list UIs and
     * audit trails.
     * @param contentId - The ID of the content item.
     * @returns An array of version records for the given content.
     */
    history: (contentId: string): Version[] => {
      return ctx.state.versions.filter(v => v.contentId === contentId);
    }
  };
};
