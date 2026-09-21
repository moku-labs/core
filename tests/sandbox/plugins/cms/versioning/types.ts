import type { Version } from "../types";

/**
 * A diff entry showing a changed field between two versions.
 *
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
 *
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
   *
   * @param {string} contentId - The ID of the content item to snapshot.
   * @param {string} message - A human-readable description of the version (e.g. "Initial draft").
   * @returns {Version} The created version record with snapshot data.
   * @throws {Error} When the content ID does not exist.
   * @example
   * ```typescript
   * // Save a restore point before a risky edit.
   * const version = app.cms.versioning.commit(post.id, "Before redesign");
   * version.snapshot.title; // "Hello"
   * ```
   */
  commit: (contentId: string, message: string) => Version;

  /**
   * Revert a content item to a previously committed version. Replaces the
   * current content state with a copy of the version's snapshot.
   *
   * @param {string} contentId - The ID of the content item to revert.
   * @param {string} versionId - The ID of the version to restore.
   * @returns {boolean} True if the version was found and content was reverted, false otherwise.
   * @example
   * ```typescript
   * // The redesign went wrong: restore the saved version.
   * app.cms.versioning.revert(post.id, version.id); // true
   * app.cms.versioning.revert(post.id, "version-999"); // false: no such version
   * ```
   */
  revert: (contentId: string, versionId: string) => boolean;

  /**
   * Compare a content item's current state with a committed version.
   * Checks title, body, locale, and status fields for differences.
   * Useful for showing change summaries before reverting.
   *
   * @param {string} contentId - The ID of the content item to compare.
   * @param {string} versionId - The ID of the version to compare against.
   * @returns {Diff[]} An array of field-level diffs. Empty if no differences or if content/version not found.
   * @example
   * ```typescript
   * // Show the editor what changed since the restore point.
   * app.cms.content.update(post.id, { title: "Hello again" });
   * app.cms.versioning.diff(post.id, version.id); // [{ field: "title", before: "Hello", after: "Hello again" }]
   * ```
   */
  diff: (contentId: string, versionId: string) => Diff[];

  /**
   * Get the version history for a content item. Returns all committed
   * versions in chronological order. Useful for version list UIs and
   * audit trails.
   *
   * @param {string} contentId - The ID of the content item.
   * @returns {Version[]} An array of version records for the given content.
   * @example
   * ```typescript
   * // The audit trail of one post.
   * app.cms.versioning.history(post.id).map(item => item.message); // ["Before redesign"]
   * ```
   */
  history: (contentId: string) => Version[];
};
