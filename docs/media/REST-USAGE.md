<!-- markdownlint-disable MD013 -->

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

All verbs share the properties from `RegisterGenericProps` (`packages/core/src/rest/types.ts`):

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

### Worked example (GET with path binding) from `packages/ivcap`

From `packages/ivcap/src/artifact/artifact.get.ts`:

```ts
import type {
  Bindings,
  DispatchF,
  PiRegister,
  ResultAction,
  ReduxAction,
  ReduxState,
  register,
} from "@pihanga2/core"

register((r: PiRegister) => {
  r.GET<ReduxState, ReduxAction & LoadArtifactRecordEvent, any>({
    ...CommonProps("getArtifactRecord"),
    url: "/1/artifacts/:id",
    trigger: ACTION_TYPES.LOAD_RECORD,
    request: (
      action: ReduxAction & LoadArtifactRecordEvent,
      _state: ReduxState,
    ): Bindings => ({ id: action.id }),
    reply: (
      _state: ReduxState,
      content: any,
      dispatch: DispatchF,
      result: ResultAction<ReduxAction & LoadArtifactRecordEvent>,
    ): void => {
      const ev: ArtifactRecordEvent = { artifact: toArtifactRecord(content) }
      dispatchEvent(ev, ACTION_TYPES.RECORD, dispatch, result.request)
    },
  })
})
```

## Usage: Request context + auth (common pattern)

For authenticated APIs, a common pattern is:

* `context()` loads auth/base-url asynchronously (token, API URL)
* `origin()` sets the base URL from that context
* `headers()` adds auth headers (e.g. `Authorization: Bearer ...`)

The `packages/ivcap` module uses a reusable helper (`packages/ivcap/src/common.ts`):

```ts
export const CommonProps = (name: string) => ({
  name,
  context: () => GetOAuthContext(),
  origin: (_a: any, _s: any, ctxt: OAuthContextT) => ctxt.ivcapURL,
  headers: (_a: any, _s: any, ctxt: OAuthContextT) => ({
    Authorization: `Bearer ${ctxt.token}`,
  }),
  error: restErrorHandling(`ivcap-api:${name}`),
})
```

## Usage: Progress (submitted/result/error) actions

Every REST registration reports lifecycle/progress via **additional Redux actions**. This is useful for:

* showing spinners (request submitted)
* logging / debugging
* building a generic request-tracker in state

The base action namespaces are defined in:

* `packages/core/src/rest/types.ts` for **POST/PUT/PATCH/DELETE** (`Domain = "pi/rest"`)
* `packages/core/src/rest/get.ts` for **GET** (`Domain = "pi/rest"` but `pi/rest/get` subdomain)

### Base action types (POST/PUT/PATCH/DELETE)

In `packages/core/src/rest/types.ts`:

```ts
export const Domain = "pi/rest"
export const ACTION_TYPES = registerActions(Domain, [
  "POST_SUBMITTED",
  "POST_RESULT",
  "POST_ERROR",
  "POST_INTERNAL_ERROR",
  "PUT_SUBMITTED",
  "PUT_RESULT",
  "PUT_ERROR",
  "PUT_INTERNAL_ERROR",
  "PATCH_SUBMITTED",
  "PATCH_RESULT",
  "PATCH_ERROR",
  "PATCH_INTERNAL_ERROR",
  "DELETE_SUBMITTED",
  "DELETE_RESULT",
  "DELETE_ERROR",
  "DELETE_INTERNAL_ERROR",
  "UNAUTHORISED_ERROR",
  "PERMISSION_DENIED_ERROR",
  "NOT_FOUND_ERROR",
  "ERROR",
  "CONTEXT_ERROR",
])
```

For a specific handler registration, the REST worker **specialises** these by appending the handler’s `name`.

For POST/PUT/PATCH/DELETE, the current implementation appends using `:${name}`, e.g.:

* `pi/rest/POST_SUBMITTED:createOrder`
* `pi/rest/POST_RESULT:createOrder`
* `pi/rest/POST_ERROR:createOrder`

### Base action types (GET)

GET uses a different action namespace in `packages/core/src/rest/get.ts`:

* `pi/rest/get/submitted`
* `pi/rest/get/result`
* `pi/rest/get/error`
* `pi/rest/get/internal_error`

and specialises them by appending `/${name}`.

For example, from `packages/core/src/rest/get.ts`:

```ts
const submitType = `${ACTION_TYPES.SUBMITTED}/${name}`
const resultType = `${ACTION_TYPES.RESULT}/${name}`
const errorType = `${ACTION_TYPES.ERROR}/${name}`
const intErrorType = `${ACTION_TYPES.INTERNAL_ERROR}/${name}`
```

### Payload shapes

These lifecycle actions include useful payload:

* **submitted** actions use `SubmitAction` (includes `requestID`, `url`, `bindings`)
* **result** actions use `ResultAction<A>` (includes `statusCode`, `content`, `contentType`, `mimeType`, `size`, `headers`, plus `url` and original `request` action)
* **error** actions use `ErrorAction<A>` (similar to result, plus an `ErrorKind` classification)

If you want to track progress in your app state, these are the actions to listen for.

## Usage: POST / PUT / PATCH (request bodies)

POST/PUT/PATCH all have a request body.

They share the same `request(...)` return type:

```ts
type PoPuPaRequest = {
  body: any
  contentType?: string
  bindings?: Bindings
}
```

### Common request body shape

Common patterns:

* Use `bindings` when your `url` contains `:id` or query bindings.
* For JSON bodies: set `contentType: "application/json"` (or omit it and return an object body).
* For binary bodies: set `contentType` appropriately and pass an `ArrayBuffer`/`Blob`.

### POST

POST creates a new server-side resource.

Minimal typed pattern:

```ts
import type {
  DispatchF,
  PiRegister,
  ReduxAction,
  ReduxState,
  register,
} from "@pihanga2/core"

type MyState = ReduxState

type Thing = { id: string; name: string }
type ThingCreatePayload = { name: string }

type CreateThingAction = ReduxAction & {
  payload: ThingCreatePayload
}

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
}
```

Real example (POST JSON) from `packages/ivcap`:

### Example (POST JSON) from `packages/ivcap`

```ts
import type {
  DispatchF,
  PiRegister,
  ResultAction,
  ReduxAction,
  ReduxState,
  register,
} from "@pihanga2/core"

register((r: PiRegister) => {
  r.POST<ReduxState, ReduxAction & CreateOrderEvent, any>({
    ...CommonProps("createOrder"),
    url: "/1/orders",
    trigger: ORDER_ACTION.CREATE,
    request: (
      action: ReduxAction & CreateOrderEvent,
      _state: ReduxState,
    ) => ({
      body: {
        name: action.name,
        service: action.serviceID,
        parameters: action.parameters,
      },
      contentType: "application/json",
    }),
    reply: (
      _state: ReduxState,
      content: any,
      dispatch: DispatchF,
      result: ResultAction<ReduxAction & CreateOrderEvent>,
    ): void => {
      const ev: OrderCreatedEvent = {
        refID: result.request.refID,
        order: toOrderRecord(content),
      }
      dispatchEvent(ev, ORDER_ACTION.CREATED, dispatch, result.request)
    },
  })
})
```

### PUT

PUT typically replaces a resource at a known URL.

```ts
register.PUT<MyState, UpdateThingAction, Thing>({
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

PATCH typically applies a partial update.

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

DELETE is bindings-only (like GET) but uses method `DELETE`.

```ts
import type {
  Bindings,
  DispatchF,
  PiRegister,
  ResultAction,
  ReduxAction,
  ReduxState,
  register,
} from "@pihanga2/core"

type MyState = ReduxState
type DeleteThingAction = ReduxAction & { id: string }

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

You can attach an `error(...)` handler per call, or centralize handling.

If you want a reusable auth+error strategy, see [Usage: Request context + auth (common pattern)](#usage-request-context--auth-common-pattern).

## Debugging / internals

### Where the code lives

* `packages/core/src/rest/get.ts`
* `packages/core/src/rest/postPutPatch.ts`
* `packages/core/src/rest/delete.ts`
* shared plumbing: `packages/core/src/rest/utils.ts`
* types: `packages/core/src/rest/types.ts`

### How it hooks into Redux

Pihanga’s `PiReducer` is a small registration layer on top of Redux Toolkit’s store (`packages/core/src/reducer.ts`).

When you call `register.GET({...})`, internally it registers reducers for:

* the trigger action (`trigger`)
* the internal success action (which calls your `reply(...)`)
* optionally the internal error action (which calls your `error(...)`)

So the REST system is effectively “middleware implemented as reducers”: it reacts to actions and dispatches more actions.

### Internal action types

You typically don’t dispatch these directly, but they’re helpful to know when debugging Redux logs.

GET (`packages/core/src/rest/get.ts`) creates types like:

* `pi/rest/get/submitted/${name}`
* `pi/rest/get/result/${name}`
* `pi/rest/get/error/${name}`
* `pi/rest/get/internal_error/${name}`

POST/PUT/PATCH/DELETE currently create types like:

* `pi/rest/post_submitted:${name}`
* `pi/rest/put_result:${name}`
* `pi/rest/delete_error:${name}`

### Response parsing

Response parsing is in `packages/core/src/rest/utils.ts`:

* `application/json` => `response.json()` => `RestContentType.Object`
* `application/jose` or `text/*` => `response.text()` => `RestContentType.Text`
* otherwise => `response.blob()` => `RestContentType.Blob`

### Notes / gotchas

* `reply(...)` runs in response to an internal action; keep it fast and dispatch domain actions.
* If `context(...)` is async, the current implementation calls `handleEvent(null as S, ...)` (see `registerCommon`), so don’t rely on the `state` parameter inside `guard/headers/origin` when using `context`.
* Prefer `?name` bindings for optional query parameters so they get omitted cleanly.
