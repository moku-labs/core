# Moku Core -- v3 Specification

**Status:** Pre-implementation reference for v3 architecture
**Framework:** moku_core -- Type-safe micro-kernel plugin framework for TypeScript

---

## Architecture Overview

The 3-step factory chain. Each step captures types in a closure, passing them downstream:

```
createCoreConfig<Config, Events>(id, options)     -- Framework config.ts
     |
createCore(coreConfig, { plugins })               -- Framework index.ts
     |
createApp({ plugins?, ...config, ...pluginConfigs })  -- Consumer main.ts
     |
Promise<App>  -- Typed plugin APIs: app.router.navigate()
```

One export at Layer 1 (`createCoreConfig`). One setup call at Layer 2 (`createCore`). One consumer call at Layer 3 (`createApp`). Everything is typed end-to-end through closures.

---

## Documents

| # | File | Domain |
|---|---|---|
| 01 | [Architecture](./01-ARCHITECTURE.md) | Three-layer model, design principles, 3-step flow |
| 02 | [Core API](./02-CORE-API.md) | createCoreConfig, createCore, createApp, createPlugin signatures |
| 03 | [Plugin System](./03-PLUGIN-SYSTEM.md) | PluginSpec, createPlugin, depends, sub-plugins |
| 04 | [Factory Chain](./04-FACTORY-CHAIN.md) | 3-step factory chain: why, how, type flow |
| 05 | [Config System](./05-CONFIG-SYSTEM.md) | Config resolution, defaults, BuildPluginConfigs |
| 06 | [Lifecycle](./06-LIFECYCLE.md) | 3 phases (init, start, stop), async model |
| 07 | [Communication](./07-COMMUNICATION.md) | emit, hooks, global events, per-plugin events |
| 08 | [Context](./08-CONTEXT.md) | ctx object, 3 context tiers, phase-appropriate context |
| 09 | [Type System](./09-TYPE-SYSTEM.md) | Type helpers, BuildPluginApis, App type, type flow |
| 11 | [Invariants](./11-INVARIANTS.md) | Guarantees, error messages, anti-patterns |
| 12 | [Plugin Patterns](./12-PLUGIN-PATTERNS.md) | Plugin = connection point, file structure, LLM prompt |
| 13 | [Kernel Pseudocode](./13-KERNEL-PSEUDOCODE.md) | Reference implementation, design decisions log |

---

## Future Discussion

These features are not part of the v3 core. Each file documents a planned concept with proposed API and open questions.

| File | Topic | Status |
|---|---|---|
| [FUTURE-COMPONENT.md](./FUTURE-COMPONENT.md) | Component sugar over plugins | Not implemented |
| [FUTURE-MODULE.md](./FUTURE-MODULE.md) | Organizational grouping containers | Not implemented |
| [FUTURE-TESTING.md](./FUTURE-TESTING.md) | Testing utilities | Not implemented |
| [FUTURE-SIGNALS.md](./FUTURE-SIGNALS.md) | Reactive state (signal/computed/effect) | Not implemented |
| [FUTURE-GLOBAL-STATE.md](./FUTURE-GLOBAL-STATE.md) | Shared mutable state across plugins | Not implemented |
| [FUTURE-LIFECYCLE-HOOKS.md](./FUTURE-LIFECYCLE-HOOKS.md) | Pre/after hooks for lifecycle phases | Not implemented |

---

*The kernel is boring. The framework is opinionated. The consumer is productive.*
