# 07 - Communication Model

**Domain:** emit, signal, hooks, BusContract, SignalRegistry
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1), SPEC_IMPROVEMENTS_IDEAS (P3)

---

## 1. Three Channels

The kernel provides exactly three communication mechanisms:

**Channel 1: Lifecycle callbacks (typed ctx)**

`onCreate`, `onInit`, `onStart`, `onStop`, `onDestroy` -- each receives a typed `ctx` object. These are the structured, predictable communication points. The kernel calls them in a defined order.

**Channel 2: Bus events -- `emit(name, payload)` (typed)**

Constrained to event names declared in the framework's `BusContract`. Payload types are checked at compile time. These are the framework's official events.

**Channel 3: Signals -- `signal(name, payload)`**

Signals are for plugin-to-plugin ad-hoc communication. Typing depends on the variant chosen.

---

## 2. emit -- Typed Bus Events

```typescript
emit: <K extends string & keyof Bus>(hook: K, payload: Bus[K]) => Promise<void>;
```

- Names constrained to `BusContract` keys
- Payload type checked at compile time
- Defined by framework author (Layer 2)
- Use case: framework lifecycle events, known events
- Convention: `app:*`, `page:*`, `build:*`

**emit is strict:** All emit names must be declared in the BusContract. Unknown names are a compile error. This is appropriate because framework events are a closed set -- the framework author controls all of them.

---

## 3. signal -- Plugin-to-Plugin Events

### Variant A: Fully Untyped signal

```typescript
signal: (name: string, payload?: any) => Promise<void>;
```

Any string name, any payload. Fire-and-forget pub/sub. Plugin-to-plugin ad-hoc communication that the framework doesn't need to know about.

### Variant B: Optionally Typed signal (with SignalRegistry)

```typescript
signal: {
  // Overload 1: known signal name -- typed payload
  <K extends string & keyof Signals>(name: K, payload: Signals[K]): Promise<void>;
  // Overload 2: unknown signal name -- untyped escape hatch
  (name: string, payload?: any): Promise<void>;
};
```

Known signal names (declared in `SignalRegistry`) get strict typing. Unknown names fall through to `any`. One method, two behaviors.

When `SignalRegistry` is `{}` (the default): the first overload matches nothing. All signals are untyped. Zero cost for frameworks that don't use it.

---

## 4. emit vs signal Comparison

| | `emit(name, payload)` | `signal(name, payload)` |
|---|---|---|
| Names constrained to | BusContract keys | SignalRegistry keys (typed) or any string (untyped) |
| Payload type checked | Yes, always | Variant A: No / Variant B: Yes for known names, no for unknown |
| Defined by | Framework author (Layer 2) | Framework + plugin authors (Layer 2 or 3) |
| Use case | Framework lifecycle, known events | Plugin-to-plugin communication |
| Convention | `app:*`, `page:*`, `build:*` | `pluginName:eventName` |
| Unknown names | Compile error | Allowed (untyped) |
| Escape hatch | None | Built-in (via any string) |

**Rule:** Framework events go through `emit`. Plugin events go through `signal`. Both dispatch to the same `hooks` field on plugins -- a handler registered for `'router:navigate'` fires whether it came via `emit` or `signal`.

**Design rationale:** `emit` is strict because framework events are a closed set -- the framework author controls all of them. `signal` is lenient because plugin signals are an open set -- consumer plugins may define signals the framework doesn't know about.

---

## 5. BusContract

The `BusContract` is a type-level declaration of "events this framework declares." Defined at Layer 2 by the framework author.

```typescript
type BusContract = {
  'app:boot':      { config: BaseConfig };
  'app:ready':     { config: BaseConfig };
  'app:shutdown':  { config: BaseConfig };
  'page:render':   { path: string; html: string };
  'page:error':    { path: string; error: Error };
};
```

**What it does:**

1. `ctx.emit('page:render', payload)` -- TypeScript checks that `'page:render'` is a valid key and that `payload` matches `{ path: string; html: string }`.
2. **IDE autocomplete** -- Plugin authors get autocomplete for bus event names and typed payload shapes.
3. **Documentation** -- The BusContract IS the documentation of the framework's event API. An LLM reads the type and knows every event that can fire.

**BusContract is Layer 2 only.** `moku_core` (Layer 1) is generic over `BusContract`. It doesn't define any events itself.

---

## 6. SignalRegistry

The `SignalRegistry` is an optional type-level declaration of "known plugin-to-plugin signals." Defined at Layer 2 by the framework author.

```typescript
type SignalRegistry = {
  'router:navigate':  { from: string; to: string };
  'router:notFound':  { path: string; fallback: string };
  'renderer:render':  { path: string; html: string };
  'auth:login':       { userId: string };
  'auth:logout':      {};
};
```

### BusContract vs SignalRegistry

| | BusContract | SignalRegistry |
|---|---|---|
| Controls | `ctx.emit()` | `ctx.signal()` |
| Scope | Framework lifecycle events | Plugin-to-plugin events |
| Required? | No (defaults to `{}`) | No (defaults to `{}`) |
| Unknown names | Compile error | Falls through to untyped |
| Escape hatch | None -- all emit names must be declared | Built-in via overloads |

### Different Frameworks, Different Vocabularies

Same kernel. Different bus contracts. Different signal registries. Different frameworks.

- A site builder has `page:render`, `page:error`, `seo:meta`
- A game engine has `loop:tick`, `input:keydown`, `physics:collision`
- A CLI toolkit has `cli:beforeRun`, `cli:afterRun`, `output:write`
- A bot SDK has `agent:beforeCall`, `agent:afterCall`, `memory:store`

---

## 7. Hooks

Plugins subscribe to events via the `hooks` field on `PluginSpec`:

```typescript
hooks: {
  'page:render': (payload) => {
    // BusContract event -- payload type known from framework
    const { path, html } = payload as { path: string; html: string };
    console.log(`Rendered ${path}`);
  },
  'router:navigate': (payload) => {
    // Signal -- payload typed if using SignalRegistry, otherwise cast manually
    const { from, to } = payload as { from: string; to: string };
    console.log(`${from} -> ${to}`);
  },
  'myPlugin:customEvent': (payload) => {
    // Unknown signal -- cast payload manually
    const { data } = payload as { data: number };
  },
}
```

**Convention: namespace with the emitting plugin's name.** `router:navigate`, `build:start`, `auth:login`. This prevents collisions. Convention, not enforced.

**Execution order:** Handlers execute in plugin registration order, sequentially. Each handler is awaited before the next. No parallelism.

---

## 8. Kernel-Emitted Events

Regardless of what the framework puts in `BusContract`, the kernel always emits:

| Event | When | Payload |
|---|---|---|
| `app:start` | Before plugin onStart calls | `{ config }` |
| `app:stop` | After plugin onStop calls | `{ config }` |
| `app:destroy` | After plugin onDestroy calls | `{}` |

If the framework's `BusContract` includes these keys, the payload type is enforced. If not, they still fire with the default payload.

---

## 9. What About Middleware / Pipes?

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

