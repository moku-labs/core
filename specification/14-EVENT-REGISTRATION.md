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
 * Calling register<T>(description?) returns an EventDescriptor<T>.
 */
type RegisterFn = <T>(description?: string) => EventDescriptor<T>;
```

**EventDescriptor** is the bridge between types and runtime:
- The phantom `_type?: T` field carries the payload type for TypeScript. It is never assigned at runtime.
- The `description` field carries a human-readable string for runtime event catalogs, documentation, and tooling.

**RegisterFn** is the factory passed to the `events` callback. It creates `EventDescriptor<T>` objects. The generic `T` on `register<T>()` is the payload type for that event.

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

When `events` is present, the kernel:
1. Calls the function with a `register` implementation.
2. Receives the event descriptor map.
3. Extracts payload types from the descriptors for compile-time type checking.
4. Optionally stores descriptions for runtime introspection.

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
// emit type (strict)
emit: <K extends string & keyof AllEvents>(name: K, payload: AllEvents[K]) => void;
```

Where `AllEvents` = global Events + own PluginEvents + dependency events (from `depends` chain).

**Only known event names are accepted.** Emitting an unknown event is a compile error:

```typescript
ctx.emit('auth:login', { userId: '123' });           // OK -- known event, typed payload
ctx.emit('auth:login', { wrongKey: true });           // ERROR -- wrong payload shape
ctx.emit('unknown:event', { anything: true });        // ERROR -- unknown event name
```

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
  depends: [authPlugin] as const,
  hooks: {
    // Typed -- payload inferred from authPlugin's PluginEvents via depends
    'auth:login': payload => {
      console.log(`User ${payload.userId} logged in`);
    },
  },
  api: ctx => ({
    refresh: () => {
      // Can emit auth events because of depends
      ctx.emit('auth:logout', { userId: 'dashboard-triggered' });
    },
  }),
});
```

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

---

## Cross-References

- Communication model: [07-COMMUNICATION](./07-COMMUNICATION.md)
- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Core API: [02-CORE-API](./02-CORE-API.md)
- Context object: [08-CONTEXT](./08-CONTEXT.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
