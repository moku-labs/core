import type { Version } from "../types";

/**
 * Create the initial versioning state. Returns an empty array that will
 * hold version snapshots in chronological order. Appended by
 * `versioning.commit()`, read by `versioning.history()` and `versioning.diff()`.
 *
 * @returns {Version[]} An empty version array.
 */
export const createVersioningState = (): Version[] => [];
