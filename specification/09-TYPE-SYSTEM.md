# 09 - Type System

**Domain:** Plugin instance types, type helpers, BuildPluginApis, App type, type flow
**Architecture:** 3-step (createCoreConfig -> createCore -> createApp)

---

## 1. Design Philosophy

Types flow through closures, not explicit generics. The architecture captures types at each step of the factory chain:

- `createCoreConfig<Config, Events>` captures the global type contract
- `createPlugin(name, spec)` infers everything from the spec object -- config, state, API, and event types
- `createCore(coreConfig, { plugins })` captures all plugin instances
- `createApp(options)` returns `App<Config, AllPlugins>` with full type inference

Plugin authors never write generic parameters. Event types are inferred from the `events` register callback (see [14-EVENT-REGISTRATION](./14-EVENT-REGISTRATION.md)). The type system does the heavy lifting at compile time.

---

## 2. Plugin Instance Type

The internal type created by `createPlugin`:

```typescript
interface PluginInstance<
  N extends string = string,
  C = void,
  S = void,
  A extends Record<string, any> = Record<string, never>,
  PluginEvents extends Record<string, unknown> = {},
> {
  readonly name: N;
  readonly spec: PluginSpec<...>;
  readonly _phantom: {
    config: C;
    state: S;
    api: A;
    events: PluginEvents;
  };
}
```

`N` = name literal, `C` = config, `S` = state, `A` = api, `PluginEvents` = per-plugin events (from register callback).

All inferred -- plugin authors never write this type. The `_phantom` field carries generic parameters through the type system and is never accessed at runtime. `PluginEvents` defaults to `{}` (empty object, not `Record<string, never>`) because `{}` is the identity element for intersection -- it does not poison merged event maps.

---

## 2b. Core Plugin Instance Type

The internal type created by `createCorePlugin`:

```typescript
interface CorePluginInstance<
  N extends string = string,
  C = void,
  S = void,
  A extends Record<string, any> = Record<string, never>,
> {
  readonly name: N;
  readonly spec: CorePluginSpec<any, any, any>;
  readonly _corePlugin: true;   // brand — distinguishes from regular PluginInstance
  readonly _phantom: {
    config: C;
    state: S;
    api: A;
  };
}

type AnyCorePluginInstance = CorePluginInstance<string, any, any, any>;
```

`N` = name literal, `C` = config, `S` = state, `A` = api. Core plugins have no `PluginEvents` phantom — they cannot declare events.

The `_corePlugin: true` brand field distinguishes core plugin instances from regular plugin instances at the type level. It is never read at runtime.

Core plugin context is minimal — only `{ config, state }`. No `global`, no `emit`, no `require`, no `has`. Core plugins are self-contained infrastructure; they do not participate in the regular plugin communication graph.

---

## 3. Type-Level Helpers

```typescript
/** Extract name literal from a plugin */
type ExtractName<P> = P extends PluginInstance<infer N, any, any, any, any> ? N : never;

/** Extract config type from a plugin */
type ExtractConfig<P> = P extends PluginInstance<string, infer C, any, any, any> ? C : never;

/** Extract API type from a plugin */
type ExtractApi<P> = P extends PluginInstance<string, any, any, infer A, any> ? A : never;

/** Extract events type from a plugin */
type ExtractEvents<P> = P extends PluginInstance<string, any, any, any, infer E> ? E : never;

/** Detect if a string type is a literal vs the general `string` type */
type IsLiteralString<S extends string> = string extends S ? false : true;

/** Convert a union to an intersection */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

/** Intersection of all PluginEvents from a depends tuple */
type DepsEvents<Deps extends ReadonlyArray<PluginInstance>> =
  Deps[number] extends never ? {} : UnionToIntersection<ExtractEvents<Deps[number]>>;
```

These helpers extract type information from plugin instances for use in mapped types like `BuildPluginApis` and `CreateAppOptions`.

### Core Plugin Extraction Helpers

```typescript
/** Extract name literal from a core plugin */
type ExtractCoreName<P> = P extends CorePluginInstance<infer N, any, any, any> ? N : never;

/** Extract config type from a core plugin */
type ExtractCoreConfig<P> = P extends CorePluginInstance<string, infer C, any, any> ? C : never;

/** Extract API type from a core plugin */
type ExtractCoreApi<P> = P extends CorePluginInstance<string, any, any, infer A> ? A : never;
```

---

## 3b. BuildCorePluginApis and CoreApisFromTuple

```typescript
/** Build the aggregate core API surface from a core plugin union */
type BuildCorePluginApis<P extends AnyCorePluginInstance> = {
  readonly [K in P as ExtractCoreApi<K> extends Record<string, never>
    ? never
    : IsLiteralString<ExtractCoreName<K>> extends true
      ? ExtractCoreName<K>
      : never]: ExtractCoreApi<K>;
};

/** Convert a core plugin tuple to the aggregate core API map */
type CoreApisFromTuple<T extends readonly AnyCorePluginInstance[]> =
  BuildCorePluginApis<T[number]>;
```

`BuildCorePluginApis` follows the same pattern as `BuildPluginApis` — it maps each core plugin to a readonly property keyed by name, excluding plugins with empty APIs or non-literal names. `CoreApisFromTuple` converts a tuple (the `plugins` array in `createCoreConfig`) to the union needed by the mapped type.

```typescript
// Given: logPlugin ('log', LogApi), envPlugin ('env', EnvApi)
// CoreApisFromTuple<[typeof logPlugin, typeof envPlugin]> produces:
{
  readonly log: LogApi;
  readonly env: EnvApi;
}
```

These APIs are injected flat onto every regular plugin's context: `ctx.log.info(...)`, `ctx.env.isDev()`.

---

## 4. Plugin Config in CreateAppOptions

Plugin configs are typed inline within `CreateAppOptions` via a mapped type on `pluginConfigs`. For each plugin in the union:

- Plugins with `Record<string, never>` config are excluded (no key in `pluginConfigs`)
- Plugins with non-literal names are excluded (prevents index signature pollution)
- All included plugins get an optional `Partial<ExtractConfig<K>>` key

```typescript
pluginConfigs?: {
  [K in P as ExtractConfig<K> extends Record<string, never>
    ? never
    : IsLiteralString<ExtractName<K>> extends true
      ? ExtractName<K>
      : never]?: Partial<ExtractConfig<K>>;
};
```

See [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md) for config resolution details.

---

## 5. BuildPluginApis

```typescript
/** Build the app's API surface from the plugin union */
type BuildPluginApis<P extends PluginInstance> = {
  [K in P as ExtractApi<K> extends Record<string, never>
    ? never
    : IsLiteralString<ExtractName<K>> extends true
      ? ExtractName<K>
      : never]: ExtractApi<K>;
};
```

This maps each plugin in the union to a property on the app, keyed by the plugin's name literal. Plugins with empty API (`Record<string, never>`) are excluded. Plugins with non-literal name type (`string`) are excluded to prevent index signature pollution.

```typescript
// Given: routerPlugin ('router', RouterApi), loggerPlugin ('logger', LoggerApi)
// BuildPluginApis produces:
{
  router: RouterApi;
  logger: LoggerApi;
}
```

---

## 5b. CoreApis Generic Parameter Threading

Core plugin APIs are threaded through the type system via a `CoreApis` generic parameter with a default of `{}`. This parameter appears on every type that provides or consumes plugin context:

```typescript
// CoreApis added as a defaulted generic parameter:
type PluginContext<Config, Events, C, S, CoreApis = {}> = {
  global: Readonly<Config>;
  config: Readonly<C>;
  state: S;
  emit: EmitFunction<Events>;
  require: RequireFunction;
  has: HasFunction;
} & CoreApis;  // <-- core plugin APIs injected via intersection

type PluginSpec<Config, Events, C, S, A, PluginEvents, CoreApis = {}> = { ... };
type App<Config, Events, P extends PluginInstance, CoreApis = {}> = { ... };
type AppCallbackContext<Config, Events, CoreApis = {}> = { ... };
type CreateAppOptions<Config, Events, P, ExtraP, CoreApis = {}> = { ... };
type PluginExecutionContext<...CoreApis = {}> = { ... };
type CreatePluginSpec<...CoreApis = {}> = { ... };
type BoundCreatePluginFunction<...CoreApis = {}> = { ... };
```

The `= {}` default ensures backward compatibility — `{}` is the identity element for intersection (`T & {} = T`). When no core plugins exist, the context type is unchanged.

When core plugins are provided, `CoreApis` resolves to something like `{ readonly log: LogApi; readonly env: EnvApi }`, and the intersection makes these available on every plugin context:

```typescript
// With core plugins [logPlugin, envPlugin]:
// CoreApis = { readonly log: LogApi; readonly env: EnvApi }
// PluginContext becomes:
{
  global: Readonly<Config>;
  config: Readonly<C>;
  state: S;
  emit: EmitFunction<Events>;
  require: RequireFunction;
  has: HasFunction;
  log: LogApi;    // from core plugin
  env: EnvApi;    // from core plugin
}
```

The `CoreApis` type is computed once from the core plugin tuple via `CoreApisFromTuple` at the `createCoreConfig` level and threaded through closures to all downstream types — the same closure-capture strategy used for `Config` and `Events`.

---

## 6. The App Type

```typescript
type App<
  _Config extends Record<string, unknown>,
  Events extends Record<string, unknown>,
  P extends PluginInstance,
  CoreApis = {},
> = {
  /** Start the app. Forward order. Throws on second call. */
  readonly start: () => Promise<void>;

  /** Stop the app. Reverse order. Throws if start() not called. */
  readonly stop: () => Promise<void>;

  /**
   * Fire an event. Strictly typed:
   * Only known names (in Events) accepted with typed required payload.
   */
  readonly emit: EmitFunction<Events>;

  /**
   * Get plugin API or throw with clear error. Instance-only, fully typed.
   */
  readonly require: RequireFunction;

  /** Check if a plugin is registered. */
  readonly has: HasFunction;
} & BuildPluginApis<P>;
```

Plugin APIs are intersected onto the app object via `BuildPluginApis`. This means `app.router.navigate()` is fully typed:

```typescript
const app = createApp({ ... });

// Plugin APIs available directly on app
app.router.navigate('/about');           // typed: (path: string) => void
app.logger.info('message');              // typed: (msg: string) => void

// require also works with plugin instance references
const router = app.require(routerPlugin);  // typed: RouterApi

// Lifecycle
await app.start();
await app.stop();
```

---

## 7. The Full Type Flow

Trace types from `createCoreConfig` through to app usage:

```
Step 1: createCoreConfig<Config, Events>('framework-id', { config, plugins? })
  | Captures Config + Events in closure
  | If plugins (core plugins) provided: CoreApis = CoreApisFromTuple<typeof plugins>
  | Otherwise: CoreApis = {} (identity for intersection, backward compatible)
  | Returns: { createPlugin, createCore }
  | createPlugin is bound to Config + Events + CoreApis

Step 2: createPlugin(name, spec)
  | Infers N (name literal), C (config), S (state), A (api) from spec
  | Config + Events + CoreApis already bound from Step 1 closure
  | PluginEvents inferred from events register callback: events: (register) => ({...})
  | PluginContext includes CoreApis via intersection (ctx.log, ctx.env, etc.)
  | Returns: PluginInstance<N, C, S, A, PluginEvents>

Step 3: createCore(coreConfig, { plugins: [routerPlugin, loggerPlugin] })
  | Captures all plugin instances as a union type
  | Returns: { createApp, createPlugin }

Step 4: createApp({ plugins?, config?, pluginConfigs?, onReady?, ... })
  | AllPlugins = framework plugins + consumer plugins
  | Options typed as: CreateAppOptions<Config, Events, AllPlugins, ExtraPlugins>
  | Returns: Promise<App<Config, Events, AllPlugins>>

Result: app.router.navigate('/about')
  | 'router' -> ExtractName matches RouterPlugin
  | RouterPlugin -> ExtractApi -> { navigate: (path: string) => void }
  | Fully typed, zero casts, zero manual annotations
```

### Concrete Example

```typescript
// Step 1: Framework config.ts
type Config = { siteName: string; mode: 'dev' | 'prod' };
type Events = { 'page:render': { path: string; html: string } };

const coreConfig = createCoreConfig<Config, Events>('my-site', {
  config: { siteName: 'Untitled', mode: 'dev' },
});

const { createPlugin, createCore } = coreConfig;

// Step 2: Framework plugins
const routerPlugin = createPlugin('router', {
  config: { basePath: '/' },
  createState: () => ({ currentPath: '/' }),
  api: (ctx) => ({
    navigate: (path: string) => { ctx.state.currentPath = path; },
    current: () => ctx.state.currentPath,
  }),
});

// Step 3: Framework index.ts
const { createApp, createPlugin: frameworkCreatePlugin } = createCore(coreConfig, {
  plugins: [routerPlugin],
});

// Step 4: Consumer
const app = createApp({
  config: { siteName: 'My Blog', mode: 'prod' },
  pluginConfigs: { router: { basePath: '/blog' } },
});

// Result: fully typed
app.router.navigate('/about');  // (path: string) => void
app.router.current();           // () => string
```

---

## 8. Plugin Type Visibility

All plugins are listed explicitly in the plugins array. Every plugin's API appears on the app object with full type visibility:

```typescript
const sessionPlugin = createPlugin('session', {
  api: (ctx) => ({ getSession: () => ({}) }),
});

const authPlugin = createPlugin('auth', {
  depends: [sessionPlugin],
  api: (ctx) => ({ login: () => {} }),
});

// plugins: [sessionPlugin, authPlugin]
// app.session.getSession() -- typed
// app.auth.login() -- typed
```

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Config system: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Context object: [08-CONTEXT](./08-CONTEXT.md)
