# Analytics

Event tracking with pluggable provider backends and automatic page view tracking.

**Tier:** Complex

## Config

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `provider` | `"console" \| "memory"` | `"memory"` | Analytics provider backend |
| `sampleRate` | `number` | `1` | Sampling rate between 0 and 1 |
| `trackingId` | `string` | `""` | Tracking identifier (required) |

## API

### `track(event: string, properties?: Record<string, unknown>): TrackedEvent | undefined`
Track an event. Returns the tracked event or `undefined` if filtered by sample rate.

### `identify(userId: string): void`
Associate subsequent events with a user.

### `getEvents(): readonly TrackedEvent[]`
Get all tracked events.

### `getUserId(): string | undefined`
Get the current identified user.

### `getEventCount(): number`
Get the total number of tracked events.

### `flush(): void`
Flush the provider's event buffer.

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `analytics:track` | `{ event: string; properties: Record<string, unknown> }` | Emitted when an event is tracked |
| `analytics:identify` | `{ userId: string }` | Emitted when a user is identified |

## Dependencies

- `router` — listens to `router:navigate` for automatic page view tracking

## Providers

- **memory** — stores events in memory (useful for testing)
- **console** — logs events to the console

## Usage

```typescript
const app = await createApp({
  pluginConfigs: {
    analytics: { trackingId: "G-XXXXX", provider: "memory", sampleRate: 1 },
  },
});

app.analytics.track("click", { button: "submit" });
app.analytics.identify("user-42");
app.analytics.getEvents();    // [{ event: "click", ... }]
app.analytics.getEventCount(); // 1
app.analytics.flush();
```
