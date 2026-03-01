# 02 - Core API

**Domain:** createCoreConfig, createCore, createApp, createPlugin signatures
**Architecture:** 3-step factory chain (Layer 1 -> Layer 2 -> Layer 3)

---

## 1. Layer 1: Public API Surface

```typescript
// @moku-labs/core — Package Entry Point
export { createCoreConfig } from './config';

// Public type utilities for plugin authors
export type { PluginCtx } from './types';
export type { EmitFn } from './utilities';
```

One function and two type utilities. The function is the package. The types are optional helpers for plugin authors at Standard+ tier who extract domain logic into separate files.

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
  options: { config: Config },
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
    onReady?: (ctx: { config: Readonly<Config> }) => void | Promise<void>;
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
    onReady?: (context: AppCallbackContext) => void | Promise<void>;
    onError?: (error: Error, context: AppCallbackContext) => void;
    onStart?: (context: AppCallbackContext) => void | Promise<void>;
    onStop?: (context: AppCallbackContext) => void | Promise<void>;
  },
): Promise<App<Config, Events, AllPlugins>>;
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

**Returns:** `Promise<App>`. The app is fully initialized -- all plugins have completed their `onInit` phase. Consumers call `app.start()` and `app.stop()` to control the running lifecycle.

**The final plugin list is:** `[...frameworkDefaults, ...consumerExtras]`

Order: framework defaults first (in the order the framework defined them), then consumer extras (in the order the consumer listed them). The consumer cannot reorder framework defaults.

```typescript
// my-blog/src/main.ts
import { createApp } from 'my-framework';
import { blogPlugin } from './plugins/blog';

const app = await createApp({
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
const app = await createApp({
  config: {
    siteName: 'Simple Site',
    mode: 'production',
  },
});
```

### Without Any Options

```typescript
// Framework defaults for everything
const app = await createApp();
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

## 6. The App Type

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

## 7. Complete Three-Layer Example

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
const app = await createApp({
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
