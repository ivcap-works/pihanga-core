import ReactDOM from "react-dom/client";
import { Dispatch } from "react";

import {
  PiCardDef,
  PiCardName,
  PiRegisterComponent,
  ReduxAction,
  ReduxState,
  PiReducer,
  PiRegisterMetaCard,
  PiMapProps,
  WindowProps,
  GenericCardParameterT,
} from "./types";
import {
  addCard,
  addCardComponent,
  registerMetacard,
  updateOrRegisterCard,
} from "./register_cards";
import { createReducer, getActiveDraft } from "./reducer";
import { createDraft, finishDraft } from "immer";
import { ON_INIT_ACTION, currentRoute, init as routerInit } from "./router";

import { configureStore, isPlain, Store } from "@reduxjs/toolkit";

//import monitorReducerEnhancer from "./monitor_enhancer"
import { getLogger } from "./logger";
import {
  PiRegisterDeleteProps,
  PiRegisterGetProps,
  PiRegisterPoPuPaProps,
  registerDELETE,
  registerGET,
  registerPATCH,
  registerPOST,
  registerPUT,
} from "./rest";
import { RootComponent } from "./root";
import { RegisterCardState } from "./card";
const logger = getLogger("root");

export type {
  PiMapProps,
  PiMetaProps,
  PiMetaResolveCtx,
  PiCardDef,
  RegisterCardF,
  ReduxState,
  ReduxAction,
  ReplyAction,
  DispatchF,
  ReduceF,
  ReduceOpts,
  PiDefCtxtProps,
  StateMapperContext,
  StateMapper,
  PiReducer,
  PiRegisterMetaCard,
  WindowProps,
} from "./types";
export {
  registerActions,
  actionTypesToEvents,
  createOnAction,
  createOnDispatch,
  createOnDispatchPipe,
} from "./redux";
export { Card, usePiReducer, cls_f } from "./card";
export {
  memo,
  mapProp,
  createCardDeclaration,
  createCardDeclaration2,
  isCardRef,
} from "./register_cards";
export { getLogger } from "./logger";
export type { PiCardProps, PiCardName, PiCardRef } from "./types";
export type { ErrorAction as RestErrorAction } from "./rest";
export { RestContentType } from "./rest";
export * from "./rest";

export { uuidv7 } from "./uuid";

export {
  showPage,
  onInit,
  onShowPage,
  createShowPageAction,
  onNavigateToPage,
} from "./router";
export type { ShowPageEvent, NavigateToPageEvent } from "./router";

export interface PiRegister {
  //window(parameters: PiCardDef): PiCardRef

  window<S extends ReduxState>(parameters: PiMapProps<WindowProps, S, {}>): string;

  card(name: string, parameters: PiCardDef): PiCardName;
  updateCard(name: string, parameters: { [key: string]: GenericCardParameterT }): string;

  cardComponent(declaration: PiRegisterComponent): void;

  /**
   * Register a meta card which expands a single card definition of type `name`
   * into a new set of cards which can be registered in turn through `registerCards`.
   *
   * The `mapper` function in the declaration takes the property declaration and
   * uses the common `PiRegister` to define the inner content of this meta card.
   *
   * @param declaration - The meta card declaration containing `type`, `mapper`, and optional `events`.
   */
  metaCard<C>(declaration: PiRegisterMetaCard): void;

  GET<S extends ReduxState, A extends ReduxAction, R, C = any>(
    props: PiRegisterGetProps<S, A, R, C>,
  ): void;
  PUT<S extends ReduxState, A extends ReduxAction, R, C = any>(
    props: PiRegisterPoPuPaProps<S, A, R, C>,
  ): void;
  POST<S extends ReduxState, A extends ReduxAction, R, C = any>(
    props: PiRegisterPoPuPaProps<S, A, R, C>,
  ): void;
  PATCH<S extends ReduxState, A extends ReduxAction, R, C = any>(
    props: PiRegisterPoPuPaProps<S, A, R, C>,
  ): void;
  DELETE<S extends ReduxState, A extends ReduxAction, R, C = any>(
    props: PiRegisterDeleteProps<S, A, R, C>,
  ): void;
  //registerPeriodicGET<S extends ReduxState, A extends ReduxAction, R>(props: PiRegisterPeridicGetProps<S, A, R>): void;

  reducer: PiReducer;

  /**
   * Run `fn` with the current Redux state as a **mutable Immer draft**,
   * then automatically commit the mutations back to the store.
   *
   * - **Inside a reduce cycle**: `fn` receives the live draft — mutations
   *   are committed when the reducer returns (no extra dispatch needed).
   * - **Outside a reduce cycle** (e.g. after `await`): a fresh
   *   `createDraft(store.getState())` is created, `fn` is called,
   *   `finishDraft` is called, and the result is dispatched as
   *   `pi/withState/commit`.
   *
   * ```ts
   * async onFoo(s: AppState, action, dispatch) {
   *   const x = await fetchSomething();   // original draft expired
   *   r.withState<AppState>((s) => {
   *     s.items[action.id] = x;           // safe mutation
   *   });
   * }
   * ```
   */
  withState<S extends ReduxState>(fn: (s: S) => void): void;
}

/** Callback passed to {@link register} — receives the fully initialised {@link PiRegister} instance. */
export type RegisterCbk = (register: PiRegister) => void;

// These remain private and shared across all imports
let registerF: PiRegister | null = null;
let pendingRegistrations: RegisterCbk[] = [];

/** Module-level store reference set by start(). */
let _store: { getState: () => unknown } | null = null;

function setRegisterF<T>(f: PiRegister): void {
  registerF = f;

  // Flush buffer
  while (pendingRegistrations.length > 0) {
    const cbk = pendingRegistrations.shift();
    if (cbk) {
      cbk(registerF);
    }
  }
}

// Register a callback which allows for eventual
// registration when the Pihanga environment is setup
//
// Usage:
//
// import {register} from "@pihanga2/core";
// register((register: PiRegister) => {
//   register.foo(..)
// });
//
export function register(cbk: RegisterCbk): void {
  if (registerF) {
    cbk(registerF);
  } else {
    pendingRegistrations.push(cbk);
  }
}

// Added: Helper to clear the buffer if needed
export function clearPendingRegistration(): void {
  pendingRegistrations = [];
}

// Register a card component
//
// Usage:
//
// import {registerCardComponent} from "@pihanga2/core";
// registerCardComponent({
//   name: JSON_VIEWER_CARD,
//   component: ImageViewerComponent,
//   events: actionTypesToEvents(JSON_VIEWER_ACTION),
// })
//
export function registerCardComponent(declaration: PiRegisterComponent) {
  register((r: PiRegister) => r.cardComponent(declaration));
}

// Register a metacard type at module-load time — no init function needed.
// Identical pattern to registerCardComponent: the call is buffered and
// replayed once start() has wired up PiRegister.
//
// Usage:
//
// import {registerMetaCard} from "@pihanga2/core";
// registerMetaCard({ type: "my/meta", mapper, events })
//
// Simply importing the file that calls this is enough — no explicit init().
export function registerMetaCard(declaration: PiRegisterMetaCard) {
  register((r: PiRegister) => r.metaCard(declaration));
}

// Register a card
//
// Usage:
//
// import {registerCard} from "@pihanga2/core";
// registerCard("page/main"", FlexGrid({...}))
//
export function registerCard(name: string, parameters: PiCardDef) {
  register((r: PiRegister) => r.card(name, parameters));
}

export function registerFramework(parameters: PiCardDef) {
  register((r: PiRegister) => r.card("_window", parameters));
}

/**
 * Run `fn` with the current Redux state as a **mutable Immer draft**,
 * then automatically commit the mutations back to the store.
 *
 * Must be called after {@link start} has been invoked.
 */
export function withState<S extends ReduxState>(fn: (s: S) => void): void {
  if (!_store) {
    throw new Error("withState() called before start() — store not yet initialised");
  }
  const active = getActiveDraft();
  if (active) {
    fn(active as S);
    return;
  }
  const draft = createDraft(_store.getState() as S) as unknown as S;
  fn(draft);
  const next = finishDraft(draft);
  (_store as any).dispatch({ type: "pi/withState/commit", next });
}

export const DEFAULT_REDUX_STATE = {
  route: { path: [], query: {}, url: "", fromBrowser: false },
  pihanga: {},
};

export type StartProps = {
  // redux settins
  /**
   * Enable the debug card-state subsystem.  Defaults to `false`.
   *
   * When `false` (default): `state.pihanga.cards` is still populated with a
   * lightweight string array of card names whose props changed in the last
   * render cycle (mirrors `state.pihanga.reducers`).
   *
   * When `true`: additionally writes the full resolved card props into
   * `state.pihanga.cardProps` on every render cycle.  Opt-in only when you
   * need the Redux DevTools detailed card view, as it adds a `produce()` pass
   * over the full state on every card render.
   */
  debugCardState?: boolean;
  /**
   * When `true`, RTK's serializable-state middleware check is disabled entirely.
   * Use this as a last resort when your state intentionally contains non-serializable
   * values (e.g. class instances, functions) that cannot be listed individually in
   * `ignoredStatePaths`.  Prefer `ignoredStatePaths` for surgical suppression.
   */
  disableSerializableStateCheck?: boolean;

  /**
   * When `true`, RTK's serializable-action middleware check is disabled entirely.
   * Use this as a last resort when dispatched actions intentionally carry
   * non-serializable payloads that cannot be listed individually in
   * `ignoredActions` / `ignoredActionPaths`.
   */
  disableSerializableActionCheck?: boolean;

  /**
   * Redux action `type` strings that should be exempt from RTK's serializable
   * middleware check.  Merged with Pihanga's own built-in exemptions.
   *
   * @example
   * ```ts
   * ignoredActions: ["MY_FEATURE/UPLOAD_FILE"]
   * ```
   */
  ignoredActions?: string[];

  /**
   * Dot-notation paths **within action payloads** that RTK's serializable check
   * should ignore.  Merged with Pihanga's own built-in exemptions (e.g. `"mapper"`,
   * `"content"`, `"cause"`).
   *
   * @example
   * ```ts
   * ignoredActionPaths: ["payload.file", "meta.timestamp"]
   * ```
   */
  ignoredActionPaths?: string[];

  /**
   * Dot-notation paths **within the Redux state** that RTK's serializable check
   * should ignore.  Merged with Pihanga's own built-in exemptions (e.g.
   * `"cause.content"`).
   *
   * @example
   * ```ts
   * ignoredStatePaths: ["upload.fileHandle"]
   * ```
   */
  ignoredStatePaths?: string[];

  rootComponent?: (store: Store) => React.JSX.Element;

  /**
   * Predicate used by Redux Toolkit's `serializableCheck`.
   *
   * By default RTK considers only "plain" JS values/objects serializable.
   * If your app intentionally carries extra types (e.g. `Date`) in actions/state,
   * you can extend this function:
   *
   * ```ts
   * isSerializable: (v) => isPlain(v) || v instanceof Date
   * ```
   *
   * This is useful for allowing things like Luxon DateTime, Map/Set wrappers,
   * etc. (Prefer normalizing to plain data where possible.)
   */
  isSerializable?: (value: unknown) => boolean;
};

export function start<S extends Partial<ReduxState>>(
  initialState: S,
  inits: ((register: PiRegister) => void)[] = [],
  props: StartProps = {},
): PiRegister {
  const state = {
    ...DEFAULT_REDUX_STATE,
    ...initialState,
    ...{ route: currentRoute() }, // override route with current one
  };
  let dispatchF: Dispatch<any> | null = null;
  const dispatcherW: Dispatch<any> = (a: any): void => {
    if (dispatchF) {
      dispatchF(a);
    } else {
      logger.error("dispatch function is not properly set");
    }
  };
  const [reducer, piReducer] = createReducer(state, dispatcherW);
  const route = routerInit(piReducer);

  const ignoredActions = ([] as string[]).concat(props.ignoredActions || []);
  const ignoredActionPaths = [
    "apiURL", // from IVCAP
    "mapper",
    "content", // from REST
    "request",
    // B8: "headers" removed — HttpResponse.headers is now a plain {[k: string]: string}
    // object (Object.fromEntries(response.headers.entries())) so it is serialisable.
    "cause",
    "data",
  ].concat(props.ignoredActionPaths || []);
  const ignoredPaths = ["cause.content"].concat(props.ignoredStatePaths || []);

  const isSerializable = props.isSerializable ?? isPlain;

  const store = configureStore({
    reducer,
    preloadedState: state as any, // keep type checking happy
    // enhancers: [monitorReducerEnhancer as unknown as StoreEnhancer],
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions,
          ignoredActionPaths,
          ignoredPaths,
          ignoreState: props.disableSerializableStateCheck,
          ignoreAction: props.disableSerializableActionCheck,
          isSerializable,
        },
      }),
  });
  // make pihanga's reducer interface available to cards
  const anyStore: any = store;
  anyStore.piReducer = piReducer;

  dispatchF = store.dispatch;

  // A9: only activate the debug card-state subsystem when explicitly requested.
  RegisterCardState.setEnabled(props.debugCardState ?? false);

  const card = addCard(piReducer.register, dispatchF);
  const updateCard = updateOrRegisterCard(piReducer.register, dispatchF);
  const window = <S extends ReduxState>(p: PiMapProps<WindowProps, S, {}>): string => {
    return card("_window", { cardType: "framework", ...p });
  };

  _store = store;

  const register: PiRegister = {
    window,
    card,
    updateCard,
    cardComponent: addCardComponent,
    metaCard: registerMetacard(card),
    reducer: piReducer,
    GET: registerGET(piReducer),
    PUT: registerPUT(piReducer),
    POST: registerPOST(piReducer),
    PATCH: registerPATCH(piReducer),
    DELETE: registerDELETE(piReducer),
    withState: <S extends ReduxState>(fn: (s: S) => void) => withState<S>(fn),
  };
  setRegisterF(register);

  inits.forEach((f) => f(register));

  piReducer.dispatch({ type: ON_INIT_ACTION });

  const rootComp = props.rootComponent
    ? props.rootComponent(store)
    : RootComponent(store);
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  root.render(rootComp);

  // C3: removed duplicate setRegisterF(register) call that was here
  return register;
}
