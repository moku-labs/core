import type { Article, ArticleEntry, ContentCtx } from "./types";

export const createContentApi = (ctx: ContentCtx) => ({
  /**
   * Process raw article entries into the content store. Computes reading
   * time, wraps content in HTML, and generates URL paths. Emits
   * `content:loaded` after all entries are processed. Called by the
   * consumer or CLI build command to populate the content pipeline.
   *
   * @param {ArticleEntry[]} entries - Raw article entries to process.
   * @example
   * ```typescript
   * app.content.load([
   *   { slug: "hello", title: "Hello", date: "2025-01-15",
   *     tags: ["intro"], content: "Welcome." }
   * ]);
   * ```
   */
  load: (entries: ArticleEntry[]) => {
    for (const entry of entries) {
      const wordCount = entry.content.split(/\s+/).length;
      const article: Article = {
        ...entry,
        readingTime: Math.max(1, Math.ceil(wordCount / 200)),
        html: `<p>${entry.content}</p>`,
        url: `/${entry.slug}`
      };
      ctx.state.articles.set(entry.slug, article);
    }
    ctx.state.loaded = true;
    ctx.emit("content:loaded", { count: entries.length });
  },

  /**
   * Retrieve a single article by slug. Used by page generation and
   * consumer templates to access processed article data.
   *
   * @param {string} slug - The article slug to look up.
   * @returns {Article | undefined} The processed article, or undefined if not found.
   */
  getArticle: (slug: string): Article | undefined => {
    return ctx.state.articles.get(slug);
  },

  /**
   * Get all articles sorted by date descending (newest first). Used by
   * feed generation, index pages, and archive views.
   *
   * @returns {Article[]} All processed articles in reverse chronological order.
   */
  getAllArticles: (): Article[] => {
    return [...ctx.state.articles.values()].toSorted((a, b) => b.date.localeCompare(a.date));
  },

  /**
   * Filter articles by tag. Used by tag index pages and category views
   * to find related content.
   *
   * @param {string} tag - The tag to filter by.
   * @returns {Article[]} Articles that include the specified tag.
   */
  getByTag: (tag: string): Article[] => {
    return [...ctx.state.articles.values()].filter(a => a.tags.includes(tag));
  },

  /**
   * Check whether content has been loaded at least once. Used by the CLI
   * build command to guard against building before content is available.
   *
   * @returns {boolean} True if `load()` has been called at least once.
   */
  isLoaded: (): boolean => ctx.state.loaded
});
