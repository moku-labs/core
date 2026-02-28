# 15 - Plugin Structure and Code Organization

**Domain:** Complexity tiers, domain-specific file layouts, promotion triggers, naming conventions
**Architecture:** v3 3-step (createCoreConfig -> createCore -> createApp)

---

## 1. Organizing Principle

Spec 12 establishes the rule: **a plugin file is a wiring harness, not business logic.** This spec extends that rule into a decision framework — when does a plugin need a directory? When is a single file enough? What subdirectories make sense for different domains?

The answer is driven by one metric: **how much domain logic does each spec field require?**

### Promotion Triggers

| Trigger | Action |
|---------|--------|
| 1-2 spec fields, < 30 lines total | Nano — single file, no directory |
| 2-3 spec fields, < 80 lines total | Micro — single file, no directory |
| Any domain function > 20 lines | Extract to its own file → Standard |
| Multiple domain concerns with shared types | Standard — directory with domain files |
| Sub-domains with internal structure (providers, transforms) | Complex — subdirectories |
| Multiple coordinating domain modules, each with own state/API | Very Complex — module directories |

Start at the simplest tier that fits. Promote when the file outgrows its tier. Never force a complex structure on a simple plugin.

---

## 2. Complexity Tiers

### 2.1 Nano (single file, < 30 lines)

Config-only plugins, trivial API with no state, feature flags, environment detection.

```
plugins/
  env.ts
```

```typescript
// plugins/env.ts
import { createPlugin } from '../config';

export const envPlugin = createPlugin('env', {
  config: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    isCI: Boolean(process.env.CI),
  },
  api: (ctx) => ({
    isDev: () => ctx.config.nodeEnv === 'development',
    isProd: () => ctx.config.nodeEnv === 'production',
    isCI: () => ctx.config.isCI,
  }),
});
```

Tests live alongside: `env.test.ts`.

### 2.2 Micro (single file, 30-80 lines)

Simple state + API, self-contained domain logic that fits in one screen.

```
plugins/
  counter.ts
```

```typescript
// plugins/counter.ts
import { createPlugin } from '../config';

export const counterPlugin = createPlugin('counter', {
  config: { initial: 0, step: 1 },
  createState: (ctx) => ({ count: ctx.config.initial }),
  api: (ctx) => ({
    increment: () => { ctx.state.count += ctx.config.step; },
    decrement: () => { ctx.state.count -= ctx.config.step; },
    value: () => ctx.state.count,
    reset: () => { ctx.state.count = ctx.config.initial; },
  }),
});
```

Promote to standard when the file crosses 80 lines or shared types emerge.

### 2.3 Standard (multi-file directory)

The typical plugin. 3+ spec fields. Domain functions that would exceed 20 lines inline. Shared type definitions. This is the most common tier.

```
plugins/
  router/
    index.ts                 # ~30 lines. Wiring only.
    types.ts                 # Shared type definitions.
    state.ts                 # createRouterState factory.
    api.ts                   # createRouterApi factory.
    handlers.ts              # Event handler factories.
    __tests__/
      state.test.ts
      api.test.ts
      router.test.ts         # Integration test.
```

```typescript
// plugins/router/index.ts
import { createPlugin } from '../../config';
import { rendererPlugin } from '../renderer';
import { createRouterState } from './state';
import { createRouterApi } from './api';
import { handleRouteNotFound } from './handlers';

export const routerPlugin = createPlugin('router', {
  depends: [rendererPlugin],
  config: { basePath: '/', notFoundRedirect: '/404' },
  createState: createRouterState,
  api: createRouterApi,
  hooks: (ctx) => ({
    'page:error': handleRouteNotFound(ctx),
  }),
  onStart: async (ctx) => {
    void ctx.emit('router:navigate', {
      from: '',
      to: ctx.config.basePath,
    });
  },
});
```

### 2.4 Complex (multi-file + subdirectories)

Large feature plugins with multiple internal sub-domains: providers, strategies, adapters, transforms.

```
plugins/
  analytics/
    index.ts                 # ~25 lines. Wiring only.
    types.ts                 # Shared types across all files.
    state.ts                 # createAnalyticsState factory.
    api.ts                   # Public API factory.
    tracker.ts               # Core tracking logic.
    providers/
      index.ts               # Provider registry.
      google.ts              # Google Analytics adapter.
      plausible.ts           # Plausible adapter.
      types.ts               # Provider interface.
    __tests__/
      tracker.test.ts
      api.test.ts
      providers/
        google.test.ts
        plausible.test.ts
```

```typescript
// plugins/analytics/index.ts
import { createPlugin } from '../../config';
import { createAnalyticsState } from './state';
import { createAnalyticsApi } from './api';

export const analyticsPlugin = createPlugin('analytics', {
  config: {
    provider: 'google' as 'google' | 'plausible',
    trackingId: '',
    sampleRate: 1.0,
  },
  createState: createAnalyticsState,
  api: createAnalyticsApi,
  onInit: (ctx) => {
    if (!ctx.config.trackingId) {
      throw new Error('[my-framework] analytics.trackingId is required.\n  Provide a tracking ID in pluginConfigs.');
    }
  },
});
```

Subdirectories group related implementation files. Each can have its own `types.ts` for internal interfaces. One level of barrel is the maximum.

### 2.5 Very Complex (module directories)

Mini-application plugins. Multiple coordinating domain modules that each have their own state, logic, and types. A CMS with content management, media handling, versioning, and a publishing pipeline. An e-commerce engine with catalog, cart, checkout, and inventory. These plugins are rare — most plugins should split into separate plugins before reaching this tier.

```
plugins/
  cms/
    index.ts                 # ~40 lines. Wiring harness.
    types.ts                 # Shared types across all modules.
    content/
      types.ts               # ContentItem, ContentQuery.
      state.ts               # Content registry, draft store.
      api.ts                 # create(), update(), delete(), query().
      validator.ts           # Schema validation for content types.
      __tests__/
        api.test.ts
        validator.test.ts
    media/
      types.ts               # MediaAsset, UploadOptions.
      state.ts               # Asset registry, upload queue.
      api.ts                 # upload(), transform(), resolve().
      processing.ts          # Image resize, format conversion.
      __tests__/
        api.test.ts
        processing.test.ts
    versioning/
      types.ts               # Version, Diff, ChangeSet.
      state.ts               # Version history, branch state.
      api.ts                 # commit(), revert(), diff(), history().
      __tests__/
        api.test.ts
    publishing/
      types.ts               # PublishTarget, Pipeline, Schedule.
      state.ts               # Publish queue, schedule registry.
      api.ts                 # publish(), schedule(), preview().
      targets/
        static.ts            # Static site generation target.
        api-endpoint.ts      # API publishing target.
        types.ts             # PublishTarget interface.
      __tests__/
        api.test.ts
        targets/
          static.test.ts
    __tests__/
      cms.test.ts            # Full integration test.
```

```typescript
// plugins/cms/index.ts
import { createPlugin } from '../../config';
import { dbPlugin } from '../db';
import { httpPlugin } from '../http';
import { createCmsState } from './state';
import { createContentApi } from './content/api';
import { createMediaApi } from './media/api';
import { createVersioningApi } from './versioning/api';
import { createPublishingApi } from './publishing/api';
import type { CmsEvents } from './types';

export const cmsPlugin = createPlugin('cms', {
  depends: [dbPlugin, httpPlugin],
  events: register => register.map<CmsEvents>({
    'cms:publish':  'Content published',
    'cms:draft':    'Draft saved',
    'cms:upload':   'Media uploaded',
  }),
  config: {
    defaultLocale: 'en',
    maxUploadSize: 10 * 1024 * 1024,
    publishTargets: ['static'] as string[],
  },
  createState: createCmsState,
  api: (ctx) => ({
    content:    createContentApi(ctx),
    media:      createMediaApi(ctx),
    versioning: createVersioningApi(ctx),
    publishing: createPublishingApi(ctx),
  }),
  onStop: async () => {
    // Flush publish queue, clean temp uploads
  },
});
```

**Rules for very complex plugins:**

- Each module directory (`content/`, `media/`, etc.) follows the same contract as standard-tier files: `types.ts`, `state.ts`, `api.ts`.
- The root `index.ts` still only wires. It imports module APIs and composes them into a namespaced public API.
- The public API uses **namespaced objects** (`app.cms.content.create()`, `app.cms.media.upload()`) to organize the surface area.
- Module directories do NOT import from each other directly. Cross-module coordination goes through the root state or shared types.
- One integration test at the plugin root (`__tests__/cms.test.ts`) tests the full plugin. Module-level tests cover each module independently.

**When to split instead:** If modules have no shared state, no shared events, and no cross-module coordination — they should be separate plugins, not one very complex plugin. The very complex tier exists for cases where the modules are genuinely coupled and must share internal state.

---

## 3. Domain Scenarios

### 3.1 Utility Plugins

Formatters, validators, helpers, environment detection. Pure functions, no state, no lifecycle.

**Tier: Nano or Micro.**

```
plugins/
  format.ts                  # ~20 lines. Pure API, no state.
```

```typescript
// plugins/format.ts
import { createPlugin } from '../config';

export const formatPlugin = createPlugin('format', {
  config: { locale: 'en-US', currency: 'USD' },
  api: (ctx) => ({
    date: (d: Date) => d.toLocaleDateString(ctx.config.locale),
    currency: (n: number) =>
      n.toLocaleString(ctx.config.locale, {
        style: 'currency',
        currency: ctx.config.currency,
      }),
    number: (n: number) => n.toLocaleString(ctx.config.locale),
  }),
});
```

If a "utility" plugin needs subdirectories, it is not a utility — it is a feature plugin.

### 3.2 CLI Plugins

Commands, argument parsing, output formatting, interactive prompts.

**Tier: Standard.** CLIs have distinct concerns (command definitions, arg parsing, output) that benefit from separation.

```
plugins/
  cli/
    index.ts                 # ~30 lines. Wiring.
    types.ts                 # Command, Option, Result types.
    state.ts                 # Registered commands, parsed args.
    api.ts                   # register(), run(), output().
    commands/
      help.ts                # Built-in help command.
      version.ts             # Built-in version command.
    __tests__/
      api.test.ts
      commands/
        help.test.ts
```

```typescript
// plugins/cli/index.ts
import { createPlugin } from '../../config';
import { createCliState } from './state';
import { createCliApi } from './api';

export const cliPlugin = createPlugin('cli', {
  config: {
    name: 'my-tool',
    version: '0.0.0',
    description: '',
  },
  createState: createCliState,
  api: createCliApi,
  onStart: async (ctx) => {
    const args = process.argv.slice(2);
    await ctx.require(cliPlugin).run(args);
  },
});
```

A CLI with a single command can stay micro. Once you have 2+ commands with their own option schemas, promote to standard with a `commands/` subdirectory.

### 3.3 Build Plugins

Bundling, compilation, transforms, asset processing.

**Tier: Standard (single-concern) or Complex (multi-phase pipeline).**

Single-concern build tool:

```
plugins/
  typescript/
    index.ts                 # ~25 lines.
    types.ts                 # CompilerOptions, DiagnosticResult.
    state.ts                 # Cached program, file registry.
    api.ts                   # compile(), check(), watch().
    __tests__/
      api.test.ts
```

Multi-phase build pipeline:

```
plugins/
  bundler/
    index.ts                 # ~30 lines.
    types.ts                 # BundleConfig, Asset, Transform.
    state.ts                 # Asset graph, transform registry.
    api.ts                   # bundle(), addTransform(), watch().
    transforms/
      index.ts               # Transform registry.
      typescript.ts           # .ts -> .js transform.
      css.ts                 # CSS processing.
      assets.ts              # Static asset handling.
      types.ts               # Transform interface.
    __tests__/
      api.test.ts
      transforms/
        typescript.test.ts
        css.test.ts
```

Build plugins benefit from a `transforms/` or `phases/` subdirectory. Each transform is a pure function that can be tested independently.

### 3.4 Web / Backend Plugins

HTTP server, middleware, routing, auth, database.

**Tier: Standard.** Backend plugins almost always need `onStart` (open connections) and `onStop` (close them).

HTTP server:

```
plugins/
  http/
    index.ts                 # ~30 lines. Events: http:request, http:response.
    types.ts                 # Request, Response, Middleware types.
    state.ts                 # Server instance, middleware stack.
    api.ts                   # listen(), use(), route().
    handlers.ts              # Error handler, not-found handler.
    __tests__/
      api.test.ts
      handlers.test.ts
```

```typescript
// plugins/http/index.ts
import { createPlugin } from '../../config';
import { createHttpState } from './state';
import { createHttpApi } from './api';
import type { HttpEvents } from './types';

export const httpPlugin = createPlugin('http', {
  events: register => register.map<HttpEvents>({
    'http:request':  'Incoming HTTP request',
    'http:response': 'Outgoing HTTP response',
  }),
  config: { port: 3000, host: 'localhost' },
  createState: createHttpState,
  api: createHttpApi,
  onStart: async (ctx) => {
    await ctx.state.server.listen(ctx.config.port, ctx.config.host);
  },
  onStop: async () => {
    // Close server
  },
});
```

Database:

```
plugins/
  db/
    index.ts                 # ~25 lines.
    types.ts                 # QueryResult, Migration types.
    state.ts                 # Connection pool, migration state.
    api.ts                   # query(), migrate(), transaction().
    __tests__/
      api.test.ts
```

### 3.5 SPA Plugins

Client routing, component lifecycle, store, hydration.

**Tier: Standard (router) or Complex (store).**

Client router:

```
plugins/
  spa-router/
    index.ts                 # ~30 lines.
    types.ts                 # Route, RouteMatch, NavigationGuard.
    state.ts                 # Current route, history stack, guards.
    api.ts                   # navigate(), back(), addGuard().
    handlers.ts              # popstate handler, link click handler.
    __tests__/
      state.test.ts
      api.test.ts
```

Store with slices and middleware:

```
plugins/
  store/
    index.ts                 # ~25 lines.
    types.ts                 # StoreConfig, Slice, Selector.
    state.ts                 # Root state tree, subscriber list.
    api.ts                   # getState(), dispatch(), subscribe(), select().
    slices/
      index.ts               # Slice registry.
      types.ts               # Slice interface.
    middleware/
      logger.ts              # Action logger.
      thunk.ts               # Async action middleware.
    __tests__/
      api.test.ts
      slices/
        index.test.ts
```

SPA plugins often need browser-specific lifecycle (popstate, DOMContentLoaded). These belong in `handlers.ts` or `onStart`, never in `api.ts`.

### 3.6 Frontend Plugins

UI theme, i18n, form validation, notifications.

**Tier: Micro or Standard.** Often sits at the boundary — simple theme stays micro, i18n with translation loading promotes to standard.

Theme (micro):

```
plugins/
  theme.ts                   # ~50 lines. Config (palette) + API (get/set).
```

i18n (standard):

```
plugins/
  i18n/
    index.ts                 # ~25 lines.
    types.ts                 # Locale, TranslationMap.
    state.ts                 # Current locale, loaded translations.
    api.ts                   # t(), setLocale(), getLocale().
    __tests__/
      api.test.ts
```

```typescript
// plugins/i18n/api.ts
import type { I18nState } from './types';

type I18nCtx = {
  config: { defaultLocale: string };
  state: I18nState;
};

export const createI18nApi = (ctx: I18nCtx) => ({
  t: (key: string, params?: Record<string, string>) => {
    const template = ctx.state.translations[ctx.state.currentLocale]?.[key] ?? key;
    if (!params) return template;
    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(`{{${k}}}`, v),
      template,
    );
  },
  setLocale: (locale: string) => { ctx.state.currentLocale = locale; },
  getLocale: () => ctx.state.currentLocale,
});
```

### 3.7 App Plugins

Full features: auth, payments, notifications, analytics. The richest plugins — typically use config, state, API, events, hooks, dependencies, and lifecycle methods.

**Tier: Standard (auth) or Complex (payments).**

Auth:

```
plugins/
  auth/
    index.ts                 # ~35 lines. Events + depends + hooks.
    types.ts                 # User, Session, AuthConfig, AuthState.
    state.ts                 # Current user, session token.
    api.ts                   # login(), logout(), getUser(), isAuthenticated().
    handlers.ts              # Token refresh, session expiry handlers.
    __tests__/
      state.test.ts
      api.test.ts
      handlers.test.ts
```

```typescript
// plugins/auth/index.ts
import { createPlugin } from '../../config';
import { httpPlugin } from '../http';
import { createAuthState } from './state';
import { createAuthApi } from './api';
import { handleSessionExpiry } from './handlers';
import type { AuthEvents } from './types';

export const authPlugin = createPlugin('auth', {
  depends: [httpPlugin],
  events: register => register.map<AuthEvents>({
    'auth:login':   'User authenticated',
    'auth:logout':  'User signed out',
    'auth:expired': 'Session expired',
  }),
  config: {
    sessionTimeout: 3600,
    loginPath: '/login',
    refreshEnabled: true,
  },
  createState: createAuthState,
  api: createAuthApi,
  hooks: (ctx) => ({
    'http:request': handleSessionExpiry(ctx),
  }),
  onStop: async () => {
    // Clear refresh timers
  },
});
```

Payments (complex):

```
plugins/
  payments/
    index.ts                 # ~30 lines.
    types.ts                 # Payment, Invoice, Provider.
    state.ts                 # Active provider, transaction log.
    api.ts                   # charge(), refund(), subscribe().
    providers/
      index.ts               # Provider registry.
      stripe.ts              # Stripe adapter.
      paypal.ts              # PayPal adapter.
      types.ts               # Provider interface.
    webhooks/
      handler.ts             # Webhook verification + dispatch.
      events.ts              # Webhook event type map.
    __tests__/
      api.test.ts
      providers/
        stripe.test.ts
        paypal.test.ts
      webhooks/
        handler.test.ts
```

---

## 4. Testing Layout

### Two Patterns

| Pattern | When |
|---------|------|
| Adjacent `.test.ts` file | Nano and micro plugins |
| Colocated `__tests__/` directory | Standard, complex, and very complex plugins |

```
# Nano/Micro
plugins/
  env.ts
  env.test.ts

# Standard/Complex
plugins/
  router/
    api.ts
    state.ts
    __tests__/
      api.test.ts
      state.test.ts
      router.test.ts        # Integration test
```

### Test File Naming

| Source | Test |
|-------|------|
| `api.ts` | `__tests__/api.test.ts` |
| `state.ts` | `__tests__/state.test.ts` |
| `handlers.ts` | `__tests__/handlers.test.ts` |
| `counter.ts` (nano/micro) | `counter.test.ts` |
| Plugin integration | `__tests__/<plugin-name>.test.ts` |

### Unit Testing Domain Files

Domain functions are pure — they accept a context-shaped object and return values. They can be unit tested without the kernel by defining a domain context type in `types.ts`.

#### Domain Context Types and Typed Emit

When domain factories (e.g. `createRouterApi`) are extracted into separate files, they need a typed context parameter. The emit function on this context should use **overloaded call signatures** — one per event — scoped to the plugin's own events:

```typescript
// plugins/router/types.ts
export type RouterEvents = {
  'router:navigate': { from: string; to: string };
  'router:not-found': { path: string };
};

export type RouterCtx = {
  config: RouterConfig;
  state: RouterState;
  emit: {
    (name: 'router:navigate', payload: RouterEvents['router:navigate']): void;
    (name: 'router:not-found', payload: RouterEvents['router:not-found']): void;
  };
};
```

This pattern provides:
- **Compile-time safety** — wrong event names and payloads are caught in domain code
- **Single source of truth** — event payload types defined once in `RouterEvents`, referenced by overload signatures and `register.map<>()` calls
- **Test compatibility** — `vi.fn()`, `() => {}`, and `(name: string, payload: unknown) => { ... }` are all assignable to overloaded call signatures
- **Kernel compatibility** — the kernel's generic `EmitFunction<MergedEvents>` is assignable to concrete overloads (TypeScript instantiates the generic per-overload)

**Why overloads, not a generic?** A generic domain emit `<K extends keyof RouterEvents>(name: K, payload: RouterEvents[K]) => void` fails TypeScript's assignability check against the kernel's `EmitFunction<MergedEvents>`. The kernel's merged events include global events (e.g., `app:ready`), and TypeScript cannot prove that `RouterEvents[K]` is assignable to `(GlobalEvents & RouterEvents)[K]` for generic K. Concrete overloads avoid this — TypeScript instantiates the kernel's generic with each specific event name and checks compatibility directly.

The `index.ts` wiring harness uses `register.map<RouterEvents>()` to bulk-register from the type map, and an inline lambda to preserve event inference:

```typescript
// plugins/router/index.ts
import type { RouterEvents } from './types';

export const routerPlugin = createPlugin('router', {
  events: register => register.map<RouterEvents>({
    'router:navigate': 'Route changed',
    'router:not-found': 'Route not found',
  }),
  api: ctx => createRouterApi(ctx),  // inline lambda — required for event inference
  // ...
});
```

**Note:** The `api` field must use an inline lambda (`ctx => createRouterApi(ctx)`) rather than a direct function reference (`api: createRouterApi`). A direct reference prevents TypeScript from inferring the plugin's events, causing the context to receive `EmptyPluginEventMap` instead of the declared events.

**Anti-pattern:** Do not use `(...args: any[]) => void` or `(name: string, payload: unknown) => void` for domain context emit. These lose type safety — wrong event names and payloads compile without errors.

#### Mock Contexts in Unit Tests

Domain factories can be unit tested with mock contexts — no kernel required:

```typescript
// plugins/router/__tests__/api.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createRouterApi } from '../api';
import type { RouterCtx } from '../types';

describe('createRouterApi', () => {
  it('navigates to path and updates state', () => {
    const ctx: RouterCtx = {
      config: { basePath: '/', notFoundPath: '/404' },
      state: { currentPath: '/', history: [], guards: [], initialized: false },
      emit: vi.fn(),
    };

    const api = createRouterApi(ctx);
    api.navigate('/about');

    expect(ctx.state.currentPath).toBe('/about');
    expect(ctx.emit).toHaveBeenCalledWith('router:navigate', {
      from: '/', to: '/about',
    });
  });
});
```

Integration tests use `createApp` to verify the full plugin wiring.

---

## 5. File Content Contracts

### index.ts

| MUST | MUST NOT |
|------|----------|
| Import `createPlugin` from framework config | Contain domain logic (> 5 lines) |
| Import domain functions from sibling files | Define types (put in types.ts) |
| Wire spec fields to imported functions | Import from node_modules directly |
| Export the plugin instance | Contain helper functions |
| Stay under ~50 lines | |

**Event registration:** Standard+ plugins with a separate `XxxEvents` type in `types.ts` should use `register.map<XxxEvents>(descriptions?)` to bulk-register all events from the type map. This eliminates per-event `register<Events["name"]>()` repetition. Nano/micro plugins with inline event types should use individual `register<T>()` calls. See [14-EVENT-REGISTRATION §8.4](./14-EVENT-REGISTRATION.md).

### types.ts

| MUST | MUST NOT |
|------|----------|
| Export config, state, API type definitions | Export runtime values |
| Use `import type` for all imports | Contain function implementations |
| Define types shared across 2+ domain files | Duplicate types from the kernel |

Only create `types.ts` when types are shared across 2+ files. If only `index.ts` uses them, inline them.

### state.ts

| MUST | MUST NOT |
|------|----------|
| Export a `create<Name>State` factory | Access anything beyond `{ global, config }` |
| Accept MinimalContext-shaped argument | Call `require`, `has`, or `emit` |
| Return the initial state object | Perform side effects |

### api.ts

| MUST | MUST NOT |
|------|----------|
| Export a `create<Name>Api` factory | Perform initialization (use onInit) |
| Accept PluginContext-shaped argument | Start servers / open connections (use onStart) |
| Return the public API object | Directly mutate external state |

### handlers.ts

| MUST | MUST NOT |
|------|----------|
| Export named handler functions or factories | Call `createPlugin` |
| Accept context or relevant parameters | Contain wiring logic |
| Handle a single event concern per function | Mix multiple event domains |

---

## 6. Naming Conventions

### Plugin Instance

- Export name: `<domainName>Plugin` (camelCase + Plugin suffix)
- Plugin name string (first arg): camelCase, no suffix

```typescript
export const routerPlugin = createPlugin('router', { ... });
export const authPlugin = createPlugin('auth', { ... });
export const templateEnginePlugin = createPlugin('templateEngine', { ... });
```

### Factory Functions

- State: `create<Name>State` — `createRouterState`, `createAuthState`
- API: `create<Name>Api` — `createRouterApi`, `createAuthApi`
- Handlers: `handle<EventDomain>` — `handleRouteNotFound`, `handleSessionExpiry`

### Events

Convention: `pluginName:action`

```typescript
'auth:login'           // Plugin + action
'auth:logout'
'router:navigate'
'http:request'
'renderer:complete'
```

### Files and Directories

- All lowercase, hyphenated for multi-word: `spa-router/`, `template-engine/`
- Test files match source: `api.test.ts`, `state.test.ts`

---

## 7. Anti-Patterns

| Anti-Pattern | Why It's Wrong | Fix |
|--------------|---------------|-----|
| **God index.ts** — 200+ lines of business logic in the plugin file | Defeats the wiring harness principle. Hard to navigate, hard to test. | Extract domain logic to `api.ts`, `state.ts`, `handlers.ts`. |
| **Premature directory** — 5-file directory for a 20-line plugin | Unnecessary structure. Every empty file is noise. | Use nano or micro tier. Promote when complexity demands it. |
| **types.ts for one file** — types.ts when only index.ts uses the types | Extra indirection for no benefit. | Inline types until a second file needs them. |
| **Barrel file chains** — `providers/index.ts` re-exporting from `google/index.ts` | Deep re-export chains are hard to follow. | One level of barrel maximum. |
| **Domain logic in handlers.ts** — complex business rules inside event handlers | Handlers should be thin dispatchers. | Delegate to domain functions; handlers call them. |
| **Cross-plugin internal imports** — Plugin A importing from Plugin B's `state.ts` | Breaks encapsulation. Plugins communicate through `ctx.require()`. | Only import plugin instances for `depends`. Access APIs through `ctx.require()`. |

---

## 8. Decision Flowchart

```
How many spec fields does your plugin use?
│
├─ 1-2 fields, < 30 lines total?
│  └─ NANO — single .ts file
│
├─ 2-3 fields, < 80 lines total?
│  └─ MICRO — single .ts file
│
├─ 3+ fields, or any domain function > 20 lines?
│  │
│  ├─ Does it have sub-domains (providers, strategies, transforms)?
│  │  │
│  │  ├─ Multiple coordinating modules with own state/API?
│  │  │  └─ VERY COMPLEX — module directories
│  │  │
│  │  └─ Single sub-domain concern?
│  │     └─ COMPLEX — directory with subdirectories
│  │
│  └─ No sub-domains?
│     └─ STANDARD — directory with domain files
│
└─ Still unsure?
   └─ Start with MICRO. Promote when the file outgrows it.
   └─ Before going VERY COMPLEX, ask: should these be separate plugins?
```

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Plugin patterns and wiring harness rule: [12-PLUGIN-PATTERNS](./12-PLUGIN-PATTERNS.md)
- Context tiers (MinimalContext, PluginContext, TeardownContext): [08-CONTEXT](./08-CONTEXT.md)
- Anti-patterns and invariants: [11-INVARIANTS](./11-INVARIANTS.md)
- Event registration pattern: [14-EVENT-REGISTRATION](./14-EVENT-REGISTRATION.md)
