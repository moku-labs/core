# FUTURE: Global Shared State

> **NOT IMPLEMENTED** -- This document describes a planned feature that is not
> part of the current v3 core. Global shared state may be added in a future version.

## Concept

Global shared state provides a mutable state object accessible to all plugins, complementing the read-only global config. While each plugin already has private mutable state via `ctx.state`, global state enables cross-plugin data sharing without direct API calls.

The feature consists of three parts:

1. **`ctx.global.state`** -- Read and write access to the shared state object during lifecycle phases
2. **`ctx.global.setState`** -- Mutation method that updates state and dispatches a typed event, enabling other plugins to react to state changes via hooks
3. **`app.state`** -- A frozen read-only snapshot of the global state, accessible from outside the plugin lifecycle

## Proposed API

When global state is implemented, `createCoreConfig` will expand from 2 generics to 3:

```typescript
// Current v3 (without global state):
const coreConfig = createCoreConfig<Config, Events>('my-framework', {
  config: { /* defaults */ },
});

// Future v3 (with global state):
type GlobalState = {
  users: string[];
  theme: 'light' | 'dark';
};

const coreConfig = createCoreConfig<Config, GlobalState, Events>('my-framework', {
  config: { /* defaults */ },
  createInitialState: (ctx) => ({
    users: [],
    theme: 'light',
  }),
});
```

### Plugin Usage

```typescript
const userPlugin = createPlugin('user', {
  api: (ctx) => ({
    addUser: (name: string) => {
      // Read global state directly
      const current = ctx.global.state.users;

      // Mutate via setState (dispatches 'state:changed' event)
      ctx.global.setState({
        users: [...current, name],
      });
    },
    getTheme: () => ctx.global.state.theme,
  }),

  hooks: {
    // React to state changes from any plugin
    'state:changed': (payload) => {
      // payload typed from GlobalState
    },
  },
});
```

### App-Level Access

```typescript
const app = await createApp({ /* ... */ });
await app.start();

// Frozen read-only snapshot (not reactive)
console.log(app.state.users);  // string[]
console.log(app.state.theme);  // 'light' | 'dark'
```

## Open Questions

- **Mutation pattern:** Should `setState` accept a partial object (shallow merge), a full replacement, or a Proxy-based approach that tracks mutations automatically?
- **Snapshot timing:** Should `app.state` be recalculated on every access (always fresh) or cached per-tick (consistent within a handler)?
- **Event naming:** Should state changes emit a single `'state:changed'` event, or granular events per field (e.g., `'state:users:changed'`)?
- **Thread safety:** In async plugin execution, what happens if two plugins call `setState` concurrently? Is there a queue or last-write-wins?
- **Relationship to plugin state:** How do `ctx.state` (plugin-local) and `ctx.global.state` (shared) interact? Should plugins be discouraged from duplicating global state locally?
