# 07 - Communication Model

**Domain:** emit, hooks, Events, PluginEvents, event merging via depends
**Version:** v3 (3-step architecture)

---

## 1. Two Communication Channels

The kernel provides exactly two communication mechanisms:

**Channel 1: Lifecycle callbacks (typed ctx)**

`onInit`, `onStart`, `onStop` -- each receives a typed `ctx` object. These are the structured, predictable communication points. The kernel calls them in a defined order.

**Channel 2: Events -- `emit(name, payload)` (broadcast)**

A single `emit` method handles all event communication. Known event names get fully typed payloads. Only known events are accepted -- there is no untyped escape hatch.

---

## 2. Event Sources

v3 has two sources of typed events:

### Global Events

Defined in `createCoreConfig<Config, Events>`. Available to ALL plugins. The framework author defines the global event contract:

```typescript
type Events = {
  'page:render':     { path: string; html: string };
  'router:navigate': { from: string; to: string };
  'build:complete':  { outputDir: string };
};

const coreConfig = createCoreConfig<Config, Events>('my-framework', {
  config: { /* ... */ },
});
```

Every plugin created from this `coreConfig` sees these events in `emit` and `hooks`.

### Per-Plugin Events

Defined via the `events` register callback on the plugin spec. Available to the declaring plugin and any plugin that lists it in `depends`:

```typescript
const authPlugin = createPlugin('auth', {
  events: (register) => ({
    'auth:login':  register<{ userId: string }>('Triggered after user login'),
    'auth:logout': register<{ userId: string }>('Triggered after user logout'),
  }),
  api: (ctx) => ({
    login: (userId: string) => {
      // ctx.emit knows about auth:login because this plugin declared them
      ctx.emit('auth:login', { userId });
    },
  }),
});
```

If no per-plugin events are needed, omit the `events` field entirely:

```typescript
const simplePlugin = createPlugin('simple', {
  // no events field -- only global events available
  api: (ctx) => ({ /* ... */ }),
});
```

See [14-EVENT-REGISTRATION](./14-EVENT-REGISTRATION.md) for the full register callback pattern specification.

---

## 3. emit -- Strictly Typed Event Dispatch

```typescript
emit: <K extends string & keyof AllEvents>(name: K, payload: AllEvents[K]) => void;
```

Where `AllEvents` = `Events` (global) + `PluginEvents` (own) + dependency events (from `depends` chain).

**Only known event names are accepted.** Payload type and presence are enforced at compile time:

```typescript
ctx.emit('page:render', { path: '/about', html: '<h1>About</h1>' });  // OK -- typed
ctx.emit('auth:login', { userId: '123' });                             // OK -- typed
ctx.emit('auth:login', { wrongKey: true });                            // ERROR -- wrong payload
ctx.emit('unknown:event', { anything: true });                         // ERROR -- unknown event
```

**No escape hatch.** There is no untyped overload. If an event name is not in the merged event map, it is a compile error. This prevents accidental bypassing of the type system.

**For frameworks that want untyped events:** Set `Events = Record<string, unknown>` in `createCoreConfig`. This makes all event names valid with `unknown` payload.

**Hook error resilience.** `emit` is fire-and-forget (returns `void`). Hooks run sequentially via an internal async `dispatch`. If a hook throws, the error is reported via a combined error handler that calls both the framework `onError` (from `createCore`) and the consumer `onError` (from `createApp`), if either is provided. If neither handler is provided, hook errors are silently caught and discarded. One failing hook does not prevent other hooks from running.

---

## 4. Hooks

Plugins subscribe to events via the `hooks` field on the plugin spec. Hooks follow the same closure pattern as `api` -- a function receiving full `PluginContext` that returns the handler map:

```typescript
const dashboardPlugin = createPlugin('dashboard', {
  depends: [authPlugin],
  createState: () => ({ lastLogin: '' }),
  hooks: (ctx) => ({
    // Global event -- payload typed from Events
    'page:render': (payload) => {
      console.log(`Rendered ${payload.path}`);  // payload.path is string
    },
    // Dependency event -- payload typed from AuthEvents via depends
    'auth:login': (payload) => {
      console.log(`User ${payload.userId} logged in`);  // payload.userId is string
      // Full context available: state, emit, require, etc.
      ctx.state.lastLogin = payload.userId;
      ctx.emit('page:render', { path: '/dashboard', html: '<div>Welcome</div>' });
    },
  }),
});
```

**Context-aware hooks:** The `hooks` function receives the same `PluginContext` as `api`, `onInit`, and `onStart`. Handlers can access `ctx.state`, `ctx.emit`, `ctx.require`, etc. via closure. This enables hooks to mutate plugin state and trigger cross-plugin communication.

**Typed hooks:** Hook handlers receive fully typed payloads for known event names (global Events, own PluginEvents, and dependency events via `depends`). There is no `(payload: unknown)` fallback -- the type system maps each event key directly to its payload type.

```typescript
hooks?: (ctx: PluginContext) => {
  [K in string & keyof AllEvents]?: (payload: AllEvents[K]) => void | Promise<void>;
};
```

**Execution order:** Handlers execute in plugin registration order, sequentially. Each handler is awaited before the next. No parallelism.

---

## 5. Event Merging via depends

When Plugin B declares `depends: [pluginA]`, Plugin B's `hooks` and `emit` see `Events & PluginAEvents`. This means B can listen to A's events and emit A's events.

```typescript
// authPlugin declares per-plugin events via register callback:
const authPlugin = createPlugin('auth', {
  events: (register) => ({
    'auth:login':  register<{ userId: string }>('Triggered after user login'),
    'auth:logout': register<{ userId: string }>('Triggered after user logout'),
  }),
  api: (ctx) => ({
    login: (userId: string) => {
      ctx.emit('auth:login', { userId });
    },
    logout: (userId: string) => {
      ctx.emit('auth:logout', { userId });
    },
  }),
});

// dashboardPlugin depends on authPlugin:
const dashboardPlugin = createPlugin('dashboard', {
  depends: [authPlugin],
  // dashboard now sees: Events & AuthPlugin's events
  hooks: (ctx) => ({
    'auth:login': (payload) => {
      // payload typed from auth's PluginEvents via depends
      console.log(`User ${payload.userId} logged in`);  // payload.userId is string
    },
  }),
  api: (ctx) => ({
    refresh: () => {
      // dashboard can also EMIT auth events because of depends
      ctx.emit('auth:logout', { userId: 'from-dashboard' });
    },
  }),
});
```

**No transitive merging.** Dependencies are NOT transitive in the type system. If Plugin C depends on Plugin B which depends on Plugin A, Plugin C sees only `Events & PluginBEvents` — it does NOT see Plugin A's events. To see A's events, C must directly declare `depends: [pluginA, pluginB]`. This is because each plugin's `_phantom.events` carries only its own declared events, not its transitive dependencies' events. `DependencyEvents` extracts events from direct dependencies only.

---

## 6. Convention: Event Naming

Convention: namespace events with the emitting plugin's name. `router:navigate`, `auth:login`, `build:complete`. This prevents collisions. Convention, not enforced.

- `framework-domain:*` -- framework-level events (e.g., `page:render`, `build:start`)
- `pluginName:eventName` -- per-plugin events

---

## 7. What About Middleware / Pipes?

**Not in the kernel.** If a plugin needs request transformation, build pipeline, or render chain, it implements that internally. The plugin exposes an API method for other plugins to register middleware:

```typescript
const httpPlugin = createPlugin('http', {
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

const authPlugin = createPlugin('auth', {
  depends: [httpPlugin],
  onInit: (ctx) => {
    const http = ctx.require(httpPlugin);
    http.use((req: any) => ({ ...req, user: 'authenticated' }));
  },
});
```

This is more code than a built-in `pipe` primitive. But it's explicit, debuggable, and doesn't add concepts to the kernel. The kernel stays boring.

---

## Cross-References

- Context object: [08-CONTEXT](./08-CONTEXT.md)
- Plugin spec: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
- Invariants: [11-INVARIANTS](./11-INVARIANTS.md)
