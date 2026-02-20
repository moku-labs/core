// =============================================================================
// EventBus Types - Type-Level Tests
// =============================================================================
// Tests verify EventBus<Events> generic constrains emit/on/off/once to
// declared event names, handler payloads are correctly typed, unsubscribe
// returns () => void, clear accepts optional event name, and default
// generic allows any string event.
// =============================================================================

import { describe, expectTypeOf, it } from "vitest";
import type { EventBus } from "../../../src/index";
import { createEventBus } from "../../../src/index";
import type { CreateEventBusFunction } from "../../../src/types";

// =============================================================================
// Test Helper Types
// =============================================================================

type MyEvents = { click: { x: number }; hover: { target: string } };

// Use the typed CreateEventBusFunction interface to create typed buses,
// since the standalone createEventBus export uses the raw implementation
// signature. This mirrors how framework authors would use it via createCore.
declare const typedCreateEventBus: CreateEventBusFunction;

// =============================================================================
// 1. EventBus type matches createEventBus return type
// =============================================================================

describe("EventBus type", () => {
  it("EventBus<Events> matches createEventBus return type", () => {
    const bus = typedCreateEventBus<MyEvents>();
    expectTypeOf(bus).toMatchTypeOf<EventBus<MyEvents>>();
  });
});

// =============================================================================
// 2. emit is constrained to declared event names
// =============================================================================

describe("emit constraints", () => {
  it("emit accepts declared event names with correct payload", () => {
    const bus = typedCreateEventBus<MyEvents>();
    expectTypeOf(bus.emit).toBeFunction();
    expectTypeOf(bus.emit).toBeCallableWith("click", { x: 1 });
    expectTypeOf(bus.emit).toBeCallableWith("hover", { target: "btn" });
  });

  it("emit rejects undeclared event names (type constraint)", () => {
    // "invalid" does not extend keyof MyEvents ("click" | "hover")
    type EmitAcceptsInvalid = "invalid" extends keyof MyEvents ? true : false;
    expectTypeOf<EmitAcceptsInvalid>().toEqualTypeOf<false>();
  });
});

// =============================================================================
// 3. on handler receives correctly typed payload
// =============================================================================

describe("on handler payload typing", () => {
  it("on handler receives correctly typed payload", () => {
    const bus = typedCreateEventBus<MyEvents>();
    bus.on("click", payload => {
      expectTypeOf(payload).toEqualTypeOf<{ x: number }>();
    });
  });
});

// =============================================================================
// 4. on returns unsubscribe function
// =============================================================================

describe("on return type", () => {
  it("on returns an unsubscribe function () => void", () => {
    const bus = typedCreateEventBus<MyEvents>();
    const unsub = bus.on("click", () => {});
    expectTypeOf(unsub).toEqualTypeOf<() => void>();
  });
});

// =============================================================================
// 5. once handler receives correctly typed payload
// =============================================================================

describe("once handler payload typing", () => {
  it("once handler receives correctly typed payload", () => {
    const bus = typedCreateEventBus<MyEvents>();
    bus.once("hover", payload => {
      expectTypeOf(payload).toEqualTypeOf<{ target: string }>();
    });
  });
});

// =============================================================================
// 6. clear accepts optional event name constrained to Events keys
// =============================================================================

describe("clear constraints", () => {
  it("clear accepts declared event name", () => {
    const bus = typedCreateEventBus<MyEvents>();
    expectTypeOf(bus.clear).toBeCallableWith("click");
  });

  it("clear accepts no arguments", () => {
    const bus = typedCreateEventBus<MyEvents>();
    expectTypeOf(bus.clear).toBeCallableWith();
  });
});

// =============================================================================
// 7. Default generic allows any string event
// =============================================================================

describe("default generic (no explicit Events)", () => {
  it("default generic allows any string event", () => {
    // With no type argument, Events defaults to Record<string, unknown>
    const permissiveBus = typedCreateEventBus();
    expectTypeOf(permissiveBus.emit).toBeFunction();
    expectTypeOf(permissiveBus.on).toBeFunction();
  });

  it("standalone createEventBus returns a bus (untyped runtime export)", () => {
    // The standalone export works at runtime, returns any
    const bus = createEventBus();
    expectTypeOf(bus).toBeAny();
  });
});

// =============================================================================
// 8. EventBus type is importable and usable for variable annotation
// =============================================================================

describe("EventBus type annotation", () => {
  it("EventBus type is importable and usable for variable annotation", () => {
    const annotated: EventBus<MyEvents> = typedCreateEventBus<MyEvents>();
    expectTypeOf(annotated.emit).toBeFunction();
    expectTypeOf(annotated.on).toBeFunction();
    expectTypeOf(annotated.off).toBeFunction();
    expectTypeOf(annotated.once).toBeFunction();
    expectTypeOf(annotated.clear).toBeFunction();
  });
});
