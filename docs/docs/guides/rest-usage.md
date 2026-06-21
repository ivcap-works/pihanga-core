# REST Usage (PiRegister.{GET|POST|PUT|PATCH|DELETE})

This document is split into two parts:

* **Usage (what most library users need day-to-day)**
* **Debugging / internals (useful when something goes wrong)**

## Table of contents

* [Usage](#usage)
  * [Mental model](#mental-model)
  * [Common registration properties](#common-registration-properties)
  * [URL templates and bindings](#url-templates-and-bindings)
  * [Usage: GET (start here)](#usage-get-start-here)
    * [Minimal typed GET example (no auth/context)](#minimal-typed-get-example-no-authcontext)
    * [Advanced GET example (auth via context + origin + headers)](#advanced-get-example-auth-via-context--origin--headers)
  * [Usage: Request context + auth (common pattern)](#usage-request-context--auth-common-pattern)
  * [Usage: Progress (submitted/result/error) actions](#usage-progress-submittedresulterror-actions)
  * [Usage: POST / PUT / PATCH (request bodies)](#usage-post--put--patch-request-bodies)
    * [Common request body shape](#common-request-body-shape)
    * [POST](#post)
    * [PUT](#put)
    * [PATCH](#patch)
  * [Usage: DELETE](#usage-delete)
  * [Usage: Error handling](#usage-error-handling)
* [Debugging / internals](#debugging--internals)
  * [Where the code lives](#where-the-code-lives)
  * [How it hooks into Redux](#how-it-hooks-into-redux)
  * [Internal action types](#internal-action-types)
  * [Response parsing](#response-parsing)
  * [Notes / gotchas](#notes--gotchas)

## Usage

### Mental model

1. You register a REST handler, e.g. `register.GET({ ... })`.
2. It **listens** for a Redux action type (`trigger`).
3. When that action is dispatched, it builds a URL from your `url` template plus bindings from `request(...)`, optionally loads `context(...)` and applies `headers(...)`, then calls `fetch`.
4. On success, your `reply(...)` runs and typically dispatches your domain actions.

### Common registration properties

All verbs share the properties from `RegisterGenericProps` (`src/rest/types.ts`):

| property | type | purpose |
| --- | --- | --- |
| `name` | `string` | Logical call name (used for internal bookkeeping/debugging). |
| `trigger` | `string` | Redux action type that starts the call. |
| `url` | `string` | URL template supporting bindings like `:id` and optional bindings like `?page`. |
| `origin?` | `string \| (action, state, ctxt) => string \| URL` | Base origin. Default is `window.location.href`. |
| `context?` | `(action, state) => Promise<C> \| null` | Async context (e.g. auth token, base URL). |
| `guard?` | `(action, state, dispatch, ctxt) => boolean` | Return `false` to skip the request. |
| `headers?` | `(action, state, ctxt) => Record<string,string>` | Request headers (auth, correlation IDs, etc.). |
| `reply` | `(state, content, dispatch, resultAction) => void` | Called on success (HTTP < 300). Dispatch domain actions here. |
| `error?` | `(state, errorAction, requestAction, dispatch) => S` | Called on non-2xx responses. Dispatch domain error actions here. |

### URL templates and bindings

Bindings are substituted into the `url` **path segments** and **query string**:

* `:name` = required binding. Missing it triggers an internal error.
* `?name` = optional binding. Missing it omits that query parameter.

Examples:

* `/1/artifacts/:id` requires `{ id: "..." }`
* `/1/orders?limit=?limit&page=?page` omits `limit` and/or `page` if not provided

Path bindings are URL-encoded.

## Usage: GET (start here)

GET registrations provide optional `request(...)` bindings (no request body).

### Minimal typed GET example (no auth/context)

```ts
import type {
  Bindings,
  DispatchF,
  ErrorAction,
  PiRegister,
  ResultAction,
  ReduxAction,
  ReduxState,
  register,
} from "@pihanga2/core"

type MyState = ReduxState & {}

type LoadThingAction = ReduxAction & {
  id: string
}

type Thing = {
  id: string
  name: string
}

register((r: PiRegister) => {
  r.GET<MyState, LoadThingAction, Thing>({
    name: "loadThing",
    trigger: "THING/LOAD",
    url: "/v1/things/:id",

    request: (action: LoadThingAction, _state: MyState): Bindings => ({
      id: action.id,
    }),

    reply: (
      _state: MyState,
      content: Thing,
      dispatch: DispatchF,
      _result: ResultAction<LoadThingAction>,
    ): void => {
      dispatch({ type: "THING/LOADED", thing: content })
    },

    error: (
      state: MyState,
      err: ErrorAction<LoadThingAction>,
      _requestAction: LoadThingAction,
      dispatch: DispatchF,
    ): MyState => {
      dispatch({ type: "THING/LOAD_FAILED", cause: err })
      return state
    },
  })
})
```

### Advanced GET example (auth via context + origin + headers)

```ts
import type {
  Bindings,
  DispatchF,
  ErrorAction,
  PiRegister,
  ResultAction,
  ReduxAction,
  ReduxState,
  register,
} from "@pihanga2/core"

type MyState = ReduxState

type LoadThingAction = ReduxAction & {
  id: string
}

type Thing = {
  id: string
  name: string
}

type MyAuthContext = {
  apiOrigin: string
  token: string
}

register((r: PiRegister) => {
  r.GET<MyState, LoadThingAction, Thing, MyAuthContext>({
    name: "loadThing",
    trigger: "THING/LOAD",
    url: "/v1/things/:id",

    context: async (
      _action: LoadThingAction,
      _state: MyState,
    ): Promise<MyAuthContext> => ({
      apiOrigin: "https://api.example.com",
      token: "...",
    }),

    origin: (
      _action: LoadThingAction,
      _state: MyState,
      ctxt: MyAuthContext,
    ): string => ctxt.apiOrigin,

    headers: (
      _action: LoadThingAction,
      _state: MyState,
      ctxt: MyAuthContext,
    ): Record<string, string> => ({
      Authorization: `Bearer ${ctxt.token}`,
    }),

    request: (action: LoadThingAction, _state: MyState): Bindings => ({
      id: action.id,
    }),

    reply: (
      _state: MyState,
      content: Thing,
      dispatch: DispatchF,
      _result: ResultAction<LoadThingAction>,
    ): void => {
      dispatch({ type: "THING/LOADED", thing: content })
    },

    error: (
      state: MyState,
      err: ErrorAction<LoadThingAction>,
      _requestAction: LoadThingAction,
      dispatch: DispatchF,
    ): MyState => {
      dispatch({ type: "THING/LOAD_FAILED", cause: err })
      return state
    },
  })
})
```

## Usage: Request context + auth (common pattern)

For authenticated APIs, a common pattern is:

* `context()` loads auth/base-url asynchronously (token, API URL)
* `origin()` sets the base URL from that context
* `headers()` adds auth headers (e.g. `Authorization: Bearer ...`)

A reusable helper encapsulates these shared props:

```ts
const CommonProps = (name: string) => ({
  name,
  context: () => GetOAuthContext(),
  origin: (_a: any, _s: any, ctxt: OAuthContextT) => ctxt.apiURL,
  headers: (_a: any, _s: any, ctxt: OAuthContextT) => ({
    Authorization: `Bearer ${ctxt.token}`,
  }),
  error: restErrorHandling(`api:${name}`),
})
```

## Usage: Progress (submitted/result/error) actions

Every REST registration reports lifecycle/progress via **additional Redux actions**. This is useful for:

* showing spinners (request submitted)
* logging / debugging
* building a generic request-tracker in state

### Base action types (GET)

GET uses the following action namespace (`src/rest/get.ts`):

* `pi/rest/get/submitted`
* `pi/rest/get/result`
* `pi/rest/get/error`
* `pi/rest/get/internal_error`

specialised per handler by appending `/${name}`:

```ts
const submitType    = `${ACTION_TYPES.SUBMITTED}/${name}`
const resultType    = `${ACTION_TYPES.RESULT}/${name}`
const errorType     = `${ACTION_TYPES.ERROR}/${name}`
const intErrorType  = `${ACTION_TYPES.INTERNAL_ERROR}/${name}`
```

### Base action types (POST/PUT/PATCH/DELETE)

In `src/rest/types.ts`:

```ts
export const Domain = "pi/rest"
export const ACTION_TYPES = registerActions(Domain, [
  "POST_SUBMITTED", "POST_RESULT", "POST_ERROR", "POST_INTERNAL_ERROR",
  "PUT_SUBMITTED",  "PUT_RESULT",  "PUT_ERROR",  "PUT_INTERNAL_ERROR",
  "PATCH_SUBMITTED","PATCH_RESULT","PATCH_ERROR","PATCH_INTERNAL_ERROR",
  "DELETE_SUBMITTED","DELETE_RESULT","DELETE_ERROR","DELETE_INTERNAL_ERROR",
  "UNAUTHORISED_ERROR", "PERMISSION_DENIED_ERROR", "NOT_FOUND_ERROR",
  "ERROR", "CONTEXT_ERROR",
])
```

Specialised by appending `:${name}`, e.g. `pi/rest/POST_SUBMITTED:createOrder`.

### Payload shapes

* **submitted** → `SubmitAction` (includes `requestID`, `url`, `bindings`)
* **result** → `ResultAction<A>` (includes `statusCode`, `content`, `contentType`, `mimeType`, `size`, `headers`, `url`, original `request` action)
* **error** → `ErrorAction<A>` (similar to result, plus an `ErrorKind` classification)

## Usage: POST / PUT / PATCH (request bodies)

POST/PUT/PATCH all have a request body. Their `request(...)` returns:

```ts
type PoPuPaRequest = {
  body: any
  contentType?: string
  bindings?: Bindings
}
```

### POST

```ts
register((r: PiRegister) => {
  r.POST<MyState, CreateThingAction, Thing>({
    name: "createThing",
    trigger: "THING/CREATE",
    url: "/v1/things",
    request: (action: CreateThingAction, _state: MyState) => ({
      body: action.payload,
      contentType: "application/json",
    }),
    reply: (_state: MyState, content: Thing, dispatch: DispatchF) => {
      dispatch({ type: "THING/CREATED", thing: content })
    },
  })
})
```

### PUT

PUT typically replaces a resource at a known URL.

```ts
r.PUT<MyState, UpdateThingAction, Thing>({
  name: "updateThing",
  trigger: "THING/UPDATE",
  url: "/v1/things/:id",
  request: (action: UpdateThingAction, _state: MyState) => ({
    bindings: { id: action.id },
    body: action.payload,
    contentType: "application/json",
  }),
  reply: (_state: MyState, content: Thing, dispatch: DispatchF) => {
    dispatch({ type: "THING/UPDATED", thing: content })
  },
})
```

### PATCH

PATCH applies a partial update.

```ts
register((r: PiRegister) => {
  r.PATCH<MyState, PatchThingAction, Thing>({
    name: "patchThing",
    trigger: "THING/PATCH",
    url: "/v1/things/:id",
    request: (action: PatchThingAction, _state: MyState) => ({
      bindings: { id: action.id },
      body: action.patch,
      contentType: "application/json",
    }),
    reply: (_state: MyState, content: Thing, dispatch: DispatchF) => {
      dispatch({ type: "THING/PATCHED", thing: content })
    },
  })
})
```

## Usage: DELETE

DELETE is bindings-only (like GET) but uses HTTP method `DELETE`.

```ts
register((r: PiRegister) => {
  r.DELETE<MyState, DeleteThingAction, unknown>({
    name: "deleteThing",
    trigger: "THING/DELETE",
    url: "/v1/things/:id",
    request: (action: DeleteThingAction, _state: MyState): Bindings => ({
      id: action.id,
    }),
    reply: (
      _state: MyState,
      _content: unknown,
      dispatch: DispatchF,
      result: ResultAction<DeleteThingAction>,
    ): void => {
      dispatch({ type: "THING/DELETED", id: result.request.id })
    },
  })
})
```

## Usage: Error handling

On non-2xx responses, the REST module dispatches an `ErrorAction` containing:

* `statusCode`
* `content` (parsed body)
* `error: ErrorKind` (401/403/404 mapped; else `Other`)
* `url`
* `request` (the original trigger action)

You can attach an `error(...)` handler per call, or centralize handling. See [Usage: Request context + auth](#usage-request-context--auth-common-pattern) for a reusable strategy.

## Debugging / internals

### Where the code lives

* `src/rest/get.ts`
* `src/rest/postPutPatch.ts`
* `src/rest/delete.ts`
* shared plumbing: `src/rest/utils.ts`
* types: `src/rest/types.ts`

### How it hooks into Redux

Pihanga's `PiReducer` is a small registration layer on top of Redux Toolkit's store (`src/reducer.ts`).

When you call `register.GET({...})`, internally it registers reducers for:

* the trigger action (`trigger`)
* the internal success action (which calls your `reply(...)`)
* optionally the internal error action (which calls your `error(...)`)

So the REST system is effectively "middleware implemented as reducers": it reacts to actions and dispatches more actions.

### Internal action types

GET (`src/rest/get.ts`) creates types like:

* `pi/rest/get/submitted/${name}`
* `pi/rest/get/result/${name}`
* `pi/rest/get/error/${name}`
* `pi/rest/get/internal_error/${name}`

POST/PUT/PATCH/DELETE create types like:

* `pi/rest/post_submitted:${name}`
* `pi/rest/put_result:${name}`
* `pi/rest/delete_error:${name}`

### Response parsing

Response parsing is in `src/rest/utils.ts`:

* `application/json` → `response.json()` → `RestContentType.Object`
* `application/jose` or `text/*` → `response.text()` → `RestContentType.Text`
* otherwise → `response.blob()` → `RestContentType.Blob`

### Notes / gotchas

* `reply(...)` runs in response to an internal action; keep it fast and dispatch domain actions.
* If `context(...)` is async, don't rely on the `state` parameter inside `guard/headers/origin` when using `context` (it receives `null`).
* Prefer `?name` bindings for optional query parameters so they get omitted cleanly.
