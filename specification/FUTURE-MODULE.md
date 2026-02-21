# FUTURE: Modules

> **NOT IMPLEMENTED** -- This document describes a planned feature that is not
> part of the current v3 core. Modules may be added in a future version.

## Concept

Modules are organizational grouping containers with no lifecycle of their own. A module bundles related plugins together, and during app creation, the kernel flattens all modules into a single ordered plugin list. After flattening, no modules exist at runtime -- only the plugins they contained.

Modules solve the problem of distributing a set of related plugins as a single unit. A framework author can create an "infrastructure module" containing cache, metrics, and health plugins, and the consumer adds it as a single entry.

## Proposed API

```typescript
import { createModule, createPlugin } from './config'; // From framework's createCoreConfig

const cachePlugin = createPlugin('cache', {
  defaultConfig: { ttl: 60_000 },
  api: (ctx) => ({
    get: (key: string) => null,
    set: (key: string, value: unknown) => {},
  }),
});

const metricsPlugin = createPlugin('metrics', {
  api: (ctx) => ({
    track: (event: string) => {},
  }),
});

// Group related plugins into a module
const infraModule = createModule('infra', {
  plugins: [cachePlugin, metricsPlugin],
  onRegister: (ctx) => {
    // Fires during flattening, before any plugin lifecycle runs
    console.log(`Registering infra module for ${ctx.global.siteName}`);
  },
});

// Consumer uses the module like any other plugin entry
const app = await createApp({
  plugins: [infraModule, blogPlugin],
  siteName: 'My Blog',
});
// After flattening: [cachePlugin, metricsPlugin, blogPlugin]
```

### Flattening Algorithm

Modules are consumed during the flatten step of app creation:

```
function flatten(items):
  result = []
  for item in items:
    if item.kind === 'module':
      call item.onRegister() if present
      result.push(...flatten(item.plugins))
    else:
      result.push(item)
  return result
```

**Depth-first. Children before parents. Deterministic.** The output is a flat ordered list of plugins. No modules survive this step.

## Open Questions

- Are modules needed if `PluginSpec` already supports sub-plugins via a `plugins` field? Sub-plugins provide similar grouping without a new primitive.
- Should modules have an `onRegister` hook, or should registration side effects be handled differently?
- Should modules support nested modules (modules containing modules), or should nesting be limited to one level?
- How should module-level config work? Can a module define config that is distributed to its child plugins?
- Should `createModule` be returned from `createCoreConfig` alongside `createPlugin`, or should it be a separate utility?
