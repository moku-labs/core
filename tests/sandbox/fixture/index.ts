import { coreConfig, createCore } from "./config";
import { loggerPlugin } from "./plugins/logger";
import { rendererPlugin } from "./plugins/renderer";
import { routerPlugin } from "./plugins/router";

const framework = createCore(coreConfig, {
  plugins: [routerPlugin, rendererPlugin, loggerPlugin]
});

export const { createApp, createPlugin } = framework;
export { loggerPlugin } from "./plugins/logger";
export { rendererPlugin } from "./plugins/renderer";
export { routerPlugin } from "./plugins/router";
