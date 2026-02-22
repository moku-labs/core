# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**moku_core** is a micro-kernel plugin framework for TypeScript. One export (`createCore`), three layers (core -> framework -> consumer), each constraining the layer above. The entire API fits in an LLM context window by design.

**Status:** Implementation in progress (v3 architecture).

## Architecture: Three Layers

- **Layer 1 (moku_core):** Single export `createCore`. Zero domain knowledge. Pure machinery: lifecycle, plugin registry, event bus, config resolution, type inference.
- **Layer 2 (Framework):** Calls `createCoreConfig<Config, Events>(id, { config })`, gets back `{ createPlugin, createCore }`. Defines default plugins, base config shape, event contract.
- **Layer 3 (Consumer):** Imports from the framework. Single call: `await createApp({ plugins?, ...configOverrides, ...pluginConfigs })`. Never sees `moku_core` directly.

The key constraint: each layer limits the layer above. Consumer code cannot break framework invariants. Framework code cannot break kernel invariants.

## Kernel Responsibilities (6 things, nothing else)

1. Collect and flatten plugins into ordered list
2. Validate names (no duplicates) and dependencies
3. Resolve config (shallow merge, no deep merge)
4. Run 3 lifecycle phases in deterministic order (forward init/start, reverse stop)
5. Dispatch events: `emit` (strictly typed, no escape hatch)
6. Freeze everything when done (`Object.freeze` on app, configs)

## Specification Map

| File | What It Covers |
|---|---|
| `specification/README.md` | Full spec index + open design variants table |
| `specification/01-ARCHITECTURE.md` | Three-layer model, philosophy, design principles |
| `specification/02-CORE-API.md` | All function signatures, createCore/createConfig/createApp |
| `specification/03-PLUGIN-SYSTEM.md` | PluginSpec, PluginInstance, createPlugin, depends |
| `specification/04-FACTORY-CHAIN.md` | 3-step factory chain: why, how, type flow |
| `specification/05-CONFIG-SYSTEM.md` | Config resolution, defaults, BuildPluginConfigs |
| `specification/06-LIFECYCLE.md` | 3 phases (init, start, stop), async model |
| `specification/07-COMMUNICATION.md` | emit, hooks, global events, per-plugin events |
| `specification/08-CONTEXT.md` | ctx object, 3 context tiers, phase-appropriate context |
| `specification/09-TYPE-SYSTEM.md` | Phantom types, BuildPluginApis, App type |
| `specification/11-INVARIANTS.md` | Guarantees, error format, anti-patterns |
| `specification/12-PLUGIN-PATTERNS.md` | Plugin = connection point, file structure |
| `specification/13-KERNEL-PSEUDOCODE.md` | **Reference implementation** with all design decisions and rationale |
| `specification/14-EVENT-REGISTRATION.md` | **Register callback pattern** for typed event declarations |

## Event Registration Standard

All typed events use the **register callback pattern** -- a framework-wide standard:

```typescript
events: (register) => ({
  'auth:login':  register<{ userId: string }>('Triggered after user login'),
  'auth:logout': register<{ userId: string }>('Triggered after user logout'),
})
```

- **No explicit generics on createPlugin.** Event types are inferred from `register<T>()` calls.
- **No emit escape hatch.** Only known event names accepted. Wrong payloads are compile errors.
- **`PluginEvents` defaults to `{}`** (not `Record<string, never>`). `{}` is the identity element for intersection.
- **Dependency events use `UnionToIntersection`** to merge event maps from all deps.

Full specification: `specification/14-EVENT-REGISTRATION.md`

## Critical Design Decisions to Preserve

- **3-step factory chain** (`createCoreConfig` -> `createCore` -> `createApp`): Each step captures types in a closure.
- **No topological sort**: `depends` is validation-only. Plugin order is explicit in the array.
- **Shallow merge only**: `{ ...config, ...consumerConfig }`. No deep merge.
- **Sequential async execution**: Within each phase, plugins run one at a time, awaited. No parallelism.
- **Configs frozen, state mutable**: Configs are `Object.freeze`'d. Plugin state (`S`) is the mutable escape hatch.
- **Strict emit, no escape hatch**: `emit` only accepts known event names with typed payloads.
- **Strict hooks, typed payloads**: `hooks` handlers receive typed payloads (not `unknown`). The `(payload: unknown)` fallback branch is removed. Payloads flow from the merged event map (global + own + dependency events).
- **Instance-only require/getPlugin**: `require(plugin)` and `getPlugin(plugin)` only accept PluginInstance references, not strings. Returns fully typed API. `has(name)` stays string-based (boolean check). No escape hatch.

## Error Message Format

All kernel errors must follow: `[framework-name] <description>.\n  <actionable suggestion>.`

## Implementation Conventions (When Code Exists)

- Runtime target: < 200 lines. The type system does the heavy lifting.
- Bundle target: < 5KB minified + gzipped, zero runtime dependencies.
- Sub-path exports: `moku_core/testing` (createTestCtx), `moku_core/signals` (optional reactive state).
- Plugin file structure convention: `index.ts` (30-line connection point), `api.ts`, `state.ts`, `handlers.ts` for logic.
