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
| 5 | Structured createApp namespaces (`config`, `pluginConfigs`, callbacks) | Flat object with runtime key discrimination | Explicit namespaces eliminate ambiguity. No runtime key discrimination needed. Consumer lifecycle callbacks (`onReady`, `onError`, `onStart`, `onStop`) are additive to framework-level callbacks. |
| 6 | Sequential async execution | Parallel execution within phases | Deterministic, easy to reason about. No parallel footgun. Plugin A's onInit resolves before Plugin B's begins. |
| 7 | Shallow merge only | Deep merge with library | One rule: `{ ...defaults, ...overrides }`. Predictable. No surprises with nested objects. |
| 8 | Instance-based depends | String-based depends | Importing a plugin instance gives TypeScript the phantom types. Enables fully typed ctx.require(pluginInstance). |
| 9 | ctx.global = Readonly\<Config\> | ctx.global = { config, state } | Global state is deferred. ctx.global is just the frozen config for now. Will expand to include state when that feature is implemented. |
| 10 | No topological sort | Auto-sort by depends | Explicit ordering is simpler, more predictable, more debuggable. depends is validation-only. |
| 11 | Configs frozen, state mutable | Everything mutable or everything frozen | Configs are the contract -- they must not change. State is the deliberate escape hatch for runtime mutation. |
| 12 | No sub-plugins — all plugins listed explicitly | Sub-plugins flattened depth-first | Explicit listing is simpler, gives full type visibility. Frameworks can re-export plugin arrays for convenience. |
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
    createState?: (ctx: MinimalContext<Config, C>) => S,      // S inferred from return
    api?: (ctx: PluginContext<Config, Events & PluginEvents & DepsEvents, C, S>) => A,  // A inferred
    onInit?: (ctx: PluginContext<...>) => void | Promise<void>,
    onStart?: (ctx: PluginContext<...>) => void | Promise<void>,
    onStop?: (ctx: TeardownContext<Config>) => void | Promise<void>,
    hooks?: (ctx: PluginContext<...>) => Partial<EventHandlers<Events & PluginEvents & DepsEvents>>,
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
  config?: Partial<Config>;
  pluginConfigs?: Record<string, any>;
  onReady?: (context: { config: Readonly<Config> }) => void | Promise<void>;
  onError?: (error: Error, context?: unknown) => void;
  onStart?: (context: { config: Readonly<Config> }) => void | Promise<void>;
  onStop?: (context: { config: Readonly<Config> }) => void | Promise<void>;
}): Promise<App<Config, Events, AllPlugins>> {

  // =========================================================================
  // Step 1: Destructure structured options
  // =========================================================================
  // RATIONALE: Explicit namespaces eliminate ambiguity. No runtime key
  // discrimination needed. config, pluginConfigs, and callbacks are separate.
  const {
    plugins: extraPlugins,
    config: configOverrides,
    pluginConfigs: consumerPluginConfigs,
    onReady: consumerOnReady,
    onError: consumerOnError,
    onStart: consumerOnStart,
    onStop: consumerOnStop,
  } = consumerOptions ?? {};

  // =========================================================================
  // Step 2: Merge plugin lists
  // =========================================================================
  // RATIONALE: Framework defaults come first, consumer extras second.
  // Consumer cannot reorder or remove framework defaults.
  const allPlugins = [...defaultPlugins, ...(extraPlugins ?? [])];

  // =========================================================================
  // Step 3: Validate names
  // =========================================================================
  // RATIONALE: No duplicate names. Duplicates are always a bug.
  // Error format: [frameworkId] description.\n  actionable suggestion.
  const names = allPlugins.map(p => p.name);
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
  for (let i = 0; i < allPlugins.length; i++) {
    const plugin = allPlugins[i];
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

  // 6a. Config overrides and plugin configs are already separated by the
  // structured options (no runtime key discrimination needed).

  // 6b. Global config: framework defaults <- consumer overrides
  const globalConfig: Readonly<Config> = Object.freeze({
    ...configDefaults,
    ...(configOverrides ?? {}),
  });

  // 6c. Per-plugin config: plugin defaults <- framework overrides <- consumer overrides
  const resolvedConfigs = new Map<string, Readonly<any>>();
  for (const plugin of allPlugins) {
    const merged = Object.freeze({
      ...plugin.spec.config,
      ...frameworkPluginConfigs[plugin.name],
      ...(consumerPluginConfigs ?? {})[plugin.name],
    });
    resolvedConfigs.set(plugin.name, merged);
  }

  // =========================================================================
  // Step 7: Create state
  // =========================================================================
  // RATIONALE: State is created before APIs because api() receives state in ctx.
  // Only MinimalContext available -- no emit, no require, no other plugins.
  const states = new Map<string, any>();
  for (const plugin of allPlugins) {
    if (plugin.spec.createState) {
      const ctx = {
        global: globalConfig,
        config: resolvedConfigs.get(plugin.name),
      };
      states.set(plugin.name, plugin.spec.createState(ctx));
    }
  }

  // =========================================================================
  // Step 8a: Build event bus (empty -- hooks registered in Step 8b)
  // =========================================================================
  // RATIONALE: The event bus infrastructure is created first (hookMap, dispatch,
  // emit, registerHook). Hooks are NOT registered yet -- that happens in Step 8b
  // after the context factory is available. This 2-step approach preserves the
  // invariant that hooks are registered before APIs and onInit run.
  const hookMap = new Map<string, Array<(payload: any) => void | Promise<void>>>();

  // Combined onError: calls both framework and consumer handlers
  const combinedOnError = (err: Error) => {
    if (options.onError) options.onError(err);
    if (consumerOnError) consumerOnError(err);
  };

  async function dispatch(eventName: string, payload: any) {
    const handlers = hookMap.get(eventName) ?? [];
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (err) {
        // One failing hook does not stop other hooks (same pattern as executeStop).
        combinedOnError(err as Error);
      }
    }
  }

  const emit = (eventName: string, payload?: any) => {
    void dispatch(eventName, payload);
  };

  function registerHook(eventName: string, handler: (payload: any) => void | Promise<void>) {
    const list = hookMap.get(eventName) ?? [];
    list.push(handler);
    hookMap.set(eventName, list);
  }

  // =========================================================================
  // Step 8b: Build context factory + Register hooks
  // =========================================================================
  // RATIONALE: hooks(ctx) follows the same closure pattern as api(ctx).
  // The context factory must exist before hooks can be called.
  // hooks(ctx) returns handler functions that capture ctx via closure.
  // The handlers don't call ctx.require() until an event fires (at runtime),
  // by which point all APIs are built.
  const apis = new Map<string, any>();

  // Helper to build plugin context for a specific plugin
  function buildPluginContext(plugin: PluginInstance) {
    return {
      global: globalConfig,
      config: resolvedConfigs.get(plugin.name),
      state: states.get(plugin.name),
      emit,
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

  // Register hooks (context-aware)
  for (const plugin of allPlugins) {
    if (plugin.spec.hooks) {
      const hookHandlers = plugin.spec.hooks(buildPluginContext(plugin));
      for (const [eventName, handler] of Object.entries(hookHandlers)) {
        if (!handler) continue;
        registerHook(eventName, handler);
      }
    }
  }

  // =========================================================================
  // Step 9: Build APIs
  // =========================================================================
  // RATIONALE: APIs are built after state and hooks so that api() has access
  // to state and can emit events. Forward order.
  for (const plugin of allPlugins) {
    if (plugin.spec.api) {
      const ctx = buildPluginContext(plugin);
      apis.set(plugin.name, plugin.spec.api(ctx));
    }
  }

  // =========================================================================
  // Step 10: Run onInit (forward order)
  // =========================================================================
  // RATIONALE: Sequential, each plugin awaited. All APIs are built,
  // so onInit can safely call require().
  for (const plugin of allPlugins) {
    if (plugin.spec.onInit) {
      const ctx = buildPluginContext(plugin);
      await plugin.spec.onInit(ctx);
    }
  }

  // Call framework onReady if provided
  if (options.onReady) {
    await options.onReady({ config: globalConfig });
  }

  // Call consumer onReady if provided (after framework onReady)
  if (consumerOnReady) {
    await consumerOnReady({ config: globalConfig });
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

  for (const plugin of allPlugins) {
    if (plugin.spec.onStart) {
      const ctx = buildPluginContext(plugin);
      await plugin.spec.onStart(ctx);
    }
  }

  // Consumer onStart fires after all plugin onStart
  if (consumerOnStart) {
    await consumerOnStart({ config: globalConfig });
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
  // continue stopping remaining plugins. Consumer onStop fires even if
  // a plugin threw (via try/finally). Re-throw the first error after all done.

  guardStopped();

  if (!started) {
    throw new Error(`[${id}] App not started.\n  Call start() before stop().`);
  }
  stopped = true;

  let firstError: Error | null = null;

  // Combined onError: calls both framework and consumer handlers
  const combinedOnError = (err: Error) => {
    if (options.onError) options.onError(err);
    if (consumerOnError) consumerOnError(err);
  };

  try {
    for (const plugin of [...allPlugins].reverse()) {
      if (plugin.spec.onStop) {
        try {
          await plugin.spec.onStop({ global: globalConfig });
        } catch (err) {
          if (!firstError) firstError = err as Error;
          // Continue stopping remaining plugins (best-effort teardown)
          combinedOnError(err as Error);
        }
      }
    }
  } finally {
    // Consumer onStop fires even if a plugin's onStop threw
    if (consumerOnStop) {
      await consumerOnStop({ config: globalConfig });
    }
  }

  if (firstError) throw firstError;
}
```

---

## 8. Helper Functions

### buildPluginContext

See Section 5, Step 9 for the full implementation. Constructs the appropriate context object for a given plugin, providing:
- `global` -- frozen global config
- `config` -- frozen plugin config
- `state` -- mutable plugin state
- `emit` -- event dispatch function
- `require` / `has` -- inter-plugin communication

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
  await createApp({ plugins?, config?, pluginConfigs?, onReady?, onError?, onStart?, onStop? })
    -> destructure structured options (no key discrimination)
    -> merge plugins: [...defaults, ...extras]
    -> validate names (no duplicates)
    -> validate dependencies (exists + earlier in array)
    -> resolve config (shallow merge, freeze)
    -> create state (MinimalContext)
    -> build event bus (empty hookMap, emit, registerHook)
    -> build context factory
    -> register hooks (hooks(ctx), context-aware)
    -> build APIs (PluginContext)
    -> run onInit (PluginContext, forward, sequential)
    -> call framework onReady, then consumer onReady
    -> freeze and return app

  await app.start()
    -> run onStart (PluginContext, forward, sequential)
    -> call consumer onStart

  await app.stop()
    -> run onStop (TeardownContext, REVERSE, sequential, best-effort)
    -> call consumer onStop (even if a plugin threw, via try/finally)
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
