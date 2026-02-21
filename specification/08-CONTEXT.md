# 08 - Context Object

**Domain:** ctx object, context tiers, phase-appropriate context rules
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1)

---

## 1. Overview

`ctx` is the real API. Every lifecycle method and API factory receives it. This is the "syscall interface" of Moku.

---

## 2. Context Tiers

The context system uses four tiers, each structurally extending the previous. Context grows through the lifecycle:

```
TeardownContext (least) -> MinimalContext -> InitContext -> PluginContext (most)
```

All context types use unified `EventContract` (single generic for all events).

### TeardownContext

```typescript
type TeardownContext<G> = {
  /** Global config (BaseConfig merged with consumer overrides). Frozen. */
  readonly global: Readonly<G>;
};
```

Used by: `onStop`, `onDestroy`. During teardown, plugins may be partially or fully stopped. Minimal context prevents reliance on other plugins.

### MinimalContext

```typescript
type MinimalContext<G, C> = TeardownContext<G> & {
  /** This plugin's resolved config. Frozen. */
  readonly config: Readonly<C>;
};
```

Used by: `createState`, `onCreate`. At this stage, not all plugins have been created yet. Communication methods are intentionally unavailable.

### InitContext

```typescript
type InitContext<
  G,
  Events extends Record<string, unknown>,
  C,
  Deps extends readonly PluginLikeInstance[] = readonly PluginLikeInstance[]
> = MinimalContext<G, C> & {
  /**
   * Fire an event. Overloaded:
   *   - Known names (in EventContract): typed required payload.
   *   - Unknown names: untyped optional payload (escape hatch).
   */
  emit: {
    <K extends string & keyof Events>(name: K, payload: Events[K]): Promise<void>;
    (name: string, payload?: unknown): Promise<void>;
  };

  /**
   * Get plugin API by instance or name. Three overload tiers:
   * 1. Pass instance from depends -> fully typed API | undefined
   * 2. Pass name string from depends tuple -> typed API | undefined
   * 3. Pass any string -> unknown (untyped escape hatch)
   */
  getPlugin: { ... };

  /**
   * Get plugin API or throw. Three overload tiers (same as getPlugin).
   */
  require: { ... };

  /** Check if a plugin is registered. */
  has: (name: string) => boolean;
};
```

Used by: `onInit`. All plugins are created and APIs are mounted. Dependencies can be checked with `require`/`has`.

### PluginContext

```typescript
type PluginContext<
  G,
  Events extends Record<string, unknown>,
  C,
  S,
  Deps extends readonly PluginLikeInstance[] = readonly PluginLikeInstance[]
> = InitContext<G, Events, C, Deps> & {
  /** This plugin's internal mutable state. Mutable by design. */
  state: S;
};
```

Used by: `api`, `onStart`. Everything is live. The plugin's internal mutable state is available. This is the richest context tier.

---

## 3. Which Lifecycle Gets What

| Lifecycle | Context received | Rationale |
|---|---|---|
| `createState` | `{ global, config }` | State factory. No other plugins exist yet. No emit, no getPlugin. |
| `onCreate` | `{ global, config }` | Validate config. No other plugins available. |
| `api` | `PluginContext` (full) | Build public API. State available. Other plugins accessible. |
| `onInit` | `InitContext` (full except state) | All plugins created and APIs mounted. Check deps with `require`/`has`. |
| `onStart` | `PluginContext` (full) | App is starting. Everything is live. Async allowed. |
| `onStop` | `{ global }` | Teardown. Minimal context -- don't rely on other plugins. |
| `onDestroy` | `{ global }` | Final cleanup. Same as onStop. |

---

## 4. Phase-Appropriate Context Rules

**Critical rule: `require`/`has`/`getPlugin`/`emit` are NOT available in `createState` or `onCreate`.**

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
api:            { global, config, state, emit,                (full)
                  getPlugin, require, has }
onInit:         { global, config, emit,                       (full except state)
                  getPlugin, require, has }
onStart:        { global, config, state, emit,                (full)
                  getPlugin, require, has }
onStop:         { global }                                    (minimal)
onDestroy:      { global }                                    (minimal)
```

### onStop/onDestroy Minimal Context

During teardown, plugins may be partially or fully stopped. Accessing other plugins' APIs during teardown is unreliable -- the plugin you depend on might have already been stopped (since teardown is in reverse order). The minimal context `{ global }` forces plugins to handle their own cleanup independently.

---

## 5. Context Methods

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

Fire an event. Overloaded: known event names (in EventContract) get typed required payload. Unknown names get untyped optional payload. See [07-COMMUNICATION](./07-COMMUNICATION.md).

---

## Cross-References

- Plugin spec: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Communication: [07-COMMUNICATION](./07-COMMUNICATION.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
