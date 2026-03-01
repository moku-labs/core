# Moku Core

**Micro-kernel plugin framework for TypeScript. Three layers of isolation. Built for LLM-scale development.**

One runtime export. Bundle < 5KB. Zero dependencies. The type system does the heavy lifting.

```
bun add @moku-labs/core
```

---

## The Problem

LLMs are writing more of our code. But they generate spaghetti — they invent structure, mix concerns, bypass APIs, and scatter logic across files. The bigger the codebase, the worse it gets.

Every framework tries to solve scaling with conventions. Conventions don't work for LLMs. LLMs approximate conventions. They hallucinate when the API surface is too large to hold in context.

**You need constraints, not conventions.**

## The Solution

Moku enforces a 3-layer architecture where each layer physically constrains the layer above it. LLM-generated code is confined to plugins, integrated only through typed public APIs, and cannot touch the core.

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Consumer / LLM-generated code                 │
│  Can only: configure, compose plugins, use typed APIs   │
│  Cannot: modify the framework, bypass plugin boundaries │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Framework                                     │
│  Defines: config shape, event contract, default plugins │
│  Cannot: modify the kernel                              │
├─────────────────────────────────────────────────────────┤
│  Layer 1: @moku-labs/core                               │
│  One function. Zero domain knowledge. Pure machinery.   │
└─────────────────────────────────────────────────────────┘
```

**Slop doesn't spread.** An LLM writing a plugin cannot break the framework. An LLM writing consumer code cannot break a plugin. The architecture is the guardrail.

## Why It Works for LLMs

| Problem | How Moku solves it |
|---|---|
| LLMs hallucinate framework structure | Entire API learnable in ~1000 tokens |
| Code drifts across files and modules | Each feature is one plugin, one boundary |
| Generated code bypasses intended APIs | `emit` is strictly typed, no escape hatch |
| Quality degrades at scale | Frozen configs, phantom types, compile-time enforcement |
| Adding features breaks existing code | Horizontal scaling — add plugins, don't modify |

---

## Quick Start

### 1. Define your framework (Layer 2)

```typescript
// my-framework/config.ts
import { createCoreConfig } from '@moku-labs/core';

type Config = { siteName: string; mode: 'development' | 'production' };
type Events = {
  'page:render': { path: string; html: string };
  'router:navigate': { from: string; to: string };
};

export const coreConfig = createCoreConfig<Config, Events>('my-site', {
  config: { siteName: 'Untitled', mode: 'development' },
});
export const { createPlugin, createCore } = coreConfig;
```

### 2. Write plugins

```typescript
// my-framework/plugins/router.ts
import { createPlugin } from '../config';

export const routerPlugin = createPlugin('router', {
  config: { basePath: '/' },
  createState: () => ({ currentPath: '/', history: [] as string[] }),
  api: ctx => ({
    navigate: (path: string) => {
      const from = ctx.state.currentPath;
      ctx.state.currentPath = path;
      ctx.emit('router:navigate', { from, to: path });
    },
    current: () => ctx.state.currentPath,
  }),
});
```

### 3. Wire the framework

```typescript
// my-framework/index.ts
import { coreConfig, createCore } from './config';
import { routerPlugin } from './plugins/router';

const framework = createCore(coreConfig, {
  plugins: [routerPlugin],
});
export const { createApp, createPlugin } = framework;
```

### 4. Ship the product (Layer 3)

```typescript
// my-app/main.ts
import { createApp } from 'my-framework';

const app = await createApp({
  plugins: [blogPlugin],
  config: { siteName: 'My Blog', mode: 'production' },
  pluginConfigs: { router: { basePath: '/blog' } },
});

await app.start();
app.router.navigate('/about');  // fully typed
app.blog.listPosts();           // fully typed
await app.stop();
```

**That's the entire API.** `createCoreConfig` → `createCore` → `createApp`. Three functions, three layers.

---

## How It Scales

Every feature is a plugin. Plugins are isolated by design:

- **Own config** — declared in the plugin, resolved by the kernel
- **Own state** — mutable escape hatch, invisible to other plugins
- **Own API** — mounted on the app object, fully typed
- **Own events** — declared via register callback, strictly typed payloads
- **Explicit dependencies** — `depends: [otherPlugin]`, validated at init

Adding a feature = adding a plugin to the array. No framework modifications. No global state pollution. No import spaghetti.

```typescript
// Team A ships auth
const authPlugin = createPlugin('auth', {
  events: register => ({
    'auth:login': register<{ userId: string }>('User logged in'),
  }),
  api: ctx => ({
    login: (id: string) => ctx.emit('auth:login', { userId: id }),
  }),
});

// Team B ships analytics, depends on auth events
const analyticsPlugin = createPlugin('analytics', {
  depends: [authPlugin],
  createState: () => ({ events: [] as string[] }),
  hooks: ctx => ({
    'auth:login': ({ userId }) => { ctx.state.events.push(`login:${userId}`); },
  }),
});
```

Teams work independently. Plugins compose through typed events. The kernel enforces the boundaries.

---

## Quality Enforcement

Moku is designed for a world where LLMs write plugins and CI enforces quality. The framework provides structural guarantees, and the toolchain catches everything else.

### Compile-time guarantees

- **Strict emit** — only known event names compile. Wrong payloads are type errors. No `any`, no escape hatch.
- **Phantom types** — plugin APIs, configs, and events flow through the type system without runtime cost.
- **Required configs** — if a plugin needs config and you don't provide it, TypeScript tells you.
- **Context tiers** — `createState` can't call `emit` (other plugins don't exist yet). `onStop` can't access other plugins (they may already be stopped). The type system prevents temporal bugs.

### Runtime guarantees

- **Frozen configs** — `Object.freeze` on all configs and the app object. No accidental mutation.
- **No duplicate plugins** — caught at init with an actionable error message.
- **Dependency validation** — dependencies must appear before dependents. No implicit reordering.
- **Sequential execution** — lifecycle phases run one plugin at a time. No race conditions.
- **Single start/stop** — calling `start()` twice throws. Calling `stop()` before `start()` throws.

### Recommended toolchain

The kernel provides structure. Pair it with:

- **[Biome](https://biomejs.dev/)** — fast formatting + linting, zero-config
- **[ESLint](https://eslint.org/)** — JSDoc enforcement, code quality rules
- **[Vitest](https://vitest.dev/)** — test coverage thresholds per plugin
- **TypeScript strict mode** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`

LLMs generate the code. The toolchain gates it. The kernel contains it.

---

## The Kernel

Six responsibilities. Nothing else.

| # | Responsibility | Mechanism |
|---|---|---|
| 1 | Collect plugins | Ordered array, framework defaults + consumer extras |
| 2 | Validate | Reserved names, duplicates, dependency order |
| 3 | Resolve config | Shallow merge: plugin defaults → framework → consumer |
| 4 | Lifecycle | 3 phases: `onInit` → `onStart` → `onStop` (reverse) |
| 5 | Events | `emit` dispatches to typed hooks. Fire-and-forget. |
| 6 | Freeze | `Object.freeze` on app and configs. State stays mutable. |

### Plugin spec shape

```typescript
createPlugin('name', {
  config:      { /* defaults */ },
  events:      register => ({ 'name:event': register<Payload>('description') }),
  depends:     [otherPlugin],
  createState: ctx => ({ /* mutable state */ }),
  api:         ctx => ({ /* public methods, mounted on app.name */ }),
  hooks:       ctx => ({ 'event:name': handler }),
  onInit:      async ctx => { /* all plugins exist */ },
  onStart:     async ctx => { /* app is running */ },
  onStop:      async ctx => { /* teardown, reverse order */ },
});
```

Every field is optional. A plugin with only `api` works. A plugin with only `hooks` works.

---

## Design Principles

**Brutal simplicity.** No classes. No decorators. No dependency injection. No inheritance. Every function is a pure factory: input → output.

**Types over runtime.** Most of the codebase is type definitions and JSDoc. The type system provides autocomplete, compile-time validation, and documentation simultaneously.

**Explicit over implicit.** Plugin order is the array order. No topological sort. No magic reordering. If B depends on A, A comes first.

**Functional composition.** Plugins are plain objects. Dependencies use `ctx.require(plugin)`. APIs are closures over state. No `this`, no prototypes.

**Minimum description length.** Define parts (plugins), compose them (createApp), let them communicate (events + APIs), manage lifecycle (init/start/stop). Nothing else.

---

## API Reference

### Exports

```typescript
// Runtime
import { createCoreConfig } from '@moku-labs/core';

// Type utilities for plugin authors
import type { PluginCtx, EmitFn } from '@moku-labs/core';
```

### createCoreConfig\<Config, Events\>(id, options)

Creates a bound factory chain for a framework. Returns `{ createPlugin, createCore }`, both locked to `Config` and `Events`.

### createCore(coreConfig, options)

Captures framework defaults: plugins, plugin configs, `onReady`, `onError`. Returns `{ createApp, createPlugin }`.

### createPlugin(name, spec)

Creates a plugin instance. Zero explicit generics — everything inferred from the spec. Returns `PluginInstance` with phantom types.

### createApp(options?)

Merges framework defaults with consumer options. Validates, resolves config, runs `onInit`. Returns `Promise<App>` — a frozen object with plugin APIs mounted as properties.

### App

```typescript
await app.start();            // onStart (forward order)
await app.stop();             // onStop (reverse order)
app.emit('event', payload);   // strictly typed, fire-and-forget
app.require(plugin);          // returns typed API or throws
app.has('name');              // boolean, never throws
app.pluginName.method();      // fully typed API access
```

---

## Specification

The full specification lives in [`specification/`](specification/):

| Document | Covers |
|---|---|
| [01 Architecture](specification/01-ARCHITECTURE.md) | Three-layer model, design philosophy, LLM motivation |
| [02 Core API](specification/02-CORE-API.md) | All function signatures |
| [03 Plugin System](specification/03-PLUGIN-SYSTEM.md) | PluginSpec, PluginInstance, depends |
| [04 Factory Chain](specification/04-FACTORY-CHAIN.md) | 3-step factory chain: why and how |
| [05 Config System](specification/05-CONFIG-SYSTEM.md) | Config resolution, shallow merge rules |
| [06 Lifecycle](specification/06-LIFECYCLE.md) | init → start → stop phases |
| [07 Communication](specification/07-COMMUNICATION.md) | emit, hooks, event dispatch |
| [08 Context](specification/08-CONTEXT.md) | Three context tiers |
| [09 Type System](specification/09-TYPE-SYSTEM.md) | Phantom types, type flow, BuildPluginApis |
| [11 Invariants](specification/11-INVARIANTS.md) | Guarantees, error format, anti-patterns |
| [12 Plugin Patterns](specification/12-PLUGIN-PATTERNS.md) | File structure conventions |
| [13 Kernel Pseudocode](specification/13-KERNEL-PSEUDOCODE.md) | Reference implementation with rationale |
| [14 Event Registration](specification/14-EVENT-REGISTRATION.md) | Register callback pattern |
| [15 Plugin Structure](specification/15-PLUGIN-STRUCTURE.md) | Plugin file organization |

---

## Status

Alpha. API is stabilizing. Not yet published to npm.

## License

MIT
