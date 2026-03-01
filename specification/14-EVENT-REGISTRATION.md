# 14 - Event Registration

**Domain:** The register callback pattern -- declaring typed events via `events: (register) => ({...})`
**Status:** Framework-wide standard. Used by plugins today, will extend to all event-declaring APIs.

---

## 1. The Problem

Events need type information at compile time, but event payloads have no runtime value to infer from. In TypeScript, you cannot infer a generic from a type-only position:

```typescript
// IMPOSSIBLE: TypeScript cannot infer T from a type position
events: {
  'auth:login': { userId: string },  // This is a value, not a type annotation
}
```

The old approach used a phantom type generic:

```typescript
// OLD: Explicit generic parameter
type AuthEvents = { 'auth:login': { userId: string } };
const plugin = createPlugin<AuthEvents>('auth', { ... });
```

This worked, but had problems:
- Required a separate type declaration detached from the plugin spec
- Was the only manual generic on `createPlugin` -- everything else inferred
- Could not carry runtime metadata (descriptions, categories) alongside types
- Only worked for `createPlugin` -- not reusable for other APIs

**This overload has been removed.** The register callback pattern is now the only way to declare per-plugin events. `createPlugin` accepts zero explicit generics.

---

## 2. The Register Callback Pattern

A callback-based pattern that infers event types from a factory function:

```typescript
const authPlugin = createPlugin('auth', {
  events: (register) => ({
    'auth:login':  register<{ userId: string }>('Triggered after user login'),
    'auth:logout': register<{ userId: string }>('Triggered after user logout'),
  }),
  api: ctx => ({
    login: (userId: string) => {
      // ctx.emit knows about auth:login -- typed payload
      ctx.emit('auth:login', { userId });
    },
  }),
});
```

**How it works:**

1. The `events` field is a function that receives `register` -- a factory function.
2. `register<T>(description?)` returns an `EventDescriptor<T>` -- a small object carrying the payload type `T` as a phantom and an optional description string.
3. TypeScript infers the event map from the return type of the callback: `{ 'auth:login': EventDescriptor<{ userId: string }>, ... }`.
4. The kernel extracts `T` from each `EventDescriptor<T>` to build the typed event map.

**Result:** Zero explicit generics on `createPlugin`. Everything is inferred. Event declarations live inside the spec object alongside config, state, and API.

---

## 3. Core Types

```typescript
/**
 * Descriptor returned by register<T>(). Carries the payload type T
 * and an optional runtime description string.
 */
type EventDescriptor<T = unknown> = {
  readonly description: string;
  /** @internal Phantom field -- carries T for type inference. Never set at runtime. */
  readonly _type?: T;
};

/**
 * The register function passed to the events callback.
 * Two usage modes:
 *   register<T>(description?) -- single event registration
 *   register.map<EventMap>(descriptions?) -- bulk registration from a type map
 */
type RegisterFn = {
  <T>(description?: string): EventDescriptor<T>;
  map: <EventMap extends Record<string, unknown>>(
    descriptions?: { [K in keyof EventMap]?: string }
  ) => { [K in keyof EventMap]: EventDescriptor<EventMap[K]> };
};
```

**EventDescriptor** is the bridge between types and runtime:
- The phantom `_type?: T` field carries the payload type for TypeScript. It is never assigned at runtime.
- The `description` field carries a human-readable string for runtime event catalogs, documentation, and tooling.

**RegisterFn** is the factory passed to the `events` callback. It creates `EventDescriptor<T>` objects. Two usage modes:
- `register<T>(description?)` -- register a single event with inline payload type. Best for simple plugins where events are defined in one file.
- `register.map<EventMap>(descriptions?)` -- bulk-register all events from a pre-declared type map. Best for Standard+ plugins with a separate `XxxEvents` type (see §8.4).

---

## 4. The events Field on PluginSpec

```typescript
type PluginSpec = {
  events?: (register: RegisterFn) => {
    [K in keyof PluginEvents]: EventDescriptor<PluginEvents[K]>
  };
  // ... other spec fields
};
```

The `events` callback is **compile-time only**. The kernel never calls `events(register)` at runtime — it is stored in the spec but never invoked. Its sole purpose is TypeScript type inference:

1. TypeScript infers the return type of the callback from the `register<T>()` calls.
2. The inferred event map types flow into `ctx.emit`, `hooks`, and dependency event merging.
3. At runtime, `events` is validated to be a function (if present) by `createPlugin`, but never executed by the kernel.

When `events` is absent, the plugin has no per-plugin events. It can still emit and listen to global events (from `createCoreConfig`) and dependency events (from `depends`).

---

## 5. Why a Callback (Not a Plain Object)

A plain object cannot carry type information without an explicit generic:

```typescript
// Plain object -- TypeScript sees Record<string, unknown>, not the payload types
events: {
  'auth:login': { userId: string },
}
```

A callback receives a typed factory function. TypeScript infers the return type:

```typescript
// Callback -- TypeScript infers the full event map from register<T>() calls
events: (register) => ({
  'auth:login': register<{ userId: string }>('...'),
})
// Return type: { 'auth:login': EventDescriptor<{ userId: string }> }
```

The callback pattern:
- **Preserves full type inference** -- no manual generics anywhere
- **Carries runtime metadata** -- descriptions, categories, etc.
- **Is composable** -- the same pattern works for any API that declares events
- **Is discoverable** -- IDE autocomplete shows `register` as the parameter

---

## 6. Strict Emit (No Escape Hatch)

With the register callback, `emit` is strictly typed. There is no untyped overload:

```typescript
// EmitFunction type signature (defined in src/types.ts)
type EmitFunction<Events extends Record<string, unknown>> = <K extends string & keyof Events>(
  name: K,
  payload: Events[K]
) => void;

// In plugin context, AllEvents = global Events + own PluginEvents + dependency events
emit: EmitFunction<AllEvents>;
```

Where `AllEvents` = global Events + own PluginEvents + dependency events (from `depends` chain).

**Only known event names are accepted.** Emitting an unknown event is a compile error:

```typescript
ctx.emit('auth:login', { userId: '123' });           // OK -- known event, typed payload
ctx.emit('auth:login', { wrongKey: true });           // ERROR -- wrong payload shape
ctx.emit('unknown:event', { anything: true });        // ERROR -- unknown event name
```

### Domain Context Emit

When domain factories are extracted into separate files (Standard+ tier plugins), use `PluginCtx` to build the domain context type. It auto-generates overloaded emit call signatures from the event map:

```typescript
// plugins/auth/types.ts
import type { PluginCtx } from '@moku-labs/core';

export type AuthEvents = {
  'auth:login':  { userId: string };
  'auth:logout': { userId: string };
};

export type AuthCtx = PluginCtx<AuthConfig, AuthState, AuthEvents>;
```

For custom composition (e.g., adding `require`), use `EmitFn` directly:

```typescript
import type { EmitFn } from '@moku-labs/core';

export type AuthCtx = {
  config: AuthConfig;
  state: AuthState;
  emit: EmitFn<AuthEvents>;
  require: <P extends PluginLike>(plugin: P) => ExtractPluginApi<P>;
};
```

**How it works under the hood:** `EmitFn<E>` uses `UnionToIntersection` to convert per-event function types into an intersection — which TypeScript treats as overloaded call signatures. This avoids a generic `<K extends keyof AuthEvents>(name: K, payload: AuthEvents[K]) => void` which fails TypeScript's assignability check against the kernel's `EmitFunction<MergedEvents>`. Concrete overloads work because TypeScript instantiates the kernel's generic per-overload and checks compatibility directly.

The resulting type is compatible with the kernel's `EmitFunction<MergedEvents>` (instantiated per-overload) and test mocks (`vi.fn()`, `() => {}`). See [15-PLUGIN-STRUCTURE §4 Unit Testing](./15-PLUGIN-STRUCTURE.md) for the full pattern.

**Rationale:** The escape hatch (`(name: string, payload?: unknown) => void`) was removed because it defeats the purpose of typed events. If a plugin can bypass type checking at any call site, the event system provides no safety. With the register callback, declaring events is easy enough that there is no reason to skip it.

**For frameworks that want untyped events:** Set `Events = Record<string, unknown>` in `createCoreConfig`. This makes `keyof Events` equal to `string`, so all event names are accepted with `unknown` payload. The strictness is opt-in at the framework level, not per-call-site.

---

## 7. Event Visibility Rules

Events flow through three channels. A plugin sees the union of all three:

| Source | Where declared | Who sees it |
|---|---|---|
| **Global Events** | `createCoreConfig<Config, Events>` | All plugins |
| **Own PluginEvents** | `events: (register) => ({...})` on this plugin | This plugin |
| **Dependency Events** | `events` on plugins listed in `depends` | Plugins that declare the dependency |

The merged event map is: `Events & PluginEvents & DepsEvents<Deps>`

This merged map types `ctx.emit`, `ctx` in `api`/`onInit`/`onStart`, and the `hooks` field.

---

## 8. Examples

### Plugin with events (most common)

```typescript
export const authPlugin = createPlugin('auth', {
  events: (register) => ({
    'auth:login':  register<{ userId: string }>('Triggered after user login'),
    'auth:logout': register<{ userId: string }>('Triggered after user logout'),
  }),
  config: {
    loginPath: '/login',
    sessionTimeout: 3600,
  },
  createState: () => ({
    currentUser: undefined as string | undefined,
    isAuthenticated: false,
  }),
  api: ctx => ({
    login: (userId: string) => {
      ctx.state.currentUser = userId;
      ctx.state.isAuthenticated = true;
      ctx.emit('auth:login', { userId });
    },
    logout: () => {
      const userId = ctx.state.currentUser;
      ctx.state.currentUser = undefined;
      ctx.state.isAuthenticated = false;
      if (userId) {
        ctx.emit('auth:logout', { userId });
      }
    },
  }),
});
```

### Plugin without events

```typescript
export const routerPlugin = createPlugin('router', {
  config: { basePath: '/' },
  createState: () => ({ currentPath: '/' }),
  api: ctx => ({
    navigate: (path: string) => {
      ctx.state.currentPath = path;
      // Can emit global events (from createCoreConfig Events)
      ctx.emit('router:navigate', { from: '/', to: path });
    },
  }),
});
```

### Dependent plugin sees dependency events

```typescript
export const dashboardPlugin = createPlugin('dashboard', {
  depends: [authPlugin],
  hooks: (ctx) => ({
    // Typed -- payload inferred from authPlugin's PluginEvents via depends
    'auth:login': (payload) => {
      console.log(`User ${payload.userId} logged in`);
    },
  }),
  api: (ctx) => ({
    refresh: () => {
      // Can emit auth events because of depends
      ctx.emit('auth:logout', { userId: 'dashboard-triggered' });
    },
  }),
});
```

### Bulk registration with `register.map` (Standard+ plugins)

When a plugin declares events in a separate `types.ts` file, `register.map<EventMap>()` eliminates the per-event `register<Events["name"]>()` repetition:

```typescript
// plugins/router/types.ts -- single source of truth for event payloads
export type RouterEvents = {
  'router:navigate': { from: string; to: string };
  'router:not-found': { path: string };
};

// plugins/router/index.ts -- bulk-register from the type map
import type { RouterEvents } from './types';

export const routerPlugin = createPlugin('router', {
  events: register => register.map<RouterEvents>({
    'router:navigate': 'Route changed',
    'router:not-found': 'Route not found',
  }),
  // ...
});
```

**Before** (`register<T>()` per event):
```typescript
events: register => ({
  'router:navigate': register<RouterEvents['router:navigate']>('Route changed'),
  'router:not-found': register<RouterEvents['router:not-found']>('Route not found'),
}),
```

**After** (`register.map<EventMap>()`):
```typescript
events: register => register.map<RouterEvents>({
  'router:navigate': 'Route changed',
  'router:not-found': 'Route not found',
}),
```

Event names appear in the descriptions object (for documentation), but payload types are not repeated -- they come from `RouterEvents` via the generic.

Descriptions are optional. `register.map<RouterEvents>()` with no argument still infers the full event map.

**When to use which:**
- `register<T>()` -- inline event types, simple plugins, one-file plugins
- `register.map<EventMap>()` -- separate `XxxEvents` type, Standard+ plugins

Both forms are fully backward compatible. Individual `register<T>()` and `register.map<EventMap>()` cannot be mixed in the same `events` callback (choose one per plugin).

---

## 9. Future: Beyond Plugins

The register callback is a general pattern for typed event declaration. It will extend to:

- **`createCoreConfig` global events** -- replace the `Events` type parameter with a register callback, making global events declarative and carrying descriptions.
- **Any future API that declares events** -- components, modules, or framework-level event buses.

The pattern is the same everywhere: `(register) => ({ 'event:name': register<PayloadType>('description') })`.

---

## 10. Design Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Callback `(register) => ({...})` not plain object | Plain objects cannot carry type parameters. The callback receives a typed factory function that TypeScript can infer from. |
| 2 | `register<T>(description?)` returns `EventDescriptor<T>` | Carries both the phantom type T (for type inference) and a runtime description string (for tooling/docs). |
| 3 | No untyped emit escape hatch | Defeats the purpose of typed events. Frameworks that want untyped events use `Record<string, unknown>` as Events. |
| 4 | `PluginEvents` default is `{}` (empty object) | `{}` is the identity element for intersection. `Record<string, never>` has a string index mapping all keys to `never`, poisoning intersections. |
| 5 | Dependency events use `UnionToIntersection` | `ExtractEvents<Deps[number]>` distributes as a union. `UnionToIntersection` merges event maps so all dependency events are available. |
| 6 | Description is optional (`register<T>()` works) | Not all contexts need descriptions. The pattern still works for pure type inference without metadata. |
| 7 | `register.map<EventMap>()` for bulk registration | Standard+ plugins with separate `XxxEvents` types should not repeat each event name and payload in `register<Events["name"]>()` calls. `register.map` accepts the full type map as a generic. |

---

## Cross-References

- Communication model: [07-COMMUNICATION](./07-COMMUNICATION.md)
- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Core API: [02-CORE-API](./02-CORE-API.md)
- Context object: [08-CONTEXT](./08-CONTEXT.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
