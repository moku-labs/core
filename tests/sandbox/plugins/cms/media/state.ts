import type { MediaAsset } from "../types";

/**
 * Create the initial media state. Returns an empty map that will
 * hold media assets keyed by their auto-generated IDs (e.g. "media-1").
 * Populated by `media.upload()`.
 * @returns An empty media asset map.
 */
export const createMediaState = (): Map<string, MediaAsset> => new Map();
