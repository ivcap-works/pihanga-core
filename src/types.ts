export type ReduxState = {
  route: Route;

  pihanga?: { [key: string]: any };
};

export type Route = {
  path: string[];
  query: PathQuery;
  url: string;
  fromBrowser?: boolean;
};
export type PathQuery = { [k: string]: string | number | boolean };

export type ReduxAction = {
  type: string;

  /** Optional correlation id. Used by `dispatchPipe` default reply matching. */
  _id?: string;
};

/**
 * A reply action correlated to an earlier request action via `_replyTo`.
 */
export type ReplyAction = ReduxAction & {
  _replyTo: string;
};

export type CardAction = ReduxAction & {
  cardID: string;
};

export type PiRegisterComponent = {
  name: string;
  component: any; // ReactComponent
  events?: { [key: string]: string };
  // defaults?: { [key: string]: any }
};

export type DispatchPipeTimeoutAction = ReduxAction & {
  cause: "timeout";
  /** Correlation token to route to the correct handler */
  token: string;
  /** The awaited reply action type */
  replyType: string;
};

/**
 * The core reducer function signature used throughout Pihanga.
 *
 * **Immer draft — mutate in place.**
 * The `state` argument is an [Immer](https://immerjs.github.io/immer/) draft proxy.
 * Mutate it directly (`state.foo = value`) and **do not return a value**.
 *
 * **⚠ TypeScript will NOT catch a return value here.**
 * Because `ReduceF` is used as a callback type, TypeScript's `void` return is
 * intentionally permissive for function expressions — a handler that returns a
 * spread copy compiles without error.  At runtime Immer silently discards the
 * returned object, so the state change is **lost with no warning**.
 *
 * @example
 * ```ts
 * // ✅ Correct — mutate the Immer draft in place
 * const handler: ReduceF<AppState, MyAction> = (state, action) => {
 *   state.count += action.delta;
 *   // no return — Immer captures the mutation automatically
 * };
 *
 * // ❌ Wrong — compiles fine but the return value is silently discarded;
 * //            state.count is NOT updated
 * const badHandler: ReduceF<AppState, MyAction> = (state, action) => {
 *   return { ...state, count: state.count + action.delta };
 * };
 * ```
 */
export type ReduceF<S extends ReduxState, A extends ReduxAction> = (
  state: S,
  action: A,
  dispatch: DispatchF,
  opts: ReduceOpts<S>,
) => void;

export type ReduceOnceF<S extends ReduxState, A extends ReduxAction> = (
  state: S,
  action: A,
  dispatch: DispatchF,
  opts: ReduceOpts<S>,
) => boolean; // [S, boolean]

/**
 * Dispatch an action.
 *
 * Ensures `a._id` exists (generating one if needed) and returns it.
 */
export type DispatchF = <T extends ReduxAction>(a: T) => string;

/**
 * Options passed to reducer mappers.
 */
export interface ReduceOpts<S extends ReduxState> {
  /**
   * The current redux state **before** immer's draft wrapping.
   */
  rawState: Readonly<S>;

  /**
   * Resolve a metacard prop that may be a plain value or a `StateMapper`, using
   * the current redux state and (for sub-cards of a metacard) the placement
   * `ctxtProps` of the metacard's top card.
   *
   * Only populated for reducers registered via a card's `onXxx` event-handler
   * prop (i.e. `processEventParameter` in `register_cards.ts`); `undefined`
   * for reducers registered directly with `register.reducer.register` / a
   * `createOnAction` helper outside of a card context.
   *
   * @example
   * ```ts
   * onClicked: (state, ev, dispatch, opts) => {
   *   const current = opts.resolve!(props.value);
   *   state.count = current + 1;
   * },
   * ```
   */
  resolve?: <T>(prop: T | StateMapper<T, any, any>) => T;

  /**
   * Dispatch a request action (after the current reducer has finished) and then
   * handle the next matching reply.
   */
  dispatchPipe: <
    Req extends ReduxAction,
    Rep extends ReplyAction,
    Err extends ReplyAction = never,
  >(
    request: Req,
    opts: {
      /**
       * The awaited reply action type.
       *
       * If omitted, dispatchPipe will listen on "*" and rely on `matchReply` to
       * select the intended reply.
       */
      replyType?: string;

      /**
       * Optional error reply action type.
       *
       * If provided and `matchError` is omitted, dispatchPipe will generate a
       * default matchError which correlates `_replyTo` with `request._id`.
       */
      errorType?: string;

      timeoutMs?: number;

      /**
       * Optional predicate to further filter replies (e.g. by correlation-id).
       *
       * Note: this intentionally takes a generic ReduxAction rather than `Rep`
       * because callers typically do runtime checks on `type` and contextual
       * fields before narrowing.
       */
      matchReply?: (reply: ReplyAction) => boolean;

      /**
       * Optional predicate to treat certain replies as errors.
       *
       * Note: this intentionally takes a generic ReduxAction rather than `Err`
       * because callers typically do runtime checks on `type` and contextual
       * fields.
       */
      matchError?: (reply: ReplyAction) => boolean;
    },
    onReply: ReduceF<S, Rep>,
    onError?: ReduceF<S, Err>,
    onTimeout?: ReduceF<S, DispatchPipeTimeoutAction>,
  ) => string;
}

export interface PiReducer {
  register: PiRegisterReducerF;
  registerOneShot: PiRegisterOneShotReducerF;
  dispatch: DispatchF;
  dispatchFromReducer: DispatchF;

  /**
   * Register a callback to be invoked — inside a live Immer reducer context —
   * when `promise` settles (resolves **or** rejects).
   *
   * Because the callback runs inside `produce()`, you can mutate `state` safely.
   * Exactly one of `result` / `err` will be non-null:
   *   - On fulfillment: `result` is the resolved value, `err` is `null`.
   *   - On rejection:  `result` is `null`, `err` is the rejection reason.
   *
   * @example
   * ```ts
   * // Inside an event handler that has access to `dispatch`:
   * register.reducer.onResolve<AppState, User>(
   *   fetchUser(id),
   *   (state, result, err) => {
   *     if (err) { state.error = String(err); return; }
   *     state.user = result!;
   *   },
   * );
   * ```
   */
  onResolve: <S extends ReduxState, T>(
    promise: Promise<T>,
    callback: (state: S, result: T | null, err: unknown, dispatch: DispatchF) => void,
  ) => Promise<T>;
}

/**
 * C8: the store object Pihanga augments with its own piReducer property.
 * Replaces the three scattered `(store as any).piReducer` casts.
 */
export interface PiStore {
  piReducer: PiReducer;
}

/**
 * C7: canonical event-mapper function type used in CardMapping.eventMappers.
 * Previously the type differed across CardMapping, _createCardMapping, and
 * card.tsx — one source of truth eliminates the drift.
 */
export type EventMapperFn = (ev: ReduxAction, ctxtProps?: any) => ReduxAction | null;

export const DEF_REDUCER_PRIORITY = 0;

export type PiRegisterReducerF = <S extends ReduxState, A extends ReduxAction>(
  eventType: string,
  mapper: ReduceF<S, A>, // (state: S, action: A, dispatch: DispatchF) => S,
  priority?: number,
  key?: string,
  targetMapper?: ReduceF<S, A>,
) => PiReducerCancelF;

export type PiReducerCancelF = () => void;

/**
 * Minimal register surface needed by {@link createOnAction} and
 * {@link createOnDispatch} helpers in redux.ts.  Using this structural type
 * instead of the full PiRegister breaks the redux→index circular dependency.
 */
export type PiRegisterMinimal = {
  reducer: { register: PiRegisterReducerF };
};

// B7: added `key` parameter (was silently missing) and corrected return type
// from `void` to `PiReducerCancelF` — the implementation has always returned a
// cancel function; callers relying on the old type lost both the key and the
// ability to cancel.
export type PiRegisterOneShotReducerF = <S extends ReduxState, A extends ReduxAction>(
  eventType: string,
  mapper: ReduceOnceF<S, A>,
  priority?: number,
  key?: string,
) => PiReducerCancelF;

// CARDS

// context props given to <Card> in parent card
export type PiDefCtxtProps = { [k: string]: any };

// type for <Card .../>
export type CardProp = {
  cardName: PiCardRef;
  cardKey?: string;
  parentCard: string;
} & PiDefCtxtProps;

// props for the 'root' of all cards
export type WindowProps = {
  page: PiCardRef;
  framework?: string; // select framework to render window
  theme?: any; // depends on framework
};

// type which needs to be implemented by card components
export type PiCardProps<P, E = {}> = P & {
  cardName: string;
  children?: React.ReactNode[];
  _cls: (elName: string | string[], className?: string) => string;
  _dispatch: DispatchF;
} & {
  [Key in keyof E]: (ev: E[Key]) => void;
};

export type CSSModuleClasses = { readonly [key: string]: string };

/** The name (registry key) of a registered card. */
export type PiCardName = string;

export type PiCardRef = PiCardName | PiCardDef;

export type RefF = any;
export type StateMapper<T, S extends ReduxState, C = PiDefCtxtProps> = (
  state: S,
  context: StateMapperContext<C>,
) => T;

export type StateMapperContext<C> = {
  cardName: string;
  cardKey?: string;
  ctxtProps: C;
  /**
   * When this card is a sub-card of a metacard, provides the `ctxtProps` that
   * were passed to the metacard's top-level card by its parent. `undefined` for
   * top-level cards or cards that are not part of a metacard.
   *
   * @example
   * ```ts
   * properties: (s, { metaCtxtProps }) => metaCtxtProps.elementData.properties,
   * ```
   */
  metaCtxtProps?: any;
  ref?: RefF;
  /** Resolve a metacard prop that may be a plain value or a StateMapper. */
  resolve: <T>(prop: T | StateMapper<T, any, C>) => T;
};

export type PiMapProps<
  CType,
  S extends ReduxState = ReduxState,
  EType = object,
  C = PiDefCtxtProps,
> = {
  [Property in keyof CType]: CType[Property] | StateMapper<CType[Property], S, C>;
} & EventHandler<EType, S> &
  EventMapper<EType, C>;

/**
 * Maps each event key in `T` to an optional {@link ReduceF} handler.
 *
 * Handlers are Immer reducer recipes — **mutate `state` in place and do not
 * return a value**.  The return type of `ReduceF` is `void`; any value you
 * return is silently discarded by the Immer runtime.
 *
 * @see {@link ReduceF} for the full contract and examples.
 * @see {@link https://immerjs.github.io/immer/produce | Immer docs — produce}
 */
export type EventHandler<T, S extends ReduxState> = {
  [Key in keyof T]?: ReduceF<S, T[Key] & ReduxAction>;
};

/**
 * Context passed as the second argument to an `onXxxMapper` event-mapper
 * function. Extends the raw ctxtProps type `C` with `resolve` — the same
 * `resolve` provided to state mappers via {@link StateMapperContext} — so
 * mappers can read metacard props that may be plain values or state
 * selectors.
 *
 * @example
 * ```ts
 * onClickedMapper: (ev, {resolve}) => ({
 *   type: COUNTER_ACTION.CHANGED,
 *   value: resolve(props.value) + 1,
 * }),
 * ```
 */
export type EventMapperCtxt<C = PiDefCtxtProps> = C & {
  /** Resolve a metacard prop that may be a plain value or a StateMapper. */
  resolve: <T>(prop: T | StateMapper<T, any, C>) => T;
  /**
   * For sub-cards of a metacard, the `ctxtProps` from where the metacard's
   * top card was placed. `undefined` otherwise.
   */
  metaCtxtProps?: any;
};

export type EventMapper<T, C = PiDefCtxtProps> = {
  [Key in keyof T as `${Key & string}Mapper`]?: (
    ev: T[Key],
    ctxt: EventMapperCtxt<C>,
  ) => ReduxAction | null;
};

export type GenericCardParameterT = unknown | StateMapper<unknown, ReduxState, unknown>;

export type PiCardDef = {
  cardType: string;
} & {
  [k: string]: GenericCardParameterT;
};

// METACARD

export type PiRegisterMetaCard = {
  type: string;
  mapper: MetaCardMapperF;
  events?: { [key: string]: string };
};

export type RegisterCardF = (name: string, parameters: PiCardDef) => PiCardName;
export type MetaCardMapperF = (
  name: string,
  props: any,
  registerCard: RegisterCardF,
) => PiCardDef;

// TYPED METACARD HELPERS

/**
 * Typed props for meta-card mappers.
 *
 * **No static/dynamic split at runtime.** Every prop a metacard call-site can
 * supply — whether declared as `DynProps` or `StaticProps` — is delivered to
 * the mapper as a `StateMapper<T, S, C>` and MUST be read via `resolve()`.
 * This is what allows the underlying framework to keep every metacard prop
 * reactive: the call-site's *current* value (plain or selector) is re-read on
 * every `resolve()` call, not frozen at the time the mapper first ran.
 *
 * The `DynProps` / `StaticProps` split is purely a **call-site** convenience —
 * see `createCardDeclaration2` — for cases where you want to document which
 * props a card author expects to vary. It has no effect on how the mapper
 * receives or must read the prop.
 *
 * Event handler/mapper keys are inherited from `PiMapProps<object, S, Events, C>`,
 * since `EventHandler` and `EventMapper` are not individually exported from core.
 *
 * @typeParam DynProps    - Props documented as "expected to vary".
 * @typeParam StaticProps - Props documented as "expected to stay fixed".
 * @typeParam Events      - Event handler/mapper types.
 * @typeParam S           - Redux state type (defaults to `ReduxState`).
 * @typeParam C           - Context type (defaults to `PiDefCtxtProps`).
 *
 * @example
 * ```ts
 * type MyDynProps    = { value: number };
 * type MyStaticProps = { label: string };
 * type MyEvents      = { onChange: { value: number } };
 *
 * function MyMapper(
 *   _: string,
 *   props: PiMetaProps<MyDynProps, MyStaticProps, MyEvents>,
 *   registerCard: RegisterCardF,
 * ): PiCardDef {
 *   // Both props.value and props.label are StateMapper<T> — always resolve():
 *   const label = resolve(props.label);
 *   ...
 * }
 * ```
 */
export type PiMetaProps<
  DynProps,
  StaticProps = object,
  Events = object,
  S extends ReduxState = ReduxState,
  C = PiDefCtxtProps,
> = {
  readonly [K in keyof DynProps]: StateMapper<DynProps[K], S, C>;
} & {
  readonly [K in keyof StaticProps]: StateMapper<StaticProps[K], S, C>;
} & PiMapProps<object, S, Events, C>;

/**
 * A narrowed resolve context for `PiMetaProps`-typed mappers.
 *
 * Unlike `StateMapperContext.resolve` which accepts `T | StateMapper<T>`, this
 * variant accepts **only** `StateMapper<T>` — matching the fact that every
 * `PiMetaProps` prop (dynamic or static) is always delivered as a selector.
 *
 * Structurally compatible with `StateMapperContext`, so it can be used as an
 * annotation on the `ctx` parameter of a child card's prop function:
 *
 * ```ts
 * Box({
 *   content: ((_, ctx: PiMetaResolveCtx) => {
 *     const ref = ctx.resolve(props.main); // props.main is StateMapper<PiCardRef>
 *     return ref ? [ref] : [];
 *   }) as unknown as PiCardRef[],
 * })
 * ```
 */
export type PiMetaResolveCtx<S extends ReduxState = ReduxState, C = PiDefCtxtProps> = {
  resolve: <T>(prop: StateMapper<T, S, C>) => T;
};
