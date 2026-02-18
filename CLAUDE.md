# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**moku_core** is a micro-kernel plugin framework for TypeScript. One export (`createCore`), three layers (core -> framework -> consumer), each constraining the layer above. The entire API fits in an LLM context window by design.

**Status:** Pre-implementation. Specification complete, no source code or build tooling yet.

## Architecture: Three Layers

- **Layer 1 (moku_core):** Single export `createCore`. Zero domain knowledge. Pure machinery: lifecycle, plugin registry, event bus, config resolution, type inference.
- **Layer 2 (Framework):** Calls `createCore<BaseConfig, BusContract, SignalRegistry>()`, gets back `{ createConfig, createApp, createPlugin, createComponent, createModule, createEventBus, createPluginFactory }`. Defines default plugins, base config shape, bus contract.
- **Layer 3 (Consumer):** Imports from the framework. Two steps: `createConfig(globalOverrides, extraPlugins)` then `await createApp(config, pluginConfigs)`. Never sees `moku_core` directly.

The key constraint: each layer limits the layer above. Consumer code cannot break framework invariants. Framework code cannot break kernel invariants.

## Kernel Responsibilities (6 things, nothing else)

1. Collect and flatten plugins into ordered list
2. Validate names (no duplicates) and dependencies
3. Resolve config (shallow merge, no deep merge)
4. Run 9 lifecycle phases in deterministic order (forward init, reverse teardown)
5. Dispatch events: `emit` (typed bus) + `signal` (optionally typed)
6. Freeze everything when done (`Object.freeze` on app, configs)

## Specification Map

| File | What It Covers |
|---|---|
| `specification/README.md` | Full spec index + open design variants table |
| `specification/01-ARCHITECTURE.md` | Three-layer model, philosophy, design principles |
| `specification/02-CORE-API.md` | All function signatures, createCore/createConfig/createApp |
| `specification/03-PLUGIN-SYSTEM.md` | PluginSpec, PluginInstance, createPlugin, depends |
| `specification/04-COMPONENT-MODULE.md` | ComponentSpec, ModuleSpec, flattening algorithm |
| `specification/05-CONFIG-SYSTEM.md` | Config resolution, defaults, BuildPluginConfigs |
| `specification/06-LIFECYCLE.md` | All 9 phases, ordering, sync/async variants |
| `specification/07-COMMUNICATION.md` | emit, signal, hooks, BusContract, SignalRegistry |
| `specification/08-CONTEXT.md` | ctx object, BaseCtx, PluginCtx, phase-appropriate context |
| `specification/09-TYPE-SYSTEM.md` | Phantom types, BuildPluginApis, App type |
| `specification/10-TESTING.md` | createTestCtx patterns |
| `specification/11-INVARIANTS.md` | Guarantees, error format, anti-patterns |
| `specification/12-PLUGIN-PATTERNS.md` | Plugin = connection point, file structure |
| `specification/13-KERNEL-PSEUDOCODE.md` | **Reference implementation** with all design decisions and rationale |
| `specification/ROADMAP.md` | 8-phase technical development plan |

## Open Design Variants (Decide During Implementation)

These are documented in `specification/README.md` and affect multiple spec files:

1. **createApp sync vs async** -- Variant B (async, `Promise<App>`) recommended
2. **createCore generics** -- 2 vs 3 (adding SignalRegistry), Variant B recommended
3. **CoreAPI function count** -- 6 vs 7 (adding createPluginFactory), Variant B recommended
4. **App getPlugin/require typing** -- Loose vs constrained to registered names, Variant B recommended
5. **Lifecycle method async support** -- Follows from the createApp decision

All spec recommendations favor Variant B. These are interconnected: async createApp implies async lifecycle methods; SignalRegistry implies 3 generics.

## Critical Design Decisions to Preserve

- **Two-step app creation** (`createConfig` then `createApp`): Required because TypeScript resolves generics left-to-right; pluginConfigs type depends on knowing all plugins first.
- **No topological sort**: `depends` is validation-only. Plugin order is explicit in the array.
- **Shallow merge only**: `{ ...defaultConfig, ...consumerConfig }`. No deep merge.
- **Sequential async execution**: Within each phase, plugins run one at a time, awaited. No parallelism.
- **Configs frozen, state mutable**: Configs are `Object.freeze`'d. Plugin state (`S`) is the mutable escape hatch.
- **Component = plugin at runtime**: Components map `onMount`->`onStart`, `onUnmount`->`onStop`. Same runtime path.
- **Module = flattening container**: No lifecycle, just organizational grouping.

## Error Message Format

All kernel errors must follow: `[framework-name] <description>.\n  <actionable suggestion>.`

## Implementation Conventions (When Code Exists)

- Runtime target: < 200 lines. The type system does the heavy lifting.
- Bundle target: < 5KB minified + gzipped, zero runtime dependencies.
- Sub-path exports: `moku_core/testing` (createTestCtx), `moku_core/signals` (optional reactive state).
- Plugin file structure convention: `index.ts` (30-line connection point), `api.ts`, `state.ts`, `handlers.ts` for logic.
