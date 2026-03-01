/**
 * Counter plugin — Micro tier.
 *
 * Simple counter with configurable initial value and step size.
 * @see README.md
 */
import { createPlugin } from "../config";

/**
 * Counter plugin configuration.
 * @example
 * ```typescript
 * { initial: 10, step: 5 }
 * ```
 */
export type CounterConfig = {
  /** Starting value for the counter. */
  initial: number;
  /** Increment/decrement amount. */
  step: number;
};

/**
 * Counter plugin public API.
 * @example
 * ```typescript
 * app.counter.increment();
 * app.counter.value(); // 1
 * app.counter.reset();
 * ```
 */
export type CounterApi = {
  /** Increase the counter by `step`. */
  increment: () => void;
  /** Decrease the counter by `step`. */
  decrement: () => void;
  /** Get the current counter value. */
  value: () => number;
  /** Reset the counter to `initial`. */
  reset: () => void;
};

export const counterPlugin = createPlugin("counter", {
  config: { initial: 0, step: 1 } as CounterConfig,
  createState: ctx => ({ count: ctx.config.initial }),
  api: ctx => ({
    increment: () => {
      ctx.state.count += ctx.config.step;
    },
    decrement: () => {
      ctx.state.count -= ctx.config.step;
    },
    value: () => ctx.state.count,
    reset: () => {
      ctx.state.count = ctx.config.initial;
    }
  })
});
