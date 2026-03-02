/**
 * Build / CLI entry point — runs via `bun run main.ts`.
 *
 * No start/stop needed: createApp is sync, plugin APIs are available
 * immediately. Content processing, bundling, feed generation, and CLI
 * commands all work without async lifecycle ceremony.
 *
 * SPA islands live in `spa.ts` and ship to the browser separately.
 */
import { createApp } from "../tools";
import { feedPlugin } from "./plugins/feed";

const app = createApp({
  plugins: [feedPlugin],
  config: {
    appName: "My Blog",
    debug: false,
    mode: "ssg",
    version: "1.0.0"
  }
});

// ── Build domain ──────────────────────────────────────────────
app.content.load([
  {
    slug: "hello-world",
    title: "Hello World",
    date: "2025-01-15",
    tags: ["intro"],
    content: "Welcome to my blog."
  },
  {
    slug: "second-post",
    title: "Second Post",
    date: "2025-02-01",
    tags: ["update"],
    content: "Another day another post with more words."
  }
]);
app.bundler.build();
app.feed.generate();

// ── CLI domain ────────────────────────────────────────────────
app.cli.run("version");
app.cli.run("build");

export { app };
