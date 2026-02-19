# Technical Development Roadmap

**Scope:** Pure moku_core framework development only.
**Not included:** External libraries, community, ecosystem, documentation sites, marketing, tutorials.
**Focus:** Ship a production-grade, type-safe plugin kernel for TypeScript.

---

## Milestone 1: Core Foundation

**Goal:** Implement the complete kernel -- all 9 lifecycle stages, plugin registry, config resolution, event dispatch, and the full type system.

### Deliverables

1. **createCore function**
   - Single export from `moku_core`
   - Accepts `name`, `defaults` (CoreDefaults)
   - Returns CoreAPI bound to generics (BaseConfig, BusContract, SignalRegistry)

2. **createConfig function**
   - Accepts `Partial<BaseConfig>` and optional `extraPlugins` array
   - Returns opaque `AppConfig` with phantom types carrying full plugin union
   - `const` generic inference on `ExtraPlugins`

3. **createApp function**
   - Accepts `AppConfig` and `pluginConfigs` (typed via `BuildPluginConfigs`)
   - Implements all 9 lifecycle stage:
     - stage 0: Flatten + Validate (sync)
     - stage 1: Resolve Config (sync)
     - stage 2: Create (async, sequential)
     - stage 3: Build APIs (async, sequential)
     - stage 4: Init (async, sequential)
     - stage 5-8: Start, Running, Stop, Destroy
   - Returns `Promise<App>` (async variant) or `App` (sync variant) -- to be decided
   - Freezes app and configs after construction

4. **createPlugin function**
   - Accepts name literal `N` and `PluginSpec<N, C, A, S>`
   - Returns `PluginInstance` with phantom types (`_types`, `_hasDefaults`)
   - Sets `_hasDefaults` based on presence of `defaultConfig`

5. **createComponent function**
   - Accepts name literal and `ComponentSpec`
   - Maps `onMount` -> `onStart`, `onUnmount` -> `onStop`
   - Returns `ComponentInstance`

6. **createModule function**
   - Accepts name literal and `ModuleSpec`
   - Returns `ModuleInstance`

7. **Flattening algorithm**
   - Depth-first, children before parents
   - Module `onRegister` callback during flattening
   - Sub-plugin flattening

8. **Validation**
   - Duplicate name detection with position info
   - Dependency validation (`depends` field)
   - Required config validation (runtime safety net)

9. **Event dispatch**
   - `emit()` for typed bus events (BusContract)
   - `signal()` for plugin-to-plugin events
   - Hook registration from plugin `hooks` field
   - Sequential handler execution, awaited

10. **Config resolution**
    - Shallow merge: `{ ...defaultConfig, ...consumerConfig }`
    - Freeze resolved config
    - Global config: `{ ...frameworkDefaults.config, ...consumerGlobal }`

### Type System Deliverables

- `PluginInstance<N, C, A, S>` with phantom types
- `ComponentInstance<N, C, A, S>`
- `ModuleInstance<N, C>`
- `PluginSpec<N, C, A, S>` -- all lifecycle methods
- `ComponentSpec<N, C, A, S>`
- `ModuleSpec<N, C>`
- `BaseCtx<G, Bus, Signals>` (or `BaseCtx<G, Bus>` for Variant A)
- `PluginCtx<G, Bus, Signals, C, S>` (or `PluginCtx<G, Bus, C, S>`)
- `BuildPluginConfigs<P>` -- config enforcement type
- `BuildPluginApis<P>` -- API surface type
- `AppConfig<G, DefaultP, ExtraPlugins>` -- opaque config type
- `App<G, Bus, Signals, P>` (or `App<G, Bus, P>`)
- Type helpers: `PluginName`, `PluginConfigType`, `PluginApiType`, `IsEmptyConfig`, `HasDefaults`, `PluginApiByName`
- `Prettify` and `OmitNever` utility types

### Success Criteria

- All 9 lifecycle stage execute correctly
- Plugin ordering is deterministic (forward init, reverse teardown)
- Config resolution works for all cases (void, required, optional with defaults)
- Type inference works end-to-end: `createCore` -> `createConfig` -> `createApp` -> `app.pluginName.method()`
- Duplicate names throw with clear error
- Dependency validation throws with clear error
- `Object.freeze` applied to app, configs
- `start`/`stop`/`destroy` are idempotent

---

## Milestone 2: Decision Points Resolution

**Goal:** Resolve the open variant decisions before or during Milestone 1 implementation.

### Decisions Required

1. **Async vs Sync createApp**
   - Variant A: Sync createApp, async deferred to onStart
   - Variant B: Async createApp, Promise<App>, Milestone 2-4 async
   - Recommendation: Variant B (enables real I/O during init)

2. **SignalRegistry (3rd generic)**
   - Variant A: 2 generics (BaseConfig, BusContract), signals fully untyped
   - Variant B: 3 generics (+SignalRegistry), signals optionally typed via overloads
   - Recommendation: Variant B (zero cost when unused, high value when used)

3. **createPluginFactory**
   - Variant A: 6 functions in CoreAPI
   - Variant B: 7 functions (+createPluginFactory)
   - Recommendation: Variant B (minimal addition, solves multi-instance pattern)

4. **Typed getPlugin/require on App**
   - Variant A: Loose `<T = any>(name: string)`
   - Variant B: Constrained to registered names, returns correct API type
   - Recommendation: Variant B (pure type improvement, zero runtime cost)

5. **Async lifecycle methods**
   - Variant A: Only onStart/onStop/onDestroy accept async
   - Variant B: All lifecycle methods accept async (S | Promise<S>)
   - Recommendation: Variant B (follows from async createApp decision)

---

## Milestone 3: createEventBus

**Goal:** Implement the standalone pub/sub utility.

### Deliverables

- `createEventBus<Events>()` function
- Typed `emit`, `on`, `off`, `clear` methods
- Sequential handler execution with await
- Can be used independently of the kernel
- Can be used by plugins for internal event handling

---

## Milestone 4: Testing Utilities

**Goal:** Ship `moku_core/testing` sub-path export with createTestCtx.

### Deliverables

1. **createTestCtx function**
   - Accepts optional `{ global, config, state, plugins }` partials
   - Returns `{ ctx, emitted, signaled }`
   - `ctx` matches `PluginCtx` shape
   - `emitted` captures emit calls
   - `signaled` captures signal calls
   - `getPlugin`/`require`/`has` use mock `plugins` map

2. **Sub-path export**
   - `import { createTestCtx } from 'moku_core/testing'`
   - NOT part of main entry point
   - Package.json `exports` field configuration

### Success Criteria

- Domain files (api.ts, state.ts, handlers.ts) testable in isolation
- No kernel, no lifecycle, no framework needed for unit tests
- Captured events inspectable for assertions

---

## Milestone 5: Error Catalog and DX

**Goal:** Comprehensive, actionable error messages and developer experience.

### Deliverables

1. **Error catalog**
   - All kernel errors follow format: `[framework-name] <description>.\n  <actionable suggestion>.`
   - Duplicate plugin name (with positions)
   - Missing dependency (with suggestion to add before)
   - Wrong dependency order (with suggestion to move)
   - Missing required config (with key name)
   - require() for unregistered plugin (with suggestion)

2. **JSDoc annotations**
   - All public types and functions with JSDoc
   - Parameter descriptions
   - Return type descriptions
   - `@example` tags for common usage patterns

3. **Type error improvement**
   - Ensure TypeScript error messages are as clear as possible when:
     - Missing required config key in createApp
     - Wrong config shape
     - Unknown plugin name in typed getPlugin (Variant B)
     - Missing extraPlugins in createConfig

---

## Milestone 6: Advanced Types

**Goal:** Implement the remaining type-level features.

### Deliverables

1. **Sub-plugin type propagation** (if feasible)
   - `FlattenPlugins<P>` recursive type
   - `_sub` phantom field on PluginInstance
   - `BuildPluginApis` uses flattened set
   - Depth limit: 4 levels
   - Fallback: explicit listing (current behavior)

2. **Improved type inference**
   - Ensure `createPlugin` generics can be partially inferred
   - Ensure `createConfig` const inference works for complex plugin arrays
   - Test with 10+ plugins to verify no TypeScript performance issues

---

## Milestone 7: Production Hardening

**Goal:** Ensure moku_core is production-grade.

### Deliverables

1. **Bundle size audit**
   - Target: < 5KB minified + gzipped for core
   - Tree-shaking verification
   - No runtime dependencies

2. **Performance benchmarks**
   - createApp with 50 plugins
   - Event dispatch with 100 handlers
   - Config resolution with deeply nested objects
   - Memory usage profiling

3. **Edge case testing**
   - 0 plugins
   - 1 plugin
   - 100+ plugins
   - Circular dependency detection (throw, don't hang)
   - Very long plugin names
   - Unicode plugin names
   - Plugins that throw during every lifecycle stage
   - Double start/stop/destroy

4. **TypeScript version compatibility**
   - Test against TypeScript 5.0+
   - Document minimum TypeScript version

---

## Milestone 8: Reactive State Utility (Optional)

**Goal:** Ship `moku_core/signals` as opt-in utility.

### Deliverables

1. **Signal primitive**
   - `createSignal<T>(initial): Signal<T>`
   - `get()`, `set()`, `update()`, `subscribe()`, `peek()`

2. **Computed primitive**
   - `createComputed<T>(fn, deps): Computed<T>`
   - Lazy evaluation, cached

3. **Effect primitive**
   - `createEffect(fn, deps): () => void` (returns cleanup)

4. **Sub-path export**
   - `import { createSignal, createComputed, createEffect } from 'moku_core/signals'`
   - NOT part of main entry point

### Success Criteria

- Plugins can use reactive state for change notifications
- Zero impact on core bundle size (separate import)
- Works independently of the kernel

---

## Milestone Summary

| Milestone | Description | Dependencies | Size |
|---|---|---|---|
| 1 | Core Foundation | None | XL |
| 2 | Decision Points | Before/during Milestone 1 | S |
| 3 | createEventBus | None (parallel with 1) | S |
| 4 | Testing Utilities | Milestone 1 | M |
| 5 | Error Catalog & DX | Milestone 1 | M |
| 6 | Advanced Types | Milestone 1 | L |
| 7 | Production Hardening | Milestone 1-5 | M |
| 8 | Reactive State (optional) | Milestone 1 | M |

### Dependency Graph

```
Milestone 2 (Decisions) --+--> Milestone 1 (Core) --+--> Milestone 4 (Testing)
                       |                      +--> Milestone 5 (DX)
Milestone 3 (EventBus) ---+                      +--> Milestone 6 (Types)
                                              +--> Milestone 7 (Hardening)
                                              +--> Milestone 8 (Signals)
```

### Non-Goals (Explicitly Out of Scope)

- Reference framework implementation (moku-web, etc.)
- CLI scaffolding tools
- Documentation website
- Community infrastructure
- Plugin marketplace
- Framework composition (`core.extend()`) -- deferred until real-world validation
- Dynamic plugin loading (`app.extend()`) -- deferred indefinitely
- Consumer plugin restrictions (`validatePlugin`) -- deferred
- Any external library integration
