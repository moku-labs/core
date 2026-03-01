import { describe, expect, it, vi } from "vitest";

import { createConsoleProvider } from "../../providers/console";

// ---------------------------------------------------------------------------
// Unit test: console provider
// ---------------------------------------------------------------------------

describe("console provider", () => {
  it("logs track events to console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const provider = createConsoleProvider();

    provider.track("click", { button: "submit" });

    expect(spy).toHaveBeenCalledWith("[analytics] track: click", {
      button: "submit"
    });
    spy.mockRestore();
  });

  it("logs identify to console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const provider = createConsoleProvider();

    provider.identify("user-42");

    expect(spy).toHaveBeenCalledWith("[analytics] identify: user-42");
    spy.mockRestore();
  });

  it("logs flush to console", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const provider = createConsoleProvider();

    provider.flush();

    expect(spy).toHaveBeenCalledWith("[analytics] flush");
    spy.mockRestore();
  });

  it("has name 'console'", () => {
    const provider = createConsoleProvider();
    expect(provider.name).toBe("console");
  });
});
