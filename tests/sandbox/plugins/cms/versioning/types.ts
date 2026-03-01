import type { Version } from "../types";

/**
 * A diff entry showing a changed field between two versions.
 * @example
 * ```typescript
 * const diffs = app.cms.versioning.diff(item.id, version.id);
 * // [{ field: "title", before: "Original", after: "Modified" }]
 * ```
 */
export type Diff = {
  field: string;
  before: unknown;
  after: unknown;
};

/**
 * Versioning module API.
 * @example
 * ```typescript
 * const version = app.cms.versioning.commit(item.id, "Initial draft");
 * app.cms.versioning.revert(item.id, version.id);
 * app.cms.versioning.diff(item.id, version.id);
 * app.cms.versioning.history(item.id);
 * ```
 */
export type VersioningApi = {
  /**
   * Create a versioned snapshot of a content item. The snapshot is a
   * shallow copy — subsequent edits to the content do not affect the
   * stored version. Used to create save points before making changes.
   * @param contentId - The ID of the content item to snapshot.
   * @param message - A human-readable description of the version (e.g. "Initial draft").
   * @returns The created version record with snapshot data.
   * @throws {Error} When the content ID does not exist.
   */
  commit: (contentId: string, message: string) => Version;

  /**
   * Revert a content item to a previously committed version. Replaces the
   * current content state with a copy of the version's snapshot.
   * @param contentId - The ID of the content item to revert.
   * @param versionId - The ID of the version to restore.
   * @returns True if the version was found and content was reverted, false otherwise.
   */
  revert: (contentId: string, versionId: string) => boolean;

  /**
   * Compare a content item's current state with a committed version.
   * Checks title, body, locale, and status fields for differences.
   * Useful for showing change summaries before reverting.
   * @param contentId - The ID of the content item to compare.
   * @param versionId - The ID of the version to compare against.
   * @returns An array of field-level diffs. Empty if no differences or if content/version not found.
   */
  diff: (contentId: string, versionId: string) => Diff[];

  /**
   * Get the version history for a content item. Returns all committed
   * versions in chronological order. Useful for version list UIs and
   * audit trails.
   * @param contentId - The ID of the content item.
   * @returns An array of version records for the given content.
   */
  history: (contentId: string) => Version[];
};
