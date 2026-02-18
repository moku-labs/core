# 12 - Plugin Patterns and LLM Guide

**Domain:** Plugin = connection point, file structure, conventions, LLM system prompt
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1)

---

## 1. Plugin = Connection Point

### The Rule

**A plugin file is an index.ts that connects domain code to the system. It is NOT where you write business logic.**

Think of a plugin as a **wiring harness.** The harness connects the engine to the chassis. The harness is not the engine. The harness is not the chassis. It's the interface between them.

### What a Plugin File Should Look Like

```typescript
// plugins/router/index.ts -- THIS IS THE PLUGIN

import { createPlugin } from 'my-framework';
import type { RouterConfig, RouterApi, RouterState } from './types';
import { createRouterState } from './state';
import { createRouterApi } from './api';
import { validateConfig } from './validation';
import { handleNotFound } from './handlers';

export const RouterPlugin = createPlugin<'router', RouterConfig, RouterApi, RouterState>(
  'router',
  {
    depends: ['renderer'],
    createState: createRouterState,
    onCreate: ({ config }) => validateConfig(config),
    api: createRouterApi,

    onInit: (ctx) => {
      if (ctx.has('logger')) {
        ctx.require<{ info: Function }>('logger').info('Router ready');
      }
    },

    hooks: {
      'page:error': handleNotFound,
    },

    onStart: async (ctx) => {
      void ctx.signal('router:navigate', {
        from: '',
        to: ctx.config.default,
      });
    },
  },
);
```

**Notice: the plugin file has almost no logic.** It imports everything from domain modules and connects them to lifecycle hooks and API slots. The plugin is ~30 lines. The domain code could be 3000 lines.

---

## 2. Plugin File Structure

```
plugins/
  router/
    index.ts          <-- The plugin. Exports RouterPlugin. ~30 lines.
    types.ts          <-- RouterConfig, RouterApi, RouterState types
    state.ts          <-- createRouterState() factory
    api.ts            <-- createRouterApi() factory
    validation.ts     <-- Config validation logic
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

This structure also enables independent testing. Domain functions (`createRouterState`, `createRouterApi`, `handleNotFound`) are pure functions that take `ctx` as input. They can be unit tested without spinning up the whole framework. See [10-TESTING](./10-TESTING.md).

---

## 4. Complete Three-Layer Example

### Layer 1: moku_core

```typescript
// moku_core/src/index.ts
export { createCore } from './core';

// moku_core/testing (sub-path export)
// export { createTestCtx } from './testing';
```

### Layer 2: Site Builder Framework

```typescript
// my-framework/src/index.ts
import { createCore } from 'moku_core';
import { RouterPlugin } from './plugins/router';
import { RendererPlugin } from './plugins/renderer';
import { SEOPlugin } from './plugins/seo';

export type BaseConfig = {
  siteName: string;
  description?: string;
  mode: 'development' | 'production';
};

export type BusContract = {
  'app:boot':    { config: BaseConfig };
  'app:ready':   { config: BaseConfig };
  'page:render': { path: string; html: string };
  'page:error':  { path: string; error: Error };
};

export type SignalRegistry = {
  'router:navigate': { from: string; to: string };
  'router:notFound': { path: string; fallback: string };
};

const core = createCore<BaseConfig, BusContract, SignalRegistry>('moku-site', {
  config: { siteName: 'Untitled', mode: 'development' },
  plugins: [RouterPlugin, RendererPlugin, SEOPlugin],
  onBoot: ({ config }) => {
    if (config.mode === 'development') {
      console.log(`[moku-site] Starting ${config.siteName} in dev mode`);
    }
  },
});

export const {
  createConfig,
  createApp,
  createPlugin,
  createComponent,
  createModule,
  createPluginFactory,
} = core;

export { AnalyticsPlugin } from './plugins/analytics';
export { BlogPlugin } from './plugins/blog';
```

### Layer 3: Consumer Blog

```typescript
// my-blog/src/main.ts
import { createConfig, createApp, createPlugin } from 'my-framework';
import { BlogPlugin } from 'my-framework/plugins';
import { ContactFormPlugin } from './plugins/contact-form';

const HomePage = { render: () => '<h1>Welcome</h1>' };
const AboutPage = { render: () => '<h1>About</h1>' };

const config = createConfig(
  { siteName: 'Code & Coffee', mode: 'production' },
  [BlogPlugin, ContactFormPlugin],
);

const app = await createApp(config, {
  router: { default: 'home', pages: { home: HomePage, about: AboutPage } },
  blog: { postsDir: './content', postsPerPage: 5 },
  contactForm: { recipient: 'me@example.com' },
});

await app.start();

app.config.siteName;             // 'Code & Coffee' -- typed
app.router.navigate('about');    // typed, framework default
app.blog.listPosts();            // typed, consumer extra
app.contactForm.submit({         // typed, consumer custom plugin
  name: 'Alice', email: 'alice@example.com', message: 'Hello!',
});

await app.destroy();
```

### Layer 3: Custom Plugin

```typescript
// my-blog/src/plugins/contact-form/index.ts
import { createPlugin } from 'my-framework';
import type { ContactFormConfig, ContactFormApi } from './types';
import { createContactFormApi } from './api';

export const ContactFormPlugin = createPlugin<
  'contactForm', ContactFormConfig, ContactFormApi
>('contactForm', {
  depends: ['renderer'],
  api: createContactFormApi,
  hooks: { 'page:render': (payload) => { /* framework typed */ } },
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

### Layer 3: Multi-Instance Plugin

```typescript
import { createConfig, createApp, PrimaryDb, ReplicaDb } from 'my-api-framework';

const config = createConfig(
  { appName: 'My API' },
  [PrimaryDb, ReplicaDb],
);

const app = await createApp(config, {
  primaryDb: { connectionString: 'postgres://primary:5432/main' },
  replicaDb: { connectionString: 'postgres://replica:5432/main' },
});

await app.start();

app.primaryDb.query('INSERT INTO ...');   // typed, separate instance
app.replicaDb.query('SELECT * FROM ...');  // typed, separate instance
```

---

## 5. LLM System Prompt Fragment

For teams using Moku with LLM code generation, include this in your system prompt:

```
You are generating code for a Moku-based application.

ARCHITECTURE (3 layers):
- Layer 1 (moku_core): Never touch this. Exports createCore only.
- Layer 2 (framework): Defines createConfig, createApp, createPlugin,
  createPluginFactory, BaseConfig, BusContract, SignalRegistry, default plugins.
- Layer 3 (consumer): Uses createConfig + await createApp from the framework.
  Configures and composes.

TWO-STEP PATTERN (ALWAYS follow this):
  const config = createConfig(globalOverrides, [ExtraPlugin1, ExtraPlugin2]);
  const app = await createApp(config, { pluginName: { ... }, ... });

  Step 1 (createConfig): declares WHAT the app is made of (global config + plugins).
  Step 2 (await createApp): provides HOW each plugin is configured.
  NEVER skip createConfig -- TypeScript needs it to type pluginConfigs.
  ALWAYS await createApp -- it returns a Promise.

CUSTOM PLUGINS:
  import { createPlugin } from 'my-framework';  // NOT from moku_core
  export const MyPlugin = createPlugin<'myPlugin', MyConfig, MyApi>('myPlugin', { ... });

  The framework's createPlugin gives your plugin typed ctx.global, ctx.emit, and ctx.signal.

MULTI-INSTANCE PLUGINS:
  import { createPluginFactory } from 'my-framework';
  const createDbPlugin = createPluginFactory<DbConfig, DbApi, DbState>({ ... });
  export const PrimaryDb = createDbPlugin('primaryDb');
  export const ReplicaDb = createDbPlugin('replicaDb');

RULES:
- Never import from moku_core. Only import from the framework package.
- Never create new abstractions (services, providers, managers). Use createPlugin.
- Never put more than ~50 lines of logic in a plugin index.ts.
- Plugin index.ts is a CONNECTION POINT. Domain code lives in separate files.
- Use ctx.require('name') for dependencies. Use ctx.has('name') for optional deps.
- Use ctx.emit() for framework events (typed via BusContract).
- Use ctx.signal() for plugin-to-plugin events (typed if in SignalRegistry, untyped otherwise).
- Config types define the contract:
    void = no config
    { field?: string } = optional field
    { field: string } = required field
    defaultConfig present = config key optional in createApp
    defaultConfig absent = config key required in createApp
- If a plugin has defaultConfig, consumers can omit the config key entirely.
- depends: ['pluginName'] declares dependencies. Validated at startup. Not a topological sort.

ASYNC LIFECYCLE:
  createState, onCreate, api(), onInit can all be async (return Promise).
  Execution is sequential -- Plugin A completes before Plugin B begins.
  createApp itself returns a Promise -- always use await.

FILE STRUCTURE:
plugins/
  my-plugin/
    index.ts       <- createPlugin() call, imports from other files (~30 lines)
    types.ts       <- Config, API, State type definitions
    state.ts       <- createState factory
    api.ts         <- API factory
    handlers.ts    <- Event handlers
    validation.ts  <- Config validation
    __tests__/     <- Tests for each domain file independently

LIFECYCLE ORDER:
  createState -> onCreate -> api() -> onInit -> [createApp resolves]
  -> app.start() -> onStart
  -> app.stop() -> onStop (reverse) -> app.destroy() -> onDestroy (reverse)

CONTEXT RULES:
  createState/onCreate: only { global, config }. NO getPlugin/require/emit/signal.
  api: full PluginCtx. HAS everything including state and all communication.
  onInit: BaseCtx + config. HAS getPlugin/require/has/emit/signal. Use for dependency checks.
  onStart: full PluginCtx. HAS everything. Async.
  onStop/onDestroy: only { global }. Minimal teardown context.

TESTING:
  import { createTestCtx } from 'moku_core/testing';
  Unit test domain files (api.ts, state.ts) with createTestCtx.
  Integration test plugin wiring (index.ts) with createApp.

APP-LEVEL TYPING:
  app.getPlugin('router') returns RouterApi | undefined (typed, constrained to registered names)
  app.require('router') returns RouterApi (typed, throws if missing)
  app.router.navigate() is fully typed via BuildPluginApis
```

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Testing: [10-TESTING](./10-TESTING.md)
- Anti-patterns: [11-INVARIANTS](./11-INVARIANTS.md)
- Architecture: [01-ARCHITECTURE](./01-ARCHITECTURE.md)

