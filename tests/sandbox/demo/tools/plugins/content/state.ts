import type { ContentState } from "./types";

/**
 * Create the initial content state. The articles map starts empty and
 * `loaded` is false. Articles are populated via `load()` which also
 * flips `loaded` to true and emits `content:loaded`.
 *
 * @returns {ContentState} A fresh content state object.
 */
export const createContentState = (): ContentState => ({
  articles: new Map(),
  loaded: false
});
