import { analyticsPlugin } from "../analytics";
import { createPlugin } from "../config";
import { routerPlugin } from "../router";
import { createContentApi } from "./content/api";
import { createMediaApi } from "./media/api";
import type { CmsEvents, CmsState } from "./types";
import { createVersioningApi } from "./versioning/api";

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
