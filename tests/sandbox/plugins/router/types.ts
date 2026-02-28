export type RouterConfig = {
  basePath: string;
  notFoundPath: string;
};

export type RouterState = {
  currentPath: string;
  history: string[];
  guards: NavigationGuard[];
  initialized: boolean;
};

export type NavigationGuard = (to: string, from: string) => boolean;

export type NavigationResult = {
  from: string;
  to: string;
  blocked: boolean;
};

export type RouterEvents = {
  "router:navigate": { from: string; to: string };
  "router:not-found": { path: string };
};

export type RouterCtx = {
  config: RouterConfig;
  state: RouterState;
  emit: {
    (name: "router:navigate", payload: RouterEvents["router:navigate"]): void;
    (name: "router:not-found", payload: RouterEvents["router:not-found"]): void;
  };
};
