import type { CmsCtx, ContentItem } from "../types";
import type { ContentApi, ContentQuery, CreateContentInput, UpdateContentInput } from "./types";
import { validateContent } from "./validator";

export const createContentApi = (ctx: CmsCtx): ContentApi => {
  const generateId = (): string => {
    const id = `content-${ctx.state.nextId}`;
    ctx.state.nextId++;
    return id;
  };

  return {
    /**
     * Create a new content item. Validates the input fields, assigns an
     * auto-generated ID and the configured default locale, then stores
     * the item in state. Emits `cms:draft` on success.
     * @param input - The content fields (title, body, optional locale).
     * @returns The newly created content item with generated ID and timestamps.
     * @throws {Error} When validation fails (empty title or body, title > 200 chars).
     * @example
     * ```typescript
     * const post = app.cms.content.create({ title: "Hello", body: "World" });
     * console.log(post.id); // "content-1"
     * ```
     */
    create: (input: CreateContentInput): ContentItem => {
      const errors = validateContent(input);
      if (errors.length > 0) {
        throw new Error(
          `[plugin-test] Invalid content: ${errors.map(e => e.message).join(", ")}.\n  Fix the validation errors and retry.`
        );
      }

      const now = Date.now();
      const item: ContentItem = {
        id: generateId(),
        title: input.title,
        body: input.body,
        locale: input.locale ?? ctx.config.defaultLocale,
        status: "draft",
        createdAt: now,
        updatedAt: now
      };

      ctx.state.content.set(item.id, item);
      ctx.emit("cms:draft", { contentId: item.id });
      return item;
    },

    /**
     * Update an existing content item with partial fields. When the status
     * changes to "published", emits `cms:publish` with a URL-safe path
     * derived from the title.
     * @param id - The content item ID to update.
     * @param input - Partial fields to merge into the existing item.
     * @returns The updated content item.
     * @throws {Error} When the content ID does not exist.
     * @example
     * ```typescript
     * app.cms.content.update(item.id, { status: "published" });
     * ```
     */
    update: (id: string, input: UpdateContentInput): ContentItem => {
      const item = ctx.state.content.get(id);
      if (!item) {
        throw new Error(
          `[plugin-test] Content "${id}" not found.\n  Verify the content ID exists.`
        );
      }

      const updated: ContentItem = {
        ...item,
        ...(input.title !== undefined && { title: input.title }),
        ...(input.body !== undefined && { body: input.body }),
        ...(input.locale !== undefined && { locale: input.locale }),
        ...(input.status !== undefined && { status: input.status }),
        updatedAt: Date.now()
      };

      ctx.state.content.set(id, updated);

      if (input.status === "published") {
        ctx.emit("cms:publish", {
          contentId: id,
          path: `/${updated.title.toLowerCase().replaceAll(/\s+/g, "-")}`
        });
      }

      return updated;
    },

    /**
     * Delete a content item by ID. Removes it from the state store.
     * @param id - The content item ID to delete.
     * @returns True if the item was found and deleted, false otherwise.
     */
    delete: (id: string): boolean => {
      return ctx.state.content.delete(id);
    },

    /**
     * Retrieve a content item by its ID. Used to look up a single item
     * without filtering the full collection.
     * @param id - The content item ID to look up.
     * @returns The content item, or undefined if not found.
     */
    getById: (id: string): ContentItem | undefined => {
      return ctx.state.content.get(id);
    },

    /**
     * Query content items with optional filters. Returns all items when
     * called without arguments. Supports filtering by publication status
     * and/or locale for listing pages and admin views.
     * @param query - Optional filters for status and/or locale.
     * @returns An array of matching content items.
     * @example
     * ```typescript
     * const published = app.cms.content.query({ status: "published" });
     * const french = app.cms.content.query({ locale: "fr" });
     * ```
     */
    query: (query?: ContentQuery): ContentItem[] => {
      let items = [...ctx.state.content.values()];

      if (query?.status) {
        items = items.filter(item => item.status === query.status);
      }

      if (query?.locale) {
        items = items.filter(item => item.locale === query.locale);
      }

      return items;
    }
  };
};
