# 03 - Plugin System

**Domain:** PluginSpec, createPlugin, depends, sub-plugins, lifecycle methods
**Architecture:** Plugins are the only extensibility primitive in v3

---

## 1. PluginSpec

The plugin spec is a plain object that describes a plugin's behavior. All fields are optional. Types are inferred from values -- no explicit generics needed.

```typescript
{
  /** Complete default config. Presence makes config OPTIONAL for consumer. */
  config?: C,

  /** Instance-based dependencies. Validated at startup (not a topological sort). */
  depends?: readonly PluginInstance[],

  /** Sub-plugins. Flattened depth-first, children registered before parent. */
  plugins?: PluginInstance[],

  /** Create internal mutable state. Minimal context: global config + plugin config. */
  createState?: (ctx: { global: Readonly<Config>; config: Readonly<C> }) => S,

  /** Build the public API mounted on app.<pluginName>. Full context. */
  api?: (ctx: PluginContext) => A,

  /** All plugins created and APIs mounted. Forward order during createApp. */
  onInit?: (ctx: PluginContext) => void | Promise<void>,

  /** App is starting. Forward order during app.start(). */
  onStart?: (ctx: PluginContext) => void | Promise<void>,

  /** Teardown. REVERSE order during app.stop(). */
  onStop?: (ctx: { global: Readonly<Config> }) => void | Promise<void>,

  /** Event subscriptions. Receives PluginContext; payloads fully typed. */
  hooks?: (ctx: PluginContext) => {
    [K in string & keyof MergedEvents]?: (payload: MergedEvents[K]) => void | Promise<void>;
  },
}
```

**Type inference:** `C` is inferred from `config`, `S` from `createState` return value, `A` from `api` return value. The framework's `Config` and `Events` types flow in from `createCoreConfig` via closures. No manual annotation needed.

**MergedEvents:** The intersection of global `Events` (from `createCoreConfig`) + any `PluginEvents` declared via the `events` register callback on this plugin + events from plugins in `depends`. This determines what event names are typed in `hooks` and `ctx.emit`. See [14-EVENT-REGISTRATION](./14-EVENT-REGISTRATION.md) for the register callback pattern.

---

## 2. createPlugin

```typescript
function createPlugin(
  name: string,
  spec: PluginSpec,
): PluginInstance;
```

**Zero generics.** All types are inferred from the spec object -- config from `config`, state from `createState`, API from `api`, and events from the `events` register callback. Config and Events flow in from the `createCoreConfig` closure.

### Example 1: Zero Events (Most Common)

```typescript
// my-framework/src/plugins/router/index.ts
import { createPlugin } from '../../config';

export const routerPlugin = createPlugin('router', {
  config: {
    basePath: '/',
    notFoundRedirect: '/404',
  },
  createState: () => ({
    currentPath: '/',
    history: [] as string[],
  }),
  api: (ctx) => ({
    navigate: (path: string) => {
      ctx.state.history.push(ctx.state.currentPath);
      ctx.state.currentPath = path;
      ctx.emit('router:navigate', { from: ctx.state.history.at(-1)!, to: path });
    },
    current: () => ctx.state.currentPath,
    back: () => {
      const prev = ctx.state.history.pop();
      if (prev) ctx.state.currentPath = prev;
    },
  }),
  onInit: (ctx) => {
    // All plugins registered, can check dependencies
  },
  onStart: (ctx) => {
    // App is starting, begin routing
  },
  onStop: () => {
    // Cleanup
  },
});
```

TypeScript infers:
- Config type from `config`: `{ basePath: string; notFoundRedirect: string }`
- State type from `createState` return: `{ currentPath: string; history: string[] }`
- API type from `api` return: `{ navigate(path: string): void; current(): string; back(): void }`

### Example 2: Plugin with Events (Register Callback)

```typescript
// my-framework/src/plugins/renderer/index.ts
import { createPlugin } from '../../config';

export const rendererPlugin = createPlugin('renderer', {
  events: (register) => ({
    'renderer:render': register<{ path: string; html: string }>('Triggered after render'),
    'renderer:error':  register<{ path: string; error: Error }>('Triggered on render error'),
  }),
  config: {
    template: 'default',
  },
  api: (ctx) => ({
    render: (path: string, data: Record<string, unknown>) => {
      const html = `<div>${JSON.stringify(data)}</div>`;
      // ctx.emit is typed: knows about renderer events + global Events
      ctx.emit('renderer:render', { path, html });
      return html;
    },
  }),
  hooks: (ctx) => ({
    // Can listen to global events defined in createCoreConfig
    'page:render': (payload) => {
      // payload typed from global Events; ctx is full PluginContext
    },
  }),
});
```

The `events` register callback declares per-plugin events. `ctx.emit('renderer:render', ...)` is fully typed. Other plugins that declare `depends: [rendererPlugin]` also get these events typed in their `hooks` and `ctx.emit`. See [14-EVENT-REGISTRATION](./14-EVENT-REGISTRATION.md) for the full pattern specification.

### Example 3: Plugin with depends

```typescript
// my-framework/src/plugins/seo/index.ts
import { createPlugin } from '../../config';
import { routerPlugin } from '../router';
import { rendererPlugin } from '../renderer';

export const seoPlugin = createPlugin('seo', {
  depends: [routerPlugin, rendererPlugin],
  config: {
    defaultTitle: 'Untitled',
  },
  api: (ctx) => ({
    setTitle: (title: string) => {
      // ctx.require returns typed API from the dependency
      const currentPath = ctx.require(routerPlugin).current();
      void ctx.emit('renderer:render', {
        path: currentPath,
        html: `<title>${title}</title>`,
      });
    },
  }),
  hooks: (ctx) => ({
    // Can listen to events from dependencies (RendererEvents)
    'renderer:render': (payload) => {
      // payload typed as { path: string; html: string }
      // ctx provides full PluginContext: state, emit, require, etc.
    },
  }),
});
```

Because `depends: [routerPlugin, rendererPlugin]` is declared:
- `ctx.require(routerPlugin)` returns the router API, fully typed
- `hooks` can listen to events from both global Events and renderer's plugin events
- Dependency validation ensures router and renderer are registered before seo

---

## 3. The `depends` Field

```typescript
depends?: readonly PluginInstance[]
```

The `depends` field accepts an array of plugin instances. Since you import a plugin to depend on it, you already have the instance reference with its types. TypeScript infers the tuple type from the array, enabling fully typed `ctx.require`.

### What `depends` Does at Startup

1. For each plugin with `depends`, check that every dependency exists in the registered plugin list.
2. Check that every dependency appears BEFORE the dependent plugin in the list.
3. If either check fails, throw with a clear error:

```
[moku-site] Plugin "seo" depends on "auth", but "auth" is not registered.
  Add "auth" to your plugin list before "seo".

[moku-site] Plugin "seo" depends on "router", but "router" appears after "seo".
  Move "router" before "seo" in your plugin list.
```

### What `depends` Enables at Runtime

- `ctx.require(plugin)` -- returns the typed API of the dependency, or throws if not found
- Typed `hooks` -- can listen to events declared by dependency plugins
- Typed `ctx.emit` -- can emit events declared by dependency plugins

### What `depends` Does NOT Do

- Does not auto-reorder plugins (no topological sort)
- Does not create new concepts (no "dependency graph", no "resolution algorithm")
- Does not change plugin execution order (plugins run in array order, always)

**Visibility for LLMs and tooling:** With `depends`, an LLM can read a plugin's spec without executing any code and know what plugins must precede it. This is pure metadata extractable statically.

---

## 4. Sub-Plugins

Plugins can declare their own sub-plugins via the `plugins` field:

```typescript
const authPlugin = createPlugin('auth', {
  plugins: [sessionPlugin, tokenPlugin],
  depends: [sessionPlugin, tokenPlugin],
  api: (ctx) => ({
    authenticate: (credentials: { user: string; pass: string }) => {
      const session = ctx.require(sessionPlugin).create();
      const token = ctx.require(tokenPlugin).sign(session);
      return { session, token };
    },
  }),
});
```

### Flattening Rule

Sub-plugins are flattened depth-first, children before parent. This means:
- `sessionPlugin` and `tokenPlugin` are registered before `authPlugin`
- Their APIs are available when `authPlugin`'s lifecycle runs

Given:
```
[
  pluginA { plugins: [subPlugin1, subPlugin2] },
  pluginB
]
```

Flattened result:
```
[subPlugin1, subPlugin2, pluginA, pluginB]
```

This is a convenience feature for organizing related plugins. The consumer can also just list all plugins in the correct order.

---

## 5. Plugin Lifecycle Methods

Three lifecycle methods, each running at a specific phase:

| Method | When | Direction | Context |
|---|---|---|---|
| `onInit` | During `createApp` | Forward (A, B, C) | Full PluginContext |
| `onStart` | During `app.start()` | Forward (A, B, C) | Full PluginContext |
| `onStop` | During `app.stop()` | **Reverse** (C, B, A) | Minimal (global config only) |

All lifecycle methods support async: `void | Promise<void>`. Execution is sequential -- Plugin A's method completes (including await) before Plugin B's method begins.

Two factory methods run during `createApp` before lifecycle:

| Method | When | Context |
|---|---|---|
| `createState` | First, before APIs | Minimal: `{ global, config }` |
| `api` | After state created | Full PluginContext |

See [06-LIFECYCLE](./06-LIFECYCLE.md) for detailed phase documentation.

---

## Cross-References

- Core API: [02-CORE-API](./02-CORE-API.md)
- Factory chain: [04-FACTORY-CHAIN](./04-FACTORY-CHAIN.md)
- Config resolution: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Context object: [08-CONTEXT](./08-CONTEXT.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
