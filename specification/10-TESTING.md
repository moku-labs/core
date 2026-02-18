# 10 - Testing

**Domain:** createTestCtx, testing patterns, createAppSync
**Sources:** SPEC_DEFINITIVE (v1.0.0-rc1), SPEC_IMPROVEMENTS_IDEAS (P7)

---

## 1. The Problem

Testing a plugin currently requires building an entire app:

```typescript
// Heavy test setup
const config = createConfig({ siteName: 'Test' }, [LoggerPlugin, RouterPlugin]);
const app = await createApp(config, { router: { default: 'home', pages: {} } });
await app.start();
// now test app.router.navigate()...
await app.destroy();
```

This is integration testing. There's no way to unit test a plugin's API factory, state creation, or lifecycle hooks in isolation.

---

## 2. createTestCtx

`moku_core/testing` provides a lightweight utility that creates a mock `ctx` object for testing plugin domain files in isolation.

**This is NOT a core export.** It ships as a sub-path:

```typescript
import { createTestCtx } from 'moku_core/testing';
```

---

## 3. API

```typescript
function createTestCtx<G, C, S>(options?: {
  global?: Partial<G>;
  config?: Partial<C>;
  state?: Partial<S>;
  plugins?: Record<string, any>;  // mock plugin APIs
}): {
  ctx: PluginCtx<G, any, any, C, S>;
  emitted: Array<{ name: string; payload: any }>;   // captured emit calls
  signaled: Array<{ name: string; payload: any }>;  // captured signal calls
};
```

---

## 4. How It Works

`createTestCtx` creates:

- A `global` object from the provided partial (frozen)
- A `config` object from the provided partial (frozen)
- A `state` object from the provided partial (mutable)
- `getPlugin(name)` that returns from the `plugins` map
- `require(name)` that returns from `plugins` or throws
- `has(name)` that checks the `plugins` map
- `emit(name, payload)` that pushes to the `emitted` array
- `signal(name, payload)` that pushes to the `signaled` array

No kernel. No lifecycle. No framework. Just the ctx shape that domain functions expect.

---

## 5. Usage Examples

### Test API factory in isolation

```typescript
import { createTestCtx } from 'moku_core/testing';
import { createRouterApi } from '../plugins/router/api';
import type { RouterConfig, RouterState } from '../plugins/router/types';

test('navigate updates current path', () => {
  const { ctx } = createTestCtx<any, RouterConfig, RouterState>({
    config: { default: 'home', pages: { home: {}, about: {} } },
    state: { currentPath: 'home', history: ['home'] },
  });

  const api = createRouterApi(ctx);
  api.navigate('about');

  expect(ctx.state.currentPath).toBe('about');
});
```

### Test signal emission

```typescript
test('navigate to unknown page signals notFound', () => {
  const { ctx, signaled } = createTestCtx<any, RouterConfig, RouterState>({
    config: { default: 'home', pages: { home: {} } },
    state: { currentPath: 'home', history: ['home'] },
  });

  const api = createRouterApi(ctx);
  api.navigate('nonexistent');

  expect(signaled[0]).toEqual({
    name: 'router:notFound',
    payload: { attempted: 'nonexistent', fallback: 'home' },
  });
});
```

### Test plugin dependencies

```typescript
test('require throws for missing plugin', () => {
  const { ctx } = createTestCtx({
    plugins: { logger: { info: vi.fn() } },
  });

  expect(() => ctx.require('auth')).toThrow('auth');
  expect(ctx.has('logger')).toBe(true);
  expect(ctx.require('logger').info).toBeDefined();
});
```

---

## 6. Testing Strategy

This closes the testing loop:

| What to test | How | Tool |
|---|---|---|
| Plugin wiring (index.ts) | Integration test with real app | `createApp` |
| Domain logic (api.ts, state.ts, handlers.ts) | Unit test with mock ctx | `createTestCtx` |
| Config validation (validation.ts) | Unit test, plain function | Direct call |
| Type correctness | Compile-time | TypeScript |

**For LLMs:** When an LLM generates a plugin, it can also generate focused unit tests using `createTestCtx`. The tests verify the domain logic without spinning up the whole framework.

---

## 7. createAppSync (Framework-Provided Convenience)

For sync-only test environments or simple setups, the framework (NOT moku_core) can provide a sync wrapper:

```typescript
// Framework-provided convenience (NOT a core export)
export function createAppSync<...>(...args): App<...> {
  const result = createApp(...args);
  if (result instanceof Promise) {
    throw new Error('[my-framework] createAppSync cannot be used with async plugins.');
  }
  return result;
}
```

This is useful in test suites where you know no plugins use async lifecycle and want to avoid `async/await` boilerplate.

---

## Cross-References

- Plugin patterns: [12-PLUGIN-PATTERNS](./12-PLUGIN-PATTERNS.md)
- Plugin spec: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Context object: [08-CONTEXT](./08-CONTEXT.md)

