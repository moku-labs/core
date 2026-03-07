# 11 - Invariants and Anti-Patterns

**Domain:** Guarantees, error messages, anti-patterns
**Architecture:** 3-step (createCoreConfig -> createCore -> createApp)

---

## Part 1: Invariants

These properties always hold. Breaking any of these is a kernel bug.

### 1.1 Reserved Names

**Plugin names cannot conflict with reserved app method names.** The reserved names are: `start`, `stop`, `emit`, `require`, `has`, `config`, `__proto__`, `constructor`, `prototype`.

```
TypeError: [moku-site] Plugin name "start" conflicts with a reserved app method.
  Choose a different plugin name.
```

### 1.2 Name Uniqueness

**Duplicate plugin names throw during init.**

```
TypeError: [moku-site] Duplicate plugin name: "router".
  Each plugin must have a unique name.
```

No silent overwrite. No merge. No "last wins." If you want to replace a plugin, remove the old one from your plugin list and add the new one.

### 1.3 Dependency Validation

If a plugin declares `depends: [loggerPlugin]`, init validates:

```
TypeError: [moku-site] Plugin "router" depends on "logger", but "logger" is not registered.
  Add "logger" to your plugin list before "router".

TypeError: [moku-site] Plugin "router" depends on "logger", but "logger" appears after "router".
  Move "logger" before "router" in your plugin list.
```

This is **validation only.** It does not change plugin order. It does not compute a topological sort. It checks that the order the consumer provided satisfies the declared constraints.

### 1.4 Config Completeness

If a plugin requires config (no `config`, non-void `C`), TypeScript rejects `createApp` without it. Config enforcement is compile-time only via the type system.

### 1.5 Lifecycle Order

Plugins execute lifecycle methods in array order. Always. Teardown in reverse. Always. No topological sort. No automatic reordering. No `@before` / `@after` annotations.

**3 phases:**

| Phase | Method | Direction | When |
|-------|--------|-----------|------|
| init | `onInit` | Forward (array order) | During `createApp` |
| start | `onStart` | Forward (array order) | During `app.start()` |
| stop | `onStop` | **Reverse** (array order) | During `app.stop()` |

**Ordering is the consumer's responsibility.** If plugin B depends on plugin A, put A before B. `depends` validates this but does not fix it.

### 1.6 Hook Execution Order

When an event fires (via `emit`), handlers execute in plugin registration order, sequentially. Each handler is awaited before the next. No parallelism.

### 1.7 Immutability

After `createApp` resolves:
- `app` is `Object.freeze()`'d
- Global config is `Object.freeze()`'d
- Each plugin's config is `Object.freeze()`'d

Plugin internal state (`ctx.state`) is mutable -- that's the point of state. But configs and the app structure are frozen.

### 1.8 Supported Lifecycle Usage

The supported lifecycle is:

`createApp()` -> optional `await app.start()` -> optional `await app.stop()`

This is the primary contract. Repeated calls, concurrent calls, or recovery attempts after lifecycle failure are outside the primary lifecycle guarantee unless explicitly documented otherwise.

The current runtime additionally guards some misuse cases:

- `app.start()` throws when called again after a successful start
- `app.stop()` throws if called before a successful start

### 1.9 require() Contract

`ctx.require(pluginInstance)` accepts only plugin instance references (not strings). It either returns the plugin's fully typed API object or throws.

There are three require contexts, each with a distinct error message:

**Plugin-level** (inside plugin lifecycle/api/hooks via `ctx.require`):
```
Error: [moku-site] Plugin "router" requires "logger", but "logger" is not registered.
  Add "logger" to your plugin list.
```

**App-level** (consumer calling `app.require`):
```
Error: [moku-site] app.require("logger") failed: "logger" is not registered.
  Check your plugin list.
```

**Callback-level** (inside consumer callbacks like `onReady`, `onStart`, `onStop`):
```
Error: [moku-site] Plugin "logger" is not registered.
  Add "logger" to your plugin list.
```

`ctx.has('name')` stays string-based. Returns `boolean`. Never throws. Checks all registered plugins (not just those with APIs).

### 1.10 Default Plugin Immutability

Consumers cannot remove framework default plugins. They can only configure them. The final plugin list is always `[...frameworkDefaults, ...consumerExtras]`.

### 1.11 Phase-Appropriate Context

Context is restricted based on what is safe to access at each point:

| Method | Context Tier | Available |
|--------|-------------|-----------|
| `createState` | MinimalContext | `global`, `config` |
| `hooks` | PluginContext | `global`, `config`, `state`, `emit`, `require`, `has` |
| `api` | PluginContext | `global`, `config`, `state`, `emit`, `require`, `has` |
| `onInit` | PluginContext | `global`, `config`, `state`, `emit`, `require`, `has` |
| `onStart` | PluginContext | `global`, `config`, `state`, `emit`, `require`, `has` |
| `onStop` | TeardownContext | `global` |

`createState` does NOT have access to `require`, `has`, or `emit`. At that point, not all plugins have been created. Providing these methods would return incomplete data.

`onStop` receives a minimal teardown context -- only `global` is available. Plugins should clean up their own resources without depending on other plugins (which may have already stopped in reverse order).

### 1.12 Async Sequential Execution

All async lifecycle methods within a phase execute sequentially, one plugin at a time. Plugin A's `onInit` resolves before Plugin B's `onInit` begins. No parallelism within or across phases.

### 1.13 Error Propagation

Lifecycle methods can throw (or reject). When they do:

- The error propagates to the caller (`createApp(...)` or `await app.start()`).
- No catch-and-silence. No error swallowing. No retry logic.
- The consumer decides how to handle errors.
- The kernel does not attempt rollback or compensation.
- Detached async work outside the awaited lifecycle chain is outside the kernel contract.

### 1.14 Non-Transactional Lifecycle

The lifecycle is not transactional. A failed `start()` does not imply rollback, and a failed `stop()` does not imply best-effort continuation. The safest default after lifecycle failure is to discard the app instance and recreate it if needed.

### 1.15 Core Plugin Self-Containment

Core plugins (created with `createCorePlugin`) are strictly self-contained infrastructure. They have **no access to** and **cannot declare**: `require`, `depends`, `has`, `events`, `hooks`. A core plugin spec that includes any of these fields is a kernel bug (or a validation error if runtime-checked).

Core plugins do not participate in the regular plugin dependency or event graph. They provide infrastructure APIs (logging, storage, environment) that are injected onto regular plugin contexts, but they themselves cannot consume other plugins or emit/listen to events.

### 1.16 Core Plugin Minimal Context

Core plugin lifecycle methods (`onInit`, `onStart`, `onStop`) and `api` receive only `{ config, state }`. No `global`, no `emit`, no `require`, no `has`. This minimal context reflects their self-contained nature — they depend on nothing outside their own config and state.

### 1.17 Core Plugin Name Uniqueness

Core plugin names must not conflict with:
- Regular plugin names
- Other core plugin names
- Reserved app method names (`start`, `stop`, `emit`, `require`, `has`, `config`, `__proto__`, `constructor`, `prototype`)

```
TypeError: [moku-site] Core plugin name "log" conflicts with regular plugin name "log".
  Core plugins and regular plugins share the same namespace. Choose a different name.

TypeError: [moku-site] Duplicate core plugin name: "env".
  Each core plugin must have a unique name.

TypeError: [moku-site] Core plugin name "start" conflicts with a reserved app method.
  Choose a different plugin name.
```

### 1.18 Core Plugin Lifecycle Ordering

Core plugins always process before regular plugins during init and start, and after regular plugins during stop:

| Phase | Core Plugins | Regular Plugins |
|-------|-------------|-----------------|
| init (`onInit`) | First (forward order) | Second (forward order) |
| start (`onStart`) | First (forward order) | Second (forward order) |
| stop (`onStop`) | Second (reverse order) | First (reverse order) |

This ensures that core plugin APIs (log, env, storage) are fully initialized before any regular plugin accesses them, and remain available throughout regular plugin teardown.

---

## Part 2: Anti-Patterns

### 2.1 Writing Business Logic in Plugin Files

```typescript
// BAD: Plugin index.ts is 400 lines of route matching and navigation logic
// GOOD: Plugin index.ts is 30 lines. Logic in ./api.ts, ./state.ts, ./handlers.ts
```

### 2.2 Consumer Importing from @moku-labs/core

```typescript
// BAD: Consumer reaches past the framework
import { createCoreConfig } from '@moku-labs/core';

// GOOD: Consumer uses the framework
import { createApp, createPlugin } from 'my-framework';
```

The consumer should never see Layer 1. If they need to, the framework is missing something.

### 2.3 Bypassing createApp Options Typing

```typescript
// BAD: Using `as any` to bypass the structured options type system
const app = createApp({ config: { siteName: 'Blog' } } as any);

// GOOD: Let TypeScript enforce the shape -- every namespace is typed
const app = createApp({
  plugins: [blogPlugin],
  config: { siteName: 'Blog' },
  pluginConfigs: { blog: { postsPerPage: 5 } },
});
```

The structured options passed to `createApp` are fully typed: `config` is `Partial<Config>`, `pluginConfigs` maps plugin names to their config types. Casting to `any` defeats the entire type system.

### 2.4 Leaking State

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

### 2.5 God Plugin

One plugin that does routing, auth, data fetching, and rendering. Split it. Each plugin = one domain concern.

### 2.6 Deep Config Nesting

```typescript
// BAD: deep nested config with merge ambiguity
config: {
  database: { host: 'localhost', port: 5432, pool: { min: 2, max: 10 } }
}

// GOOD: flat config, or document that nested objects replace entirely
config: {
  dbHost: 'localhost',
  dbPort: 5432,
  dbPoolMin: 2,
  dbPoolMax: 10,
}
```

Shallow merge means nested objects are replaced wholesale. If you use nested configs, document this clearly.

### 2.7 Using emit() for Request/Response

```typescript
// BAD: trying to get a return value from emit
ctx.emit('auth:getToken');  // returns Promise<void>, not the token

// GOOD: use require for request/response
const auth = ctx.require(authPlugin);
const token = auth.getToken();
```

Events are for notifications. `require` is for requests.

### 2.8 LLM Inventing New Primitives

```typescript
// BAD: LLM creates a "service" concept that doesn't exist
class AuthService { ... }
app.registerService(AuthService);

// GOOD: LLM uses what the framework gives
const authPlugin = createPlugin('auth', { ... });
```

**The primitives are:** `createCoreConfig`, `createCore`, `createApp`, `createPlugin`. If you need something the framework does not have, you build a plugin. Not a new abstraction.

### 2.9 createApp() is synchronous

```typescript
// BAD: assuming createApp() is lazy
const app = createApp({ config: { siteName: 'Blog' } });
// init/onReady have already run here

// GOOD: createApp() is sync; start() is optional and only begins the runtime start phase
const app = createApp({ config: { siteName: 'Blog' } });
await app.start();
app.router.navigate('home');
```

`start()` and `stop()` are optional. Use them when your app has a real runtime phase (servers, workers, long-lived resources). If not, `createApp()` plus direct API calls may be the whole lifecycle you need.

---

## Part 3: Error Message Format

All kernel errors follow a consistent format:

```
Error: [framework-name] <description>.
  <actionable suggestion>.
```

Validation errors use `TypeError`. Lifecycle errors use `Error`.

```
TypeError: [moku-site] Plugin name "start" conflicts with a reserved app method.
  Choose a different plugin name.

TypeError: [moku-site] Duplicate plugin name: "router".
  Each plugin must have a unique name.

TypeError: [moku-site] Plugin "router" depends on "auth", but "auth" is not registered.
  Add "auth" to your plugin list before "router".

TypeError: [moku-site] Plugin "router" depends on "logger", but "logger" appears after "router".
  Move "logger" before "router" in your plugin list.

Error: [moku-site] Plugin "router" requires "renderer", but "renderer" is not registered.
  Add "renderer" to your plugin list.

Error: [moku-site] App already started.
  start() can only be called once.

Error: [moku-site] App not started.
  Call start() before stop().
```

### Plugin Spec Validation Errors

`createPlugin` validates the spec object at registration time. These use `TypeError`:

```
TypeError: [moku-site] Plugin name must be a non-empty string.
  Pass a non-empty string as the first argument.

TypeError: [moku-site] Plugin "router" has invalid spec: expected an object.
  Provide a plugin specification object as the second argument.

TypeError: [moku-site] Plugin "router" has invalid onInit: expected a function.
  Provide a function for onInit or remove it from the spec.

TypeError: [moku-site] Plugin "router" has invalid events: expected a function.
  Provide a function like: events: register => ({ "event:name": register<PayloadType>() })

TypeError: [moku-site] Plugin "router" has invalid hooks: expected a function.
  Provide a function like: hooks: ctx => ({ "event:name": payload => { ... } })

TypeError: [moku-site] Plugin "router" has invalid api: expected a function.
  Provide a function like: api: ctx => ({ methodName: () => { ... } })

TypeError: [moku-site] Plugin "router" has invalid createState: expected a function.
  Provide a function like: createState: ctx => ({ key: initialValue })
```

These catch common mistakes like passing a plain object where a function is expected (e.g., `hooks: { ... }` instead of `hooks: ctx => ({ ... })`).

---

## Cross-References

- Lifecycle: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Config system: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Plugin patterns: [12-PLUGIN-PATTERNS](./12-PLUGIN-PATTERNS.md)
