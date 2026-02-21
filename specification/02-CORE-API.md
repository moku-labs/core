# 02 - Core API

**Domain:** createCore, CoreDefaults, CoreAPI, createConfig, createApp
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1), CORE_SPEC (v2-early), SPEC_IMPROVEMENTS_IDEAS

---

## 1. Layer 1: Single Export

```typescript
// This is the ENTIRE public API of moku_core
export { createCore } from './core';

// Sub-path export for testing utilities (NOT part of main entry point)
// import { createTestCtx } from 'moku_core/testing';
```

One function at the main entry point. That's the package.

---

## 2. createCore Signature

```typescript
function createCore<
  BaseConfig extends Record<string, any>,
  EventContract extends Record<string, any> = {},
>(
  name: string,
  defaults: CoreDefaults<BaseConfig>,
): CoreAPI<BaseConfig, EventContract>;
```

**Generic parameters:**

| Param | Purpose | Set by | Default |
|---|---|---|---|
| `BaseConfig` | Shape of global config every app of this framework needs | Framework author (Layer 2) | (required) |
| `EventContract` | Map of all event names to payload types (framework events + known plugin events) | Framework author (Layer 2) | `{}` |

When `EventContract` is `{}` (the default), `emit()` is fully untyped -- all events use the untyped overload. When populated, `emit()` gains type checking for known event names via TypeScript overloads, while unknown event names still work untyped. Zero cost for frameworks that don't use it.

**`name`:** Human-readable framework name. Used in error messages: `"[moku-site] Duplicate plugin name: router"`

**`defaults`:** The framework's built-in configuration and plugins.

---

## 3. CoreDefaults

```typescript
type CoreDefaults<BaseConfig extends Record<string, any>> = {
  /** Default values for BaseConfig. Consumer overrides via createConfig. */
  config: BaseConfig;

  /** Plugins that ship with the framework. Always loaded. Consumer cannot remove them. */
  plugins?: PluginInstance[];

  /** Components that ship with the framework. */
  components?: ComponentInstance[];

  /** Modules that ship with the framework. */
  modules?: ModuleInstance[];

  /** Called once when createApp is invoked, before any plugin lifecycle. Sync only. */
  onBoot?: (ctx: { config: Readonly<BaseConfig> }) => void;

  /** Called after all plugins have completed init (Phase 4). */
  onReady?: (ctx: { config: Readonly<BaseConfig> }) => void | Promise<void>;

  /** Called after all plugins have stopped. */
  onShutdown?: (ctx: { config: Readonly<BaseConfig> }) => void | Promise<void>;
};
```

---

## 4. CoreAPI -- What createCore Returns

```typescript
type CoreAPI<
  BaseConfig extends Record<string, any>,
  EventContract extends Record<string, any>,
> = {
  createConfig: CreateConfigFn<BaseConfig>;
  createApp: CreateAppFn<BaseConfig, EventContract>;
  createPlugin: CreatePluginFn<BaseConfig, EventContract>;
  createComponent: CreateComponentFn<BaseConfig, EventContract>;
  createModule: typeof createModule;
  createEventBus: typeof createEventBus;
  createPluginFactory: CreatePluginFactoryFn<BaseConfig, EventContract>;
};
```

All 7 functions are bound to the framework's generic parameters. When the framework exports these, plugin authors and consumers get type safety automatically.

**Critical: `createConfig` exists because TypeScript needs to know the full plugin set BEFORE it can type `pluginConfigs` in `createApp`.** Without this binding step, TypeScript cannot infer what config keys are required vs optional -- it doesn't know which plugins exist.

---

## 5. createConfig Signature

```typescript
function createConfig<
  const ExtraPlugins extends readonly PluginInstance[] = [],
>(
  globalConfig: Partial<BaseConfig>,
  extraPlugins?: ExtraPlugins,
): AppConfig<BaseConfig, DefaultPlugins, ExtraPlugins>;
```

**Two arguments:**

1. `globalConfig` -- `Partial<BaseConfig>`. Consumer overrides what they need. Framework defaults cover the rest.
2. `extraPlugins` -- Optional array of additional plugins. These are appended after framework defaults.

**Returns:** An `AppConfig` object that carries the full type information. This object is opaque to the consumer -- its only purpose is to be passed to `createApp`.

### Why Two Steps Instead of One?

A three-arg `createApp(globalConfig, pluginConfigs, extraPlugins)` doesn't work. TypeScript resolves generic parameters left-to-right. The type of `pluginConfigs` (arg 2) depends on `extraPlugins` (arg 3), but arg 3 hasn't been evaluated yet when TypeScript types arg 2. The result: custom plugin config keys aren't enforced, missing required configs aren't caught, and the entire type safety story breaks.

`createConfig` as a separate step solves this cleanly. It's a proven pattern, simple, and TypeScript-friendly.

---

## 6. createApp Signature

### Variant A: Sync createApp

```typescript
function createApp<
  G extends Record<string, any>,
  P extends PluginInstance,
>(
  config: AppConfig<G, any, any>,
  pluginConfigs: BuildPluginConfigs<P>,
): App<G, EventContract, P>;
```

Phases 0-4 run synchronously. `app.start()`, `app.stop()`, `app.destroy()` return Promises.

If a plugin needs async initialization (database connection, file loading), it does so in `onStart`. The API factory returns methods that work with whatever state is available after sync init. If the API genuinely requires async-initialized state, the plugin manages a ready promise or defers to `onStart`.

### Variant B: Async createApp

```typescript
function createApp<
  G extends Record<string, any>,
  P extends PluginInstance,
>(
  config: AppConfig<G, any, any>,
  pluginConfigs: BuildPluginConfigs<P>,
): Promise<App<G, EventContract, P>>;
```

Phases 0-1 run synchronously. Phases 2-4 are awaited sequentially. The returned app is fully initialized -- all async init is complete. `app.start()`, `app.stop()`, `app.destroy()` also return Promises.

This enables plugins to perform real I/O during initialization:

- Connect to databases in `createState`
- Load config files from disk in `onCreate`
- Fetch remote schemas in `onInit`
- Initialize SDK clients that require async handshakes

Without async `createApp`, plugins are forced into awkward "check readiness" patterns where the API factory runs before async state is ready. That is a type-level lie -- the API looks ready but isn't. Async `createApp` eliminates this entire class of bugs.

**For sync-only setups:** The framework (Layer 2) can provide a `createAppSync` convenience wrapper that throws if any plugin uses async lifecycle methods.

```typescript
// Framework-provided convenience (NOT a core export)
export function createAppSync<...>(...args): App<...> {
  const result = createApp(...args);
  if (result instanceof Promise) {
    throw new Error('[my-framework] createAppSync cannot be used with async plugins.');
  }
  return result;
}
```

**Two arguments for both variants:**

1. `config` -- The bound config from `createConfig`. Carries global config overrides AND the full plugin union type.
2. `pluginConfigs` -- Config for all plugins (framework defaults + consumer extras). TypeScript enforces required keys and validates types.

**The final plugin list is: `[...frameworkDefaults, ...consumerExtras]`**

Order: framework defaults first (in the order the framework defined them), then consumer extras (in the order the consumer listed them). The consumer cannot reorder framework defaults.

---

## 7. createEventBus

Standalone pub/sub utility. Independent of the kernel -- can be used anywhere.

```typescript
function createEventBus<Events extends Record<string, any> = Record<string, any>>(): {
  emit: <K extends keyof Events>(event: K, payload: Events[K]) => Promise<void>;
  on: <K extends keyof Events>(event: K, handler: (payload: Events[K]) => void | Promise<void>) => () => void;
  off: <K extends keyof Events>(event: K, handler: Function) => void;
  clear: () => void;
};
```

Provided as a utility for plugins that need their own internal pub/sub. Not required for core functionality.

---

## 8. Framework Example (Layer 2)

```typescript
// my-framework/src/index.ts
import { createCore } from 'moku_core';

// --- Types ---
export type BaseConfig = {
  siteName: string;
  description?: string;
  mode: 'development' | 'production';
  locale?: string;
};

export type EventContract = {
  'app:boot':          { config: BaseConfig };
  'app:ready':         { config: BaseConfig };
  'app:shutdown':      { config: BaseConfig };
  'page:render':       { path: string; html: string };
  'page:error':        { path: string; error: Error };
  'router:navigate':   { from: string; to: string };
  'router:notFound':   { path: string; fallback: string };
  'renderer:render':   { path: string; html: string };
};

// --- Default plugins ---
import { RouterPlugin } from './plugins/router';
import { RendererPlugin } from './plugins/renderer';
import { SEOPlugin } from './plugins/seo';

// --- Create the framework ---
const core = createCore<BaseConfig, EventContract>('moku-site', {
  config: {
    siteName: 'Untitled',
    mode: 'development',
  },
  plugins: [RouterPlugin, RendererPlugin, SEOPlugin],
  onBoot: ({ config }) => {
    if (config.mode === 'development') {
      console.log(`[moku-site] Starting ${config.siteName} in dev mode`);
    }
  },
});

// --- Export to consumers ---
export const {
  createConfig,
  createApp,
  createPlugin,
  createComponent,
  createModule,
  createPluginFactory,
} = core;

// --- Export optional plugins consumers can add ---
export { AnalyticsPlugin } from './plugins/analytics';
export { I18nPlugin } from './plugins/i18n';
export { AuthPlugin } from './plugins/auth';
export { BlogPlugin } from './plugins/blog';
```

---

## 9. Consumer Example (Layer 3)

```typescript
// my-blog/src/main.ts
import { createConfig, createApp } from 'my-framework';
import { AnalyticsPlugin, BlogPlugin } from 'my-framework/plugins';
import { ContactFormPlugin } from './plugins/contact-form';
import { HomePage, AboutPage, BlogPage } from './pages';

// Step 1: Declare what this app is made of
const config = createConfig(
  {
    siteName: 'My Personal Blog',
    description: 'Thoughts on code and life',
    mode: 'production',
  },
  [AnalyticsPlugin, BlogPlugin, ContactFormPlugin],
);

// Step 2: Provide plugin configs -- TypeScript enforces everything
const app = await createApp(config, {
  router: {
    default: 'home',
    pages: { home: HomePage, about: AboutPage, blog: BlogPage },
  },
  analytics: { trackingId: 'G-XXXXX' },
  blog: { postsDir: './content/posts', postsPerPage: 10 },
  contactForm: { recipient: 'me@example.com' },
  // renderer: omitted -- has defaultConfig, optional
  // seo: omitted -- has defaultConfig, optional
});

// App is fully initialized. All async init complete.
await app.start();

app.config.siteName;             // 'My Personal Blog' -- typed
app.router.navigate('about');    // typed, framework default
app.blog.listPosts();            // typed, consumer extra
app.contactForm.submit({         // typed, consumer custom plugin
  name: 'Alice', email: 'alice@example.com', message: 'Hello!',
});

await app.destroy();
```

### App Without Extra Plugins

```typescript
// Minimal: framework defaults only
const config = createConfig({
  siteName: 'Simple Site',
  mode: 'production',
});

const app = await createApp(config, {
  router: { default: 'home', pages: { home: HomePage } },
  // Only framework default plugin configs needed
});
```

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Config resolution: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
