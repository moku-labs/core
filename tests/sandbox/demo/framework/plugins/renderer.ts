import { createPlugin } from "../config";
import { templateEnginePlugin } from "./template-engine";

export const rendererPlugin = createPlugin("renderer", {
  events: register => ({
    "renderer:complete": register<{ path: string; duration: number }>(
      "Triggered after render completes"
    )
  }),
  config: {
    template: "default"
  },
  depends: [templateEnginePlugin],
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
