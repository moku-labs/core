# FUTURE: Components

> **NOT IMPLEMENTED** -- This document describes a planned feature that is not
> part of the current v3 core. Components may be added in a future version.

## Concept

Components are syntactic sugar over plugins. A component uses `onMount` and `onUnmount` lifecycle methods instead of `start` and `stop`, providing a more natural vocabulary for UI-oriented or composable units. At runtime, the kernel treats components identically to plugins -- `onMount` maps to `start`, `onUnmount` maps to `stop`.

The key insight is that **at runtime, everything is a plugin.** Components exist as a developer-facing convention with a different spec shape, not as a different runtime entity. The `kind` field (`'plugin' | 'component'`) exists for tooling, documentation, and AI agents.

## Proposed API

```typescript
import { createComponent } from './config'; // From framework's createCoreConfig

const HealthCheck = createComponent('health', {
  defaultConfig: {
    endpoint: '/health',
    interval: 30_000,
  },

  createState: (ctx) => ({
    lastCheck: null as Date | null,
    status: 'unknown' as 'healthy' | 'unhealthy' | 'unknown',
  }),

  // Component-specific lifecycle names
  onMount: (ctx) => {
    // Maps to plugin `start` phase internally
    ctx.state.lastCheck = new Date();
    ctx.state.status = 'healthy';
  },

  onUnmount: (ctx) => {
    // Maps to plugin `stop` phase internally
    ctx.state.status = 'unknown';
  },

  api: (ctx) => ({
    check: () => ctx.state.status,
    lastChecked: () => ctx.state.lastCheck,
  }),
});
```

### Kernel Mapping

`createComponent` would internally transform the spec before passing it to the kernel:

```typescript
function createComponent(name, spec) {
  return createPlugin(name, {
    ...spec,
    start: spec.onMount,
    stop: spec.onUnmount,
    kind: 'component',
  });
}
```

## Open Questions

- Should components be a separate `createComponent` function or just a naming convention on `createPlugin` with a `kind` field?
- Do components need their own `ComponentSpec` variant, or can the standard `PluginSpec` handle both with optional `onMount`/`onUnmount` aliases?
- How do components interact with the 3-phase lifecycle (init, start, stop)? Does `onMount` map to `start` or `init`?
- Should `createComponent` be returned from `createCoreConfig` alongside `createPlugin`, or should it be a separate utility?
- Is the `kind` field useful enough to justify a separate factory function, or is it purely cosmetic?
