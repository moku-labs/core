# 11 - Invariants and Anti-Patterns

**Domain:** Guarantees, error messages, anti-patterns
**Architecture:** v3 3-step (createCoreConfig -> createCore -> createApp)

---

## Part 1: Invariants

These properties always hold. Breaking any of these is a kernel bug.

### 1.1 Name Uniqueness

**Duplicate plugin names throw during init.**

```
Error: [moku-site] Duplicate plugin name "router". Each plugin must have a unique name.
  Found at positions 2 and 5 in the plugin list.
```

No silent overwrite. No merge. No "last wins." If you want to replace a plugin, remove the old one from your plugin list and add the new one.

### 1.2 Dependency Validation

If a plugin declares `depends: ['logger']`, init validates:

```
Error: [moku-site] Plugin "router" depends on "logger", but "logger" is not registered.
  Add the logger plugin to your plugin list, before "router".

Error: [moku-site] Plugin "router" depends on "logger", but "logger" appears after "router".
  Move "logger" before "router" in your plugin list.
```

This is **validation only.** It does not change plugin order. It does not compute a topological sort. It checks that the order the consumer provided satisfies the declared constraints.

### 1.3 Config Completeness

If a plugin requires config (no `config`, non-void `C`), TypeScript rejects `createApp` without it. At runtime, the kernel also validates: if required config is missing, throw.

### 1.4 Lifecycle Order

Plugins execute lifecycle methods in array order. Always. Teardown in reverse. Always. No topological sort. No automatic reordering. No `@before` / `@after` annotations.

**3 phases:**

| Phase | Method | Direction | When |
|-------|--------|-----------|------|
| init | `onInit` | Forward (array order) | During `createApp` |
| start | `onStart` | Forward (array order) | During `app.start()` |
| stop | `onStop` | **Reverse** (array order) | During `app.stop()` |

**Ordering is the consumer's responsibility.** If plugin B depends on plugin A, put A before B. `depends` validates this but does not fix it.

### 1.5 Hook Execution Order

When an event fires (via `emit`), handlers execute in plugin registration order, sequentially. Each handler is awaited before the next. No parallelism.

### 1.6 Immutability

After `createApp` resolves:
- `app` is `Object.freeze()`'d
- Global config is `Object.freeze()`'d
- Each plugin's config is `Object.freeze()`'d

Plugin internal state (`ctx.state`) is mutable -- that's the point of state. But configs and the app structure are frozen.

### 1.7 Idempotency

- `app.start()` callable once. Second call throws.
- `app.stop()` callable once. Second call throws.
- After `app.stop()`, all methods throw. The app is in a terminal state.

### 1.8 require() Contract

`ctx.require('name')` either returns the plugin's API object or throws:

```
Error: [moku-site] Plugin "router" requires "logger", but "logger" is not registered.
  Add the logger plugin to your plugin list, before "router".
```

The error message includes the framework name, the requesting plugin, and the missing plugin. The suggestion to add it "before" the requester is always correct because of the ordering guarantee.

`ctx.has('name')` returns `boolean`. Never throws.

### 1.9 Default Plugin Immutability

Consumers cannot remove framework default plugins. They can only configure them. The final plugin list is always `[...frameworkDefaults, ...consumerExtras]`.

### 1.10 Phase-Appropriate Context

Context is restricted based on what is safe to access at each point:

| Method | Context Tier | Available |
|--------|-------------|-----------|
| `createState` | MinimalContext | `global`, `config` |
| `api` | PluginContext | `global`, `config`, `state`, `emit`, `require`, `has` |
| `onInit` | PluginContext | `global`, `config`, `state`, `emit`, `require`, `has` |
| `onStart` | PluginContext | `global`, `config`, `state`, `emit`, `require`, `has` |
| `onStop` | TeardownContext | `global` |

`createState` does NOT have access to `require`, `has`, or `emit`. At that point, not all plugins have been created. Providing these methods would return incomplete data.

`onStop` receives a minimal teardown context -- only `global` is available. Plugins should clean up their own resources without depending on other plugins (which may have already stopped in reverse order).

### 1.11 Async Sequential Execution

All async lifecycle methods within a phase execute sequentially, one plugin at a time. Plugin A's `onInit` resolves before Plugin B's `onInit` begins. No parallelism within or across phases.

### 1.12 Error Propagation

Lifecycle methods can throw (or reject). When they do:

- The error propagates to the caller (`await createApp(...)` or `await app.start()`).
- No catch-and-silence. No error swallowing. No retry logic.
- The consumer decides how to handle errors.

---

## Part 2: Anti-Patterns

### 2.1 Writing Business Logic in Plugin Files

```typescript
// BAD: Plugin index.ts is 400 lines of route matching and navigation logic
// GOOD: Plugin index.ts is 30 lines. Logic in ./api.ts, ./state.ts, ./handlers.ts
```

### 2.2 Consumer Importing from moku_core

```typescript
// BAD: Consumer reaches past the framework
import { createCoreConfig } from 'moku_core';

// GOOD: Consumer uses the framework
import { createApp, createPlugin } from 'my-framework';
```

The consumer should never see Layer 1. If they need to, the framework is missing something.

### 2.3 Bypassing createApp Options Typing

```typescript
// BAD: Using `as any` to bypass the flat object type system
const app = await createApp({ siteName: 'Blog', blog: { x: 1 } } as any);

// GOOD: Let TypeScript enforce the shape -- every key is typed
const app = await createApp({
  plugins: [blogPlugin],
  siteName: 'Blog',
  blog: { postsPerPage: 5 },
});
```

The flat object passed to `createApp` is fully typed: config keys come from the Config type, plugin config keys come from registered plugin names. Casting to `any` defeats the entire type system.

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
const auth = ctx.require('auth');
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

**The v3 primitives are:** `createCoreConfig`, `createCore`, `createApp`, `createPlugin`. If you need something the framework does not have, you build a plugin. Not a new abstraction.

### 2.9 Forgetting await on createApp

```typescript
// BAD: missing await -- app is a Promise, not an App
const app = createApp({ siteName: 'Blog' });
app.router.navigate('home');  // runtime error: app.router is undefined

// GOOD: await the Promise
const app = await createApp({ siteName: 'Blog' });
app.router.navigate('home');  // works
```

---

## Part 3: Error Message Format

All kernel errors follow a consistent format:

```
Error: [framework-name] <description>.
  <actionable suggestion>.
```

Examples:

```
Error: [moku-site] Duplicate plugin name "router". Each plugin must have a unique name.
  Found at positions 2 and 5 in the plugin list.

Error: [moku-site] Plugin "router" depends on "auth", but "auth" is not registered.
  Add the auth plugin to your plugin list before "router".

Error: [moku-site] Plugin "router" depends on "logger", but "logger" appears after "router".
  Move "logger" before "router" in your plugin list.

Error: [moku-site] Plugin "router" requires "renderer", but "renderer" is not registered.
  Add the renderer plugin to your plugin list, before "router".

Error: [moku-site] Plugin "analytics" requires config but none was provided.
  Add an "analytics" key to your createApp options object.

Error: [moku-site] app.start() has already been called.
  start() can only be called once per app instance.

Error: [moku-site] Cannot call start() after stop(). The app is in a terminal state.
  Create a new app instance with createApp() to restart.
```

---

## Cross-References

- Lifecycle: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Config system: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Plugin patterns: [12-PLUGIN-PATTERNS](./12-PLUGIN-PATTERNS.md)
