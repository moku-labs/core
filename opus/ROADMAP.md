# Moku Core — Feature Roadmap

**Version:** 0.1
**Date:** 2026-02-18
**Status:** Active
**Scope:** `moku_core` package only — the universal plugin micro-framework kernel

---

## Summary Table

| Phase | Name | Goal | Complexity | Dependencies |
|---|---|---|---|---|
| 1 | Core Foundation | Ship the kernel: createCore, lifecycle engine, type system, event bus | XL | None |
| 2 | Testing & Developer Experience | Plugin testing utilities, JSDoc, error catalog, createAppSync | L | Phase 1 |
| 3 | Advanced Type Features | Sub-plugin type propagation, typed getPlugin, improved inference | L | Phase 1 |
| 4 | Signals & Extended Core | Reactive state utility, typed signal registry, createPluginFactory | L | Phase 1 |
| 5 | Production Hardening | Benchmarks, bundle optimization, tree-shaking, error recovery | M | Phases 1, 2 |

---

## Prerequisites

- **Node.js >= 18.x** (LTS, stable ESM support)
- **TypeScript >= 5.4** (`const` type parameters, improved inference, `NoInfer`)
- **pnpm** as the package manager
- **Git repository** initialized with `main` branch
- **CI pipeline** (GitHub Actions) for lint, type-check, and test on push
- **Finalized specification:** `opus/SPEC_DEFINITIVE.md` is the canonical design document

---

## Non-Goals / Out of Scope

| Item | Reason |
|---|---|
| Reference frameworks (moku-web, moku-cli, etc.) | Separate packages, separate repos. This roadmap covers `moku_core` only. |
| CLI scaffolding tools (create-moku-app) | External tooling, not part of the core kernel. |
| Documentation site | Separate concern. JSDoc and ERRORS.md cover core documentation needs. |
| Plugin marketplace / registry | Ecosystem concern, not core framework. |
| Migration guides from other frameworks | Community content, not core deliverables. |
| Reactive UI / virtual DOM / component tree | Domain-specific. Belongs in plugins. |
| Streaming / backpressure / networking | Domain-specific. Belongs in plugins. |
| Dynamic plugin loading (`app.extend()` at runtime) | Fundamental architecture question unresolved. Deferred. |
| Built-in middleware / pipe system | Plugins implement their own. Kernel stays boring. |
| Deep merge for config resolution | Intentionally excluded. Shallow merge only. |
| Topological sort for plugin ordering | Intentionally excluded. `depends` validates, does not reorder. |
| Python / Rust / Go ports | TypeScript only. |

---

## Risk Factors

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| TypeScript recursion limits on `FlattenPlugins` type | Phase 3 sub-plugin propagation may hit depth limits | Medium | Cap recursion at 4 levels. Test with TS nightly. |
| Async `createApp` requires `await` at consumer level | Top-level usage requires async context | Low | Provide `createAppSync` in Phase 2. |
| Bundle size creep from type utilities | Phantom types could increase `.d.ts` size | Low | Use `tsup` with declaration bundling. Monitor in CI. |
| LLM context window limitations for full spec | Spec exceeds token budgets for some models | Low | Provide condensed LLM system prompt fragment. |

---

## Phase 1: Core Foundation

**Goal:** Ship the complete kernel — one export (`createCore`), full 9-phase lifecycle, type-safe plugin composition, event bus, and passing test suite.

**Dependencies:** None. This is the foundation.

**Estimated Complexity:** XL

### Deliverables

#### 1.1 Project Setup

- `tsconfig.json`: strict mode, `exactOptionalPropertyTypes`, ES2022 target, ESM output
- `package.json`: `"type": "module"`, `"exports"` map for `"."` entry
- Build: `tsup` for bundling (ESM + CJS dual output, `.d.ts`, source maps)
- Test: `vitest` with coverage reporting
- Lint: `eslint` + `@typescript-eslint` + `prettier`
- CI: GitHub Actions running lint, type-check, test on push/PR
- `.gitignore`, `LICENSE` (MIT)

#### 1.2 Core Types

Define in `src/types.ts`:

- **`PluginSpec<N, C, A, S>`**: all lifecycle fields (`defaultConfig`, `depends`, `createState`, `onCreate`, `onInit`, `api`, `onStart`, `onStop`, `onDestroy`, `hooks`, `plugins`)
- **`PluginInstance<N, C, A, S>`**: `kind: 'plugin'`, `name: N`, phantom `_types`, phantom `_hasDefaults`, `spec`
- **`ComponentSpec<N, C, A, S>`**: `onMount`/`onUnmount` variant
- **`ComponentInstance<N, C, A, S>`**: `kind: 'component'`
- **`ModuleSpec<N, C>`**: grouping container with `plugins`, `components`, `modules`, `onRegister`
- **`ModuleInstance<N, C>`**: `kind: 'module'`
- **`BaseCtx<G, Bus>`**: `global`, `emit`, `signal`, `getPlugin`, `require`, `has`
- **`PluginCtx<G, Bus, C, S>`**: extends BaseCtx with `config` and `state`

#### 1.3 Type-Level Helpers

Implement in `src/type-helpers.ts`:

- `PluginName<P>`, `PluginConfigType<P>`, `PluginApiType<P>`
- `IsEmptyConfig<C>`, `HasDefaults<P>`
- `Prettify<T>`, `OmitNever<T>`
- `BuildPluginConfigs<P>` — required vs optional config enforcement
- `BuildPluginApis<P>` — plugin union → API surface mapping
- `AppConfig` type (opaque, carries phantom plugin union)
- `App` type with lifecycle methods and plugin API surface

#### 1.4 createCore Implementation

The single export of `moku_core`. Returns 6 bound functions:

- **`createConfig`**: binds `Partial<BaseConfig>` + optional `ExtraPlugins[]` → returns `AppConfig`
- **`createApp`**: takes `AppConfig` + `BuildPluginConfigs<AllPlugins>` → runs Phases 0-4 → returns `Promise<App>`
- **`createPlugin`**: name + `PluginSpec` → `PluginInstance` with phantom types
- **`createComponent`**: name + `ComponentSpec` → `ComponentInstance`
- **`createModule`**: name + `ModuleSpec` → `ModuleInstance`
- **`createEventBus`**: standalone pub/sub utility

#### 1.5 CoreDefaults

```typescript
type CoreDefaults<BaseConfig> = {
  config: BaseConfig;
  plugins?: PluginInstance[];
  components?: ComponentInstance[];
  modules?: ModuleInstance[];
  onBoot?: (ctx: { config: Readonly<BaseConfig> }) => void;
  onReady?: (ctx: { config: Readonly<BaseConfig> }) => void | Promise<void>;
  onShutdown?: (ctx: { config: Readonly<BaseConfig> }) => void | Promise<void>;
};
```

#### 1.6 Lifecycle Engine (9 Phases)

- **Phase 0 — Flatten + Validate (sync):** Merge defaults + extras, flatten modules/sub-plugins depth-first, duplicate name check, dependency validation
- **Phase 1 — Resolve Config (sync):** Shallow merge `{ ...defaultConfig, ...consumerConfig }`, freeze
- **Phase 2 — Create (async):** `createState`, register hooks, `onCreate` — sequential, await if Promise
- **Phase 3 — Build APIs (async):** `api()` factory, attach frozen config, register in plugin map
- **Phase 4 — Init (async):** `onInit` with full context — plugins validate deps here
- **Phase 5 — Start:** `onStart` per plugin, emit `app:start`
- **Phase 6 — Running:** Plugins communicate via emit/signal/getPlugin
- **Phase 7 — Stop:** `onStop` in reverse order, emit `app:stop`
- **Phase 8 — Destroy:** `stop()` if needed, `onDestroy` in reverse, clear registries

#### 1.7 Async Support

- `createApp` returns `Promise<App>`
- `createState`, `onCreate`, `api`, `onInit` accept `Promise` returns
- Execution: sequential (Plugin A completes before Plugin B begins)
- Sync plugins work unchanged (`void | Promise<void>`)

#### 1.8 Config Resolution

- Shallow merge only: `{ ...spec.defaultConfig, ...consumerConfig }`
- `defaultConfig` must be full `C`, not `Partial<C>`
- Global: `{ ...frameworkDefaults.config, ...consumerGlobal }`
- All resolved configs `Object.freeze()`'d

#### 1.9 Event Bus

- Typed `emit()` constrained to `BusContract` keys
- Untyped `signal()` accepting any string + any payload
- Both dispatch to same internal hook map
- Handlers execute in registration order, sequentially (awaited)
- Kernel events: `app:start`, `app:stop`, `app:destroy` always fire
- Standalone `createEventBus`: `on`, `once`, `emit`, `off`, `clear`

#### 1.10 Dependency Validation

- `depends?: readonly string[]` on `PluginSpec`
- Phase 0: validate every dep exists AND appears before the dependent
- Actionable error messages with framework name
- Validation only — does NOT reorder plugins

#### 1.11 Immutability & Idempotency

- `Object.freeze()` on app, global config, plugin configs
- `start()` twice = no-op, `stop()` twice = no-op, `destroy()` twice = safe
- Internal status tracking: `'created' | 'started' | 'stopped' | 'destroyed'`

#### 1.12 Error Messages

All errors include framework name and actionable guidance:
- Duplicate plugin name
- Missing dependency
- Misordered dependency
- Missing required plugin (require())
- Missing config not from createConfig
- Required config not provided
- Invalid lifecycle state (start destroyed app, etc.)

#### 1.13 Tests

Comprehensive vitest suite covering:

- **Type tests**: `BuildPluginConfigs`, `BuildPluginApis`, `IsEmptyConfig`, `HasDefaults`, phantom types
- **createCore**: returns all 6 functions
- **createPlugin/createComponent/createModule**: correct instance shapes
- **createConfig**: merges global config, carries phantom types
- **createApp**: async return, config resolution (shallow merge), required vs optional enforcement, lifecycle order, reverse teardown, duplicate detection, dependency validation, sub-plugin flattening, module flattening, frozen configs/app
- **Lifecycle context**: each phase gets correct ctx shape
- **Idempotency**: double-start/stop/destroy
- **Event bus**: emit/signal dispatch order, sequential handlers, kernel events
- **Error messages**: every error path produces expected format
- **createEventBus standalone**: on, once, emit, off, clear

### Success Criteria

- [ ] `pnpm build` produces ESM + CJS bundles with `.d.ts`, zero errors
- [ ] `pnpm test` passes 100%
- [ ] `pnpm type-check` passes zero errors
- [ ] Test coverage >= 95% for `src/core.ts`, `src/event-bus.ts`
- [ ] Full API usable from a consumer script
- [ ] End-to-end test: create core → define framework → create app with 3 plugins → start → use APIs → stop → destroy
- [ ] Bundle size < 5 KB (minified, gzipped)
- [ ] All error messages include framework name
- [ ] `npm pack` produces valid installable tarball

### Definition of Done

Phase 1 is done when `moku_core` can be published as `v0.1.0` and a downstream project can install it, call `createCore`, define plugins, create a config, create an app, start it, use plugin APIs, stop it, and destroy it — all with full type safety.

---

## Phase 2: Testing & Developer Experience

**Goal:** Make every plugin independently testable and every error understandable without reading source code.

**Dependencies:** Phase 1

**Estimated Complexity:** L

### Deliverables

#### 2.1 `moku_core/testing` Subpath Export

- Add `"./testing"` to `package.json` exports map → `./dist/testing.js`
- Implement in `src/testing.ts`, separate from main entry point
- Does NOT increase main bundle size

#### 2.2 `createTestCtx` Utility

```typescript
function createTestCtx<G, C, S>(options?: {
  global?: Partial<G>;
  config?: Partial<C>;
  state?: Partial<S>;
  plugins?: Record<string, any>;
}): {
  ctx: PluginCtx<G, any, C, S>;
  emitted: Array<{ name: string; payload: any }>;
  signaled: Array<{ name: string; payload: any }>;
}
```

- `ctx.emit()` captures to `emitted` array
- `ctx.signal()` captures to `signaled` array
- `ctx.getPlugin/require/has` uses `plugins` mock map
- `ctx.global` and `ctx.config` frozen
- `ctx.state` mutable (like real state)

#### 2.3 Plugin Testing Patterns

Test files demonstrating:
- Testing `api()` factory in isolation with `createTestCtx`
- Testing `createState` factory in isolation
- Testing hook handlers in isolation
- Verifying emit/signal calls with correct payloads
- Mocking dependencies via `plugins` option

#### 2.4 `createAppSync` Convenience

- Utility wrapper (not a core export): `createAppSync<G, P>(config, pluginConfigs): App<G, P>`
- Internally calls `createApp`, checks if Promise resolved synchronously
- Throws clearly if any plugin uses async lifecycle
- Useful for tests and simple scripts

#### 2.5 Source Maps & Declaration Maps

- `tsup` configured with `sourcemap: true`, `dts: true`
- Declaration maps for "Go to Definition" in consuming projects
- Verify IDE navigation from consumer code to moku_core types

#### 2.6 JSDoc Comments

- Every public type: purpose, constraints, examples
- Every `PluginSpec`/`ComponentSpec`/`ModuleSpec` field: when it runs, what context, what to do
- Every `CoreAPI` function: brief example
- `@example` tags on `createPlugin`, `createConfig`, `createApp`
- `@see` cross-references between related types

#### 2.7 Error Catalog

- `ERRORS.md`: every error message pattern, what triggers it, how to fix it
- Organized by lifecycle phase
- Each entry: message template, cause, solution, correct code example
- Minimum 15 error patterns

### Success Criteria

- [ ] `import { createTestCtx } from 'moku_core/testing'` works
- [ ] Plugin `api()` testable in < 10 lines of setup
- [ ] `createAppSync` works for sync-only plugins, throws clearly for async
- [ ] "Go to Definition" navigates to moku_core source types
- [ ] Every public type has JSDoc in IDE hover
- [ ] Error catalog covers every `throw` in codebase

### Definition of Done

Phase 2 is done when a developer can test plugins in isolation without creating an app, understand every error without reading source, and get full IDE support.

---

## Phase 3: Advanced Type Features

**Goal:** Maximize type safety — sub-plugin propagation, typed getPlugin, zero explicit generics for consumers.

**Dependencies:** Phase 1

**Estimated Complexity:** L

### Deliverables

#### 3.1 Sub-Plugin Type Propagation

- Add `_sub` phantom field to `PluginInstance`: carries union of sub-plugin instances
- `createPlugin` infers `_sub` from `plugins` array in spec
- Implement `FlattenPlugins<P>` recursive type (depth-first collection)
- Cap recursion at 4 levels (TypeScript safety)
- Update `BuildPluginApis` and `BuildPluginConfigs` to use `FlattenPlugins<P>`

Result: `app.session.get()` is typed when `AuthPlugin` has `plugins: [SessionPlugin]`.

#### 3.2 Typed getPlugin/require on App

- Constrain `getPlugin` and `require` on `App` type to registered names:

```typescript
getPlugin: <N extends PluginName<FlattenPlugins<P>>>(name: N) => PluginApiByName<P, N> | undefined;
require: <N extends PluginName<FlattenPlugins<P>>>(name: N) => PluginApiByName<P, N>;
```

- Implement `PluginApiByName<P, N>` helper
- Invalid names = compile error
- Correct names = inferred return type
- Inside plugin definitions: stays loose (`<T = any>(name: string)`)

#### 3.3 Improved Generic Inference

- Audit all generics for unnecessary explicit arguments
- Use `const` type parameter modifiers where beneficial
- Use `NoInfer<T>` to prevent incorrect widening
- Target: zero explicit generics for `createConfig` and `createApp` in common cases

#### 3.4 Type-Level Test Suite

- Use vitest `expectTypeOf` or `expect-type`
- 30+ type-level assertions covering:
  - `PluginName`, `PluginConfigType`, `PluginApiType` extract correctly
  - `IsEmptyConfig`, `HasDefaults` resolve correctly
  - `BuildPluginConfigs` marks required vs optional correctly
  - `BuildPluginApis` maps union → API surface
  - `FlattenPlugins` recursively collects sub-plugins
  - `app.getPlugin('router')` returns typed result
  - `app.getPlugin('typo')` is compile error
  - `app.require('router')` returns correct API type

### Success Criteria

- [ ] Sub-plugin APIs visible on `app` without manual listing
- [ ] `app.getPlugin('router')` auto-completes and returns typed result
- [ ] `app.getPlugin('typo')` is a compile error
- [ ] Zero explicit generics needed for `createConfig`/`createApp` in common cases
- [ ] All type-level tests pass
- [ ] No regression in Phase 1 runtime tests

### Definition of Done

Phase 3 is done when the type system catches every plugin name typo, every missing config, and every invalid API call at compile time.

---

## Phase 4: Signals & Extended Core

**Goal:** Add reactive state utility, typed signal registry, and plugin factory — completing the core feature set.

**Dependencies:** Phase 1

**Estimated Complexity:** L

### Deliverables

#### 4.1 `moku_core/signals` Reactive State Utility

- New subpath export: `"./signals"` in `package.json` exports
- Implement in `src/signals.ts`:

```typescript
function createSignal<T>(initial: T): Signal<T>;
function createComputed<T>(fn: () => T, deps: Signal<any>[]): Computed<T>;
function createEffect(fn: () => void | (() => void), deps: Signal<any>[]): () => void;
```

- `Signal<T>`: `get()`, `set(value)`, `update(fn)`, `subscribe(fn)`, `peek()`
- `Computed<T>`: `get()`, `subscribe(fn)` (lazy, caches until deps change)
- `createEffect`: runs side effect on dep change, returns cleanup function
- Zero dependencies on moku_core internals (standalone utility)
- Full vitest coverage

#### 4.2 Typed Signal Registry (3rd Generic on createCore)

- Add optional 3rd generic: `SignalRegistry extends Record<string, any> = {}`
- `signal()` uses TypeScript overloads:
  - Known names (in `SignalRegistry`): payload type-checked
  - Unknown names: falls through to `(name: string, payload?: any)`
- Plugin `hooks` field gains autocomplete for registered signal names
- Default: `SignalRegistry = {}` (all signals untyped, backward compatible)

#### 4.3 createPluginFactory

- Add to `CoreAPI` return:

```typescript
createPluginFactory: <C, A, S>(
  spec: Omit<PluginSpec<string, C, A, S>, 'plugins'>,
) => <N extends string>(name: N) => PluginInstance<N, C, A, S>
```

- Enables multi-instance plugins (two databases, three loggers)
- Each call produces a `PluginInstance` with distinct `N` literal type

#### 4.4 Tests

- Signal reactivity, computed caching, effect cleanup, subscribe/unsubscribe
- Signal registry typing: known names get checked, unknown names pass through
- createPluginFactory: multiple instances with distinct names and types
- Integration: plugin using `createSignal` in `createState` wired to `ctx.signal()`

### Success Criteria

- [ ] `import { createSignal } from 'moku_core/signals'` works
- [ ] `signal('router:navigate', payload)` is type-checked when `SignalRegistry` is declared
- [ ] `createPluginFactory` produces correctly typed distinct instances
- [ ] Signals subpath does NOT increase main bundle size
- [ ] All tests pass

### Definition of Done

Phase 4 is done when the core has reactive state, typed signals, and plugin factories — completing the full feature set described in the spec.

---

## Phase 5: Production Hardening

**Goal:** Ensure `moku_core` is production-grade: fast, small, tree-shakeable, and resilient.

**Dependencies:** Phases 1, 2

**Estimated Complexity:** M

### Deliverables

#### 5.1 Performance Benchmarks

- Benchmark suite (`tinybench` or `vitest bench`):
  - `createApp` with 5, 20, 50, 100 plugins
  - `emit`/`signal` dispatch to 10, 50, 100 handlers
  - `getPlugin` lookup time
  - Full lifecycle: create → start → stop → destroy with 20 plugins
- Baseline numbers documented
- Regression threshold: 10% regression fails CI

#### 5.2 Bundle Size Analysis

- Integrate `size-limit` into CI
- Budgets:
  - `moku_core` main entry < 5 KB minified+gzipped
  - `moku_core/testing` < 2 KB
  - `moku_core/signals` < 3 KB
- Bundle analysis report on each PR

#### 5.3 Tree-Shaking Verification

- Importing `createCore` does NOT pull in `testing` or `signals`
- Test with `rollup`, `esbuild`, and `webpack`
- `"sideEffects": false` in `package.json`

#### 5.4 Error Recovery

- `onError` option in `CoreDefaults`:

```typescript
onError?: (ctx: {
  phase: string;
  plugin: string;
  error: Error;
}) => 'continue' | 'abort';
```

- Default: abort (throw). Frameworks can override.

#### 5.5 Memory Leak Prevention

- `app.destroy()` clears all internal registries
- Hook unsubscription works correctly
- `createEventBus().clear()` releases all handler references
- Tests using `WeakRef` to verify garbage collection

#### 5.6 Idempotency Hardening

- Edge cases: destroy during start, stop during init
- Status transitions validated (can't start a destroyed app)
- All edge cases tested

### Success Criteria

- [ ] Benchmarks run in CI, fail on 10% regression
- [ ] Bundle size within budget
- [ ] Tree-shaking works with rollup, esbuild, webpack
- [ ] `app.destroy()` leaves no dangling references
- [ ] `onError` handler works for graceful degradation
- [ ] Memory leak tests pass

### Definition of Done

Phase 5 is done when `moku_core` can be used in production with confidence: fast, small, tree-shakeable, leak-free, with performance regression caught in CI.

---

## Phase Dependency Graph

```
Phase 1: Core Foundation
   |
   +---> Phase 2: Testing & DX
   |        |
   |        +---> Phase 5: Production Hardening
   |
   +---> Phase 3: Advanced Types
   |
   +---> Phase 4: Signals & Extended Core
```

- **Phases 2, 3, 4** can begin in parallel once Phase 1 is complete
- **Phase 5** requires Phases 1 and 2

---

## Versioning Strategy

| Milestone | Version | What Ships |
|---|---|---|
| Phase 1 complete | `moku_core@0.1.0` | Core kernel, types, lifecycle, event bus |
| Phase 2 complete | `moku_core@0.2.0` | Testing utilities, JSDoc, error catalog |
| Phase 3 complete | `moku_core@0.3.0` | Sub-plugin types, typed getPlugin, inference |
| Phase 4 complete | `moku_core@0.4.0` | Signals, signal registry, plugin factory |
| Phase 5 complete | `moku_core@0.5.0` | Benchmarks, bundle optimization, error recovery |

---

## Quick Reference — What Ships When

| Deliverable | Phase |
|---|---|
| `createCore` (single export) | 1 |
| `createPlugin`, `createComponent`, `createModule` | 1 |
| `createConfig`, `createApp` (async) | 1 |
| `createEventBus` | 1 |
| `depends` field + validation | 1 |
| 9-phase lifecycle engine | 1 |
| `BuildPluginConfigs`, `BuildPluginApis` | 1 |
| Phantom types (`_types`, `_hasDefaults`) | 1 |
| `moku_core/testing` (`createTestCtx`) | 2 |
| `createAppSync` convenience | 2 |
| JSDoc on all public APIs | 2 |
| Error catalog (`ERRORS.md`) | 2 |
| `FlattenPlugins` recursive type | 3 |
| Typed `getPlugin`/`require` on App | 3 |
| `_sub` phantom for sub-plugins | 3 |
| Type-level test suite (30+ assertions) | 3 |
| `moku_core/signals` (createSignal, createComputed, createEffect) | 4 |
| Typed signal registry (3rd generic) | 4 |
| `createPluginFactory` | 4 |
| Performance benchmarks in CI | 5 |
| Bundle size budgets in CI | 5 |
| Tree-shaking verification | 5 |
| `onError` handler in CoreDefaults | 5 |
| Memory leak prevention tests | 5 |
