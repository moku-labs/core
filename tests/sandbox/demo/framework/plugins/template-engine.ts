import { createPlugin } from "../config";

export const templateEnginePlugin = createPlugin("template-engine", {
  config: {
    engine: "default" as string
  },
  api: _ctx => ({
    compile: (template: string) => template
  })
});
