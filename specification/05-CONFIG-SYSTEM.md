# 05 - Config System

**Domain:** Config resolution, defaults, pluginConfigs mapped type, structured createApp namespaces, core plugin config merge
**Architecture:** 3-step (createCoreConfig -> createCore -> createApp)

---

## 1. Two Levels of Config

The system has two levels of configuration:

**Global Config:** Defined via `createCoreConfig<Config, Events>(id, { config })`. The framework provides defaults; the consumer can override any field via `createApp({ config: { ... } })`.

**Per-Plugin Config:** Defined via `config` on each plugin's spec. The consumer can override any field via `createApp({ pluginConfigs: { pluginName: { ... } } })`.

Both levels use the same resolution strategy: **shallow merge**.

---

## 1b. Core Plugin Config

Core plugins (created with `createCorePlugin`) follow a **4-level merge**. Each layer in the factory chain can override core plugin config:

```
spec defaults → createCoreConfig pluginConfigs → createCore pluginConfigs → createApp pluginConfigs
```

```typescript
resolvedCorePluginConfig = {
  ...corePluginSpec.config,         // 1. spec defaults (from createCorePlugin)
  ...coreConfigOverrides,           // 2. createCoreConfig pluginConfigs
  ...frameworkOverrides,            // 3. createCore pluginConfigs
  ...consumerOverrides,             // 4. createApp pluginConfigs
}
```

The extra level (compared to regular plugins' 3-level merge) exists because core plugins are declared at the `createCoreConfig` level, giving that layer its own override opportunity. All four levels use the same shallow merge strategy.

**Example:**

```typescript
// Core plugin spec provides defaults
const logPlugin = createCorePlugin('log', {
  config: { level: 'info', prefix: '[app]' },
  // ...
});

// Layer 1: createCoreConfig can override
const coreConfig = createCoreConfig('my-framework', {
  plugins: [logPlugin],
  pluginConfigs: { log: { level: 'warn' } },          // level → 'warn'
});

// Layer 2: createCore can override
const { createApp } = createCore({
  pluginConfigs: { log: { prefix: '[my-framework]' } }, // prefix → '[my-framework]'
});

// Layer 3: createApp can override
const app = createApp({
  pluginConfigs: { log: { level: 'debug' } },           // level → 'debug'
});

// Result: { level: 'debug', prefix: '[my-framework]' }
```

The same shallow merge rule applies: no deep merge, ever. Each level replaces the keys it provides.

---

## 2. The Rule

TypeScript's own type system determines config behavior. No flags. No metadata. Just the type plus the presence of `config`.

| Plugin Config Type `C` | `config` | Consumer must provide |
|---|---|---|
| `void` | (ignored) | Nothing. No key in createApp. |
| `{}` | (ignored) | Nothing. No key in createApp. |
| `{ field: string }` | absent | **Required.** `{ field: "value" }` -- must provide full C. |
| `{ field: string }` | present | **Optional.** Can omit entirely or partially override. |
| `{ req: string; opt?: number }` | absent | **Required.** `{ req: "value" }` at minimum. |
| `{ req: string; opt?: number }` | present | **Optional.** Defaults cover everything. Override what you want. |

**Single canonical rule:** Config key is optional in `createApp` if and only if `config` is provided. Otherwise it's required (unless C is void/{}).

---

## 3. Config Resolution

**Shallow merge. No deep merge. Ever.**

Regular per-plugin config uses a 3-level merge: plugin defaults, then framework overrides (from `createCore`), then consumer overrides (from `createApp`). (Core plugins use a 4-level merge -- see section 1b.)

```typescript
resolvedConfig = { ...spec.config, ...frameworkOverrides, ...consumerOverrides }
```

If `config` is `{ level: 'info', prefix: '[app]' }` and the consumer provides `{ level: 'debug' }`, the result is `{ level: 'debug', prefix: '[app]' }`.

If `config` has a nested object `{ database: { host: 'localhost', port: 5432 } }` and the consumer provides `{ database: { host: 'prod.example.com' } }`, the result is `{ database: { host: 'prod.example.com' } }`. The `port` field is **gone**. This is intentional. Deep merge is unpredictable. Shallow merge is obvious.

---

## 4. Per-Plugin Config in createApp

Consumers pass plugin configs in the `pluginConfigs` namespace, keyed by plugin name:

```typescript
const app = createApp({
  plugins: [blogPlugin],
  config: {
    siteName: 'My Blog',
    mode: 'production',
  },
  pluginConfigs: {
    router: { basePath: '/blog' },
    blog: { postsPerPage: 5 },
  },
});
```

The `config` namespace holds global config overrides (typed from `Config`). The `pluginConfigs` namespace holds per-plugin config overrides, keyed by plugin name. Each plugin name becomes a key whose value type is the plugin's config type `C`.

---

## 5. Global Config Resolution

Global config resolution follows the same shallow merge pattern:

```typescript
resolvedGlobal = { ...coreConfig.config, ...consumerOverrides }
```

The global config defaults come from `createCoreConfig`'s `options.config`. Consumer overrides are passed via the `config` namespace in `createApp`.

```typescript
// Framework config.ts
const coreConfig = createCoreConfig<Config, Events>('my-framework', {
  config: {
    siteName: 'Untitled',
    mode: 'development',
  },
});

// Consumer main.ts
const app = createApp({
  config: {
    siteName: 'My Blog',    // overrides 'Untitled'
    // mode not provided -- stays 'development' from defaults
  },
});
```

---

## 6. config Is Full C, Not Partial

`config` must provide a complete `C` value -- all fields, even optional ones with `?`. This ensures that when the consumer omits config entirely, every field has a defined value. No `undefined` surprises. Partial defaults create ambiguity about which fields the consumer must provide.

```typescript
// BAD: partial defaults leave gaps
config: { level: 'info' }  // where's prefix? where's silent?

// GOOD: complete defaults
config: { level: 'info', prefix: '[app]', silent: false }
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

// With config: config key is optional in createApp
const analyticsPlugin = createPlugin('analytics', {
  config: {
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

// Without config: config key is required in createApp
const strictAnalyticsPlugin = createPlugin('analytics', {
  // no config -> consumer MUST provide at minimum: { trackingId: 'G-XXXXX' }
  // sampleRate and debugMode are optional per the type, so consumer can omit them
  onInit: (ctx) => { /* config is required at createApp call site */ },
});
```

**The interplay:**

- `C`'s required fields (`trackingId: string`) -- consumer must provide them if no `config`
- `C`'s optional fields (`sampleRate?: number`) -- consumer can always omit them
- `config` present -- the entire config key becomes optional in `createApp`
- `config` absent -- the config key is required, but optional `?` fields within C can still be omitted

---

## 8. Type-Level Config Enforcement (CreateAppOptions)

Plugin configs are typed inline within `CreateAppOptions` via a mapped type on `pluginConfigs`:

```typescript
pluginConfigs?: {
  [K in P as ExtractConfig<K> extends Record<string, never>
    ? never
    : IsLiteralString<ExtractName<K>> extends true
      ? ExtractName<K>
      : never]?: Partial<ExtractConfig<K>>;
};
```

**Rules:**

- Plugins with `Record<string, never>` config (no config field, void C) are excluded — no key in `pluginConfigs`
- Plugins with non-literal name type (`string`) are excluded — prevents index signature pollution
- All included plugins get an optional `Partial<ExtractConfig<K>>` key

Config enforcement is **compile-time only** via the TypeScript type system. There is no runtime validation for missing required configs — the type system prevents this at the call site.

---

## 9. Config Immutability

All resolved configs are `Object.freeze`'d after resolution. Both global config and per-plugin configs are frozen and read-only at runtime. This prevents accidental mutation after initialization.

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
- Invariants: [11-INVARIANTS](./11-INVARIANTS.md)
