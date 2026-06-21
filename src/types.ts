export type ReduxState = {
  route: Route;

  pihanga?: {[key: string]: any};
};

export type Route = {
  path: string[];
  query: PathQuery;
  url: string;
  fromBrowser?: boolean;
};
export type PathQuery = {[k: string]: string | number | boolean};

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
  events?: {[key: string]: string};
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
}

export const DEF_REDUCER_PRIORITY = 0;

export type PiRegisterReducerF = <S extends ReduxState, A extends ReduxAction>(
  eventType: string,
  mapper: ReduceF<S, A>, // (state: S, action: A, dispatch: DispatchF) => S,
  priority?: number,
  key?: string,
  targetMapper?: ReduceF<S, A>,
) => PiReducerCancelF;

export type PiReducerCancelF = () => void;

export type PiRegisterOneShotReducerF = <
  S extends ReduxState,
  A extends ReduxAction,
>(
  eventType: string,
  mapper: ReduceOnceF<S, A>,
  priority?: number,
) => void;

// CARDS

// context props given to <Card> in parent card
export type PiDefCtxtProps = {[k: string]: any};

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

export type CSSModuleClasses = {readonly [key: string]: string};

export type PiCardRef = string | PiCardDef;

export type RefF = any;
export type StateMapper<T, S extends ReduxState, C = PiDefCtxtProps> = (
  state: S,
  context: StateMapperContext<C>,
) => T;

export type StateMapperContext<C> = {
  cardName: string;
  cardKey?: string;
  ctxtProps: C;
  ref?: RefF;
};

export type PiMapProps<
  CType,
  S extends ReduxState,
  EType = {},
  C = PiDefCtxtProps,
> = {
  [Property in keyof CType]:
    | CType[Property]
    | StateMapper<CType[Property], S, C>;
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

export type EventMapper<T, C = PiDefCtxtProps> = {
  [Key in keyof T as `${Key & string}Mapper`]?: (
    ev: T[Key],
    ctxt: C,
  ) => ReduxAction | null;
};

export type GenericCardParameterT =
  | unknown
  | StateMapper<unknown, ReduxState, unknown>;

export type PiCardDef = {
  cardType: string;
} & {
  [k: string]: GenericCardParameterT;
};

// METACARD

export type PiRegisterMetaCard = {
  type: string;
  mapper: MetaCardMapperF;
  events?: {[key: string]: string};
};

export type RegisterCardF = (name: string, parameters: PiCardDef) => PiCardRef;
export type MetaCardMapperF = (
  name: string,
  props: any,
  registerCard: RegisterCardF,
) => PiCardDef;
