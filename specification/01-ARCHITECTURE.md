# 01 - Architecture

**Domain:** Core philosophy, three-layer model, design principles, 3-step factory chain

---

## 1. What Moku Is

Moku is a universal, type-safe, functional plugin framework for TypeScript.

Every application -- site, CLI, game, build tool, bot -- is a kernel plus plugins. Moku provides the kernel. You provide the plugins.

The kernel does 5 things:

1. Collects and validates plugins (no duplicates, dependency order checked)
2. Resolves config (shallow merge, no magic)
3. Runs 3 lifecycle phases in deterministic order (init and start forward, stop reverse)
4. Dispatches events (typed for known events, untyped fallback for ad-hoc)
5. Freezes everything when done

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
+------------------------------------------------------------------+
|                    Layer 3: Consumer Product                       |
|                                                                   |
|  import { createApp, createPlugin } from 'my-framework';          |
|  const app = await createApp({                                    |
|    plugins: [myPlugin],                                           |
|    siteName: 'My Blog',                                           |
|    myPlugin: { postsPerPage: 5 },                                 |
|  });                                                              |
|                                                                   |
|  Consumers use what the framework gives them.                     |
|  They cannot change the core. They cannot bypass plugins.         |
|  They configure. They compose. They ship.                         |
+------------------------------------------------------------------+
|                    Layer 2: Framework / Tool                       |
|                                                                   |
|  Step 1 (config.ts):                                              |
|    import { createCoreConfig } from 'moku_core';                  |
|    const coreConfig = createCoreConfig<Config, Events>('id', {    |
|      config: { ...defaults },                                     |
|    });                                                             |
|    export const { createPlugin, createCore } = coreConfig;        |
|                                                                   |
|  Step 2 (index.ts):                                               |
|    const framework = createCore(coreConfig, {                     |
|      plugins: [routerPlugin, rendererPlugin],                     |
|    });                                                             |
|    export const { createApp, createPlugin } = framework;          |
|                                                                   |
|  Framework authors define:                                        |
|    - Config shape (what every app of this kind needs)             |
|    - Events contract (what events exist and their payload types)  |
|    - Default plugins (what ships built-in)                        |
+------------------------------------------------------------------+
|                    Layer 1: moku_core                              |
|                                                                   |
|  export { createCoreConfig }                                      |
|                                                                   |
|  One function. Returns bound factory functions.                   |
|  Zero domain knowledge. Zero opinions.                            |
|  Pure machinery: lifecycle, plugin registry, event bus,           |
|  config resolution, type inference.                               |
+------------------------------------------------------------------+
```

**The key insight: each layer constrains the layer above it.**

- `moku_core` constrains what a framework CAN define (lifecycle shape, plugin spec shape, config resolution rules).
- The framework constrains what the consumer CAN do (which plugins exist, what config is available, what hooks fire).
- The consumer works within those constraints. They can't escape them.

This is not a limitation. This is the feature. When an LLM generates code at Layer 3, it **cannot** break Layers 1 or 2. The architecture is a guardrail.

---

## 4. Why Three Steps (Not Two)

The 3-step factory chain (`createCoreConfig` -> `createCore` -> `createApp`) solves a circular dependency problem that arises in real framework projects.

**The problem:** Plugin files need to import `createPlugin` that is bound to the framework's types (Config, Events). But `createPlugin` is a product of the framework setup. If the framework setup and plugin definitions live in the same step, you get a circular import.

**The solution:** Split framework setup into two files:

1. **config.ts** -- calls `createCoreConfig`, defines types, exports `createPlugin` and `createCore`
2. **Plugin files** -- import `createPlugin` from config.ts (no circular dependency)
3. **index.ts** -- imports plugins and calls `createCore`, exports `createApp`

```
config.ts ----exports----> createPlugin, createCore
    |                           |
    v                           v
plugins/*.ts <--imports-- createPlugin     index.ts <--imports-- plugins + createCore
                                                |
                                                v
                                           exports createApp to consumers
```

Each step captures context in closures and progressively binds types. See [04-FACTORY-CHAIN](./04-FACTORY-CHAIN.md) for the full explanation.

---

## 5. Why Three Layers Matter for LLMs

### 5.1 The Problem with Current LLM Code Generation

LLMs generate code by pattern-matching against training data. When the patterns are ambiguous -- when there are multiple ways to structure an app, when the framework allows escape hatches, when "best practices" conflict -- the LLM makes mistakes.

The failure mode is always the same: **the LLM invents structure instead of following it.**

- It creates new files in wrong places.
- It rewrites framework internals when it should use an API.
- It mixes domain logic with framework plumbing.
- It doesn't know where code belongs, so it puts it everywhere.

### 5.2 How Three Layers Fix This

Each layer has a single, unambiguous role:

| Layer | LLM's job | LLM CANNOT do |
|---|---|---|
| Layer 1 (core) | Never touched by LLM | Change the kernel |
| Layer 2 (framework) | Define plugins + defaults | Change the kernel, bypass plugin spec |
| Layer 3 (consumer) | Configure + compose | Change the framework, invent new primitives |

**The LLM always knows where it is.** If it's generating consumer code, it imports from the framework and uses `createApp`. If it's generating a plugin, it uses `createPlugin` and follows the spec shape. There is no middle ground. No escape hatches. No "but what if I just..." temptation.

### 5.3 The Micro-Framework Advantage

Moku Core is **micro** in a precise sense: the entire API is learnable from a single system prompt. An LLM can hold the full specification in its context window. There are no hidden behaviors, no implicit conventions, no "you should also know about X."

Compare this to Next.js (file-based routing, server components, API routes, middleware, config files, special directories) or Django (ORM, views, templates, middleware, settings, management commands, signals). These frameworks have large implicit surfaces that LLMs approximate but never fully internalize.

Moku Core has:

- **1 function at Layer 1:** `createCoreConfig`
- **2 functions at Layer 2:** `createCore` + `createPlugin` (from config.ts)
- **1 function at Layer 3:** `createApp` (single flat object, one step)

An LLM can learn this in under 1000 tokens.

---

## 6. Design Philosophy

### 6.1 Brutal Simplicity

There are no classes to extend. No decorators to learn. No abstract base types to implement. No dependency injection containers to configure. No service locators. No middleware chains with magic signatures.

Every function is a pure factory. Input -> output. No side effects until `app.start()`.

**Why this matters for AI agents:** A small, regular API surface means fewer tokens to learn, fewer patterns to match, and drastically lower probability of hallucinating incorrect usage. An AI can hold the entire framework in working memory.

### 6.2 Functional Style

Moku is functional in the sense that matters:

- **No class hierarchies.** Plugins are plain objects with optional function fields.
- **No inheritance.** Composition only. A plugin that depends on another calls `ctx.require()`.
- **No mutation of framework state.** The `app` object is frozen. Plugin APIs are closures over their own state.
- **Factory functions over constructors.** `createPlugin()` returns a plain object. It does not `new` anything.

This is not "functional programming" as in monads and persistent data structures. It is functional in the pragmatic TypeScript sense: functions that take data and return data, closures that capture state, and composition over inheritance.

### 6.3 Type-Driven Design

The framework is designed **types-first.** The runtime is trivial (under 200 lines). The type system does the hard work:

- Plugin names become literal string types that flow through the entire system.
- Plugin config types are enforced at `createApp()` -- if a plugin requires config, you *must* provide it.
- Plugin API types are merged into the `App` type -- `app.router.navigate()` is fully typed without any manual type annotation by the consumer.
- The type system acts as documentation, IDE autocomplete, and compile-time validation simultaneously.

**Why this matters for AI agents:** Types are machine-readable contracts. An AI can inspect the type of `app` and understand exactly what methods are available, what arguments they accept, and what they return.

### 6.4 Plugins Over Primitives

Moku provides `createPlugin` as the single primitive for extending functionality. Plugins communicate intent through their spec shape:

- **defaultConfig** -- what config this plugin accepts
- **api** -- what public methods this plugin exposes
- **hooks** -- what events this plugin listens to
- **depends** -- what other plugins this plugin requires

The spec shape is the convention. The runtime treats all plugins uniformly.

### 6.5 Order is Explicit

Plugin order in the `plugins` array determines:

- **Initialization order:** A initializes before B, B before C.
- **Hook execution order:** When a hook fires, handlers execute in plugin registration order.
- **Teardown order:** Reverse. C stops before B, B before A.

There is no magic dependency resolution. No topological sort. No `@before('router')` annotations. If B depends on A, A must come first in the array. This is simple, predictable, and debuggable.

---

## 7. The Universal Structural Pattern

The insight comes from observing Bevy (Rust game engine), but generalizing beyond games:

> **Every application is a kernel plus plugins.**

This is not a metaphor. It is a literal structural claim:

- A **website** is a kernel (HTTP server + renderer) plus plugins (router, auth, i18n, analytics).
- A **CLI tool** is a kernel (argument parser + command runner) plus plugins (commands, env loader, config manager).
- A **game** is a kernel (game loop + renderer) plus plugins (ECS, physics, input, audio, AI).
- A **build system** is a kernel (task runner) plus plugins (TypeScript compiler, bundler, minifier, linter).
- A **desktop app** is a kernel (window manager + event loop) plus plugins (menus, panels, file system access).
- An **AI agent system** is a kernel (agent loop + memory) plus plugins (tools, prompts, memory stores, output formatters).

In every case, the structural skeleton is identical:

```
const app = await createApp({
  plugins: [Plugin1, Plugin2, ...],
  ...configOverrides,
  plugin1: { ... },
  plugin2: { ... },
});

app.plugin1.doSomething()      // typed
app.plugin2.doSomethingElse()  // typed
await app.start()
await app.stop()
```

The **only** thing that changes between domains is the content of the plugins and the hooks they subscribe to. The framework itself is domain-agnostic.

---

## 8. Information-Theoretic Argument

From the information-theoretic perspective: Moku's API is the **minimum description length** for "compose functionality from parts with lifecycle, config, and communication."

Any framework that solves this problem must have:

1. A way to define parts (plugins).
2. A way to compose them (app creation with config).
3. A way for parts to communicate (events + direct API access).
4. A lifecycle (initialization -> running -> teardown).

Moku provides exactly these four things and nothing else. Any additional feature is a domain concern that belongs in a plugin.

---

## 9. What the Framework Author Decides (Layer 2)

1. **Config** -- what global config every app of this kind needs (type + defaults)
2. **Events** -- what events exist and their payload types (framework + known plugin events)
3. **Default plugins** -- what ships built-in (Router, Renderer, SEO for a site builder)
4. **Plugin configs** -- default config overrides for built-in plugins

### What the Framework Author Does NOT Decide

- How the kernel works (that's Layer 1)
- How consumers compose their app (that's Layer 3)
- What custom plugins consumers write themselves (that's Layer 3)

### Why Default Plugins?

A site builder without a router doesn't make sense. A game engine without a game loop doesn't make sense. A CLI toolkit without a command parser doesn't make sense.

Default plugins are the plugins that **define the framework's identity.** Without them, the framework is just `moku_core` with a config type. Default plugins are what turn a generic kernel into a specific tool.

Consumers cannot remove default plugins. They can configure them.

---

## 10. Consumer Mental Model (Layer 3)

1. Import `createApp` and optionally `createPlugin` from the framework.
2. Create custom plugins if needed (using the framework's `createPlugin`).
3. Call `createApp` with a single flat object: extra plugins, config overrides, plugin configs.
4. TypeScript tells you what's required and what's optional.
5. Use `app.pluginName.method()` -- everything is typed.

The consumer never sees `createCoreConfig`. Never sees `moku_core`. Never thinks about lifecycle phases or plugin flattening. They declare, configure, and compose.

```typescript
import { createApp, createPlugin } from 'my-framework';

const myPlugin = createPlugin('analytics', {
  defaultConfig: { trackingId: '' },
  api: (ctx) => ({
    track: (event: string) => console.log(`[${ctx.config.trackingId}] ${event}`),
  }),
});

const app = await createApp({
  plugins: [myPlugin],
  siteName: 'My Blog',
  mode: 'production',
  analytics: { trackingId: 'G-XXXXX' },
});

await app.start();
app.analytics.track('page_view');  // typed
app.router.navigate('/about');     // typed (framework default)
await app.stop();
```

---

## Cross-References

- Core API details: [02-CORE-API](./02-CORE-API.md)
- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Factory chain: [04-FACTORY-CHAIN](./04-FACTORY-CHAIN.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
