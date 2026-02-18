# Moku — Definitive Specification

**Version:** 1.0.0-rc1
**Status:** Release Candidate
**Audience:** Framework implementors, plugin authors, LLM code agents, human developers
**Authority:** This is the FINAL specification. All implementation follows this document.

The micro-framework for LLMs.

Build cores. Build frameworks. Build products.
Three layers. One pattern. Zero ambiguity.
The kernel is boring. Plugins are where excitement lives.

---

## Table of Contents

1. [What Moku Is](#1-what-moku-is)
2. [What Moku Is Not](#2-what-moku-is-not)
3. [The Three Layers](#3-the-three-layers)
4. [Why Three Layers Matter for LLMs](#4-why-three-layers-matter-for-llms)
5. [Layer 1: moku_core](#5-layer-1-moku_core)
6. [Layer 2: Framework](#6-layer-2-framework)
7. [Layer 3: Consumer](#7-layer-3-consumer)
8. [The ctx Object](#8-the-ctx-object)
9. [Plugin Specification](#9-plugin-specification)
10. [Config System](#10-config-system)
11. [Component and Module](#11-component-and-module)
12. [Lifecycle](#12-lifecycle)
13. [Communication Model](#13-communication-model)
14. [Bus Contract and Signal Registry](#14-bus-contract-and-signal-registry)
15. [Type System](#15-type-system)
16. [Invariants](#16-invariants)
17. [Plugin = Connection Point](#17-plugin--connection-point)
18. [Plugin Testing](#18-plugin-testing)
19. [Anti-Patterns](#19-anti-patterns)
20. [Complete Example: All Three Layers](#20-complete-example-all-three-layers)
21. [Kernel Runtime (Pseudocode)](#21-kernel-runtime-pseudocode)
22. [Design Decisions Log](#22-design-decisions-log)
23. [LLM System Prompt Fragment](#23-llm-system-prompt-fragment)

---

## 1. What Moku Is

Moku is a universal, type-safe, functional plugin framework for TypeScript.

Every application -- site, CLI, game, build tool, bot -- is a kernel plus plugins. Moku provides the kernel. You provide the plugins.

The kernel does 6 things:

1. Collects and flattens plugins into an ordered list
2. Validates names (no duplicates) and dependencies
3. Resolves config (shallow merge, no magic)
4. Runs lifecycle in deterministic order
5. Dispatches events (typed bus + untyped signals)
6. Freezes everything when done

That's it. Everything else is a plugin.

But Moku is not just one package. It's three layers: a core that knows nothing about domains, a framework that defines a domain, and a consumer product built on that framework. Each layer constrains the layer above it.

---

## 2. What Moku Is Not

**Not a reactive UI framework.** No component tree, no virtual DOM, no signals in core.

**Not a streaming engine.** No backpressure, no windowing, no flow control.

**Not a networking framework.** No state sync, no conflict resolution, no clock synchronization.

**Not zero-overhead.** Plugin indirection costs function calls. Don't use hooks in hot loops.

**Not a batteries-included framework.** Moku Core provides structure. Domain-specific value lives in plugins, which live in frameworks built on Moku Core.

Moku is an application *skeleton*. It answers "how do I compose my app from independent parts, wire them together, manage their lifecycle, and let them communicate?" It does not answer "how should my rendering/data/networking work?" Those are domain concerns that live inside plugins.

---

## 3. The Three Layers

```
+-------------------------------------------------------------+
|                    Layer 3: Consumer Product                  |
|                                                              |
|  import { createConfig, createApp } from 'my-framework';     |
|  const config = createConfig({ ... }, [MyPlugin]);           |
|  const app = await createApp(config, { ... });               |
|                                                              |
|  Consumers use what the framework gives them.                |
|  They cannot change the core. They cannot bypass plugins.    |
|  They configure. They compose. They ship.                    |
+--------------------------------------------------------------+
|                    Layer 2: Framework / Tool                  |
|                                                              |
|  import { createCore } from 'moku_core';                     |
|  const { createApp, createConfig, createPlugin, ... }        |
|    = createCore(...)                                         |
|                                                              |
|  Framework authors define:                                   |
|    - Base config shape (what every app of this kind needs)   |
|    - Bus contract (what lifecycle events exist)              |
|    - Signal registry (what plugin signals are known)         |
|    - Default plugins (what ships built-in)                   |
|    - Available plugins (what consumers can opt into)         |
|                                                              |
|  Examples: site builder, game engine, CLI toolkit, bot SDK   |
+--------------------------------------------------------------+
|                    Layer 1: moku_core                         |
|                                                              |
|  export { createCore }                                       |
|                                                              |
|  One function. Returns all API functions.                    |
|  Zero domain knowledge. Zero opinions.                       |
|  Pure machinery: lifecycle, plugin registry, event bus,      |
|  config resolution, type inference.                          |
+--------------------------------------------------------------+
```

**The key insight: each layer constrains the layer above it.**

- `moku_core` constrains what a framework CAN define (lifecycle shape, plugin spec shape, config resolution rules).
- The framework constrains what the consumer CAN do (which plugins exist, what config is available, what hooks fire).
- The consumer works within those constraints. They can't escape them.

This is not a limitation. This is the feature. When an LLM generates code at Layer 3, it **cannot** break Layers 1 or 2. The architecture is a guardrail.

---

## 4. Why Three Layers Matter for LLMs

### 4.1 The Problem with Current LLM Code Generation

LLMs generate code by pattern-matching against training data. When the patterns are ambiguous -- when there are multiple ways to structure an app, when the framework allows escape hatches, when "best practices" conflict -- the LLM makes mistakes.

The failure mode is always the same: **the LLM invents structure instead of following it.**

- It creates new files in wrong places.
- It rewrites framework internals when it should use an API.
- It mixes domain logic with framework plumbing.
- It doesn't know where code belongs, so it puts it everywhere.

### 4.2 How Three Layers Fix This

Each layer has a single, unambiguous role:

| Layer | LLM's job | LLM CANNOT do |
|---|---|---|
| Layer 1 (core) | Never touched by LLM | Change the kernel |
| Layer 2 (framework) | Define plugins + defaults | Change the kernel, bypass plugin spec |
| Layer 3 (consumer) | Configure + compose | Change the framework, invent new primitives |

**The LLM always knows where it is.** If it's generating consumer code, it imports from the framework and uses `createConfig` + `createApp`. If it's generating a plugin, it uses `createPlugin` and follows the spec shape. There is no middle ground. No escape hatches. No "but what if I just..." temptation.

### 4.3 The Micro-Framework Advantage

Moku Core is **micro** in a precise sense: the entire API is learnable from a single system prompt. An LLM can hold the full specification in its context window. There are no hidden behaviors, no implicit conventions, no "you should also know about X."

Moku Core has:

- **1 function at Layer 1:** `createCore`
- **7 functions at Layer 2:** returned by `createCore`
- **2 steps at Layer 3:** `createConfig` then `await createApp`

An LLM can learn this in under 1000 tokens.

---

## 5. Layer 1: moku_core

### 5.1 Single Export

```typescript
// This is the ENTIRE public API of moku_core
export { createCore } from './core';

// Sub-path export for testing utilities (NOT part of main entry point)
// import { createTestCtx } from 'moku_core/testing';
```

One function at the main entry point. That's the package.

### 5.2 createCore Signature

```typescript
function createCore<
  BaseConfig extends Record<string, any>,
  BusContract extends Record<string, any> = {},
  SignalRegistry extends Record<string, any> = {},
>(
  name: string,
  defaults: CoreDefaults<BaseConfig>,
): CoreAPI<BaseConfig, BusContract, SignalRegistry>;
```

**Generic parameters:**

| Param | Purpose | Set by | Default |
|---|---|---|---|
| `BaseConfig` | Shape of global config every app of this framework needs | Framework author (Layer 2) | (required) |
| `BusContract` | Map of event names to payload types the framework declares | Framework author (Layer 2) | `{}` |
| `SignalRegistry` | Map of known plugin signal names to payload types | Framework author (Layer 2) | `{}` |

**`name`:** Human-readable framework name. Used in error messages: `"[moku] Duplicate plugin name: router"`

**`defaults`:** The framework's built-in configuration and plugins.

**`SignalRegistry`:** Optional third generic. When `{}` (the default), `signal()` is fully untyped. When populated, `signal()` gains type checking for known signal names via TypeScript overloads, while unknown signal names still work untyped. Zero cost for frameworks that don't use it.

### 5.3 CoreDefaults

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

### 5.4 CoreAPI -- What createCore Returns

```typescript
type CoreAPI<
  BaseConfig extends Record<string, any>,
  BusContract extends Record<string, any>,
  SignalRegistry extends Record<string, any>,
> = {
  createConfig: CreateConfigFn<BaseConfig>;
  createApp: CreateAppFn<BaseConfig, BusContract, SignalRegistry>;
  createPlugin: CreatePluginFn<BaseConfig, BusContract, SignalRegistry>;
  createComponent: CreateComponentFn<BaseConfig, BusContract, SignalRegistry>;
  createModule: typeof createModule;
  createEventBus: typeof createEventBus;
  createPluginFactory: CreatePluginFactoryFn<BaseConfig, BusContract, SignalRegistry>;
};
```

**7 functions.** All bound to `BaseConfig`, `BusContract`, and `SignalRegistry`. When the framework exports these, plugin authors and consumers get type safety automatically.

**Critical: `createConfig` exists because TypeScript needs to know the full plugin set BEFORE it can type `pluginConfigs` in `createApp`.** Without this binding step, TypeScript cannot infer what config keys are required vs optional -- it doesn't know which plugins exist.

---

## 6. Layer 2: Framework

### 6.1 Framework index.ts

This is the entire framework. It calls `createCore` once and re-exports the results plus its plugins.

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

export type BusContract = {
  'app:boot':     { config: BaseConfig };
  'app:ready':    { config: BaseConfig };
  'app:shutdown': { config: BaseConfig };
  'page:render':  { path: string; html: string };
  'page:error':   { path: string; error: Error };
};

export type SignalRegistry = {
  'router:navigate':  { from: string; to: string };
  'router:notFound':  { path: string; fallback: string };
  'renderer:render':  { path: string; html: string };
};

// --- Default plugins that define what this framework IS ---
import { RouterPlugin } from './plugins/router';
import { RendererPlugin } from './plugins/renderer';
import { SEOPlugin } from './plugins/seo';

// --- Create the framework ---
const core = createCore<BaseConfig, BusContract, SignalRegistry>('moku-site', {
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

### 6.2 What the Framework Author Decides

1. **BaseConfig** -- what global config every app needs
2. **BusContract** -- what events plugins can subscribe to with type safety
3. **SignalRegistry** -- what plugin-to-plugin signals are known (optional, defaults to `{}`)
4. **Default plugins** -- what ships built-in (Router, Renderer, SEO for a site builder)
5. **Optional plugins** -- what consumers can add (Analytics, Auth, Blog)
6. **Lifecycle hooks** -- onBoot, onReady, onShutdown for framework-level concerns

### 6.3 What the Framework Author Does NOT Decide

- How the kernel works (that's Layer 1)
- How consumers compose their app (that's Layer 3)
- What custom plugins consumers write themselves (that's Layer 3)

### 6.4 Why Default Plugins?

A site builder without a router doesn't make sense. A game engine without a game loop doesn't make sense. A CLI toolkit without a command parser doesn't make sense.

Default plugins are the plugins that **define the framework's identity.** Without them, the framework is just `moku_core` with a config type. Default plugins are what turn a generic kernel into a specific tool.

Consumers cannot remove default plugins. They can configure them.

---

## 7. Layer 3: Consumer

### 7.1 The Two-Step Pattern: createConfig then await createApp

The consumer always follows two steps:

**Step 1: `createConfig` -- declare what your app is made of.**

```typescript
const config = createConfig(
  { siteName: 'My Blog', mode: 'production' },  // Partial<BaseConfig>
  [BlogPlugin, ContactFormPlugin],               // extra plugins
);
```

`createConfig` binds the consumer's global config overrides with their extra plugin list. The framework's default plugins are automatically included -- the consumer cannot remove them. The result is a typed config object that carries the **full plugin union** (framework defaults + consumer extras).

**Step 2: `await createApp` -- provide plugin configs and get the app.**

```typescript
const app = await createApp(config, {
  router: { default: 'home', pages: { ... } },  // framework default -- required
  blog: { postsDir: './content' },               // consumer extra -- required
  contactForm: { recipient: 'me@example.com' },  // consumer extra -- required
  // renderer: omitted -- has defaultConfig, optional
});
```

`createApp` returns a `Promise<App>`. It takes the bound config from step 1 and a `pluginConfigs` object. **Because `createConfig` already declared all plugins, TypeScript knows exactly which config keys are required vs optional.** This is why two steps exist -- TypeScript needs the full plugin set known BEFORE it can type the config map.

### 7.2 Why Not One Step?

A three-arg `createApp(globalConfig, pluginConfigs, extraPlugins)` doesn't work. TypeScript resolves generic parameters left-to-right. The type of `pluginConfigs` (arg 2) depends on `extraPlugins` (arg 3), but arg 3 hasn't been evaluated yet when TypeScript types arg 2. The result: custom plugin config keys aren't enforced, missing required configs aren't caught, and the entire type safety story breaks.

`createConfig` as a separate step solves this cleanly. It's a proven pattern, simple, and TypeScript-friendly.

### 7.3 Why createApp Is Async

`createApp` returns `Promise<App>`. This enables plugins to perform real I/O during initialization:

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

### 7.4 createConfig Signature

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

### 7.5 createApp Signature

```typescript
function createApp<
  G extends Record<string, any>,
  P extends PluginInstance,
>(
  config: AppConfig<G, any, any>,  // from createConfig
  pluginConfigs: BuildPluginConfigs<P>,
): Promise<App<G, BusContract, SignalRegistry, P>>;
```

**Two arguments:**

1. `config` -- The bound config from `createConfig`. Carries global config overrides AND the full plugin union type.
2. `pluginConfigs` -- Config for all plugins (framework defaults + consumer extras). TypeScript enforces required keys and validates types.

**Returns:** `Promise<App>`.

**The final plugin list is: `[...frameworkDefaults, ...consumerExtras]`**

Order: framework defaults first (in the order the framework defined them), then consumer extras (in the order the consumer listed them). The consumer cannot reorder framework defaults.

### 7.6 Consumer main.ts -- Complete Example

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
  // renderer: omitted -- has defaultConfig, so it's optional
  // seo: omitted -- has defaultConfig, so it's optional
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

### 7.7 Consumer Custom Plugin Definition

Consumers define custom plugins using the framework's exported `createPlugin`. This ensures the plugin is typed against the framework's `BaseConfig`, `BusContract`, and `SignalRegistry`.

```typescript
// my-blog/src/plugins/contact-form/index.ts
import { createPlugin } from 'my-framework';
import type { ContactFormConfig, ContactFormApi } from './types';
import { createContactFormApi } from './api';
import { validateConfig } from './validation';

export const ContactFormPlugin = createPlugin<
  'contactForm',
  ContactFormConfig,
  ContactFormApi
>(
  'contactForm',
  {
    depends: ['renderer'],
    onCreate: ({ config }) => validateConfig(config),
    api: createContactFormApi,
    hooks: {
      'page:render': (payload) => {
        // BusContract event -- framework typed
        // payload: { path: string; html: string }
      },
    },
  },
);
```

```typescript
// my-blog/src/plugins/contact-form/types.ts
export type ContactFormConfig = {
  recipient: string;
  subject?: string;
  successMessage?: string;
};

export type ContactFormApi = {
  submit: (data: { name: string; email: string; message: string }) => Promise<boolean>;
  setRecipient: (email: string) => void;
};
```

**The consumer's `createPlugin` is the SAME function the framework uses.** It comes from `createCore` and is bound to the same `BaseConfig`, `BusContract`, and `SignalRegistry`. The consumer's plugin gets typed `ctx.global` (knows `siteName`, `mode`, etc.) and typed `ctx.emit` (knows `page:render`, `page:error`, etc.) for free.

### 7.8 Consumer's Mental Model

1. Import `createConfig` and `createApp` from the framework.
2. Import or create plugins.
3. `createConfig` -- declare global overrides + extra plugins.
4. `await createApp` -- provide plugin configs. TypeScript tells you what's required.
5. Use `app.pluginName.method()` -- everything is typed.

The consumer never sees `createCore`. Never sees `moku_core`. Never thinks about lifecycle phases or plugin flattening. They declare, configure, and compose.

### 7.9 App Without Extra Plugins

If the consumer doesn't need extra plugins, `createConfig` takes just the global config:

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

## 8. The ctx Object

`ctx` is the real API. Every lifecycle method and API factory receives it. This is the "syscall interface" of Moku.

### 8.1 Base Context

```typescript
type BaseCtx<
  G extends Record<string, any>,
  Bus extends Record<string, any>,
  Signals extends Record<string, any>,
> = {
  /** Global config (BaseConfig merged with consumer overrides). Frozen. */
  readonly global: Readonly<G>;

  /** Fire typed event. Constrained to BusContract keys. Payload type-checked. */
  emit: <K extends string & keyof Bus>(hook: K, payload: Bus[K]) => Promise<void>;

  /**
   * Fire signal. Overloaded:
   *   - Known names (in SignalRegistry): typed payload.
   *   - Unknown names: any payload (escape hatch).
   */
  signal: {
    <K extends string & keyof Signals>(name: K, payload: Signals[K]): Promise<void>;
    (name: string, payload?: any): Promise<void>;
  };

  /** Get plugin API by name. Returns undefined if not found. */
  getPlugin: <T = any>(name: string) => T | undefined;

  /** Get plugin API or throw with clear error. */
  require: <T = any>(name: string) => T;

  /** Check if a plugin is registered. */
  has: (name: string) => boolean;
};
```

### 8.2 Plugin Context (extends base)

```typescript
type PluginCtx<
  G extends Record<string, any>,
  Bus extends Record<string, any>,
  Signals extends Record<string, any>,
  C,
  S,
> = BaseCtx<G, Bus, Signals> & {
  /** This plugin's resolved config. Frozen. */
  readonly config: Readonly<C>;

  /** This plugin's internal mutable state. Mutable by design. */
  state: S;
};
```

### 8.3 Which Lifecycle Gets What

| Lifecycle | Context received | Rationale |
|---|---|---|
| `createState` | `{ global, config }` | State factory. No other plugins exist yet. No emit, no getPlugin. |
| `onCreate` | `{ global, config }` | Validate config. No other plugins available. |
| `api` | `PluginCtx` (full) | Build public API. State available. Other plugins accessible. |
| `onInit` | `BaseCtx & { config }` | All plugins created and APIs mounted. Check deps with `require`/`has`. |
| `onStart` | `PluginCtx` (full) | App is starting. Everything is live. Async allowed. |
| `onStop` | `{ global }` | Teardown. Minimal context -- don't rely on other plugins. |
| `onDestroy` | `{ global }` | Final cleanup. Same as onStop. |

**Rule: `require`/`has`/`getPlugin`/`emit`/`signal` are NOT available in `createState` or `onCreate`.** At that point, not all plugins have been created. Providing these methods would be a lie -- they'd return incomplete data.

---

## 9. Plugin Specification

### 9.1 PluginSpec

```typescript
interface PluginSpec<
  N extends string,
  C = void,
  A extends Record<string, any> = {},
  S = void,
> {
  /** Complete default config. Presence makes config OPTIONAL for consumer. Full C, not Partial<C>. */
  defaultConfig?: C;

  /** Declarative dependencies. Validated at Phase 0. NOT a topological sort -- just validation. */
  depends?: readonly string[];

  /** Create internal mutable state. Async-compatible. Runs before any other lifecycle. Minimal context. */
  createState?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => S | Promise<S>;

  /** Validate config. No other plugins available. Async-compatible. */
  onCreate?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => void | Promise<void>;

  /** Build the public API mounted on app.<pluginName>. Full context. Async-compatible. */
  api?: (ctx: PluginCtx) => A | Promise<A>;

  /** All plugins created and APIs mounted. Check dependencies here. Async-compatible. */
  onInit?: (ctx: BaseCtx & { config: Readonly<C> }) => void | Promise<void>;

  /** App is starting. Async allowed. Full context. */
  onStart?: (ctx: PluginCtx) => void | Promise<void>;

  /** Teardown. Reverse order. Minimal context. */
  onStop?: (ctx: { global: Readonly<any> }) => void | Promise<void>;

  /** Final cleanup. Reverse order. Minimal context. */
  onDestroy?: (ctx: { global: Readonly<any> }) => void | Promise<void>;

  /**
   * Event subscriptions. Keys are event names, values are handlers.
   * Handles BOTH bus events (typed at BusContract level) and signals (untyped).
   * At kernel level: Record<string, handler>. Type safety is the plugin author's job.
   * Handlers execute in plugin registration order, sequentially.
   */
  hooks?: Record<string, (...args: any[]) => void | Promise<void>>;

  /** Sub-plugins. Flattened depth-first, children before parent. */
  plugins?: PluginInstance[];
}
```

### 9.2 Async Lifecycle Methods

The following lifecycle methods accept both sync and async return values:

| Method | Return type | When async is useful |
|---|---|---|
| `createState` | `S \| Promise<S>` | Connect to databases, load files |
| `onCreate` | `void \| Promise<void>` | Validate config against external schemas |
| `api` | `A \| Promise<A>` | Build API that depends on async-initialized state |
| `onInit` | `void \| Promise<void>` | Check dependencies with async verification |
| `onStart` | `void \| Promise<void>` | Start servers, open connections |
| `onStop` | `void \| Promise<void>` | Flush buffers, close connections |
| `onDestroy` | `void \| Promise<void>` | Finalize, disconnect |

**Execution: sequential, not parallel.** Plugin A fully completes each phase before Plugin B begins. This preserves the ordering guarantee. If Plugin A's `createState` returns a Promise, it is awaited before Plugin B's `createState` runs.

Sync plugins work unchanged. `void | Promise<void>` covers sync returns. The only consumer-visible difference from a fully-sync kernel: add `await` before `createApp`.

### 9.3 The depends Field

```typescript
const RouterPlugin = createPlugin<'router', RouterConfig, RouterApi, RouterState>('router', {
  depends: ['logger', 'renderer'] as const,
  // ...
});
```

**What `depends` does at Phase 0:**

1. For each plugin with `depends`, check that every named dependency exists in the flattened list.
2. Check that every dependency appears BEFORE the dependent plugin in the list.
3. If either check fails, throw with a clear error:

```
Error: [moku-site] Plugin "router" depends on "auth", but "auth" is not registered.
  Add the auth plugin to your plugin list before "router".

Error: [moku-site] Plugin "router" depends on "logger", but "logger" appears after "router".
  Move "logger" before "router" in your plugin list.
```

**What `depends` does NOT do:**

- Does not auto-reorder plugins (no topological sort)
- Does not create new concepts (no "dependency graph", no "resolution algorithm")
- Does not change runtime behavior (plugins init in array order, always)
- Does not affect `getPlugin`/`require` typing inside plugin lifecycle (still loose -- see Section 15 for app-level strict typing)

**Visibility for LLMs and tooling:** With `depends`, an LLM can read a plugin's spec without executing any code and know what plugins must precede it. This is pure metadata extractable statically.

---

## 10. Config System

### 10.1 No configRequired

```typescript
// v0.1: TWO mechanisms, conflicting
configRequired?: boolean;     // KILLED
defaultConfig?: Partial<C>;   // Changed to full C
```

`configRequired` does not exist. The config type itself is the contract.

### 10.2 The Rule

TypeScript's own type system determines config behavior. No flags. No metadata. Just the type plus the presence of `defaultConfig`.

| Plugin Config Type `C` | `defaultConfig` | Consumer must provide |
|---|---|---|
| `void` | (ignored) | Nothing. No key in pluginConfigs. |
| `{}` | (ignored) | Nothing. No key in pluginConfigs. |
| `{ field: string }` | absent | **Required.** `{ field: "value" }` -- must provide full C. |
| `{ field: string }` | present | **Optional.** Can omit entirely or partially override. |
| `{ req: string; opt?: number }` | absent | **Required.** `{ req: "value" }` at minimum. |
| `{ req: string; opt?: number }` | present | **Optional.** Defaults cover everything. Override what you want. |

**Single canonical rule:** Config key is optional in `createApp` if and only if `defaultConfig` is provided. Otherwise it's required (unless C is void/{}).

### 10.3 Config Resolution

**Shallow merge. No deep merge. Ever.**

```typescript
resolvedConfig = { ...spec.defaultConfig, ...consumerProvidedConfig }
```

If `defaultConfig` is `{ level: 'info', prefix: '[app]' }` and the consumer provides `{ level: 'debug' }`, the result is `{ level: 'debug', prefix: '[app]' }`.

If `defaultConfig` has a nested object `{ database: { host: 'localhost', port: 5432 } }` and the consumer provides `{ database: { host: 'prod.example.com' } }`, the result is `{ database: { host: 'prod.example.com' } }`. The `port` field is **gone**. This is intentional. Deep merge is unpredictable. Shallow merge is obvious.

### 10.4 defaultConfig Is Full C, Not Partial

`defaultConfig` must provide a complete `C` value -- all fields, even optional ones with `?`. This ensures that when the consumer omits config entirely, every field has a defined value. No `undefined` surprises. Partial defaults create ambiguity about which fields the consumer must provide.

```typescript
// BAD: partial defaults leave gaps
defaultConfig: { level: 'info' }  // where's prefix? where's silent?

// GOOD: complete defaults
defaultConfig: { level: 'info', prefix: '[app]', silent: false }
```

### 10.5 Optional Fields in Plugin Config Types

Plugin config types fully support TypeScript's `?` optional modifier:

```typescript
type AnalyticsConfig = {
  trackingId: string;        // consumer MUST provide this
  sampleRate?: number;       // consumer CAN provide this, or leave as undefined
  debugMode?: boolean;       // same -- optional
};

// With defaultConfig: config key is optional in createApp
const AnalyticsPlugin = createPlugin<'analytics', AnalyticsConfig>('analytics', {
  defaultConfig: {
    trackingId: '',          // empty string -- must be overridden at runtime
    sampleRate: 1.0,
    debugMode: false,
  },
  onCreate: ({ config }) => {
    if (!config.trackingId) {
      throw new Error('[analytics] trackingId is required. Set it in your plugin config.');
    }
  },
});

// Without defaultConfig: config key is required in createApp
const StrictAnalyticsPlugin = createPlugin<'analytics', AnalyticsConfig>('analytics', {
  // no defaultConfig -> consumer MUST provide at minimum: { trackingId: 'G-XXXXX' }
  // sampleRate and debugMode are optional per the type, so consumer can omit them
});
```

**The interplay:**

- `C`'s required fields (`trackingId: string`) -- consumer must provide them if no `defaultConfig`
- `C`'s optional fields (`sampleRate?: number`) -- consumer can always omit them
- `defaultConfig` present -- the entire config key becomes optional in `createApp`
- `defaultConfig` absent -- the config key is required, but optional `?` fields within C can still be omitted

### 10.6 Global Config Resolution

The global config (BaseConfig) follows the same shallow merge:

```typescript
resolvedGlobal = { ...frameworkDefaults.config, ...consumerGlobalConfig }
```

Consumer provides `Partial<BaseConfig>` in `createConfig`. Framework provides full defaults. The consumer only overrides what they need.

---

## 11. Component and Module

### 11.1 Runtime Truth

**At runtime, everything is a plugin.** Components and modules are conventions with different spec shapes, not different runtime entities.

- `PluginInstance` has lifecycle: create -> init -> start -> stop -> destroy
- `ComponentInstance` has lifecycle: mount -> unmount (different names, same execution slot)
- `ModuleInstance` is a flattening container. It is consumed during Phase 0 and does not exist at runtime.

The `kind` field (`'plugin' | 'component' | 'module'`) exists for tooling, documentation, and AI agents. The kernel treats them all the same during collection and lifecycle.

### 11.2 Component Spec

```typescript
interface ComponentSpec<N extends string, C = void, A extends Record<string, any> = {}, S = void> {
  defaultConfig?: C;
  depends?: readonly string[];
  createState?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => S | Promise<S>;
  onMount?: (ctx: PluginCtx) => void | Promise<void>;
  onUnmount?: (ctx: { global: Readonly<any> }) => void | Promise<void>;
  hooks?: Record<string, (...args: any[]) => void | Promise<void>>;
  api?: (ctx: PluginCtx) => A | Promise<A>;
}
```

**Kernel mapping:** `onMount` is treated as `onStart`. `onUnmount` is treated as `onStop`. Different names, same execution slot.

### 11.3 Module Spec

```typescript
interface ModuleSpec<N extends string, C = void> {
  plugins?: PluginInstance[];
  components?: ComponentInstance[];
  modules?: ModuleInstance[];           // recursive nesting
  onRegister?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => void;
}
```

**Modules are flattened in Phase 0 and discarded.** The `onRegister` callback fires during flattening (before any plugin lifecycle). It's the only place a module "runs."

### 11.4 Flattening Algorithm (Phase 0)

Input: the plugin list, which may contain plugins, components, and modules.

```
function flatten(items):
  result = []
  for item in items:
    if item.kind === 'module':
      call item.onRegister() if present
      result.push(...flatten(item.plugins))
      result.push(...flatten(item.components))
      result.push(...flatten(item.modules))
    else:
      // Plugin or Component
      if item.spec.plugins:
        result.push(...flatten(item.spec.plugins))  // sub-plugins first
      result.push(item)
  return result
```

**Depth-first. Children before parents. Deterministic.** The output is a flat ordered list of plugins and components. No modules survive this phase.

---

## 12. Lifecycle

### 12.1 Phases

```
Phase 0: FLATTEN + VALIDATE (sync)
  1. Merge framework default plugins + consumer extra plugins
     Final list: [...frameworkDefaults, ...consumerExtras]
  2. Flatten modules (depth-first, children before parents)
  3. Flatten sub-plugins (depth-first, children before parents)
  4. DUPLICATE NAME CHECK -> throw if any collision
  5. DEPENDENCY VALIDATION -> for each plugin with `depends`:
     a. Check every dependency exists in the list
     b. Check every dependency appears BEFORE the dependent
     c. Throw with clear error if either fails
  Result: validated, flat, ordered list

Phase 1: RESOLVE CONFIG (sync)
  For each plugin:
    1. Look up consumer-provided config for this plugin name
    2. Shallow merge: { ...defaultConfig, ...consumerConfig }
    3. Freeze resolved config

Phase 2: CREATE (async, sequential)
  For each plugin (in order):
    1. await createState({ global, config }) -> state
    2. Register hook handlers from `hooks` field
    3. await onCreate({ global, config })

Phase 3: BUILD APIs (async, sequential)
  For each plugin (in order):
    1. await api(PluginCtx) -> A (public API object)
    2. Attach frozen config to API namespace: api.config = resolvedConfig
    3. Register API in plugin registry

Phase 4: INIT (async, sequential)
  For each plugin (in order):
    1. await onInit(BaseCtx & { config })
    2. This is where plugins validate dependencies with require()/has()

--- createApp resolves here. App is returned. ---

Phase 5: START (triggered by app.start())
  1. framework.onReady({ config }) if defined
  2. emit('app:start', { config })
  3. For each plugin (in order):
     await onStart(PluginCtx)

Phase 6: RUNNING
  Plugins communicate via emit()/signal() and getPlugin()/require().

Phase 7: STOP (triggered by app.stop())
  1. For each plugin (in REVERSE order):
     await onStop({ global })
  2. emit('app:stop', { config })
  3. framework.onShutdown({ config }) if defined

Phase 8: DESTROY (triggered by app.destroy())
  1. Calls stop() if not already stopped (idempotent)
  2. For each plugin (in REVERSE order):
     await onDestroy({ global })
  3. emit('app:destroy', {})
  4. Clear all internal registries (configs, states, apis, hooks)
```

### 12.2 Sync vs Async

| Phase | Sync/Async | Rationale |
|---|---|---|
| 0 (Flatten + Validate) | **Sync** | Pure data transformation. No I/O. |
| 1 (Resolve Config) | **Sync** | Pure merge + freeze. |
| 2 (Create) | **Async** | createState and onCreate may need I/O (database connections, file reads). |
| 3 (Build APIs) | **Async** | api() factory may depend on async-initialized state. |
| 4 (Init) | **Async** | onInit may verify dependencies with async checks. |
| 5 (Start) | **Async** | Plugins may start servers, open connections. |
| 7 (Stop) | **Async** | Plugins may flush buffers, close connections. |
| 8 (Destroy) | **Async** | Plugins may finalize, disconnect. |

**`createApp` returns a Promise.** Phases 0-1 run synchronously. Phases 2-4 are awaited sequentially. The returned app is fully initialized -- all async init is complete. `app.start()`, `app.stop()`, `app.destroy()` also return Promises.

### 12.3 Error Handling

Lifecycle methods can throw (or reject). When they do:

- The error propagates to the caller (`await createApp(...)` or `await app.start()`).
- No catch-and-silence. No error swallowing. No retry logic.
- The consumer decides how to handle errors.

This is deliberate. The framework does not know what "error recovery" means in your domain.

---

## 13. Communication Model

### 13.1 Three Channels

The kernel provides exactly three communication mechanisms:

**Channel 1: Lifecycle callbacks (typed ctx)**

`onCreate`, `onInit`, `onStart`, `onStop`, `onDestroy` -- each receives a typed `ctx` object. These are the structured, predictable communication points. The kernel calls them in a defined order.

**Channel 2: Bus events -- `emit(name, payload)` (typed)**

Constrained to event names declared in the framework's `BusContract`. Payload types are checked at compile time. These are the framework's official events.

**Channel 3: Signals -- `signal(name, payload)` (optionally typed)**

When `SignalRegistry` is provided: known signal names get typed payload checking via TypeScript overloads. Unknown signal names still work with `any` payload. When `SignalRegistry` is `{}` (default): all signals are untyped, any string name, any payload.

### 13.2 emit vs signal

| | `emit(name, payload)` | `signal(name, payload)` |
|---|---|---|
| Names constrained to | BusContract keys | SignalRegistry keys (typed) or any string (untyped) |
| Payload type checked | Yes, always | Yes for known names, no for unknown names |
| Defined by | Framework author (Layer 2) | Framework + plugin authors |
| Use case | Framework lifecycle, known events | Plugin-to-plugin communication |
| Convention | `app:*`, `page:*`, `build:*` | `pluginName:eventName` |

**Rule:** Framework events go through `emit`. Plugin events go through `signal`. Both dispatch to the same `hooks` field on plugins -- a handler registered for `'router:navigate'` fires whether it came via `emit` or `signal`.

### 13.3 Hooks

```typescript
// Emitting a bus event (typed):
ctx.emit('page:render', { path: '/home', html: '<h1>Home</h1>' });

// Emitting a typed signal (name in SignalRegistry):
ctx.signal('router:navigate', { from: '/home', to: '/about' });  // payload type-checked

// Emitting an untyped signal (name NOT in SignalRegistry):
ctx.signal('myPlugin:customEvent', { data: 42 });  // any payload, no type check

// Subscribing (in PluginSpec.hooks):
hooks: {
  'page:render': (payload) => {
    // BusContract event -- payload type known from framework
    const { path, html } = payload as { path: string; html: string };
    console.log(`Rendered ${path}`);
  },
  'router:navigate': (payload) => {
    // Known signal -- payload typed via SignalRegistry
    const { from, to } = payload as { from: string; to: string };
    console.log(`${from} -> ${to}`);
  },
  'myPlugin:customEvent': (payload) => {
    // Unknown signal -- cast payload manually
    const { data } = payload as { data: number };
  },
}
```

**Convention: namespace with the emitting plugin's name.** `router:navigate`, `build:start`, `auth:login`. This prevents collisions. Convention, not enforced.

### 13.4 Kernel-Emitted Events

Regardless of what the framework puts in `BusContract`, the kernel always emits:

| Event | When | Payload |
|---|---|---|
| `app:start` | Before plugin onStart calls | `{ config }` |
| `app:stop` | After plugin onStop calls | `{ config }` |
| `app:destroy` | After plugin onDestroy calls | `{}` |

If the framework's `BusContract` includes these keys, the payload type is enforced. If not, they still fire with the default payload.

### 13.5 What About Middleware / Pipes?

**Not in the kernel.** If a plugin needs request transformation, build pipeline, or render chain, it implements that internally. The plugin exposes an API method for other plugins to register middleware:

```typescript
// A plugin that wants middleware: implement it yourself
const HttpPlugin = createPlugin('http', {
  createState: () => ({ middlewares: [] as Function[] }),
  api: (ctx) => ({
    use: (fn: Function) => { ctx.state.middlewares.push(fn); },
    handle: async (req: any) => {
      let result = req;
      for (const mw of ctx.state.middlewares) {
        result = await mw(result);
      }
      return result;
    },
  }),
});

// Another plugin registers middleware via the API
const AuthPlugin = createPlugin('auth', {
  onInit: (ctx) => {
    const http = ctx.require<{ use: Function }>('http');
    http.use((req: any) => ({ ...req, user: 'authenticated' }));
  },
});
```

This is more code than a built-in `pipe` primitive. But it's explicit, debuggable, and doesn't add concepts to the kernel. The kernel stays boring.

---

## 14. Bus Contract and Signal Registry

### 14.1 Bus Contract

The `BusContract` is a type-level declaration of "events this framework declares." Defined at Layer 2 by the framework author.

```typescript
type BusContract = {
  'app:boot':      { config: BaseConfig };
  'app:ready':     { config: BaseConfig };
  'app:shutdown':  { config: BaseConfig };
  'page:render':   { path: string; html: string };
  'page:error':    { path: string; error: Error };
};
```

**What it does:**

1. **`ctx.emit('page:render', payload)`** -- TypeScript checks that `'page:render'` is a valid key and that `payload` matches `{ path: string; html: string }`.
2. **IDE autocomplete** -- Plugin authors get autocomplete for bus event names and typed payload shapes.
3. **Documentation** -- The BusContract IS the documentation of the framework's event API. An LLM reads the type and knows every event that can fire.

### 14.2 Signal Registry

The `SignalRegistry` is an optional type-level declaration of "known plugin-to-plugin signals." Defined at Layer 2 by the framework author.

```typescript
type SignalRegistry = {
  'router:navigate':  { from: string; to: string };
  'router:notFound':  { path: string; fallback: string };
  'renderer:render':  { path: string; html: string };
  'auth:login':       { userId: string };
  'auth:logout':      {};
};
```

**How it works:** The `signal` method on `ctx` uses TypeScript overloads:

```typescript
signal: {
  // Overload 1: known signal name -- typed payload
  <K extends string & keyof Signals>(name: K, payload: Signals[K]): Promise<void>;
  // Overload 2: unknown signal name -- untyped escape hatch
  (name: string, payload?: any): Promise<void>;
};
```

Known signal names get strict typing. Unknown names fall through to `any`. One method, two behaviors.

**When `SignalRegistry` is `{}` (the default):** The first overload matches nothing. All signals are untyped. Zero cost for frameworks that don't use it.

### 14.3 BusContract vs SignalRegistry

| | BusContract | SignalRegistry |
|---|---|---|
| Controls | `ctx.emit()` | `ctx.signal()` |
| Scope | Framework lifecycle events | Plugin-to-plugin events |
| Required? | No (defaults to `{}`) | No (defaults to `{}`) |
| Unknown names | Compile error | Falls through to untyped |
| Escape hatch | None -- all emit names must be declared | Built-in via overloads |

**The design rationale:** `emit` is strict because framework events are a closed set -- the framework author controls all of them. `signal` is lenient because plugin signals are an open set -- consumer plugins may define signals the framework doesn't know about.

### 14.4 Different Frameworks, Different Vocabularies

Same kernel. Different bus contracts. Different signal registries. Different frameworks.

- A site builder has `page:render`, `page:error`, `seo:meta`
- A game engine has `loop:tick`, `input:keydown`, `physics:collision`
- A CLI toolkit has `cli:beforeRun`, `cli:afterRun`, `output:write`
- A bot SDK has `agent:beforeCall`, `agent:afterCall`, `memory:store`

---

## 15. Type System

### 15.1 Plugin Instance (Phantom Types)

```typescript
interface PluginInstance<
  N extends string = string,
  C = void,
  A extends Record<string, any> = {},
  S = void,
> {
  readonly kind: 'plugin';
  readonly name: N;
  readonly _types: { config: C; api: A; state: S };  // phantom, never read at runtime
  readonly _hasDefaults: boolean;                      // phantom, set by createPlugin
  readonly spec: PluginSpec<N, C, A, S>;
}
```

The `_types` field carries generic parameters through the type system. It is never accessed at runtime. `_hasDefaults` is set to `true` when `defaultConfig` is provided, enabling the config optionality logic.

### 15.2 Type-Level Helpers

```typescript
/** Extract name literal from a plugin */
type PluginName<P> = P extends PluginInstance<infer N, any, any, any> ? N : never;

/** Extract config type from a plugin */
type PluginConfigType<P> = P extends PluginInstance<any, infer C, any, any> ? C : never;

/** Extract API type from a plugin */
type PluginApiType<P> = P extends PluginInstance<any, any, infer A, any> ? A : never;

/** Is the config type empty (void | {} | never)? */
type IsEmptyConfig<C> =
  C extends void ? true :
  C extends Record<string, never> ? true :
  [keyof C] extends [never] ? true :
  false;

/** Does this plugin have defaultConfig? */
type HasDefaults<P> = P extends { _hasDefaults: true } ? true : false;

/** Extract API by plugin name from a plugin union */
type PluginApiByName<P, N extends string> =
  P extends PluginInstance<N, infer C, infer A, any>
    ? A & { readonly config: C extends void ? {} : Readonly<C> }
    : never;
```

### 15.3 Type-Level Config Enforcement (BuildPluginConfigs)

```typescript
/**
 * Build the config map for createApp.
 *
 * Rules:
 *   C is void/{}          -> excluded (no config key)
 *   defaultConfig provided -> OPTIONAL (Partial<C>)
 *   no defaultConfig       -> REQUIRED (full C)
 */
type BuildPluginConfigs<P extends PluginInstance> = Prettify<
  & OmitNever<{
      [K in P as IsEmptyConfig<PluginConfigType<K>> extends true ? never
        : HasDefaults<K> extends true ? never
        : PluginName<K>
      ]: PluginConfigType<K>;                          // REQUIRED
    }>
  & OmitNever<{
      [K in P as IsEmptyConfig<PluginConfigType<K>> extends true ? never
        : HasDefaults<K> extends true ? PluginName<K>
        : never
      ]?: Partial<PluginConfigType<K>>;                // OPTIONAL
    }>
>;
```

**Example result for consumer:**

```typescript
// Given: RouterPlugin (no defaults), LoggerPlugin (has defaults), TimerPlugin (void config)
// BuildPluginConfigs produces:
{
  router: { default: string; pages: Record<string, unknown> };  // REQUIRED
  logger?: Partial<LoggerConfig>;                                // OPTIONAL
  // timer: not present at all
}
```

### 15.4 AppConfig Type

```typescript
/**
 * Opaque config object produced by createConfig.
 * Carries the full plugin union for createApp to type pluginConfigs against.
 */
type AppConfig<
  G extends Record<string, any>,
  DefaultP extends PluginInstance,
  ExtraPlugins extends readonly PluginInstance[],
> = {
  readonly _brand: 'AppConfig';
  readonly global: Partial<G>;
  readonly extras: ExtraPlugins;
  /** Phantom: union of all plugins (defaults + extras). Used by createApp for typing. */
  readonly _allPlugins: DefaultP | ExtraPlugins[number];
};
```

### 15.5 Type-Level API Surface (BuildPluginApis)

```typescript
/** Build the app's API surface from the plugin union */
type BuildPluginApis<P extends PluginInstance> = {
  [K in P as PluginName<K>]: PluginApiType<K> & {
    readonly config: PluginConfigType<K> extends void ? {} : Readonly<PluginConfigType<K>>;
  };
};
```

This maps each plugin in the union to a property on the app, keyed by the plugin's name literal. The plugin's API type is augmented with a `config` property for accessing the resolved plugin config.

### 15.6 The App Type

```typescript
type App<
  G extends Record<string, any>,
  Bus extends Record<string, any>,
  Signals extends Record<string, any>,
  P extends PluginInstance,
> = {
  /** Global config, frozen */
  readonly config: Readonly<G> & {
    get: <K extends keyof G>(key: K) => G[K];
  };

  /** Fire typed bus event. Constrained to BusContract. */
  emit: <K extends string & keyof Bus>(hook: K, payload: Bus[K]) => Promise<void>;

  /** Fire signal. Typed for known names, untyped for unknown names. */
  signal: {
    <K extends string & keyof Signals>(name: K, payload: Signals[K]): Promise<void>;
    (name: string, payload?: any): Promise<void>;
  };

  /**
   * Get plugin API by name. Typed on App -- constrained to registered plugin names.
   * Returns undefined if not found.
   */
  getPlugin: <N extends PluginName<P>>(name: N) => PluginApiByName<P, N> | undefined;

  /**
   * Get plugin API or throw with clear error. Typed on App -- constrained to registered plugin names.
   */
  require: <N extends PluginName<P>>(name: N) => PluginApiByName<P, N>;

  /** Check if a plugin is registered. */
  has: (name: string) => boolean;

  /** Start the app. Idempotent. */
  start: () => Promise<void>;

  /** Stop the app. Reverse order. Idempotent. */
  stop: () => Promise<void>;

  /** Destroy. Calls stop() if needed. Idempotent. */
  destroy: () => Promise<void>;
} & Prettify<BuildPluginApis<P>>;
```

### 15.7 Typed getPlugin and require on App

On the `App` type, `getPlugin` and `require` are **constrained to registered plugin names** and return the correct API type:

```typescript
const router = app.getPlugin('router');
// Inferred: RouterApi & { config: Readonly<RouterConfig> } | undefined

router?.navigate('/about');  // OK
router?.fly();               // compile error

app.getPlugin('nonexistent');  // compile error: not a registered name

const logger = app.require('logger');
// Inferred: LoggerApi & { config: Readonly<LoggerConfig> }
```

**Inside plugin definitions: stays loose.** At plugin definition time, the full plugin union isn't known. `getPlugin` and `require` inside `PluginSpec` remain `<T = any>(name: string)`. Plugin authors cast manually or use the `depends` field. This is the same two-phase pattern: loose at definition, strict at consumption.

### 15.8 Sub-Plugin Type Visibility

**Sub-plugin types are NOT propagated to the App type in v1.** If `AuthPlugin` declares `plugins: [SessionPlugin]`, the consumer must also list `SessionPlugin` in their extra plugins to get `app.session.*` typed. At runtime, sub-plugins are registered regardless -- they work. But the type system only sees what's in the plugin lists.

Recursive sub-plugin type propagation is a **planned future improvement** (documented as such). For now, consumers must list sub-plugins explicitly for type visibility.

### 15.9 The Full Type Flow

```
Layer 1: createCore<BaseConfig, BusContract, SignalRegistry>
  | returns CoreAPI bound to these generics
Layer 2: const { createConfig, createApp, createPlugin } = createCore(...)
  | framework exports these -- they carry BaseConfig, BusContract, SignalRegistry
Layer 3: createConfig(globalOverrides, [ExtraPlugin])
  | returns AppConfig carrying AllPlugins = DefaultPlugins | ExtraPlugin
Layer 3: await createApp(config, pluginConfigs)
  | TypeScript infers P from config._allPlugins
  | pluginConfigs typed as BuildPluginConfigs<P> -- knows every plugin
  | returns Promise<App<BaseConfig, BusContract, SignalRegistry, P>>
  | every API fully typed, getPlugin/require constrained to registered names
```

---

## 16. Invariants

These properties always hold. Breaking any of these is a kernel bug.

### 16.1 Name Uniqueness

**Duplicate plugin names throw at Phase 0.**

```
Error: [moku-site] Duplicate plugin name "router". Each plugin must have a unique name.
  Found at positions 2 and 5 in the flattened plugin list.
```

No silent overwrite. No merge. No "last wins." If you want to replace a plugin, remove the old one from your plugin list and add the new one.

### 16.2 Dependency Validation

If a plugin declares `depends: ['logger']`, Phase 0 validates:

```
Error: [moku-site] Plugin "router" depends on "logger", but "logger" is not registered.
  Add the logger plugin to your plugin list, before "router".

Error: [moku-site] Plugin "router" depends on "logger", but "logger" appears after "router".
  Move "logger" before "router" in your plugin list.
```

This is **validation only.** It does not change plugin order. It does not compute a topological sort. It checks that the order the consumer provided satisfies the declared constraints.

### 16.3 Config Completeness

If a plugin requires config (no `defaultConfig`, non-void `C`), TypeScript rejects `createApp` without it. At runtime, the kernel also validates: if required config is missing, throw.

### 16.4 Lifecycle Order

Plugins initialize in array order. Always. Teardown in reverse. Always. No topological sort. No automatic reordering. No `@before` / `@after` annotations.

**Ordering is the consumer's responsibility.** If plugin B depends on plugin A, put A before B. `depends` validates this but does not fix it.

### 16.5 Hook / Signal Execution Order

When an event fires (via `emit` or `signal`), handlers execute in plugin registration order, sequentially. Each handler is awaited before the next. No parallelism.

### 16.6 Immutability

After `createApp` resolves:
- `app` is `Object.freeze()`'d
- `app.config` (global) is `Object.freeze()`'d
- `app.<plugin>.config` is `Object.freeze()`'d

Plugin internal state (`S`) is mutable -- that's the point of state. But configs and the app structure are frozen.

### 16.7 Idempotency

- `app.start()` called twice: second call is a no-op.
- `app.stop()` called twice: second call is a no-op.
- `app.destroy()` calls `stop()` first if needed. Calling `destroy()` twice is safe.

### 16.8 require() Contract

`ctx.require('name')` either returns the plugin's API object or throws:

```
Error: [moku-site] Plugin "router" requires "logger", but "logger" is not registered.
  Add the logger plugin to your plugin list, before "router".
```

The error message includes the framework name, the requesting plugin, and the missing plugin. The suggestion to add it "before" the requester is always correct because of the ordering guarantee.

`ctx.has('name')` returns `boolean`. Never throws.

### 16.9 Default Plugin Immutability

Consumers cannot remove framework default plugins. They can only configure them. The final plugin list is always `[...frameworkDefaults, ...consumerExtras]`.

### 16.10 Phase-Appropriate Context

`createState` and `onCreate` do NOT have access to `getPlugin`, `require`, `has`, `emit`, or `signal`. At that point, not all plugins have been created. Providing these methods would return incomplete data.

### 16.11 Async Sequential Execution

All async lifecycle methods within a phase execute sequentially, one plugin at a time. Plugin A's `createState` resolves before Plugin B's `createState` begins. No parallelism within or across phases.

---

## 17. Plugin = Connection Point

### 17.1 The Rule

**A plugin file is an index.ts that connects domain code to the system. It is NOT where you write business logic.**

Think of a plugin as a **wiring harness.** The harness connects the engine to the chassis. The harness is not the engine. The harness is not the chassis. It's the interface between them.

### 17.2 What a Plugin File Should Look Like

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

### 17.3 Plugin File Structure

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

### 17.4 Why This Matters

The plugin file is the **map**. The domain files are the **territory.** An LLM reads the map (fast, cheap, ~30 lines) and then navigates to exactly the right domain file (precise, targeted). If all the code is in the plugin file, the LLM has to read and understand everything just to find where to make a change.

This structure also enables independent testing. Domain functions (`createRouterState`, `createRouterApi`, `handleNotFound`) are pure functions that take `ctx` as input. They can be unit tested without spinning up the whole framework. See Section 18.

---

## 18. Plugin Testing

### 18.1 The Problem

Testing a plugin currently requires building an entire app:

```typescript
// Heavy test setup
const config = createConfig({ siteName: 'Test' }, [LoggerPlugin, RouterPlugin]);
const app = await createApp(config, { router: { default: 'home', pages: {} } });
await app.start();
// now test app.router.navigate()...
await app.destroy();
```

This is integration testing. There's no way to unit test a plugin's API factory, state creation, or lifecycle hooks in isolation.

### 18.2 createTestCtx

`moku_core/testing` provides a lightweight utility that creates a mock `ctx` object for testing plugin domain files in isolation.

**This is NOT a core export.** It ships as a sub-path:

```typescript
import { createTestCtx } from 'moku_core/testing';
```

### 18.3 API

```typescript
function createTestCtx<G, C, S>(options?: {
  global?: Partial<G>;
  config?: Partial<C>;
  state?: Partial<S>;
  plugins?: Record<string, any>;  // mock plugin APIs
}): {
  ctx: PluginCtx<G, any, any, C, S>;
  emitted: Array<{ name: string; payload: any }>;   // captured emit calls
  signaled: Array<{ name: string; payload: any }>;  // captured signal calls
};
```

### 18.4 Usage

```typescript
// Test router API factory in isolation
import { createTestCtx } from 'moku_core/testing';
import { createRouterApi } from '../plugins/router/api';
import type { RouterConfig, RouterState } from '../plugins/router/types';

test('navigate updates current path', () => {
  const { ctx } = createTestCtx<any, RouterConfig, RouterState>({
    config: { default: 'home', pages: { home: {}, about: {} } },
    state: { currentPath: 'home', history: ['home'] },
  });

  const api = createRouterApi(ctx);
  api.navigate('about');

  expect(ctx.state.currentPath).toBe('about');
});

test('navigate to unknown page signals notFound', () => {
  const { ctx, signaled } = createTestCtx<any, RouterConfig, RouterState>({
    config: { default: 'home', pages: { home: {} } },
    state: { currentPath: 'home', history: ['home'] },
  });

  const api = createRouterApi(ctx);
  api.navigate('nonexistent');

  expect(signaled[0]).toEqual({
    name: 'router:notFound',
    payload: { attempted: 'nonexistent', fallback: 'home' },
  });
});

test('require throws for missing plugin', () => {
  const { ctx } = createTestCtx({
    plugins: { logger: { info: vi.fn() } },
  });

  expect(() => ctx.require('auth')).toThrow('auth');
  expect(ctx.has('logger')).toBe(true);
  expect(ctx.require('logger').info).toBeDefined();
});
```

### 18.5 How It Works

`createTestCtx` creates:

- A `global` object from the provided partial (frozen)
- A `config` object from the provided partial (frozen)
- A `state` object from the provided partial (mutable)
- `getPlugin(name)` that returns from the `plugins` map
- `require(name)` that returns from `plugins` or throws
- `has(name)` that checks the `plugins` map
- `emit(name, payload)` that pushes to the `emitted` array
- `signal(name, payload)` that pushes to the `signaled` array

No kernel. No lifecycle. No framework. Just the ctx shape that domain functions expect.

### 18.6 Testing Strategy

This closes the testing loop:

| What to test | How | Tool |
|---|---|---|
| Plugin wiring (index.ts) | Integration test with real app | `createApp` |
| Domain logic (api.ts, state.ts, handlers.ts) | Unit test with mock ctx | `createTestCtx` |
| Config validation (validation.ts) | Unit test, plain function | Direct call |
| Type correctness | Compile-time | TypeScript |

**For LLMs:** When an LLM generates a plugin, it can also generate focused unit tests using `createTestCtx`. The tests verify the domain logic without spinning up the whole framework.

---

## 19. Anti-Patterns

### 19.1 Writing Business Logic in Plugin Files

```typescript
// BAD: Plugin index.ts is 400 lines of route matching and navigation logic
// GOOD: Plugin index.ts is 30 lines. Logic in ./api.ts, ./state.ts, ./handlers.ts
```

### 19.2 Consumer Importing from moku_core

```typescript
// BAD: Consumer reaches past the framework
import { createCore } from 'moku_core';

// GOOD: Consumer uses the framework
import { createConfig, createApp } from 'my-framework';
```

The consumer should never see Layer 1. If they need to, the framework is missing something.

### 19.3 Skipping createConfig

```typescript
// BAD: Trying to pass plugins directly to createApp -- types can't be inferred
const app = await createApp({ siteName: 'Blog' }, { ... }, [BlogPlugin]);

// GOOD: Two-step: declare plugins first, then provide configs
const config = createConfig({ siteName: 'Blog' }, [BlogPlugin]);
const app = await createApp(config, { blog: { ... } });
```

`createConfig` exists because TypeScript needs the full plugin set known before it types `pluginConfigs`. Skipping it means custom plugin configs won't be type-checked.

### 19.4 Leaking State

```typescript
// BAD: returns raw state reference
api: (ctx) => ({
  state: ctx.state,  // consumer can mutate internals
})

// GOOD: returns closures over state
api: (ctx) => ({
  value: () => ctx.state.count,
  increment: () => { ctx.state.count++; },
})
```

### 19.5 God Plugin

One plugin that does routing, auth, data fetching, and rendering. Split it. Each plugin = one domain concern.

### 19.6 Deep Config Nesting

```typescript
// BAD: deep nested config with merge ambiguity
defaultConfig: {
  database: { host: 'localhost', port: 5432, pool: { min: 2, max: 10 } }
}

// GOOD: flat config, or document that nested objects replace entirely
defaultConfig: {
  dbHost: 'localhost',
  dbPort: 5432,
  dbPoolMin: 2,
  dbPoolMax: 10,
}
```

Shallow merge means nested objects are replaced wholesale. If you use nested configs, document this clearly.

### 19.7 Using emit()/signal() for Request/Response

```typescript
// BAD: trying to get a return value from emit/signal
ctx.signal('auth:getToken');  // returns Promise<void>, not the token

// GOOD: use require for request/response
const auth = ctx.require<{ getToken: () => string }>('auth');
const token = auth.getToken();
```

Events are for notifications. `getPlugin`/`require` are for requests.

### 19.8 LLM Inventing New Primitives

```typescript
// BAD: LLM creates a "service" concept that doesn't exist
class AuthService { ... }
app.registerService(AuthService);

// GOOD: LLM uses what the framework gives
const AuthPlugin = createPlugin('auth', { ... });
```

**If the LLM needs something the framework doesn't have, it builds a plugin. Not a new abstraction.**

### 19.9 Forgetting await on createApp

```typescript
// BAD: missing await -- app is a Promise, not an App
const app = createApp(config, { ... });
app.router.navigate('home');  // runtime error: app.router is undefined

// GOOD: await the Promise
const app = await createApp(config, { ... });
app.router.navigate('home');  // works
```

---

## 20. Complete Example: All Three Layers

### 20.1 Layer 1: moku_core

```typescript
// moku_core/src/index.ts
export { createCore } from './core';

// moku_core/testing (sub-path export)
// export { createTestCtx } from './testing';
```

One export at the main entry point. That's the package.

### 20.2 Layer 2: Site Builder Framework

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

### 20.3 Layer 2: createPluginFactory Usage

```typescript
// my-framework/src/plugins/database/factory.ts
import { createPluginFactory } from '../..';
import type { DbConfig, DbApi, DbState } from './types';

export const createDbPlugin = createPluginFactory<DbConfig, DbApi, DbState>({
  createState: async ({ config }) => {
    const pool = await createPool(config.connectionString);
    await pool.query('SELECT 1');  // verify connection
    return { pool };
  },
  api: ({ state }) => ({
    query: (sql: string, params?: any[]) => state.pool.query(sql, params),
    transaction: (fn: (client: any) => Promise<any>) => state.pool.transaction(fn),
  }),
  onDestroy: async ({ global }) => {
    // cleanup handled by pool reference in closure
  },
});

// Create named instances
export const PrimaryDb = createDbPlugin('primaryDb');
export const ReplicaDb = createDbPlugin('replicaDb');
```

### 20.4 Layer 3: Consumer Blog

```typescript
// my-blog/src/main.ts
import { createConfig, createApp, createPlugin } from 'my-framework';
import { BlogPlugin } from 'my-framework/plugins';
import { ContactFormPlugin } from './plugins/contact-form';

const HomePage = { render: () => '<h1>Welcome</h1>' };
const AboutPage = { render: () => '<h1>About</h1>' };

// Step 1: Declare what this app is made of
const config = createConfig(
  { siteName: 'Code & Coffee', mode: 'production' },
  [BlogPlugin, ContactFormPlugin],
);

// Step 2: Provide plugin configs
const app = await createApp(config, {
  router: { default: 'home', pages: { home: HomePage, about: AboutPage } },
  blog: { postsDir: './content', postsPerPage: 5 },
  contactForm: { recipient: 'me@example.com' },
});

// App is fully initialized -- all async init done
await app.start();

app.config.siteName;             // 'Code & Coffee' -- typed
app.router.navigate('about');    // typed, framework default
app.blog.listPosts();            // typed, consumer extra
app.contactForm.submit({         // typed, consumer custom plugin
  name: 'Alice', email: 'alice@example.com', message: 'Hello!',
});

await app.destroy();
```

### 20.5 Layer 3: Consumer Custom Plugin

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

### 20.6 Layer 3: Multi-Instance Plugin Usage

```typescript
// my-api/src/main.ts
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

app.primaryDb.query('INSERT INTO ...');  // typed, separate instance
app.replicaDb.query('SELECT * FROM ...');  // typed, separate instance
```

### 20.7 Layer 3: Minimal (No Extras)

```typescript
import { createConfig, createApp } from 'my-framework';

const config = createConfig({ siteName: 'Simple', mode: 'production' });
const app = await createApp(config, {
  router: { default: 'home', pages: { home: { render: () => '<h1>Home</h1>' } } },
});
```

---

## 21. Kernel Runtime (Pseudocode)

```typescript
function createCore(name, defaults) {

  // --- createConfig: binds global overrides + extras, returns opaque AppConfig ---
  function createConfigFn(consumerGlobal, extraPlugins = []) {
    return {
      _brand: 'AppConfig',
      global: consumerGlobal,
      extras: extraPlugins,
      _defaults: defaults,
    };
  }

  // --- createApp: wires everything, returns frozen app ---
  async function createAppFn(appConfig, pluginConfigs) {
    const consumerGlobal = appConfig.global;
    const extraPlugins = appConfig.extras;

    // === Phase 0: Flatten + Validate (sync) ===
    const allInputs = [...(defaults.plugins ?? []), ...extraPlugins];
    const items = flatten(allInputs);
    const names = items.map(i => i.name);

    // Duplicate check
    const dupes = findDuplicates(names);
    if (dupes.length > 0) {
      throw new Error(`[${name}] Duplicate plugin names: ${dupes.join(', ')}`);
    }

    // Dependency validation
    for (const item of items) {
      if (!item.spec.depends) continue;
      const idx = items.indexOf(item);
      for (const dep of item.spec.depends) {
        const depIdx = names.indexOf(dep);
        if (depIdx === -1) {
          throw new Error(
            `[${name}] Plugin "${item.name}" depends on "${dep}", but "${dep}" is not registered.`
          );
        }
        if (depIdx >= idx) {
          throw new Error(
            `[${name}] Plugin "${item.name}" depends on "${dep}", but "${dep}" appears after "${item.name}".`
          );
        }
      }
    }

    // === Resolve global config (sync) ===
    const globalConfig = Object.freeze({ ...defaults.config, ...consumerGlobal });

    // === Internal registries ===
    const configs = new Map();
    const states = new Map();
    const apis = new Map();
    const hookMap = new Map();
    let started = false;

    // === Shared helpers ===
    async function dispatch(hookName, payload) {
      const handlers = hookMap.get(hookName) ?? [];
      for (const h of handlers) { await h(payload); }
    }
    const emit = (n, p) => dispatch(n, p);
    const signal = (n, p) => dispatch(n, p);
    const getPlugin = (n) => apis.get(n);
    const requirePlugin = (n, requester) => {
      const api = apis.get(n);
      if (!api) throw new Error(
        `[${name}] Plugin "${requester}" requires "${n}", but "${n}" is not registered.`
      );
      return api;
    };
    const has = (n) => apis.has(n);

    // === Framework onBoot (sync) ===
    if (defaults.onBoot) defaults.onBoot({ config: globalConfig });

    // === Phase 1: Resolve Config (sync) ===
    for (const item of items) {
      const userConf = pluginConfigs[item.name];
      configs.set(item.name, Object.freeze({ ...item.spec.defaultConfig, ...userConf }));
    }

    // === Phase 2: Create (async, sequential) ===
    for (const item of items) {
      const conf = configs.get(item.name);
      if (item.spec.createState) {
        const state = await item.spec.createState({ global: globalConfig, config: conf });
        states.set(item.name, state);
      }
      if (item.spec.hooks) {
        for (const [h, fn] of Object.entries(item.spec.hooks)) {
          const list = hookMap.get(h) ?? [];
          list.push(fn);
          hookMap.set(h, list);
        }
      }
      if (item.spec.onCreate) {
        await item.spec.onCreate({ global: globalConfig, config: conf });
      }
    }

    // === Phase 3: Build APIs (async, sequential) ===
    for (const item of items) {
      const conf = configs.get(item.name);
      const state = states.get(item.name);
      let api = {};
      if (item.spec.api) {
        api = await item.spec.api({
          global: globalConfig, config: conf, state,
          emit, signal, getPlugin,
          require: (n) => requirePlugin(n, item.name), has,
        });
      }
      api.config = conf;
      apis.set(item.name, api);
    }

    // === Phase 4: Init (async, sequential) ===
    for (const item of items) {
      if (item.spec.onInit) {
        await item.spec.onInit({
          global: globalConfig, config: configs.get(item.name),
          emit, signal, getPlugin,
          require: (n) => requirePlugin(n, item.name), has,
        });
      }
    }

    // === Build app ===
    const app = {
      config: Object.freeze({ ...globalConfig, get: (k) => globalConfig[k] }),
      emit, signal, getPlugin, require: (n) => requirePlugin(n, 'app'), has,

      start: async () => {
        if (started) return;
        started = true;
        if (defaults.onReady) await defaults.onReady({ config: globalConfig });
        await dispatch('app:start', { config: globalConfig });
        for (const item of items) {
          if (item.spec.onStart) {
            await item.spec.onStart({
              global: globalConfig, config: configs.get(item.name),
              state: states.get(item.name),
              emit, signal, getPlugin,
              require: (n) => requirePlugin(n, item.name), has,
            });
          }
        }
      },

      stop: async () => {
        if (!started) return;
        started = false;
        for (const item of [...items].reverse()) {
          if (item.spec.onStop) await item.spec.onStop({ global: globalConfig });
        }
        await dispatch('app:stop', { config: globalConfig });
        if (defaults.onShutdown) await defaults.onShutdown({ config: globalConfig });
      },

      destroy: async () => {
        await app.stop();
        for (const item of [...items].reverse()) {
          if (item.spec.onDestroy) await item.spec.onDestroy({ global: globalConfig });
        }
        await dispatch('app:destroy', {});
        configs.clear(); states.clear(); apis.clear(); hookMap.clear();
      },
    };

    // Mount plugin APIs on app
    for (const [n, api] of apis) app[n] = api;
    return Object.freeze(app);
  }

  // --- createPlugin ---
  function createPluginFn(pluginName, spec) {
    return {
      kind: 'plugin', name: pluginName, spec,
      _hasDefaults: 'defaultConfig' in spec,
      _types: {},
    };
  }

  // --- createComponent ---
  function createComponentFn(compName, spec) {
    // Map component lifecycle to plugin lifecycle
    const mappedSpec = {
      ...spec,
      onStart: spec.onMount,
      onStop: spec.onUnmount,
    };
    return {
      kind: 'component', name: compName, spec: mappedSpec,
      _hasDefaults: 'defaultConfig' in spec,
      _types: {},
    };
  }

  // --- createModule ---
  function createModuleFn(modName, spec) {
    return { kind: 'module', name: modName, spec };
  }

  // --- createPluginFactory ---
  function createPluginFactoryFn(spec) {
    return (factoryName) => createPluginFn(factoryName, spec);
  }

  return {
    createConfig: createConfigFn,
    createApp: createAppFn,
    createPlugin: createPluginFn,
    createComponent: createComponentFn,
    createModule: createModuleFn,
    createEventBus: () => { /* standalone pub/sub utility */ },
    createPluginFactory: createPluginFactoryFn,
  };
}
```

---

## 22. Design Decisions Log

Every significant "why" in this spec:

| Decision | Alternative considered | Why we chose this |
|---|---|---|
| Three layers (core -> framework -> consumer) | Single package | Constrains each layer, prevents LLM structural errors |
| `createCore` as single Layer 1 export | Multiple exports | One function = one concept = micro |
| `createConfig` + `createApp` two-step pattern | Three-arg createApp | TypeScript can't type arg 2 based on arg 3. Two steps let TS know all plugins before typing pluginConfigs. |
| `createConfig` returns opaque AppConfig | Return plain tuple/array | Opaque type prevents misuse. Phantom types carry plugin union. |
| No configRequired field | Boolean flag + defaultConfig | Config type IS the contract. One mechanism, one truth. |
| `defaultConfig` is full `C` | `Partial<C>` | Consumer gets complete valid config when omitting. |
| `emit` (typed) + `signal` (optionally typed) | Single untyped emit | Bus contract gives type safety for framework events. Signal with overloads gives optional safety for plugin events. |
| SignalRegistry as 3rd generic on createCore | Typed signal as separate concept | Overloads keep one `signal` method. 3rd generic defaults to `{}` for zero-cost opt-out. |
| Async createApp returning Promise<App> | Sync createApp with async deferred to onStart | Plugins need real I/O during init. "Not ready yet" APIs are a type-level lie. |
| Sequential async execution (not parallel) | Parallel execution within phases | Preserves ordering guarantee. Predictable. Debuggable. |
| No topological sort | Auto-sort by `depends` | Explicit ordering is simpler, more predictable, more debuggable. |
| `depends` as validation only | Dependency resolution | Just checks. Doesn't change order. Doesn't add magic. |
| Duplicate names throw | Silent overwrite / merge | Silent bugs are worse than loud errors. |
| Shallow merge only | Deep merge with lodash | Deep merge is unpredictable. Shallow merge has one rule. |
| Typed getPlugin/require on App type | Loose typing everywhere | Consumers get full type safety. Plugin internals stay loose (full union not known). |
| createPluginFactory in CoreAPI | External utility | Multi-instance plugins (two databases, three loggers) are a real need. Minimal addition. |
| moku_core/testing sub-path export | Testing in main entry point | Keeps core entry minimal. Testing is opt-in. |
| Hooks untyped at kernel level | Typed hook registry via generics | Keep kernel simple. Layer typing via BusContract + SignalRegistry. |
| No middleware in kernel | Built-in `pipe()` | Plugins implement their own. One less concept to learn. |
| Component = plugin at runtime | Separate runtime paths | Less code, fewer bugs, same capability. |
| Module = flattening container | Runtime entity with own lifecycle | Modules are organization, not runtime. |
| Sub-plugin types not propagated (v1) | Recursive FlattenPlugins type | TypeScript recursion limits. List explicitly for now. Planned for future. |
| `require()` throws, `getPlugin()` returns undefined | Single method | Two methods, two intentions. Clear semantics. |
| `ctx` varies by lifecycle phase | Same ctx everywhere | Prevents access to things that don't exist yet. |
| Configs frozen after creation | Mutable configs | Prevents a class of bugs. Use state for mutable data. |
| App frozen after creation | Mutable app | Same. The plugin set is static. |
| Default plugins immutable | Consumer can remove | Framework identity defined by its defaults. |
| Plugin = connection point | Plugin = code container | Enables independent testing, LLM navigation, separation of concerns. |
| Framework provides BaseConfig defaults | Consumer provides full config | Consumer only overrides what they need. Partial<BaseConfig>. |
| Consumer uses framework's createPlugin | Consumer creates plugins independently | Ensures custom plugins inherit BaseConfig, BusContract, and SignalRegistry typing. |

### Planned Future Improvements

These are explicitly **out of scope for v1** but documented for direction:

| Feature | Why deferred |
|---|---|
| Sub-plugin type propagation | Recursive `FlattenPlugins` type. TypeScript recursion limits. High value, needs careful implementation. |
| Framework composition (`core.extend()`) | Framework B extends Framework A's config + defaults. Needs real-world validation. |
| Dynamic plugin loading (`app.extend()`) | Add plugins after createApp. Fundamental architecture question. |
| Reactive state utility (`moku_core/signals`) | Opt-in signals/computed/effects. Utility package, not core. |
| Consumer plugin restrictions (`validatePlugin`) | Duplicate name check is sufficient for now. |

---

## 23. LLM System Prompt Fragment

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

*The kernel is boring. The framework is opinionated. The consumer is productive. The LLM is constrained.*
