// =============================================================================
// moku_core - Standalone Event Bus
// =============================================================================
// A typed pub/sub event bus. Can be used standalone via
// `import { createEventBus } from 'moku_core'` or via createCore's returned API.
// Sequential dispatch, fail-fast error propagation, Object.freeze on return.
// =============================================================================

/**
 * Internal handler function type for event bus entries.
 * Accepts any payload at runtime; typed at call site via EventBus generic.
 */
// biome-ignore lint/suspicious/noExplicitAny: Handler accepts any payload at runtime; typed at call site via EventBus generic
type Handler = (payload: any) => void | Promise<void>;

/**
 * Creates a standalone typed event bus instance.
 * Handlers are dispatched sequentially (for-of with await). Errors propagate
 * immediately (fail-fast). The returned object is frozen.
 * @param config - Optional configuration for maxListeners and onError callback.
 * @param config.maxListeners - Maximum listeners per event before console.warn. No hard limit.
 * @param config.onError - Called before re-throwing when a handler throws. Notification-only.
 * @returns A frozen EventBus with emit, on, off, once, and clear methods.
 * @example
 * ```ts
 * type Events = { "user:login": { id: string }; "user:logout": void };
 * const bus = createEventBusImpl<Events>();
 * const unsub = bus.on("user:login", (payload) => console.log(payload.id));
 * await bus.emit("user:login", { id: "123" });
 * unsub();
 * ```
 */
export function createEventBusImpl(
  config?: { maxListeners?: number; onError?: (error: unknown) => void }
  // biome-ignore lint/suspicious/noExplicitAny: Return type is asserted at call site via CreateEventBusFunction generic
): any {
  /** Internal handler storage. Keys are event names, values are handler entries. */
  const handlers = new Map<string | symbol, Array<{ handler: Handler; once: boolean }>>();

  /**
   * Gets or creates the handler list for an event.
   * @param event - The event name.
   * @returns The handler list for the event.
   * @example
   * ```ts
   * const list = getList("user:login");
   * ```
   */
  function getList(event: string | symbol) {
    let list = handlers.get(event);
    if (!list) {
      list = [];
      handlers.set(event, list);
    }
    return list;
  }

  /**
   * Removes a specific handler by reference equality. No-op if not found.
   * @param event - The event name.
   * @param handler - The handler function reference to remove.
   * @example
   * ```ts
   * off("user:login", myHandler);
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Handler type is generic at runtime
  function off(event: string | symbol, handler: any): void {
    const list = handlers.get(event);
    if (!list) return;
    const index = list.findIndex(entry => entry.handler === handler);
    if (index !== -1) list.splice(index, 1);
  }

  /**
   * Subscribes a handler to an event. Returns an unsubscribe function.
   * @param event - The event name.
   * @param handler - The handler function.
   * @returns An unsubscribe function.
   * @example
   * ```ts
   * const unsub = on("user:login", (payload) => console.log(payload));
   * unsub();
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Handler type is generic at runtime
  function on(event: string | symbol, handler: any): () => void {
    const list = getList(event);
    if (config?.maxListeners && list.length >= config.maxListeners) {
      console.warn(
        `EventBus: event "${String(event)}" has ${list.length + 1} listeners (maxListeners: ${config.maxListeners}).`
      );
    }
    list.push({ handler, once: false });
    return () => off(event, handler);
  }

  /**
   * Subscribes a handler to an event for a single invocation. Returns an unsubscribe function.
   * @param event - The event name.
   * @param handler - The handler function.
   * @returns An unsubscribe function.
   * @example
   * ```ts
   * const unsub = once("user:login", (payload) => console.log(payload));
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Handler type is generic at runtime
  function once(event: string | symbol, handler: any): () => void {
    const list = getList(event);
    if (config?.maxListeners && list.length >= config.maxListeners) {
      console.warn(
        `EventBus: event "${String(event)}" has ${list.length + 1} listeners (maxListeners: ${config.maxListeners}).`
      );
    }
    list.push({ handler, once: true });
    return () => off(event, handler);
  }

  /**
   * Dispatches an event to all registered handlers sequentially.
   * Errors propagate immediately (fail-fast). If onError config callback is provided,
   * it is called before re-throwing.
   * @param event - The event name.
   * @param payload - The event payload.
   * @returns A promise that resolves when all handlers complete.
   * @example
   * ```ts
   * await emit("user:login", { id: "123" });
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Payload type is generic at runtime
  async function emit(event: string | symbol, payload: any): Promise<void> {
    const list = handlers.get(event);
    if (!list) return;
    // Snapshot to avoid mutation during iteration
    const snapshot = [...list];
    for (const entry of snapshot) {
      try {
        await entry.handler(payload);
      } catch (error: unknown) {
        config?.onError?.(error);
        throw error;
      }
      if (entry.once) off(event, entry.handler);
    }
  }

  /**
   * Clears all handlers, or handlers for a specific event.
   * @param event - Optional event name. If omitted, clears all events.
   * @example
   * ```ts
   * clear("user:login"); // clear handlers for one event
   * clear(); // clear all handlers
   * ```
   */
  function clear(event?: string | symbol): void {
    if (event === undefined) {
      handlers.clear();
    } else {
      handlers.delete(event);
    }
  }

  return Object.freeze({ emit, on, off, once, clear });
}
