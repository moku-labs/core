import { describe, expect, it } from "vitest";

import { createMemoryProvider } from "../../providers/memory";

// ---------------------------------------------------------------------------
// Unit test: memory provider
// ---------------------------------------------------------------------------

describe("memory provider", () => {
  it("stores tracked events in memory", () => {
    const provider = createMemoryProvider();

    provider.track("click", { button: "submit" });
    provider.track("scroll", { position: 100 });

    const store = provider.getStore();
    expect(store.events).toHaveLength(2);
    expect(store.events[0]).toEqual({
      event: "click",
      properties: { button: "submit" }
    });
    expect(store.events[1]).toEqual({
      event: "scroll",
      properties: { position: 100 }
    });
  });

  it("stores identified users", () => {
    const provider = createMemoryProvider();

    provider.identify("user-1");
    provider.identify("user-2");

    const store = provider.getStore();
    expect(store.identities).toEqual(["user-1", "user-2"]);
  });

  it("flush clears all stored data", () => {
    const provider = createMemoryProvider();

    provider.track("click", {});
    provider.identify("user-1");

    const store = provider.getStore();
    expect(store.events).toHaveLength(1);
    expect(store.identities).toHaveLength(1);

    provider.flush();

    expect(store.events).toHaveLength(0);
    expect(store.identities).toHaveLength(0);
  });

  it("has name 'memory'", () => {
    const provider = createMemoryProvider();
    expect(provider.name).toBe("memory");
  });
});
