# Testing Guide

This guide covers how to write reliable, fast tests for all three major layers of a Pihanga application:

1. **[REST handlers](#rest-handler-tests)** — test that your `register.GET/POST/…` wiring works end-to-end using mock responses, without a real HTTP server or Redux store.
2. **[Card components](#card-component-tests)** — test that your React card components render correctly and fire the right events, using `@testing-library/react` and a minimal Redux store.
3. **[Reducers](#reducer-tests)** — test that your plain reducer functions update state correctly, with zero React or Redux ceremony.

---

## REST handler tests

### How it works

Pihanga REST handlers (`register.GET`, `register.POST`, …) are "reducers that call `fetch`". They listen for a trigger Redux action, perform an async HTTP call, and dispatch result/error actions. The test harness replaces `fetch` with a mock registry so the full trigger → fetch → reply cycle runs synchronously (after a single `await flush()`) with no real HTTP traffic.

```mermaid
sequenceDiagram
    participant Test
    participant dispatch
    participant REST handler
    participant Mock registry
    participant reply()

    Test->>dispatch: dispatch({ type: "ITEM/LOAD", id: "1" })
    dispatch->>REST handler: trigger action fires
    REST handler->>Mock registry: _fetch(url, request)
    Mock registry-->>REST handler: { status: 200, body: {...} }
    REST handler->>dispatch: dispatch internal result action
    dispatch->>reply(): reply(state, body, dispatch, result)
    reply()->>dispatch: dispatch({ type: "ITEM/LOADED", item })
    Test->>Test: await flush()
    Test->>Test: expect(dispatched).toContain(...)
```

### Required packages

```bash
yarn add -D vitest @vitest/coverage-v8
```

The mocking helpers are exported from `@pihanga2/core/rest/mock` — no extra install needed.

### File boilerplate

Every REST test file has the same three-block shape:

```ts
// ① Imports
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearRestMocks, registerRestMock,
  createPiMockState, piCoreMockFactory, createRestTestHarness,
} from "@pihanga2/core/rest/mock"

// ② Two unavoidable Vitest lines — MUST stay in this file
//    vi.hoisted() runs before imports are resolved, so the callback
//    MUST NOT call any imported function (TDZ crash).
//    piCoreMockFactory() is safe inside vi.mock because that factory
//    is called lazily, after all static imports are resolved.
const _s = vi.hoisted(() => createPiMockState())
vi.mock("@pihanga2/core", (io) => piCoreMockFactory(io, _s))

// ③ One-time harness setup
const { createSetup, flush, afterEachCleanup } = createRestTestHarness(_s)
afterEach(() => { clearRestMocks(); afterEachCleanup() })
```

!!! info "Co-located tests (inside `src/rest/`)"
    If your test file lives *inside* the core package itself (next to `src/rest/`), replace
    `"@pihanga2/core"` with `"../index"`:
    ```ts
    vi.mock("../index", (io) => piCoreMockFactory(io, _s))
    ```

### What `createSetup()` returns

Call `createSetup()` once per `it()` block — it creates a fresh isolated environment:

| Returned value | Purpose |
|---|---|
| `dispatch(action)` | Self-forwarding dispatch — fires handlers AND records the action |
| `dispatched` | Array of every action dispatched during the test |
| `mockReducer` | Mock PiRegister with `.GET`, `.POST`, `.PUT`, `.PATCH`, `.DELETE` |
| `handlers` | Raw `{ [actionType]: handler }` map (advanced use) |

### Pattern 1 — Inline handler registration

Register the handler inside the test itself:

```ts
it("GET loads an item", async () => {
  registerRestMock("GET /api/items/:id", () => ({
    status: 200,
    body: { id: "7", name: "Sprocket" },
  }))

  const { dispatched, mockReducer, dispatch } = createSetup()

  mockReducer.GET({
    name: "loadItem",
    origin: "http://localhost",
    trigger: "ITEM/LOAD",
    url: "/api/items/:id",
    request: (action: any) => ({ id: action.id }),
    reply: (_state: any, item: any, d: any) => {
      d({ type: "ITEM/LOADED", item })
    },
  })

  dispatch({ type: "ITEM/LOAD", id: "7" })
  await flush()

  const loaded = dispatched.find((a) => a.type === "ITEM/LOADED")
  expect(loaded?.item).toEqual({ id: "7", name: "Sprocket" })
})
```

### Pattern 2 — Testing production init code (no duplication)

If your feature module registers its handler at module level using `register(...)`, **import that module** at the top of the test file and call `createSetup()` — it replays the buffered `register()` call automatically:

```ts title="items.init.ts  (production code — untouched)"
import { register } from "@pihanga2/core"

register((r) => {
  r.GET({
    name: "loadItem",
    trigger: "ITEM/LOAD",
    url: "/api/items/:id",
    request: (action: any) => ({ id: action.id }),
    reply: (_state, item, dispatch) => {
      dispatch({ type: "ITEM/LOADED", item })
    },
  })
})
```

```ts title="items.test.ts"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearRestMocks, registerRestMock,
  createPiMockState, piCoreMockFactory, createRestTestHarness,
} from "@pihanga2/core/rest/mock"

const _s = vi.hoisted(() => createPiMockState())
vi.mock("@pihanga2/core", (io) => piCoreMockFactory(io, _s))

const { createSetup, flush, afterEachCleanup } = createRestTestHarness(_s)
afterEach(() => { clearRestMocks(); afterEachCleanup() })

// Importing the production module triggers its register() call.
// createSetup() will replay it against the mock PiRegister.
import "./items.init"

it("production handler: loads an item", async () => {
  registerRestMock("GET /api/items/:id", () => ({
    status: 200,
    body: { id: "42", name: "Widget" },
  }))

  const { dispatched, dispatch } = createSetup()   // replays items.init's register()

  dispatch({ type: "ITEM/LOAD", id: "42" })
  await flush()

  const loaded = dispatched.find((a) => a.type === "ITEM/LOADED")
  expect(loaded?.item).toEqual({ id: "42", name: "Widget" })
})
```

### Pattern 3 — Error responses

```ts
it("404 fires the error handler and not reply", async () => {
  registerRestMock("GET /api/items/:id", () => ({ status: 404 }))

  const { dispatched, mockReducer, dispatch } = createSetup()
  const reply = vi.fn()

  mockReducer.GET({
    name: "loadItem",
    origin: "http://localhost",
    trigger: "ITEM/LOAD",
    url: "/api/items/:id",
    request: (action: any) => ({ id: action.id }),
    reply,
    error: (_state: any, errAction: any, _req: any, d: any) => {
      d({ type: "ITEM/FAILED", statusCode: errAction.statusCode })
    },
  })

  dispatch({ type: "ITEM/LOAD", id: "99" })
  await flush()

  expect(reply).not.toHaveBeenCalled()
  const failed = dispatched.find((a) => a.type === "ITEM/FAILED")
  expect(failed?.statusCode).toBe(404)
})
```

### Pattern 4 — POST / PUT / PATCH / DELETE

Same shape — use `mockReducer.POST`, `mockReducer.PUT`, `mockReducer.PATCH`, or `mockReducer.DELETE`:

```ts
it("POST creates an item", async () => {
  registerRestMock("POST /api/items", () => ({
    status: 201,
    body: { id: "new-99", name: "Fresh" },
  }))

  const { dispatched, mockReducer, dispatch } = createSetup()

  mockReducer.POST({
    name: "createItem",
    origin: "http://localhost",
    trigger: "ITEM/CREATE",
    url: "/api/items",
    request: (action: any) => ({
      body: action.payload,
      contentType: "application/json",
    }),
    reply: (_state: any, item: any, d: any) => {
      d({ type: "ITEM/CREATED", item })
    },
  })

  dispatch({ type: "ITEM/CREATE", payload: { name: "Fresh" } })
  await flush()

  const created = dispatched.find((a) => a.type === "ITEM/CREATED")
  expect(created?.item.id).toBe("new-99")
})
```

### Pattern 5 — Dispatch pipes (`createOnDispatchPipe`)

When your feature uses `createOnDispatchPipe`, the REST handler's `reply` **must return** the domain action (not call `dispatch(...)`). This lets the pipe correlate reply actions by `_replyTo`.

```ts title="items.init.ts  (dispatch-pipe-compatible reply)"
import { register } from "@pihanga2/core"

register((r) => {
  r.GET({
    name: "loadItem",
    trigger: "ITEM/LOAD",
    url: "/api/items/:id",
    request: (action: any) => ({ id: action.id }),
    // ✅ return the action — utils.ts injects _replyTo
    reply: (_state, item) => ({ type: "ITEM/LOADED", item }),
  })
})
```

```ts title="items.test.ts"
import "./items.init"
import { createOnDispatchPipe } from "@pihanga2/core"

it("pipe onReply fires with fetched item", async () => {
  registerRestMock("GET /api/items/:id", () => ({
    status: 200,
    body: { id: "abc", name: "Pipe-test" },
  }))

  const { dispatch } = createSetup()

  const loadItem = createOnDispatchPipe("ITEM/LOAD", "ITEM/LOADED")

  let capturedItem: any
  loadItem(dispatch as any, { id: "abc" }, (_state: any, action: any) => {
    capturedItem = action.item
  })

  await flush()

  expect(capturedItem).toEqual({ id: "abc", name: "Pipe-test" })
})
```

!!! warning "`reply` must RETURN the action for dispatch pipes"
    If `reply` calls `dispatch(...)` instead of returning the action, the pipe's
    `isReply()` check will always fail — `_replyTo` is never injected when you
    call dispatch yourself.

    ```ts
    // ❌ pipe-incompatible
    reply: (_state, data, dispatch) => { dispatch({ type: "ITEM/LOADED", item: data }) }

    // ✅ pipe-compatible
    reply: (_state, data) => ({ type: "ITEM/LOADED", item: data })
    ```

### Lifecycle action types

Every REST handler dispatches these actions, which you can assert on:

| Verb | Submitted | Result | Error | Internal error |
|---|---|---|---|---|
| GET | `pi/rest/get/submitted/{name}` | `pi/rest/get/result/{name}` | `pi/rest/get/error/{name}` | `pi/rest/get/internal_error/{name}` |
| POST | `pi/rest/POST_SUBMITTED:{name}` | `pi/rest/POST_RESULT:{name}` | `pi/rest/POST_ERROR:{name}` | `pi/rest/POST_INTERNAL_ERROR:{name}` |
| PUT | `pi/rest/PUT_SUBMITTED:{name}` | `pi/rest/PUT_RESULT:{name}` | `pi/rest/PUT_ERROR:{name}` | — |
| PATCH | `pi/rest/PATCH_SUBMITTED:{name}` | `pi/rest/PATCH_RESULT:{name}` | `pi/rest/PATCH_ERROR:{name}` | — |
| DELETE | `pi/rest/DELETE_SUBMITTED:{name}` | `pi/rest/DELETE_RESULT:{name}` | `pi/rest/DELETE_ERROR:{name}` | — |

### Key rules

| Rule | Why |
|---|---|
| Call `createSetup()` **before** dispatching | It activates the mock PiRegister; without it, `register()` just buffers |
| `await flush()` after the trigger dispatch | The mock fetch is still Promise-based — microtasks need to drain |
| `clearRestMocks()` in `afterEach` | Prevents mock leakage across tests |
| `afterEachCleanup()` in `afterEach` | Resets `currentPiRegister` and clears one-shot handlers |
| `reply` returns the action for pipe-correlated handlers | `utils.ts` must see the return value to inject `_replyTo` |

---

## Card component tests

Card components are plain React components. Test them with
[`@testing-library/react`](https://testing-library.com/docs/react-testing-library/intro/).

### Required packages

```bash
yarn add -D @testing-library/react @testing-library/user-event jsdom
```

Configure Vitest to use jsdom in `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
export default defineConfig({
  test: { environment: "jsdom" },
})
```

### Testing a card component directly

The simplest approach is to import and render the component function directly — no Pihanga registry involvement:

```ts title="counter.component.test.tsx"
import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { CounterComponent } from "./counter.component"

describe("CounterComponent", () => {
  it("renders label and count", () => {
    render(
      <CounterComponent
        cardName="test/counter"
        parentCard=""
        count={5}
        label="Score"
        onIncrement={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByText("Score: 5")).toBeDefined()
  })

  it("calls onIncrement with delta=1 when + is clicked", async () => {
    const onIncrement = vi.fn()
    render(
      <CounterComponent
        cardName="test/counter"
        parentCard=""
        count={0}
        label="Hits"
        onIncrement={onIncrement}
        onReset={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "+1" }))
    expect(onIncrement).toHaveBeenCalledWith({ delta: 1 })
  })

  it("calls onReset when Reset is clicked", async () => {
    const onReset = vi.fn()
    render(
      <CounterComponent
        cardName="test/counter"
        parentCard=""
        count={99}
        label="Hits"
        onIncrement={vi.fn()}
        onReset={onReset}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Reset" }))
    expect(onReset).toHaveBeenCalledOnce()
  })
})
```

### Testing a card via the Pihanga registry (`<Card>`)

When you need to test the full card-registration + rendering pipeline — for example, to verify state mappers and prop wiring — render via `<Card>` with a minimal Redux store:

```ts title="counter.registry.test.tsx"
import React from "react"
import { render, screen, act } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import { Provider } from "react-redux"
import { describe, it, expect } from "vitest"
import { Card } from "@pihanga2/core"
import { _registerCard, addCardComponent } from "@pihanga2/core/register_cards"
import { CounterComponent } from "./counter.component"
import { COUNTER_CARD, COUNTER_ACTIONS } from "./counter.types"

// ── test helpers ──────────────────────────────────────────────────────────────

function createTestStore(initial: Record<string, unknown> = {}) {
  return configureStore({
    reducer: (state: any = { route: { path: [], query: {}, url: "/" }, pihanga: {}, ...initial }, action: any) => {
      if (action.type === "TEST/SET") return { ...state, [action.key]: action.value }
      return state
    },
    middleware: (g) => g({ serializableCheck: false }),
  })
}

function Wrapper({ store }: { store: ReturnType<typeof createTestStore> }) {
  return ({ children }: { children: React.ReactNode }) => (
    <React.StrictMode>
      <Provider store={store}>{children}</Provider>
    </React.StrictMode>
  )
}

// ── setup ─────────────────────────────────────────────────────────────────────

// Register the component type once (mirrors what your index.ts does)
addCardComponent({
  name: COUNTER_CARD,
  component: CounterComponent,
  events: COUNTER_ACTIONS,
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Counter card — registry integration", () => {
  it("renders count from Redux state", () => {
    const store = createTestStore({ score: 3 })

    _registerCard(
      "test/counter",
      {
        cardType: COUNTER_CARD,
        label: "Score",
        count: (s: any) => s.score,
        onIncrement: () => {},
        onReset: () => {},
      },
      () => () => {},  // no-op reducer registrar
    )

    render(<Card cardName="test/counter" parentCard="" />, {
      wrapper: Wrapper({ store }),
    })

    expect(screen.getByText("Score: 3")).toBeDefined()
  })

  it("re-renders when Redux state changes", () => {
    const store = createTestStore({ score: 0 })

    _registerCard(
      "test/counter2",
      {
        cardType: COUNTER_CARD,
        label: "Score",
        count: (s: any) => s.score,
        onIncrement: () => {},
        onReset: () => {},
      },
      () => () => {},
    )

    render(<Card cardName="test/counter2" parentCard="" />, {
      wrapper: Wrapper({ store }),
    })

    expect(screen.getByText("Score: 0")).toBeDefined()

    act(() => {
      store.dispatch({ type: "TEST/SET", key: "score", value: 42 })
    })

    expect(screen.getByText("Score: 42")).toBeDefined()
  })
})
```

### Render minimisation assertions

A key Pihanga contract is that **a card only re-renders when its own mapped state changes**. Test this by tracking render counts:

```ts
it("does not re-render when unrelated state changes", () => {
  let renderCount = 0
  const TrackingComponent = (_props: any) => {
    renderCount++
    return <div />
  }
  addCardComponent({ name: "test/tracking", component: TrackingComponent })

  const store = createTestStore({ score: 0, other: 0 })
  _registerCard("test/stable", { cardType: "test/tracking", value: (s: any) => s.score }, () => () => {})

  render(<Card cardName="test/stable" parentCard="" />, { wrapper: Wrapper({ store }) })
  const countAfterMount = renderCount

  act(() => {
    store.dispatch({ type: "TEST/SET", key: "other", value: 99 })
  })

  // `other` changed, but this card only maps `score` — no re-render expected.
  // Note: never assert exact counts under React.StrictMode (it double-invokes).
  // Assert the DELTA instead.
  expect(renderCount).toBe(countAfterMount)
})
```

!!! info "React.StrictMode and render counts"
    Always run your card tests inside `<React.StrictMode>` — the production apps
    do, and StrictMode catches effect-cleanup bugs (double-invoking setup/cleanup).
    Because StrictMode double-invokes component bodies, **never assert exact
    render counts** — assert deltas or compare the last committed value.

### Testing event handlers fire Redux actions

Pass a `vi.fn()` as the event prop and assert it was called with the right payload:

```ts
it("onIncrement dispatches with delta from click", async () => {
  const onIncrement = vi.fn()
  render(
    <CounterComponent
      cardName="test/c"
      parentCard=""
      count={2}
      label="X"
      onIncrement={onIncrement}
      onReset={vi.fn()}
    />,
  )
  await userEvent.click(screen.getByRole("button", { name: "+1" }))
  expect(onIncrement).toHaveBeenCalledWith({ delta: 1 })
})
```

### Testing anonymous / inline card definitions

When a parent card's content includes an **inline `PiCardDef`** (rather than a named string), use `withAnonSupport` to seed the registry's dispatch lookup:

```ts
import { dispatch2registerReducer } from "@pihanga2/core/register_cards"

function withAnonSupport(store: any, cb: () => void) {
  const entry: [any, any] = [store.dispatch, () => () => {}]
  dispatch2registerReducer.push(entry)
  try { cb() } finally {
    const idx = dispatch2registerReducer.indexOf(entry)
    if (idx >= 0) dispatch2registerReducer.splice(idx, 1)
  }
}

it("renders an inline PiCardDef", () => {
  addCardComponent({ name: "my/inline", component: ({ label }: any) => <div>{label}</div> })
  const store = createTestStore()

  withAnonSupport(store, () => {
    render(
      <Card
        cardName={{ cardType: "my/inline", label: "hello" } as any}
        parentCard="parent"
      />,
      { wrapper: Wrapper({ store }) },
    )
  })

  expect(screen.getByText("hello")).toBeDefined()
})
```

---

## Reducer tests

Plain reducer functions are the easiest to test — no React, no Redux store required. Import the handler function and call it directly.

### Testing `createOnAction` reducers

```ts title="items.reducer.ts"
import { createOnAction } from "@pihanga2/core"
import type { AppState } from "./app.state"

export const onItemLoaded = createOnAction<{ item: Item }>("ITEM/LOADED")

export function init(register: any) {
  onItemLoaded<AppState>(register, (state, { item }) => {
    state.items = [...(state.items ?? []), item]
    return state
  })
}
```

```ts title="items.reducer.test.ts"
import { describe, it, expect } from "vitest"

// Import the raw reducer handler — no framework required
function itemLoadedReducer(state: any, { item }: any) {
  state.items = [...(state.items ?? []), item]
  return state
}

describe("itemLoadedReducer", () => {
  it("appends the item to state.items", () => {
    const state = { items: [{ id: "1" }] }
    const result = itemLoadedReducer(structuredClone(state), { item: { id: "2" } })
    expect(result.items).toHaveLength(2)
    expect(result.items[1]).toEqual({ id: "2" })
  })

  it("initialises items array when undefined", () => {
    const result = itemLoadedReducer({}, { item: { id: "new" } })
    expect(result.items).toEqual([{ id: "new" }])
  })
})
```

### Testing Immer-style mutations

Pihanga reducers run inside Immer's `produce()` — they can mutate the draft OR return a new state. To test mutations directly without Immer, use `structuredClone` to avoid object sharing:

```ts
it("sets user on login", () => {
  // Arrange
  const state = structuredClone({ user: undefined, route: { path: [] } })

  // Act — call the reducer body directly
  state.user = { name: "Alice" }

  // Assert
  expect(state.user).toEqual({ name: "Alice" })
})
```

For tests that need to exercise the Immer boundary (mutation vs return), install `immer` and call `produce()` yourself:

```ts
import { produce } from "immer"
import { loginReducer } from "./auth.reducer"

it("mutation inside produce() returns new state", () => {
  const before = { user: undefined as any, route: { path: [] as string[] } }
  const after = produce(before, (draft) => loginReducer(draft, { name: "Bob" }))
  expect(after.user).toEqual({ name: "Bob" })
  expect(before.user).toBeUndefined()   // original untouched
})
```

### Testing routing reducers (`onShowPage`)

```ts
import { describe, it, expect, vi } from "vitest"

// Simulate the reducer that responds to a page change
function onShowPageReducer(state: any, _action: any, dispatch: any) {
  if (state.route?.path?.[0] === "items") {
    state.activePage = "app/items/page"
  }
  return state
}

it("sets activePage when navigating to items", () => {
  const dispatch = vi.fn()
  const state = { route: { path: ["items"] }, activePage: "app/home" }
  const result = onShowPageReducer(structuredClone(state), {}, dispatch)
  expect(result.activePage).toBe("app/items/page")
})

it("does not change activePage for other routes", () => {
  const dispatch = vi.fn()
  const state = { route: { path: ["dashboard"] }, activePage: "app/home" }
  const result = onShowPageReducer(structuredClone(state), {}, dispatch)
  expect(result.activePage).toBe("app/home")
})
```

---

## Testing checklist

Use this checklist when adding a new feature:

- [ ] **REST handler** — success case (2xx + reply)
- [ ] **REST handler** — error case (4xx/5xx + error handler)
- [ ] **REST handler** — lifecycle actions (`submitted`, `result`, `error`)
- [ ] **Card component** — renders props correctly
- [ ] **Card component** — fires the right event prop on user interaction
- [ ] **Card component (registry)** — re-renders when mapped state changes
- [ ] **Card component (registry)** — does NOT re-render when unrelated state changes
- [ ] **Reducer** — happy path (state is updated correctly)
- [ ] **Reducer** — edge cases (empty arrays, undefined values)
