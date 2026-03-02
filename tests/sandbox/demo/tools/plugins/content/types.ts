import type { PluginCtx } from "../../../../../../src";

/**
 * Raw article entry provided by the consumer for processing.
 *
 * @example
 * ```typescript
 * { slug: "hello-world", title: "Hello World", date: "2025-01-15",
 *   tags: ["intro"], content: "Welcome to my blog." }
 * ```
 */
export type ArticleEntry = {
  /** URL-safe identifier for the article. */
  slug: string;
  /** Article title. */
  title: string;
  /** Publication date in ISO format (YYYY-MM-DD). */
  date: string;
  /** Topic tags for categorization. */
  tags: string[];
  /** Raw markdown/text content. */
  content: string;
};

/**
 * Processed article with computed fields.
 *
 * @example
 * ```typescript
 * { slug: "hello-world", title: "Hello World", date: "2025-01-15",
 *   tags: ["intro"], content: "Welcome to my blog.",
 *   readingTime: 1, html: "<p>Welcome to my blog.</p>",
 *   url: "/hello-world" }
 * ```
 */
export type Article = ArticleEntry & {
  /** Estimated reading time in minutes. */
  readingTime: number;
  /** Rendered HTML content. */
  html: string;
  /** Generated URL path. */
  url: string;
};

/**
 * Events emitted by the content plugin.
 *
 * @example
 * ```typescript
 * hooks: ctx => ({
 *   "content:loaded": ({ count }) => console.log(`Loaded ${count} articles`),
 *   "content:error": ({ slug, message }) => console.error(`${slug}: ${message}`),
 * })
 * ```
 */
export type ContentEvents = {
  /** Emitted after all articles are processed and stored. */
  "content:loaded": { count: number };
  /** Emitted when an individual article fails processing. */
  "content:error": { slug: string; message: string };
};

/**
 * Internal mutable state for the content plugin.
 *
 * @example
 * ```typescript
 * { articles: Map { "hello-world" => { ... } }, loaded: true }
 * ```
 */
export type ContentState = {
  /** Processed articles keyed by slug. */
  articles: Map<string, Article>;
  /** Whether content has been loaded at least once. */
  loaded: boolean;
};

export type ContentCtx = PluginCtx<
  { defaultLocale: string; defaultAuthor: string },
  ContentState,
  ContentEvents
>;
