import { analyticsPlugin, createApp } from "../moku-web";
import { blogPlugin } from "./plugins/blog";

export async function main() {
  const app = await createApp({
    plugins: [analyticsPlugin, blogPlugin],
    siteName: "My Blog",
    mode: "production" as const,
    router: { basePath: "/blog" },
    analytics: { trackingId: "G-XXXXX" },
    blog: { postsPerPage: 5 }
  });

  await app.start();

  app.router.navigate("/about");
  app.blog.listPosts();

  await app.stop();

  return app;
}
