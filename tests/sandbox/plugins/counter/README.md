# Counter

Simple counter with configurable initial value and step size.

**Tier:** Micro

## Config

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `initial` | `number` | `0` | Starting value for the counter |
| `step` | `number` | `1` | Increment/decrement amount |

## API

### `increment(): void`
Increase the counter by `step`.

### `decrement(): void`
Decrease the counter by `step`.

### `value(): number`
Get the current counter value.

### `reset(): void`
Reset the counter to `initial`.

## Events

None.

## Dependencies

None.

## Usage

```typescript
const app = await createApp({
  pluginConfigs: { counter: { initial: 10, step: 5 } },
});

app.counter.increment(); // 15
app.counter.value();     // 15
app.counter.decrement(); // 10
app.counter.reset();     // 10
```
