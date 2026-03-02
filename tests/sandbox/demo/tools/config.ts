/**
 * Moku framework — Layer 1 configuration.
 *
 * Defines the unified global config shape and global events for the
 * full framework (SPA + Build + CLI). All plugins import `createPlugin`
 * from this file.
 */
import { createCoreConfig } from "../../../../src";

/**
 * Global framework configuration covering all three domains.
 *
 * @example
 * ```typescript
 * {
 *   appName: "My Blog", debug: true,
 *   mode: "hybrid", contentDir: "content", outputDir: "dist",
 *   version: "1.0.0"
 * }
 * ```
 */
export type MokuConfig = {
  /** Display name of the application. */
  appName: string;
  /** Enable debug logging. */
  debug: boolean;
  /** Build render mode: static-only, SPA-only, or hybrid. */
  mode: "ssg" | "spa" | "hybrid";
  /** Path to content source directory. */
  contentDir: string;
  /** Path to build output directory. */
  outputDir: string;
  /** Framework version string. */
  version: string;
};

/**
 * Global framework events available to all plugins without `depends`.
 *
 * @example
 * ```typescript
 * app.emit("app:ready", { timestamp: Date.now() });
 * app.emit("app:error", { message: "Not found", code: 404 });
 * ```
 */
export type MokuEvents = {
  /** Emitted when the framework is fully initialized. */
  "app:ready": { timestamp: number };
  /** Emitted on application-level errors. */
  "app:error": { message: string; code: number };
};

export const coreConfig = createCoreConfig<MokuConfig, MokuEvents>("moku", {
  config: {
    appName: "Moku",
    debug: false,
    mode: "hybrid",
    contentDir: "content",
    outputDir: "dist",
    version: "0.1.0"
  }
});

export const { createPlugin, createCore } = coreConfig;
