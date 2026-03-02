/**
 * Bundler plugin — Standard tier.
 *
 * Asset bundling simulation. Tracks entrypoints, produces hashed
 * output paths, and transitions through build phases. Emits
 * `bundle:start`, `bundle:complete`, and `bundle:error`.
 */
import { createPlugin } from "../../config";
import { createBundlerApi } from "./api";
import { createBundlerState } from "./state";
import type { BundlerEvents } from "./types";

export type {
  BuildPhase,
  BundleOutput,
  BundlerEvents,
  BundlerState
} from "./types";

export const bundlerPlugin = createPlugin("bundler", {
  events: register =>
    register.map<BundlerEvents>({
      "bundle:start": "Asset bundling started",
      "bundle:complete": "Asset bundling completed",
      "bundle:error": "Asset bundling failed"
    }),
  config: {
    entrypoints: ["index.css", "spa.tsx"] as string[],
    minify: false
  },
  createState: createBundlerState,
  api: ctx => createBundlerApi(ctx)
});
