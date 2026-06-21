/**
 * Share buttons island — consumer plugin.
 *
 * Global island (mounts on all routes). Registers itself with the
 * island manager during `onInit`. Provides social sharing API.
 */
import { createPlugin } from "../../../tools";
import { islandsPlugin } from "../../../tools/plugins/islands";

export const shareButtonsIsland = createPlugin("share-buttons", {
  depends: [islandsPlugin],
  config: {
    networks: ["twitter", "facebook", "linkedin"] as string[]
  },
  createState: () => ({
    shareCount: 0
  }),
  api: ctx => ({
    share: (network: string) => {
      if (ctx.config.networks.includes(network)) {
        ctx.state.shareCount += 1;
      }
    },
    getShareCount: (): number => ctx.state.shareCount,
    getNetworks: (): readonly string[] => ctx.config.networks
  }),
  onInit: ctx => {
    ctx.require(islandsPlugin).register({
      name: "share-buttons",
      selector: "[data-island='share-buttons']",
      routes: ["*"]
    });
  }
});
