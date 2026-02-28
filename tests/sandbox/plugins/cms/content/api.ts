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

    delete: (id: string): boolean => {
      return ctx.state.content.delete(id);
    },

    getById: (id: string): ContentItem | undefined => {
      return ctx.state.content.get(id);
    },

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
