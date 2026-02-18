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
| 06 | [Lifecycle](./06-LIFECYCLE.md) | All 9 phases, ordering, sync/async variants |
| 07 | [Communication](./07-COMMUNICATION.md) | emit, signal, hooks, BusContract, SignalRegistry |
| 08 | [Context](./08-CONTEXT.md) | ctx object, BaseCtx, PluginCtx, phase-appropriate context rules |
| 09 | [Type System](./09-TYPE-SYSTEM.md) | Phantom types, type helpers, BuildPluginApis, App type |
| 10 | [Testing](./10-TESTING.md) | createTestCtx, testing patterns |
| 11 | [Invariants](./11-INVARIANTS.md) | Guarantees, error messages, anti-patterns |
| 12 | [Plugin Patterns](./12-PLUGIN-PATTERNS.md) | Plugin = connection point, file structure, LLM system prompt |
| 13 | [Kernel Pseudocode](./13-KERNEL-PSEUDOCODE.md) | Reference implementation, design decisions log |
| -- | [Roadmap](./ROADMAP.md) | Technical development phases (pure moku_core only) |

---

## Open Design Variants

These variants are documented throughout the spec. Choose during implementation.

| Decision | Variant A | Variant B | Affects |
|---|---|---|---|
| **createApp sync/async** | Sync (Phases 2-4 sync) | Async (`Promise<App>`, Phases 2-4 async) | 02, 03, 06, 13 |
| **createCore generics** | 2 (BaseConfig, BusContract) | 3 (+SignalRegistry) | 02, 07, 08, 09 |
| **CoreAPI function count** | 6 functions | 7 (+createPluginFactory) | 02, 03 |
| **App getPlugin/require** | Loose `<T = any>(string)` | Constrained to registered names | 09 |
| **PluginSpec lifecycle** | Sync for Phases 2-4 | Async-compatible (`S \| Promise<S>`) | 03, 04, 06 |

These variants are interconnected:
- If you choose **async createApp** (B), you naturally get **async lifecycle methods** (B).
- If you choose **SignalRegistry** (B), you get **3 generics** and typed signals.
- **createPluginFactory** and **typed getPlugin** are independent decisions.

---

*The kernel is boring. The framework is opinionated. The consumer is productive. The LLM is constrained.*
