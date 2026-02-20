import { describe, expect, it, vi } from "vitest";
import { createCore, createEventBus } from "../../src/index";

// =============================================================================
// createEventBus
// =============================================================================

describe("createEventBus", () => {
  it("returns a frozen object with emit, on, off, once, clear methods", () => {
    const bus = createEventBus();
    expect(Object.isFrozen(bus)).toBe(true);
    expect(typeof bus.emit).toBe("function");
    expect(typeof bus.on).toBe("function");
    expect(typeof bus.off).toBe("function");
    expect(typeof bus.once).toBe("function");
    expect(typeof bus.clear).toBe("function");
  });
});

// =============================================================================
// on and emit
// =============================================================================

describe("on and emit", () => {
  it("on registers a handler that receives emitted payloads", async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on("test", handler);
    await bus.emit("test", { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it("emit dispatches to multiple handlers sequentially", async () => {
    const bus = createEventBus();
    const log: number[] = [];
    bus.on("test", () => {
      log.push(1);
    });
    bus.on("test", () => {
      log.push(2);
    });
    bus.on("test", () => {
      log.push(3);
    });
    await bus.emit("test", "payload");
    expect(log).toEqual([1, 2, 3]);
  });

  it("emit returns Promise<void>", () => {
    const bus = createEventBus();
    const result = bus.emit("test", undefined);
    expect(result).toBeInstanceOf(Promise);
  });

  it("emit with no handlers is a no-op (resolves without error)", async () => {
    const bus = createEventBus();
    const result = await bus.emit("nonexistent", undefined);
    expect(result).toBeUndefined();
  });

  it("handlers receive only the payload (not the event name)", async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on("myEvent", handler);
    await bus.emit("myEvent", { data: "hello" });
    expect(handler.mock.calls[0]).toEqual([{ data: "hello" }]);
  });

  it("async handlers are awaited sequentially", async () => {
    const bus = createEventBus();
    const log: string[] = [];
    bus.on("test", async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      log.push("first-done");
    });
    bus.on("test", async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      log.push("second-done");
    });
    await bus.emit("test", undefined);
    expect(log).toEqual(["first-done", "second-done"]);
  });
});

// =============================================================================
// on unsubscribe
// =============================================================================

describe("on unsubscribe", () => {
  it("on returns an unsubscribe function", () => {
    const bus = createEventBus();
    const unsub = bus.on("test", () => {});
    expect(typeof unsub).toBe("function");
  });

  it("calling unsubscribe removes that specific handler", async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsub = bus.on("test", handler);
    unsub();
    await bus.emit("test", "payload");
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribe is idempotent (double call does not throw)", () => {
    const bus = createEventBus();
    const unsub = bus.on("test", () => {});
    unsub();
    expect(() => unsub()).not.toThrow();
  });
});

// =============================================================================
// off
// =============================================================================

describe("off", () => {
  it("off removes a specific handler by reference equality", async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on("test", handler);
    bus.off("test", handler);
    await bus.emit("test", "payload");
    expect(handler).not.toHaveBeenCalled();
  });

  it("off with unknown handler is a no-op", () => {
    const bus = createEventBus();
    const unknownHandler = vi.fn();
    expect(() => bus.off("test", unknownHandler)).not.toThrow();
  });

  it("off does not remove other handlers for the same event", async () => {
    const bus = createEventBus();
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.on("test", handlerA);
    bus.on("test", handlerB);
    bus.off("test", handlerA);
    await bus.emit("test", "payload");
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledWith("payload");
  });
});

// =============================================================================
// once
// =============================================================================

describe("once", () => {
  it("once handler fires on first emit then auto-removes", async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.once("test", handler);
    await bus.emit("test", "first");
    await bus.emit("test", "second");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("first");
  });

  it("once returns an unsubscribe function", async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsub = bus.once("test", handler);
    unsub();
    await bus.emit("test", "payload");
    expect(handler).not.toHaveBeenCalled();
  });

  it("once handler receives the payload correctly", async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.once("test", handler);
    await bus.emit("test", { key: "value" });
    expect(handler).toHaveBeenCalledWith({ key: "value" });
  });
});

// =============================================================================
// clear
// =============================================================================

describe("clear", () => {
  it("clear() with no args removes all handlers for all events", async () => {
    const bus = createEventBus();
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.on("a", handlerA);
    bus.on("b", handlerB);
    bus.clear();
    await bus.emit("a", undefined);
    await bus.emit("b", undefined);
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();
  });

  it("clear(event) removes handlers for that specific event only", async () => {
    const bus = createEventBus();
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.on("a", handlerA);
    bus.on("b", handlerB);
    bus.clear("a");
    await bus.emit("a", undefined);
    await bus.emit("b", undefined);
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalled();
  });
});

// =============================================================================
// error handling
// =============================================================================

describe("error handling", () => {
  it("emit propagates handler errors (fail-fast, stops dispatch)", async () => {
    const bus = createEventBus();
    const secondHandler = vi.fn();
    bus.on("test", () => {
      throw new Error("handler boom");
    });
    bus.on("test", secondHandler);
    await expect(bus.emit("test", undefined)).rejects.toThrow("handler boom");
    expect(secondHandler).not.toHaveBeenCalled();
  });

  it("onError config callback is called before error propagates", async () => {
    const onError = vi.fn();
    const bus = createEventBus({ onError });
    bus.on("test", () => {
      throw new Error("callback test");
    });
    await expect(bus.emit("test", undefined)).rejects.toThrow("callback test");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]![0] as Error).message).toBe("callback test");
  });
});

// =============================================================================
// config options
// =============================================================================

describe("config options", () => {
  it("maxListeners triggers console.warn when exceeded", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bus = createEventBus({ maxListeners: 2 });
    bus.on("test", () => {});
    bus.on("test", () => {});
    expect(warnSpy).not.toHaveBeenCalled();
    bus.on("test", () => {});
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain("maxListeners");
    warnSpy.mockRestore();
  });

  it("maxListeners does not prevent adding the handler", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bus = createEventBus({ maxListeners: 2 });
    const handler = vi.fn();
    bus.on("test", () => {});
    bus.on("test", () => {});
    bus.on("test", handler);
    await bus.emit("test", "payload");
    expect(handler).toHaveBeenCalledWith("payload");
    warnSpy.mockRestore();
  });

  it("createEventBus() with no config works (defaults)", () => {
    const bus = createEventBus();
    expect(bus).toBeDefined();
    expect(Object.isFrozen(bus)).toBe(true);
  });
});

// =============================================================================
// createCore integration
// =============================================================================

describe("createCore integration", () => {
  it("createCore().createEventBus() returns a working bus (no longer throws stub)", async () => {
    const core = createCore("test", { config: {} });
    const bus = core.createEventBus();
    expect(Object.isFrozen(bus)).toBe(true);
    const handler = vi.fn();
    bus.on("test", handler);
    await bus.emit("test", { data: 123 });
    expect(handler).toHaveBeenCalledWith({ data: 123 });
  });
});
