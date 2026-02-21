import { createPlugin } from "../config";
import { templateEnginePlugin } from "./template-engine";

export type RendererEvents = {
  "renderer:complete": { path: string; duration: number };
};

export const rendererPlugin = createPlugin<RendererEvents>("renderer", {
  defaultConfig: {
    template: "default"
  },
  plugins: [templateEnginePlugin],
  depends: [templateEnginePlugin] as const,
  api: ctx => ({
    render: (path: string) => {
      const engine = ctx.require(templateEnginePlugin);
      const html = engine.compile(`<div>${path}</div>`);
      ctx.emit("renderer:complete", { path, duration: 0 });
      ctx.emit("page:render", { path, html });
      return html;
    }
  })
});
