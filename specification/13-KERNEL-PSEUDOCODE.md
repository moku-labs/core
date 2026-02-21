# 13 - Kernel Runtime (Pseudocode)

**Domain:** Reference implementation pseudocode, design decisions log
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1)

---

## 1. Async Kernel (Variant B)

This is the complete kernel pseudocode with async createApp.

```typescript
function createCore(name, defaults) {

  // --- createConfig: binds global overrides + extras, returns opaque AppConfig ---
  function createConfigFn(consumerGlobal, extraPlugins = []) {
    return {
      _brand: 'AppConfig',
      global: consumerGlobal,
      extras: extraPlugins,
      _defaults: defaults,
    };
  }

  // --- createApp: wires everything, returns frozen app ---
  async function createAppFn(appConfig, pluginConfigs) {
    const consumerGlobal = appConfig.global;
    const extraPlugins = appConfig.extras;

    // === Phase 0: Flatten + Validate (sync) ===
    const allInputs = [...(defaults.plugins ?? []), ...extraPlugins];
    const items = flatten(allInputs);
    const names = items.map(i => i.name);

    // Duplicate check
    const dupes = findDuplicates(names);
    if (dupes.length > 0) {
      throw new Error(`[${name}] Duplicate plugin names: ${dupes.join(', ')}`);
    }

    // Dependency validation
    for (const item of items) {
      if (!item.spec.depends) continue;
      const idx = items.indexOf(item);
      for (const dep of item.spec.depends) {
        const depIdx = names.indexOf(dep);
        if (depIdx === -1) {
          throw new Error(
            `[${name}] Plugin "${item.name}" depends on "${dep}", but "${dep}" is not registered.`
          );
        }
        if (depIdx >= idx) {
          throw new Error(
            `[${name}] Plugin "${item.name}" depends on "${dep}", but "${dep}" appears after "${item.name}".`
          );
        }
      }
    }

    // === Resolve global config (sync) ===
    const globalConfig = Object.freeze({ ...defaults.config, ...consumerGlobal });

    // === Internal registries ===
    const configs = new Map();
    const states = new Map();
    const apis = new Map();
    const hookMap = new Map();
    let started = false;

    // === Shared helpers ===
    async function dispatch(hookName, payload) {
      const handlers = hookMap.get(hookName) ?? [];
      for (const h of handlers) { await h(payload); }
    }
    const emit = (n, p) => dispatch(n, p);
    const getPlugin = (n) => apis.get(n);
    const requirePlugin = (n, requester) => {
      const api = apis.get(n);
      if (!api) throw new Error(
        `[${name}] Plugin "${requester}" requires "${n}", but "${n}" is not registered.`
      );
      return api;
    };
    const has = (n) => apis.has(n);

    // === Framework onBoot (sync) ===
    if (defaults.onBoot) defaults.onBoot({ config: globalConfig });

    // === Phase 1: Resolve Config (sync) ===
    for (const item of items) {
      const userConf = pluginConfigs[item.name];
      configs.set(item.name, Object.freeze({ ...item.spec.defaultConfig, ...userConf }));
    }

    // === Phase 2: Create (async, sequential) ===
    for (const item of items) {
      const conf = configs.get(item.name);
      if (item.spec.createState) {
        const state = await item.spec.createState({ global: globalConfig, config: conf });
        states.set(item.name, state);
      }
      if (item.spec.hooks) {
        for (const [h, fn] of Object.entries(item.spec.hooks)) {
          const list = hookMap.get(h) ?? [];
          list.push(fn);
          hookMap.set(h, list);
        }
      }
      if (item.spec.onCreate) {
        await item.spec.onCreate({ global: globalConfig, config: conf });
      }
    }

    // === Phase 3: Build APIs (async, sequential) ===
    for (const item of items) {
      const conf = configs.get(item.name);
      const state = states.get(item.name);
      let api = {};
      if (item.spec.api) {
        api = await item.spec.api({
          global: globalConfig, config: conf, state,
          emit, getPlugin,
          require: (n) => requirePlugin(n, item.name), has,
        });
      }
      api.config = conf;
      apis.set(item.name, api);
    }

    // === Phase 4: Init (async, sequential) ===
    for (const item of items) {
      if (item.spec.onInit) {
        await item.spec.onInit({
          global: globalConfig, config: configs.get(item.name),
          emit, getPlugin,
          require: (n) => requirePlugin(n, item.name), has,
        });
      }
    }

    // === Build app ===
    const app = {
      config: Object.freeze({ ...globalConfig, get: (k) => globalConfig[k] }),
      emit, getPlugin, require: (n) => requirePlugin(n, 'app'), has,

      start: async () => {
        if (started) return;
        started = true;
        if (defaults.onReady) await defaults.onReady({ config: globalConfig });
        await dispatch('app:start', { config: globalConfig });
        for (const item of items) {
          if (item.spec.onStart) {
            await item.spec.onStart({
              global: globalConfig, config: configs.get(item.name),
              state: states.get(item.name),
              emit, getPlugin,
              require: (n) => requirePlugin(n, item.name), has,
            });
          }
        }
      },

      stop: async () => {
        if (!started) return;
        started = false;
        for (const item of [...items].reverse()) {
          if (item.spec.onStop) await item.spec.onStop({ global: globalConfig });
        }
        await dispatch('app:stop', { config: globalConfig });
        if (defaults.onShutdown) await defaults.onShutdown({ config: globalConfig });
      },

      destroy: async () => {
        await app.stop();
        for (const item of [...items].reverse()) {
          if (item.spec.onDestroy) await item.spec.onDestroy({ global: globalConfig });
        }
        await dispatch('app:destroy', {});
        configs.clear(); states.clear(); apis.clear(); hookMap.clear();
      },
    };

    // Mount plugin APIs on app
    for (const [n, api] of apis) app[n] = api;
    return Object.freeze(app);
  }

  // --- createPlugin ---
  function createPluginFn(pluginName, spec) {
    return {
      kind: 'plugin', name: pluginName, spec,
      _hasDefaults: 'defaultConfig' in spec,
      _types: {},
    };
  }

  // --- createComponent ---
  function createComponentFn(compName, spec) {
    const mappedSpec = {
      ...spec,
      onStart: spec.onMount,
      onStop: spec.onUnmount,
    };
    return {
      kind: 'component', name: compName, spec: mappedSpec,
      _hasDefaults: 'defaultConfig' in spec,
      _types: {},
    };
  }

  // --- createModule ---
  function createModuleFn(modName, spec) {
    return { kind: 'module', name: modName, spec };
  }

  // --- createPluginFactory ---
  function createPluginFactoryFn(spec) {
    return (factoryName) => createPluginFn(factoryName, spec);
  }

  return {
    createConfig: createConfigFn,
    createApp: createAppFn,
    createPlugin: createPluginFn,
    createComponent: createComponentFn,
    createModule: createModuleFn,
    createEventBus: () => { /* standalone pub/sub utility */ },
    createPluginFactory: createPluginFactoryFn,
  };
}
```

---

## 2. Sync Kernel Differences (Variant A)

For the sync createApp variant, the only differences are:

1. `createAppFn` is not `async`
2. `createState`, `onCreate`, `api`, `onInit` calls are not `await`ed
3. `createApp` returns `App` directly instead of `Promise<App>`

```typescript
// Key difference: no async, no await on Phases 2-4
function createAppFn(appConfig, pluginConfigs) {
  // ... Phase 0 & 1 identical ...

  // Phase 2: Create (sync)
  for (const item of items) {
    const conf = configs.get(item.name);
    if (item.spec.createState) {
      states.set(item.name, item.spec.createState({ global: globalConfig, config: conf }));
    }
    // ... hooks registration identical ...
    if (item.spec.onCreate) {
      item.spec.onCreate({ global: globalConfig, config: conf });
    }
  }

  // Phase 3: Build APIs (sync)
  for (const item of items) {
    // ... same but without await on api() ...
  }

  // Phase 4: Init (sync)
  for (const item of items) {
    // ... same but without await on onInit() ...
  }

  // ... rest identical ...
  return Object.freeze(app);  // NOT a Promise
}
```

---

## 3. Flatten Helper

```typescript
function flatten(items) {
  const result = [];
  for (const item of items) {
    if (item.kind === 'module') {
      if (item.spec.onRegister) item.spec.onRegister();
      result.push(...flatten(item.spec.plugins ?? []));
      result.push(...flatten(item.spec.components ?? []));
      result.push(...flatten(item.spec.modules ?? []));
    } else {
      // Plugin or Component
      if (item.spec.plugins) {
        result.push(...flatten(item.spec.plugins));  // sub-plugins first
      }
      result.push(item);
    }
  }
  return result;
}
```

---

## 4. Design Decisions Log

Every significant "why" in this spec:

| Decision | Alternative considered | Why we chose this |
|---|---|---|
| Three layers (core -> framework -> consumer) | Single package | Constrains each layer, prevents LLM structural errors |
| `createCore` as single Layer 1 export | Multiple exports | One function = one concept = micro |
| `createConfig` + `createApp` two-step pattern | Three-arg createApp | TypeScript can't type arg 2 based on arg 3. Two steps let TS know all plugins before typing pluginConfigs. |
| `createConfig` returns opaque AppConfig | Return plain tuple/array | Opaque type prevents misuse. Phantom types carry plugin union. |
| No configRequired field | Boolean flag + defaultConfig | Config type IS the contract. One mechanism, one truth. |
| `defaultConfig` is full `C` | `Partial<C>` | Consumer gets complete valid config when omitting. |
| Unified `emit` with overloads (typed + untyped) | Separate `emit` + `signal` methods | Single method is simpler. EventContract provides type safety for known events. Untyped overload is the ad-hoc escape hatch. |
| Sequential async execution (not parallel) | Parallel execution within phases | Preserves ordering guarantee. Predictable. Debuggable. |
| No topological sort | Auto-sort by `depends` | Explicit ordering is simpler, more predictable, more debuggable. |
| `depends` as validation only | Dependency resolution | Just checks. Doesn't change order. Doesn't add magic. |
| Duplicate names throw | Silent overwrite / merge | Silent bugs are worse than loud errors. |
| Shallow merge only | Deep merge with lodash | Deep merge is unpredictable. Shallow merge has one rule. |
| Typed getPlugin/require on App type | Loose typing everywhere | Consumers get full type safety. Plugin internals stay loose (full union not known). |
| createPluginFactory in CoreAPI | External utility | Multi-instance plugins (two databases, three loggers) are a real need. Minimal addition. |
| moku_core/testing sub-path export | Testing in main entry point | Keeps core entry minimal. Testing is opt-in. |
| Typed hooks via EventContract | Untyped hooks at kernel level | EventContract gives typed payloads for known events, `unknown` for ad-hoc. Single mechanism. |
| No middleware in kernel | Built-in `pipe()` | Plugins implement their own. One less concept to learn. |
| Component = plugin at runtime | Separate runtime paths | Less code, fewer bugs, same capability. |
| Module = flattening container | Runtime entity with own lifecycle | Modules are organization, not runtime. |
| Sub-plugin types not propagated (v1) | Recursive FlattenPlugins type | TypeScript recursion limits. List explicitly for now. Planned for future. |
| `require()` throws, `getPlugin()` returns undefined | Single method | Two methods, two intentions. Clear semantics. |
| `ctx` varies by lifecycle phase | Same ctx everywhere | Prevents access to things that don't exist yet. |
| Configs frozen after creation | Mutable configs | Prevents a class of bugs. Use state for mutable data. |
| App frozen after creation | Mutable app | Same. The plugin set is static. |
| Default plugins immutable | Consumer can remove | Framework identity defined by its defaults. |
| Plugin = connection point | Plugin = code container | Enables independent testing, LLM navigation, separation of concerns. |
| Framework provides BaseConfig defaults | Consumer provides full config | Consumer only overrides what they need. Partial<BaseConfig>. |
| Consumer uses framework's createPlugin | Consumer creates plugins independently | Ensures custom plugins inherit BaseConfig and EventContract typing. |

### Open Design Decisions (Variants to Choose During Implementation)

| Decision | Variant A | Variant B | Tradeoffs |
|---|---|---|---|
| createApp sync/async | Sync (Phases 2-4 sync) | Async (Phases 2-4 async) | B: Plugins can do real I/O during init. A: Simpler, no await needed. |
| createCore generics | 2 (BaseConfig, EventContract) | **Resolved: 2 generics with unified EventContract** | EventContract replaces BusContract+SignalRegistry. Single generic for all events. |
| CoreAPI function count | 6 functions | 7 (+createPluginFactory) | B: Multi-instance plugins. A: Smaller API. |
| App getPlugin/require | Loose `<T = any>(string)` | Constrained to registered names | B: Full type safety. A: Simpler types. |
| PluginSpec lifecycle | Sync for Phases 2-4 | Async-compatible for Phases 2-4 | B: Real I/O during init. A: Simpler plugin authoring. |

### Planned Future Improvements (Not In v1)

| Feature | Why deferred |
|---|---|
| Sub-plugin type propagation | Recursive `FlattenPlugins` type. TypeScript recursion limits. High value, needs careful implementation. |
| Framework composition (`core.extend()`) | Framework B extends Framework A's config + defaults. Needs real-world validation. |
| Dynamic plugin loading (`app.extend()`) | Add plugins after createApp. Fundamental architecture question. |
| Reactive state utility (`moku_core/signals`) | Opt-in signals/computed/effects. Utility package, not core. |
| Consumer plugin restrictions (`validatePlugin`) | Duplicate name check is sufficient for now. |

---

## Cross-References

- Lifecycle: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)

