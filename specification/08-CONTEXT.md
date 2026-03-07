# 08 - Context Object

**Domain:** ctx object, context tiers, phase-appropriate context rules, core plugin context, core API injection
**Architecture:** 3-step (createCoreConfig -> createCore -> createApp)

---

## 1. What is ctx

`ctx` is the context object passed to every plugin method. Its shape depends on which method receives it -- this is the **context tier** system.

The context is the plugin's window into the kernel. It provides access to configuration, state, event dispatch, and inter-plugin communication. What is available depends on what is safe to access at that point in the lifecycle.

---

## 2. Context Tiers

There are four context tiers. Three are for regular plugins (progressively more functionality), and one is for core plugins (self-contained):

### CorePluginContext

```typescript
type CorePluginContext<C, S> = {
  /** This core plugin's resolved config. Frozen. */
  readonly config: Readonly<C>;
  /** This core plugin's internal mutable state. */
  state: S;
};
```

Used by: all core plugin methods (`api`, `onInit`, `onStart`, `onStop`). Core plugins are self-contained infrastructure -- they have NO `global`, NO `emit`, NO `require`, NO `has`. Their context is intentionally minimal: just their own config and state. This enforces the constraint that core plugins cannot depend on other plugins or participate in the event system.

The `createState` method on a core plugin receives `{ readonly config: Readonly<C> }` (config only, no state yet).

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
  // Plus: core plugin APIs injected flat (see section 2b below)
};
```

Used by: `api`, `onInit`, `onStart`, `hooks`. Everything is live. The plugin's mutable state is available. Other plugins' APIs are accessible via `require`. Events can be emitted. Core plugin APIs are injected directly onto this context (see section 2b).

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

### 2b. Core API Injection on Regular Plugin Context

Core plugin APIs are injected **flat** onto every regular plugin's `PluginContext`. Each core plugin's `api()` return value becomes a property on `ctx`, keyed by the core plugin's name.

```typescript
// Given core plugins "log" and "env":
onInit: (ctx) => {
  ctx.log.info('Plugin initialized');   // from core plugin "log"
  ctx.log.error('Something failed');
  if (ctx.env.isDev()) {                // from core plugin "env"
    ctx.log.info('Running in dev mode');
  }

  // Standard PluginContext properties still available:
  ctx.global;       // global config
  ctx.config;       // this plugin's config
  ctx.state;        // this plugin's state
  ctx.emit;         // event dispatch
  ctx.require;      // inter-plugin API access
  ctx.has;          // plugin existence check
},
```

Core APIs are available on the context in all regular plugin methods that receive `PluginContext` (`api`, `hooks`, `onInit`, `onStart`). They are NOT available on `MinimalContext` (used by `createState`) or `TeardownContext` (used by `onStop`).

Core APIs are always present -- regular plugins do not need to declare dependencies on core plugins via `depends`, and cannot opt out. This is infrastructure, not a dependency.

---

## 3. Which Method Gets What

**Regular plugins:**

| Method | Context Tier | Why |
|--------|-------------|------|
| `createState` | MinimalContext | State not yet created, only config available |
| `hooks` | PluginContext (+ core APIs) | Full context needed to build hook handlers |
| `api` | PluginContext (+ core APIs) | Full context needed to build API methods |
| `onInit` | PluginContext (+ core APIs) | Plugin fully initialized, can interact with deps |
| `onStart` | PluginContext (+ core APIs) | App is starting, full context |
| `onStop` | TeardownContext | Minimal context, teardown should not depend on other plugins' state |

**Core plugins:**

| Method | Context Tier | Why |
|--------|-------------|------|
| `createState` | `{ config }` | State not yet created, only config available |
| `api` | CorePluginContext | Self-contained, only own config and state |
| `onInit` | CorePluginContext | Self-contained, only own config and state |
| `onStart` | CorePluginContext | Self-contained, only own config and state |
| `onStop` | CorePluginContext | Self-contained, only own config and state |

### Context Growth Through Lifecycle

**Regular plugins:**

```
createState:    { global, config }                            (minimal)
hooks:          { global, config, state, emit,                (full + core APIs)
                  require, has, log, env, ... }
api:            { global, config, state, emit,                (full + core APIs)
                  require, has, log, env, ... }
onInit:         { global, config, state, emit,                (full + core APIs)
                  require, has, log, env, ... }
onStart:        { global, config, state, emit,                (full + core APIs)
                  require, has, log, env, ... }
onStop:         { global }                                    (teardown)
```

**Core plugins (all methods):**

```
createState:    { config }                                    (config only)
api:            { config, state }                             (self-contained)
onInit:         { config, state }                             (self-contained)
onStart:        { config, state }                             (self-contained)
onStop:         { config, state }                             (self-contained)
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

Best practice: use `require` for **hard dependencies** declared in `depends`. The runtime accepts any registered plugin instance; `depends` is the explicit validated declaration of hard dependencies. If a required plugin is missing, `require` throws with a clear error.

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
