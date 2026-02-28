export interface AnalyticsProvider {
  name: string;
  track(event: string, properties: Record<string, unknown>): void;
  identify(userId: string): void;
  flush(): void;
}
