# 13 - Kernel Pseudocode (Reference Implementation)

**Domain:** Complete v3 reference implementation in pseudo-TypeScript, design decisions log
**Version:** v3 (3-step factory chain)

---

## 1. Design Decisions Log

Every significant "why" in the v3 architecture:

| # | Decision | Alternative Considered | Why This Choice |
|---|----------|----------------------|-----------------|
| 1 | 3-step factory chain (createCoreConfig -> createCore -> createApp) | Single createCore with all generics | Breaks the circular dependency between config.ts (where generics live) and plugin files (which need those generics). Each step captures its context in a closure. |
| 2 | 2 generics on createCoreConfig (Config, Events) | 3 generics (adding State) | State is deferred. 2 generics keep the surface minimal. The signature can expand to 3 later without breaking existing code. |
| 3 | 0 generics on createPlugin | 4-7 explicit generics (N, C, S, A, Events, Deps) | All types inferred from the spec object. PluginEvents inferred from the `events` register callback. Config and Events flow in from the closure. Zero manual generics anywhere. |
| 4 | 3 lifecycle phases (init, start, stop) | Many phases with pre/after hooks | Covers all real use cases. Pre/after hooks add complexity for marginal benefit. Plugins that need cross-cutting notification use the event system. |
| 5 | Flat createApp object | Separate createConfig + createApp two-step | Single-call consumer API. The type system discriminates config keys from plugin config keys from reserved keys. Simpler for consumers. |
| 6 | Sequential async execution | Parallel execution within phases | Deterministic, easy to reason about. No parallel footgun. Plugin A's onInit resolves before Plugin B's begins. |
| 7 | Shallow merge only | Deep merge with library | One rule: `{ ...defaults, ...overrides }`. Predictable. No surprises with nested objects. |
| 8 | Instance-based depends | String-based depends | Importing a plugin instance gives TypeScript the phantom types. Enables fully typed ctx.require(pluginInstance). |
| 9 | ctx.global = Readonly\<Config\> | ctx.global = { config, state } | Global state is deferred. ctx.global is just the frozen config for now. Will expand to include state when that feature is implemented. |
| 10 | No topological sort | Auto-sort by depends | Explicit ordering is simpler, more predictable, more debuggable. depends is validation-only. |
| 11 | Configs frozen, state mutable | Everything mutable or everything frozen | Configs are the contract -- they must not change. State is the deliberate escape hatch for runtime mutation. |
| 12 | Sub-plugins flattened depth-first, children before parent | No sub-plugins in v3 | Simple and useful for organizing related plugins. Trivial flattening without modules. |
| 13 | start/stop callable once, terminal after stop | Idempotent no-ops on repeat calls | Throws on second call catches misuse. Terminal state prevents zombie apps. |
| 14 | Stop is best-effort | Stop aborts on first error | One plugin's cleanup failure should not orphan other plugins' resources. All plugins get their onStop called. |

---

## 2. createCoreConfig (Step 1 of Factory Chain)

```pseudo-typescript
function createCoreConfig<
  Config extends Record<string, any>,
  Events extends Record<string, any> = {},
>(
  id: string,
  options: { config: Config },
): {
  createPlugin: BoundCreatePlugin<Config, Events>;
  createCore: BoundCreateCore<Config, Events>;
} {
  // RATIONALE: This is the key trick of the 3-step chain.
  // Config and Events generics are captured in this closure.
  // Everything returned from here -- createPlugin, createCore --
  // carries these types without the caller needing to repeat them.
  //
  // Framework plugins import createPlugin from config.ts and automatically
  // get typed ctx.global, ctx.emit, hooks without any explicit generics.

  const configDefaults: Config = options.config;

  function createPlugin(...) { /* see Section 3 */ }
  function createCore(...) { /* see Section 4 */ }

  return { createPlugin, createCore };
}
```

**What this captures:** The framework ID (`id`), the default config values (`configDefaults`), and the generic types `Config` and `Events` in a closure. All downstream functions inherit these.

**File location:** This function lives in the framework's `config.ts`. Plugin files import `createPlugin` from this module.

---

## 3. createPlugin (Bound to Framework Types)

```pseudo-typescript
function createPlugin(
  name: N,  // N is a literal string type, inferred from the argument
  spec: {
    events?: (register: RegisterFn) => EventDescriptorMap,  // PluginEvents inferred from return
    config?: C,                                       // C inferred from value
    depends?: readonly [...PluginInstance[]],                 // tuple of instances
    plugins?: PluginInstance[],                               // sub-plugins
    createState?: (ctx: MinimalContext<Config, C>) => S,      // S inferred from return
    api?: (ctx: PluginContext<Config, Events & PluginEvents & DepsEvents, C, S>) => A,  // A inferred
    onInit?: (ctx: PluginContext<...>) => void | Promise<void>,
    onStart?: (ctx: PluginContext<...>) => void | Promise<void>,
    onStop?: (ctx: TeardownContext<Config>) => void | Promise<void>,
    hooks?: Partial<EventHandlers<Events & PluginEvents & DepsEvents>>,
  },
): PluginInstance<N, C, S, A, PluginEvents> {
  // RATIONALE: All generics (N, C, S, A, PluginEvents) are inferred from the spec object.
  // The framework doesn't pass them. The plugin author doesn't write them.
  // TypeScript infers N from the name string literal, C from config,
  // S from createState return, A from api return, PluginEvents from events callback return.
  //
  // The events register callback solves the "infer from type position" problem:
  // register<T>(desc) returns EventDescriptor<T>, and TypeScript infers T from the
  // generic argument. The return type of the callback builds the full event map.
  //
  // Config and Events come from the closure -- captured when createCoreConfig
  // returned this createPlugin function. The plugin author never sees them.

  // DepsEvents is the intersection of PluginEvents from all plugins in depends.
  // TypeScript computes this from the phantom types on the PluginInstance objects
  // via UnionToIntersection.

  return {
    name,
    spec,
    // Phantom types for type-level inference (erased at runtime)
    _phantom: {} as {
      config: C;
      state: S;
      api: A;
      events: PluginEvents;
    },
  };
}
```

**Type flow:**
- `Config` and `Events` -- from createCoreConfig closure (invisible to plugin author)
- `N` -- inferred from `name` argument (literal string type)
- `C` -- inferred from `config` value
- `S` -- inferred from `createState` return type
- `A` -- inferred from `api` return type
- `PluginEvents` -- inferred from `events` register callback return type
- `DepsEvents` -- intersection of dependency phantom types via `UnionToIntersection`

---

## 4. createCore (Step 2 of Factory Chain)

```pseudo-typescript
function createCore(
  coreConfig: { id: string; configDefaults: Config },
  options: {
    plugins: PluginInstance[],          // framework default plugins
    pluginConfigs?: Record<string, any>, // framework-level plugin config overrides
    onReady?: (ctx: { config: Readonly<Config> }) => void | Promise<void>,
    onError?: (error: Error) => void,
  },
): {
  createApp: BoundCreateApp<Config, Events, DefaultPlugins>;
  createPlugin: BoundCreatePlugin<Config, Events>;
} {
  // RATIONALE: createCore captures the framework's default plugins, their configs,
  // and the framework callbacks. It returns createApp which already "knows" about
  // the defaults. It also re-exports createPlugin for consumer convenience --
  // consumers import { createApp, createPlugin } from 'my-framework'.

  const { id, configDefaults } = coreConfig;
  const defaultPlugins = options.plugins;
  const frameworkPluginConfigs = options.pluginConfigs ?? {};

  async function createApp(consumerOptions?) { /* see Section 5 */ }

  return { createApp, createPlugin };
}
```

**What this captures:** Default plugins, framework-level plugin configs, callbacks. The consumer's `createApp` is now fully bound to the framework's choices.

**File location:** Called once in the framework's `index.ts`. The returned `createApp` and `createPlugin` are exported to consumers.

---

## 5. createApp (Step 3 -- The Main Body)

This is the longest section. It covers the entire init phase.

```pseudo-typescript
async function createApp(consumerOptions?: {
  plugins?: PluginInstance[];
  // ...Partial<Config>           -- config overrides (matching Config keys)
  // ...BuildPluginConfigs<All>   -- plugin configs (matching plugin names)
}): Promise<App<Config, Events, AllPlugins>> {

  // =========================================================================
  // Step 1: Parse flat options
  // =========================================================================
  // RATIONALE: Single flat object is ergonomic for consumers.
  // Runtime separates: reserved keys (plugins), plugin config keys
  // (matching registered plugin names), and remaining keys (config overrides).
  const { plugins: extraPlugins, ...rest } = consumerOptions ?? {};
  // Deferred: actual key separation happens after we know all plugin names (Step 3)

  // =========================================================================
  // Step 2: Merge plugin lists
  // =========================================================================
  // RATIONALE: Framework defaults come first, consumer extras second.
  // Consumer cannot reorder or remove framework defaults.
  const allPlugins = [...defaultPlugins, ...(extraPlugins ?? [])];

  // =========================================================================
  // Step 3: Flatten sub-plugins
  // =========================================================================
  // RATIONALE: Depth-first, children before parent.
  // A plugin with plugins: [subA, subB] becomes [subA, subB, parent].
  // This ensures sub-plugins are registered before their parent.
  const flatPlugins = flatten(allPlugins);

  // =========================================================================
  // Step 4: Validate names
  // =========================================================================
  // RATIONALE: No duplicate names. Duplicates are always a bug.
  // Error format: [frameworkId] description.\n  actionable suggestion.
  const names = flatPlugins.map(p => p.name);
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(
        `[${id}] Duplicate plugin name: "${name}".\n` +
        `  Each plugin must have a unique name.`
      );
    }
    seen.add(name);
  }

  // =========================================================================
  // Step 5: Validate dependencies
  // =========================================================================
  // RATIONALE: depends is validation-only. No topological sort.
  // Every dependency must exist AND appear EARLIER in the array.
  for (let i = 0; i < flatPlugins.length; i++) {
    const plugin = flatPlugins[i];
    if (!plugin.spec.depends) continue;

    for (const dep of plugin.spec.depends) {
      const depName = dep.name;
      const depIndex = names.indexOf(depName);

      if (depIndex === -1) {
        throw new Error(
          `[${id}] Plugin "${plugin.name}" depends on "${depName}", ` +
          `but "${depName}" is not registered.\n` +
          `  Add "${depName}" to your plugin list before "${plugin.name}".`
        );
      }
      if (depIndex >= i) {
        throw new Error(
          `[${id}] Plugin "${plugin.name}" depends on "${depName}", ` +
          `but "${depName}" appears after "${plugin.name}".\n` +
          `  Move "${depName}" before "${plugin.name}" in your plugin list.`
        );
      }
    }
  }

  // =========================================================================
  // Step 6: Resolve config
  // =========================================================================
  // RATIONALE: Shallow merge. Framework defaults -> consumer overrides.
  // Config keys are identified from the Config type shape.
  // Plugin config keys are identified by matching registered plugin names.

  // 6a. Separate config overrides from plugin configs
  const pluginNameSet = new Set(names);
  const configOverrides: Partial<Config> = {};
  const consumerPluginConfigs: Record<string, any> = {};

  for (const [key, value] of Object.entries(rest)) {
    if (pluginNameSet.has(key)) {
      consumerPluginConfigs[key] = value;
    } else {
      configOverrides[key] = value;
    }
  }

  // 6b. Global config: framework defaults <- consumer overrides
  const globalConfig: Readonly<Config> = Object.freeze({
    ...configDefaults,
    ...configOverrides,
  });

  // 6c. Per-plugin config: plugin defaults <- framework overrides <- consumer overrides
  const resolvedConfigs = new Map<string, Readonly<any>>();
  for (const plugin of flatPlugins) {
    const merged = Object.freeze({
      ...plugin.spec.config,
      ...frameworkPluginConfigs[plugin.name],
      ...consumerPluginConfigs[plugin.name],
    });
    resolvedConfigs.set(plugin.name, merged);
  }

  // =========================================================================
  // Step 7: Create state
  // =========================================================================
  // RATIONALE: State is created before APIs because api() receives state in ctx.
  // Only MinimalContext available -- no emit, no require, no other plugins.
  const states = new Map<string, any>();
  for (const plugin of flatPlugins) {
    if (plugin.spec.createState) {
      const ctx = {
        global: globalConfig,
        config: resolvedConfigs.get(plugin.name),
      };
      states.set(plugin.name, plugin.spec.createState(ctx));
    }
  }

  // =========================================================================
  // Step 8: Build event bus
  // =========================================================================
  // RATIONALE: Hooks are registered before APIs and onInit run,
  // so that events emitted during api() or onInit() are captured.
  const hookMap = new Map<string, Array<(payload: any) => void | Promise<void>>>();

  async function dispatch(eventName: string, payload: any) {
    const handlers = hookMap.get(eventName) ?? [];
    for (const handler of handlers) {
      await handler(payload);
    }
  }

  const emit = (eventName: string, payload?: any) => {
    void dispatch(eventName, payload);
  };

  // Register hooks from all plugins
  for (const plugin of flatPlugins) {
    if (plugin.spec.hooks) {
      for (const [eventName, handler] of Object.entries(plugin.spec.hooks)) {
        if (!handler) continue;
        const list = hookMap.get(eventName) ?? [];
        list.push(handler);
        hookMap.set(eventName, list);
      }
    }
  }

  // =========================================================================
  // Step 9: Build APIs
  // =========================================================================
  // RATIONALE: APIs are built after state and hooks so that api() has access
  // to state and can emit events. Forward order.
  const apis = new Map<string, any>();

  // Helper to build plugin context for a specific plugin
  function buildPluginContext(plugin: PluginInstance) {
    return {
      global: globalConfig,
      config: resolvedConfigs.get(plugin.name),
      state: states.get(plugin.name),
      emit,
      // Instance-only: accepts PluginInstance, extracts name at runtime
      getPlugin: (pluginInstance: PluginInstance) => {
        return apis.get(pluginInstance.name);
      },
      // Instance-only: accepts PluginInstance, throws if not registered
      require: (pluginInstance: PluginInstance) => {
        const api = apis.get(pluginInstance.name);
        if (!api) {
          throw new Error(
            `[${id}] Plugin "${plugin.name}" requires "${pluginInstance.name}", ` +
            `but "${pluginInstance.name}" is not registered.\n` +
            `  Add "${pluginInstance.name}" to your plugin list.`
          );
        }
        return api;
      },
      // has stays string-based (boolean check)
      has: (name: string) => apis.has(name),
    };
  }

  for (const plugin of flatPlugins) {
    if (plugin.spec.api) {
      const ctx = buildPluginContext(plugin);
      apis.set(plugin.name, plugin.spec.api(ctx));
    }
  }

  // =========================================================================
  // Step 10: Run onInit (forward order)
  // =========================================================================
  // RATIONALE: Sequential, each plugin awaited. All APIs are built,
  // so onInit can safely call require() and getPlugin().
  for (const plugin of flatPlugins) {
    if (plugin.spec.onInit) {
      const ctx = buildPluginContext(plugin);
      await plugin.spec.onInit(ctx);
    }
  }

  // Call framework onReady if provided
  if (options.onReady) {
    await options.onReady({ config: globalConfig });
  }

  // =========================================================================
  // Step 11: Build and freeze app
  // =========================================================================
  let started = false;
  let stopped = false;

  function guardStopped() {
    if (stopped) {
      throw new Error(`[${id}] App is stopped. No further operations allowed.`);
    }
  }

  const app = {
    start: async () => { /* see Section 6 */ },
    stop: async () => { /* see Section 7 */ },

    emit: (eventName: string, payload?: any) => {
      guardStopped();
      emit(eventName, payload);
    },

    // Instance-only: accepts PluginInstance, extracts name at runtime
    getPlugin: (pluginInstance: PluginInstance) => {
      guardStopped();
      return apis.get(pluginInstance.name);
    },

    // Instance-only: accepts PluginInstance, throws if not registered
    require: (pluginInstance: PluginInstance) => {
      guardStopped();
      const api = apis.get(pluginInstance.name);
      if (!api) {
        throw new Error(
          `[${id}] app.require("${pluginInstance.name}") failed: "${pluginInstance.name}" is not registered.\n` +
          `  Check your plugin list.`
        );
      }
      return api;
    },

    // has stays string-based (boolean check)
    has: (name: string) => {
      guardStopped();
      return apis.has(name);
    },
  };

  // Mount plugin APIs directly on app: app.router, app.blog, etc.
  for (const [name, api] of apis) {
    app[name] = api;
  }

  return Object.freeze(app) as App<Config, Events, AllPlugins>;
}
```

---

## 6. app.start()

```pseudo-typescript
async start() {
  // RATIONALE: Forward order. Sequential. Each plugin awaited.
  // Throws if already started (catches misuse).
  guardStopped();

  if (started) {
    throw new Error(`[${id}] App already started.\n  start() can only be called once.`);
  }
  started = true;

  for (const plugin of flatPlugins) {
    if (plugin.spec.onStart) {
      const ctx = buildPluginContext(plugin);
      await plugin.spec.onStart(ctx);
    }
  }
}
```

---

## 7. app.stop()

```pseudo-typescript
async stop() {
  // RATIONALE: REVERSE order. Plugins that depend on others stop first.
  // If B depends on A, B stops before A -- B can still use A's resources
  // during its own cleanup.
  //
  // Best-effort: if a plugin's onStop throws, capture the error but
  // continue stopping remaining plugins. Re-throw the first error after all done.

  guardStopped();

  if (!started) {
    throw new Error(`[${id}] App not started.\n  Call start() before stop().`);
  }
  stopped = true;

  let firstError: Error | null = null;

  for (const plugin of [...flatPlugins].reverse()) {
    if (plugin.spec.onStop) {
      try {
        await plugin.spec.onStop({ global: globalConfig });
      } catch (err) {
        if (!firstError) firstError = err as Error;
        // Continue stopping remaining plugins (best-effort teardown)
        if (options.onError) options.onError(err as Error);
      }
    }
  }

  if (firstError) throw firstError;
}
```

---

## 8. Helper Functions

### flatten

```pseudo-typescript
function flatten(plugins: PluginInstance[]): PluginInstance[] {
  // RATIONALE: Depth-first, children before parent.
  // If a plugin has sub-plugins, they appear before the parent.
  // This is a simple recursive walk -- no modules, no special cases.
  const result: PluginInstance[] = [];

  for (const plugin of plugins) {
    if (plugin.spec.plugins && plugin.spec.plugins.length > 0) {
      // Recurse into sub-plugins first
      result.push(...flatten(plugin.spec.plugins));
    }
    result.push(plugin);
  }

  return result;
}
```

### buildPluginContext

See Section 5, Step 9 for the full implementation. Constructs the appropriate context object for a given plugin, providing:
- `global` -- frozen global config
- `config` -- frozen plugin config
- `state` -- mutable plugin state
- `emit` -- event dispatch function
- `getPlugin` / `require` / `has` -- inter-plugin communication

### guardStopped

```pseudo-typescript
function guardStopped() {
  // RATIONALE: After stop(), the app is in a terminal state.
  // All methods throw to prevent use of a stopped app.
  if (stopped) {
    throw new Error(`[${id}] App is stopped. No further operations allowed.`);
  }
}
```

---

## 9. End-to-End Flow Summary

```
Framework config.ts:
  createCoreConfig<Config, Events>(id, { config })
    -> captures generics in closure
    -> returns { createPlugin, createCore }

Framework plugin files:
  createPlugin('name', { events, config, createState, api, onInit, onStart, onStop, hooks })
    -> all types inferred from spec; Config + Events from closure
    -> PluginEvents inferred from events register callback
    -> returns PluginInstance with phantom types

Framework index.ts:
  createCore(coreConfig, { plugins: [defaultPlugins...] })
    -> captures default plugins
    -> returns { createApp, createPlugin }

Consumer main.ts:
  await createApp({ plugins, ...configOverrides, ...pluginConfigs })
    -> merge plugins: [...defaults, ...extras]
    -> flatten sub-plugins (depth-first)
    -> validate names (no duplicates)
    -> validate dependencies (exists + earlier in array)
    -> resolve config (shallow merge, freeze)
    -> create state (MinimalContext)
    -> register hooks
    -> build APIs (PluginContext)
    -> run onInit (PluginContext, forward, sequential)
    -> freeze and return app

  await app.start()
    -> run onStart (PluginContext, forward, sequential)

  await app.stop()
    -> run onStop (TeardownContext, REVERSE, sequential, best-effort)
    -> app enters terminal state
```

---

## Cross-References

- Architecture: [01-ARCHITECTURE](./01-ARCHITECTURE.md)
- Core API signatures: [02-CORE-API](./02-CORE-API.md)
- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Factory chain: [04-FACTORY-CHAIN](./04-FACTORY-CHAIN.md)
- Config resolution: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Communication: [07-COMMUNICATION](./07-COMMUNICATION.md)
- Context tiers: [08-CONTEXT](./08-CONTEXT.md)
- Type system: [09-TYPE-SYSTEM](./09-TYPE-SYSTEM.md)
- Invariants: [11-INVARIANTS](./11-INVARIANTS.md)
