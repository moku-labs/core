# 09 - Type System

**Domain:** Phantom types, type helpers, BuildPluginApis, App type, typed getPlugin, EventContract
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1), SPEC_IMPROVEMENTS_IDEAS (P2, P5)

---

## 1. Plugin Instance (Phantom Types)

```typescript
interface PluginInstance<
  N extends string = string,
  C = void,
  A extends Record<string, any> = {},
  S = void,
> {
  readonly kind: 'plugin';
  readonly name: N;
  readonly _types: { config: C; api: A; state: S };  // phantom, never read at runtime
  readonly _hasDefaults: boolean;                      // phantom, set by createPlugin
  readonly spec: PluginSpec<N, C, A, S>;
}
```

The `_types` field carries generic parameters through the type system. It is never accessed at runtime. `_hasDefaults` is set to `true` when `defaultConfig` is provided, enabling the config optionality logic.

### ComponentInstance and ModuleInstance

```typescript
interface ComponentInstance<N extends string = string, C = void, A extends Record<string, any> = {}, S = void> {
  readonly kind: 'component';
  readonly name: N;
  readonly _types: { config: C; api: A; state: S };
  readonly _hasDefaults: boolean;
  readonly spec: ComponentSpec<N, C, A, S>;
}

interface ModuleInstance<N extends string = string, C = void> {
  readonly kind: 'module';
  readonly name: N;
  readonly spec: ModuleSpec<N, C>;
}
```

---

## 2. Type-Level Helpers

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

/** Does this plugin have defaultConfig? */
type HasDefaults<P> = P extends { _hasDefaults: true } ? true : false;

/** Extract API by plugin name from a plugin union */
type PluginApiByName<P, N extends string> =
  P extends PluginInstance<N, infer C, infer A, any>
    ? A & { readonly config: C extends void ? {} : Readonly<C> }
    : never;
```

---

## 3. AppConfig Type

```typescript
/**
 * Opaque config object produced by createConfig.
 * Carries the full plugin union for createApp to type pluginConfigs against.
 */
type AppConfig<
  G extends Record<string, any>,
  DefaultP extends PluginInstance,
  ExtraPlugins extends readonly PluginInstance[],
> = {
  readonly _brand: 'AppConfig';
  readonly global: Partial<G>;
  readonly extras: ExtraPlugins;
  /** Phantom: union of all plugins (defaults + extras). Used by createApp for typing. */
  readonly _allPlugins: DefaultP | ExtraPlugins[number];
};
```

**The type relationship:**
```
createConfig(global, extras) -> AppConfig<G, DefaultP, Extras>
createApp(config, pluginConfigs) infers P = config._allPlugins
pluginConfigs: BuildPluginConfigs<P> -- now TypeScript knows ALL plugins
```

---

## 4. BuildPluginConfigs

See [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md) for the full definition and explanation.

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

---

## 6. The App Type

```typescript
type App<
  G extends Record<string, any>,
  Events extends Record<string, any>,
  P extends PluginInstance,
> = {
  /** Global config, frozen */
  readonly config: Readonly<G>;

  /** Per-plugin resolved configs accessor. Frozen. */
  readonly configs: BuildPluginConfigsAccessor<P>;

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

  /** Start the app. Idempotent. */
  start: () => Promise<void>;

  /** Stop the app. Reverse order. Idempotent. */
  stop: () => Promise<void>;

  /** Destroy. Calls stop() if needed. Terminal -- second call throws. */
  destroy: () => Promise<void>;
} & Prettify<BuildPluginApis<P>>;
```

**Typed emit on App:** Emit is overloaded with typed known events and untyped fallback. There is no separate method for plugin-to-plugin communication -- everything goes through `emit`.

**Typed getPlugin/require on App:**

```typescript
const router = app.getPlugin('router');
// Inferred: RouterApi & { config: Readonly<RouterConfig> } | undefined

router?.navigate('/about');  // OK
router?.fly();               // compile error

app.getPlugin('nonexistent');  // compile error: not a registered name

const logger = app.require('logger');
// Inferred: LoggerApi & { config: Readonly<LoggerConfig> }
```

**Inside plugin definitions: stays loose.** At plugin definition time, the full plugin union isn't known. `getPlugin` and `require` inside `PluginSpec` use the three-overload-tier pattern based on the `depends` tuple. Plugin authors get typed access to declared dependencies, and an untyped escape hatch for everything else.

---

## 7. Sub-Plugin Type Visibility

**Sub-plugin types are NOT propagated to the App type in v1.** If `AuthPlugin` declares `plugins: [SessionPlugin]`, the consumer must also list `SessionPlugin` in their extra plugins to get `app.session.*` typed. At runtime, sub-plugins are registered regardless -- they work. But the type system only sees what's in the plugin lists.

### Planned Future: Recursive Type Flattening

```typescript
// Recursively collect plugins including sub-plugins
type FlattenPlugins<P> =
  | P
  | (P extends PluginInstance<any, any, any, any> & { _sub: infer Sub }
      ? Sub extends PluginInstance ? FlattenPlugins<Sub> : never
      : never);

// PluginInstance gains _sub phantom
interface PluginInstance<N, C, A, S> {
  readonly _sub: SubPluginUnion;  // phantom: union of sub-plugin instances
  // ...
}
```

TypeScript recursion depth limit: cap at 4 levels. Sub-plugins beyond level 4 work at runtime but are invisible to types.

---

## 8. The Full Type Flow

```
Layer 1: createCore<BaseConfig, EventContract>
  | returns CoreAPI bound to these generics
Layer 2: const { createConfig, createApp, createPlugin } = createCore(...)
  | framework exports these -- they carry BaseConfig, EventContract
Layer 3: createConfig(globalOverrides, [ExtraPlugin])
  | returns AppConfig carrying AllPlugins = DefaultPlugins | ExtraPlugin
Layer 3: await createApp(config, pluginConfigs)
  | TypeScript infers P from config._allPlugins
  | pluginConfigs typed as BuildPluginConfigs<P> -- knows every plugin
  | returns Promise<App<BaseConfig, EventContract, P>>
  | every API fully typed, getPlugin/require constrained to registered names
  | emit typed for known events, untyped fallback for ad-hoc
```

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Config system: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Context object: [08-CONTEXT](./08-CONTEXT.md)
