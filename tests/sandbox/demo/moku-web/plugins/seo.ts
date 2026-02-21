import { createPlugin } from "../config";
import { rendererPlugin } from "./renderer";
import { routerPlugin } from "./router";

export const seoPlugin = createPlugin("seo", {
  depends: [routerPlugin, rendererPlugin] as const,
  defaultConfig: {
    defaultTitle: "Untitled"
  },
  api: ctx => ({
    setTitle: (title: string) => {
      const currentPath = ctx.require(routerPlugin).current();
      ctx.emit("renderer:complete", {
        path: currentPath,
        duration: 0
      });
      return `<title>${title}</title>`;
    },
    getDefaultTitle: () => ctx.config.defaultTitle
  }),
  hooks: {
    "renderer:complete": _payload => {
      // Listen to RendererEvents from depends chain
    }
  }
});
