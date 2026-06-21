# Glossary

**Card**
: A self-contained UI unit in Pihanga. A card has a *type* (a string ID), *props* (configuration),
and *events* (user interactions). Cards are rendered by name from the global registry.

**Card instance**
: A concrete, named card registered in the Redux state via `r.card("name", CardFactory({...}))`.
Its name is used by `<Card name="..."/>` to look up and render the correct component.

**Card type**
: A string identifier (e.g. `"my/counter"`) that maps to a registered React component.
Created with `createCardDeclaration`.

**`PiRegister`**
: The registration handle passed to callbacks inside `register()`. Provides methods to
register card instances, card components, REST handlers, and reducers.

**`PiReducer`**
: The Redux reducer handle exposed via `PiRegister.reducer`. Used to register action handlers
and dispatch actions.

**`register()`**
: A buffer function that queues registration callbacks before `start()` creates the Redux store.
Safe to call from module-level code.

**`registerCardComponent()`**
: Registers a React component for a card type. Must be called before `start()` renders.

**`start()`**
: Bootstraps the Pihanga application — creates the Redux store, sets up routing, and mounts
React into the DOM. Called once per application.

**`usePiReducer`**
: A React hook that registers a Redux reducer scoped to the lifetime of the component.
Automatically cancels when the component unmounts.

**`createOnAction`**
: Registers a module-level Redux reducer (outside any component). Equivalent to
`r.reducer.register(...)` but callable anywhere.

**`showPage`**
: An action creator that dispatches a navigation event, changing the current route.

**`onShowPage`**
: Registers a handler that fires when the router matches a specific path.

**dispatchPipe**
: A utility in `ReduceOpts` that wraps async Redux round-trips (request → reply)
with automatic timeout and cleanup.

**`_id` / `_replyTo`**
: Auto-generated fields on `ReduxAction`. `_id` is the correlation ID of a dispatched action;
`_replyTo` is set on reply actions to link them back to their request.
