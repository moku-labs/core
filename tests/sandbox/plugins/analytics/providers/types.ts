/**
 * Interface for analytics provider adapters.
 * Implement this to add a new analytics backend.
 * @example
 * ```typescript
 * const myProvider: AnalyticsProvider = {
 *   name: "custom",
 *   track: (event, props) => sendToBackend(event, props),
 *   identify: (userId) => setUser(userId),
 *   flush: () => drainQueue(),
 * };
 * ```
 */
export interface AnalyticsProvider {
  name: string;
  track(event: string, properties: Record<string, unknown>): void;
  identify(userId: string): void;
  flush(): void;
}
