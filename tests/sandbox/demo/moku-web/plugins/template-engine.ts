import { createPlugin } from "../config";

export const templateEnginePlugin = createPlugin("template-engine", {
  defaultConfig: {
    engine: "default" as string
  },
  api: _ctx => ({
    compile: (template: string) => template
  })
});
