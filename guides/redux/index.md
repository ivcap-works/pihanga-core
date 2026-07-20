# Redux & Reducers Guide

Pihanga wraps Redux Toolkit. State updates happen in **reducers** — pure functions that receive
the current state and an action and return a new (or Immer-mutated) state. There are three ways
to register reducers in Pihanga.

---

## Immer recipe contract — always mutate, never spread

!!! warning "Critical: Pihanga reducers are Immer recipes"
    Every reducer in Pihanga (`ReduceF`, `EventHandler`, inline `onXxx` handlers) receives
    an **[Immer](https://immerjs.github.io/immer/) draft proxy** as the `state` argument.

    **Mutate the draft in place. Do not return a spread copy.**

    ```ts
    // ✅ Correct — mutate the draft directly
    onIncrement: (state, { delta }) => {
      state.count += delta;
      // no return needed
    },

    // ❌ Wrong — spread creates a plain object; the return value
    //            is silently discarded by the Immer runtime anyway
    onIncrement: (state, { delta }) => {
      return { ...state, count: state.count + delta };
    },
    ```

    **TypeScript will NOT warn you about this.**
    TypeScript's `void` return type for *callback expressions* is intentionally permissive:
    assigning an arrow function that returns a value to a `void`-typed variable compiles
    without error — this is documented [TypeScript design behaviour][ts-void].
    There is no compile-time or runtime exception; Immer simply discards the returned
    plain object and your state change is **silently lost**.

    The only safeguard is to never use `return { ...state }` in a Pihanga reducer.

    [ts-void]: https://www.typescriptlang.org/docs/handbook/2/functions.html#void

    If you need to read the original (non-draft) state, use `opts.rawState` —
    the fourth argument passed to every `ReduceF`.

---

## 1. Inline event handlers (most common)

The simplest way to react to user events is to attach a reducer directly to the card declaration.
These inline handlers run inside Redux (via Immer), so both mutation and returning a new state work:

```ts title="src/app.pihanga.ts"
register.card(
  "page/counter",
  CounterCard<AppState>({
    count: (s) => s.count,

    onIncrement: (state, { delta }) => {
      state.count += delta;          // Immer mutation — no return needed
    },

    onReset: (state, _event, dispatch) => {
      state.count = 0;
      dispatch({ type: "COUNTER_RESET" });  // optional side-effect
      return state;
    },
  }),
)
```

---

## 2. Module-level reducers — `register.reducer` / `createOnAction`

For cross-cutting logic (auth, routing, analytics), register reducers in an init function.

### Using `register.reducer.register`

```ts title="src/app.reducer.ts"
import { type PiRegister } from "@pihanga2/core";
import type { AppState } from "./app.types";

export function reducerInit(register: PiRegister): void {
  register.reducer.register<AppState>(
    "COUNTER/INCREMENT",
    (state, action) => {
      state.count += action.delta;
      return state;
    },
  );
}
```

### Using `createOnAction`

`createOnAction("ACTION_TYPE")` **returns a registration function** — you must call it with a
`PiRegister` to actually register the reducer:

```ts title="src/feature.pihanga.ts"
import { createOnAction, type PiRegister } from "@pihanga2/core";
import type { AppState } from "./app.types";

// Step 1 — create the registration helper (once, at module level)
const onCounterIncrement = createOnAction<{ delta: number }>("COUNTER/INCREMENT");

// Step 2 — register it inside an init function
export function init(register: PiRegister): void {
  onCounterIncrement<AppState>(register, (state, action) => {
    state.count += action.delta;
    return state;
  });
}
```

!!! warning "Common mistake"
    `createOnAction` is **not** a direct registration call. It creates a *helper function*
    for a specific action type. You must invoke the returned function with a `PiRegister`:

    ```ts
    // ❌ Wrong — createOnAction takes only one argument
    createOnAction<AppState>("COUNTER/INCREMENT", (state) => state);

    // ✅ Correct — call the returned function with (register, handler)
    const onIncrement = createOnAction<IncrEvent>("COUNTER/INCREMENT");
    onIncrement<AppState>(register, (state, action) => { ... });
    ```

---

## 3. Inside a component — `usePiReducer`

Use the `usePiReducer` hook to react to Redux actions from within a card component.
The reducer is automatically unregistered when the component unmounts:

```tsx title="src/cards/counter/counter.component.tsx"
import { usePiReducer, type PiCardProps } from "@pihanga2/core";
import { COUNTER_ACTIONS, type CounterProps, type CounterEvents } from "./counter.types";

function CounterComponent(props: PiCardProps<CounterProps, CounterEvents>) {
  usePiReducer<AppState>(
    [COUNTER_ACTIONS.INCREMENT],
    (state, action) => {
      state.count += action.delta;
      return state;
    },
  );

  return <div>{props.count}</div>;
}
```

---

## Reducer priorities

Multiple reducers registered for the same action type run in **descending priority order**
(higher number = called first). The default priority is `0`:

```ts
register.reducer.register("MY_ACTION", firstHandler,  10);  // called first
register.reducer.register("MY_ACTION", secondHandler,  0);  // called second (default)
register.reducer.register("MY_ACTION", thirdHandler,  -5);  // called last
```

---

## One-shot reducers

A one-shot reducer runs exactly once, then unregisters itself:

```ts
register.reducer.registerOneShot<AppState>(
  "INIT_DONE",
  (state) => {
    state.ready = true;
    return state;
  },
);
```

---

## Fire-and-forget dispatch helpers

These helpers let you trigger a Redux action from outside a reducer (e.g. from a
React callback, a service, or an async function) in a fully-typed way.

### `createOnDispatch` — typed fire-and-forget

```ts
import { createOnDispatch } from "@pihanga2/core";

export const dispatchFetchCatalog = createOnDispatch<{ catalogUrlPrefix: string }>(
  CATALOG_ACTION.FETCH_CATALOG,
);

// Call anywhere you have a dispatch reference:
dispatchFetchCatalog(dispatch, { catalogUrlPrefix: "/api/catalog" });
```

### `createOnDispatchP` — typed request / await-reply

Dispatches an action and returns a `Promise` that resolves when the designated reply
action is next received.  An optional third argument names an error action that causes
the promise to reject.

```ts
import { createOnDispatchP } from "@pihanga2/core";

const dispatchFetchDocument = createOnDispatchP<
  FetchDocumentEvent,    // shape of the request event
  DocumentFetchedEvent   // shape of the reply event
>(
  CATALOG_ACTION.FETCH_DOCUMENT,   // action to dispatch
  CATALOG_ACTION.DOCUMENT_FETCHED, // action to await
  CATALOG_ACTION.FETCH_FAILED,     // (optional) triggers rejection
);

// Inside an async handler:
const [state, result, d] = await dispatchFetchDocument(dispatch, { url, catalogID });
```

!!! note "How it works"
    `createOnDispatchP` installs a one-shot reducer that listens for `awaitAction`.
    When that action arrives the Promise resolves with `[currentState, replyEvent, dispatch]`.
    The reply action **must** include a `_replyTo` field (set automatically by Pihanga's
    REST layer) — otherwise the one-shot silently skips and waits for the next dispatch.

---

## `dispatchPipe` — request/reply pattern

`dispatchPipe` (available in `ReduceOpts`) wraps async Redux round-trips with automatic
timeout and cleanup:

```ts
onButtonClicked: (state, _event, dispatch, opts) => {
  opts.dispatchPipe(
    { type: "FETCH_USER", userId: "123" },        // request action
    { replyType: "FETCH_USER_REPLY", timeoutMs: 5000 },
    (state, reply)   => { state.user = reply.user; return state; },  // success
    (state, error)   => { state.error = error.message; return state; },  // error
    (state, timeout) => { state.status = "timeout"; return state; },  // timeout
  );
  return state;
},
```
