# 01 - Architecture

**Domain:** Core philosophy, three-layer model, design principles
**Sources:** SPEC_INITIAL (v0.1), SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1)

---

## 1. What Moku Is

Moku is a universal, type-safe, functional plugin framework for TypeScript.

Every application -- site, CLI, game, build tool, bot -- is a kernel plus plugins. Moku provides the kernel. You provide the plugins.

The kernel does 6 things:

1. Collects and flattens plugins into an ordered list
2. Validates names (no duplicates) and dependencies
3. Resolves config (shallow merge, no magic)
4. Runs lifecycle in deterministic order
5. Dispatches events (typed bus + untyped/optionally-typed signals)
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
+--------------------------------------------------------------+
|                    Layer 3: Consumer Product                   |
|                                                               |
|  import { createConfig, createApp } from 'my-framework';      |
|  const config = createConfig({ ... }, [MyPlugin]);            |
|  const app = await createApp(config, { ... });                |
|                                                               |
|  Consumers use what the framework gives them.                 |
|  They cannot change the core. They cannot bypass plugins.     |
|  They configure. They compose. They ship.                     |
+---------------------------------------------------------------+
|                    Layer 2: Framework / Tool                   |
|                                                               |
|  import { createCore } from 'moku_core';                      |
|  const { createApp, createConfig, createPlugin, ... }         |
|    = createCore(...)                                          |
|                                                               |
|  Framework authors define:                                    |
|    - Base config shape (what every app of this kind needs)    |
|    - Bus contract (what lifecycle events exist)               |
|    - Signal registry (what plugin signals are known)          |
|    - Default plugins (what ships built-in)                    |
|    - Available plugins (what consumers can opt into)          |
|                                                               |
|  Examples: site builder, game engine, CLI toolkit, bot SDK    |
+---------------------------------------------------------------+
|                    Layer 1: moku_core                          |
|                                                               |
|  export { createCore }                                        |
|                                                               |
|  One function. Returns all API functions.                     |
|  Zero domain knowledge. Zero opinions.                        |
|  Pure machinery: lifecycle, plugin registry, event bus,       |
|  config resolution, type inference.                           |
+---------------------------------------------------------------+
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

Compare this to Next.js (file-based routing, server components, API routes, middleware, config files, special directories) or Django (ORM, views, templates, middleware, settings, management commands, signals). These frameworks have large implicit surfaces that LLMs approximate but never fully internalize.

Moku Core has:

- **1 function at Layer 1:** `createCore`
- **6-7 functions at Layer 2:** returned by `createCore` (see [02-CORE-API](./02-CORE-API.md))
- **2 steps at Layer 3:** `createConfig` then `await createApp`

An LLM can learn this in under 1000 tokens.

---

## 5. Design Philosophy

### 5.1 Brutal Simplicity

There are no classes to extend. No decorators to learn. No abstract base types to implement. No dependency injection containers to configure. No service locators. No middleware chains with magic signatures.

Every function is a pure factory. Input -> output. No side effects until `app.start()`.

**Why this matters for AI agents:** A small, regular API surface means fewer tokens to learn, fewer patterns to match, and drastically lower probability of hallucinating incorrect usage. An AI can hold the entire framework in working memory.

### 5.2 Functional Style

Moku is functional in the sense that matters:

- **No class hierarchies.** Plugins are plain objects with optional function fields.
- **No inheritance.** Composition only. A plugin that depends on another calls `getPlugin()`.
- **No mutation of framework state.** The `app` object is frozen. Plugin APIs are closures over their own state.
- **Factory functions over constructors.** `createPlugin()` returns a plain object. It does not `new` anything.

This is not "functional programming" as in monads and persistent data structures. It is functional in the pragmatic TypeScript sense: functions that take data and return data, closures that capture state, and composition over inheritance.

### 5.3 Type-Driven Design

The framework is designed **types-first.** The runtime is trivial (under 200 lines). The type system does the hard work:

- Plugin names become literal string types that flow through the entire system.
- Plugin config types are enforced at `createApp()` -- if a plugin requires config, you *must* provide it.
- Plugin API types are merged into the `App` type -- `app.router.navigate()` is fully typed without any manual type annotation by the consumer.
- The type system acts as documentation, IDE autocomplete, and compile-time validation simultaneously.

**Why this matters for AI agents:** Types are machine-readable contracts. An AI can inspect the type of `app` and understand exactly what methods are available, what arguments they accept, and what they return.

### 5.4 Convention Over Restriction

Moku provides `createPlugin`, `createComponent`, and `createModule` not because they enforce hard boundaries, but because they communicate **intent:**

| Primitive | Intended role | Typical scope |
|---|---|---|
| Plugin | Core functionality, may have lifecycle hooks, API, state | Backend + frontend |
| Component | UI or client-side unit, mount/unmount semantics | Client-side |
| Module | Feature grouping, bundles plugins + components | Organizational |

These are **conventions, not constraints.** The runtime treats them uniformly.

### 5.5 Order is Explicit

Plugin order in `createConfig([A, B, C])` determines:

- **Initialization order:** A creates before B, B before C.
- **Hook execution order:** When a hook fires, handlers execute in plugin registration order.
- **Teardown order:** Reverse. C stops before B, B before A.

There is no magic dependency resolution. No topological sort. No `@before('router')` annotations. If B depends on A, A must come first in the array. This is simple, predictable, and debuggable.

---

## 6. The Universal Structural Pattern

The insight comes from observing Bevy (Rust game engine), but generalizing beyond games:

> **Every application is a kernel plus plugins.**

This is not a metaphor. It is a literal structural claim:

- A **website** is a kernel (HTTP server + renderer) plus plugins (router, auth, i18n, analytics).
- A **CLI tool** is a kernel (argument parser + command runner) plus plugins (commands, env loader, config manager).
- A **game** is a kernel (game loop + renderer) plus plugins (ECS, physics, input, audio, AI).
- A **build system** is a kernel (task runner) plus plugins (TypeScript compiler, bundler, minifier, linter).
- A **desktop app** is a kernel (window manager + event loop) plus plugins (menus, panels, file system access).
- An **AI agent system** is a kernel (agent loop + memory) plus plugins (tools, prompts, memory stores, output formatters).
- An **IoT hub** is a kernel (device manager + protocol handler) plus plugins (MQTT bridge, data storage, alerting).

In every case, the structural skeleton is identical:

```
createConfig(globalState, [Plugin1, Plugin2, ...])
     |
createApp(config, { plugin1: {...}, plugin2: {...} })
     |
app.plugin1.doSomething()
app.plugin2.doSomethingElse()
app.start() -> lifecycle -> app.stop()
```

The **only** thing that changes between domains is the content of the plugins and the hooks they subscribe to. The framework itself is domain-agnostic.

---

## 7. Information-Theoretic Argument

From the information-theoretic perspective: Moku's API is the **minimum description length** for "compose functionality from parts with lifecycle, config, and communication."

Any framework that solves this problem must have:

1. A way to define parts (plugins).
2. A way to compose them (config + app creation).
3. A way for parts to communicate (events/signals + direct API access).
4. A lifecycle (creation -> initialization -> running -> teardown).

Moku provides exactly these four things and nothing else. Any additional feature is a domain concern that belongs in a plugin.

---

## 8. What the Framework Author Decides (Layer 2)

1. **BaseConfig** -- what global config every app of this kind needs
2. **BusContract** -- what lifecycle events plugins can subscribe to with type safety
3. **SignalRegistry** -- what plugin-to-plugin signals are known (optional)
4. **Default plugins** -- what ships built-in (Router, Renderer, SEO for a site builder)
5. **Optional plugins** -- what consumers can add (Analytics, Auth, Blog)
6. **Lifecycle hooks** -- onBoot, onReady, onShutdown for framework-level concerns

### What the Framework Author Does NOT Decide

- How the kernel works (that's Layer 1)
- How consumers compose their app (that's Layer 3)
- What custom plugins consumers write themselves (that's Layer 3)

### Why Default Plugins?

A site builder without a router doesn't make sense. A game engine without a game loop doesn't make sense. A CLI toolkit without a command parser doesn't make sense.

Default plugins are the plugins that **define the framework's identity.** Without them, the framework is just `moku_core` with a config type. Default plugins are what turn a generic kernel into a specific tool.

Consumers cannot remove default plugins. They can configure them.

---

## 9. Consumer Mental Model (Layer 3)

1. Import `createConfig` and `createApp` from the framework.
2. Import or create plugins.
3. `createConfig` -- declare global overrides + extra plugins.
4. `await createApp` -- provide plugin configs. TypeScript tells you what's required.
5. Use `app.pluginName.method()` -- everything is typed.

The consumer never sees `createCore`. Never sees `moku_core`. Never thinks about lifecycle phases or plugin flattening. They declare, configure, and compose.

---

## Cross-References

- Core API details: [02-CORE-API](./02-CORE-API.md)
- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)

