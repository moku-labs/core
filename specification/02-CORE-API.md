# 02 - Core API

**Domain:** createCoreConfig, createCore, createApp, createPlugin signatures
**Architecture:** 3-step factory chain (Layer 1 -> Layer 2 -> Layer 3)

---

## 1. Layer 1: Single Export

```typescript
// This is the ENTIRE public API of moku_core
export { createCoreConfig } from './core-config';
```

One function at the main entry point. That's the package.

---

## 2. createCoreConfig Signature

```typescript
function createCoreConfig<
  Config extends Record<string, any>,
  Events extends Record<string, any> = {},
>(
  id: string,
  options: { config: Config },
): {
  createPlugin: CreatePluginFn<Config, Events>;
  createCore: CreateCoreFn<Config, Events>;
};
```

**Generic parameters:**

| Param | Purpose | Set by | Default |
|---|---|---|---|
| `Config` | Shape of global config every app of this framework needs | Framework author (Layer 2) | (required) |
| `Events` | Map of event names to payload types (framework events + known plugin events) | Framework author (Layer 2) | `{}` |

When `Events` is `{}` (the default), `emit()` accepts no events (no valid keys). When populated, `emit()` strictly enforces event names and payload types. There is no untyped escape hatch -- only known event names are accepted.

**`id`:** Human-readable framework name. Used in error messages: `"[moku-site] Duplicate plugin name: router"`

**`options.config`:** Default values for the Config type. Consumers can override any field via `createApp`. These defaults are shallow-merged with consumer overrides.

**Returns:** An object with two bound functions:

- **`createPlugin`** -- Factory for creating plugins, bound to `Config` and `Events`. Plugin authors import this from the framework's config.ts to get full type inference.
- **`createCore`** -- Factory for setting up the framework, bound to `Config` and `Events`. Called once in the framework's index.ts.

```typescript
// my-framework/src/config.ts
import { createCoreConfig } from 'moku_core';

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
  coreConfig: CoreConfig<Config, Events>,
  options: {
    plugins: PluginInstance[];
    pluginConfigs?: Record<string, any>;
    onReady?: (ctx: { config: Readonly<Config> }) => void | Promise<void>;
    onError?: (error: Error) => void;
  },
): {
  createApp: CreateAppFn<Config, Events, DefaultPlugins>;
  createPlugin: CreatePluginFn<Config, Events>;
};
```

**Parameters:**

- **`coreConfig`** -- The object returned by `createCoreConfig`. Carries the framework ID, Config defaults, and bound types.
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
    // ...Partial<Config> keys (global config overrides)
    // ...BuildPluginConfigs<AllPlugins> keys (per-plugin configs)
  },
): Promise<App<Config, Events, AllPlugins>>;
```

**Single flat object.** The `options` parameter is a flat object that combines three kinds of keys:

| Key type | How identified | Example |
|---|---|---|
| Reserved keys | `plugins` | `plugins: [blogPlugin]` |
| Config keys | Matches a key in `Config` type | `siteName: 'My Blog'` |
| Plugin config keys | Matches a registered plugin name | `router: { basePath: '/' }` |

The runtime separates these at startup: reserved keys are extracted first, then plugin config keys (matching registered plugin names), and remaining keys are treated as config overrides.

**Returns:** `Promise<App>`. The app is fully initialized -- all plugins have completed their `onInit` phase. Consumers call `app.start()` and `app.stop()` to control the running lifecycle.

**The final plugin list is:** `[...frameworkDefaults, ...consumerExtras]`

Order: framework defaults first (in the order the framework defined them), then consumer extras (in the order the consumer listed them). The consumer cannot reorder framework defaults.

```typescript
// my-blog/src/main.ts
import { createApp } from 'my-framework';
import { blogPlugin } from './plugins/blog';

const app = await createApp({
  plugins: [blogPlugin],
  // Config overrides (typed from Config)
  siteName: 'My Blog',
  mode: 'production',
  // Plugin configs (typed by plugin name)
  router: { basePath: '/' },
  blog: { postsPerPage: 5 },
});
```

### Without Extra Plugins

```typescript
// Minimal: framework defaults only, just config overrides
const app = await createApp({
  siteName: 'Simple Site',
  mode: 'production',
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
type App<Config, Events, Plugins> = Readonly<{
  /** Start all plugins (forward order). Returns when all onStart complete. */
  start: () => Promise<void>;

  /** Stop all plugins (reverse order). Returns when all onStop complete. */
  stop: () => Promise<void>;

  /** Emit a typed event. Only known events accepted, payload strictly typed. */
  emit: EmitFn<Events>;

  /** Get a plugin by instance. Returns fully typed API or undefined. */
  getPlugin: <P extends PluginInstance>(plugin: P) => ExtractApi<P> | undefined;

  /** Get a plugin or throw. Instance-only, fully typed. */
  require: <P extends PluginInstance>(plugin: P) => ExtractApi<P>;

  /** Check if a plugin is registered by name. */
  has: (name: string) => boolean;

  /** Plugin APIs mounted directly. app.router.navigate() is typed. */
  [pluginName: string]: PluginApi;
}>;
```

**Key properties:**

- The entire app object is frozen (`Object.freeze`) after creation.
- Plugin APIs are mounted directly on the app: `app.router`, `app.blog`, etc.
- All methods throw after `stop()` is called (terminal state enforcement).
- `start()` and `stop()` are idempotent -- calling them multiple times is safe.

---

## 7. Complete Three-Layer Example

### Layer 2: Framework config.ts (Step 1)

```typescript
// my-framework/src/config.ts
import { createCoreConfig } from 'moku_core';

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

// Single call -- flat object with everything
const app = await createApp({
  plugins: [analyticsPlugin, blogPlugin],
  // Config overrides
  siteName: 'My Personal Blog',
  description: 'Thoughts on code and life',
  mode: 'production',
  // Plugin configs
  analytics: { trackingId: 'G-XXXXX' },
  blog: { postsPerPage: 5 },
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
