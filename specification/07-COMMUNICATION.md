# 07 - Communication Model

**Domain:** emit, hooks, EventContract
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1), SPEC_IMPROVEMENTS_IDEAS (P3)

---

## 1. Two Channels

The kernel provides exactly two communication mechanisms:

**Channel 1: Lifecycle callbacks (typed ctx)**

`onCreate`, `onInit`, `onStart`, `onStop`, `onDestroy` -- each receives a typed `ctx` object. These are the structured, predictable communication points. The kernel calls them in a defined order.

**Channel 2: Events -- `emit(name, payload)` (unified)**

A single `emit` method handles all event communication. Known event names (declared in the framework's `EventContract`) get fully typed payloads. Unknown event names (any string) are allowed as an untyped escape hatch for ad-hoc plugin-to-plugin communication.

---

## 2. emit -- Unified Events

```typescript
emit: {
  // Overload 1: known event name -- typed required payload
  <K extends string & keyof Events>(name: K, payload: Events[K]): Promise<void>;
  // Overload 2: unknown event name -- untyped optional payload (escape hatch)
  (name: string, payload?: unknown): Promise<void>;
};
```

- Known names constrained to `EventContract` keys -- payload type checked at compile time
- Unknown names allowed as untyped escape hatch -- payload is optional `unknown`
- Defined by framework author (Layer 2) for known events
- Plugin authors can emit ad-hoc events via the untyped overload
- Convention: `app:*` for kernel events, `page:*`, `build:*` for framework events, `pluginName:eventName` for plugin events

**emit is overloaded:** Known event names (in EventContract) get strict type checking. Unknown names fall through to the untyped overload. One method, two behaviors. This replaces the previous dual `emit`/`signal` model with a single unified approach.

When `EventContract` is `{}` (the default): the first overload matches nothing. All events are untyped. Zero cost for frameworks that don't use it.

---

## 3. EventContract

The `EventContract` is a type-level declaration of "events this framework declares." Defined at Layer 2 by the framework author.

```typescript
type EventContract = {
  'app:boot':           { config: BaseConfig };
  'app:ready':          { config: BaseConfig };
  'app:shutdown':       { config: BaseConfig };
  'page:render':        { path: string; html: string };
  'page:error':         { path: string; error: Error };
  'router:navigate':    { from: string; to: string };
  'router:notFound':    { path: string; fallback: string };
  'renderer:render':    { path: string; html: string };
  'auth:login':         { userId: string };
  'auth:logout':        {};
};
```

**What it does:**

1. `ctx.emit('page:render', payload)` -- TypeScript checks that `'page:render'` is a valid key and that `payload` matches `{ path: string; html: string }`.
2. `ctx.emit('myPlugin:customEvent', data)` -- Unknown name, falls through to untyped overload. No compile error. Payload is optional `unknown`.
3. **IDE autocomplete** -- Plugin authors get autocomplete for known event names and typed payload shapes.
4. **Documentation** -- The EventContract IS the documentation of the framework's event API. An LLM reads the type and knows every event that can fire.

**EventContract is Layer 2.** `moku_core` (Layer 1) is generic over `EventContract`. It doesn't define any events itself.

### Different Frameworks, Different Vocabularies

Same kernel. Different event contracts. Different frameworks.

- A site builder has `page:render`, `page:error`, `seo:meta`, `router:navigate`
- A game engine has `loop:tick`, `input:keydown`, `physics:collision`
- A CLI toolkit has `cli:beforeRun`, `cli:afterRun`, `output:write`
- A bot SDK has `agent:beforeCall`, `agent:afterCall`, `memory:store`

---

## 4. Hooks

Plugins subscribe to events via the `hooks` field on `PluginSpec`:

```typescript
hooks: {
  'page:render': (payload) => {
    // EventContract event -- payload type is { path: string; html: string }
    console.log(`Rendered ${payload.path}`);
  },
  'router:navigate': (payload) => {
    // EventContract event -- payload type is { from: string; to: string }
    console.log(`${payload.from} -> ${payload.to}`);
  },
  'myPlugin:customEvent': (payload) => {
    // Unknown event -- payload type is `unknown`, cast manually
    const { data } = payload as { data: number };
  },
}
```

**Typed hooks:** When a hook key matches a known event name in EventContract, the handler receives a typed payload. When the key is an unknown event name, the handler receives `unknown`. This is enforced via a mapped conditional type:

```typescript
hooks?: {
  [K in string]?: K extends keyof Events
    ? (payload: Events[K]) => void | Promise<void>
    : (payload: unknown) => void | Promise<void>;
};
```

**Convention: namespace with the emitting plugin's name.** `router:navigate`, `build:start`, `auth:login`. This prevents collisions. Convention, not enforced.

**Execution order:** Handlers execute in plugin registration order, sequentially. Each handler is awaited before the next. No parallelism.

---

## 5. Kernel-Emitted Events

Regardless of what the framework puts in `EventContract`, the kernel always emits:

| Event | When | Payload |
|---|---|---|
| `app:start` | Before plugin onStart calls | `{ config }` |
| `app:stop` | After plugin onStop calls | `{ config }` |
| `app:destroy` | After plugin onDestroy calls | `{}` |

If the framework's `EventContract` includes these keys, the payload type is enforced. If not, they still fire with the default payload via the untyped overload.

---

## 6. What About Middleware / Pipes?

**Not in the kernel.** If a plugin needs request transformation, build pipeline, or render chain, it implements that internally. The plugin exposes an API method for other plugins to register middleware:

```typescript
// A plugin that wants middleware: implement it yourself
const HttpPlugin = createPlugin('http', {
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

// Another plugin registers middleware via the API
const AuthPlugin = createPlugin('auth', {
  onInit: (ctx) => {
    const http = ctx.require<{ use: Function }>('http');
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
