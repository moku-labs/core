/**
 * CLI plugin — Standard tier.
 *
 * Command dispatch simulation. Provides command registration, dispatch,
 * and execution history. Registers built-in `build` and `version`
 * commands during `onInit`. Emits `cli:run` and `cli:complete`.
 */
import { createPlugin } from "../../config";
import { bundlerPlugin } from "../bundler";
import { contentPlugin } from "../content";
import { createCliApi } from "./api";
import { createCliState } from "./state";
import type { CliEvents } from "./types";

export type {
  CliEvents,
  CliState,
  CommandDef,
  CommandResult
} from "./types";

export const cliPlugin = createPlugin("cli", {
  depends: [contentPlugin, bundlerPlugin],
  events: register =>
    register.map<CliEvents>({
      "cli:run": "CLI command dispatched",
      "cli:complete": "CLI command finished"
    }),
  config: { name: "moku" },
  createState: createCliState,
  api: ctx => createCliApi(ctx),
  onInit: ctx => {
    const content = ctx.require(contentPlugin);
    const bundler = ctx.require(bundlerPlugin);

    ctx.state.commands.set("build", {
      name: "build",
      description: "Run full build pipeline",
      handler: () => {
        if (!content.isLoaded()) {
          return "No content loaded";
        }
        bundler.build();
        const articles = content.getAllArticles();
        return `Built ${articles.length} articles, ${bundler.getOutputs().length} bundles`;
      }
    });

    ctx.state.commands.set("version", {
      name: "version",
      description: "Show framework version",
      handler: () => `${ctx.config.name} v${ctx.global.version}`
    });
  }
});
