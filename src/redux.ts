import { PiRegister, register } from ".";
import { pihanga as logger } from "./logger";
import {
  CardAction,
  DispatchF,
  PiReducerCancelF,
  ReduceF,
  ReduxState,
  ReplyAction,
} from "./types";

const ns2Actions: { [k: string]: boolean } = {};

/**
 * Register a set of actions for a particular namespace.
 *
 * The 'actions' parameter is an array of local action
 * names which will be converted into a hash where the local name
 * is the key and the value is of the pattern 'namespace:name'.
 *
 * The function returns the hash registered under this namespace.
 *
 * @param {string} namespace
 * @param {hash||array} actions
 */
export function registerActions<T extends string>(
  namespace: string,
  actions: readonly T[],
): { [S in Uppercase<T>]: string } {
  if (ns2Actions[namespace]) {
    logger.warn(`Overwriting action namespace  "${namespace}"`);
  }
  const ah: any = {};
  actions.forEach((a) => {
    ah[a.toUpperCase()] = `${namespace}/${a}`;
  });
  logger.info(`Register action ns "${namespace}"`);
  ns2Actions[namespace] = true;
  return ah as { [S in Uppercase<T>]: string };
}

export function actionTypesToEvents(actionTypes: { [k: string]: string }): {
  [k: string]: string;
} {
  return Object.entries(actionTypes).reduce(
    (p, el) => {
      const [k, v] = el;
      const n = k
        .split("_")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
        .join("");
      p[`on${n}`] = v;
      return p;
    },
    {} as { [k: string]: string },
  );
}

/**
 * Returns a helper function that registers a {@link ReduceF} reducer for
 * `actionType` when you later call it with a `PiRegister`.
 *
 * **Immer reducer contract:** the handler receives an Immer draft as `state`.
 * Mutate the draft directly — **do not** return a spread copy.
 * Any return value is silently discarded.
 *
 * @param actionType The Redux action type string to listen for.
 * @returns A registration function `(register, handler) => void`.
 *
 * @example
 * ```ts
 * import { createOnAction, type PiRegister } from "@pihanga2/core";
 * import type { AppState } from "./app.types";
 *
 * type IncrEvent = { delta: number };
 *
 * // Step 1 — create the helper once at module level
 * const onIncrement = createOnAction<IncrEvent>("COUNTER/INCREMENT");
 *
 * // Step 2 — register it inside an init function
 * export function init(register: PiRegister): void {
 *   onIncrement<AppState>(register, (state, action) => {
 *     // ✅ Mutate the Immer draft in place — no return needed
 *     state.count += action.delta;
 *
 *     // ❌ Do NOT do this — spreading creates a plain object and
 *     //    the return value is silently discarded anyway
 *     // return { ...state, count: state.count + action.delta };
 *   });
 * }
 * ```
 */
export function createOnAction<E>(
  actionType: string,
): <S extends ReduxState>(register: PiRegister, f: ReduceF<S, CardAction & E>) => void {
  return (register, f) => {
    register.reducer.register(actionType, f);
  };
}

/**
 * Creates a typed fire-and-forget dispatch function.
 *
 * Usage:
 *   export const dispatchFetchCatalog = createOnDispatch<FetchCatalogEvent>(
 *     CATALOG_ACTION.FETCH_CATALOG,
 *   );
 *   dispatchFetchCatalog(dispatch, { catalogUrlPrefix });
 */
export const createOnDispatch =
  <TEvent extends object>(action: string) =>
  (d: DispatchF, ev: TEvent): void => {
    d({ ...ev, type: action });
  };

/**
 * Dispatches `dispatchAction` and registers one-shot reducers that call
 * `onReply` (or optional `onError`) synchronously *inside* the active Immer
 * `produce()` call when the awaited action arrives.
 *
 * Because the callbacks run while the draft is still live, state mutations
 * are safe — unlike a Promise-based approach where the Immer proxy would
 * already be revoked by the time an `await` continuation resumes.
 *
 * Usage:
 *   const fetchDocument = createOnDispatchPipe<FetchDocumentEvent, DocumentFetchedEvent, DocumentFetchErrorEvent>(
 *     CATALOG_ACTION.FETCH_DOCUMENT,
 *     CATALOG_ACTION.DOCUMENT_FETCHED,
 *     CATALOG_ACTION.DOCUMENT_FETCH_ERROR,
 *   );
 *
 *   // Inside a reducer — `state` is the live Immer draft, mutations are safe:
 *   fetchDocument(dispatch, { url, catalogID, documentType },
 *     (state, result) => { state.document = result.document },
 *     (state, err)    => { state.error = err.message },
 *   );
 */
export const createOnDispatchPipe =
  <TEvent extends object, TResult extends object, TError extends object = object>(
    dispatchAction: string,
    awaitAction: string,
    errorAwaitAction?: string,
  ) =>
  <S extends ReduxState = ReduxState>(
    d: DispatchF,
    ev: TEvent,
    onReply: ReduceF<S, TResult & ReplyAction>,
    onError?: ReduceF<S, TError & ReplyAction>,
  ): void => {
    const evID = d({ ...ev, type: dispatchAction });

    function isReply(a: ReplyAction): boolean {
      const replyTo = a._replyTo;
      if (!replyTo) {
        console.warn("action is not a ReplyAction", a);
        return false;
      }
      return replyTo === evID;
    }

    register((r) => {
      let ec: PiReducerCancelF | null = null;
      const rc = r.reducer.registerOneShot<S, TResult & ReplyAction>(
        awaitAction,
        (s, a, d, opts) => {
          if (!isReply(a)) return false;
          if (ec) ec();
          onReply(s, a, d, opts);
          return true;
        },
        0,
        evID,
      );
      if (errorAwaitAction && onError) {
        ec = r.reducer.registerOneShot<S, TError & ReplyAction>(
          errorAwaitAction,
          (s, a, d, opts) => {
            if (!isReply(a)) return false;
            rc();
            onError(s, a, d, opts);
            return true;
          },
          0,
          evID,
        );
      }
    });
  };
