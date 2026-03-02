import { createPlugin } from "../config";
import { rendererPlugin } from "./renderer";
import { routerPlugin } from "./router";
import { seoPlugin } from "./seo";

export const sitemapPlugin = createPlugin("sitemap", {
  events: register => ({
    "sitemap:generated": register<{ url: string; entryCount: number }>(
      "Triggered after sitemap XML is generated"
    ),
    "sitemap:entry-added": register<{ path: string; title: string }>(
      "Triggered when a new entry is added to the sitemap"
    )
  }),
  depends: [seoPlugin, routerPlugin, rendererPlugin],
  config: {
    baseUrl: "https://example.com",
    changeFreq: "weekly" as string
  },
  createState: () => ({
    entries: [] as Array<{ path: string; title: string; lastMod: string }>
  }),
  api: ctx => ({
    addEntry: (path: string) => {
      const title = ctx.require(seoPlugin).getDefaultTitle();
      const currentRoute = ctx.require(routerPlugin).current();
      const entry = { path, title, lastMod: currentRoute };
      ctx.state.entries.push(entry);
      ctx.emit("sitemap:entry-added", { path, title });
      return entry;
    },
    generate: () => {
      const baseUrl = ctx.config.baseUrl;
      const entries = ctx.state.entries;
      const xml = entries
        .map(
          e =>
            `<url><loc>${baseUrl}${e.path}</loc><changefreq>${ctx.config.changeFreq}</changefreq></url>`
        )
        .join("\n");
      const sitemap = `<?xml version="1.0"?>\n<urlset>\n${xml}\n</urlset>`;
      ctx.emit("sitemap:generated", {
        url: `${baseUrl}/sitemap.xml`,
        entryCount: entries.length
      });
      return sitemap;
    },
    getEntries: () => ctx.state.entries,
    getEntryCount: () => ctx.state.entries.length
  }),
  hooks: _ctx => ({
    "renderer:complete": _payload => {
      // Listen to renderer events from dependency chain (seo -> renderer)
    }
  })
});
