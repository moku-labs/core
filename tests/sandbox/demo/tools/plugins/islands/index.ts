/**
 * Islands plugin — Standard tier.
 *
 * Island manager. Simulates the SPA kernel's scanAndMount /
 * unmountPageSpecific lifecycle. Islands register with a name, CSS
 * selector, and optional route list. Emits `island:mount` and
 * `island:unmount`.
 */
import { createPlugin } from "../../config";
import { routerPlugin } from "../router";
import { createIslandsApi } from "./api";
import { handleNavEnd, handleNavStart } from "./handlers";
import { createIslandsState } from "./state";
import type { IslandEvents } from "./types";

export type {
  IslandDef,
  IslandEvents,
  IslandInstance,
  IslandsState
} from "./types";

export const islandsPlugin = createPlugin("islands", {
  depends: [routerPlugin],
  events: register =>
    register.map<IslandEvents>({
      "island:mount": "Island mounted",
      "island:unmount": "Island unmounted"
    }),
  config: { swapSelector: "#app" },
  createState: createIslandsState,
  api: ctx => createIslandsApi(ctx),
  hooks: ctx => ({
    "nav:start": handleNavStart(ctx),
    "nav:end": handleNavEnd(ctx)
  })
});
