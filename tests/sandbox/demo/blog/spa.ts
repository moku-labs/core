/**
 * SPA client entry point — loaded via `<script type="module" src="./spa.ts">`.
 *
 * Boots the client-side app with SPA islands only. This is what gets
 * bundled and served to the browser. No build pipeline or CLI concerns —
 * those live in `main.ts` on the server.
 *
 * See index.html for how this is loaded and used.
 */
import { createApp } from "../tools";
import { lightboxIsland } from "./islands/lightbox";
import { shareButtonsIsland } from "./islands/share-buttons";

const app = createApp({
  plugins: [shareButtonsIsland, lightboxIsland],
  config: {
    appName: "My Blog",
    debug: false,
    mode: "spa"
  },
  pluginConfigs: {
    router: { basePath: "/blog" }
  }
});

export { app };
