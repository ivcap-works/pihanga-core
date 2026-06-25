# API Reference Overview

All public exports are available from `@pihanga2/core`.

## Core functions

| Function | Description |
|---|---|
| [`start()`](start.md) | Bootstrap the Pihanga app — creates Redux store, mounts React |
| [`register()`](register.md) | Buffer card/REST registrations before `start()` |
| [`registerCard(name, def)`](register.md) | Register a named card instance (standalone helper) |
| [`registerCardComponent(decl)`](register.md) | Register a React component for a card type |
| [`registerFramework(def)`](register.md) | Register the top-level window/framework card |

## Card helpers

| Export | Description |
|---|---|
| `createCardDeclaration<P, E>(name)` | Create a typed card factory function |
| `actionTypesToEvents<E>(cardName)` | Map event names → Redux action type strings |
| `registerActions(ns, names)` | Register a set of Redux action type strings for a namespace |
| `<Card name="..." />` | Render a registered card instance by name |
| `usePiReducer<S>(actionTypes, reducer)` | Register a Redux reducer from inside a component (auto-cancels on unmount) |
| `memo(selector, transform)` | Memoize a derived state value — `transform` only reruns when `selector` result changes |
| `isCardRef(value)` | Type-guard: returns `true` if `value` is a valid `PiCardRef` |

## Routing

| Export | Signature | Description |
|---|---|---|
| `showPage` | `(dispatch, path: string[], query?) => void` | Navigate to a path |
| `onShowPage` | `(register, handler) => void` | Register a reducer that fires on every `SHOW_PAGE` action |
| `onInit` | `(register, handler) => void` | Register a one-time startup handler |
| `onNavigateToPage` | `(register, handler) => void` | Register a handler for every navigation event |
| `createShowPageAction` | `(path, query?) => ReduxAction` | Create a `SHOW_PAGE` action without dispatching |

!!! note "Handler signature"
    All routing handlers follow the standard reducer signature:
    `(state: S, action, dispatch) => S`
    — **not** `(action, state, dispatch)`.

## Utilities

| Export | Description |
|---|---|
| `createOnAction<E>(actionType)` | Returns a `(register, handler) => void` registration helper for the given action type |
| `getLogger(name)` | Get a named tslog logger |
| `cls_f(...classes)` | CSS class name helper |
| `uuidv7()` | Generate a UUIDv7 string |

!!! note "`createOnAction` usage"
    `createOnAction(type)` takes **one** argument and **returns** a registration function.
    Call the result with `(register, handler)` to register the reducer:

    ```ts
    const onMyAction = createOnAction<MyEvent>("MY/ACTION");
    // inside an init function:
    onMyAction<AppState>(register, (state, action) => { ...; return state; });
    ```

## REST helpers

Registered via `PiRegister` (the argument passed to `start()` init functions, or via `register()`):

| Method | Description |
|---|---|
| `register.GET(props)` | Register an HTTP GET handler |
| `register.POST(props)` | Register an HTTP POST handler |
| `register.PUT(props)` | Register an HTTP PUT handler |
| `register.PATCH(props)` | Register an HTTP PATCH handler |
| `register.DELETE(props)` | Register an HTTP DELETE handler |

See the [REST API guide](../guides/rest-api.md) for usage details.

## TypeScript types

See [TypeScript Types](types.md) for the key interfaces and type aliases.
