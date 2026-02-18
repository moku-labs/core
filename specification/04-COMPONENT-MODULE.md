# 04 - Component and Module

**Domain:** ComponentSpec, ModuleSpec, flattening algorithm
**Sources:** SPEC_EVOLUTION (v2), SPEC_DEFINITIVE (v1.0.0-rc1)

---

## 1. Runtime Truth

**At runtime, everything is a plugin.** Components and modules are conventions with different spec shapes, not different runtime entities.

- `PluginInstance` has lifecycle: create -> init -> start -> stop -> destroy
- `ComponentInstance` has lifecycle: mount -> unmount (different names, same execution slot)
- `ModuleInstance` is a flattening container. It is consumed during Phase 0 and does not exist at runtime.

The `kind` field (`'plugin' | 'component' | 'module'`) exists for tooling, documentation, and AI agents. The kernel treats them all the same during collection and lifecycle.

---

## 2. Component Spec

### Variant A: Sync Lifecycle (base)

```typescript
interface ComponentSpec<N extends string, C = void, A extends Record<string, any> = {}, S = void> {
  defaultConfig?: C;
  depends?: readonly string[];
  createState?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => S;
  onMount?: (ctx: PluginCtx) => void | Promise<void>;
  onUnmount?: (ctx: { global: Readonly<any> }) => void | Promise<void>;
  hooks?: Record<string, (...args: any[]) => void | Promise<void>>;
  api?: (ctx: PluginCtx) => A;
}
```

### Variant B: Async-Compatible Lifecycle

```typescript
interface ComponentSpec<N extends string, C = void, A extends Record<string, any> = {}, S = void> {
  defaultConfig?: C;
  depends?: readonly string[];
  createState?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => S | Promise<S>;
  onMount?: (ctx: PluginCtx) => void | Promise<void>;
  onUnmount?: (ctx: { global: Readonly<any> }) => void | Promise<void>;
  hooks?: Record<string, (...args: any[]) => void | Promise<void>>;
  api?: (ctx: PluginCtx) => A | Promise<A>;
}
```

### Kernel Mapping

`onMount` is treated as `onStart`. `onUnmount` is treated as `onStop`. Different names, same execution slot.

The createComponent function performs this mapping internally:

```typescript
function createComponentFn(compName, spec) {
  const mappedSpec = {
    ...spec,
    onStart: spec.onMount,
    onStop: spec.onUnmount,
  };
  return {
    kind: 'component', name: compName, spec: mappedSpec,
    _hasDefaults: 'defaultConfig' in spec,
    _types: {},
  };
}
```

---

## 3. Module Spec

```typescript
interface ModuleSpec<N extends string, C = void> {
  plugins?: PluginInstance[];
  components?: ComponentInstance[];
  modules?: ModuleInstance[];           // recursive nesting
  onRegister?: (ctx: { global: Readonly<any>; config: Readonly<C> }) => void;
}
```

**Modules are flattened in Phase 0 and discarded.** The `onRegister` callback fires during flattening (before any plugin lifecycle). It's the only place a module "runs."

---

## 4. Flattening Algorithm (Phase 0)

Input: the plugin list, which may contain plugins, components, and modules.

```
function flatten(items):
  result = []
  for item in items:
    if item.kind === 'module':
      call item.onRegister() if present
      result.push(...flatten(item.plugins))
      result.push(...flatten(item.components))
      result.push(...flatten(item.modules))
    else:
      // Plugin or Component
      if item.spec.plugins:
        result.push(...flatten(item.spec.plugins))  // sub-plugins first
      result.push(item)
  return result
```

**Depth-first. Children before parents. Deterministic.** The output is a flat ordered list of plugins and components. No modules survive this phase.

### Example

Given:
```
[
  ModuleA {
    plugins: [PluginX, PluginY],
    components: [ComponentZ]
  },
  PluginW {
    plugins: [SubPluginV]  // sub-plugin
  }
]
```

Flattened result:
```
[PluginX, PluginY, ComponentZ, SubPluginV, PluginW]
```

- ModuleA is consumed: its children are inlined
- ModuleA.onRegister() fires during flattening
- SubPluginV appears before PluginW (children before parents)

---

## 5. Module Usage Example

```typescript
import { createModule, createPlugin, createComponent } from 'my-framework';

// Individual plugins and components
const CachePlugin = createPlugin<'cache', CacheConfig, CacheApi>('cache', { ... });
const MetricsPlugin = createPlugin<'metrics', void, MetricsApi>('metrics', { ... });
const HealthComponent = createComponent<'health', void, HealthApi>('health', { ... });

// Group them into a module
const InfraModule = createModule<'infra'>('infra', {
  plugins: [CachePlugin, MetricsPlugin],
  components: [HealthComponent],
  onRegister: ({ global }) => {
    console.log(`Registering infra module for ${global.appName}`);
  },
});

// Consumer uses the module just like any other plugin entry
const config = createConfig({ appName: 'My API' }, [InfraModule, ApiPlugin]);
```

After Phase 0 flattening, the module is gone. The consumer's plugin list is effectively `[CachePlugin, MetricsPlugin, HealthComponent, ApiPlugin]`.

---

## Cross-References

- Plugin system: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Lifecycle phases: [06-LIFECYCLE](./06-LIFECYCLE.md)
- Config system: [05-CONFIG-SYSTEM](./05-CONFIG-SYSTEM.md)

