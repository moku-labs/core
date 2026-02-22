import { describe, expect, it } from "vitest";

import { createCoreConfig } from "../../src";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Create a standard test core with siteName/mode config.
 */
function createTestCore() {
  return createCoreConfig<{ siteName: string; mode: string }, Record<string, never>>("test", {
    config: { siteName: "Untitled", mode: "development" }
  });
}

// ---------------------------------------------------------------------------
// Global config defaults
// ---------------------------------------------------------------------------

describe("global config defaults", () => {
  it("uses defaults when no overrides provided", async () => {
    let capturedGlobal: Record<string, unknown> = {};
    const cc = createTestCore();

    const probe = cc.createPlugin("probe", {
      onInit: context => {
        capturedGlobal = { ...context.global };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    await createApp();

    expect(capturedGlobal.siteName).toBe("Untitled");
    expect(capturedGlobal.mode).toBe("development");
  });

  it("config defaults come from createCoreConfig options", async () => {
    let capturedGlobal: Record<string, unknown> = {};

    const cc = createCoreConfig<{ custom: number }, Record<string, never>>("test", {
      config: { custom: 42 }
    });

    const probe = cc.createPlugin("probe", {
      onInit: context => {
        capturedGlobal = { ...context.global };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    await createApp();

    expect(capturedGlobal.custom).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Global config overrides via createApp
// ---------------------------------------------------------------------------

describe("global config overrides via createApp", () => {
  it("consumer overrides merge with defaults (shallow merge)", async () => {
    let capturedGlobal: Record<string, unknown> = {};
    const cc = createTestCore();

    const probe = cc.createPlugin("probe", {
      onInit: context => {
        capturedGlobal = { ...context.global };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    await createApp({ siteName: "Blog" });

    expect(capturedGlobal.siteName).toBe("Blog");
    // mode should retain default
    expect(capturedGlobal.mode).toBe("development");
  });

  it("all keys can be overridden", async () => {
    let capturedGlobal: Record<string, unknown> = {};
    const cc = createTestCore();

    const probe = cc.createPlugin("probe", {
      onInit: context => {
        capturedGlobal = { ...context.global };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    await createApp({ siteName: "New Site", mode: "production" });

    expect(capturedGlobal.siteName).toBe("New Site");
    expect(capturedGlobal.mode).toBe("production");
  });
});

// ---------------------------------------------------------------------------
// Plugin config defaults from config
// ---------------------------------------------------------------------------

describe("plugin config defaults", () => {
  it("plugin receives its config when no override", async () => {
    let capturedConfig: Record<string, unknown> = {};
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      config: { basePath: "/", trailingSlash: false },
      onInit: context => {
        capturedConfig = { ...context.config };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    await createApp();

    expect(capturedConfig.basePath).toBe("/");
    expect(capturedConfig.trailingSlash).toBe(false);
  });

  it("plugin without config gets empty frozen config", async () => {
    let capturedConfig: Record<string, unknown> = {};
    const cc = createTestCore();

    const plugin = cc.createPlugin("bare", {
      onInit: context => {
        capturedConfig = { ...context.config };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [plugin] });
    await createApp();

    expect(Object.keys(capturedConfig)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Plugin config overrides via createApp options keyed by name
// ---------------------------------------------------------------------------

describe("plugin config overrides via createApp", () => {
  it("consumer can override plugin config by name", async () => {
    let capturedConfig: Record<string, unknown> = {};
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      config: { basePath: "/", trailingSlash: false },
      onInit: context => {
        capturedConfig = { ...context.config };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    await createApp({ router: { basePath: "/blog" } });

    expect(capturedConfig.basePath).toBe("/blog");
    expect(capturedConfig.trailingSlash).toBe(false);
  });

  it("framework-level plugin configs from createCore", async () => {
    let capturedConfig: Record<string, unknown> = {};
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      config: { basePath: "/" },
      onInit: context => {
        capturedConfig = { ...context.config };
      }
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [router],
      pluginConfigs: { router: { basePath: "/framework" } }
    });
    await createApp();

    expect(capturedConfig.basePath).toBe("/framework");
  });
});

// ---------------------------------------------------------------------------
// 3-level merge: plugin default < framework override < consumer override
// ---------------------------------------------------------------------------

describe("3-level config merge", () => {
  it("consumer overrides framework, framework overrides plugin default", async () => {
    let capturedConfig: Record<string, unknown> = {};
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      config: { basePath: "/", retries: 3, debug: false },
      onInit: context => {
        capturedConfig = { ...context.config };
      }
    });

    const { createApp } = cc.createCore(cc, {
      plugins: [router],
      pluginConfigs: { router: { basePath: "/framework", retries: 5 } }
    });
    await createApp({ router: { basePath: "/consumer" } });

    // consumer overrides basePath (from /framework -> /consumer)
    expect(capturedConfig.basePath).toBe("/consumer");
    // framework overrides retries (from 3 -> 5), consumer doesn't override
    expect(capturedConfig.retries).toBe(5);
    // plugin default kept
    expect(capturedConfig.debug).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Config is frozen
// ---------------------------------------------------------------------------

describe("config freezing", () => {
  it("global config is frozen", async () => {
    let frozen = false;
    const cc = createTestCore();

    const probe = cc.createPlugin("probe", {
      onInit: context => {
        frozen = Object.isFrozen(context.global);
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    await createApp();

    expect(frozen).toBe(true);
  });

  it("plugin config is frozen", async () => {
    let frozen = false;
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      config: { basePath: "/" },
      onInit: context => {
        frozen = Object.isFrozen(context.config);
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    await createApp();

    expect(frozen).toBe(true);
  });

  it("assignment to frozen global throws TypeError in strict mode", async () => {
    let assignmentThrew = false;
    const cc = createTestCore();

    const probe = cc.createPlugin("probe", {
      onInit: context => {
        try {
          // @ts-expect-error -- global config is readonly
          context.global.siteName = "new";
        } catch {
          assignmentThrew = true;
        }
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    await createApp();

    expect(assignmentThrew).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shallow merge only (no deep merge)
// ---------------------------------------------------------------------------

describe("shallow merge only", () => {
  it("nested objects are replaced, not deep merged", async () => {
    let capturedGlobal: Record<string, unknown> = {};

    const cc = createCoreConfig<{ nested: { a: number; b: number } }, Record<string, never>>(
      "test",
      {
        config: { nested: { a: 1, b: 2 } }
      }
    );

    const probe = cc.createPlugin("probe", {
      onInit: context => {
        capturedGlobal = { ...context.global };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [probe] });
    // Shallow merge: entire nested object replaced
    await createApp({ nested: { a: 99, b: 2 } });

    const nested = capturedGlobal.nested as { a: number; b: number };
    expect(nested.a).toBe(99);
    expect(nested.b).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Key discrimination: config keys vs plugin config keys
// ---------------------------------------------------------------------------

describe("key discrimination", () => {
  it("keys matching plugin names go to plugin config, rest to global", async () => {
    let capturedGlobal: Record<string, unknown> = {};
    let capturedPluginConfig: Record<string, unknown> = {};
    const cc = createTestCore();

    const router = cc.createPlugin("router", {
      config: { basePath: "/" },
      onInit: context => {
        capturedGlobal = { ...context.global };
        capturedPluginConfig = { ...context.config };
      }
    });

    const { createApp } = cc.createCore(cc, { plugins: [router] });
    await createApp({
      siteName: "Blog",
      router: { basePath: "/blog" }
    });

    // siteName goes to global config
    expect(capturedGlobal.siteName).toBe("Blog");
    // router goes to plugin config
    expect(capturedPluginConfig.basePath).toBe("/blog");
  });
});
