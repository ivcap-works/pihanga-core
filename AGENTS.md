# Pihanga Core — Agent / AI Assistant Guide

This document gives AI coding assistants (Claude, Copilot, Cursor, etc.) the context needed to help build applications with `@pihanga2/core`.

## What `@pihanga2/core` is

`@pihanga2/core` is the runtime engine of the **Pihanga declarative, card-based UI framework** for React. App authors use it to:

- Describe UI layout as a *function of Redux state* — no manual subscriptions.
- Register named *cards* (React components + typed props/events) in a global registry.
- Handle user events inline in the card declaration, as reducer functions.
- Navigate between pages with `showPage` / `onShowPage`.
- Fetch data with typed REST helpers that hook into Redux.

The full documentation lives at **https://ivcap-works.github.io/pihanga-core/**.
Pre-built card components are catalogued at **https://ivcap-works.github.io/pihanga-shadcn/**.

---

## Core concept — late binding

The key idea that distinguishes Pihanga from plain React is **late binding of card slots**.

In ordinary React a parent component hard-codes its children:

```tsx
// Standard React — parent knows the exact child type at compile time
<BooCard p1={...} p2={...} />
```

In Pihanga a parent card holds a *named slot*; the actual card that fills that slot is resolved at runtime from the global registry:

```tsx
// Pihanga — parent only knows the slot name; binding happens at render time
<Card cardName={contentCard} parentCard={cardName} />
```

The value of `contentCard` is derived from the Redux state, so **changing one field in the Redux store can swap out an entire sub-tree of the UI** with no component-level code changes. This is what makes Pihanga layouts truly declarative and trivially extensible.

---

## Minimal working example

The smallest complete Pihanga app — a counter — illustrates everything important:

### `src/app.state.ts`

```ts
import type { ReduxState } from "@pihanga2/core"

export type AppState = ReduxState & {
  count: number
}
```

### `src/main.ts`

```ts
import { start, DEFAULT_REDUX_STATE } from "@pihanga2/core"
import { appPiInit } from "./app.pihanga"
import type { AppState } from "./app.state"

const initState: AppState = {
  ...DEFAULT_REDUX_STATE,   // required — seeds routing and framework slices
  count: 0,
}

start(initState, [appPiInit])
```

### `src/app.pihanga.ts`

```ts
import { registerFramework, registerCard } from "@pihanga2/core"
import { Framework } from "./cards/frame.card"
import { Stack }     from "./cards/stack.card"
import { Button }    from "./cards/button.card"
import { Typography } from "./cards/typography.card"
import type { AppState } from "./app.state"

export function appPiInit(): void {
  // Declare the top-level framework card (wraps the whole page)
  registerFramework(Framework({ page: "page", theme: "light" }))

  // Declare the "page" card — a horizontal stack of three child cards
  registerCard(
    "page",
    Stack<AppState>({
      content: [
        // Inline card definitions — the slot IS the card (no separate name needed)
        Button<AppState>({
          label: "+",
          onClicked: (state) => { state.count += 1 },  // Immer mutation — no return needed
        }),
        Typography<AppState>({
          text: (s) => `Count: ${s.count}`,            // state mapper
        }),
        Button<AppState>({
          label: "-",
          onClicked: (state) => { state.count -= 1 },
        }),
      ],
    }),
  )
}
```

### `src/cards/button.card.tsx`

```tsx
import {
  type PiCardProps,
  actionTypesToEvents,
  createCardDeclaration,
  registerActions,
  registerCardComponent,
} from "@pihanga2/core"

const CARD_TYPE = "button"

type ButtonProps  = { label: string }
type ButtonEvents = { onClicked: { id?: string } }

export const Button = createCardDeclaration<ButtonProps, ButtonEvents>(CARD_TYPE)

const BUTTON_ACTIONS = registerActions(CARD_TYPE, ["clicked"])

const Component = ({ label, onClicked, cardName }: PiCardProps<ButtonProps, ButtonEvents>) => (
  <button data-pihanga={cardName} onClick={() => onClicked({})}>
    {label}
  </button>
)

// Registering at module load time is safe — buffered until start() runs
registerCardComponent({
  name: CARD_TYPE,
  component: Component,
  events: actionTypesToEvents(BUTTON_ACTIONS),
})
```

---

## Application anatomy

Larger apps add routing, auth, and feature modules, but the structure is just an expansion of the minimal pattern:

```
src/
├── main.ts / index.ts   → start(initState, inits)
├── app.state.ts         → AppState = ReduxState & ...your slices
├── app.pihanga.ts       → registerFramework() + registerCard() wired to state
├── app.reducer.ts       → cross-cutting reducers (auth, default routing)
└── *.pihanga.ts         → one file per feature page / section
```

### Entry point (`main.ts`)

```ts
import { start, DEFAULT_REDUX_STATE } from "@pihanga2/core"
import { init as pihangaInit } from "./app.pihanga"
import { init as cardLibInit } from "@pihanga2/shadcn"   // pre-built cards first
import type { AppState } from "./app.types"

start<AppState>(
  { activePage: "app/home", ...DEFAULT_REDUX_STATE },
  [cardLibInit, pihangaInit],   // components before instances
)
```

### Application state (`app.types.ts`)

```ts
import type { PiCardRef, ReduxState } from "@pihanga2/core"

export type AppState = ReduxState
  & { activePage: PiCardRef }   // which page card is showing
  & { user?: { name: string } } // auth slice
  & { items?: Item[] }          // domain data
```

### Declarative layout (`app.pihanga.ts`)

```ts
import { memo, type PiRegister } from "@pihanga2/core"

export function init(register: PiRegister): void {
  // Top-level window: pick page based on auth state
  register.window<AppState>({
    page: (s) => (s.user ? AppCard.Main : AppCard.Login),
  })

  // Shell card — props derived from Redux state
  register.card(
    AppCard.Main,
    MyShell<AppState>({
      title: "My App",                       // static prop
      username: (s) => s.user?.name,         // state mapper
      navItems: memo(                         // memoized derived value
        (s) => s.user,
        (user) => buildNavItems(user),
      ),
      content: (s) => s.activePage,          // nested card by name

      // Inline event handler — runs as a Redux reducer
      onLogout: (state, _event, dispatch) => {
        delete state.user
        return state
      },
    }),
  )
}
```

**State mappers** (`(s) => value`) are re-evaluated on every state change.
**`memo(selector, transform)`** adds memoization: `transform` only reruns when the selected slice changes — use it whenever the derivation allocates a new object or array.
**Inline event handlers** receive `(state, eventPayload, dispatch)` and must return the updated state (or mutate the Immer draft without returning).

---

## Two registration styles

Both styles are equivalent — use whichever is convenient:

| Style | When to use |
|---|---|
| `registerCard("name", ...)` / `registerCardComponent({...})` | Card files and simple init functions (no `PiRegister` needed) |
| `register.card("name", ...)` / `register.cardComponent({...})` | Init functions that receive a `PiRegister` argument |

`registerCardComponent()` (and its siblings) are buffered, so they can safely be called at module load time — before `start()` runs.

---

## Key usage patterns

### Register a card component (card library authors)

```ts
// myCard.types.ts
import { createCardDeclaration, actionTypesToEvents } from "@pihanga2/core"

export const MY_CARD = "my/card"
export type MyCardProps  = { label: string; count?: number }
export type MyCardEvents = { onIncrement: { delta: number } }

export const MyCard          = createCardDeclaration<MyCardProps, MyCardEvents>(MY_CARD)
export const MY_CARD_ACTIONS = actionTypesToEvents<MyCardEvents>(MY_CARD)
```

```tsx
// myCard.component.tsx
import { PiCardProps } from "@pihanga2/core"

export function MyCardComponent({
  label, count = 0, onIncrement,
}: PiCardProps<MyCardProps, MyCardEvents>) {
  return <button onClick={() => onIncrement({ delta: 1 })}>{label}: {count}</button>
}
```

```ts
// index.ts — called during start()
export function init(register: PiRegister) {
  register.cardComponent({
    name: MY_CARD,
    component: MyCardComponent,
    events: MY_CARD_ACTIONS,
  })
}
```

### Use a card instance with an event handler

```ts
import { MyCard } from "./cards/myCard"

register.card(
  "page/counter",
  MyCard<AppState>({
    label: "Clicks",
    count: (s) => s.clickCount,
    onIncrement: (state, { delta }) => {
      state.clickCount = (state.clickCount ?? 0) + delta
      return state
    },
  }),
)
```

### Routing

```ts
import { onShowPage, showPage } from "@pihanga2/core"

// React to a route change (runs as a reducer)
onShowPage<AppState>(register, (state, _action, dispatch) => {
  if (state.route.path[0] === "items") {
    state.activePage = "app/items/page"
  }
})

// Navigate programmatically (from an event handler or reducer)
onItemClicked: (state, { itemID }, dispatch) => {
  showPage(dispatch, ["items", itemID])
  return state
}
```

### REST data fetching

All REST handlers are registered inside `register()` callbacks and listen for Redux action types.

**Mental model:** register a handler → it listens for a `trigger` action → when dispatched, it builds the URL from the `url` template, optionally fetches auth context, calls `fetch`, then calls `reply` on success.

**Common properties (all verbs):**

| property | type | purpose |
|---|---|---|
| `name` | `string` | Logical name for debugging |
| `trigger` | `string` | Redux action type that fires the call |
| `url` | `string` | URL template; `:param` = required path binding, `?param` = optional query binding |
| `context?` | `(action, state) => Promise<C>` | Async context (auth token, base URL, etc.) |
| `origin?` | `string \| fn` | Base origin (default: `window.location.href`) |
| `headers?` | `(action, state, ctx) => Record<string,string>` | Request headers |
| `guard?` | `(action, state, dispatch, ctx) => boolean` | Return `false` to skip the request |
| `reply` | `(state, content, dispatch, result) => void` | Called on 2xx success |
| `error?` | `(state, errorAction, requestAction, dispatch) => S` | Called on non-2xx |

**URL templates:** `:id` is a required path binding (missing = internal error); `?page` is an optional query binding (missing = omitted from URL).

**GET (minimal):**

```ts
register((r) => {
  r.GET<AppState, LoadItemAction, Item>({
    name:    "loadItem",
    trigger: "ITEM/LOAD",
    url:     "/api/items/:id",
    request: (action) => ({ id: action.id }),
    reply:   (_state, item, dispatch) => dispatch({ type: "ITEM/LOADED", item }),
    error:   (state, err, _req, dispatch) => {
      dispatch({ type: "ITEM/FAILED", cause: err })
      return state
    },
  })
})
```

**GET with auth context (common pattern for protected APIs):**

```ts
r.GET<AppState, LoadItemAction, Item, AuthContext>({
  name: "loadItem", trigger: "ITEM/LOAD", url: "/api/items/:id",
  context: async (_action, _state) => ({ apiOrigin: "https://api.example.com", token: "..." }),
  origin:  (_a, _s, ctx) => ctx.apiOrigin,
  headers: (_a, _s, ctx) => ({ Authorization: `Bearer ${ctx.token}` }),
  request: (action) => ({ id: action.id }),
  reply:   (_state, item, dispatch) => dispatch({ type: "ITEM/LOADED", item }),
})
```

**POST (JSON body):**

```ts
r.POST<AppState, CreateItemAction, Item>({
  name: "createItem", trigger: "ITEM/CREATE", url: "/api/items",
  request: (action) => ({ body: action.payload, contentType: "application/json" }),
  reply: (_state, item, dispatch) => dispatch({ type: "ITEM/CREATED", item }),
})
```

**PUT / PATCH** follow the same shape as POST — include `bindings` in `request()` for path params, e.g. `{ bindings: { id: action.id }, body: action.patch, contentType: "application/json" }`.

**DELETE:**

```ts
r.DELETE<AppState, DeleteItemAction, unknown>({
  name: "deleteItem", trigger: "ITEM/DELETE", url: "/api/items/:id",
  request: (action) => ({ id: action.id }),
  reply: (_state, _content, dispatch, result) =>
    dispatch({ type: "ITEM/DELETED", id: result.request.id }),
})
```

**Lifecycle actions:** every handler also dispatches `pi/rest/get/submitted/${name}`, `pi/rest/get/result/${name}`, and `pi/rest/get/error/${name}` actions — useful for spinners and request tracking.

See the [full REST guide](https://ivcap-works.github.io/pihanga-core/guides/rest-usage/) for the complete property reference, all verb examples, lifecycle action payloads, and debugging internals.

### Reducers outside components

`createOnAction("TYPE")` returns a registration helper — call it with `(register, handler)` inside an init function:

```ts
import { createOnAction, type PiRegister } from "@pihanga2/core"

const onLogout = createOnAction<{}>("AUTH/LOGOUT")

export function reducerInit(register: PiRegister): void {
  onLogout<AppState>(register, (state) => {
    delete state.user
    return state
  })
}
```

Alternatively use `register.reducer.register` directly:

```ts
export function reducerInit(register: PiRegister): void {
  register.reducer.register<AppState>("AUTH/LOGOUT", (state) => {
    delete state.user
    return state
  })
}
```

---

## Pre-built cards

**Before generating custom card code, always check whether an existing card already covers the requirement.**

`@pihanga2/shadcn` provides ready-made cards: `Button`, `Stack`, `List`, `Table`, `Form`, `Input`, `Typography`, `ImageViewer`, `FileDrop`, and more.

- **Source / README:** <https://github.com/ivcap-works/pihanga-shadcn>
- **Human-readable catalogue (props & events):** <https://ivcap-works.github.io/pihanga-shadcn/>

The pihanga-shadcn repository is also the best reference for how to write well-structured,
maintainable cards — study its card implementations before generating new ones from scratch.

---

## Common pitfalls

| Pitfall | Fix |
|---|---|
| *"unknown card type: x/y"* | `registerCardComponent` for that type hasn't run yet — import the card module before `start()` |
| New object returned from state mapper every render | Wrap with `memo(selector, transform)` |
| `start()` called more than once | Call it exactly once; use `registerCard()` for anything that happens later |
| RTK serializable-check warning | Pass `disableSerializableStateCheck: true` in the third arg to `start()` |
| Mutation outside reducer | State mutations are only safe inside reducer functions (Immer context); elsewhere, return new objects |
| Browser `SyntaxError: does not provide an export named 'PiCardRef'` | `PiCardRef` is a TypeScript **type-only** export — it has no runtime JS value. Any import without the `type` keyword causes a crash in Vite dev mode (esbuild does not enforce `verbatimModuleSyntax`). Use `import type {PiCardRef}` or inline `import {type PiCardRef, …}` everywhere. Same applies to Redux's `Store` type. |
| Browser `SyntaxError: does not provide an export named 'Store'` (from `@reduxjs/toolkit`) | `Store` is a TypeScript type, not a runtime value. In `app.root.tsx` use `import type {Store} from "@reduxjs/toolkit"`. |

> **Vite/esbuild and TypeScript type erasure**
>
> Vite's development server uses `esbuild` to transform TypeScript — it strips types but does **not** type-check.  This means TypeScript's `verbatimModuleSyntax: true` setting (which would normally make the compiler reject value-style imports of type-only symbols) is *not enforced* at dev time.  The import compiles fine, but at runtime the browser fetches the pre-bundled module and discovers the named export does not exist.
>
> **Rule of thumb:** any symbol that appears only in `.d.ts` files (not in `.js`) must be imported with `import type`.  In `@pihanga2/core` the most common type-only exports are `PiCardRef`, `ReduxState`, `PiCardDef`, and `WindowProps`; in `@reduxjs/toolkit` the most common one is `Store`.
