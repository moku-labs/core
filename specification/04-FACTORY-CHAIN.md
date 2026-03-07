# 04 - The 3-Step Factory Chain

**Domain:** Why 3 steps exist, what each captures, how types flow through closures
**Architecture:** createCoreConfig -> createCore -> createApp

---

## 1. Overview

The factory chain is the defining architectural feature of Moku. Three function calls, each capturing context in closures and progressively binding types:

```
Step 1: createCoreConfig<Config, Events>(id, options)
  -> Returns: { createPlugin, createCore }
  -> Captures: framework ID, Config type + defaults, Events type,
               core plugins + core plugin configs (level 2 of 4-level merge)

Step 2: createCore(coreConfig, { plugins, pluginConfigs })
  -> Returns: { createApp, createPlugin }
  -> Captures: default plugins, default plugin configs, framework callbacks,
               core plugin config overrides (level 3 of 4-level merge)

Step 3: createApp({ plugins?, config?, pluginConfigs?, onReady?, onError?, onStart?, onStop? })
  -> Returns: App
  -> Captures: everything from steps 1 and 2, plus consumer additions,
               core plugin config overrides (level 4 of 4-level merge)
```

Each step lives in a separate file. This is not a style preference -- it solves a real circular dependency problem.

---

## 2. Why 3 Steps (Not 2)

The natural first instinct is two steps: one function to set up the framework, one to create the app. But this creates a circular import that breaks TypeScript's type inference.

**The problem:**

```
// BROKEN: 2-step approach
// framework/index.ts
import { createCore } from '@moku-labs/core';
import { routerPlugin } from './plugins/router';  // router needs createPlugin
const { createApp, createPlugin } = createCore(..., { plugins: [routerPlugin] });
export { createApp, createPlugin };

// framework/plugins/router/index.ts
import { createPlugin } from '../../index';  // CIRCULAR! index.ts imports router, router imports index
```

Plugin files need `createPlugin` bound to the framework's types. But `createPlugin` is returned by `createCore`, which needs the plugins as input. This is a classic circular dependency.

**The solution: split into 3 steps.**

```
config.ts  -- Step 1: createCoreConfig returns bound createPlugin + createCore
    |
    |  exports createPlugin (no circular dependency)
    v
plugins/*.ts  -- Plugin files import createPlugin from config.ts
    |
    |  exports plugin instances
    v
index.ts  -- Step 2: imports plugins and createCore, calls createCore
    |
    |  exports createApp
    v
consumer main.ts  -- Step 3: imports createApp, calls it
```

Config.ts is the root. It depends on nothing in the framework. Plugin files import from config.ts only. Index.ts imports from both config.ts and plugin files. No cycles.

---

## 3. Step 1: createCoreConfig

**File:** `my-framework/src/config.ts`

**What it captures:**
- Framework ID (used in error messages)
- `Config` type and default values
- `Events` type (event contract for typed emit/hooks)
- Core plugins (infrastructure plugins whose APIs are injected onto every regular plugin's context)
- Core plugin configs at level 2 of the 4-level merge

**What it returns:**
- `createPlugin` -- bound to `Config` and `Events`. Plugins created with this function get typed `ctx.global`, typed `ctx.emit`, and typed `hooks`. Core plugin APIs are also available on the context (e.g., `ctx.log`, `ctx.env`).
- `createCore` -- bound to `Config` and `Events`. Called once in the framework's index.ts.

```typescript
// my-framework/src/config.ts
import { createCoreConfig, createCorePlugin } from '@moku-labs/core';

type Config = {
  siteName: string;
  mode: 'development' | 'production';
};

type Events = {
  'page:render':     { path: string; html: string };
  'router:navigate': { from: string; to: string };
};

// Core plugins are created with the standalone createCorePlugin function
const logPlugin = createCorePlugin('log', {
  config: { level: 'info' as const },
  createState: () => ({ entries: [] as string[] }),
  api: (ctx) => ({
    info: (msg: string) => { ctx.state.entries.push(msg); console.log(msg); },
  }),
});

// Step 1: Define the type contract + attach core plugins
export const coreConfig = createCoreConfig<Config, Events>('moku-site', {
  config: {
    siteName: 'Untitled',
    mode: 'development',
  },
  plugins: [logPlugin],                       // core plugins enter here
  pluginConfigs: { log: { level: 'debug' } }, // level 2 of 4-level merge
});

// These are bound to Config + Events
export const { createPlugin, createCore } = coreConfig;
```

**Closure pattern:** `createCoreConfig` returns functions that close over `id`, `Config` defaults, core plugins, and the generic parameters. When `createPlugin` is called later in a plugin file, it already knows the framework's types without any import from index.ts. Core plugin APIs are automatically available on every regular plugin's context.

---

## 4. Step 2: createCore

**File:** `my-framework/src/index.ts`

**What it captures:**
- Everything from Step 1 (via the `coreConfig` object)
- Default plugins array (what ships with the framework)
- Default plugin configs (framework-level config overrides)
- Framework callbacks (`onReady`, `onError`)

**What it returns:**
- `createApp` -- bound to everything. Ready for consumers.
- `createPlugin` -- re-exported for consumer convenience. Same binding as config.ts.

```typescript
// my-framework/src/index.ts
import { createCore, coreConfig } from './config';
import { routerPlugin } from './plugins/router';
import { rendererPlugin } from './plugins/renderer';
import { seoPlugin } from './plugins/seo';

// Step 2: Assemble the framework
const framework = createCore(coreConfig, {
  plugins: [routerPlugin, rendererPlugin, seoPlugin],
  pluginConfigs: {
    renderer: { template: 'default' },
  },
  onReady: ({ config }) => {
    if (config.mode === 'development') {
      console.log(`[moku-site] Ready: ${config.siteName}`);
    }
  },
});

// Export to consumers
export const { createApp, createPlugin } = framework;
```

**Type flow:** `createCore` receives the `coreConfig` object which carries `Config` and `Events` as type parameters. The `plugins` array provides the `DefaultPlugins` tuple type. The returned `createApp` knows the full type: `Config`, `Events`, and `DefaultPlugins`. Consumers get autocomplete on config keys and plugin config keys.

---

## 5. Step 3: createApp

**File:** `my-app/src/main.ts`

**What it captures:**
- Everything from Steps 1 and 2 (via closures in the returned function)
- Consumer's extra plugins
- Consumer's config overrides
- Consumer's plugin configs
- Consumer's lifecycle callbacks (`onReady`, `onError`, `onStart`, `onStop`)

**What it returns:**
- `App` with full type inference on all plugin APIs

```typescript
// my-app/src/main.ts
import { createApp, createPlugin } from 'my-framework';

// Consumer can create plugins using the framework's bound createPlugin
const blogPlugin = createPlugin('blog', {
  config: { postsPerPage: 10 },
  api: (ctx) => ({
    listPosts: () => ['post1', 'post2'],
  }),
});

// Step 3: Create the app
const app = createApp({
  plugins: [blogPlugin],
  config: {
    siteName: 'My Blog',
    mode: 'production',
  },
  pluginConfigs: {
    router: { basePath: '/blog' },
    blog: { postsPerPage: 5 },
  },
  onReady: (ctx) => {
    console.log(`${ctx.config.siteName} ready`);
  },
});

// Full type inference on plugin APIs
await app.start();
app.router.navigate('/about');  // typed: router is a framework default
app.blog.listPosts();           // typed: blog is a consumer plugin
await app.stop();
```

**Structured namespaces:** The `createApp` options use explicit namespaces — `config` for global overrides, `pluginConfigs` for per-plugin overrides, and callback fields for consumer lifecycle hooks. No runtime key discrimination is needed.

---

## 6. Type Flow Diagram

Types established in Step 1 flow through closures into every subsequent step:

```
createCorePlugin('log', spec)  -- standalone, no framework binding
    |
    +---> CorePluginInstance carries: name (literal), C, S, A

createCoreConfig<Config, Events>
    |
    |  Config = { siteName: string; mode: ... }
    |  Events = { 'page:render': ...; 'router:navigate': ... }
    |  CorePlugins = [logPlugin, envPlugin, ...]  (entered via plugins option)
    |  Core plugin configs merged at level 2
    |
    +---> createPlugin(name, spec)
    |       |
    |       |  spec.createState ctx has: { global: Readonly<Config>, config: Readonly<C> }
    |       |  spec.api ctx has: { global, config, state, emit<Events & PluginEvents>,
    |       |                      log, env, ... (core plugin APIs injected flat) }
    |       |  spec.hooks keys typed as: keyof (Events & PluginEvents & DepsEvents)
    |       |
    |       +---> PluginInstance carries: name (literal), C, S, A, PluginEvents
    |
    +---> createCore(coreConfig, { plugins: [router, renderer] })
              |
              |  DefaultPlugins = [typeof routerPlugin, typeof rendererPlugin]
              |  Core plugin configs merged at level 3
              |
              +---> createApp({ plugins?, config?, pluginConfigs?, onReady?, ... })
                      |
                      |  AllPlugins = [...DefaultPlugins, ...ConsumerPlugins]
                      |  config typed as Partial<Config>, pluginConfigs keyed by plugin name
                      |  Core plugin configs merged at level 4
                      |
                      +---> App<Config, Events, AllPlugins>
                              |
                              |  app.router  -> RouterApi (from DefaultPlugins)
                              |  app.blog    -> BlogApi (from ConsumerPlugins)
                              |  app.emit    -> typed for Events & all PluginEvents
                              |  app.start() -> core onStart first, then plugin onStart
                              |  app.stop()  -> plugin onStop first, then core onStop (reverse)
```

The key insight: `Config` and `Events` are defined ONCE in config.ts and flow everywhere through closures. No type imports needed. No generic annotations needed at the consumer level.

---

## 7. Complete File-by-File Example

### my-framework/src/config.ts (Step 1)

```typescript
import { createCoreConfig } from '@moku-labs/core';

// The framework's type contract -- defined once, flows everywhere
type Config = {
  appName: string;
  debug: boolean;
};

type Events = {
  'app:ready':  { config: Config };
  'data:fetch': { url: string; result: unknown };
};

export const coreConfig = createCoreConfig<Config, Events>('my-framework', {
  config: {
    appName: 'Untitled App',
    debug: false,
  },
});

// Plugins import createPlugin from here -- it knows Config and Events
export const { createPlugin, createCore } = coreConfig;
```

### my-framework/src/plugins/logger/index.ts

```typescript
import { createPlugin } from '../../config';
// createPlugin already knows Config = { appName, debug } and Events

export const loggerPlugin = createPlugin('logger', {
  api: (ctx) => ({
    // ctx.global is typed as Readonly<Config>
    log: (msg: string) => {
      if (ctx.global.debug) console.log(`[${ctx.global.appName}] ${msg}`);
    },
  }),
  hooks: (ctx) => ({
    // 'data:fetch' is typed from Events
    'data:fetch': (payload) => {
      // payload typed as { url: string; result: unknown }
      console.log(`Fetched: ${payload.url}`);
    },
  }),
});
```

### my-framework/src/plugins/fetcher/index.ts

```typescript
import { createPlugin } from '../../config';
import { loggerPlugin } from '../logger';

export const fetcherPlugin = createPlugin('fetcher', {
  depends: [loggerPlugin],
  api: (ctx) => ({
    fetch: async (url: string) => {
      ctx.require(loggerPlugin).log(`Fetching ${url}...`);
      const result = await globalThis.fetch(url).then(r => r.json());
      void ctx.emit('data:fetch', { url, result });
      return result;
    },
  }),
});
```

### my-framework/src/index.ts (Step 2)

```typescript
import { createCore, coreConfig } from './config';
import { loggerPlugin } from './plugins/logger';
import { fetcherPlugin } from './plugins/fetcher';

const framework = createCore(coreConfig, {
  plugins: [loggerPlugin, fetcherPlugin],
});

export const { createApp, createPlugin } = framework;
```

### my-app/src/main.ts (Step 3)

```typescript
import { createApp, createPlugin } from 'my-framework';

const dashboardPlugin = createPlugin('dashboard', {
  config: { refreshInterval: 5000 },
  api: (ctx) => ({
    refresh: async () => {
      // ctx.global typed as Config, ctx.config typed from config
      console.log(`Refreshing ${ctx.global.appName} dashboard...`);
    },
  }),
});

const app = createApp({
  plugins: [dashboardPlugin],
  config: {
    appName: 'My Dashboard',    // typed as string (from Config)
    debug: true,                // typed as boolean (from Config)
  },
  pluginConfigs: {
    dashboard: {                // typed from dashboardPlugin's config
      refreshInterval: 1000,
    },
  },
});

await app.start();
app.logger.log('Started');           // typed -- framework default
app.fetcher.fetch('/api/data');      // typed -- framework default
app.dashboard.refresh();             // typed -- consumer plugin
await app.stop();
```

---

## Cross-References

- Core API signatures: [02-CORE-API](./02-CORE-API.md)
- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Config resolution: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
