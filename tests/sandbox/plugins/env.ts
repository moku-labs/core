import { createPlugin } from "./config";

export const envPlugin = createPlugin("env", {
  config: {
    nodeEnv: "development" as string,
    isCI: false
  },
  api: ctx => ({
    isDev: () => ctx.config.nodeEnv === "development",
    isProd: () => ctx.config.nodeEnv === "production",
    isCI: () => ctx.config.isCI
  })
});
