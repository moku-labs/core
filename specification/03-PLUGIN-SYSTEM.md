# 03 - Plugin System

**Domain:** PluginSpec, PluginInstance, createPlugin, createPluginFactory, depends
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1), SPEC_IMPROVEMENTS_IDEAS (P4, P6)

---

## 1. PluginSpec

### Variant A: Sync Lifecycle (base)

```typescript
interface PluginSpec<
  N extends string,
  C = void,
  A extends Record<string, any> = {},
  S = void,
> {
  /** Complete default config. Presence makes config OPTIONAL for consumer. Full C, not Partial<C>. */
  defaultConfig?: C;

  /** Declarative dependencies. Validated at Phase 0. NOT a topological sort -- just validation. */
  depends?: readonly string[];

  /** Create internal mutable state. Runs before any other lifecycle. Minimal context. */
  createState?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => S;

  /** Validate config. No other plugins available. */
  onCreate?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => void;

  /** Build the public API mounted on app.<pluginName>. Full context. */
  api?: (ctx: PluginCtx) => A;

  /** All plugins created and APIs mounted. Check dependencies here. */
  onInit?: (ctx: BaseCtx & { config: Readonly<C> }) => void;

  /** App is starting. Async allowed. Full context. */
  onStart?: (ctx: PluginCtx) => void | Promise<void>;

  /** Teardown. Reverse order. Minimal context. */
  onStop?: (ctx: { global: Readonly<any> }) => void | Promise<void>;

  /** Final cleanup. Reverse order. Minimal context. */
  onDestroy?: (ctx: { global: Readonly<any> }) => void | Promise<void>;

  /**
   * Event subscriptions. Keys are event names, values are handlers.
   * Handles BOTH bus events (typed at BusContract level) and signals (untyped).
   * At kernel level: Record<string, handler>. Type safety is the plugin author's job.
   * Handlers execute in plugin registration order, sequentially.
   */
  hooks?: Record<string, (...args: any[]) => void | Promise<void>>;

  /** Sub-plugins. Flattened depth-first, children before parent. */
  plugins?: PluginInstance[];
}
```

In this variant, only `onStart`, `onStop`, `onDestroy` accept async returns. `createState`, `onCreate`, `api`, `onInit` are sync. Async initialization is deferred to `onStart`.

### Variant B: Async-Compatible Lifecycle

```typescript
interface PluginSpec<
  N extends string,
  C = void,
  A extends Record<string, any> = {},
  S = void,
> {
  defaultConfig?: C;
  depends?: readonly string[];

  /** Create internal mutable state. Async-compatible. Runs before any other lifecycle. Minimal context. */
  createState?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => S | Promise<S>;

  /** Validate config. No other plugins available. Async-compatible. */
  onCreate?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => void | Promise<void>;

  /** Build the public API mounted on app.<pluginName>. Full context. Async-compatible. */
  api?: (ctx: PluginCtx) => A | Promise<A>;

  /** All plugins created and APIs mounted. Check dependencies here. Async-compatible. */
  onInit?: (ctx: BaseCtx & { config: Readonly<C> }) => void | Promise<void>;

  /** App is starting. Async allowed. Full context. */
  onStart?: (ctx: PluginCtx) => void | Promise<void>;

  /** Teardown. Reverse order. Minimal context. */
  onStop?: (ctx: { global: Readonly<any> }) => void | Promise<void>;

  /** Final cleanup. Reverse order. Minimal context. */
  onDestroy?: (ctx: { global: Readonly<any> }) => void | Promise<void>;

  hooks?: Record<string, (...args: any[]) => void | Promise<void>>;
  plugins?: PluginInstance[];
}
```

In this variant, ALL lifecycle methods accept both sync and async return values:

| Method | Return type | When async is useful |
|---|---|---|
| `createState` | `S \| Promise<S>` | Connect to databases, load files |
| `onCreate` | `void \| Promise<void>` | Validate config against external schemas |
| `api` | `A \| Promise<A>` | Build API that depends on async-initialized state |
| `onInit` | `void \| Promise<void>` | Check dependencies with async verification |
| `onStart` | `void \| Promise<void>` | Start servers, open connections |
| `onStop` | `void \| Promise<void>` | Flush buffers, close connections |
| `onDestroy` | `void \| Promise<void>` | Finalize, disconnect |

**Execution: sequential, not parallel.** Plugin A fully completes each phase before Plugin B begins. This preserves the ordering guarantee. If Plugin A's `createState` returns a Promise, it is awaited before Plugin B's `createState` runs.

Sync plugins work unchanged. `void | Promise<void>` covers sync returns.

---

## 2. The `depends` Field

```typescript
const RouterPlugin = createPlugin<'router', RouterConfig, RouterApi, RouterState>('router', {
  depends: ['logger', 'renderer'] as const,
  // ...
});
```

### What `depends` Does at Phase 0

1. For each plugin with `depends`, check that every named dependency exists in the flattened list.
2. Check that every dependency appears BEFORE the dependent plugin in the list.
3. If either check fails, throw with a clear error:

```
Error: [moku-site] Plugin "router" depends on "auth", but "auth" is not registered.
  Add the auth plugin to your plugin list before "router".

Error: [moku-site] Plugin "router" depends on "logger", but "logger" appears after "router".
  Move "logger" before "router" in your plugin list.
```

### What `depends` Does NOT Do

- Does not auto-reorder plugins (no topological sort)
- Does not create new concepts (no "dependency graph", no "resolution algorithm")
- Does not change runtime behavior (plugins init in array order, always)
- Does not affect `getPlugin`/`require` typing inside plugin lifecycle (still loose -- see [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md) for app-level strict typing)

**Visibility for LLMs and tooling:** With `depends`, an LLM can read a plugin's spec without executing any code and know what plugins must precede it. This is pure metadata extractable statically.

---

## 3. createPlugin

```typescript
function createPlugin<
  N extends string,
  C = void,
  A extends Record<string, any> = {},
  S = void,
>(
  name: N,
  spec: PluginSpec<N, C, A, S>,
): PluginInstance<N, C, A, S>;
```

Returns a `PluginInstance` -- a readonly object with the plugin's name, spec, kind field, and phantom types.

**The consumer's `createPlugin` is the SAME function the framework uses.** It comes from `createCore` and is bound to the same `BaseConfig`, `BusContract`, and `SignalRegistry`. The consumer's plugin gets typed `ctx.global` and typed `ctx.emit` for free.

### Consumer Custom Plugin Example

```typescript
// my-blog/src/plugins/contact-form/index.ts
import { createPlugin } from 'my-framework';
import type { ContactFormConfig, ContactFormApi } from './types';
import { createContactFormApi } from './api';
import { validateConfig } from './validation';

export const ContactFormPlugin = createPlugin<
  'contactForm',
  ContactFormConfig,
  ContactFormApi
>(
  'contactForm',
  {
    depends: ['renderer'],
    onCreate: ({ config }) => validateConfig(config),
    api: createContactFormApi,
    hooks: {
      'page:render': (payload) => {
        // BusContract event -- framework typed
        // payload: { path: string; html: string }
      },
    },
  },
);
```

```typescript
// my-blog/src/plugins/contact-form/types.ts
export type ContactFormConfig = {
  recipient: string;
  subject?: string;
  successMessage?: string;
};

export type ContactFormApi = {
  submit: (data: { name: string; email: string; message: string }) => Promise<boolean>;
  setRecipient: (email: string) => void;
};
```

---

## 4. createPluginFactory

Factory function for creating named instances of the same plugin shape.

### Problem

Each plugin name maps to one instance. You can't have `primaryDb` and `replicaDb` using the same plugin shape.

### Solution

```typescript
function createPluginFactory<C, A, S>(
  spec: Omit<PluginSpec<string, C, A, S>, 'plugins'>,
): <N extends string>(name: N) => PluginInstance<N, C, A, S>;
```

### How It Works

`createPluginFactory` is sugar. It returns a function that calls `createPlugin` with a dynamic name:

```typescript
function createPluginFactory<C, A, S>(spec) {
  return <N extends string>(name: N) => createPlugin<N, C, A, S>(name, spec);
}
```

Each call produces a `PluginInstance` with a different `N` literal, so TypeScript treats them as distinct plugins with distinct config keys and API namespaces.

### Usage at Layer 2

```typescript
// my-framework/src/plugins/database/factory.ts
import { createPluginFactory } from '../..';
import type { DbConfig, DbApi, DbState } from './types';

export const createDbPlugin = createPluginFactory<DbConfig, DbApi, DbState>({
  createState: async ({ config }) => {
    const pool = await createPool(config.connectionString);
    await pool.query('SELECT 1');  // verify connection
    return { pool };
  },
  api: ({ state }) => ({
    query: (sql: string, params?: any[]) => state.pool.query(sql, params),
    transaction: (fn: (client: any) => Promise<any>) => state.pool.transaction(fn),
  }),
  onDestroy: async ({ global }) => {
    // cleanup handled by pool reference in closure
  },
});

// Create named instances
export const PrimaryDb = createDbPlugin('primaryDb');
export const ReplicaDb = createDbPlugin('replicaDb');
```

### Usage at Layer 3

```typescript
import { createConfig, createApp, PrimaryDb, ReplicaDb } from 'my-api-framework';

const config = createConfig(
  { appName: 'My API' },
  [PrimaryDb, ReplicaDb],
);

const app = await createApp(config, {
  primaryDb: { connectionString: 'postgres://primary:5432/main' },
  replicaDb: { connectionString: 'postgres://replica:5432/main' },
});

await app.start();

app.primaryDb.query('INSERT INTO ...');   // typed, separate instance
app.replicaDb.query('SELECT * FROM ...');  // typed, separate instance
```

---

## 5. Sub-Plugins

Plugins can declare their own sub-plugins via the `plugins` field:

```typescript
const AuthPlugin = createPlugin<'auth', AuthConfig, AuthApi>('auth', {
  plugins: [SessionPlugin, TokenPlugin],
  // ...
});
```

### Flattening Rule

Sub-plugins are flattened depth-first, children before parent (see [04-COMPONENT-MODULE](./04-COMPONENT-MODULE.md) for the full algorithm). This means:
- `SessionPlugin` and `TokenPlugin` are created before `AuthPlugin`
- Their APIs are available when `AuthPlugin`'s lifecycle runs

### Sub-Plugin Type Visibility

**Sub-plugin types are NOT propagated to the App type in v1.** If `AuthPlugin` declares `plugins: [SessionPlugin]`, the consumer must also list `SessionPlugin` in their extra plugins to get `app.session.*` typed. At runtime, sub-plugins are registered regardless -- they work. But the type system only sees what's in the plugin lists.

Recursive sub-plugin type propagation is a **planned future improvement** using a `FlattenPlugins` recursive type and a `_sub` phantom field on `PluginInstance`.

---

## Cross-References

- Component and Module: [04-COMPONENT-MODULE](./04-COMPONENT-MODULE.md)
- Config resolution: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Context object: [08-CONTEXT](./08-CONTEXT.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)

