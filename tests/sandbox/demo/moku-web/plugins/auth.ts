import { createPlugin } from "../config";
import { routerPlugin } from "./router";

export type AuthEvents = {
  "auth:login": { userId: string };
  "auth:logout": { userId: string };
};

export const authPlugin = createPlugin("auth", {
  events: {} as AuthEvents,
  depends: [routerPlugin] as const,
  defaultConfig: {
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
      }
    },
    currentUser: () => ctx.state.currentUser,
    isAuthenticated: () => ctx.state.isAuthenticated
  })
});
