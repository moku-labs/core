# 06 - Lifecycle

**Domain:** All 9 phases, ordering, sync/async, error handling
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1), SPEC_IMPROVEMENTS_IDEAS (P1)

---

## 1. Phases

```
Phase 0: FLATTEN + VALIDATE (sync)
  1. Merge framework default plugins + consumer extra plugins
     Final list: [...frameworkDefaults, ...consumerExtras]
  2. Flatten modules (depth-first, children before parents)
  3. Flatten sub-plugins (depth-first, children before parents)
  4. DUPLICATE NAME CHECK -> throw if any collision
  5. DEPENDENCY VALIDATION -> for each plugin with `depends`:
     a. Check every dependency exists in the list
     b. Check every dependency appears BEFORE the dependent
     c. Throw with clear error if either fails
  Result: validated, flat, ordered list

Phase 1: RESOLVE CONFIG (sync)
  For each plugin:
    1. Look up consumer-provided config for this plugin name
    2. Shallow merge: { ...defaultConfig, ...consumerConfig }
    3. Freeze resolved config

Phase 2: CREATE
  For each plugin (in order):
    1. createState({ global, config }) -> state
    2. Register hook handlers from `hooks` field
    3. onCreate({ global, config })

Phase 3: BUILD APIs
  For each plugin (in order):
    1. api(PluginCtx) -> A (public API object)
    2. Attach frozen config to API namespace: api.config = resolvedConfig
    3. Register API in plugin registry

Phase 4: INIT
  For each plugin (in order):
    1. onInit(BaseCtx & { config })
    2. This is where plugins validate dependencies with require()/has()

--- createApp resolves here. App is returned. ---

Phase 5: START (triggered by app.start())
  1. framework.onReady({ config }) if defined
  2. emit('app:start', { config })
  3. For each plugin (in order):
     onStart(PluginCtx)

Phase 6: RUNNING
  Plugins communicate via emit() and getPlugin()/require().

Phase 7: STOP (triggered by app.stop())
  1. For each plugin (in REVERSE order):
     onStop({ global })
  2. emit('app:stop', { config })
  3. framework.onShutdown({ config }) if defined

Phase 8: DESTROY (triggered by app.destroy())
  1. Calls stop() if not already stopped (idempotent)
  2. For each plugin (in REVERSE order):
     onDestroy({ global })
  3. emit('app:destroy', {})
  4. Clear all internal registries (configs, states, apis, hooks)
```

---

## 2. Sync vs Async

### Variant A: Sync createApp (Phases 2-4 sync)

| Phase | Sync/Async | Rationale |
|---|---|---|
| 0 (Flatten + Validate) | **Sync** | Pure data transformation. No I/O. |
| 1 (Resolve Config) | **Sync** | Pure merge + freeze. |
| 2 (Create) | **Sync** | createState and onCreate are sync. |
| 3 (Build APIs) | **Sync** | api() factory is sync. |
| 4 (Init) | **Sync** | onInit is sync. |
| 5 (Start) | **Async** | Plugins may connect to databases, load files. |
| 7 (Stop) | **Async** | Plugins may flush buffers, close connections. |
| 8 (Destroy) | **Async** | Plugins may finalize, disconnect. |

`createApp` itself is synchronous. Phases 0-4 run synchronously. `app.start()`, `app.stop()`, `app.destroy()` return Promises.

If a plugin needs async initialization (database connection, file loading), it does so in `onStart`. The API factory returns methods that work with whatever state is available after sync init.

### Variant B: Async createApp (Phases 2-4 async)

| Phase | Sync/Async | Rationale |
|---|---|---|
| 0 (Flatten + Validate) | **Sync** | Pure data transformation. No I/O. |
| 1 (Resolve Config) | **Sync** | Pure merge + freeze. |
| 2 (Create) | **Async** | createState and onCreate may need I/O (database connections, file reads). |
| 3 (Build APIs) | **Async** | api() factory may depend on async-initialized state. |
| 4 (Init) | **Async** | onInit may verify dependencies with async checks. |
| 5 (Start) | **Async** | Plugins may start servers, open connections. |
| 7 (Stop) | **Async** | Plugins may flush buffers, close connections. |
| 8 (Destroy) | **Async** | Plugins may finalize, disconnect. |

`createApp` returns a `Promise<App>`. Phases 0-1 run synchronously. Phases 2-4 are awaited sequentially. The returned app is fully initialized -- all async init is complete.

**All async lifecycle methods within a phase execute sequentially, one plugin at a time.** Plugin A's `createState` resolves before Plugin B's `createState` begins. No parallelism within or across phases.

---

## 3. Phase Details

### Phase 0: Flatten + Validate

Sync. Pure data transformation.

1. **Merge lists:** `[...frameworkDefaults.plugins, ...frameworkDefaults.components, ...frameworkDefaults.modules, ...consumerExtras]`
2. **Flatten:** See [04-COMPONENT-MODULE](./04-COMPONENT-MODULE.md) for the algorithm.
3. **Duplicate name check:** If any two items share the same `name`, throw.
4. **Dependency validation:** For each plugin with `depends`, validate all dependencies exist and appear before it.

### Phase 1: Resolve Config

Sync. For each plugin in order:

```typescript
resolvedConfig = Object.freeze({ ...spec.defaultConfig, ...pluginConfigs[pluginName] });
```

### Phase 2: Create

For each plugin in order:

1. **createState:** Call with `{ global, config }`. Returns `S` (or `Promise<S>` in Variant B). Store state.
2. **Register hooks:** Iterate `spec.hooks`, register each handler in the hook dispatch map.
3. **onCreate:** Call with `{ global, config }`. Validate config, set up internal structure.

**Context available:** Only `{ global, config }`. NO `getPlugin`, `require`, `has`, `emit` -- not all plugins exist yet.

### Phase 3: Build APIs

For each plugin in order:

1. **api factory:** Call with full `PluginCtx` (global, config, state, emit, getPlugin, require, has). Returns `A` (or `Promise<A>` in Variant B).
2. **Attach config:** `api.config = resolvedConfig` (frozen).
3. **Register:** Store API object in the plugin registry.

**Context available:** Full `PluginCtx`. All previously-created plugins' APIs are accessible via `getPlugin`/`require`.

### Phase 4: Init

For each plugin in order:

1. **onInit:** Call with `BaseCtx & { config }`. Full communication context available.
2. This is where plugins validate dependencies with `require()`/`has()`.

After Phase 4 completes, `createApp` resolves (returns the App).

### Phase 5: Start

Triggered by `app.start()`. Idempotent -- second call is a no-op.

1. `framework.onReady({ config })` if defined.
2. `emit('app:start', { config })` -- kernel-emitted event.
3. For each plugin in order: `onStart(PluginCtx)` (async, awaited sequentially).

### Phase 7: Stop

Triggered by `app.stop()`. Idempotent -- second call is a no-op.

1. For each plugin in **REVERSE** order: `onStop({ global })` (async, awaited sequentially).
2. `emit('app:stop', { config })` -- kernel-emitted event.
3. `framework.onShutdown({ config })` if defined.

### Phase 8: Destroy

Triggered by `app.destroy()`.

1. Calls `stop()` if not already stopped (idempotent).
2. For each plugin in **REVERSE** order: `onDestroy({ global })` (async, awaited sequentially).
3. `emit('app:destroy', {})` -- kernel-emitted event.
4. Clear all internal registries (configs, states, apis, hooks).

---

## 4. Error Handling

Lifecycle methods can throw (or reject). When they do:

- The error propagates to the caller (`await createApp(...)` or `await app.start()`).
- No catch-and-silence. No error swallowing. No retry logic.
- The consumer decides how to handle errors.

This is deliberate. The framework does not know what "error recovery" means in your domain.

---

## 5. Lifecycle Summary Table

| Phase | Method | Context | Direction | Async |
|---|---|---|---|---|
| 0 | (flatten + validate) | -- | Forward | Sync always |
| 1 | (resolve config) | -- | Forward | Sync always |
| 2 | `createState` | `{ global, config }` | Forward | Variant A: Sync / Variant B: Async |
| 2 | `onCreate` | `{ global, config }` | Forward | Variant A: Sync / Variant B: Async |
| 3 | `api` | `PluginCtx` (full) | Forward | Variant A: Sync / Variant B: Async |
| 4 | `onInit` | `BaseCtx & { config }` | Forward | Variant A: Sync / Variant B: Async |
| 5 | `onStart` | `PluginCtx` (full) | Forward | Async always |
| 7 | `onStop` | `{ global }` | **Reverse** | Async always |
| 8 | `onDestroy` | `{ global }` | **Reverse** | Async always |

---

## Cross-References

- Plugin spec: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Context details: [08-CONTEXT](./08-CONTEXT.md)
- Communication: [07-COMMUNICATION](./07-COMMUNICATION.md)
- Invariants: [11-INVARIANTS](./11-INVARIANTS.md)
