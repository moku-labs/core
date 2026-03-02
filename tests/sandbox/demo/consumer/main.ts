import { analyticsPlugin, createApp } from "../moku-web";
import { blogPlugin } from "./plugins/blog";

export async function main() {
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

  return app;
}
