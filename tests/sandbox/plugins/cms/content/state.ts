import type { ContentItem } from "../types";

/**
 * Create the initial content state. Returns an empty map that will
 * hold content items keyed by their auto-generated IDs (e.g. "content-1").
 * Populated by `content.create()`, modified by `content.update()`.
 * @returns An empty content item map.
 */
export const createContentState = (): Map<string, ContentItem> => new Map();
