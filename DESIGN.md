# Pihanga Core — Design Document

This document describes the internal architecture of `@pihanga2/core`, with a focus on the
**card registry** and the **Redux/reducer pipeline**. It is intended for library contributors
and developers who want a deep understanding of how the runtime works.

---

## 1. High-Level Architecture

Pihanga is a declarative, card-based UI framework layered on top of React and Redux Toolkit.
The central idea is **late binding**: a parent component never hard-codes its children. Instead
it holds a *named slot*, and the actual component that fills that slot is looked up in a global
registry at render time. Changing one field in the Redux store can therefore swap out an entire
sub-tree of the UI with no component-level code changes.

```mermaid
flowchart TD
    App["Application\n(app.pihanga.ts)"]
    Start["start()"]
    Store["Redux Store\n(configureStore)"]
    Reducer["Custom Reducer\n(createReducer)"]
    Registry["Card Registry\n(cardTypes / cardMappings)"]
    Root["<RootComponent>\n→ <Provider> → <Card cardName='_window'>"]
    CardComp["<Card>\nRuntime name resolution"]
    React["React Component\n(rendered)"]

    App -->|"inits[]"| Start
    Start --> Store
    Start --> Reducer
    Start -->|"register.card / register.cardComponent"| Registry
    Start --> Root
    Root -->|"useSelector → props"| CardComp
    CardComp -->|"cardMappings lookup"| Registry
    Registry --> React
    React -->|"dispatch action"| Store
    Store -->|"Immer draft"| Reducer
    Reducer -->|"new state"| Store
    Store -->|"state change"| CardComp
```

---

## 2. Bootstrap Sequence (`start`)

`start(initialState, inits, props)` in `src/index.ts` is the sole entry point. It:

1. Merges `DEFAULT_REDUX_STATE` with the caller-supplied initial state and seeds the route from
   the browser URL via `currentRoute()`.
2. Calls `createReducer(state, dispatcherW)` to produce a `[reducer, piReducer]` pair. The
   `dispatcherW` wrapper is a forward reference; it is wired to `store.dispatch` after the Redux
   store is created.
3. Calls `configureStore({ reducer, preloadedState })` (Redux Toolkit). The `piReducer` handle
   is stored on the store object (`store.piReducer`) so card components can reach it via
   `useStore()`.
4. Builds a `PiRegister` object — the single surface through which all registration happens
   (cards, card components, meta-cards, reducers, REST helpers).
5. Calls each `init` function in `inits[]` with the `PiRegister`, then flushes the
   `pendingRegistrations` buffer (callbacks that were queued before `start()` ran via the
   top-level `register()` helper).
6. Dispatches `ON_INIT_ACTION` so the router and any one-shot initialisation reducers fire.
7. Renders `<RootComponent>` — a React `<Provider>` wrapping a single `<Card cardName="_window">`.

```mermaid
sequenceDiagram
    participant App
    participant start
    participant createReducer
    participant configureStore
    participant PiRegister
    participant DOM

    App->>start: start(initialState, [init1, init2])
    start->>createReducer: (state, dispatcherW)
    createReducer-->>start: [reducer, piReducer]
    start->>configureStore: {reducer, preloadedState}
    configureStore-->>start: store
    start->>start: store.piReducer = piReducer
    start->>PiRegister: build register object
    start->>App: inits.forEach(f => f(register))
    start->>store: dispatch(ON_INIT_ACTION)
    start->>DOM: ReactDOM.createRoot → render(<RootComponent>)
```

---

## 3. Cards

### 3.1 Two-Level Registry

The card system maintains two distinct lookup tables, both plain module-level objects in
`src/register_cards.ts`:

| Table | Key | Value | Purpose |
|---|---|---|---|
| `cardTypes` | Card type string (e.g. `"my/counter"`) | `PiRegisterComponent` | Maps a type name to its React component + event map |
| `cardMappings` | Card instance name (e.g. `"page/counter"`) | `Mapping` | Maps a named instance to its resolved props, event handlers, and the card type it uses |

```mermaid
classDiagram
    class PiRegisterComponent {
        +name: string
        +component: ReactComponent
        +events: Record~string,string~
    }
    class Mapping {
        +cardType: string
        +props: Record~string,unknown~
        +eventMappers: Record~string,Function~
        +cardEvents: Record~string,string~
        +parameters: PiCardDef
    }
    class PiCardDef {
        +cardType: string
        +[prop]: value | StateMapper
    }

    PiRegisterComponent "1" --o "many" Mapping : cardType lookup
    PiCardDef "1" --> "1" Mapping : resolved into
```

### 3.2 Registering a Card Component (Type)

`registerCardComponent({ name, component, events })` calls `addCardComponent()` which stores
the entry in `cardTypes`. This can safely be called at module load time because it is buffered
until `start()` runs via the `register()` helper.

The `events` map is produced by `actionTypesToEvents(registerActions(...))`:
- `registerActions("my/counter", ["increment", "reset"])` → `{ INCREMENT: "my/counter/increment", RESET: "my/counter/reset" }`
- `actionTypesToEvents(...)` → `{ onIncrement: "my/counter/increment", onReset: "my/counter/reset" }`

This two-step translation produces the `onXxx` prop names that appear on `PiCardProps<P, E>`.

### 3.3 Registering a Card Instance

`register.card("page/counter", CounterCard({ count: 0, ... }))` calls `_registerCard`, which
calls `_createCardMapping`. This function iterates over every key in the `PiCardDef` parameters:

- **`cardType`** — skipped; used only for the type lookup.
- **Nested `PiCardDef` objects** — recursively registered as child cards under
  `"parentName/propKey"` (enabling anonymous inline card definitions).
- **`on…` event handler functions** — passed to `processEventParameter`, which calls
  `registerReducer(actionType, wrappedHandler, ...)`. The wrapper checks `action.cardID === cardName`
  so each card's handler fires only for its own events.
- **`on…Mapper` functions** — stored in `eventMappers` for client-side action transformation
  before dispatch.
- **Everything else** — stored verbatim in `props` (either a static value or a `StateMapper`
  function).

### 3.4 The `<Card>` Component and Rendering Pipeline

`<Card cardName="page/counter" parentCard="page" />` is the universal renderer in `src/card.tsx`.

```mermaid
flowchart LR
    A["<Card cardName=…>"]
    B{string or PiCardDef?}
    C["checkForAnonymousCard\n(generate name, register)"]
    D["getCardInfo\nlook up cardMappings + cardTypes"]
    E["GenericCard"]
    F["useSelector\ngetCardProps → resolve StateMappers"]
    G["appendEventHandlers\nbind dispatch closures"]
    H["React.createElement\n(component, resolvedProps)"]

    A --> B
    B -->|"string"| D
    B -->|"PiCardDef"| C --> D
    D --> E
    E --> F --> G --> H
```

**`getCardProps`** (called inside `useSelector`) iterates over the `Mapping.props` entries. For
each value:
- If it is a `StateMapper` function `(state, context) => T`, it is called with the current Redux
  state.
- If it is a static value but the parent also passed the same key as a context prop, the context
  prop wins (allowing parent-override of defaults).

The result is memoised by React/Redux through `useSelector`'s equality check (`propEq` using
`deep-equal`). A re-render is triggered only when the resolved props actually change.

**`appendEventHandlers`** wires the `events` map from the card type definition. For each
`onXxx` → `actionType` pair, it creates a closure that sets `action.type = actionType` and
`action.cardID = cardName` before dispatching — providing the `cardID` that the reducer wrapper
checks to scope the handler to the right card instance.

### 3.5 Anonymous / Inline Cards

When a `PiCardDef` object (not a string) is passed as `cardName`, `checkForAnonymousCard`
derives the registry name, calls `_registerCard` or `_updateCardMapping` as needed, and records
the root in `anonRoots`. This lets card declarations be written inline inside a parent card's
`content` prop without a separate named registration call.

**Naming rules.** The base name and instance suffix are chosen as follows:

| Definition | `cardKey` | Registry name |
|---|---|---|
| `_cardName: "x"` | no | `${parentCard}/x` |
| `_cardName: "x"` | yes | `${parentCard}/x#${cardKey}` |
| no `_cardName` | no | `${parentCard}/${type}#${useId()}` |
| no `_cardName` | yes | `${parentCard}/${type}#${cardKey}` |

- A `_cardName` is developer-chosen, so it needs no per-instance id. Uniqueness is the developer's
  responsibility, the same as for named registrations.
- A `cardKey` distinguishes siblings that share a name and is stable across renders, so it is the
  whole suffix. It is never combined with the `useId()` value.
- Generated names without a `cardKey` use `useId()`. The id differs between a discarded StrictMode
  render and the committed one, which is why the orphan sweep needs it.
- `_cardName` and `cardType` are structural keys: they are skipped when building props, so they never
  reach the component.

**Tracking and orphan sweep.** `anonRoots` is a `Map` from each anonymous root name to the
`{ parent, type }` it was registered under. It does not parse names, so the naming rules above can
change without affecting the sweep. `confirmedAnonCards` holds names whose effect has committed.
When a card's effect runs, it removes every unconfirmed root with the same parent and type, then
registers itself. Nested child mappings are removed together with their root by `removeCardMapping`.

**Known limitations of the sweep.** The current policy deliberately errs towards keeping orphans
rather than deleting live entries. The sweep can still over-delete in the cases below. These are
accepted for now and will be revisited if they cause problems in practice.

- **Unconfirmed live siblings can be removed.** A sibling with the same parent and type whose
  effect has not yet run is treated as an orphan. It is removed, and it is restored only when its own
  effect runs. A render in that window may show the unknown-card error.
- **Explicit `_cardName` instances share one mapping.** Two instances with the same `_cardName`
  under the same parent share a single entry. Unmounting one of them removes the entry the other
  still renders from.
- **Orphan roots can persist.** A root left by a discarded render stays in `anonRoots` and
  `cardMappings` until a sweep under the same parent and type runs. If that parent and type never
  mount again, the entries remain.
- **Counts include child mappings.** `getCardCount()` counts nested child mappings as well as
  top-level cards, so it overstates the number of cards an application declared.

The query functions in section 3.5a are the intended way to monitor these effects before the policy
is changed.

```mermaid
flowchart TD
    R["render: checkForAnonymousCard"] --> A["anonRoots.set(name, {parent, type})"]
    A --> M{"mapping exists?"}
    M -- no --> N["_registerCard"]
    M -- yes --> U{"props changed?"}
    U -- yes --> P["_updateCardMapping"]
    E["effect commits"] --> C["confirmedAnonCards.add(name)"]
    C --> S["for each root with same parent+type,<br/>not confirmed, not self"]
    S --> X["removeCardMapping(root), anonRoots.delete(root)"]
    E --> Q{"mapping missing?"}
    Q -- yes --> N2["re-register"]
    D["unmount cleanup"] --> Z["confirmed.delete, anonRoots.delete, removeCardMapping(name)"]
```

### 3.5a Querying the Registry

Two read-only functions in `src/register_cards.ts` report what the registry currently holds, and
are exported from the package entry point:

- `getCardCount(): number` — the number of entries in `cardMappings`, including named cards,
  anonymous roots and nested child mappings.
- `getCardNames(): string[]` — the keys of `cardMappings`. Props, event mappers and parameters are
  not returned.

These describe the registry at the time of the call. They are not reactive; read them from an
effect or on demand rather than during render.

### 3.6 State Mappers and `memo`

Any prop value in a `PiCardDef` can be a `StateMapper<T, S>`:

```ts
type StateMapper<T, S extends ReduxState, C = PiDefCtxtProps> =
  (state: S, context: StateMapperContext<C>) => T;
```

Because state mappers are called on every `useSelector` invocation, allocating a new object or
array every time causes unnecessary re-renders. `memo(filterF, mapperF)` in
`src/register_cards.ts` solves this:

1. It closes over `lastFilter` and `lastValue` maps (keyed by `context.cardKey`).
2. On each call it runs `filterF(state)` and compares the result with the previous call using
   `deep-equal`.
3. Only if the filtered slice has changed does it invoke `mapperF` to compute the new value.

### 3.7 Meta-Cards

A **meta-card** is a higher-order card type that *expands* a single `PiCardDef` into a tree of
registered child cards. It is registered with `register.metaCard({ type, mapper, events })`.
When `_registerCard` encounters an unknown card type, it checks `metacardTypes` before giving up.
The `mapper(metaName, parameters, registerCard)` function receives a `registerCard` helper that
automatically namespaces child names under `metaName/…` and delegates back to `_registerCard`.
This allows complex compound widgets to be expressed as a single declarative call site.

---

## 4. Redux and Reducers

### 4.1 `createReducer`

`createReducer(initialState, dispatcher)` in `src/reducer.ts` returns a standard Redux
`[reducer, piReducer]` pair.

Internally it maintains a `mappings` object:

```ts
const mappings: { [actionType: string]: ReducerDef[] } = {}
```

Each `ReducerDef` holds:
- `mapperMulti` — a persistent reducer (stays registered until explicitly cancelled)
- `mapperOnce` — a one-shot reducer (automatically removed after its first successful run)
- `priority` — execution order within the same action type
- `key` — a stable string identifier used for deduplication and cancellation
- `targetMapper` — original user handler (used by the card-scoping wrapper to identify replacements)

### 4.2 The Redux Reducer Function

The inner `reducer(state, action)` function runs on every Redux dispatch. It:

1. Looks up `mappings[action.type]` and `mappings["*"]` (wildcard).
2. If there are no registered handlers, returns the state unchanged — except that it clears
   `state.pihanga.reducers` if it is non-empty (housekeeping).
3. Wraps state mutation in an **Immer** `produce()` call, so handlers can either mutate the
   draft or return a new object.
4. Calls `_reduce()` for each handler list. `_reduce` runs each `ReducerDef` in order,
   automatically removing one-shot reducers when their `mapperOnce` returns `true`.
5. Writes the list of executed reducer keys to `state.pihanga.reducers` for debugging.

```mermaid
flowchart TD
    D["Redux dispatch(action)"]
    L["Look up mappings[type] + mappings['*']"]
    N{Any handlers?}
    P["produce(state, draft => ...)"]
    R["_reduce: run each ReducerDef in priority order"]
    OS{mapperOnce?}
    RM["Remove from mappings\n(one-shot consumed)"]
    K["Keep in mappings"]
    NS["Return nextState"]

    D --> L --> N
    N -->|"no"| NS
    N -->|"yes"| P --> R
    R --> OS
    OS -->|"returned true"| RM
    OS -->|"returned false / mapperMulti"| K
    R --> NS
```

### 4.3 Reducer Registration and Priorities

`piReducer.register(eventType, mapper, priority, key)` calls `addReducer`, which:

1. Removes any existing entry with the same `key` (idempotent re-registration).
2. Pushes the new `ReducerDef` and sorts the array by descending priority.
3. Captures the call-site stack frame via `stacktrace-js` to populate `key` automatically when
   none is provided (aids debugging).
4. Returns a cancel function `() => removeReducer(key, mappings[eventType])`.

Default priority is `0`. Higher numbers run first. This allows card event handlers (registered
at priority `0`) to be overridden by framework-level handlers at higher priorities.

### 4.4 Inline Event-Handler Scoping

When `processEventParameter` registers a reducer for an `onXxx` prop, it wraps the user handler:

```ts
registerReducer(actionType, (state, action, dispatch, opts) => {
  if ((action as CardAction).cardID === cardName) {
    userHandler(state, action, dispatch, opts);
  }
}, 0, `on card ${cardName} for ${propName}`, userHandler);
```

The `cardID === cardName` check ensures that two card instances of the same type each respond
only to their own events, even though both are registered under the same Redux action type.

### 4.5 `dispatchPipe` — Async Request/Reply

`dispatchPipe` (available as `opts.dispatchPipe` inside any reducer) implements a correlated
request/reply pattern without sagas or thunks:

```mermaid
sequenceDiagram
    participant Reducer
    participant dispatchPipe
    participant ReduxBus
    participant ReplyProducer

    Reducer->>dispatchPipe: request + replyType + handlers
    dispatchPipe->>dispatchPipe: register one-shot reply handler (key)
    dispatchPipe->>dispatchPipe: set timeout timer
    dispatchPipe->>ReduxBus: setTimeout → dispatch(request)
    ReplyProducer->>ReduxBus: dispatch(replyAction)
    ReduxBus->>dispatchPipe: reply handler fires
    dispatchPipe->>dispatchPipe: cleanup (cancel other handlers, clear timer)
    dispatchPipe->>Reducer: onReply(state, replyAction, ...)
```

Key properties:
- The request is dispatched asynchronously (`setTimeout 0`) so the current reducer tick
  completes before the outgoing action is processed.
- Both the reply and error handlers are registered with explicit `key` strings so they can be
  cancelled when the pipe settles or times out.
- If `timeoutMs` elapses, a synthetic `pi/dispatchPipe/timeout` action is dispatched, which
  triggers the `onTimeout` handler and cleans up all remaining handlers.

### 4.6 `RegisterCardState` — Debug Slice

`RegisterCardState` in `src/card.tsx` mirrors card activity into the Redux state tree for Redux
DevTools inspection. The level is chosen at `start()`:

| Level | `state.pihanga.cards` | `state.pihanga.cardDetails` |
|---|---|---|
| `false` | not written | not written |
| `'names'` (default) | names of cards that changed | not written |
| `'props'` | names of cards that changed | serialisable props per changed card |
| `'diff'` | names of cards that changed | props plus `{ from, to }` for each changed prop |

- Set the level with `cardTracking`. The legacy `debugCardState` flag maps to `'props'` when
  `cardTracking` is not given.
- Change detection runs in a `useEffect` in `GenericCardComponent`, after every render. It compares
  the current props reference with the previous one, so it does not depend on `propEq`.
- Each change schedules a `pi/card/update_state` action after a debounce. The default debounce is
  1000 ms, configurable with `cardTrackingDebounceMs`. The timer only fires when there are pending
  changes.
- The built-in `UPDATE_STATE_ACTION` reducer is registered in `mappings` for every level. It copies
  the pending changed names into `pihanga.cards`, and for `'props'` and `'diff'` writes the
  snapshots into `pihanga.cardDetails`. Props are copied through a safe-copy step, and `cardName`
  and `cardKey` are removed from the snapshot since they are redundant as keys.
- `'props'` and `'diff'` add work on every card render, so they should be enabled only while
  inspecting the DevTools card view.

---

## 5. Action Namespacing

```mermaid
flowchart LR
    NS["registerActions('my/counter', ['increment', 'reset'])"]
    AT["{ INCREMENT: 'my/counter/increment',\n  RESET: 'my/counter/reset' }"]
    ET["actionTypesToEvents(AT)\n{ onIncrement: 'my/counter/increment',\n  onReset: 'my/counter/reset' }"]
    RC["registerCardComponent({ name, component, events: ET })"]
    RP["processEventParameter\nregisters reducer under 'my/counter/increment'"]

    NS --> AT --> ET --> RC --> RP
```

`registerActions` prevents namespace collisions by warning on overwrite and stores a
`ns2Actions` guard. The `UPPER_CASE` → `onCamelCase` transformation in `actionTypesToEvents`
is purely cosmetic — it exists so the event names on `PiCardProps<P, E>` follow React
conventions (`onClick`, `onChange`, …).

---

## 6. Key Design Decisions

| Decision | Rationale |
|---|---|
| **Late binding via name strings** | Decouples layout declaration from component implementation. Pages can be re-wired by changing a single state field. |
| **Immer inside the reducer** | Allows both mutation syntax and return-new-object syntax in handlers, matching Redux Toolkit conventions. |
| **`cardID` scoping on actions** | Multiple instances of the same card type can coexist without needing separate action types. |
| **Registration buffering (`pendingRegistrations`)** | Card library modules can safely call `registerCardComponent()` at import time, before `start()` runs. |
| **Priority-ordered reducers** | Framework-level concerns (auth, routing) can pre-empt or post-process card-level handlers without modifying card code. |
| **`dispatchPipe` instead of thunks/sagas** | Keeps async coordination inside pure reducer functions, without introducing middleware or generators. |
| **`memo` as a first-class primitive** | Prevents unnecessary re-renders caused by derived values (new arrays/objects) being recomputed on every selector call. |
| **`state.pihanga.cards` debug slice** | Makes the current resolved props of every visible card inspectable in Redux DevTools without any additional instrumentation. |
