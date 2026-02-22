import { createPlugin } from "../config";
import { routerPlugin } from "./router";

export const authPlugin = createPlugin("auth", {
  events: register => ({
    "auth:login": register<{ userId: string }>("Triggered after user login"),
    "auth:logout": register<{ userId: string }>("Triggered after user logout"),
    "auth:timeout": register<{ sessionTimeout: number }>("Triggered on session timeout")
  }),
  depends: [routerPlugin],
  config: {
    loginPath: "/login",
    sessionTimeout: 3600
  },
  createState: () => ({
    currentUser: undefined as string | undefined,
    isAuthenticated: false
  }),
  api: ctx => ({
    login: (userId: string) => {
      ctx.state.currentUser = userId;
      ctx.state.isAuthenticated = true;
      ctx.emit("auth:login", { userId });
    },
    logout: () => {
      const userId = ctx.state.currentUser;
      ctx.state.currentUser = undefined;
      ctx.state.isAuthenticated = false;
      if (userId) {
        ctx.emit("auth:logout", { userId });
        // @ts-expect-error -- wrong payload shape: { ctx } is not { userId: string }
        ctx.emit("auth:logout", { ctx });
      }

      ctx.require(routerPlugin).navigate(ctx.config.loginPath);
      ctx.emit("auth:timeout", { sessionTimeout: ctx.config.sessionTimeout });

      // @ts-expect-error -- wrong payload shape: { ctx } is not { from: string, to: string }
      ctx.emit("router:navigate", { ctx });
    },
    currentUser: () => ctx.state.currentUser,
    isAuthenticated: () => ctx.state.isAuthenticated
  }),
  hooks: ctx => ({
    "router:navigate": ({ to }) => {
      if (to === "/protected" && !ctx.state.isAuthenticated) {
        ctx.require(routerPlugin).navigate(ctx.config.loginPath);
      }
    },
    "page:render": ({ path }) => {
      if (ctx.state.isAuthenticated) {
        // Optionally inject user info into rendered pages
      }
    }
  })
});
