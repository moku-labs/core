/**
 * Components plugin — Standard tier.
 *
 * Island component manager. Simulates the SPA kernel's scanAndMount /
 * unmountPageSpecific lifecycle. Components register with a name, CSS
 * selector, and optional route list. Emits `component:mount` and
 * `component:unmount`.
 */
import { createPlugin } from "../../config";
import { routerPlugin } from "../router";
import { createComponentsApi } from "./api";
import { handleNavEnd, handleNavStart } from "./handlers";
import { createComponentsState } from "./state";
import type { ComponentEvents } from "./types";

export type {
  ComponentDef,
  ComponentEvents,
  ComponentInstance,
  ComponentsState
} from "./types";

export const componentsPlugin = createPlugin("components", {
  depends: [routerPlugin],
  events: register =>
    register.map<ComponentEvents>({
      "component:mount": "Component mounted",
      "component:unmount": "Component unmounted"
    }),
  config: { swapSelector: "#app" },
  createState: createComponentsState,
  api: ctx => createComponentsApi(ctx),
  hooks: ctx => ({
    "nav:start": handleNavStart(ctx),
    "nav:end": handleNavEnd(ctx)
  })
});
