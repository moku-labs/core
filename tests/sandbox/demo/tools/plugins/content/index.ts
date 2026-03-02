/**
 * Content plugin — Standard tier.
 *
 * Content pipeline simulation. Processes article entries into state
 * (no real filesystem access). Computes reading time, generates HTML
 * and URLs. Emits `content:loaded` and `content:error`.
 */
import { createPlugin } from "../../config";
import { createContentApi } from "./api";
import { createContentState } from "./state";
import type { ContentEvents } from "./types";

export type {
  Article,
  ArticleEntry,
  ContentEvents,
  ContentState
} from "./types";

export const contentPlugin = createPlugin("content", {
  events: register =>
    register.map<ContentEvents>({
      "content:loaded": "Content pipeline completed",
      "content:error": "Article processing failed"
    }),
  config: { defaultLocale: "en", defaultAuthor: "Anonymous" },
  createState: createContentState,
  api: ctx => createContentApi(ctx)
});
