# FUTURE: Testing Utilities

> **NOT IMPLEMENTED** -- This document describes planned testing utilities that
> are not part of the current v3 core. Testing utilities may be added in a future version.

## Concept

`createTestCtx` provides a lightweight mock context object for unit testing plugin domain logic in isolation. Instead of spinning up the entire framework with `createApp`, a developer creates a fake `ctx` with only the fields their code needs, runs their API or handler functions against it, and asserts the results.

This closes the testing gap: integration tests use `createApp` to verify wiring, while unit tests use `createTestCtx` to verify domain logic (api.ts, handlers.ts) without any kernel or lifecycle overhead.

## Proposed API

```typescript
import { createTestCtx } from 'moku_core/testing';

function createTestCtx<Config, C, S>(options?: {
  global?: Partial<Config>;     // Frozen global config mock
  config?: Partial<C>;          // Frozen plugin config mock
  state?: Partial<S>;           // Mutable plugin state mock
  plugins?: Record<string, any>; // Mock plugin APIs for require/getPlugin
}): {
  ctx: {
    global: Readonly<Config>;
    config: Readonly<C>;
    state: S;
    emit: (name: string, payload?: any) => void;
    getPlugin: (name: string) => any;
    require: (name: string) => any;
    has: (name: string) => boolean;
  };
  emitted: Array<{ name: string; payload: any }>;
};
```

### Usage Example

```typescript
import { createTestCtx } from 'moku_core/testing';
import { createRouterApi } from '../plugins/router/api';

test('navigate updates current path', () => {
  const { ctx } = createTestCtx({
    config: { basePath: '/' },
    state: { currentPath: '/', history: ['/'] },
  });

  const api = createRouterApi(ctx);
  api.navigate('/about');

  expect(ctx.state.currentPath).toBe('/about');
});

test('emit is captured for assertions', () => {
  const { ctx, emitted } = createTestCtx({
    config: { basePath: '/' },
    state: { currentPath: '/' },
  });

  const api = createRouterApi(ctx);
  api.navigate('/missing');

  expect(emitted[0]).toEqual({
    name: 'router:notFound',
    payload: { attempted: '/missing' },
  });
});
```

## Open Questions

- Should `createTestCtx` be part of `moku_core/testing` (sub-path export) or a completely separate package?
- What is the minimal viable `ctx` shape? Does it need `getPlugin`/`require`/`has`, or just `global`, `config`, `state`, `emit`?
- Should `createTestCtx` accept a generic for the full plugin union (to enable typed `require` in tests)?
- How should async lifecycle testing work? Should `createTestCtx` provide helpers for simulating init/start/stop phases?
