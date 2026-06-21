/**
 * Lightbox island — consumer plugin.
 *
 * Route-specific island (mounts only on `/gallery` and `/photos`).
 * Registers itself with the island manager during `onInit`.
 * Provides open/close API for image viewing.
 */
import { createPlugin } from "../../../tools";
import { islandsPlugin } from "../../../tools/plugins/islands";

export const lightboxIsland = createPlugin("lightbox", {
  depends: [islandsPlugin],
  createState: () => ({
    isOpen: false,
    currentImage: ""
  }),
  api: ctx => ({
    open: (imageSrc: string) => {
      ctx.state.isOpen = true;
      ctx.state.currentImage = imageSrc;
    },
    close: () => {
      ctx.state.isOpen = false;
      ctx.state.currentImage = "";
    },
    isOpen: (): boolean => ctx.state.isOpen,
    getCurrentImage: (): string => ctx.state.currentImage
  }),
  onInit: ctx => {
    ctx.require(islandsPlugin).register({
      name: "lightbox",
      selector: "[data-island='lightbox']",
      routes: ["/gallery", "/photos"]
    });
  }
});
