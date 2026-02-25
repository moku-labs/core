# 06 - Lifecycle

**Domain:** 3 lifecycle phases, ordering, async execution, error handling
**Version:** v3 (3-step architecture)

---

## 1. Three Phases

The kernel has exactly three lifecycle phases:

| Phase | Method | Direction | When | Context |
|-------|--------|-----------|------|---------|
| init | onInit | Forward (array order) | During `await createApp(...)` | PluginContext |
| start | onStart | Forward (array order) | `await app.start()` | PluginContext |
| stop | onStop | **REVERSE** (array order) | `await app.stop()` | TeardownContext |

Forward = plugin array order (first registered runs first). Reverse = last registered runs first.

---

## 2. The init Phase

Runs during `await createApp(...)`. This single phase encompasses all initialization work. Internal sub-steps (not visible to plugin authors as separate phases):

1. **Merge plugin lists:** `[...frameworkDefaultPlugins, ...consumerExtraPlugins]`
2. **Validate names:** No duplicate plugin names in the final list. Throw if any collision.
3. **Validate dependencies:** For each plugin with `depends`, verify all dependencies exist and appear earlier in the array. Throw with clear error if either fails.
5. **Resolve config:** For each plugin, shallow merge `{ ...config, ...consumerConfig }`. Freeze the result.
6. **Create state:** For each plugin (forward order), call `createState({ global, config })`. Store mutable state.
7. **Build API:** For each plugin (forward order), call `api(PluginContext)`. Register the API in the plugin registry.
8. **Run onInit:** For each plugin (forward order), call `onInit(PluginContext)`. Sequential, awaited. This is where plugins validate dependencies with `require()`/`has()`.

These sub-steps are presented as ONE phase with internal mechanics. Plugin authors write `onInit` -- the rest is kernel machinery.

After init completes, `createApp` resolves with the app object.

---

## 3. The start Phase

Runs when the consumer calls `await app.start()`. Forward order through the plugin array. Each plugin's `onStart` is called and awaited sequentially.

```typescript
const app = await createApp({ ... });
await app.start();  // triggers onStart for each plugin, forward order
```

This is where plugins perform runtime setup: opening connections, starting servers, loading data.

---

## 4. The stop Phase

Runs when the consumer calls `await app.stop()`. **REVERSE** order through the plugin array. Each plugin's `onStop` is called and awaited sequentially.

```typescript
await app.stop();  // triggers onStop for each plugin, REVERSE order
```

Reverse order ensures that plugins which depend on other plugins stop first. If Plugin B depends on Plugin A, B stops before A -- so B can still clean up using A's resources.

The stop phase receives `TeardownContext` -- minimal context with only `{ global }`. During teardown, other plugins may be partially or fully stopped, so the context does not expose inter-plugin communication methods.

---

## 5. Async Execution Model

All lifecycle methods support async (return `void | Promise<void>`):

- `createApp(options)` returns `Promise<App>`
- `app.start()` returns `Promise<void>`
- `app.stop()` returns `Promise<void>`

**Sequential execution within each phase.** Plugins run one at a time, awaited. Plugin A's `onInit` resolves before Plugin B's `onInit` begins. No parallelism within or across phases.

```typescript
// Each plugin is awaited before the next
for (const plugin of plugins) {
  await plugin.onInit(ctx);  // sequential, not parallel
}
```

---

## 6. Error Handling

Lifecycle methods can throw (or reject). When they do:

- The error propagates immediately to the caller.
- If `onInit` throws, `createApp` rejects.
- If `onStart` throws, `app.start()` rejects.
- If `onStop` throws, `app.stop()` rejects -- but remaining plugins still get `onStop` called (teardown is best-effort).

**No catch-and-silence. No error swallowing. No retry logic.** The consumer decides how to handle errors. The kernel does not know what "error recovery" means in your domain.

**Teardown best-effort:** During stop, if a plugin's `onStop` throws, the error is captured but the kernel continues calling `onStop` on remaining plugins. After all plugins have had their chance to stop, the first error is re-thrown. This prevents one plugin's failure from orphaning other plugins' resources.

---

## 7. Idempotency and State Guards

- `start()` can only be called once. Calling it again throws: `"App already started."`
- `stop()` can only be called once. Calling it again throws: `"App already stopped."` Calling it before start throws: `"App not started."`
- After `stop()`, all app methods throw. The app is in a terminal state.

```typescript
const app = await createApp({ ... });
await app.start();
await app.start();   // throws: "App already started."
await app.stop();
await app.stop();    // throws: "App already stopped."
app.router.navigate  // throws: app is stopped
```

---

## 8. Complete Example

```typescript
// Framework plugin
const dbPlugin = createPlugin('db', {
  config: { connectionString: 'sqlite::memory:' },
  createState: () => ({ connection: null as any }),
  api: (ctx) => ({
    query: (sql: string) => ctx.state.connection.query(sql),
  }),
  onInit: (ctx) => {
    // Validate config during init
    if (!ctx.config.connectionString) {
      throw new Error('[my-framework] db.connectionString is required.');
    }
  },
  onStart: async (ctx) => {
    // Open connection during start
    ctx.state.connection = await connect(ctx.config.connectionString);
  },
  onStop: async (ctx) => {
    // Close connection during stop (reverse order)
    // Only has ctx.global -- cannot access other plugins
  },
});

// Consumer
const app = await createApp({
  plugins: [dbPlugin],
  db: { connectionString: 'postgres://...' },
});

await app.start();   // db.onStart opens connection
app.db.query('SELECT 1');
await app.stop();    // db.onStop closes connection
```

---

## Cross-References

- Plugin spec: [03-PLUGIN-SYSTEM](./03-PLUGIN-SYSTEM.md)
- Context details: [08-CONTEXT](./08-CONTEXT.md)
- Communication: [07-COMMUNICATION](./07-COMMUNICATION.md)
- Invariants: [11-INVARIANTS](./11-INVARIANTS.md)
