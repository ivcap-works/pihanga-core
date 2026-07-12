# pihanga-core — Code Review

Scope: `src/` of `@pihanga2/core`, reviewed against the stated design goal (README, DESIGN.md):
**minimise the number of times a React component is rendered**, with all state resolution flowing
through `useSelector` + `deep-equal` prop comparison.

`tsc --noEmit` passes; everything below is a runtime/design finding, not a compile error.

Findings are grouped: **A** = defeats the render-minimisation goal, **B** = correctness bugs,
**C** = inconsistencies / cleanup. Within each group, roughly ordered by impact.

---

## A. Render-minimisation issues

### A1. `<Card>` is not memoised → any render cascades through the whole subtree
`card.tsx:51`, `root.tsx`

The `deep-equal` gate in `useSelector(getCardProps, propEq)` only prevents re-renders *triggered by
the store*. It does nothing when a card re-renders because its **parent** rendered: React re-runs
every child `<Card>` unconditionally, and each `GenericCard` then calls
`React.createElement(component, extCardProps)` with **fresh prop identities** (see A2), so the
child card component renders too, and so on down the tree. One card changing therefore re-renders
its entire subtree of cards, which is exactly what the architecture is meant to avoid.

Fix: `export const Card = React.memo(CardImpl)` (cheap — its own props are usually stable strings),
and make the props passed to the card component referentially stable (A2) so that card components
can themselves be wrapped in `React.memo` effectively.

### A2. New function identities created on every `GenericCard` render
`card.tsx:166–197`, `appendEventHandlers` (`card.tsx:327`)

Each render allocates: `dispatchWithId`, `eventMapperResolve`, `ctxtPropsForEventMapper`, a new
`extCardProps` object, one closure per `onXxx` event, and a new `_cls` function via
`cls_f(cardName, cardType)`. All of these depend only on `cardName`, the mapping, and
`dispatch` — none change between renders. Because they are recreated, the props object handed to
the actual card component is never referentially stable, so `React.memo` on card components is
useless and `propEq`'s deep-equal work is partially wasted.

Fix: `useMemo`/`useCallback` keyed on `[cardName, info.mapping, dispatch]` for the handler set and
`_cls` (or a module-level cache keyed by `cardName` for `cls_f`, since it is pure).

### A3. Anonymous cards re-register on every render — `mapping.parameters` is never updated
`card.tsx:128–137`, `register_cards.ts:203–208`

`checkForAnonymousCard` decides whether to update with an **identity** check
(`mapping.parameters !== parameters`). Parents typically produce the inline `PiCardDef` freshly on
each render (e.g. from a state mapper), so this is almost always true. Worse, the update path in
`_createCardMapping` sets `cm.props` and `cm.eventMappers` but **never writes `cm.parameters`**
(nor `cm.cardType`), so the identity check can never become false. Result: every render of an
anonymous card runs the full `_createCardMapping` pipeline — including `processEventParameter` →
`registerReducer` → `removeReducer` + array sort + (for key-less registrations)
`StackTrace.getSync()` — on **every render**.

Fix: store `cm.parameters = parameters` on update; compare with `deep-equal` rather than identity;
and ideally move registration out of the render path (see A6).

### A4. `ErrorCard` forces a re-render on every dispatch, and its hook list doesn't match `GenericCard`
`card.tsx:207–216`

Two problems:

1. Its `useSelector` equality function is `(a, b) => false`, i.e. "always changed" — an error card
   re-renders on **every** store dispatch. It should be `() => true`.
2. The comment says "call the EXACT same hooks as GenericCard", but it doesn't:
   `GenericCard` calls `useEffect, useSelector, useDispatch, useStore`; `ErrorCard` calls
   `useSelector, useDispatch, useEffect` — `useStore` is missing and the order differs. If a card
   transitions between error and resolved (e.g. a card type registered late), React's hook
   invariants break with undefined behaviour.

Structural fix for both: stop calling `GenericCard(...)`/`ErrorCard(...)` as plain functions inside
`Card`. Render them as real components (`<GenericCard …/>`, `<ErrorCard …/>`); each then owns its
hook list and the parity hack disappears.

### A5. `usePiReducer` re-registers on every render and conditionally calls a hook
`card.tsx:80–96`

The `useEffect` has **no dependency array**, so the reducer is unregistered and re-registered on
every render of the calling component (each registration also triggers the sort +
possible `StackTrace.getSync()` in `addReducer`). Additionally `useId()` is only called when
`cardName === ""` — a conditional hook call, violating the Rules of Hooks.

Fix: always call `useId()`, pick the key afterwards; add `[eventType, key]` (with a stable `mapper`
via ref) as the dependency array.

### A6. Global registry mutation and side effects during render
`card.tsx:61` (`checkForAnonymousCard` → `_registerCard`), `card.tsx:148–150`
(`metaCardCtxtPropsStore` write), `propEq` (`card.tsx:311–325`, calls `RegisterCardState.changed`
which starts timers)

Registering cards/reducers, writing module-level stores, and scheduling timers are all side effects
executed during the render phase (and inside a `useSelector` equality function). Under
`<React.StrictMode>` (which `RootComponent` enables) render is double-invoked, and under concurrent
rendering a render may be thrown away — leaving half-applied registry state. This also makes
`useState(Math.random())` ids (A7) doubly generated.

Fix direction: perform anonymous-card registration in a `useMemo` on first encounter but make it
idempotent and identity-keyed; move `RegisterCardState` bookkeeping out of `propEq` into a
`useEffect`.

### A7. Random ids for anonymous cards: collisions, leaks, unstable names
`card.tsx:54`, `card.tsx:114–118`

`Math.floor(Math.random() * 10000)` gives a 1-in-10k collision space between sibling anonymous
cards of the same type — silent prop cross-talk when it happens. Every remount generates a new id,
so a re-mounted anonymous card registers a **new** `cardMappings` entry and new reducers while the
old ones are never removed — `cardMappings`, the reducer `mappings`, and the `RegisterCardState`
map all grow without bound in long-running apps with dynamic lists.

Fix: use React's `useId()` (stable across StrictMode remounts), and unregister
mappings/reducers in the unmount cleanup of the anonymous card.

### A8. `memo()` cache is keyed by `cardKey`, not by card — cache thrash across instances
`register_cards.ts:432–453`

The cache key is `context.cardKey || "-"`. A single `memo(...)` declaration shared by several card
instances **without** a `cardKey` (the common case) makes all instances share the `"-"` slot: each
instance's `filterF` result differs, so every call sees "changed", `mapperF` re-runs every time,
and the memo is effectively disabled (the deep-equal in `propEq` then saves the re-render, but at
full recompute + compare cost, on every dispatch). Also both caches grow without bound for keyed
use.

Fix: key by `context.cardName` (unique per instance), fall back to `cardKey` only where the same
card renders multiple data rows; consider an LRU or unmount cleanup.

### A9. Always-on debug slice causes periodic global reducer passes
`card.tsx:373–477` (`RegisterCardState`), `reducer.ts:46–51`

Every card render feeds the debug state machine; a 1-second debounce timer then dispatches
`pi/card/update_state`, which runs a `produce()` over the whole state and — because the root state
object changes — re-runs `getCardProps` + deep-equal for **every mounted card**. In an idle app
with one changing card this manufactures a steady background of selector work (and Redux DevTools
noise) once per second. There is also a fidelity bug: the reducer only writes cards with
`reportedAt > lastReport`, replacing `state.pihanga.cards` wholesale, so previously-snapshotted
cards vanish from the debug slice.

Fix: gate the whole subsystem behind an opt-in flag (e.g. `StartProps.debugCardState`, default off
in production), and merge into the existing `cards` object rather than replacing it.

### A10. `deep-equal` on every card, every dispatch — consider cheaper equality
`card.tsx:159`, `package.json` dependency `deep-equal`

The architecture necessarily runs each card's selector on each dispatch; the deep comparison is
then O(size of props) per card per action. Two cheap wins: (1) swap `deep-equal` (heavy,
spec-compliant) for `fast-deep-equal` (~10× faster, sufficient for props data); (2) short-circuit
with a reference check per prop key before deep-comparing, since `memo()`-produced values are
reference-stable when unchanged.

---

## B. Correctness bugs

### B1. `null` prop value crashes card registration
`register_cards.ts:181–183`

`typeof null === "object"`, so `const cd = v as PiCardDef; if (cd.cardType)` throws
`TypeError: Cannot read properties of null` for any card declared with a `null` prop.
The correct guard already exists — `isCardRef()` (`register_cards.ts:25`) checks `p !== null` —
but is not used here. Use it.

### B2. `parseResponse` mime matching fails on parameters like `charset`
`rest/utils.ts:20–36`

`switch (mimeType)` is an exact match, so the very common header
`content-type: application/json; charset=utf-8` falls through to the `blob()` branch and the reply
handler receives a Blob instead of a parsed object. Split on `";"`/trim (or `startsWith`) before
matching.

### B3. Network-level fetch failures are silently swallowed
`rest/utils.ts:194`

`.catch((error) => console.log("_fetch", error))` — a DNS failure, CORS rejection, or offline
condition never dispatches any action, so the registered `error` handler (and any UI spinner
keyed off `submitType`) hangs forever. Dispatch `intErrorType` (or `errorType` with
`ErrorKind.Other`) in this catch.

### B4. POST/PUT/PATCH without a body always throws
`rest/postPutPatch.ts:103–109`

If `request()` returns no `body` and no `contentType`, the trailing `if (!ct)` block throws
`"Cannot determin 'contentType'"` — but a body-less POST is legitimate. The second `!ct` check is
also dead for all body-carrying paths (ct was already defaulted above). Restructure: only require a
content type when a body is present. (Also: typo "determin" → "determine", twice.)

### B5. Reducers registered *during* a reduction can be lost
`reducer.ts:241–247`

`_reduce` returns a rebuilt list and the caller assigns `mappings[action.type] = rout` after the
loop. If a handler running inside that loop registers a **new** reducer for the same action type —
which `dispatchPipe` does whenever it listens on `"*"` (no `replyType`) and the current action also
has `"*"` handlers — `addReducer`'s push into `mappings["*"]` is clobbered by the subsequent
`mappings["*"] = rout2` assignment, and the reply listener silently disappears.

Fix: have `_reduce` mark one-shot removals by key and remove them from the live array, instead of
rebuilding/replacing the array.

### B6. Auto-keyed reducers can never be cancelled, and never de-duplicate
`reducer.ts:285–314`

`addReducer` captures `const key = reducerDef.key` **before** the stack-trace fallback assigns a
key, so any registration without an explicit key returns `nonCancelF` — the cancel function is a
no-op even though a key now exists. Likewise `removeReducer(undefined, m)` is a no-op, so repeated
registration from the same call site accumulates duplicates. Compute/assign the fallback key
*first*, then dedupe and build the cancel closure from the final key.

### B7. `PiRegisterOneShotReducerF` type doesn't match the implementation
`types.ts:178–185` vs `reducer.ts:271–281`

The type declares `(eventType, mapper, priority?) => void` but the implementation accepts a fourth
`key` parameter and returns a `PiReducerCancelF`. Callers relying on the type lose both features.

### B8. `HttpResponse.headers` type lie
`rest/types.ts:98`, `rest/utils.ts:268`

Typed `{[k: string]: any}` but actually a WHATWG `Headers` instance (non-serialisable — which is
why `"headers"` had to be added to `ignoredActionPaths` in `index.ts`). Either convert with
`Object.fromEntries(response.headers.entries())` (then it's serialisable and the ignore-path can
go) or type it honestly as `Headers`.

---

## C. Inconsistencies & cleanup

### C1. REST action-type naming is inconsistent between verbs
`rest/get.ts:6,28–31` vs `rest/postPutPatch.ts:16–19`, `rest/delete.ts:19–22`

GET uses its own namespace and `/` separator (`pi/rest/get/submitted/<name>`); POST/PUT/PATCH/DELETE
live in `pi/rest` with verb-prefixed uppercase names and a `:` separator
(`pi/rest/post_submitted:<name>`). Any generic tooling matching on these (logging, DevTools
filters, `onShowPage`-style listeners) needs two patterns. Pick one scheme (suggest
`pi/rest/<verb>/<phase>/<name>`) and keep the old strings as deprecated aliases for one release.

### C2. Two code styles in the same tree
`rest/get.ts`, `rest/delete.ts`, `rest/postPutPatch.ts` are semicolon-free with spaced import
braces; everything else is Prettier-style with semicolons and tight braces. Add a Prettier config +
`make format` and run it once across `src/`.

### C3. Dead files and dead code
`src/store.ts` and `src/register.ts` are 100 % commented out — delete them (the README's project
structure table also still describes them as live modules). Other dead code: `currentRoute()`
computes an unused `r2` (`router.ts:69`); `start()` calls `setRegisterF(register)` twice
(`index.ts:328` and `:340`); commented-out block in `propEq`; `_updateMetadataCard` stub.

### C4. README/API drift
README shows `dispatch(showPage("/dashboard"))` but the actual signature is
`showPage(dispatch, path: string[], query?)`; `onShowPage` is documented as
`onShowPage("/dashboard", cb)` but is `createOnAction`-based (`onShowPage(register, handler)` with
no path argument). Doc examples that don't compile are costly for a library whose whole point is
its registration API — align them (or better, make them doctest-style snippets compiled in CI).

### C5. Built-in router reducers violate the library's own reducer contract
`router.ts:99–148`

`ReduceF` is documented (types.ts, at length) as "mutate the Immer draft, do **not** return a
value", yet all three built-in router handlers `return state`. Returning the draft happens to be
legal for Immer, but the framework's own code should model the documented convention.

### C6. Duplicated card-type lookup logic
The `cardTypes[x] ?? cardTypes[`${framework}/${x}`]` fallback appears in `card.tsx:222–230`,
`register_cards.ts:128–140`, and `register_cards.ts:239–246`. Extract a `resolveCardType(name)`
helper; also consider making the implicit "first registered component sets the global `framework`"
behaviour (`register_cards.ts:71–78`) an explicit `register.framework(name)` call — it's a
surprising module-level side effect.

### C7. Event-mapper typing drift
`CardMapping.eventMappers` is `(ev, ctxtProps) => Action | null` (`register_cards.ts:32–34`), the
local variable in `_createCardMapping` is `(ev) => Action` (`:177`), `processEventParameter` casts
to a third shape (`:396`), and `card.tsx:351` calls it with two args. One signature, defined once
in `types.ts`. Related: in the mapper branch (`card.tsx:349–353`) `a.type` is never set before the
mapper runs, while the non-mapper branch sets it — mappers receive a type-less action unless they
remember to set it themselves; document or set it consistently.

### C8. Misc small items
- Typo in warning: "looks like an even but is not defined" (`register_cards.ts:364`).
- `logger.info` on every card/action registration is noisy for library consumers; make the default
  log level configurable via `StartProps` (default `warn`).
- `(store as any).piReducer` appears in three places; define
  `interface PiStore extends Store { piReducer: PiReducer }` once.
- `registerOneShot` ignores its `key` parameter for dedup purposes in the type (see B7).
- `docs/.venv` is committed inside the mkdocs folder — should be git-ignored.
- Arrays of `PiCardDef` in props are handled at render time (anonymous cards) but not in
  `_createCardMapping`'s nested-card scan — either support both or document that lists must go
  through render-time resolution.

---

## Testing gap most relevant to the core goal

There are solid tests for `reducer`, `register_cards`, `redux`, `uuid`, and `rest/utils`, but
**none for `card.tsx`** — the most complex file and the one carrying the render-minimisation
machinery. Recommend adding Testing Library tests that assert **render counts** directly:
a counter-in-component fixture, then (1) dispatch an unrelated action → assert 0 extra renders;
(2) change one card's mapped state → assert exactly that card (and not its siblings) re-renders;
(3) parent prop change → assert memoised children don't re-render. These tests would have caught
A1–A4 and will keep future changes honest against the project's primary objective.

## Suggested order of attack

1. A3 + B1 (small, high value: stop per-render re-registration; fix the null crash).
2. A4 + restructure `Card`/`GenericCard`/`ErrorCard` into real components (unblocks A1/A2).
3. A1 + A2 (`React.memo` + stable handler identities) — the biggest render-count win.
4. Render-count test suite (locks in 1–3).
5. B2–B6 REST/reducer correctness fixes.
6. A8, A9, A10 (memo keying, debug slice opt-in, faster equality).
7. C1–C8 cleanup sweep in one "consistency" PR.

