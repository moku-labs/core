# 07 - Communication Model

**Domain:** emit, hooks, Events, PluginEvents, event merging via depends
**Version:** v3 (3-step architecture)

---

## 1. Two Communication Channels

The kernel provides exactly two communication mechanisms:

**Channel 1: Lifecycle callbacks (typed ctx)**

`onInit`, `onStart`, `onStop` -- each receives a typed `ctx` object. These are the structured, predictable communication points. The kernel calls them in a defined order.

**Channel 2: Events -- `emit(name, payload)` (broadcast)**

A single `emit` method handles all event communication. Known event names get fully typed payloads. Unknown event names are allowed as an untyped escape hatch.

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

Defined via the `PluginEvents` generic on `createPlugin`. Available to the declaring plugin and any plugin that lists it in `depends`:

```typescript
type AuthEvents = {
  'auth:login':  { userId: string };
  'auth:logout': {};
};

const authPlugin = createPlugin<AuthEvents>('auth', {
  api: (ctx) => ({
    login: (userId: string) => {
      // ctx.emit knows about AuthEvents because this plugin declared them
      void ctx.emit('auth:login', { userId });
    },
  }),
});
```

If no per-plugin events are needed, omit the generic entirely:

```typescript
const simplePlugin = createPlugin('simple', {
  // no PluginEvents generic -- only global events available
  api: (ctx) => ({ /* ... */ }),
});
```

---

## 3. emit -- Unified Event Dispatch

```typescript
emit: {
  // Overload 1: known event name -- typed required payload
  <K extends string & keyof AllEvents>(name: K, payload: AllEvents[K]): Promise<void>;
  // Overload 2: unknown event name -- untyped optional payload (escape hatch)
  (name: string, payload?: unknown): Promise<void>;
};
```

Where `AllEvents` = `Events` (global) + `PluginEvents` (own) + dependency events (from `depends` chain).

**Known events** get strict type checking -- payload type and presence are enforced at compile time:

```typescript
// In a plugin with access to Events and AuthEvents:
ctx.emit('page:render', { path: '/about', html: '<h1>About</h1>' });  // typed
ctx.emit('auth:login', { userId: '123' });                             // typed
```

**Unknown events** fall through to the untyped overload -- payload is optional `unknown`:

```typescript
ctx.emit('my:custom:event', { anything: true });  // untyped escape hatch
ctx.emit('my:custom:event');                       // payload optional for unknown events
```

One method, two behaviors. When `Events` is `{}` (the default), the first overload matches nothing. All events are untyped. Zero cost for frameworks that don't define events.

---

## 4. Hooks

Plugins subscribe to events via the `hooks` field on the plugin spec:

```typescript
const dashboardPlugin = createPlugin('dashboard', {
  depends: [authPlugin],
  hooks: {
    // Global event -- payload typed from Events
    'page:render': (payload) => {
      console.log(`Rendered ${payload.path}`);  // payload.path is string
    },
    // Dependency event -- payload typed from AuthEvents via depends
    'auth:login': (payload) => {
      console.log(`User ${payload.userId} logged in`);  // payload.userId is string
    },
    // Unknown event -- payload is `unknown`, cast manually
    'custom:event': (payload) => {
      const data = payload as { value: number };
    },
  },
});
```

**Typed hooks:** When a hook key matches a known event name (in global Events or dependency PluginEvents), the handler receives a typed payload. When the key is an unknown event name, the handler receives `unknown`.

```typescript
hooks?: {
  [K in string]?: K extends keyof AllEvents
    ? (payload: AllEvents[K]) => void | Promise<void>
    : (payload: unknown) => void | Promise<void>;
};
```

**Execution order:** Handlers execute in plugin registration order, sequentially. Each handler is awaited before the next. No parallelism.

---

## 5. Event Merging via depends

When Plugin B declares `depends: [pluginA]`, Plugin B's `hooks` and `emit` see `Events & PluginAEvents`. This means B can listen to A's events and emit A's events.

```typescript
// authPlugin declares per-plugin events:
type AuthEvents = {
  'auth:login':  { userId: string };
  'auth:logout': {};
};

const authPlugin = createPlugin<AuthEvents>('auth', {
  api: (ctx) => ({
    login: (userId: string) => {
      void ctx.emit('auth:login', { userId });
    },
    logout: () => {
      void ctx.emit('auth:logout', {});
    },
  }),
});

// dashboardPlugin depends on authPlugin:
const dashboardPlugin = createPlugin('dashboard', {
  depends: [authPlugin],
  // dashboard now sees: Events & AuthEvents
  hooks: {
    'auth:login': (payload) => {
      // payload is typed as { userId: string } -- from AuthEvents via depends
      console.log(`User ${payload.userId} logged in`);
    },
  },
  api: (ctx) => ({
    refresh: () => {
      // dashboard can also EMIT auth events because of depends
      void ctx.emit('auth:logout', {});
    },
  }),
});
```

**Transitive merging:** If Plugin C depends on Plugin B which depends on Plugin A, Plugin C sees `Events & PluginAEvents & PluginBEvents`. The entire depends chain contributes events.

---

## 6. Kernel-Emitted Events

Regardless of what the framework puts in `Events`, the kernel always emits these events:

| Event | When | Payload |
|---|---|---|
| `app:init` | After all plugins initialized | `{ config }` |
| `app:start` | Before plugin onStart calls | `{ config }` |
| `app:stop` | After plugin onStop calls | `{ config }` |

If the framework's `Events` includes these keys, the payload type is enforced. If not, they still fire with the default payload via the untyped overload.

---

## 7. Convention: Event Naming

Convention: namespace events with the emitting plugin's name. `router:navigate`, `auth:login`, `build:complete`. This prevents collisions. Convention, not enforced.

- `app:*` -- kernel events
- `framework-domain:*` -- framework-level events (e.g., `page:render`, `build:start`)
- `pluginName:eventName` -- per-plugin events

---

## 8. What About Middleware / Pipes?

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
