import { coreConfig, createCore } from "./config";
import { rendererPlugin } from "./plugins/renderer";
import { routerPlugin } from "./plugins/router";
import { seoPlugin } from "./plugins/seo";
import { sitemapPlugin } from "./plugins/sitemap";
import { templateEnginePlugin } from "./plugins/template-engine";

const framework = createCore(coreConfig, {
  plugins: [routerPlugin, templateEnginePlugin, rendererPlugin, seoPlugin, sitemapPlugin],
  pluginConfigs: {
    renderer: { template: "default" }
  },
  onReady: _ctx => {
    // All plugins initialized
  }
});

export const { createApp, createPlugin } = framework;

// Optional plugins consumers can add
export { analyticsPlugin } from "./plugins/analytics";
export { authPlugin } from "./plugins/auth";
// Default plugins (re-exported for test access)
export { rendererPlugin } from "./plugins/renderer";
export { routerPlugin } from "./plugins/router";
export { seoPlugin } from "./plugins/seo";
export { sitemapPlugin } from "./plugins/sitemap";
export { templateEnginePlugin } from "./plugins/template-engine";
