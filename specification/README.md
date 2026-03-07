# Moku Core -- Specification

**Status:** Alpha — implemented
**Framework:** @moku-labs/core -- Type-safe micro-kernel plugin framework for TypeScript

---

## Architecture Overview

The 3-step factory chain. Each step captures types in a closure, passing them downstream:

```
createCoreConfig<Config, Events>(id, options)     -- Framework config.ts
     |
createCore(coreConfig, { plugins })               -- Framework index.ts
     |
createApp({ plugins?, config?, pluginConfigs?, ... })  -- Consumer main.ts
     |
App  -- Typed plugin APIs: app.router.navigate()
```

One export at Layer 1 (`createCoreConfig`). One setup call at Layer 2 (`createCore`). One consumer call at Layer 3 (`createApp`). Everything is typed end-to-end through closures.

---

## Documents

| # | File | Domain |
|---|---|---|
| 01 | [Architecture](./01-ARCHITECTURE.md) | Three-layer model, design principles, 3-step flow |
| 02 | [Core API](./02-CORE-API.md) | createCoreConfig, createCore, createApp, createPlugin, createCorePlugin signatures |
| 03 | [Plugin System](./03-PLUGIN-SYSTEM.md) | PluginSpec, createPlugin, depends, core plugins, lifecycle methods |
| 04 | [Factory Chain](./04-FACTORY-CHAIN.md) | 3-step factory chain: why, how, type flow |
| 05 | [Config System](./05-CONFIG-SYSTEM.md) | Config resolution, defaults, pluginConfigs mapped type |
| 06 | [Lifecycle](./06-LIFECYCLE.md) | 3 phases (init, start, stop), async model |
| 07 | [Communication](./07-COMMUNICATION.md) | emit, hooks, global events, per-plugin events |
| 08 | [Context](./08-CONTEXT.md) | ctx object, 3 context tiers, phase-appropriate context |
| 09 | [Type System](./09-TYPE-SYSTEM.md) | Type helpers, BuildPluginApis, App type, type flow |
| 11 | [Invariants](./11-INVARIANTS.md) | Guarantees, error messages, anti-patterns |
| 12 | [Plugin Patterns](./12-PLUGIN-PATTERNS.md) | Plugin = connection point, file structure, LLM prompt |
| 13 | [Kernel Pseudocode](./13-KERNEL-PSEUDOCODE.md) | Reference implementation, design decisions log |
| 14 | [Event Registration](./14-EVENT-REGISTRATION.md) | Register callback pattern for typed event declarations |
| 15 | [Plugin Structure](./15-PLUGIN-STRUCTURE.md) | Complexity tiers, domain scenarios, file conventions |

---

*The kernel is boring. The framework is opinionated. The consumer is productive.*
