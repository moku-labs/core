/**
 * Feed plugin — consumer build plugin.
 *
 * Generates RSS/Atom/JSON feeds from loaded content. Depends on the
 * framework's content plugin. Listens for `content:loaded` to mark
 * itself as ready for generation. Proves that consumers can extend
 * the build domain alongside SPA islands.
 */
import { contentPlugin, createPlugin } from "../../../tools";

/**
 * Single feed output entry.
 *
 * @example
 * ```typescript
 * { format: "rss", url: "/feed.xml", itemCount: 10 }
 * ```
 */
export type Feed = {
  /** Feed format type. */
  format: "rss" | "atom" | "json";
  /** Published feed URL. */
  url: string;
  /** Number of articles in the feed. */
  itemCount: number;
};

export const feedPlugin = createPlugin("feed", {
  depends: [contentPlugin],
  createState: () => ({
    feeds: new Map<string, Feed>(),
    generated: false,
    ready: false
  }),
  api: ctx => ({
    generate: () => {
      const articles = ctx.require(contentPlugin).getAllArticles();
      const count = articles.length;

      const formats: Array<{ format: Feed["format"]; ext: string }> = [
        { format: "rss", ext: "xml" },
        { format: "atom", ext: "atom.xml" },
        { format: "json", ext: "json" }
      ];

      for (const { format, ext } of formats) {
        ctx.state.feeds.set(format, {
          format,
          url: `/feed.${ext}`,
          itemCount: count
        });
      }

      ctx.state.generated = true;
    },
    getFeed: (format: Feed["format"]): Feed | undefined => {
      return ctx.state.feeds.get(format);
    },
    isGenerated: (): boolean => ctx.state.generated
  }),
  hooks: ctx => ({
    "content:loaded": () => {
      ctx.state.ready = true;
    }
  })
});
