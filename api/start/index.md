# start()

Bootstrap the Pihanga application. Creates the Redux store, sets up routing, and mounts React.

!!! warning "Call once"
    `start()` should be called exactly once per application. Calling it a second time
    creates a second Redux store. Use `register()` for all card/REST registrations.

## Signature

```ts
function start(
  initialState: ReduxState,
  initFns?: Array<(r: PiRegister) => void>,
  props?: StartProps,
): void;
```

## Parameters

### `initialState`

The initial Redux state object. Must be a plain serialisable object.

```ts
start({
  app: { title: "My App", isLoading: false },
  user: { name: null },
});
```

### `initFns` (optional)

An array of registration callbacks. Each receives a `PiRegister` handle. These callbacks are
flushed after the store is created, in order.

```ts
start(initialState, [myInit, anotherInit]);
```

### `props` (optional)

```ts
type StartProps = {
  /** Target DOM element (default: document.getElementById("root")) */
  rootElement?: HTMLElement;

  /** Use HTML5 history API instead of hash routing (default: false) */
  historyMode?: boolean;

  /** Suppress Redux serializable-check warnings for specific paths */
  ignoredActionPaths?: string[];
  ignoredStatePaths?: string[];
};
```

## Example

```ts title="src/main.ts"
import { start } from "@pihanga2/core";
import { coreInit } from "./core.pihanga";
import { dashboardInit } from "./dashboard/dashboard.pihanga";

start(
  {
    app: { title: "Dashboard", currentPage: "/" },
    dashboard: { items: [] },
  },
  [coreInit, dashboardInit],
  {
    historyMode: true,
    ignoredStatePaths: ["app.someNonSerializable"],
  },
);
```
