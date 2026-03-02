/**
 * Progress plugin — Micro tier.
 *
 * Navigation progress bar simulation. Hooks into router events
 * to track active/percent state. No real DOM animation.
 */
import { createPlugin } from "../../config";
import { routerPlugin } from "../router";

/**
 * Internal mutable state for the progress plugin.
 *
 * @example
 * ```typescript
 * // During navigation
 * { active: true, percent: 30 }
 * // After navigation completes
 * { active: false, percent: 100 }
 * ```
 */
export type ProgressState = {
  /** Whether a navigation is currently in progress. */
  active: boolean;
  /** Current progress percentage (0–100). */
  percent: number;
};

export const progressPlugin = createPlugin("progress", {
  depends: [routerPlugin],
  createState: (): ProgressState => ({
    active: false,
    percent: 0
  }),
  api: ctx => ({
    isActive: (): boolean => ctx.state.active,
    getPercent: (): number => ctx.state.percent
  }),
  hooks: ctx => ({
    "nav:start": () => {
      ctx.state.active = true;
      ctx.state.percent = 30;
    },
    "nav:end": () => {
      ctx.state.percent = 100;
      ctx.state.active = false;
    }
  })
});
