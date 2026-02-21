# 11 - Invariants and Anti-Patterns

**Domain:** Guarantees, error messages, anti-patterns
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1), SPEC_INITIAL (v0.1)

---

## Part 1: Invariants

These properties always hold. Breaking any of these is a kernel bug.

### 1.1 Name Uniqueness

**Duplicate plugin names throw at Phase 0.**

```
Error: [moku-site] Duplicate plugin name "router". Each plugin must have a unique name.
  Found at positions 2 and 5 in the flattened plugin list.
```

No silent overwrite. No merge. No "last wins." If you want to replace a plugin, remove the old one from your plugin list and add the new one.

### 1.2 Dependency Validation

If a plugin declares `depends: ['logger']`, Phase 0 validates:

```
Error: [moku-site] Plugin "router" depends on "logger", but "logger" is not registered.
  Add the logger plugin to your plugin list, before "router".

Error: [moku-site] Plugin "router" depends on "logger", but "logger" appears after "router".
  Move "logger" before "router" in your plugin list.
```

This is **validation only.** It does not change plugin order. It does not compute a topological sort. It checks that the order the consumer provided satisfies the declared constraints.

### 1.3 Config Completeness

If a plugin requires config (no `defaultConfig`, non-void `C`), TypeScript rejects `createApp` without it. At runtime, the kernel also validates: if required config is missing, throw.

### 1.4 Lifecycle Order

Plugins initialize in array order. Always. Teardown in reverse. Always. No topological sort. No automatic reordering. No `@before` / `@after` annotations.

**Ordering is the consumer's responsibility.** If plugin B depends on plugin A, put A before B. `depends` validates this but does not fix it.

### 1.5 Hook Execution Order

When an event fires (via `emit`), handlers execute in plugin registration order, sequentially. Each handler is awaited before the next. No parallelism.

### 1.6 Immutability

After `createApp` resolves:
- `app` is `Object.freeze()`'d
- `app.config` (global) is `Object.freeze()`'d
- `app.<plugin>.config` is `Object.freeze()`'d

Plugin internal state (`S`) is mutable -- that's the point of state. But configs and the app structure are frozen.

### 1.7 Idempotency

- `app.start()` called twice: second call is a no-op.
- `app.stop()` called twice: second call is a no-op.
- `app.destroy()` calls `stop()` first if needed. Calling `destroy()` twice is safe.

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

`createState` and `onCreate` do NOT have access to `getPlugin`, `require`, `has`, or `emit`. At that point, not all plugins have been created. Providing these methods would return incomplete data.

### 1.11 Async Sequential Execution

All async lifecycle methods within a phase execute sequentially, one plugin at a time. Plugin A's `createState` resolves before Plugin B's `createState` begins. No parallelism within or across phases.

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
import { createCore } from 'moku_core';

// GOOD: Consumer uses the framework
import { createConfig, createApp } from 'my-framework';
```

The consumer should never see Layer 1. If they need to, the framework is missing something.

### 2.3 Skipping createConfig

```typescript
// BAD: Trying to pass plugins directly to createApp -- types can't be inferred
const app = await createApp({ siteName: 'Blog' }, { ... }, [BlogPlugin]);

// GOOD: Two-step: declare plugins first, then provide configs
const config = createConfig({ siteName: 'Blog' }, [BlogPlugin]);
const app = await createApp(config, { blog: { ... } });
```

`createConfig` exists because TypeScript needs the full plugin set known before it types `pluginConfigs`. Skipping it means custom plugin configs won't be type-checked.

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

### 2.7 Using emit() for Request/Response

```typescript
// BAD: trying to get a return value from emit
ctx.emit('auth:getToken');  // returns Promise<void>, not the token

// GOOD: use require for request/response
const auth = ctx.require<{ getToken: () => string }>('auth');
const token = auth.getToken();
```

Events are for notifications. `getPlugin`/`require` are for requests.

### 2.8 LLM Inventing New Primitives

```typescript
// BAD: LLM creates a "service" concept that doesn't exist
class AuthService { ... }
app.registerService(AuthService);

// GOOD: LLM uses what the framework gives
const AuthPlugin = createPlugin('auth', { ... });
```

**If the LLM needs something the framework doesn't have, it builds a plugin. Not a new abstraction.**

### 2.9 Forgetting await on createApp (Variant B only)

```typescript
// BAD: missing await -- app is a Promise, not an App
const app = createApp(config, { ... });
app.router.navigate('home');  // runtime error: app.router is undefined

// GOOD: await the Promise
const app = await createApp(config, { ... });
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
  Found at positions 2 and 5 in the flattened plugin list.

Error: [moku-site] Plugin "router" depends on "auth", but "auth" is not registered.
  Add the auth plugin to your plugin list before "router".

Error: [moku-site] Plugin "router" depends on "logger", but "logger" appears after "router".
  Move "logger" before "router" in your plugin list.

Error: [moku-site] Plugin "router" requires "renderer", but "renderer" is not registered.
  Add the renderer plugin to your plugin list, before "router".

Error: [moku-site] Plugin "analytics" requires config but none was provided.
  Add an "analytics" key to your pluginConfigs object.
```

---

## Cross-References

- Lifecycle: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Config system: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Plugin patterns: [12-PLUGIN-PATTERNS](./12-PLUGIN-PATTERNS.md)

