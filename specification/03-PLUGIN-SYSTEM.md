# 03 - Plugin System

**Domain:** PluginSpec, createPlugin, depends, lifecycle methods
**Architecture:** Plugins are the only extensibility primitive

---

## 1. PluginSpec

The plugin spec is a plain object that describes a plugin's behavior. All fields are optional. Types are inferred from values -- no explicit generics needed.

```typescript
{
  /** Complete default config. Presence makes config OPTIONAL for consumer. */
  config?: C,

  /** Instance-based dependencies. Validated at startup (not a topological sort). */
  depends?: readonly PluginInstance[],

  /** Create internal mutable state. Minimal context: global config + plugin config.
      Plugins without createState receive an empty {} as state at runtime. */
  createState?: (ctx: { global: Readonly<Config>; config: Readonly<C> }) => S,

  /** Build the public API mounted on app.<pluginName>. Full context. */
  api?: (ctx: PluginContext) => A,

  /** All plugins created and APIs mounted. Synchronous, forward order during createApp. */
  onInit?: (ctx: PluginContext) => void,

  /** App is starting. Forward order during app.start(). */
  onStart?: (ctx: PluginContext) => void | Promise<void>,

  /** Teardown. REVERSE order during app.stop(). */
  onStop?: (ctx: { global: Readonly<Config> }) => void | Promise<void>,

  /** Event subscriptions. Receives PluginContext; payloads fully typed. */
  hooks?: (ctx: PluginContext) => {
    [K in string & keyof MergedEvents]?: (payload: MergedEvents[K]) => void | Promise<void>;
  },

  /** Static helper/factory functions spread onto the PluginInstance.
      Helpers run BEFORE createApp -- they produce typed values for pluginConfigs.
      No ctx, no lifecycle, no side effects. Pure factories only. */
  helpers?: {
    [key: string]: (...args: any[]) => any;
  },
}
```

**Type inference:** `C` is inferred from `config`, `S` from `createState` return value, `A` from `api` return value, `Helpers` from the `helpers` object. The framework's `Config` and `Events` types flow in from `createCoreConfig` via closures. No manual annotation needed.

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

**Reserved names:** Plugin names cannot conflict with app methods or dangerous object keys. The following names are reserved and will throw a `TypeError` at registration: `start`, `stop`, `emit`, `require`, `has`, `config`, `__proto__`, `constructor`, `prototype`.

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

### Example 4: Plugin with Helpers

```typescript
// my-framework/src/plugins/router/index.ts
import { createPlugin } from '../../config';

type Route = { path: string; component: string };

export const routerPlugin = createPlugin('router', {
  config: { routes: [] as Route[] },
  createState: () => ({ currentPath: '/' }),
  api: (ctx) => ({
    navigate: (path: string) => {
      ctx.state.currentPath = path;
    },
    current: () => ctx.state.currentPath,
  }),
  helpers: {
    route: (path: string, component: string): Route => ({ path, component }),
  },
});
```

Consumer usage:

```typescript
// my-blog/src/main.ts
import { createApp } from 'my-framework';
import { routerPlugin } from 'my-framework/plugins/router';

// Helpers are available on the plugin instance BEFORE createApp:
const home = routerPlugin.route('/home', 'HomePage');
const about = routerPlugin.route('/about', 'AboutPage');

const app = createApp({
  pluginConfigs: {
    router: { routes: [home, about] },
  },
});
```

Helpers are **static pure functions** — no `ctx`, no lifecycle access, no side effects. They run before `createApp` and produce typed values that consumers pass into `pluginConfigs`. The return type of `createPlugin` is `PluginInstance<...> & Helpers`, so `routerPlugin.route(...)` is fully typed with IDE autocomplete.

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
- Does not restrict `ctx.require()` to only declared dependencies at runtime

`depends` is explicit validated metadata: it documents hard dependencies, validates presence/order at startup, and expands the typed event surface. It is not a runtime capability wall.

**Visibility for LLMs and tooling:** With `depends`, an LLM can read a plugin's spec without executing any code and know what plugins must precede it. This is pure metadata extractable statically.

---

## 4. Plugin Lifecycle Methods

Three lifecycle methods, each running at a specific phase:

| Method | When | Direction | Context |
|---|---|---|---|
| `onInit` | During `createApp` | Forward (A, B, C) | Full PluginContext |
| `onStart` | During `app.start()` | Forward (A, B, C) | Full PluginContext |
| `onStop` | During `app.stop()` | **Reverse** (C, B, A) | Minimal (global config only) |

All lifecycle methods support async: `void | Promise<void>`. Execution is sequential -- Plugin A's method completes (including await) before Plugin B's method begins.

Three factory methods run during `createApp` before lifecycle:

| Method | When | Context |
|---|---|---|
| `createState` | First, before hooks and APIs | Minimal: `{ global, config }`. Default: `{}` if omitted. |
| `hooks` | After state, before APIs | Full PluginContext |
| `api` | After hooks registered | Full PluginContext |

See [06-LIFECYCLE](./06-LIFECYCLE.md) for detailed phase documentation.

---

## 5. Core Plugins

Core plugins are self-contained infrastructure plugins (log, storage, env) whose APIs are injected directly onto every regular plugin's context. They are created with the standalone `createCorePlugin(name, spec)` function, which is independent of any framework binding.

### CorePluginSpec Shape

```typescript
type CorePluginContext<C, S> = {
  readonly config: Readonly<C>;
  state: S;
};

type CorePluginSpec<C, S, A> = {
  config?: C;
  createState?: (context: { readonly config: Readonly<C> }) => S;
  api?: (context: CorePluginContext<C, S>) => A;
  onInit?: (context: CorePluginContext<C, S>) => void;
  onStart?: (context: CorePluginContext<C, S>) => void | Promise<void>;
  onStop?: (context: CorePluginContext<C, S>) => void | Promise<void>;
};
```

### Constraints (Self-Contained by Design)

Core plugins deliberately omit everything that connects regular plugins to each other and to the framework:

| Feature | Regular Plugin | Core Plugin |
|---|---|---|
| `require` | Yes -- access other plugin APIs | **No** |
| `depends` | Yes -- declare dependencies | **No** |
| `has` | Yes -- check plugin existence | **No** |
| `events` | Yes -- register callback | **No** |
| `hooks` | Yes -- subscribe to events | **No** |
| `ctx.global` | Yes -- framework global config | **No** |
| `ctx.emit` | Yes -- emit typed events | **No** |

Core plugin context is minimal: `{ config, state }`. This makes core plugins completely independent of the plugin graph, event system, and global config. They can be tested in isolation with zero framework setup.

### API Injection

Core plugin APIs are injected flat onto every regular plugin's context, namespaced by the core plugin's name:

```typescript
// In any regular plugin's api, onInit, onStart, hooks, etc.:
api: (ctx) => ({
  doSomething: () => {
    ctx.log.info('hello');     // core plugin API — injected flat
    ctx.env.isDev();           // another core plugin API
    ctx.storage.get('key');    // another core plugin API
  },
}),
```

Regular plugins do not need to declare `depends` on core plugins. Core plugin APIs are always available on the context.

### Lifecycle Order

Core plugins run their lifecycle before regular plugins on startup and after regular plugins on shutdown:

| Phase | Order |
|---|---|
| `onInit` | Core plugins first (forward), then regular plugins (forward) |
| `onStart` | Core plugins first (forward), then regular plugins (forward) |
| `onStop` | Regular plugins first (reverse), then core plugins (reverse) |

This guarantees that infrastructure (logging, storage, env) is available before any regular plugin runs and remains available until all regular plugins have stopped.

### 4-Level Config Merge

Core plugin config is resolved through a 4-level shallow merge:

```
1. Spec defaults          — createCorePlugin('log', { config: { level: 'info' } })
2. createCoreConfig       — pluginConfigs: { log: { level: 'debug' } }
3. createCore             — pluginConfigs: { log: { level: 'warn' } }
4. createApp              — pluginConfigs: { log: { level: 'error' } }
```

Each level overrides the previous. This allows the core plugin author, framework author, framework assembler, and consumer to each set appropriate defaults.

### Example

```typescript
import { createCoreConfig, createCorePlugin } from '@moku-labs/core';

const logPlugin = createCorePlugin('log', {
  config: { level: 'info' },
  createState: () => ({ entries: [] as string[] }),
  api: (ctx) => ({
    info: (msg: string) => {
      ctx.state.entries.push(msg);
      console.log(msg);
    },
    warn: (msg: string) => {
      ctx.state.entries.push(msg);
      console.warn(msg);
    },
  }),
  onInit: (ctx) => {
    // Core plugin init runs before any regular plugin
  },
});

const { createPlugin, createCore } = createCoreConfig<Config, Events>('my-site', {
  config: { siteName: 'My Site' },
  plugins: [logPlugin],
  pluginConfigs: { log: { level: 'debug' } },
});

// Regular plugins automatically get ctx.log.info(...), ctx.log.warn(...)
const routerPlugin = createPlugin('router', {
  api: (ctx) => ({
    navigate: (path: string) => {
      ctx.log.info(`Navigating to ${path}`);  // core plugin API on context
    },
  }),
});
```

See [02-CORE-API §6](./02-CORE-API.md) for the `createCorePlugin` function signature.

---

## Cross-References

- Core API: [02-CORE-API](./02-CORE-API.md)
- Factory chain: [04-FACTORY-CHAIN](./04-FACTORY-CHAIN.md)
- Config resolution: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Context object: [08-CONTEXT](./08-CONTEXT.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
