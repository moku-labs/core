# Env

Environment detection: development, production, CI.

**Tier:** Nano

## Config

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `nodeEnv` | `string` | `"development"` | Current Node environment string |
| `isCI` | `boolean` | `false` | Whether running in a CI environment |

## API

### `isDev(): boolean`
Check if environment is development (`nodeEnv === "development"`).

### `isProd(): boolean`
Check if environment is production (`nodeEnv === "production"`).

### `isCI(): boolean`
Check if running in a CI environment.

## Events

None.

## Dependencies

None.

## Usage

```typescript
const app = await createApp({
  pluginConfigs: { env: { nodeEnv: "production", isCI: true } },
});

app.env.isDev();  // false
app.env.isProd(); // true
app.env.isCI();   // true
```
