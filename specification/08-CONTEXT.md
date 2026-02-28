# 08 - Context Object

**Domain:** ctx object, context tiers, phase-appropriate context rules
**Version:** v3 (3-step architecture)

---

## 1. What is ctx

`ctx` is the context object passed to every plugin method. Its shape depends on which method receives it -- this is the **context tier** system.

The context is the plugin's window into the kernel. It provides access to configuration, state, event dispatch, and inter-plugin communication. What is available depends on what is safe to access at that point in the lifecycle.

---

## 2. Context Tiers

v3 has three context tiers, each providing progressively more functionality:

### MinimalContext

```typescript
type MinimalContext<Config, C> = {
  /** Global config (from createCoreConfig, merged with consumer overrides). Frozen. */
  readonly global: Readonly<Config>;
  /** This plugin's resolved config. Frozen. */
  readonly config: Readonly<C>;
};
```

Used by: `createState`. At this stage, the plugin's state does not exist yet (it is being created). Other plugins may not be fully created. Only configuration is available. Plugins that omit `createState` receive an empty `{}` as their state at runtime.

### PluginContext

```typescript
type PluginContext<Config, Events extends Record<string, unknown>, C, S> = {
  /** Global config. Frozen. */
  readonly global: Readonly<Config>;
  /** This plugin's resolved config. Frozen. */
  readonly config: Readonly<C>;
  /** This plugin's internal mutable state. Mutable by design. */
  state: S;
  /**
   * Fire an event. Strictly typed:
   * Only known names (in Events + PluginEvents + DepsEvents) accepted with typed required payload.
   */
  emit: EmitFunction<Events>;
  /**
   * Get plugin API or throw. Instance-only, fully typed.
   */
  require: RequireFunction;
  /** Check if a plugin is registered by name. String-based (boolean check). */
  has: (name: string) => boolean;
};
```

Used by: `api`, `onInit`, `onStart`, `hooks`. Everything is live. The plugin's mutable state is available. Other plugins' APIs are accessible via `require`. Events can be emitted.

The `Events` parameter in PluginContext is the merged event map (`Events & PluginEvents & DepsEvents`), computed by the PluginSpec type. Dependencies are handled at the PluginSpec level, not within PluginContext itself.

### TeardownContext

```typescript
type TeardownContext<Config> = {
  /** Global config. Frozen. Minimal context for safe teardown. */
  readonly global: Readonly<Config>;
};
```

Used by: `onStop`. During teardown, plugins are being stopped in reverse order. Other plugins may already be stopped. The minimal context prevents reliance on other plugins' state or APIs during cleanup.

---

## 3. Which Method Gets What

| Method | Context Tier | Why |
|--------|-------------|------|
| `createState` | MinimalContext | State not yet created, only config available |
| `api` | PluginContext | Full context needed to build API methods |
| `onInit` | PluginContext | Plugin fully initialized, can interact with deps |
| `onStart` | PluginContext | App is starting, full context |
| `onStop` | TeardownContext | Minimal context, teardown should not depend on other plugins' state |

### Context Growth Through Lifecycle

```
createState:    { global, config }                            (minimal)
api:            { global, config, state, emit,                (full)
                  require, has }
onInit:         { global, config, state, emit,                (full)
                  require, has }
onStart:        { global, config, state, emit,                (full)
                  require, has }
onStop:         { global }                                    (minimal)
```

---

## 4. Phase-Appropriate Context Rules

**Critical rule: `require`/`has`/`emit`/`state` are NOT available in `createState`.**

At that point, not all plugins have been created. Providing these methods would be a lie -- they would return incomplete data.

### Why the Context Varies

This is a conscious design decision. The alternative -- providing the same full ctx everywhere -- would mean:

- `createState` could call `require(otherPlugin)` before `other` exists.
- Early lifecycle methods could call `emit('event')` when not all hooks are registered.
- Errors would be mysterious and timing-dependent.

By restricting context per phase, the kernel prevents an entire class of ordering bugs. The consumer never has to think about "is this plugin ready yet?" -- the type system tells them what's available.

### onStop Minimal Context

During teardown, plugins may be partially or fully stopped. Accessing other plugins' APIs during teardown is unreliable -- the plugin you depend on might have already been stopped (since teardown is in reverse order). The minimal context `{ global }` forces plugins to handle their own cleanup independently.

---

## 5. ctx.global

`ctx.global` is `Readonly<Config>` -- the frozen global configuration. All plugins see the same global config. It is set once during `createApp` and never changes.

```typescript
onInit: (ctx) => {
  console.log(ctx.global.siteName);  // typed, frozen
  ctx.global.siteName = 'new';       // compile error: readonly
},
```

`ctx.global` contains only the global configuration. There is no `state` field on `ctx.global`.

---

## 6. ctx.state

Plugin-local mutable state. Created by `createState()`, private to the owning plugin. Other plugins cannot access it -- it is not exposed on the app object or through `require`. Plugins that omit `createState` get an empty `{}` as state at runtime.

```typescript
const counterPlugin = createPlugin('counter', {
  createState: () => ({ count: 0 }),
  api: (ctx) => ({
    increment: () => { ctx.state.count += 1; },
    getCount: () => ctx.state.count,
  }),
});
```

`ctx.state` is the ONLY mutable thing in the system. Configs are frozen. The app is frozen. State is the deliberate escape hatch for runtime mutation.

---

## 7. ctx.require and ctx.has

### `require(plugin)` -- Instance-Only, Fully Typed

Returns the plugin's public API object or throws with a clear error message. Only accepts a PluginInstance reference -- no string overload.

```typescript
// In a plugin with depends: [routerPlugin]
const router = ctx.require(routerPlugin);
//    ^? RouterApi -- fully typed, no cast needed
router.navigate('/about');  // full autocomplete
```

Use `require` for **hard dependencies** declared in `depends`. These MUST exist -- `require` throws with a clear error if the plugin is not registered.

**Error messages:**

```
Error: [moku-site] Plugin "dashboard" requires "auth", but "auth" is not registered.
  Add "auth" to your plugin list.
```

### `has(name)`

Returns `boolean`. Never throws. Stays string-based -- it's a boolean check with no type inference needed.

**Not restricted by depends** -- `has` always checks global registration, even when the plugin declares `depends`. Use for branching logic.

```typescript
if (ctx.has('analytics')) {
  const analytics = ctx.require(analyticsPlugin);
  analytics.track('pageview');
}
```

---

## 8. ctx.emit

Dispatches strictly typed events. Only known event names are accepted. See [07-COMMUNICATION](./07-COMMUNICATION.md) and [14-EVENT-REGISTRATION](./14-EVENT-REGISTRATION.md) for full documentation.

```typescript
// Known event -- typed payload
ctx.emit('page:render', { path: '/about', html: '<h1>About</h1>' });

// Unknown event -- compile error (no escape hatch)
ctx.emit('my:custom:event', { anything: true });  // ERROR
```

---

## 9. Consumer Callback Context (AppCallbackContext)

Consumer lifecycle callbacks (`onReady`, `onStart`, `onStop`, `onError`) passed to `createApp` receive a richer context than plugin methods:

```typescript
type AppCallbackContext<Config, Events, P> = {
  readonly config: Readonly<Config>;
  readonly emit: EmitFunction<Events>;
  readonly require: RequireFunction;
  readonly has: HasFunction;
} & BuildPluginApis<P>;
```

This includes frozen global config, event emission, plugin lookup, and all mounted plugin APIs. Consumer callbacks can access `ctx.router.navigate()`, `ctx.emit(...)`, etc.

Note: Framework-level `onReady` (passed to `createCore`) receives only `{ config: Readonly<Config> }` -- a minimal context since it runs before consumer callbacks.

---

## Cross-References

- Plugin spec: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Communication: [07-COMMUNICATION](./07-COMMUNICATION.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
