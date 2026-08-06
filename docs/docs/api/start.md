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
): PiRegister;
```

## Parameters

### `initialState`

The initial Redux state object. Must be a plain serialisable object that extends `ReduxState`.
Use `DEFAULT_REDUX_STATE` to seed the required framework slices:

```ts
import { start, DEFAULT_REDUX_STATE } from "@pihanga2/core";

start({
  ...DEFAULT_REDUX_STATE,
  count: 0,
  user: null,
});
```

### `initFns` (optional)

An array of registration callbacks. Each receives a `PiRegister` handle. Callbacks are
flushed after the store is created, in order.

```ts
start(initialState, [cardLibInit, appInit]);
```

### `props` (optional)

Full reference for all `StartProps` options:

#### Card change tracking

| Option | Type | Default | Purpose |
|---|---|---|---|
| `cardTracking` | `false \| 'names' \| 'props' \| 'diff'` | `'names'` | How much detail to capture about cards whose props changed |
| `cardTrackingDebounceMs` | `number` | `1000` | Milliseconds to wait before dispatching `pi/card/update_state` |

After a Redux cycle causes cards to re-render, Pihanga dispatches a `pi/card/update_state`
action that writes the card change summary into `state.pihanga`.  Because React re-renders
happen asynchronously after the reducer runs, this is always a **separate** action — card
change info cannot be injected into the action that caused it.

**`cardTracking` levels:**

| Level | `pihanga.cards` | `pihanga.cardDetails` |
|---|---|---|
| `false` | not written | not written |
| `'names'` *(default)* | `string[]` of changed card names | — |
| `'props'` | `string[]` of changed card names | `{ [cardName]: { [prop]: value, … } }` |
| `'diff'` | `string[]` of changed card names | `{ [cardName]: { props: {…}, changed: { [prop]: { from, to } } } }` |

`'props'` and `'diff'` add a `produce()` pass on every card render — use only when
you need the Redux DevTools detailed card view.

```ts
// minimal dev setup — see changed cards almost immediately
start(initState, [appInit], {
  cardTracking: 'diff',
  cardTrackingDebounceMs: 0,
})

// production default — batched, lightweight
start(initState, [appInit])                        // cardTracking: 'names', debounce: 1000ms
```

#### Routing

| Option | Type | Default | Purpose |
|---|---|---|---|
| `routeQueryParam` | `string` | — | Serialise the route into a query parameter instead of the URL path (useful for GitHub Pages / static hosts) |

#### Redux serializable-check tuning

| Option | Type | Default | Purpose |
|---|---|---|---|
| `disableSerializableStateCheck` | `boolean` | `false` | Disable RTK's state serializable check entirely |
| `disableSerializableActionCheck` | `boolean` | `false` | Disable RTK's action serializable check entirely |
| `ignoredActions` | `string[]` | `[]` | Action type strings exempt from the serializable check |
| `ignoredActionPaths` | `string[]` | `[]` | Dot-notation paths inside action payloads to ignore |
| `ignoredStatePaths` | `string[]` | `[]` | Dot-notation paths inside the Redux state to ignore |
| `isSerializable` | `(v: unknown) => boolean` | RTK default | Custom predicate for the serializable check |

#### Rendering

| Option | Type | Default | Purpose |
|---|---|---|---|
| `rootComponent` | `(store: Store) => JSX.Element` | — | Override the root React component (replaces the default `<Provider>` wrapper) |

## Example

```ts title="src/main.ts"
import { start, DEFAULT_REDUX_STATE } from "@pihanga2/core";
import { init as cardLibInit } from "@pihanga2/shadcn";
import { appInit } from "./app.pihanga";
import type { AppState } from "./app.types";

start<AppState>(
  {
    ...DEFAULT_REDUX_STATE,
    activePage: "app/home",
    user: null,
  },
  [cardLibInit, appInit],
  {
    // Show changed card names + diffs in Redux DevTools, updated every second
    cardTracking: "diff",

    // Exempt a non-serialisable action payload field
    ignoredActionPaths: ["payload.fileHandle"],

    // Static-site deployment: encode routes as ?p=items/42
    routeQueryParam: "p",
  },
);
```
