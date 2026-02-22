# 09 - Type System

**Domain:** Plugin instance types, type helpers, BuildPluginApis, App type, type flow
**Version:** v3 (3-step architecture)

---

## 1. Design Philosophy

Types flow through closures, not explicit generics. The v3 architecture captures types at each step of the factory chain:

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

## 3. Type-Level Helpers

```typescript
/** Extract name literal from a plugin */
type PluginName<P> = P extends PluginInstance<infer N, any, any, any> ? N : never;

/** Extract config type from a plugin */
type PluginConfigType<P> = P extends PluginInstance<any, infer C, any, any> ? C : never;

/** Extract API type from a plugin */
type PluginApiType<P> = P extends PluginInstance<any, any, infer A, any> ? A : never;

/** Is the config type empty (void | {} | never)? */
type IsEmptyConfig<C> =
  C extends void ? true :
  C extends Record<string, never> ? true :
  [keyof C] extends [never] ? true :
  false;

/** Does this plugin have config? */
type HasDefaults<P> = P extends { _hasDefaults: true } ? true : false;

/** Extract API by plugin name from a plugin union */
type PluginApiByName<P, N extends string> =
  P extends PluginInstance<N, infer C, infer A, any>
    ? A & { readonly config: C extends void ? {} : Readonly<C> }
    : never;
```

These helpers extract type information from plugin instances for use in mapped types like `BuildPluginApis` and `BuildPluginConfigs`.

---

## 4. BuildPluginConfigs

Maps over the plugin union to build the config portion of the `createApp` options object. For each plugin:

- If `IsEmptyConfig`, the plugin has no config key (excluded)
- If `HasDefaults`, the config key is optional (`Partial<C>`)
- Otherwise, the config key is required (full `C`)

See [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md) for the full type definition and explanation.

---

## 5. BuildPluginApis

```typescript
/** Build the app's API surface from the plugin union */
type BuildPluginApis<P extends PluginInstance> = {
  [K in P as PluginName<K>]: PluginApiType<K> & {
    readonly config: PluginConfigType<K> extends void ? {} : Readonly<PluginConfigType<K>>;
  };
};
```

This maps each plugin in the union to a property on the app, keyed by the plugin's name literal. The plugin's API type is augmented with a `config` property for accessing the resolved plugin config.

```typescript
// Given: routerPlugin ('router', RouterApi), loggerPlugin ('logger', LoggerApi)
// BuildPluginApis produces:
{
  router: RouterApi & { readonly config: Readonly<RouterConfig> };
  logger: LoggerApi & { readonly config: Readonly<LoggerConfig> };
}
```

---

## 6. The App Type

```typescript
type App<
  Config extends Record<string, any>,
  Events extends Record<string, any>,
  P extends PluginInstance,
> = {
  /** Start the app. Forward order. Idempotent. */
  start: () => Promise<void>;

  /** Stop the app. Reverse order. Idempotent. */
  stop: () => Promise<void>;

  /**
   * Fire an event. Strictly typed:
   * Only known names (in Events) accepted with typed required payload.
   */
  emit: <K extends string & keyof Events>(name: K, payload: Events[K]) => void;

  /**
   * Get plugin API by name. Typed -- constrained to registered plugin names.
   * Returns undefined if not found.
   */
  getPlugin: <N extends PluginName<P>>(name: N) => PluginApiByName<P, N> | undefined;

  /**
   * Get plugin API or throw with clear error. Typed -- constrained to registered plugin names.
   */
  require: <N extends PluginName<P>>(name: N) => PluginApiByName<P, N>;

  /** Check if a plugin is registered. */
  has: (name: string) => boolean;
} & Prettify<BuildPluginApis<P>>;
```

Plugin APIs are intersected onto the app object via `BuildPluginApis`. This means `app.router.navigate()` is fully typed:

```typescript
const app = await createApp({ ... });

// Plugin APIs available directly on app
app.router.navigate('/about');           // typed: (path: string) => void
app.logger.info('message');              // typed: (msg: string) => void

// getPlugin/require also work
const router = app.require('router');    // typed: RouterApi
app.getPlugin('nonexistent');            // compile error: not a registered name

// Lifecycle
await app.start();
await app.stop();
```

---

## 7. The Full Type Flow

Trace types from `createCoreConfig` through to app usage:

```
Step 1: createCoreConfig<Config, Events>('framework-id', { config })
  | Captures Config + Events in closure
  | Returns: { createPlugin, createCore }
  | createPlugin is bound to Config + Events

Step 2: createPlugin(name, spec)
  | Infers N (name literal), C (config), S (state), A (api) from spec
  | Config + Events already bound from Step 1 closure
  | PluginEvents inferred from events register callback: events: (register) => ({...})
  | Returns: PluginInstance<N, C, S, A, PluginEvents>

Step 3: createCore(coreConfig, { plugins: [routerPlugin, loggerPlugin] })
  | Captures all plugin instances as a union type
  | Returns: { createApp, createPlugin }

Step 4: createApp({ plugins?, ...configOverrides, ...pluginConfigs })
  | AllPlugins = framework plugins + consumer plugins
  | Options typed as: { plugins?: [...] } & Partial<Config> & BuildPluginConfigs<AllPlugins>
  | Returns: Promise<App<Config, Events, AllPlugins>>

Result: app.router.navigate('/about')
  | 'router' -> PluginName matches RouterPlugin
  | RouterPlugin -> PluginApiType -> { navigate: (path: string) => void }
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
const app = await createApp({
  siteName: 'My Blog',
  mode: 'prod',
  router: { basePath: '/blog' },
});

// Result: fully typed
app.router.navigate('/about');  // (path: string) => void
app.router.current();           // () => string
```

---

## 8. Sub-Plugin Type Visibility

Sub-plugin types (from the `plugins` field on PluginSpec) are propagated via the flattening algorithm. When a plugin declares sub-plugins, those sub-plugins are inserted before the parent during flattening. Their APIs appear on the app object.

```typescript
const sessionPlugin = createPlugin('session', {
  api: (ctx) => ({ getSession: () => ({}) }),
});

const authPlugin = createPlugin('auth', {
  plugins: [sessionPlugin],  // sub-plugin
  api: (ctx) => ({ login: () => {} }),
});

// After flattening: [sessionPlugin, authPlugin]
// app.session.getSession() -- typed
// app.auth.login() -- typed
```

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Config system: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Context object: [08-CONTEXT](./08-CONTEXT.md)
