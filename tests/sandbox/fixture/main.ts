import { createApp } from "./index";

export async function bootstrapApp(overrides?: {
  siteName?: string;
  mode?: "development" | "production";
  router?: { basePath?: string; trailingSlash?: boolean };
}) {
  const app = await createApp({
    ...(overrides?.siteName && { siteName: overrides.siteName }),
    ...(overrides?.mode && { mode: overrides.mode }),
    ...(overrides?.router && { router: overrides.router })
  });

  return app;
}
