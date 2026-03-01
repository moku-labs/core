# 12 - Plugin Patterns and LLM Guide

**Domain:** Plugin = connection point, file structure, conventions, LLM system prompt
**Architecture:** 3-step (createCoreConfig -> createCore -> createApp)

---

## 1. Plugin = Connection Point

### The Rule

**A plugin file is an index.ts that connects domain code to the system. It is NOT where you write business logic.**

Think of a plugin as a **wiring harness.** The harness connects the engine to the chassis. The harness is not the engine. The harness is not the chassis. It's the interface between them.

### What a Plugin File Should Look Like

```typescript
// plugins/router/index.ts -- THIS IS THE PLUGIN

import { createPlugin } from '../../config';
import type { RouterConfig, RouterState } from './types';
import { createRouterState } from './state';
import { createRouterApi } from './api';
import { handleNotFound } from './handlers';

export const routerPlugin = createPlugin('router', {
  depends: [rendererPlugin],
  config: { basePath: '/', default: 'home' },
  createState: createRouterState,
  api: createRouterApi,

  onInit: (ctx) => {
    if (ctx.has('logger')) {
      ctx.require(loggerPlugin).info('Router ready');
    }
  },

  hooks: (ctx) => ({
    'page:error': handleNotFound,
  }),

  onStart: async (ctx) => {
    void ctx.emit('router:navigate', {
      from: '',
      to: ctx.config.default,
    });
  },
});
```

**Notice: the plugin file has almost no logic.** It imports everything from domain modules and connects them to lifecycle hooks and API slots. The plugin is ~30 lines. The domain code could be 3000 lines.

---

## 2. Plugin File Structure

```
plugins/
  router/
    index.ts          <-- The plugin. Exports routerPlugin. ~30 lines.
    types.ts          <-- RouterConfig, RouterApi, RouterState types
    state.ts          <-- createRouterState() factory
    api.ts            <-- createRouterApi() factory
    handlers.ts       <-- Event handlers (navigation, errors)
    __tests__/
      state.test.ts   <-- Test state logic independently
      api.test.ts     <-- Test API logic independently
      router.test.ts  <-- Integration test with plugin wiring

  analytics/
    index.ts          <-- The plugin. ~20 lines.
    types.ts
    tracker.ts        <-- Core tracking logic
    providers/
      google.ts       <-- Google Analytics provider
      plausible.ts    <-- Plausible provider
    __tests__/

  blog/
    index.ts          <-- The plugin. ~25 lines.
    types.ts
    parser.ts         <-- Markdown to HTML
    indexer.ts        <-- Post indexing and search
    feed.ts           <-- RSS/Atom feed generation
    __tests__/
```

---

## 3. Why This Matters

The plugin file is the **map**. The domain files are the **territory.** An LLM reads the map (fast, cheap, ~30 lines) and then navigates to exactly the right domain file (precise, targeted). If all the code is in the plugin file, the LLM has to read and understand everything just to find where to make a change.

This structure also enables independent testing. Domain functions (`createRouterState`, `createRouterApi`, `handleNotFound`) are pure functions that take `ctx` as input. They can be unit tested without spinning up the whole framework -- `api.ts` and `handlers.ts` are just functions that accept a context-shaped object.

---

## 4. Complete Three-Layer Example

### Layer 1: @moku-labs/core

```typescript
// @moku-labs/core/src/index.ts
export { createCoreConfig } from './core-config';
```

### Layer 2: Framework -- config.ts

```typescript
// my-framework/src/config.ts
import { createCoreConfig } from '@moku-labs/core';

type Config = {
  siteName: string;
  description?: string;
  mode: 'development' | 'production';
};

type Events = {
  'app:start':       { config: Config };
  'page:render':     { path: string; html: string };
  'page:error':      { path: string; error: Error };
  'router:navigate': { from: string; to: string };
  'router:notFound': { path: string; fallback: string };
};

export const coreConfig = createCoreConfig<Config, Events>('moku-site', {
  config: {
    siteName: 'Untitled',
    mode: 'development',
  },
});

export const { createPlugin, createCore } = coreConfig;
```

### Layer 2: Framework -- plugins/router/index.ts

```typescript
// my-framework/src/plugins/router/index.ts
import { createPlugin } from '../../config';

export const routerPlugin = createPlugin('router', {
  config: { basePath: '/' },
  createState: () => ({ currentPath: '/' }),
  api: (ctx) => ({
    navigate: (path: string) => {
      ctx.state.currentPath = path;
      void ctx.emit('router:navigate', { from: '/', to: path });
    },
    current: () => ctx.state.currentPath,
  }),
  onInit: (ctx) => {
    // All plugins created, can check dependencies
  },
  onStart: (ctx) => {
    // App is starting
  },
  onStop: (ctx) => {
    // Teardown
  },
});
```

### Layer 2: Framework -- index.ts

```typescript
// my-framework/src/index.ts
import { createCore, coreConfig } from './config';
import { routerPlugin } from './plugins/router';
import { rendererPlugin } from './plugins/renderer';
import { seoPlugin } from './plugins/seo';

const framework = createCore(coreConfig, {
  plugins: [routerPlugin, rendererPlugin, seoPlugin],
});

export const { createApp, createPlugin } = framework;
```

### Layer 3: Consumer -- main.ts

```typescript
// my-blog/src/main.ts
import { createApp, createPlugin } from 'my-framework';

const blogPlugin = createPlugin('blog', {
  config: { postsPerPage: 10 },
  api: (ctx) => ({
    listPosts: () => ['post1', 'post2'],
  }),
});

const app = await createApp({
  plugins: [blogPlugin],
  config: {
    siteName: 'Code & Coffee',
    mode: 'production',
  },
  pluginConfigs: {
    blog: { postsPerPage: 5 },
  },
});

await app.start();

app.router.navigate('/about');   // typed, framework default plugin
app.blog.listPosts();            // typed, consumer extra plugin

await app.stop();
```

### Layer 3: Custom Plugin

```typescript
// my-blog/src/plugins/contact-form/index.ts
import { createPlugin } from 'my-framework';
import { createContactFormApi } from './api';

export const contactFormPlugin = createPlugin('contactForm', {
  depends: [rendererPlugin],
  api: createContactFormApi,
  hooks: (ctx) => ({
    'page:render': (payload) => { /* framework typed */ },
  }),
});
```

```typescript
// my-blog/src/plugins/contact-form/types.ts
export type ContactFormConfig = {
  recipient: string;
  subject?: string;
};

export type ContactFormApi = {
  submit: (data: { name: string; email: string; message: string }) => Promise<boolean>;
};
```

---

## 5. LLM System Prompt Fragment

For teams using Moku with LLM code generation, include this in your system prompt:

```
You are generating code for a Moku-based application.

ARCHITECTURE (3 layers, 3 steps):
- Layer 1 (@moku-labs/core): Exports createCoreConfig only. Never import this in consumer code.
- Layer 2 (framework): Uses createCoreConfig + createCore to define the framework.
  Provides createApp and createPlugin to consumers.
- Layer 3 (consumer): Uses createApp + createPlugin from the framework package.

THREE-STEP PATTERN:

  Step 1 -- Framework config.ts (createCoreConfig):
    import { createCoreConfig } from '@moku-labs/core';
    type Config = { siteName: string; mode: 'dev' | 'prod' };
    type Events = { 'app:start': { config: Config } };
    export const coreConfig = createCoreConfig<Config, Events>('my-framework', {
      config: { siteName: 'Untitled', mode: 'dev' },
    });
    export const { createPlugin, createCore } = coreConfig;

  Step 2 -- Framework index.ts (createCore):
    import { createCore, coreConfig } from './config';
    import { routerPlugin } from './plugins/router';
    const framework = createCore(coreConfig, { plugins: [routerPlugin] });
    export const { createApp, createPlugin } = framework;

  Step 3 -- Consumer main.ts (createApp):
    import { createApp, createPlugin } from 'my-framework';
    const myPlugin = createPlugin('myPlugin', { ... });
    const app = await createApp({
      plugins: [myPlugin],
      config: { siteName: 'My App' },
      pluginConfigs: { myPlugin: { someConfig: true } },
    });
    await app.start();

CREATING PLUGINS:
  import { createPlugin } from 'my-framework';  // NOT from @moku-labs/core
  export const myPlugin = createPlugin('myPlugin', {
    config: { /* optional defaults */ },
    createState: (ctx) => ({ /* internal mutable state */ }),
    api: (ctx) => ({
      /* public methods -- this becomes app.myPlugin.methodName() */
    }),
    onInit: (ctx) => { /* runs during createApp, all plugins exist */ },
    onStart: (ctx) => { /* runs during app.start() */ },
    onStop: (ctx) => { /* runs during app.stop(), reverse order */ },
    hooks: (ctx) => ({
      'eventName': (payload) => { /* react to typed events */ },
    }),
  });

  Per-plugin events via register callback:
  events: (register) => ({ 'event:name': register<PayloadType>('description') })
  Zero explicit generics. All types are inferred.

CONTEXT RULES:
  createState: only { global, config }. NO require/emit.
  api, onInit, onStart: full PluginContext.
    HAS global, config, state, emit, require, has.
  onStop: TeardownContext. Only { global }. Minimal for cleanup.

LIFECYCLE (3 phases):
  createApp: createState -> hooks -> api -> onInit (forward order) -> app returned
  app.start(): onStart (forward order)
  app.stop(): onStop (REVERSE order)

  All lifecycle methods support async (return void | Promise<void>).
  Execution is sequential -- Plugin A completes before Plugin B begins.
  createApp returns a Promise -- ALWAYS use await.

EVENT SYSTEM:
  Two sources of typed events:
  1. Global events from createCoreConfig<Config, Events> -- available to all plugins.
  2. Per-plugin events from events register callback -- scoped to plugin + dependents.

  ctx.emit('eventName', payload) -- fire event (strictly typed, no escape hatch).
  hooks: (ctx) => ({ 'eventName': (payload) => { ... } }) -- listen to events.
  Events are notifications. Use ctx.require(pluginInstance) for request/response.

CONFIG RULES:
  - config present = config key optional in createApp
  - config absent + non-void config = config key required in createApp
  - Shallow merge: { ...config, ...consumerConfig }
  - Configs are frozen after creation
  - depends: [pluginInstance] declares dependencies (instance-based). Validated at startup. Not a sort.

FILE STRUCTURE:
  plugins/
    my-plugin/
      index.ts       <- createPlugin() call, imports from other files (~30 lines)
      types.ts       <- Config, API, State type definitions
      state.ts       <- createState factory
      api.ts         <- API factory
      handlers.ts    <- Event handlers
      __tests__/     <- Tests for each domain file independently

RULES:
  - Never import from @moku-labs/core. Only import from the framework package.
  - Never create new abstractions (services, providers, managers). Use createPlugin.
  - Never put more than ~50 lines of logic in a plugin index.ts.
  - Plugin index.ts is a CONNECTION POINT. Domain code lives in separate files.
  - Use ctx.require(pluginInstance) for dependencies. Use ctx.has('name') for optional deps.
  - ALWAYS await createApp -- it returns a Promise.

APP-LEVEL TYPING:
  app.pluginName.method() is fully typed via the plugin's api return type.
  app.emit('eventName', payload) -- strictly typed event dispatch.
  app.require(pluginInstance) -- get plugin API by instance reference.
  app.has('name') -- check if a plugin is registered (boolean).
  app.start() starts all plugins (forward order).
  app.stop() stops all plugins (reverse order).
```

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Anti-patterns: [11-INVARIANTS](./11-INVARIANTS.md)
- Architecture: [01-ARCHITECTURE](./01-ARCHITECTURE.md)
