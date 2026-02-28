import { analyticsPlugin } from "./analytics";
import { cmsPlugin } from "./cms";
import { coreConfig, createCore } from "./config";
import { counterPlugin } from "./counter";
import { envPlugin } from "./env";
import { routerPlugin } from "./router";

const framework = createCore(coreConfig, {
  plugins: [envPlugin, counterPlugin, routerPlugin, analyticsPlugin, cmsPlugin],
  pluginConfigs: {
    analytics: { trackingId: "framework-default" }
  }
});

export const { createApp, createPlugin } = framework;

export { analyticsPlugin } from "./analytics";
export { cmsPlugin } from "./cms";
export { counterPlugin } from "./counter";
// Re-export all plugins for test access
export { envPlugin } from "./env";
export { routerPlugin } from "./router";
