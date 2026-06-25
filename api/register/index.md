# register / registerCard

## `register(callback)`

Buffers a registration callback until `start()` creates the Redux store.
Safe to call from module-level code at any import order.

```ts
import { register } from "@pihanga2/core";

register((r: PiRegister) => {
  r.card("page/home", { cardType: "my/page", title: "Home" });
  r.window({ cardType: "my/framework" });
});
```

The callback receives a `PiRegister` handle with the following methods:

### `r.card(name, props)`

Register a named card instance.

| Param | Type | Description |
|---|---|---|
| `name` | `string` | Unique card instance name in the registry |
| `props` | `PiCardDef` | Card definition (cardType + any typed props) |

### `r.window(props)`

Register the top-level framework card (rendered as `<Card name="_window"/>`).

### `r.GET / r.POST / r.PUT / r.PATCH / r.DELETE`

Register REST handlers. See the [REST API guide](../guides/rest-api.md).

### `r.reducer`

Direct access to the `PiReducer` handle for registering Redux reducers:

```ts
r.reducer.register("MY_ACTION", (state, action) => ({ ...state }));
r.reducer.registerOneShot("ONCE", (state, action) => ({ ...state }));
r.reducer.dispatch({ type: "INIT" });
```

---

## `registerCardComponent(props)`

Register the React component for a card type. Must be called before `start()` renders.

```ts
import { registerCardComponent } from "@pihanga2/core";

registerCardComponent({
  name: "my/counter",          // card type identifier
  component: CounterComponent, // React function component
  events: COUNTER_ACTIONS,     // action type map from actionTypesToEvents()
});
```

| Param | Type | Description |
|---|---|---|
| `name` | `string` | Card type ID (matches `createCardDeclaration` name) |
| `component` | `React.FC` | The React component to render |
| `events` | `EventMapper` | Map of event names → Redux action type strings |

---

## `createCardDeclaration<P, E>(name)`

Creates a typed card factory function.

```ts
const CounterCard = createCardDeclaration<CounterProps, CounterEvents>("my/counter");

// Usage (returns a PiCardDef):
const def = CounterCard({ count: 0, label: "Hits" });
```

---

## `actionTypesToEvents<E>(cardName)`

Maps event handler names to Redux action type strings. Used when registering card components.

```ts
// CounterEvents = { onIncrement: { delta: number }; onReset: {} }
const COUNTER_ACTIONS = actionTypesToEvents<CounterEvents>("my/counter");
// → { onIncrement: "my/counter:onIncrement", onReset: "my/counter:onReset" }
```
