# 08 - Context Object

**Domain:** ctx object, BaseCtx, PluginCtx, phase-appropriate context rules
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1)

---

## 1. Overview

`ctx` is the real API. Every lifecycle method and API factory receives it. This is the "syscall interface" of Moku.

---

## 2. Base Context

### Variant A: Without SignalRegistry

```typescript
type BaseCtx<
  G extends Record<string, any>,
  Bus extends Record<string, any>,
> = {
  /** Global config (BaseConfig merged with consumer overrides). Frozen. */
  readonly global: Readonly<G>;

  /** Fire typed event. Constrained to BusContract keys. Payload type-checked. */
  emit: <K extends string & keyof Bus>(hook: K, payload: Bus[K]) => Promise<void>;

  /** Fire untyped event. Any string, any payload. Plugin-to-plugin ad-hoc. */
  signal: (name: string, payload?: any) => Promise<void>;

  /** Get plugin API by name. Returns undefined if not found. */
  getPlugin: <T = any>(name: string) => T | undefined;

  /** Get plugin API or throw with clear error. */
  require: <T = any>(name: string) => T;

  /** Check if a plugin is registered. */
  has: (name: string) => boolean;
};
```

### Variant B: With SignalRegistry

```typescript
type BaseCtx<
  G extends Record<string, any>,
  Bus extends Record<string, any>,
  Signals extends Record<string, any>,
> = {
  /** Global config (BaseConfig merged with consumer overrides). Frozen. */
  readonly global: Readonly<G>;

  /** Fire typed event. Constrained to BusContract keys. Payload type-checked. */
  emit: <K extends string & keyof Bus>(hook: K, payload: Bus[K]) => Promise<void>;

  /**
   * Fire signal. Overloaded:
   *   - Known names (in SignalRegistry): typed payload.
   *   - Unknown names: any payload (escape hatch).
   */
  signal: {
    <K extends string & keyof Signals>(name: K, payload: Signals[K]): Promise<void>;
    (name: string, payload?: any): Promise<void>;
  };

  /** Get plugin API by name. Returns undefined if not found. */
  getPlugin: <T = any>(name: string) => T | undefined;

  /** Get plugin API or throw with clear error. */
  require: <T = any>(name: string) => T;

  /** Check if a plugin is registered. */
  has: (name: string) => boolean;
};
```

---

## 3. Plugin Context (extends base)

### Variant A: Without SignalRegistry

```typescript
type PluginCtx<
  G extends Record<string, any>,
  Bus extends Record<string, any>,
  C,
  S,
> = BaseCtx<G, Bus> & {
  /** This plugin's resolved config. Frozen. */
  readonly config: Readonly<C>;

  /** This plugin's internal mutable state. Mutable by design. */
  state: S;
};
```

### Variant B: With SignalRegistry

```typescript
type PluginCtx<
  G extends Record<string, any>,
  Bus extends Record<string, any>,
  Signals extends Record<string, any>,
  C,
  S,
> = BaseCtx<G, Bus, Signals> & {
  /** This plugin's resolved config. Frozen. */
  readonly config: Readonly<C>;

  /** This plugin's internal mutable state. Mutable by design. */
  state: S;
};
```

---

## 4. Which Lifecycle Gets What

| Lifecycle | Context received | Rationale |
|---|---|---|
| `createState` | `{ global, config }` | State factory. No other plugins exist yet. No emit, no getPlugin. |
| `onCreate` | `{ global, config }` | Validate config. No other plugins available. |
| `api` | `PluginCtx` (full) | Build public API. State available. Other plugins accessible. |
| `onInit` | `BaseCtx & { config }` | All plugins created and APIs mounted. Check deps with `require`/`has`. |
| `onStart` | `PluginCtx` (full) | App is starting. Everything is live. Async allowed. |
| `onStop` | `{ global }` | Teardown. Minimal context -- don't rely on other plugins. |
| `onDestroy` | `{ global }` | Final cleanup. Same as onStop. |

---

## 5. Phase-Appropriate Context Rules

**Critical rule: `require`/`has`/`getPlugin`/`emit`/`signal` are NOT available in `createState` or `onCreate`.**

At that point, not all plugins have been created. Providing these methods would be a lie -- they'd return incomplete data.

### Why the Context Varies

This is a conscious design decision. The alternative -- providing the same full ctx everywhere -- would mean:

- `createState` could call `getPlugin('other')` before `other` exists.
- `onCreate` could call `emit('event')` when not all hooks are registered.
- Errors would be mysterious and timing-dependent.

By restricting context per phase, the kernel prevents an entire class of ordering bugs. The consumer never has to think about "is this plugin ready yet?" -- the type system tells them what's available.

### Context Growth Through Lifecycle

```
createState:    { global, config }                            (minimal)
onCreate:       { global, config }                            (minimal)
api:            { global, config, state, emit, signal,        (full)
                  getPlugin, require, has }
onInit:         { global, config, emit, signal,               (full except state)
                  getPlugin, require, has }
onStart:        { global, config, state, emit, signal,        (full)
                  getPlugin, require, has }
onStop:         { global }                                    (minimal)
onDestroy:      { global }                                    (minimal)
```

### onStop/onDestroy Minimal Context

During teardown, plugins may be partially or fully stopped. Accessing other plugins' APIs during teardown is unreliable -- the plugin you depend on might have already been stopped (since teardown is in reverse order). The minimal context `{ global }` forces plugins to handle their own cleanup independently.

---

## 6. BaseCtx Methods

### `getPlugin(pluginOrName)` -- Three Overload Tiers

Returns the plugin's public API object or `undefined` if not found. Never throws.

When the plugin declares `depends`, `getPlugin` is scoped to the declared dependencies. Accessing a plugin not in `depends` returns `undefined`.

**Tier 1: Instance overload** -- Pass a plugin instance from the `depends` tuple. Returns fully typed `API | undefined`.

```typescript
// In a plugin with depends: [routerPlugin]
const router = ctx.getPlugin(routerPlugin);
//    ^? RouterApi | undefined -- fully typed from instance phantom types
if (router) {
  router.resolve('/about'); // full autocomplete
}
```

**Tier 2: Typed string overload** -- Pass a name string that matches a plugin in `depends`. Returns typed `API | undefined`.

```typescript
// In a plugin with depends: [routerPlugin]
const router = ctx.getPlugin('router');
//    ^? RouterApi | undefined -- typed via name extracted from depends tuple
```

**Tier 3: Untyped string overload** -- Pass any string. Returns `unknown`. Escape hatch for dynamic cases.

```typescript
const plugin = ctx.getPlugin('some-dynamic-name');
//    ^? unknown
```

### `require(pluginOrName)` -- Three Overload Tiers

Returns the plugin's public API object or throws with a clear error message.

When the plugin declares `depends`, `require` is scoped to the declared dependencies. Accessing a plugin not in `depends` throws.

**Tier 1: Instance overload** -- Pass a plugin instance from the `depends` tuple. Returns fully typed `API`.

```typescript
// In a plugin with depends: [routerPlugin, authPlugin]
const router = ctx.require(routerPlugin);
//    ^? RouterApi -- fully typed, no cast needed
router.resolve('/about'); // full autocomplete
```

**Tier 2: Typed string overload** -- Pass a name string that matches a plugin in `depends`. Returns typed `API`.

```typescript
const router = ctx.require('router');
//    ^? RouterApi -- typed via name extracted from depends tuple
```

**Tier 3: Untyped string overload** -- Pass any string. Returns `unknown`. Escape hatch for dynamic cases.

```typescript
const plugin = ctx.require('some-dynamic-name');
//    ^? unknown
```

**Error messages:**

```
// Plugin not in depends:
Error: [moku-site] Plugin "auth" not in depends for "dashboard".
  Add the plugin to your depends array.

// Plugin not registered at all:
Error: [moku-site] Plugin "dashboard" requires "auth", but "auth" is not registered.
  Add "auth" to your plugin list.
```

### `has(name)`

Returns `boolean`. Never throws. Use for optional dependencies.

**Not restricted by depends** -- `has` always checks global registration, even when the plugin declares `depends`. This enables safe conditional logic before `require`.

```typescript
if (ctx.has('analytics')) {
  // Only require if registered (analytics is optional)
  const analytics = ctx.require('analytics');
  analytics.track('page:view', { path });
}
```

### `emit(name, payload)`

Fire a typed bus event. See [07-COMMUNICATION](./07-COMMUNICATION.md).

### `signal(name, payload)`

Fire a signal (typed or untyped depending on variant). See [07-COMMUNICATION](./07-COMMUNICATION.md).

---

## Cross-References

- Plugin spec: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Communication: [07-COMMUNICATION](./07-COMMUNICATION.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)

