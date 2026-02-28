import { createPlugin } from "./config";

export const counterPlugin = createPlugin("counter", {
  config: { initial: 0, step: 1 },
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
