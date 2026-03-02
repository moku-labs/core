/**
 * Head plugin — Micro tier.
 *
 * Document head metadata manager. Updates title and description
 * on each navigation via `nav:end` hook. Initializes from global
 * config's `appName`.
 */
import { createPlugin } from "../../config";
import { routerPlugin } from "../router";

/**
 * Internal mutable state for the head plugin.
 *
 * @example
 * ```typescript
 * { title: "Page: /about", description: "Description for /about" }
 * ```
 */
export type HeadState = {
  /** Current page title. */
  title: string;
  /** Current meta description. */
  description: string;
};

export const headPlugin = createPlugin("head", {
  depends: [routerPlugin],
  createState: (): HeadState => ({
    title: "",
    description: ""
  }),
  api: ctx => ({
    getTitle: (): string => ctx.state.title,
    getDescription: (): string => ctx.state.description,
    setTitle: (title: string) => {
      ctx.state.title = title;
    },
    setDescription: (description: string) => {
      ctx.state.description = description;
    }
  }),
  hooks: ctx => ({
    "nav:end": ({ to }) => {
      ctx.state.title = `Page: ${to}`;
      ctx.state.description = `Description for ${to}`;
    }
  }),
  onInit: ctx => {
    ctx.state.title = ctx.global.appName;
    ctx.state.description = `SPA powered by ${ctx.global.appName}`;
  }
});
