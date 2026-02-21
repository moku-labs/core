# Moku Core -- Consolidated Specification

**Status:** Pre-implementation reference
**Framework:** moku_core -- Universal, type-safe, functional plugin framework for TypeScript

---

## Documents

| # | File | Domain |
|---|---|---|
| 01 | [Architecture](./01-ARCHITECTURE.md) | Three-layer model, philosophy, design principles, cross-domain applicability |
| 02 | [Core API](./02-CORE-API.md) | createCore, CoreDefaults, CoreAPI, createConfig, createApp signatures |
| 03 | [Plugin System](./03-PLUGIN-SYSTEM.md) | PluginSpec, PluginInstance, createPlugin, createPluginFactory, depends |
| 04 | [Component & Module](./04-COMPONENT-MODULE.md) | ComponentSpec, ModuleSpec, flattening algorithm |
| 05 | [Config System](./05-CONFIG-SYSTEM.md) | Config resolution, defaults, BuildPluginConfigs, no configRequired |
| 06 | [Lifecycle](./06-LIFECYCLE.md) | All 9 stages, ordering, sync/async variants |
| 07 | [Communication](./07-COMMUNICATION.md) | emit, hooks, EventContract |
| 08 | [Context](./08-CONTEXT.md) | ctx object, context tiers, phase-appropriate context rules |
| 09 | [Type System](./09-TYPE-SYSTEM.md) | Phantom types, type helpers, BuildPluginApis, App type |
| 10 | [Testing](./10-TESTING.md) | createTestCtx, testing patterns |
| 11 | [Invariants](./11-INVARIANTS.md) | Guarantees, error messages, anti-patterns |
| 12 | [Plugin Patterns](./12-PLUGIN-PATTERNS.md) | Plugin = connection point, file structure, LLM system prompt |
| 13 | [Kernel Pseudocode](./13-KERNEL-PSEUDOCODE.md) | Reference implementation, design decisions log |
| -- | [Roadmap](./ROADMAP.md) | Technical development Milestone (pure moku_core only) |

---

## Resolved Design Variants

These variants were documented throughout the spec and have been resolved during implementation.

| Decision | Chosen | Rationale |
|---|---|---|
| **createApp sync/async** | Async (`Promise<App>`) | Plugins can do real I/O during init |
| **createCore generics** | 2 (BaseConfig, EventContract) | Unified EventContract replaces BusContract+SignalRegistry |
| **CoreAPI function count** | 7 (+createPluginFactory) | Multi-instance plugins are a real need |
| **App getPlugin/require** | Constrained to registered names | Full type safety at consumption site |
| **PluginSpec lifecycle** | Async-compatible (`S \| Promise<S>`) | Real I/O during init |

The event system uses a unified `EventContract` generic with overloaded `emit`:
- Known events (in EventContract) get typed required payload
- Unknown events (any string) get untyped optional payload (escape hatch)
- No separate `signal` method -- everything goes through `emit`

---

*The kernel is boring. The framework is opinionated. The consumer is productive. The LLM is constrained.*
