/**
 * Options for creating a test context.
 * @example
 * ```ts
 * const options: TestContextOptions = {
 *   global: { env: "test" },
 *   config: { debug: true },
 *   state: { count: 0 },
 *   plugins: {}
 * };
 * ```
 */
type TestContextOptions = {
  global?: Record<string, unknown>;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
};

/**
 * The result returned by `createTestCtx`, containing the test context and event recorders.
 * Uses unified emit (no separate signal). The `emitted` array captures all events.
 * @example
 * ```ts
 * const result: TestContextResult = createTestCtx();
 * result.context.emit("event", { data: 1 });
 * console.log(result.emitted);
 * ```
 */
type TestContextResult = {
  context: {
    global: Record<string, unknown>;
    config: Record<string, unknown>;
    state: Record<string, unknown>;
    emit: (...arguments_: unknown[]) => unknown;
    getPlugin: (...arguments_: unknown[]) => unknown;
    require: (...arguments_: unknown[]) => unknown;
    has: (...arguments_: unknown[]) => unknown;
  };
  emitted: Array<{ name: string; payload: unknown }>;
};

/**
 * Throws a not-implemented error for a stub function.
 * @param functionName - The name of the stub function that is not yet implemented.
 * @throws {Error} Kernel error format indicating function is not implemented.
 * @example
 * ```ts
 * notImplemented("createTestCtx");
 * // throws: [moku_core] createTestCtx is not yet implemented.
 * ```
 */
const notImplemented = (functionName: string): never => {
  throw new Error(
    `[moku_core] ${functionName} is not yet implemented.\n  This is a stub from the skeleton phase.`
  );
};

/**
 * Creates a test context for unit testing plugins and components.
 * In the skeleton phase, this function throws a "not yet implemented" error.
 * @param _options - Optional configuration for the test context (unused in stub).
 * @returns A test context result with context and emitted.
 * @example
 * ```ts
 * const { context, emitted } = createTestCtx({ config: { debug: true } });
 * ```
 */
// eslint-disable-next-line unicorn/prevent-abbreviations
export function createTestCtx(_options?: TestContextOptions): TestContextResult {
  return notImplemented("createTestCtx");
}
