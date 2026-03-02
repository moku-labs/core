# Router

Client-side routing with navigation guards and history tracking.

**Tier:** Standard

## Config

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `basePath` | `string` | `"/"` | Base path prefix for all routes |
| `notFoundPath` | `string` | `"/404"` | Redirect path when no route matches |

## API

### `navigate(path: string): NavigationResult`
Navigate to a path. Returns `{ from, to, blocked }`. Blocked if any guard returns `false`.

### `current(): string`
Get the current path.

### `back(): string | undefined`
Navigate to the previous path. Returns the path navigated to, or `undefined` if history is empty.

### `addGuard(guard: NavigationGuard): void`
Add a navigation guard. Guards receive `(to, from)` and return `boolean`.

### `getHistory(): readonly string[]`
Get the navigation history stack.

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `router:navigate` | `{ from: string; to: string }` | Emitted after a successful navigation |
| `router:not-found` | `{ path: string }` | Emitted when a route is not found |

## Dependencies

None.

## Hooks

Listens to `app:error` — redirects to `notFoundPath` on error code 404.

## Usage

```typescript
const app = createApp({
  pluginConfigs: { router: { basePath: "/app", notFoundPath: "/404" } },
});

// Navigate
const result = app.router.navigate("/about");
if (result.blocked) console.log("Navigation was blocked");

// Guards
app.router.addGuard((to) => to !== "/admin" || isLoggedIn());

// History
app.router.back();
app.router.getHistory(); // ["/", "/about"]
```
