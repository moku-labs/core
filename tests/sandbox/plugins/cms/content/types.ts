import type { ContentItem } from "../types";

/**
 * Input for creating new content.
 *
 * @example
 * ```typescript
 * app.cms.content.create({ title: "My Post", body: "Content here", locale: "en" })
 * ```
 */
export type CreateContentInput = {
  title: string;
  body: string;
  locale?: string;
};

/**
 * Input for updating existing content. All fields are optional.
 *
 * @example
 * ```typescript
 * app.cms.content.update(item.id, { title: "New Title", status: "published" })
 * ```
 */
export type UpdateContentInput = {
  title?: string;
  body?: string;
  locale?: string;
  status?: "draft" | "published";
};

/**
 * Filter criteria for querying content.
 *
 * @example
 * ```typescript
 * app.cms.content.query({ status: "published", locale: "en" })
 * ```
 */
export type ContentQuery = {
  status?: "draft" | "published";
  locale?: string;
};

/**
 * Content module API.
 *
 * @example
 * ```typescript
 * const item = app.cms.content.create({ title: "Hello", body: "World" });
 * app.cms.content.update(item.id, { status: "published" });
 * app.cms.content.query({ status: "published" });
 * ```
 */
export type ContentApi = {
  /**
   * Create a new content item. Validates input, assigns an auto-generated
   * ID and the configured default locale, then stores the item in state.
   * Emits `cms:draft` on success.
   *
   * @param {CreateContentInput} input - The content fields (title, body, optional locale).
   * @returns {ContentItem} The newly created content item with generated ID and timestamps.
   * @throws {Error} When validation fails (empty title or body, title > 200 chars).
   */
  create: (input: CreateContentInput) => ContentItem;

  /**
   * Update an existing content item with partial fields. When the status
   * changes to "published", emits `cms:publish` with a URL-safe path
   * derived from the title.
   *
   * @param {string} id - The content item ID to update.
   * @param {UpdateContentInput} input - Partial fields to merge into the existing item.
   * @returns {ContentItem} The updated content item.
   * @throws {Error} When the content ID does not exist.
   */
  update: (id: string, input: UpdateContentInput) => ContentItem;

  /**
   * Delete a content item by ID. Removes it from the state store.
   *
   * @param {string} id - The content item ID to delete.
   * @returns {boolean} True if the item was found and deleted, false otherwise.
   */
  delete: (id: string) => boolean;

  /**
   * Retrieve a content item by its ID. Used to look up a single item
   * without filtering the full collection.
   *
   * @param {string} id - The content item ID to look up.
   * @returns {ContentItem | undefined} The content item, or undefined if not found.
   */
  getById: (id: string) => ContentItem | undefined;

  /**
   * Query content items with optional filters. Returns all items when
   * called without arguments. Supports filtering by publication status
   * and/or locale for listing pages and admin views.
   *
   * @param {ContentQuery} query - Optional filters for status and/or locale.
   * @returns {ContentItem[]} An array of matching content items.
   */
  query: (query?: ContentQuery) => ContentItem[];
};
