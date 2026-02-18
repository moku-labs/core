# Moku Feature Roadmap

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Active
**Scope:** From specification to production-ready micro-framework with ecosystem
**Prerequisite reading:** SPEC_EVOLUTION.md (v2), SPEC_IMPROVEMENTS_IDEAS.md, SPEC_INITIAL.md

---

## Summary Table

| Phase | Name | Goal | Complexity | Dependencies |
|---|---|---|---|---|
| 1 | Core Foundation (moku_core v1.0) | Ship the kernel: one export, full lifecycle, type safety | XL | None |
| 2 | Testing & Developer Experience | Make plugins testable in isolation, make errors actionable | L | Phase 1 |
| 3 | Reference Framework (moku-web v0.1) | Prove the architecture with a real site-builder framework | L | Phase 1 |
| 4 | Advanced Type Features | Sub-plugin propagation, typed getPlugin, improved inference | L | Phase 1 |
| 5 | Ecosystem & Distribution | Reactive signals, CLI scaffolding, second reference framework | XL | Phases 2, 3 |
| 6 | Production Hardening | Benchmarks, bundle optimization, tree-shaking, error recovery | M | Phases 1, 3 |
| 7 | Community & Ecosystem Growth | Guides, tutorials, example gallery, contribution workflow | L | Phases 2, 3, 5 |

---

## Prerequisites

Before any phase begins, the following must be in place:

- **Node.js >= 18.x** installed (LTS, for native `structuredClone`, stable ESM support)
- **TypeScript >= 5.4** (for `const` type parameters, improved inference, `NoInfer` utility)
- **pnpm** as the package manager (monorepo-capable, deterministic installs)
- **Git repository** initialized with `main` as the default branch
- **CI pipeline** configured (GitHub Actions) for lint, type-check, and test on every push
- **Finalized specification:** SPEC_EVOLUTION.md (v2 Final) is the canonical design document; all implementation decisions trace back to it

---

## Non-Goals / Out of Scope

These items are explicitly excluded from all phases of this roadmap:

| Item | Reason |
|---|---|
| Reactive UI framework (virtual DOM, component tree) | Moku is a plugin skeleton, not a rendering engine. Rendering is a plugin concern. |
| Streaming / backpressure engine | Domain-specific. Belongs in plugins. |
| Networking / state sync / conflict resolution | Domain-specific. Belongs in plugins. |
| Dynamic plugin loading (`app.extend()` at runtime) | Fundamental architecture question unresolved. See SPEC_IMPROVEMENTS_IDEAS.md P11. |
| Built-in middleware / pipe system | Plugins implement their own. Kernel stays boring. See spec section 13.5. |
| Deep merge for config resolution | Intentionally excluded. Shallow merge only. See spec section 10.3. |
| Topological sort for plugin ordering | Intentionally excluded. Consumer controls order. `depends` validates, does not reorder. |
| Automatic code generation / scaffolding beyond CLI tool | Out of scope for the core framework. |
| Browser-specific APIs in moku_core | Core is universal. Browser APIs belong in framework-level plugins. |
| Python / Rust / Go ports | TypeScript only for the foreseeable future. |

---

## Risk Factors

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| TypeScript recursion limits on `FlattenPlugins` type | Phase 4 sub-plugin propagation may hit TS depth limits for deeply nested plugins | Medium | Cap recursion at 4 levels. Document the limit. Test with TS nightly. |
| Async `createApp` breaks existing consumer patterns | Consumers must add `await`; top-level usage requires async context | Low | Provide `createAppSync` convenience wrapper in Phase 2. Clear migration note. |
| Bundle size creep from type-level utilities | Phantom types and helpers could increase `.d.ts` size | Low | Use `tsup` with declaration bundling. Monitor `.d.ts` size in CI. |
| Reference framework (moku-web) becomes a maintenance burden | Two packages to maintain instead of one | Medium | Keep moku-web minimal (3 default plugins). Use it as a test bed, not a product. |
| Ecosystem fragmentation if plugin conventions diverge | Third-party plugins may adopt incompatible patterns | Medium | Publish plugin authoring guide early (Phase 5). Provide `create-moku-plugin` template. |
| LLM context window limitations for full spec | Spec exceeds token budgets for some models | Low | Provide condensed LLM system prompt fragment (spec section 23). Keep core API to 6 functions. |
| Community adoption requires critical mass of examples | Developers need working examples before committing | High | Prioritize example gallery in Phase 7. Ship working examples with every phase. |

---

## Phase 1: Core Foundation (moku_core v1.0)

**Goal:** Ship the complete kernel -- one export (`createCore`), full 9-phase lifecycle, type-safe plugin composition, and passing test suite.

**Dependencies:** None. This is the foundation.

**Estimated Complexity:** XL

### Deliverables

#### 1.1 Project Setup

- Initialize `pnpm` workspace with `moku_core` package at root
- `tsconfig.json`: strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, ES2022 target, ESM module output
- `package.json`: `"type": "module"`, `"exports"` map for main entry (`".": "./dist/index.js"`), `"types"` field pointing to `./dist/index.d.ts`
- Build toolchain: `tsup` for bundling (ESM + CJS dual output, `.d.ts` generation, source maps)
- Test framework: `vitest` with coverage reporting (`c8` or `v8` provider), configured for TypeScript
- Linting: `eslint` with `@typescript-eslint`, `prettier` for formatting
- CI: GitHub Actions workflow running `pnpm lint`, `pnpm type-check`, `pnpm test` on push and PR
- `.gitignore`, `.npmignore`, `LICENSE` (MIT)

#### 1.2 Core Types

Define all type-level primitives in `src/types.ts`:

- **`PluginSpec<N extends string, C, A extends Record<string, any>, S>`**: the specification object shape with all lifecycle fields (`defaultConfig`, `depends`, `createState`, `onCreate`, `onInit`, `api`, `onStart`, `onStop`, `onDestroy`, `hooks`, `plugins`)
- **`PluginInstance<N extends string, C, A extends Record<string, any>, S>`**: the runtime plugin object with `kind: 'plugin'`, `name: N`, phantom `_types: { config: C; api: A; state: S }`, phantom `_hasDefaults: boolean`, and `spec: PluginSpec<N, C, A, S>`
- **`ComponentSpec<N, C, A, S>`**: component variant with `onMount`/`onUnmount` instead of `onCreate`/`onInit`/`onStart`/`onStop`/`onDestroy`
- **`ComponentInstance<N, C, A, S>`**: mirrors `PluginInstance` with `kind: 'component'`
- **`ModuleSpec<N, C>`**: grouping container with `plugins`, `components`, `modules`, `onRegister`
- **`ModuleInstance<N, C>`**: with `kind: 'module'`
- **`BaseCtx<G, Bus>`**: context object with `global`, `emit`, `signal`, `getPlugin`, `require`, `has`
- **`PluginCtx<G, Bus, C, S>`**: extends `BaseCtx` with `config` and `state`

#### 1.3 Phantom Types

- `_types` field on `PluginInstance` and `ComponentInstance` carrying `{ config: C; api: A; state: S }` (never read at runtime)
- `_hasDefaults: boolean` phantom set to `true` when `defaultConfig` is present, `false` otherwise
- `_sub` placeholder (typed as `never` for Phase 1; populated in Phase 4 for sub-plugin type propagation)

#### 1.4 Type-Level Helpers

Implement in `src/type-helpers.ts`:

- **`PluginName<P>`**: extract name literal from `PluginInstance` via conditional type inference
- **`PluginConfigType<P>`**: extract `C` from `PluginInstance`
- **`PluginApiType<P>`**: extract `A` from `PluginInstance`
- **`IsEmptyConfig<C>`**: returns `true` for `void`, `{}`, `Record<string, never>`, and `[keyof C] extends [never]`
- **`HasDefaults<P>`**: returns `true` if `P['_hasDefaults']` is `true`
- **`Prettify<T>`**: identity mapped type for flattening intersections in IDE tooltips
- **`OmitNever<T>`**: filters out keys whose values are `never`

#### 1.5 BuildPluginConfigs

Implement the mapped type that produces the `pluginConfigs` parameter type for `createApp`:

- Plugins with `IsEmptyConfig<C> extends true` are excluded entirely (no key in `pluginConfigs`)
- Plugins with `HasDefaults<K> extends true` produce **optional** keys (`?: Partial<PluginConfigType<K>>`)
- Plugins with `HasDefaults<K> extends false` and non-empty `C` produce **required** keys (`: PluginConfigType<K>`)
- The result is an intersection of the required map and the optional map, wrapped in `Prettify<>`

#### 1.6 BuildPluginApis

Implement the mapped type that produces the API surface on the `App` type:

- Maps each plugin in the union `P` to a property keyed by `PluginName<K>`
- Value type is `PluginApiType<K> & { readonly config: PluginConfigType<K> extends void ? {} : Readonly<PluginConfigType<K>> }`

#### 1.7 AppConfig Type

- Opaque branded type: `{ readonly _brand: 'AppConfig'; readonly global: Partial<G>; readonly extras: ExtraPlugins; readonly _allPlugins: DefaultP | ExtraPlugins[number] }`
- Carries the full plugin union as a phantom type for `createApp` to consume
- Runtime fields: `global` (consumer overrides), `extras` (consumer extra plugins array), `_defaults` (reference to `CoreDefaults`)

#### 1.8 App Type

- `readonly config: Readonly<G> & { get: <K extends keyof G>(key: K) => G[K] }`
- `emit: <K extends string & keyof Bus>(hook: K, payload: Bus[K]) => Promise<void>`
- `signal: (name: string, payload?: any) => Promise<void>`
- `getPlugin: <T = any>(name: string) => T | undefined` (loosely typed in Phase 1; tightened in Phase 4)
- `require: <T = any>(name: string) => T` (loosely typed in Phase 1; tightened in Phase 4)
- `has: (name: string) => boolean`
- `start: () => Promise<void>`
- `stop: () => Promise<void>`
- `destroy: () => Promise<void>`
- Intersected with `Prettify<BuildPluginApis<P>>`

#### 1.9 createCore Implementation

The single export of `moku_core`. Implement in `src/core.ts`:

```
function createCore<
  BaseConfig extends Record<string, any>,
  BusContract extends Record<string, any> = {},
>(
  name: string,
  defaults: CoreDefaults<BaseConfig>,
): CoreAPI<BaseConfig, BusContract>
```

Returns an object with 6 bound functions:

- **`createConfig`**: accepts `Partial<BaseConfig>` and optional `ExtraPlugins[]`, returns `AppConfig`
- **`createApp`**: accepts `AppConfig` and `BuildPluginConfigs<AllPlugins>`, runs Phases 0-4, returns `Promise<App>` (async per P1 proposal)
- **`createPlugin`**: accepts name and `PluginSpec`, returns `PluginInstance` with correct phantom types
- **`createComponent`**: accepts name and `ComponentSpec`, returns `ComponentInstance`
- **`createModule`**: accepts name and `ModuleSpec`, returns `ModuleInstance`
- **`createEventBus`**: standalone pub/sub utility, not bound to any app instance
- **`createPluginFactory`**: accepts a spec without a name, returns a function that takes a name and produces a `PluginInstance`

#### 1.10 CoreDefaults

```typescript
type CoreDefaults<BaseConfig extends Record<string, any>> = {
  config: BaseConfig;
  plugins?: PluginInstance[];
  components?: ComponentInstance[];
  modules?: ModuleInstance[];
  onBoot?: (ctx: { config: Readonly<BaseConfig> }) => void;
  onReady?: (ctx: { config: Readonly<BaseConfig> }) => void | Promise<void>;
  onShutdown?: (ctx: { config: Readonly<BaseConfig> }) => void | Promise<void>;
};
```

#### 1.11 Plugin Lifecycle Engine (9 Phases)

Implement the full lifecycle as described in SPEC_EVOLUTION.md section 12:

- **Phase 0 -- Flatten + Validate (sync)**
  - Merge `[...frameworkDefaults.plugins, ...consumerExtras]`
  - Flatten modules: depth-first, call `onRegister` for each, discard module shells
  - Flatten sub-plugins: depth-first, children before parents
  - Duplicate name detection: throw with `[${name}] Duplicate plugin name "${duped}". Each plugin must have a unique name. Found at positions X and Y in the flattened plugin list.`
  - Dependency validation: for each plugin with `depends`, verify every dep exists and appears before the dependent in the list. Throw with actionable error messages.

- **Phase 1 -- Resolve Config (sync)**
  - For each plugin: `resolvedConfig = Object.freeze({ ...spec.defaultConfig, ...consumerConfig })`
  - For global config: `resolvedGlobal = Object.freeze({ ...defaults.config, ...consumerGlobal })`

- **Phase 2 -- Create (async)**
  - For each plugin in order:
    - `createState({ global, config })` -- await if returns Promise, store result
    - Register `hooks` handlers into the hook dispatch map
    - `onCreate({ global, config })` -- await if returns Promise
  - Context at this phase: `{ global, config }` only. No `getPlugin`, `require`, `has`, `emit`, `signal`.

- **Phase 3 -- Build APIs (async)**
  - For each plugin in order:
    - `api(PluginCtx)` -- await if returns Promise, get API object
    - Attach `Object.freeze(resolvedConfig)` as `api.config`
    - Register API in the plugin registry map

- **Phase 4 -- Init (async)**
  - For each plugin in order:
    - `onInit(BaseCtx & { config })` -- await if returns Promise
    - Full context available: `getPlugin`, `require`, `has`, `emit`, `signal`
    - This is where plugins validate dependencies with `require()`/`has()`

- **Phase 5 -- Start (triggered by `app.start()`)**
  - Call `defaults.onReady({ config })` if defined
  - `emit('app:start', { config })`
  - For each plugin in order: `onStart(PluginCtx)` -- async, awaited sequentially

- **Phase 6 -- Running**
  - Plugins communicate via `emit()`/`signal()` and `getPlugin()`/`require()`

- **Phase 7 -- Stop (triggered by `app.stop()`)**
  - For each plugin in **reverse** order: `onStop({ global })` -- async, awaited sequentially
  - `emit('app:stop', { config })`
  - Call `defaults.onShutdown({ config })` if defined

- **Phase 8 -- Destroy (triggered by `app.destroy()`)**
  - Call `stop()` if not already stopped (idempotent)
  - For each plugin in **reverse** order: `onDestroy({ global })` -- async, awaited sequentially
  - `emit('app:destroy', {})`
  - Clear all internal registries (configs, states, apis, hooks)

#### 1.12 Async Support

Per SPEC_IMPROVEMENTS_IDEAS.md P1:

- `createApp` returns `Promise<App>`
- `createState`, `onCreate`, `api`, `onInit` all accept `Promise` return values
- Execution is sequential: Plugin A completes each phase before Plugin B begins
- Sync plugins work unchanged (`void | Promise<void>` covers sync returns)

#### 1.13 Config Resolution

- Shallow merge only: `{ ...spec.defaultConfig, ...consumerProvidedConfig }`
- `defaultConfig` must be full `C`, not `Partial<C>` (enforced by type signature)
- Global config: `{ ...frameworkDefaults.config, ...consumerGlobalConfig }`
- All resolved configs are `Object.freeze()`'d

#### 1.14 Event Bus

Implement in `src/event-bus.ts`:

- Typed `emit()` constrained to `BusContract` keys with payload type checking
- Untyped `signal()` accepting any string name and any payload
- Both dispatch to the same internal hook map
- Handlers execute in plugin registration order, sequentially (each awaited before the next)
- Kernel-emitted events: `app:start`, `app:stop`, `app:destroy` (always fire regardless of BusContract)
- **`createEventBus` standalone utility**: `on(event, handler)`, `once(event, handler)`, `emit(event, payload)`, `off(event, handler?)`, `clear()`

#### 1.15 Dependency Validation

Per SPEC_IMPROVEMENTS_IDEAS.md P4:

- `depends` field on `PluginSpec`: `readonly string[]`
- Phase 0 validates: every dependency exists in the flattened list AND appears before the dependent
- Error messages include framework name, the requesting plugin, the missing/misplaced plugin, and actionable guidance
- `depends` is **validation only** -- does not reorder plugins

#### 1.16 Duplicate Name Detection

- After flattening, check for duplicate names in the plugin list
- Throw with positions: `[${name}] Duplicate plugin name "${duped}". Found at positions ${pos1} and ${pos2} in the flattened plugin list.`

#### 1.17 Immutability

- `Object.freeze()` on the returned `App` object
- `Object.freeze()` on `app.config` (global config)
- `Object.freeze()` on each `app.<plugin>.config` (plugin configs)
- Plugin internal state (`S`) remains mutable by design

#### 1.18 Idempotency

- `app.start()` called twice: second call is a no-op (returns resolved Promise)
- `app.stop()` called twice: second call is a no-op
- `app.destroy()` calls `stop()` first if needed; calling twice is safe
- Track state with internal `status: 'created' | 'started' | 'stopped' | 'destroyed'` flag

#### 1.19 Error Messages

All errors include the framework name (passed to `createCore`) and clear guidance:

- `[${name}] Duplicate plugin name "${n}". Each plugin must have a unique name.`
- `[${name}] Plugin "${p}" depends on "${dep}", but "${dep}" is not registered. Add the ${dep} plugin to your plugin list, before "${p}".`
- `[${name}] Plugin "${p}" depends on "${dep}", but "${dep}" appears after "${p}". Move "${dep}" before "${p}" in your plugin list.`
- `[${name}] Plugin "${requester}" requires "${target}", but "${target}" is not registered.`
- `[${name}] createApp received a config object not created by createConfig. Use createConfig() first.`
- `[${name}] Plugin "${p}" config is required but was not provided in pluginConfigs.`
- `[${name}] Cannot start: app is already destroyed.`
- `[${name}] Cannot stop: app has not been started.`

#### 1.20 Standalone createEventBus

Export as part of `CoreAPI` return value. Also usable independently:

```typescript
const bus = createEventBus();
const off = bus.on('my-event', (payload) => { /* ... */ });
await bus.emit('my-event', { data: 42 });
off(); // unsubscribe
```

#### 1.21 Tests

Comprehensive test suite in `src/__tests__/` using vitest:

- **Types tests**: verify `BuildPluginConfigs`, `BuildPluginApis`, `IsEmptyConfig`, `HasDefaults`, `PluginName`, `PluginConfigType`, `PluginApiType` produce correct types (using `expectTypeOf` from vitest)
- **createCore tests**: returns all 7 functions, they are callable
- **createPlugin tests**: returns correct `PluginInstance` shape, `_hasDefaults` reflects `defaultConfig` presence
- **createComponent tests**: returns correct `ComponentInstance` shape, `onMount`/`onUnmount` mapped to lifecycle
- **createModule tests**: returns correct `ModuleInstance` shape, `onRegister` fires during flattening
- **createConfig tests**: returns `AppConfig` with correct phantom types, merges global config
- **createApp tests**:
  - Async: returns a Promise that resolves to an App
  - Global config resolution: shallow merge with framework defaults
  - Plugin config resolution: shallow merge with `defaultConfig`
  - Plugin with no config: excluded from `pluginConfigs`
  - Plugin with `defaultConfig`: config key is optional
  - Plugin without `defaultConfig`: config key is required (runtime validation)
  - Lifecycle order: create -> build APIs -> init -> (start -> stop -> destroy)
  - Reverse teardown: stop and destroy in reverse plugin order
  - Duplicate name detection: throws with correct error message
  - Dependency validation: missing dep throws, misordered dep throws
  - Sub-plugin flattening: children before parents
  - Module flattening: depth-first, `onRegister` called, modules discarded
  - `app.config` is frozen
  - `app.<plugin>.config` is frozen
  - `app` object is frozen
- **Lifecycle tests**:
  - `createState` receives `{ global, config }` only
  - `onCreate` receives `{ global, config }` only
  - `onInit` receives full `BaseCtx` + `{ config }`
  - `api` receives full `PluginCtx`
  - `onStart` receives full `PluginCtx`
  - `onStop` receives `{ global }` only
  - `onDestroy` receives `{ global }` only
  - Async lifecycle methods are awaited sequentially
- **Idempotency tests**: double-start, double-stop, double-destroy are no-ops
- **Event bus tests**:
  - `emit` dispatches to hook handlers in order
  - `signal` dispatches to hook handlers in order
  - Handlers awaited sequentially (not in parallel)
  - Kernel events (`app:start`, `app:stop`, `app:destroy`) always fire
- **Error message tests**: every error path produces the expected message format
- **createEventBus tests**: `on`, `once`, `emit`, `off`, `clear` behavior

### Success Criteria

- [ ] `pnpm build` produces ESM + CJS bundles with `.d.ts` files, zero errors
- [ ] `pnpm test` passes with 100% of tests green
- [ ] `pnpm type-check` passes with zero type errors
- [ ] Test coverage >= 95% line coverage for `src/core.ts`, `src/event-bus.ts`
- [ ] The full API (`createCore` returning 7 functions) is usable from a consumer script
- [ ] A minimal end-to-end test creates a core, defines a framework, creates an app with 3 plugins, starts, stops, and destroys it successfully
- [ ] Bundle size (minified, gzipped) of `moku_core` is under 5 KB
- [ ] All error messages include the framework name and actionable guidance
- [ ] `npm pack` produces a valid tarball installable in a fresh project

### Definition of Done

Phase 1 is done when `moku_core` can be published to npm (or a private registry) as version `1.0.0-beta.1` and a downstream project can `npm install moku_core`, call `createCore`, define plugins, create a config, create an app, start it, use plugin APIs, stop it, and destroy it -- all with full type safety and zero runtime surprises.

---

## Phase 2: Testing & Developer Experience

**Goal:** Make every plugin independently testable and every error understandable without reading source code.

**Dependencies:** Phase 1 (moku_core v1.0 must be complete)

**Estimated Complexity:** L

### Deliverables

#### 2.1 `moku_core/testing` Subpath Export

- Add `"./testing"` to `package.json` exports map pointing to `./dist/testing.js`
- Implement in `src/testing.ts`, separate from main entry point
- Does NOT increase the main bundle size

#### 2.2 `createTestCtx` Utility

Per SPEC_IMPROVEMENTS_IDEAS.md P7:

```typescript
function createTestCtx<G, C, S>(options?: {
  global?: Partial<G>;
  config?: Partial<C>;
  state?: Partial<S>;
  plugins?: Record<string, any>; // mock plugin APIs
}): {
  ctx: PluginCtx<G, any, C, S>;
  emitted: Array<{ name: string; payload: any }>;
  signaled: Array<{ name: string; payload: any }>;
}
```

- `ctx.emit()` captures calls into `emitted` array instead of dispatching
- `ctx.signal()` captures calls into `signaled` array instead of dispatching
- `ctx.getPlugin(name)` returns from the `plugins` mock map or `undefined`
- `ctx.require(name)` returns from the `plugins` mock map or throws
- `ctx.has(name)` checks the `plugins` mock map
- `ctx.global` is `Object.freeze(options.global ?? {})`
- `ctx.config` is `Object.freeze(options.config ?? {})`
- `ctx.state` is `options.state ?? {}` (mutable, like real state)

#### 2.3 Plugin Testing Patterns

- Test file demonstrating how to test a plugin's `api()` factory in isolation using `createTestCtx`
- Test file demonstrating how to test a plugin's `createState` factory in isolation
- Test file demonstrating how to test hook handlers in isolation
- Test file demonstrating how to verify `emit`/`signal` calls were made with correct payloads
- Test file demonstrating how to mock dependencies with the `plugins` option

#### 2.4 `createAppSync` Convenience Wrapper

- Provided as a utility function (not a core export): `createAppSync<G, P>(config, pluginConfigs): App<G, P>`
- Internally calls `createApp` and checks if the returned Promise resolved synchronously
- If any plugin uses async in `createState`, `onCreate`, `api`, or `onInit`, throws: `[${name}] createAppSync failed: plugin "${p}" uses async lifecycle. Use "await createApp()" instead.`
- Useful for tests and simple scripts where no plugins need async initialization

#### 2.5 Source Maps and Declaration Maps

- `tsup` configured with `sourcemap: true` and `dts: true`
- Declaration maps (`declarationMap: true` in tsconfig) for "Go to Definition" in consuming projects
- Verify that IDEs can jump from `app.router.navigate()` to the plugin's `api` definition

#### 2.6 JSDoc Comments

- Every public type exported from `moku_core` has JSDoc comments explaining purpose, constraints, and examples
- Every field on `PluginSpec`, `ComponentSpec`, `ModuleSpec` has JSDoc explaining when it runs, what context it receives, and what it should do
- Every function in `CoreAPI` has JSDoc with a brief example
- JSDoc `@example` tags on `createPlugin`, `createConfig`, `createApp`
- JSDoc `@see` cross-references between related types

#### 2.7 Error Catalog

- `ERRORS.md` document listing every error code/message pattern, what triggers it, and how to fix it
- Organized by lifecycle phase (Phase 0 errors, Phase 1 errors, Phase 2 errors, etc.)
- Each entry includes: error message template, cause, solution, example of correct code
- Minimum 15 error patterns documented (covering all the error messages from Phase 1 deliverable 1.19)

### Success Criteria

- [ ] `import { createTestCtx } from 'moku_core/testing'` works in a consuming project
- [ ] A plugin's `api()` factory can be tested in < 10 lines of test setup using `createTestCtx`
- [ ] `createAppSync` works for sync-only plugin sets and throws clearly for async plugins
- [ ] "Go to Definition" in VS Code navigates from consumer code to `moku_core` source types
- [ ] Every public type has JSDoc visible in IDE hover tooltips
- [ ] Error catalog covers every `throw` statement in the codebase

### Definition of Done

Phase 2 is done when a developer can write a plugin, test it in isolation without creating an app, understand every error without reading moku_core source, and get full IDE support including hover docs and source navigation.

---

## Phase 3: Reference Framework (moku-web v0.1)

**Goal:** Prove the three-layer architecture works end-to-end by building a real site-builder framework on top of moku_core.

**Dependencies:** Phase 1 (moku_core v1.0)

**Estimated Complexity:** L

### Deliverables

#### 3.1 Package Setup

- New package `moku-web` in the monorepo (or separate repo with `moku_core` as dependency)
- `package.json` with `moku_core` as a peer dependency
- `tsconfig.json` extending a shared base
- Export map: `"."` for main, `"./plugins"` for optional plugin re-exports

#### 3.2 BaseConfig

```typescript
type BaseConfig = {
  siteName: string;
  description?: string;
  mode: 'development' | 'production';
  locale?: string;
};
```

Framework defaults: `{ siteName: 'Untitled', mode: 'development' }`

#### 3.3 BusContract

```typescript
type BusContract = {
  'app:boot': { config: BaseConfig };
  'app:ready': { config: BaseConfig };
  'app:shutdown': { config: BaseConfig };
  'page:render': { path: string; html: string };
  'page:error': { path: string; error: Error };
};
```

#### 3.4 Default Plugins

Three plugins that define what a site-builder IS:

- **RouterPlugin** (`'router'`)
  - Config: `{ default: string; pages: Record<string, { render: () => string }> }`
  - API: `navigate(path: string): void`, `current(): string`, `paths(): string[]`
  - State: `{ currentPath: string; history: string[] }`
  - Hooks: listens to `page:error` for fallback routing
  - No `defaultConfig` (config is required)

- **RendererPlugin** (`'renderer'`)
  - Config: `{ container?: string; pretty?: boolean }`
  - API: `render(path: string): string`, `renderAll(): Record<string, string>`
  - Depends on: `['router']`
  - `defaultConfig`: `{ container: '#app', pretty: false }` (config is optional)

- **SEOPlugin** (`'seo'`)
  - Config: `{ titleTemplate?: string; defaultDescription?: string }`
  - API: `getMeta(path: string): { title: string; description: string }`, `generateSitemap(): string`
  - Depends on: `['router']`
  - `defaultConfig`: `{ titleTemplate: '%s', defaultDescription: '' }` (config is optional)

#### 3.5 Optional Plugins

Four plugins consumers can opt into:

- **AnalyticsPlugin** (`'analytics'`)
  - Config: `{ trackingId: string; sampleRate?: number }`
  - API: `track(event: string, data?: Record<string, any>): void`, `pageView(path: string): void`
  - No `defaultConfig` (config is required)

- **BlogPlugin** (`'blog'`)
  - Config: `{ postsDir: string; postsPerPage?: number }`
  - API: `listPosts(): string[]`, `getPost(slug: string): { title: string; content: string } | undefined`
  - Depends on: `['router']`
  - No `defaultConfig` (config is required)

- **I18nPlugin** (`'i18n'`)
  - Config: `{ defaultLocale: string; locales: string[]; translations: Record<string, Record<string, string>> }`
  - API: `t(key: string): string`, `locale(): string`, `setLocale(locale: string): void`
  - `defaultConfig`: `{ defaultLocale: 'en', locales: ['en'], translations: { en: {} } }`

- **AuthPlugin** (`'auth'`)
  - Config: `{ sessionKey?: string; loginPath?: string }`
  - API: `login(user: string): void`, `logout(): void`, `isAuthenticated(): boolean`, `currentUser(): string | null`
  - `defaultConfig`: `{ sessionKey: 'moku-auth', loginPath: '/login' }`

#### 3.6 Framework index.ts

The complete Layer 2 entry point calling `createCore` and re-exporting:

- `createConfig`, `createApp`, `createPlugin`, `createComponent`, `createModule` from `createCore` return
- All optional plugins as named exports
- `BaseConfig` and `BusContract` types

#### 3.7 Example Consumer App

A working `examples/my-blog/` directory:

- `main.ts`: demonstrates the two-step pattern (`createConfig` -> `createApp`)
- Uses `BlogPlugin` and a custom `ContactFormPlugin` as extras
- Provides plugin configs for `router`, `blog`, and `contactForm`
- Calls `app.start()`, exercises plugin APIs, calls `app.destroy()`
- Demonstrates typed access: `app.router.navigate()`, `app.blog.listPosts()`, `app.contactForm.submit()`

#### 3.8 Signal Registry Usage Example

- Define a `SignalRegistry` type alongside `BusContract` (demonstrates the pattern, even if typed signals are Phase 4)
- Document known plugin signals: `router:navigate`, `router:notFound`, `auth:login`, `auth:logout`
- Include the registry in the example as documentation for future typed signal support

#### 3.9 Framework-Level Tests

- Test that `createCore` call succeeds and returns all API functions
- Test that default plugins (Router, Renderer, SEO) are always present
- Test that consumer cannot remove default plugins
- Test that optional plugins work when added via `createConfig`
- Test plugin dependency ordering (Renderer depends on Router)
- Test global config resolution with consumer overrides
- Test plugin config resolution (required vs optional)
- Integration test: full app lifecycle (create, start, use APIs, stop, destroy)

### Success Criteria

- [ ] A consumer can `import { createConfig, createApp } from 'moku-web'` and build a working site app
- [ ] TypeScript enforces required plugin configs (router config required, renderer config optional)
- [ ] `app.router.navigate('about')` is fully typed
- [ ] `app.blog.listPosts()` is fully typed when BlogPlugin is added
- [ ] The example consumer app runs without errors
- [ ] All framework-level tests pass
- [ ] The framework entry point (index.ts) is under 50 lines (connection point, not logic)

### Definition of Done

Phase 3 is done when a developer can install `moku-web`, follow the two-step pattern, build a site with default and optional plugins, and have full type safety from framework config to plugin API calls. The reference framework serves as a proof-of-concept and a template for other framework authors.

---

## Phase 4: Advanced Type Features

**Goal:** Maximize type safety by propagating sub-plugin types, constraining `getPlugin`/`require` to registered names, and reducing the need for explicit generic arguments.

**Dependencies:** Phase 1 (moku_core v1.0)

**Estimated Complexity:** L

### Deliverables

#### 4.1 Sub-Plugin Type Propagation

Per SPEC_IMPROVEMENTS_IDEAS.md P5:

- Add `_sub` phantom field to `PluginInstance`: carries a union of sub-plugin instances
- `createPlugin` infers `_sub` from the `plugins` array in the spec
- Implement `FlattenPlugins<P>` recursive type: walks `_sub` and collects all nested plugin instances
- Cap recursion at 4 levels (pragmatic TypeScript recursion limit guard)
- Update `BuildPluginApis` to use `FlattenPlugins<P>` instead of plain `P`
- Update `BuildPluginConfigs` to use `FlattenPlugins<P>` for config requirement inference

After this change: if `AuthPlugin` has `plugins: [SessionPlugin, TokenPlugin]`, then `app.session.get()` and `app.token.verify()` are typed without the consumer explicitly listing sub-plugins.

#### 4.2 Typed getPlugin/require on App

Per SPEC_IMPROVEMENTS_IDEAS.md P2:

- On the `App` type, constrain `getPlugin` and `require`:

```typescript
getPlugin: <N extends PluginName<FlattenPlugins<P>>>(
  name: N,
) => PluginApiByName<FlattenPlugins<P>, N> | undefined;

require: <N extends PluginName<FlattenPlugins<P>>>(
  name: N,
) => PluginApiByName<FlattenPlugins<P>, N>;
```

- Implement `PluginApiByName<P, N>` helper type
- Invalid plugin names produce compile errors
- Correct plugin names infer the return type automatically
- **Inside plugin definitions**: `getPlugin` and `require` remain loosely typed (`<T = any>(name: string)`) because the full plugin union is not known at definition time

#### 4.3 Improved Generic Inference

- Audit all generic functions for cases where TypeScript requires explicit generic arguments
- Use `const` type parameter modifiers where beneficial (e.g., `const ExtraPlugins extends readonly PluginInstance[]`)
- Use `NoInfer<T>` in positions where TypeScript incorrectly widens types
- Minimize the number of generic parameters consumers must provide (target: zero explicit generics for `createConfig` and `createApp`)
- Add `satisfies` patterns in documentation for cases where explicit typing helps

#### 4.4 Type-Level Test Suite

- Install `expect-type` or use vitest's `expectTypeOf`
- Write type-level tests that verify:
  - `PluginName<RouterPlugin>` resolves to `'router'`
  - `PluginConfigType<RouterPlugin>` resolves to `RouterConfig`
  - `PluginApiType<RouterPlugin>` resolves to `RouterApi`
  - `IsEmptyConfig<void>` is `true`; `IsEmptyConfig<{ x: string }>` is `false`
  - `HasDefaults<PluginWithDefaults>` is `true`; `HasDefaults<PluginWithoutDefaults>` is `false`
  - `BuildPluginConfigs` correctly marks plugins as required vs optional
  - `BuildPluginApis` maps the union to the correct API surface
  - `FlattenPlugins` recursively collects sub-plugins
  - `PluginApiByName` extracts correct API types
  - `app.getPlugin('router')` returns `RouterApi | undefined` (not `any`)
  - `app.getPlugin('nonexistent')` is a compile error
  - `app.require('router')` returns `RouterApi` (not `any`)
- At least 30 type-level test assertions

### Success Criteria

- [ ] Sub-plugins' APIs are visible on `app` without manual listing
- [ ] `app.getPlugin('router')` auto-completes and returns typed result
- [ ] `app.getPlugin('typo')` is a compile error
- [ ] `app.require('router')` returns the correct API type
- [ ] Consumers need zero explicit generic arguments for `createConfig` and `createApp` in common cases
- [ ] All type-level tests pass
- [ ] No regression in existing Phase 1 runtime tests

### Definition of Done

Phase 4 is done when the type system catches every plugin name typo, every missing config, and every invalid API call at compile time. Consumers experience "if it compiles, it works" for the structural layer of their application.

---

## Phase 5: Ecosystem & Distribution

**Goal:** Provide reactive state utilities, a scaffolding CLI, and a second reference framework to prove cross-domain universality.

**Dependencies:** Phases 2, 3 (testing infrastructure and reference framework)

**Estimated Complexity:** XL

### Deliverables

#### 5.1 `moku_core/signals` Reactive State Utility

Per SPEC_IMPROVEMENTS_IDEAS.md P8:

- New subpath export: `"./signals"` in `package.json` exports
- Implement in `src/signals.ts`:

```typescript
function createSignal<T>(initial: T): Signal<T>;
function createComputed<T>(fn: () => T, deps: Signal<any>[]): Computed<T>;
function createEffect(fn: () => void | (() => void), deps: Signal<any>[]): () => void;
```

- `Signal<T>`: `get()`, `set(value)`, `update(fn)`, `subscribe(fn)`, `peek()`
- `Computed<T>`: `get()`, `subscribe(fn)` (lazy evaluation, caches until deps change)
- `createEffect`: runs side effect when deps change, returns cleanup function
- Integration example: plugin using `createSignal` in `createState`, wiring `subscribe` to `ctx.signal()`
- Fully tested (vitest): signal reactivity, computed caching, effect cleanup, subscribe/unsubscribe
- Zero dependencies on moku_core internals (standalone utility)

#### 5.2 Typed Signal Registry (3rd Generic on createCore)

Per SPEC_IMPROVEMENTS_IDEAS.md P3:

- Add optional 3rd generic to `createCore`: `SignalRegistry extends Record<string, any> = {}`
- `signal()` uses TypeScript overloads:
  - Known names (in `SignalRegistry`): payload type-checked
  - Unknown names: falls through to `(name: string, payload?: any)`
- Framework authors declare `SignalRegistry` alongside `BusContract`
- Plugin `hooks` field gains autocomplete for registered signal names
- Default: `SignalRegistry = {}` (all signals untyped, backward compatible)

#### 5.3 Framework Composition (`core.extend()`)

Per SPEC_IMPROVEMENTS_IDEAS.md P9:

- Add `extend` method to `CoreAPI` return type:

```typescript
extend: <
  ExtraConfig extends Record<string, any>,
  ExtraBus extends Record<string, any> = {},
  ExtraSignals extends Record<string, any> = {},
>(
  additions: CoreDefaults<ExtraConfig>,
) => CoreAPI<G & ExtraConfig, Bus & ExtraBus, Signals & ExtraSignals>;
```

- Config types merge via intersection
- BusContract types merge via intersection
- Default plugins are concatenated: `[...parent.plugins, ...child.plugins]`
- Consumer sees the merged framework transparently
- Test: `moku-blog` extends `moku-web`, consumer uses both base and extension plugins

#### 5.4 CLI Scaffolding Tool (`create-moku-app`)

- New package `create-moku-app` (executable via `npx create-moku-app`)
- Interactive prompts:
  - Project name
  - Template: "blank core" | "web framework" | "CLI framework" | "custom"
  - Package manager: pnpm | npm | yarn
  - Test framework: vitest (default)
- Templates generate:
  - `package.json` with correct dependencies
  - `tsconfig.json` with strict settings
  - `src/index.ts` with `createCore` call (for framework template) or `createConfig`/`createApp` (for consumer template)
  - `src/plugins/` directory with one example plugin
  - `src/__tests__/` directory with one example test
  - `README.md` with getting started instructions
- Zero runtime dependencies (uses Node.js built-in `readline` for prompts)

#### 5.5 Plugin Marketplace / Registry Concept

- Define the `moku-plugin` keyword convention for npm packages
- Specify the expected export shape for community plugins:
  - Default export: `PluginInstance`
  - Named export for types: `PluginConfig`, `PluginApi`
  - Optional: `README.md` with standard sections (Install, Config, API, Hooks)
- Create a `create-moku-plugin` template in the CLI tool
- Document the publishing workflow

#### 5.6 Second Reference Framework (moku-cli v0.1)

Prove cross-domain universality by building a CLI toolkit framework:

- **BaseConfig**: `{ name: string; version: string; description?: string }`
- **BusContract**: `{ 'cli:beforeRun': { command: string; args: string[] }; 'cli:afterRun': { command: string; exitCode: number }; 'output:write': { text: string; level: 'info' | 'warn' | 'error' } }`
- **Default plugins**:
  - `CommandPlugin` (`'command'`): command registration and dispatch
  - `OutputPlugin` (`'output'`): terminal formatting, colors, spinners
- **Optional plugins**:
  - `EnvPlugin` (`'env'`): environment variable loading
  - `ConfigFilePlugin` (`'configFile'`): `.json`/`.toml` config file loading
- **Example consumer**: a simple deploy CLI that uses `CommandPlugin` and `EnvPlugin`
- Demonstrates that the same `createCore` -> `createConfig` -> `createApp` pattern works for CLI tools

#### 5.7 Documentation Site

- Static site (built with moku-web or a simple static site generator)
- Sections: Getting Started, Core Concepts, API Reference, Plugin Authoring, Framework Authoring, Examples
- Generated from JSDoc comments + markdown files
- Hosted on GitHub Pages or Vercel
- Search functionality

### Success Criteria

- [ ] `import { createSignal } from 'moku_core/signals'` works and provides reactive state
- [ ] `signal('router:navigate', payload)` is type-checked when `SignalRegistry` is declared
- [ ] `core.extend()` produces a valid merged framework
- [ ] `npx create-moku-app` creates a runnable project
- [ ] `moku-cli` reference framework builds and runs a working CLI app
- [ ] Documentation site is deployed and covers all core concepts
- [ ] Two reference frameworks (web, CLI) prove the same pattern works across domains

### Definition of Done

Phase 5 is done when the ecosystem has reactive state utilities, typed signals, framework composition, a scaffolding CLI, two reference frameworks proving cross-domain universality, and a documentation site. A developer can go from "I heard about Moku" to "I have a running project" in under 5 minutes.

---

## Phase 6: Production Hardening

**Goal:** Ensure moku_core is production-grade: fast, small, tree-shakeable, and resilient.

**Dependencies:** Phases 1, 3 (core and at least one reference framework)

**Estimated Complexity:** M

### Deliverables

#### 6.1 Performance Benchmarks

- Benchmark suite using `tinybench` or `vitest bench`:
  - `createApp` with 5, 20, 50, 100 plugins (measure wall-clock time)
  - `emit` dispatch to 10, 50, 100 handlers (measure throughput)
  - `signal` dispatch to 10, 50, 100 handlers
  - `getPlugin` lookup time (map access)
  - Full lifecycle: create -> start -> stop -> destroy with 20 plugins
- Baseline numbers documented, regression threshold set (10% regression fails CI)
- Compare against raw function calls to quantify plugin indirection overhead

#### 6.2 Bundle Size Analysis

- Integrate `size-limit` into CI
- Set budget: moku_core main entry < 5 KB minified+gzipped
- Set budget: moku_core/testing < 2 KB minified+gzipped
- Set budget: moku_core/signals < 3 KB minified+gzipped
- Generate bundle analysis report on each PR
- Document what each part of the bundle contains

#### 6.3 Tree-Shaking Verification

- Verify that importing only `createCore` does not pull in `testing` or `signals` code
- Verify that unused plugin lifecycle methods are eliminated by bundlers
- Test with `rollup`, `esbuild`, and `webpack` to ensure compatibility
- ESM-only entry points with `"sideEffects": false` in `package.json`
- Document the expected tree-shaking behavior

#### 6.4 Error Recovery Patterns

- Document patterns for graceful degradation:
  - Plugin `onStart` fails: how to catch and skip optional plugins
  - Plugin `onStop` fails: how to ensure other plugins still tear down
  - Hook handler throws: how to prevent one handler from breaking the chain
- Implement `onError` option in `CoreDefaults` for framework-level error handling:

```typescript
onError?: (ctx: {
  phase: string;
  plugin: string;
  error: Error;
}) => 'continue' | 'abort';
```

- Default behavior: abort (throw). Frameworks can override to log and continue.

#### 6.5 Hot-Reload Integration Patterns

- Document how to rebuild the app on file change in development:
  - Destroy old app, create new app (the "rebuild" pattern)
  - Plugins with `onDestroy` clean up resources
  - Async `createApp` makes rebuilds cheap
- Provide a `createDevServer` utility example (not a core export) that watches for file changes and rebuilds

#### 6.6 Memory Leak Prevention

- Verify that `app.destroy()` clears all internal registries (no dangling references)
- Verify that hook unsubscription works correctly (no leaked handlers)
- Verify that `createEventBus().clear()` releases all handler references
- Add tests using `WeakRef` to verify garbage collection of destroyed apps
- Document the memory lifecycle of app objects

#### 6.7 Production Deployment Patterns

- Document patterns for:
  - Node.js server deployment (long-running process with graceful shutdown)
  - Serverless deployment (create app per request vs. warm start)
  - Edge runtime deployment (minimal bundle, no Node.js APIs)
  - Static site generation (create app, render all pages, destroy)
- Include `SIGINT`/`SIGTERM` handler example for graceful shutdown

### Success Criteria

- [ ] Benchmark suite runs in CI and fails on 10% regression
- [ ] Bundle size stays within budget (< 5 KB main, < 2 KB testing, < 3 KB signals)
- [ ] Tree-shaking works with rollup, esbuild, and webpack
- [ ] `app.destroy()` leaves no dangling references
- [ ] `onError` handler in CoreDefaults works for graceful degradation
- [ ] Memory leak tests pass
- [ ] Production deployment patterns are documented with working examples

### Definition of Done

Phase 6 is done when moku_core can be deployed to production with confidence: it is fast, small, tree-shakeable, leak-free, and has documented patterns for every deployment scenario. Performance regression is caught automatically in CI.

---

## Phase 7: Community & Ecosystem Growth

**Goal:** Enable the community to build, share, and learn from Moku plugins and frameworks.

**Dependencies:** Phases 2, 3, 5 (testing, reference framework, documentation site)

**Estimated Complexity:** L

### Deliverables

#### 7.1 Plugin Authoring Guide

Comprehensive guide covering:

- Plugin file structure (index.ts as connection point, domain logic in separate files)
- Config design: when to require config, when to provide defaults, how to validate
- State design: what goes in state vs. config, mutable state patterns
- API design: closures over state, never leak state references, method naming conventions
- Hook design: when to use `emit` vs `signal`, naming conventions (`pluginName:eventName`)
- Dependency management: `depends` field, `require` vs `has`, optional dependencies
- Testing: using `createTestCtx`, unit testing domain files, integration testing with `createApp`
- Publishing: npm conventions, keyword `moku-plugin`, export shape

#### 7.2 Framework Authoring Guide

Comprehensive guide covering:

- Choosing BaseConfig: what belongs in global config vs plugin config
- Designing BusContract: lifecycle events, domain events, naming conventions
- Choosing default plugins: what defines the framework's identity
- Designing optional plugins: what consumers can opt into
- Signal registry: when to type signals, balancing strictness with flexibility
- Framework composition: when to use `core.extend()` vs. starting fresh
- Testing the framework: testing defaults, testing consumer patterns
- Publishing: npm conventions, peer dependency on `moku_core`

#### 7.3 Migration Guides

Guides for migrating from existing patterns:

- **From Express/Koa**: mapping middleware to plugins, mapping routes to RouterPlugin config
- **From Next.js**: mapping pages to plugin config, mapping API routes to plugins
- **From class-based plugin systems**: mapping classes to factory functions, mapping `this` to closures
- **From dependency injection (NestJS/Angular)**: mapping services to plugins, mapping DI tokens to `getPlugin`
- Each guide includes a side-by-side comparison and a working migration example

#### 7.4 Tutorial Series

Step-by-step tutorials:

1. "Your First Moku App" -- zero to running app in 10 minutes
2. "Writing a Plugin" -- config, state, API, hooks, testing
3. "Building a Framework" -- createCore, BaseConfig, BusContract, default plugins
4. "Plugin Communication" -- emit, signal, getPlugin, hooks patterns
5. "Advanced Types" -- understanding BuildPluginConfigs, phantom types, generic inference
6. "Production Deployment" -- building, bundling, deploying a Moku app

#### 7.5 Example Gallery

Working, tested examples covering every domain from SPEC_INITIAL.md section 14:

- **Web app**: blog with router, renderer, SEO, analytics, blog, auth plugins
- **CLI tool**: deploy tool with commands, env loading, output formatting
- **Game**: simple game loop with ECS, input, rendering, physics plugins
- **Bot / AI agent**: conversational agent with LLM client, memory, tools plugins
- **Build tool**: TypeScript build pipeline with compiler, bundler, minifier plugins
- **IoT controller**: sensor reading and GPIO control with polling, network plugins
- **Desktop app**: file manager with window, menu, filesystem plugins

Each example includes:
- `README.md` with description and how to run
- Framework definition (Layer 2)
- Consumer app (Layer 3)
- At least 2 custom plugins
- Tests

#### 7.6 Contributing Guide

- `CONTRIBUTING.md` in the repository root
- Development setup instructions (clone, install, build, test)
- Code style and conventions
- How to submit a plugin to the ecosystem
- How to propose a core change (RFC process)
- How to report bugs
- Code of Conduct
- PR template with checklist

### Success Criteria

- [ ] Plugin authoring guide enables a developer to write and publish a plugin without reading moku_core source
- [ ] Framework authoring guide enables a developer to create a new domain framework
- [ ] At least 3 migration guides are complete with working examples
- [ ] All 6 tutorials are written and tested
- [ ] At least 5 example gallery entries are complete and tested
- [ ] Contributing guide is in the repository

### Definition of Done

Phase 7 is done when a developer who has never seen Moku can go from "what is this?" to "I published a plugin" following only the documentation. The example gallery demonstrates that the "learn once, build anything" promise is real. The contributing guide enables the community to grow the ecosystem independently.

---

## Appendix: Phase Dependency Graph

```
Phase 1: Core Foundation
   |
   +---> Phase 2: Testing & DX
   |        |
   +---> Phase 3: Reference Framework (moku-web)
   |        |
   +---> Phase 4: Advanced Types
   |
   +-----+--+---> Phase 5: Ecosystem & Distribution
   |     |  |
   |     |  +---> Phase 6: Production Hardening
   |     |
   +-----+-------> Phase 7: Community & Growth
```

- **Phases 2, 3, 4** can begin in parallel once Phase 1 is complete
- **Phase 5** requires Phases 2 and 3
- **Phase 6** requires Phases 1 and 3
- **Phase 7** requires Phases 2, 3, and 5

---

## Appendix: Versioning Strategy

| Milestone | Version | What Ships |
|---|---|---|
| Phase 1 complete | `moku_core@1.0.0-beta.1` | Core kernel, all types, lifecycle engine, event bus |
| Phase 2 complete | `moku_core@1.0.0-beta.2` | Testing utilities, JSDoc, error catalog |
| Phase 3 complete | `moku-web@0.1.0` | Reference framework, 7 plugins, example app |
| Phase 4 complete | `moku_core@1.0.0-rc.1` | Advanced types, sub-plugin propagation, typed getPlugin |
| Phase 5 complete | `moku_core@1.0.0`, `moku-web@0.2.0`, `moku-cli@0.1.0`, `create-moku-app@1.0.0` | Full ecosystem |
| Phase 6 complete | `moku_core@1.1.0` | Performance, bundle optimization, error recovery |
| Phase 7 complete | (documentation, guides, examples) | Community enablement |

---

## Appendix: Quick Reference -- What Ships When

| Deliverable | Phase |
|---|---|
| `createCore` (single export) | 1 |
| `createPlugin`, `createComponent`, `createModule` | 1 |
| `createConfig`, `createApp` | 1 |
| `createEventBus` | 1 |
| `createPluginFactory` | 1 |
| Async `createApp` (`Promise<App>`) | 1 |
| `depends` field + validation | 1 |
| 9-phase lifecycle engine | 1 |
| `BuildPluginConfigs`, `BuildPluginApis` | 1 |
| Phantom types (`_types`, `_hasDefaults`) | 1 |
| `moku_core/testing` (`createTestCtx`) | 2 |
| `createAppSync` convenience | 2 |
| JSDoc on all public APIs | 2 |
| Error catalog | 2 |
| `moku-web` reference framework | 3 |
| RouterPlugin, RendererPlugin, SEOPlugin | 3 |
| AnalyticsPlugin, BlogPlugin, I18nPlugin, AuthPlugin | 3 |
| Example consumer app | 3 |
| `FlattenPlugins` recursive type | 4 |
| Typed `getPlugin`/`require` on App | 4 |
| `_sub` phantom for sub-plugins | 4 |
| Type-level test suite | 4 |
| `moku_core/signals` (createSignal, createComputed, createEffect) | 5 |
| Typed signal registry (3rd generic) | 5 |
| `core.extend()` framework composition | 5 |
| `create-moku-app` CLI | 5 |
| `moku-cli` reference framework | 5 |
| Documentation site | 5 |
| Performance benchmarks | 6 |
| Bundle size budgets in CI | 6 |
| Tree-shaking verification | 6 |
| `onError` handler in CoreDefaults | 6 |
| Memory leak prevention tests | 6 |
| Plugin authoring guide | 7 |
| Framework authoring guide | 7 |
| Migration guides | 7 |
| Tutorial series | 7 |
| Example gallery (7 domains) | 7 |
| Contributing guide | 7 |
