/**
 * Server entry point — runs via `bun run main.ts`.
 *
 * Uses start/stop for runtime lifecycle (DB connections, server listen).
 * This is the use case where async lifecycle matters.
 */
import { analyticsPlugin, createApp } from "../framework";
import { blogPlugin } from "./plugins/blog";

const app = createApp({
  plugins: [analyticsPlugin, blogPlugin],
  config: {
    siteName: "My Blog",
    mode: "production" as const
  },
  pluginConfigs: {
    router: { basePath: "/blog" },
    analytics: { trackingId: "G-XXXXX" },
    blog: { postsPerPage: 5 }
  },
  onError: (_error, _ctx) => {
    //
  },
  onReady: _ctx => {
    // App is ready, can perform additional setup
  },
  onStop: _ctx => {
    // App is stopping, can perform cleanup
  },
  onStart: _ctx => {
    // App is starting, can perform initialization
  }
});

await app.start();

app.router.navigate("/about");
app.blog.listPosts();

await app.stop();

export { app };
