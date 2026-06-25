# REST API Guide

`@pihanga2/core` provides typed REST helpers that integrate fetch calls with the Redux action lifecycle.

## Registration

All REST handlers are registered inside a `register()` callback:

```ts
import { register } from "@pihanga2/core";

register((r) => {
  r.GET<AppState, FetchItemsAction, Item[]>({
    name: "fetchItems",
    trigger: "FETCH_ITEMS",
    url: "/api/items",
    reply: (state, items, dispatch) => {
      dispatch({ type: "ITEMS_LOADED", items });
    },
    error: (state, err, req, dispatch) => {
      dispatch({ type: "FETCH_FAILED", message: err.message });
    },
  });
});
```

## Supported methods

| Method | Registers |
|---|---|
| `r.GET(props)` | HTTP GET handler |
| `r.POST(props)` | HTTP POST handler |
| `r.PUT(props)` | HTTP PUT handler |
| `r.PATCH(props)` | HTTP PATCH handler |
| `r.DELETE(props)` | HTTP DELETE handler |

## URL parameters

Use `:param` placeholders in the URL — they are interpolated from the triggering action:

```ts
r.GET({
  trigger: "FETCH_ITEM",
  url: "/api/items/:itemId",   // action.itemId fills :itemId
  reply: (state, item, dispatch) => { ... },
});
```

## Request context

The optional `context` function computes per-request data (e.g. auth tokens) from state:

```ts
r.GET({
  trigger: "FETCH_SECURE",
  url: "/api/secure",
  context: async (action, state) => ({
    token: state.auth.accessToken,
  }),
  headers: (action, state, ctx) => ({
    Authorization: `Bearer ${ctx.token}`,
  }),
  reply: (state, data, dispatch) => { ... },
});
```

!!! warning "Context errors"
    If `context` throws, the request is aborted and the `error` handler is called.

## Full documentation

See [REST Usage Reference](rest-usage.md) for the complete API reference,
including `body`, `contentType`, `query`, and error handling options.
