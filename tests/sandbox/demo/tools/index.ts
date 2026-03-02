/**
 * Moku framework — Layer 2 assembly.
 *
 * Assembles 7 plugins across three domains (SPA, Build, CLI) into
 * a unified framework via `createCore`. Exports `createApp` and
 * `createPlugin` for consumer use (Layer 3).
 */
import { coreConfig, createCore } from "./config";
import { bundlerPlugin } from "./plugins/bundler";
import { cliPlugin } from "./plugins/cli";
import { componentsPlugin } from "./plugins/components";
import { contentPlugin } from "./plugins/content";
import { headPlugin } from "./plugins/head";
import { progressPlugin } from "./plugins/progress";
import { routerPlugin } from "./plugins/router";

const framework = createCore(coreConfig, {
  plugins: [
    // SPA domain
    routerPlugin,
    progressPlugin,
    componentsPlugin,
    headPlugin,
    // Build domain
    contentPlugin,
    bundlerPlugin,
    // CLI domain
    cliPlugin
  ],
  pluginConfigs: {
    router: { basePath: "/" },
    content: { defaultLocale: "en", defaultAuthor: "Anonymous" },
    bundler: { entrypoints: ["index.css", "spa.tsx"], minify: false },
    cli: { name: "moku" }
  }
});

export const { createApp, createPlugin } = framework;

// Re-export all framework plugins for consumer `depends` and test access
export { bundlerPlugin } from "./plugins/bundler";
export { cliPlugin } from "./plugins/cli";
export { componentsPlugin } from "./plugins/components";
export { contentPlugin } from "./plugins/content";
export { headPlugin } from "./plugins/head";
export { progressPlugin } from "./plugins/progress";
export { routerPlugin } from "./plugins/router";
