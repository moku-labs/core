# FUTURE: Reactive State (Signals)

> **NOT IMPLEMENTED** -- This document describes a planned feature that is not
> part of the current v3 core. Signals may be added in a future version.

## Concept

Signals provide an optional reactive state primitive for plugins. Instead of manually tracking state changes and emitting events, a plugin can use `signal()` to create observable values and `computed()` for derived values that automatically update when dependencies change.

Signals are a convenience layer -- plugins can achieve the same behavior with plain state and explicit `emit` calls. The value of signals is reduced boilerplate for state-heavy plugins.

## Proposed API

```typescript
import { signal, computed, effect } from 'moku_core/signals';

const counterPlugin = createPlugin('counter', {
  createState: () => {
    const count = signal(0);
    const doubled = computed(() => count.get() * 2);
    return { count, doubled };
  },

  api: (ctx) => ({
    increment: () => ctx.state.count.set(ctx.state.count.get() + 1),
    decrement: () => ctx.state.count.update(v => v - 1),
    value: () => ctx.state.count.get(),
    doubledValue: () => ctx.state.doubled.get(),
  }),

  init: (ctx) => {
    // React to signal changes
    effect(() => {
      const current = ctx.state.count.get();
      void ctx.emit('counter:changed', { value: current });
    });
  },
});
```

### Signal Primitives

- `signal<T>(initial): Signal<T>` -- Observable value with `get()`, `set()`, `update()`, `subscribe()`
- `computed<T>(fn): Computed<T>` -- Derived value that recalculates when dependencies change. Read-only.
- `effect(fn): () => void` -- Side effect that re-runs when tracked signals change. Returns cleanup function.

## Open Questions

- Should signals be part of `moku_core/signals` (sub-path export) or a completely separate package?
- How do signals integrate with the event system? Should signal changes automatically emit events, or is that the plugin author's responsibility?
- Lazy vs eager computation: should `computed` recalculate on read (lazy) or on dependency change (eager)?
- How does signal subscription cleanup work during the `stop` lifecycle phase?
- Should the kernel be signal-aware (e.g., automatically subscribing to signals in state), or should signals be a pure userland utility with no kernel knowledge?
