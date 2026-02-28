import { createCoreConfig } from "../../../src";

export type PluginTestConfig = {
  appName: string;
  debug: boolean;
};

export type PluginTestEvents = {
  "app:ready": { timestamp: number };
  "app:error": { message: string; code: number };
};

export const coreConfig = createCoreConfig<PluginTestConfig, PluginTestEvents>("plugin-test", {
  config: { appName: "PluginTest", debug: false }
});

export const { createPlugin, createCore } = coreConfig;
