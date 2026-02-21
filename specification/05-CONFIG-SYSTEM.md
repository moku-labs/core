# 05 - Config System

**Domain:** Config resolution, defaults, BuildPluginConfigs, flat createApp object
**Version:** v3 (3-step architecture)

---

## 1. Two Levels of Config

The system has two levels of configuration:

**Global Config:** Defined via `createCoreConfig<Config, Events>(id, { config })`. The framework provides defaults; the consumer can override any field in the flat `createApp` object.

**Per-Plugin Config:** Defined via `defaultConfig` on each plugin's spec. The consumer can override any field by passing a keyed object in the flat `createApp` object.

Both levels use the same resolution strategy: **shallow merge**.

---

## 2. The Rule

TypeScript's own type system determines config behavior. No flags. No metadata. Just the type plus the presence of `defaultConfig`.

| Plugin Config Type `C` | `defaultConfig` | Consumer must provide |
|---|---|---|
| `void` | (ignored) | Nothing. No key in createApp. |
| `{}` | (ignored) | Nothing. No key in createApp. |
| `{ field: string }` | absent | **Required.** `{ field: "value" }` -- must provide full C. |
| `{ field: string }` | present | **Optional.** Can omit entirely or partially override. |
| `{ req: string; opt?: number }` | absent | **Required.** `{ req: "value" }` at minimum. |
| `{ req: string; opt?: number }` | present | **Optional.** Defaults cover everything. Override what you want. |

**Single canonical rule:** Config key is optional in `createApp` if and only if `defaultConfig` is provided. Otherwise it's required (unless C is void/{}).

---

## 3. Config Resolution

**Shallow merge. No deep merge. Ever.**

```typescript
resolvedConfig = { ...spec.defaultConfig, ...consumerProvidedConfig }
```

If `defaultConfig` is `{ level: 'info', prefix: '[app]' }` and the consumer provides `{ level: 'debug' }`, the result is `{ level: 'debug', prefix: '[app]' }`.

If `defaultConfig` has a nested object `{ database: { host: 'localhost', port: 5432 } }` and the consumer provides `{ database: { host: 'prod.example.com' } }`, the result is `{ database: { host: 'prod.example.com' } }`. The `port` field is **gone**. This is intentional. Deep merge is unpredictable. Shallow merge is obvious.

---

## 4. Per-Plugin Config in createApp

In v3, consumers pass plugin configs in the flat `createApp` object, keyed by plugin name:

```typescript
const app = await createApp({
  // Global config overrides
  siteName: 'My Blog',
  mode: 'production',

  // Extra plugins
  plugins: [blogPlugin],

  // Per-plugin configs (keyed by plugin name)
  router: { basePath: '/blog' },
  blog: { postsPerPage: 5 },
});
```

The type system discriminates between global config keys (from `Config`), the reserved `plugins` key, and plugin config keys (from plugin names in the registered set). Each plugin name becomes a key in the flat object whose value type is the plugin's config type `C`.

---

## 5. Global Config Resolution

Global config resolution follows the same shallow merge pattern:

```typescript
resolvedGlobal = { ...coreConfig.config, ...consumerOverrides }
```

The global config defaults come from `createCoreConfig`'s `options.config`. Consumer overrides are top-level keys in the `createApp` flat object that match `Config` property names.

```typescript
// Framework config.ts
const coreConfig = createCoreConfig<Config, Events>('my-framework', {
  config: {
    siteName: 'Untitled',
    mode: 'development',
  },
});

// Consumer main.ts
const app = await createApp({
  siteName: 'My Blog',    // overrides 'Untitled'
  // mode not provided -- stays 'development' from defaults
});
```

---

## 6. defaultConfig Is Full C, Not Partial

`defaultConfig` must provide a complete `C` value -- all fields, even optional ones with `?`. This ensures that when the consumer omits config entirely, every field has a defined value. No `undefined` surprises. Partial defaults create ambiguity about which fields the consumer must provide.

```typescript
// BAD: partial defaults leave gaps
defaultConfig: { level: 'info' }  // where's prefix? where's silent?

// GOOD: complete defaults
defaultConfig: { level: 'info', prefix: '[app]', silent: false }
```

---

## 7. Optional Fields in Plugin Config Types

Plugin config types fully support TypeScript's `?` optional modifier:

```typescript
type AnalyticsConfig = {
  trackingId: string;        // consumer MUST provide this
  sampleRate?: number;       // consumer CAN provide this, or leave as undefined
  debugMode?: boolean;       // same -- optional
};

// With defaultConfig: config key is optional in createApp
const analyticsPlugin = createPlugin('analytics', {
  defaultConfig: {
    trackingId: '',          // empty string -- must be overridden at runtime
    sampleRate: 1.0,
    debugMode: false,
  },
  onInit: (ctx) => {
    if (!ctx.config.trackingId) {
      throw new Error('[analytics] trackingId is required. Set it in your plugin config.');
    }
  },
});

// Without defaultConfig: config key is required in createApp
const strictAnalyticsPlugin = createPlugin('analytics', {
  // no defaultConfig -> consumer MUST provide at minimum: { trackingId: 'G-XXXXX' }
  // sampleRate and debugMode are optional per the type, so consumer can omit them
  onInit: (ctx) => { /* config is required at createApp call site */ },
});
```

**The interplay:**

- `C`'s required fields (`trackingId: string`) -- consumer must provide them if no `defaultConfig`
- `C`'s optional fields (`sampleRate?: number`) -- consumer can always omit them
- `defaultConfig` present -- the entire config key becomes optional in `createApp`
- `defaultConfig` absent -- the config key is required, but optional `?` fields within C can still be omitted

---

## 8. Type-Level Config Enforcement (BuildPluginConfigs)

```typescript
/**
 * Build the config map for createApp.
 *
 * Rules:
 *   C is void/{}          -> excluded (no config key)
 *   defaultConfig provided -> OPTIONAL (Partial<C>)
 *   no defaultConfig       -> REQUIRED (full C)
 */
type BuildPluginConfigs<P extends PluginInstance> = Prettify<
  & OmitNever<{
      [K in P as IsEmptyConfig<PluginConfigType<K>> extends true ? never
        : HasDefaults<K> extends true ? never
        : PluginName<K>
      ]: PluginConfigType<K>;                          // REQUIRED
    }>
  & OmitNever<{
      [K in P as IsEmptyConfig<PluginConfigType<K>> extends true ? never
        : HasDefaults<K> extends true ? PluginName<K>
        : never
      ]?: Partial<PluginConfigType<K>>;                // OPTIONAL
    }>
>;
```

**Example result for consumer:**

```typescript
// Given: RouterPlugin (no defaults), LoggerPlugin (has defaults), TimerPlugin (void config)
// BuildPluginConfigs produces:
{
  router: { default: string; pages: Record<string, unknown> };  // REQUIRED
  logger?: Partial<LoggerConfig>;                                // OPTIONAL
  // timer: not present at all
}
```

These plugin config keys are merged into the flat `createApp` options type alongside global config keys (`Partial<Config>`) and the reserved `plugins` key.

---

## 9. Config Immutability

All resolved configs are `Object.freeze`'d after resolution. Both global config and per-plugin configs are frozen and read-only at runtime. This prevents accidental mutation after initialization.

---

## 10. Runtime Validation

At runtime, the kernel validates config completeness:

- If a plugin requires config (no `defaultConfig`, non-void `C`), and the consumer didn't provide it, throw with a clear error message.
- TypeScript catches this at compile time, but runtime validation is a safety net.

```
Error: [moku-site] Plugin "router" requires config but none was provided.
  Add a "router" key to your createApp options object.
```

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
- Invariants: [11-INVARIANTS](./11-INVARIANTS.md)
