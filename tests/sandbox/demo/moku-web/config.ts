import { createCoreConfig } from "../../../../src";

export type SiteConfig = {
  siteName: string;
  mode: "development" | "production";
};

export type SiteEvents = {
  "page:render": { path: string; html: string };
  "router:navigate": { from: string; to: string };
};

export const coreConfig = createCoreConfig<SiteConfig, SiteEvents>("moku-site", {
  config: {
    siteName: "Untitled",
    mode: "development"
  }
});

export const { createPlugin, createCore } = coreConfig;
