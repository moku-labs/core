/**
 * CMS plugin — Very Complex tier.
 *
 * Content management with CRUD, media uploads, and versioning.
 * Depends on router and analytics.
 *
 * @see README.md
 */
import { analyticsPlugin } from "../analytics";
import { createPlugin } from "../config";
import { routerPlugin } from "../router";
import { createContentApi } from "./content/api";
import { createMediaApi } from "./media/api";
import type { CmsEvents, CmsState } from "./types";
import { createVersioningApi } from "./versioning/api";

/**
 * Create the initial CMS state with empty maps for content and media, an empty
 * versions array, and the ID counter starting at 1. Inline because the CMS
 * plugin's state is a composition of all module states rather than a single
 * domain concern.
 *
 * @returns {CmsState} A fresh CMS state object.
 */
const createCmsState = (): CmsState => ({
  content: new Map(),
  media: new Map(),
  versions: [],
  nextId: 1
});

export const cmsPlugin = createPlugin("cms", {
  depends: [routerPlugin, analyticsPlugin],
  events: register =>
    register.map<CmsEvents>({
      "cms:publish": "Content published",
      "cms:draft": "Draft saved",
      "cms:upload": "Media uploaded"
    }),
  config: {
    defaultLocale: "en",
    maxUploadSize: 10 * 1024 * 1024
  },
  createState: createCmsState,
  api: ctx => ({
    content: createContentApi(ctx),
    media: createMediaApi(ctx),
    versioning: createVersioningApi(ctx)
  }),
  onStop: async () => {
    // Flush publish queue, clean temp uploads
  }
});
