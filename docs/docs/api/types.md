# TypeScript Types

All types are exported from `@pihanga2/core` and `@pihanga2/core/types`.

## `PiCardProps<P, E>`

The combined prop type for a card component. Merges card props with event dispatchers.

```ts
type PiCardProps<P, E> = P & {
  [K in keyof E as `on${Capitalize<string & K>}`]: (payload: E[K]) => void;
} & { dispatch: DispatchF; cardName: string };
```

**Usage:**

```ts
type MyProps = { title: string };
type MyEvents = { onSave: { value: string } };

function MyCard({ title, onSave }: PiCardProps<MyProps, MyEvents>) { ... }
```

## `PiCardDef`

The serialised card instance stored in the Redux state.

```ts
type PiCardDef = {
  cardType: string;
  [key: string]: unknown;
};
```

## `ReduxState`

The base type for the entire Redux state tree.

```ts
type ReduxState = {
  pihanga?: {
    route?: Route;
    reducers?: string[];
  };
  [key: string]: unknown;
};
```

## `ReduxAction`

Base type for all Redux actions in Pihanga.

```ts
type ReduxAction = {
  type: string;
  _id?: string;          // correlation id (auto-generated)
  _replyTo?: string;     // for request/reply patterns
  [key: string]: unknown;
};
```

## `DispatchF`

The typed dispatch function signature.

```ts
type DispatchF = (action: ReduxAction) => string; // returns action._id
```

## `PiReducer`

The handle returned by the reducer factory; passed to `PiRegister.reducer`.

```ts
interface PiReducer {
  register: PiRegisterReducerF;
  registerOneShot: PiRegisterOneShotReducerF;
  dispatch: DispatchF;
  dispatchFromReducer: DispatchF;
}
```

## `ReduceF<S, A>`

The signature of a multi-run reducer function.

```ts
type ReduceF<S extends ReduxState, A extends ReduxAction> = (
  state: S,
  action: A,
  dispatch: DispatchF,
  opts: ReduceOpts<S>,
) => void;
```

## `Route`

```ts
type Route = {
  path: string;
  query: Record<string, string>;
};
```

## REST types

See `@pihanga2/core/rest` for `PiRegisterGetProps`, `PiRegisterPoPuPaProps`,
`PiRegisterDeleteProps`, and related types.
