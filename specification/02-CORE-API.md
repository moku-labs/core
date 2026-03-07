# 02 - Core API

**Domain:** createCoreConfig, createCore, createApp, createPlugin, createCorePlugin signatures
**Architecture:** 3-step factory chain (Layer 1 -> Layer 2 -> Layer 3)

---

## 1. Layer 1: Public API Surface

```typescript
// @moku-labs/core — Package Entry Point
export { createCoreConfig } from './config';
export { createCorePlugin } from './core-plugin';

// Public type utilities for plugin authors
export type { PluginCtx } from './types';
export type { EmitFn } from './utilities';
```

Two functions and two type utilities. `createCoreConfig` is the main entry point. `createCorePlugin` is a standalone factory for creating core plugins (log, storage, env) whose APIs are injected onto every regular plugin's context. The types are optional helpers for plugin authors at Standard+ tier who extract domain logic into separate files.

### Public Type Utilities

| Export | Purpose | Used by |
|---|---|---|
| `PluginCtx<C, S, E>` | Domain context type for extracted plugin files. Auto-generates emit overloads from event map. | Standard+ tier plugin `types.ts` files |
| `EmitFn<E>` | Emit overload builder. Converts an event map to overloaded call signatures. | Advanced composition when `PluginCtx` is too opinionated |

```typescript
// Standard usage — one line replaces manual emit overloads:
import type { PluginCtx } from '@moku-labs/core';
export type RouterCtx = PluginCtx<RouterConfig, RouterState, RouterEvents>;

// Advanced usage — compose your own context with EmitFn:
import type { EmitFn } from '@moku-labs/core';
export type RouterCtx = {
  config: RouterConfig;
  state: RouterState;
  emit: EmitFn<RouterEvents>;
};
```

See [14-EVENT-REGISTRATION §6](./14-EVENT-REGISTRATION.md) and [15-PLUGIN-STRUCTURE §4](./15-PLUGIN-STRUCTURE.md) for full usage patterns.

---

## 2. createCoreConfig Signature

```typescript
function createCoreConfig<
  Config extends Record<string, unknown>,
  Events extends Record<string, unknown> = Record<string, never>,
>(
  id: string,
  options: {
    config: Config;
    plugins?: CorePluginInstance[];
    pluginConfigs?: { [corePluginName: string]?: Partial<CorePluginConfig> };
  },
): {
  createPlugin: BoundCreatePluginFunction<Config, Events>;
  createCore: BoundCreateCoreFunction<Config, Events>;
};
```

**Generic parameters:**

| Param | Purpose | Set by | Default |
|---|---|---|---|
| `Config` | Shape of global config every app of this framework needs | Framework author (Layer 2) | (required) |
| `Events` | Map of event names to payload types (framework events + known plugin events) | Framework author (Layer 2) | `Record<string, never>` |

When `Events` is `Record<string, never>` (the default), `emit()` accepts no events (no valid keys). When populated, `emit()` strictly enforces event names and payload types. There is no untyped escape hatch -- only known event names are accepted.

**`id`:** Human-readable framework name. Used in error messages: `"[moku-site] Duplicate plugin name: router"`

**`options.config`:** Default values for the Config type. Consumers can override any field via `createApp`. These defaults are shallow-merged with consumer overrides.

**`options.plugins`:** Optional array of core plugin instances (created via `createCorePlugin`). Core plugins provide infrastructure APIs (log, storage, env) that are injected flat onto every regular plugin's context. See [03-PLUGIN-SYSTEM §5](./03-PLUGIN-SYSTEM.md) for core plugin details.

**`options.pluginConfigs`:** Optional config overrides for core plugins at this level. This is the second level of the 4-level core plugin config merge: spec defaults -> `createCoreConfig` pluginConfigs -> `createCore` pluginConfigs -> `createApp` pluginConfigs.

**Returns:** An object with two bound functions:

- **`createPlugin`** -- Factory for creating plugins, bound to `Config` and `Events`. Plugin authors import this from the framework's config.ts to get full type inference.
- **`createCore`** -- Factory for setting up the framework, bound to `Config` and `Events`. Called once in the framework's index.ts.

```typescript
// my-framework/src/config.ts
import { createCoreConfig } from '@moku-labs/core';

type Config = {
  siteName: string;
  mode: 'development' | 'production';
};

type Events = {
  'page:render': { path: string; html: string };
  'router:navigate': { from: string; to: string };
};

export const coreConfig = createCoreConfig<Config, Events>('moku-site', {
  config: {
    siteName: 'Untitled',
    mode: 'development',
  },
});

export const { createPlugin, createCore } = coreConfig;
```

---

## 3. createCore Signature

```typescript
function createCore(
  coreConfig: { readonly createPlugin: BoundCreatePluginFunction<Config, Events> },
  options: {
    plugins: PluginInstance[];
    pluginConfigs?: Record<string, unknown>;
    onReady?: (ctx: { config: Readonly<Config> }) => void;
    onError?: (error: Error) => void;
  },
): {
  createApp: CreateAppFn<Config, Events, DefaultPlugins>;
  createPlugin: BoundCreatePluginFunction<Config, Events>;
};
```

**Parameters:**

- **`coreConfig`** -- The object returned by `createCoreConfig`. Passed for type flow only (the argument is unused at runtime). The `createPlugin` property carries the bound type information.
- **`options.plugins`** -- Default plugins that ship with the framework. Always loaded. Consumer cannot remove them.
- **`options.pluginConfigs`** -- Default config overrides for framework plugins. Merged with consumer overrides.
- **`options.onReady`** -- Optional callback fired after all plugins have completed init.
- **`options.onError`** -- Optional error handler for observability.

**Returns:** An object with two functions:

- **`createApp`** -- The consumer-facing app creation function. Bound to framework defaults, types, and plugins.
- **`createPlugin`** -- Re-exported for consumer convenience. Same binding as the createPlugin from config.ts.

```typescript
// my-framework/src/index.ts
import { createCore, coreConfig } from './config';
import { routerPlugin } from './plugins/router';
import { rendererPlugin } from './plugins/renderer';

const framework = createCore(coreConfig, {
  plugins: [routerPlugin, rendererPlugin],
  pluginConfigs: {
    router: { basePath: '/app' },
  },
});

export const { createApp, createPlugin } = framework;
```

---

## 4. createApp Signature

```typescript
function createApp(
  options?: {
    plugins?: PluginInstance[];
    config?: Partial<Config>;
    pluginConfigs?: { [pluginName: string]?: Partial<PluginConfig> };
    onReady?: (context: AppCallbackContext) => void;
    onError?: (error: Error, context: AppCallbackContext) => void;
    onStart?: (context: AppCallbackContext) => void | Promise<void>;
    onStop?: (context: AppCallbackContext) => void | Promise<void>;
  },
): App<Config, Events, AllPlugins>;
```

`AppCallbackContext` includes `config` (frozen global config), `emit`, `require`, `has`, and all mounted plugin APIs. This gives consumer callbacks full access to the app's capabilities.

**Structured namespaces.** The `options` parameter uses explicit namespaces:

| Key | Purpose | Example |
|---|---|---|
| `plugins` | Extra consumer plugins | `plugins: [blogPlugin]` |
| `config` | Global config overrides (typed from `Config`) | `config: { siteName: 'My Blog' }` |
| `pluginConfigs` | Per-plugin config overrides (keyed by plugin name) | `pluginConfigs: { router: { basePath: '/' } }` |
| `onReady` | Called after all plugin `onInit` and framework `onReady` | `onReady: (ctx) => {}` |
| `onError` | Error handler for hook dispatch errors | `onError: (error) => {}` |
| `onStart` | Called after all plugin `onStart` (inside `app.start()`) | `onStart: (ctx) => {}` |
| `onStop` | Called after all plugin `onStop` (inside `app.stop()`) | `onStop: (ctx) => {}` |

Consumer callbacks are additive to framework-level callbacks set in `createCore`.

**Returns:** `App`. The app is fully initialized -- all plugins have completed their `onInit` phase. `createApp()` is synchronous and runs the init phase immediately.

`app.start()` and `app.stop()` are optional runtime lifecycle methods. They are mainly for applications with a distinct running phase (servers, workers, long-lived resources). Many apps may use `createApp()` and mounted plugin APIs without ever calling them.

**Lifecycle scope:** The lifecycle is non-transactional. If `start()` or `stop()` throws, the kernel propagates the error and does not attempt rollback or compensation.

**The final plugin list is:** `[...frameworkDefaults, ...consumerExtras]`

Order: framework defaults first (in the order the framework defined them), then consumer extras (in the order the consumer listed them). The consumer cannot reorder framework defaults.

```typescript
// my-blog/src/main.ts
import { createApp } from 'my-framework';
import { blogPlugin } from './plugins/blog';

const app = createApp({
  plugins: [blogPlugin],
  config: {
    siteName: 'My Blog',
    mode: 'production',
  },
  pluginConfigs: {
    router: { basePath: '/' },
    blog: { postsPerPage: 5 },
  },
  onReady: (ctx) => {
    console.log(`${ctx.config.siteName} ready`);
  },
});
```

### Without Extra Plugins

```typescript
// Minimal: framework defaults only, just config overrides
const app = createApp({
  config: {
    siteName: 'Simple Site',
    mode: 'production',
  },
});
```

### Without Any Options

```typescript
// Framework defaults for everything
const app = createApp();
```

---

## 5. createPlugin Signature

```typescript
function createPlugin(
  name: string,
  spec: PluginSpec,
): PluginInstance;
```

**Zero generic parameters.** All types are inferred from the spec object:
- Config shape (`C`) from `config`
- State shape (`S`) from `createState` return
- API shape (`A`) from `api` return
- Event map from the `events` register callback (see [14-EVENT-REGISTRATION](./14-EVENT-REGISTRATION.md))

The framework's `Config` and `Events` types are pre-bound from `createCoreConfig`.

Brief here -- see [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md) for full plugin spec details.

---

## 6. createCorePlugin Signature

```typescript
function createCorePlugin<const N extends string, C, S, A>(
  name: N,
  spec: CorePluginSpec<C, S, A>,
): CorePluginInstance<N, C, S, A>;
```

**`CorePluginSpec` shape:**

```typescript
type CorePluginContext<C, S> = {
  readonly config: Readonly<C>;
  state: S;
};

type CorePluginSpec<C, S, A> = {
  config?: C;
  createState?: (context: { readonly config: Readonly<C> }) => S;
  api?: (context: CorePluginContext<C, S>) => A;
  onInit?: (context: CorePluginContext<C, S>) => void;
  onStart?: (context: CorePluginContext<C, S>) => void | Promise<void>;
  onStop?: (context: CorePluginContext<C, S>) => void | Promise<void>;
};
```

**Key differences from `createPlugin`:**

| Aspect | `createPlugin` (regular) | `createCorePlugin` (core) |
|---|---|---|
| Context | `{ global, config, state, emit, require, has }` | `{ config, state }` only |
| `depends` | Supported | Not available |
| `events` | Register callback | Not available |
| `hooks` | Event subscriptions | Not available |
| API injection | Mounted on `app.<name>` | Injected flat on every regular plugin's `ctx.<name>` |
| Lifecycle order | After core plugins | Before regular plugins (init/start); after regular plugins (stop) |

Core plugins are self-contained infrastructure. They have no access to `global` config, `emit`, `require`, or `has`. Their APIs are injected directly onto every regular plugin's context: `ctx.log.info(...)`, `ctx.env.isDev()`.

**Standalone function:** `createCorePlugin` is exported directly from `@moku-labs/core` and is not bound to any framework. Core plugin instances are passed to `createCoreConfig` via the `plugins` option.

```typescript
import { createCoreConfig, createCorePlugin } from '@moku-labs/core';

const logPlugin = createCorePlugin('log', {
  config: { level: 'info' },
  createState: () => ({ entries: [] as string[] }),
  api: (ctx) => ({
    info: (msg: string) => {
      ctx.state.entries.push(msg);
      console.log(msg);
    },
  }),
});

const { createPlugin, createCore } = createCoreConfig<Config, Events>('my-site', {
  config: { siteName: 'My Site' },
  plugins: [logPlugin],
  pluginConfigs: { log: { level: 'debug' } },
});
```

Brief here -- see [03-PLUGIN-SYSTEM §5](./03-PLUGIN-SYSTEM.md) for full core plugin details.

---

## 7. The App Type

What `createApp` returns after all plugins are initialized:

```typescript
type App<
  _Config extends Record<string, unknown>,
  Events extends Record<string, unknown>,
  P extends PluginInstance,
> = {
  /** Start all plugins (forward order). Returns when all onStart complete. */
  readonly start: () => Promise<void>;

  /** Stop all plugins (reverse order). Returns when all onStop complete. */
  readonly stop: () => Promise<void>;

  /** Emit a typed event. Only known events accepted, payload strictly typed. */
  readonly emit: EmitFunction<Events>;

  /** Get a plugin or throw. Instance-only, fully typed. */
  readonly require: RequireFunction;

  /** Check if a plugin is registered by name. */
  readonly has: HasFunction;
} & BuildPluginApis<P>;
```

Plugin APIs are mounted via `BuildPluginApis<P>`, a mapped type that selectively includes only plugins with non-empty APIs and literal string names. This prevents index signature pollution on the App type.

**Key properties:**

- The entire app object is frozen (`Object.freeze`) after creation.
- Plugin APIs are mounted directly on the app: `app.router`, `app.blog`, etc.
- `start()` throws on second call ("App already started").
- `stop()` throws if `start()` has not been called ("App not started").

---

## 8. Complete Three-Layer Example

### Layer 2: Framework config.ts (Step 1)

```typescript
// my-framework/src/config.ts
import { createCoreConfig } from '@moku-labs/core';

type Config = {
  siteName: string;
  description?: string;
  mode: 'development' | 'production';
};

type Events = {
  'page:render':     { path: string; html: string };
  'page:error':      { path: string; error: Error };
  'router:navigate': { from: string; to: string };
};

export const coreConfig = createCoreConfig<Config, Events>('moku-site', {
  config: {
    siteName: 'Untitled',
    mode: 'development',
  },
});

// Framework plugins import createPlugin from here
export const { createPlugin, createCore } = coreConfig;
```

### Layer 2: Framework plugins

```typescript
// my-framework/src/plugins/router/index.ts
import { createPlugin } from '../../config';

export const routerPlugin = createPlugin('router', {
  config: {
    basePath: '/',
  },
  createState: () => ({
    currentPath: '/',
  }),
  api: (ctx) => ({
    navigate: (path: string) => {
      ctx.state.currentPath = path;
      void ctx.emit('router:navigate', { from: '/', to: path });
    },
    current: () => ctx.state.currentPath,
  }),
  onInit: (ctx) => {
    // All plugins registered, can validate dependencies
  },
});
```

### Layer 2: Framework index.ts (Step 2)

```typescript
// my-framework/src/index.ts
import { createCore, coreConfig } from './config';
import { routerPlugin } from './plugins/router';
import { rendererPlugin } from './plugins/renderer';
import { seoPlugin } from './plugins/seo';

const framework = createCore(coreConfig, {
  plugins: [routerPlugin, rendererPlugin, seoPlugin],
  pluginConfigs: {
    renderer: { template: 'default' },
  },
});

export const { createApp, createPlugin } = framework;

// Optional plugins consumers can add
export { analyticsPlugin } from './plugins/analytics';
export { authPlugin } from './plugins/auth';
```

### Layer 3: Consumer (Step 3)

```typescript
// my-blog/src/main.ts
import { createApp, createPlugin, analyticsPlugin } from 'my-framework';

// Consumer custom plugin
const blogPlugin = createPlugin('blog', {
  config: { postsPerPage: 10 },
  api: (ctx) => ({
    listPosts: () => ['post1', 'post2'],
  }),
});

// Single call -- structured namespaces
const app = createApp({
  plugins: [analyticsPlugin, blogPlugin],
  config: {
    siteName: 'My Personal Blog',
    description: 'Thoughts on code and life',
    mode: 'production',
  },
  pluginConfigs: {
    analytics: { trackingId: 'G-XXXXX' },
    blog: { postsPerPage: 5 },
  },
  onReady: (ctx) => {
    console.log(`${ctx.config.siteName} initialized`);
  },
});

// App is fully initialized. All async init complete.
await app.start();

app.router.navigate('/about');    // typed -- framework default plugin
app.blog.listPosts();             // typed -- consumer plugin
await app.stop();
```

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Factory chain details: [04-FACTORY-CHAIN](./04-FACTORY-CHAIN.md)
- Config resolution: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
