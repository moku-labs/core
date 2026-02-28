# FUTURE: Extended Lifecycle Hooks

> **NOT IMPLEMENTED** -- This document describes a planned feature that is not
> part of the current v3 core. Extended lifecycle hooks may be added in a future version.

## Concept

The v3 core provides 3 lifecycle phases: `init`, `start`, and `stop`. Extended lifecycle hooks would add interception points before and after each phase, enabling plugins to perform setup or cleanup at precise moments without coupling to other plugins' internal logic.

The 6 potential hooks are:

| Hook | When | Use Case |
|------|------|----------|
| `preInit` | Before any plugin's `init` runs | Environment validation, connection setup |
| `afterInit` | After all plugins' `init` complete | Cross-plugin initialization checks |
| `preStart` | Before any plugin's `start` runs | Pre-start health checks |
| `afterStart` | After all plugins' `start` complete | "App is ready" notifications |
| `preStop` | Before any plugin's `stop` runs | Graceful connection draining |
| `afterStop` | After all plugins' `stop` complete | Final cleanup, logging |

## Proposed API

### Option A: Dedicated PluginSpec Methods

```typescript
const monitorPlugin = createPlugin('monitor', {
  preStart: (ctx) => {
    console.log('About to start all plugins...');
  },
  start: (ctx) => {
    console.log('Monitor plugin starting');
  },
  afterStart: (ctx) => {
    console.log('All plugins started, app is ready');
    void ctx.emit('app:ready', { timestamp: Date.now() });
  },
});
```

### Option B: Event-Based Interception

```typescript
const monitorPlugin = createPlugin('monitor', {
  hooks: (ctx) => ({
    'lifecycle:preStart': () => {
      console.log('About to start all plugins...');
    },
    'lifecycle:afterStart': () => {
      console.log('All plugins started');
    },
  }),
});
```

## Open Questions

- **Events vs dedicated methods:** Should hooks be PluginSpec methods (Option A) or event-based (Option B)? Events are more flexible but less discoverable; methods are explicit but expand the PluginSpec interface.
- **Hook ordering:** Should hooks respect `depends` ordering, or do all `preStart` hooks run before any `start` methods regardless of dependency order?
- **Async support:** Should hooks support async operations, or should they be synchronous-only to avoid delaying lifecycle transitions?
- **Abort capability:** Can a `preStart` hook abort the start transition (e.g., return `false` to cancel)? This adds power but also complexity.
- **Granularity:** Are phase-level hooks sufficient, or should per-plugin hooks exist (e.g., "before plugin X starts")?
