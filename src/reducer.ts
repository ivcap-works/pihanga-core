import { Action, Reducer } from "@reduxjs/toolkit";
import {
  DispatchF,
  DispatchPipeTimeoutAction,
  PiReducer,
  PiReducerCancelF,
  PiRegisterOneShotReducerF,
  PiRegisterReducerF,
  ReduceOpts,
  ReduceF,
  ReduceOnceF,
  ReduxAction,
  ReduxState,
} from "./types";
import { produce, isDraft, current } from "immer";
import { RegisterCardState, UPDATE_STATE_ACTION } from "./card";
import StackTrace from "stacktrace-js";
import { getLogger } from "./logger";
import { Dispatch } from "react";
import { uuidv7 } from "./uuid";

const logger = getLogger("reducer");

/** The Immer draft currently being mutated inside a `produce` call, or `null` when idle. */
let _activeDraft: ReduxState | null = null;

/**
 * Returns the Immer draft that is active for the current Redux reduce cycle,
 * or `null` when called outside of one.
 */
export function getActiveDraft(): ReduxState | null {
  return _activeDraft;
}

type ReducerDef<S extends ReduxState, A extends ReduxAction> = {
  mapperMulti?: ReduceF<S, A>;
  mapperOnce?: ReduceOnceF<S, A>;
  priority?: number;
  key?: string;
  /** Always-set internal id used for cancellation and one-shot consumption. */
  _internalId?: string;
  definedIn?: StackTrace.StackFrame;
  targetMapper?: ReduceF<S, A>;
};

type Source = {
  file?: string;
  line?: number;
  column?: number;
  functionName?: string;
};

export function createReducer(
  initialState: ReduxState,
  dispatcher: Dispatch<any>,
): [Reducer<ReduxState, Action>, PiReducer] {
  const WITH_STATE_COMMIT = "pi/withState/commit";

  const mappings: { [k: string]: ReducerDef<ReduxState, Action>[] } = {};
  mappings[UPDATE_STATE_ACTION] = [
    {
      mapperMulti: RegisterCardState.reducer,
      key: "@builtin:card:UPDATE_STATE_ACTION",
    },
  ];
  mappings[WITH_STATE_COMMIT] = [
    {
      mapperMulti: (_draft, action: any) => action.next,
      key: "@builtin:withState:commit",
    },
  ];

  const ensureId = <T extends ReduxAction>(a: T): string => {
    if (!a._id) {
      a._id = uuidv7();
    }
    return a._id;
  };

  const delayedDispatcher: DispatchF = (a: any): string => {
    const id = ensureId(a);
    deproxyAction(a);
    setTimeout(() => dispatcher(a), 0);
    return id;
  };

  const DISPATCH_PIPE_REDUCE_TIMEOUT_TYPE = "pi/dispatchPipe/timeout";

  const dispatchPipe: ReduceOpts<ReduxState>["dispatchPipe"] = (
    request,
    pOpts,
    onReply,
    onError,
    onTimeout,
  ) => {
    // Ensure request has a correlation id.
    const requestId = ensureId(request as any);

    const {
      replyType,
      errorType,
      timeoutMs = 10000,
      matchReply: userMatchReply,
      matchError: userMatchError,
    } = pOpts;

    // Default matching behaviour:
    // If the caller didn't provide a matchReply but did provide a replyType,
    // then match on both action type and correlation fields:
    //   reply.type === replyType && reply._replyTo === request._id
    //
    // This is intentionally done at runtime because action shapes are
    // application-specific.
    const matchReply = (() => {
      if (userMatchReply) return userMatchReply;

      if (!replyType) {
        throw new Error(
          "dispatchPipe: either opts.replyType or opts.matchReply must be provided",
        );
      }

      return (reply: any) => reply?.type === replyType && reply?._replyTo === requestId;
    })();

    // Default error matching behaviour (optional):
    // If the caller didn't provide a matchError but did provide an errorType,
    // then match on both action type and correlation fields:
    //   reply.type === errorType && reply._replyTo === request._id
    //
    // If neither errorType nor matchError are provided, no error reporting is
    // performed.
    const matchError = (() => {
      if (userMatchError) return userMatchError;
      if (!errorType) return undefined;

      return (reply: any) => reply?.type === errorType && reply?._replyTo === requestId;
    })();

    // Use a token so we can route timeout actions.
    const token = `${Date.now()}:${Math.random()}`;

    // Use `register` (not registerOneShot) so we can cancel explicitly.
    const keyReply = `dispatchPipe:reply:${replyType || "*"}:${token}`;
    const keyError = `dispatchPipe:error:${errorType || "-"}:${token}`;
    const keyTimeout = `dispatchPipe:timeout:${replyType || "*"}:${token}`;

    let settled = false;

    let cancelReply: PiReducerCancelF = () => {};
    let cancelError: PiReducerCancelF = () => {};
    let cancelTimeout: PiReducerCancelF = () => {};
    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      cancelReply();
      cancelError();
      cancelTimeout();
      if (timer) {
        clearTimeout(timer);
      }
    };

    // Reply handler: decides whether to call onReply or onError.
    const handler = (s2: any, a2: any, d2: any, o2: any) => {
      if (settled) return;

      // Only consider errors if an explicit onError handler was provided.
      const isError = !!onError && matchError ? matchError(a2) : false;
      const isReply = matchReply ? matchReply(a2) : false;
      if (!isReply && !isError) return;

      settled = true;
      cleanup();

      if (isError) {
        // TypeScript can't infer `onError` from `isError`, so guard explicitly.
        if (onError) onError(s2, a2, d2, o2);
        return;
      }

      onReply(s2, a2, d2, o2);
    };

    cancelReply = registerReducer(replyType || "*", handler, 0, keyReply);

    // If errorType differs from replyType, register a second handler so we can
    // settle on errors too.
    if (onError && errorType && replyType !== "*" && replyType !== errorType) {
      cancelError = registerReducer(errorType, handler, 0, keyError);
    }

    // Timeout handler: triggered by a dispatched internal timeout action.
    // Only register a timeout when a handler was provided — without one
    // there is nothing to do on expiry and we must NOT silently cancel the
    // reply listener (that would cause the reply to be missed when callers
    // use vi.runAllTimers() or similar in tests, or if the reply simply
    // arrives after the default timeout period).
    if (onTimeout) {
      cancelTimeout = registerReducer(
        DISPATCH_PIPE_REDUCE_TIMEOUT_TYPE,
        (s2: any, a2: any, d2: any, o2: any) => {
          if (settled) return;
          if (!a2 || a2.token !== token) return;
          settled = true;
          cleanup();
          onTimeout(s2, a2, d2, o2);
        },
        0,
        keyTimeout,
      );

      timer = setTimeout(() => {
        if (settled) return;
        const timeoutAction: DispatchPipeTimeoutAction = {
          type: DISPATCH_PIPE_REDUCE_TIMEOUT_TYPE,
          cause: "timeout",
          token,
          replyType: replyType || "*",
        };
        delayedDispatcher(timeoutAction);
      }, timeoutMs);
    }

    // Must dispatch after the current reducer tick.
    delayedDispatcher(request);

    return requestId;
  };
  const reducer = (state: ReduxState | undefined, action: Action): ReduxState => {
    const s = state || initialState;
    const ra = mappings[action.type];
    const rany = mappings["*"];
    if ((!ra || ra.length === 0) && (!rany || rany.length === 0)) {
      const staleReducers =
        Array.isArray(s.pihanga?.reducers) && (s.pihanga.reducers as any[]).length > 0;
      const staleCards =
        Array.isArray(s.pihanga?.cards) && (s.pihanga.cards as string[]).length > 0;
      if (staleReducers || staleCards) {
        return produce<ReduxState, ReduxState>(s, (draft) => {
          if (draft.pihanga) {
            draft.pihanga.reducers = [];
            draft.pihanga.cards = [];
          }
        });
      }
      return s;
    }

    const nextState = produce<ReduxState, ReduxState>(s, (draft) => {
      _activeDraft = draft;
      try {
        const opts: ReduceOpts<ReduxState> = {
          rawState: s,
          dispatchPipe: dispatchPipe,
        };
        if (!draft.pihanga) {
          draft.pihanga = {};
        }
        draft.pihanga.reducers = [];
        draft.pihanga.cards = [];
        if (ra) {
          // B5: _reduce returns only the keys of consumed one-shots; we remove
          // them from the LIVE mapping so any reducers added during the loop
          // (e.g. by dispatchPipe or by a handler that calls piReducer.register)
          // are not clobbered by a wholesale array replacement.
          const consumed = _reduce(ra, draft, action, delayedDispatcher, opts);
          if (consumed.length > 0) {
            mappings[action.type] = (mappings[action.type] || []).filter(
              (m) => !m._internalId || !consumed.includes(m._internalId),
            );
          }
        }
        if (rany) {
          const consumed2 = _reduce(rany, draft, action, delayedDispatcher, opts);
          if (consumed2.length > 0) {
            mappings["*"] = (mappings["*"] || []).filter(
              (m) => !m._internalId || !consumed2.includes(m._internalId),
            );
          }
        }
      } finally {
        _activeDraft = null;
      }
      return;
    });
    return nextState;
  };

  const registerReducer: PiRegisterReducerF = <
    S extends ReduxState,
    A extends ReduxAction,
  >(
    eventType: string,
    mapper: ReduceF<S, A>,
    priority: number = 0,
    key?: string,
    targetMapper?: ReduceF<S, A>,
  ): PiReducerCancelF => {
    return addReducer(eventType, {
      mapperMulti: mapper,
      priority,
      key,
      targetMapper,
    });
  };

  const registerOneShot: PiRegisterOneShotReducerF = <
    S extends ReduxState,
    A extends ReduxAction,
  >(
    eventType: string,
    mapper: ReduceOnceF<S, A>,
    priority: number = 0,
    key: string | undefined = undefined,
  ): PiReducerCancelF => {
    return addReducer(eventType, { mapperOnce: mapper, priority, key });
  };

  function addReducer<S extends ReduxState, A extends ReduxAction>(
    eventType: string,
    reducerDef: ReducerDef<S, A>,
  ): PiReducerCancelF {
    let m = mappings[eventType] || [];
    const key = reducerDef.key;
    if (key) {
      // replace a reducer with the same key
      m = removeReducer(key, m);
    }
    // Always assign an internal id so cancel and one-shot consumption work
    // even when no user-facing key was provided.
    const internalId = uuidv7();
    (reducerDef as ReducerDef<ReduxState, Action<any>>)._internalId = internalId;
    m.push(reducerDef as any as ReducerDef<ReduxState, Action<any>>); // keep typing happy
    m.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    mappings[eventType] = m;

    return () => {
      mappings[eventType] = (mappings[eventType] || []).filter(
        (r) => r._internalId !== internalId,
      );
    };
  }

  const onResolve = <S extends ReduxState, T>(
    promise: Promise<T>,
    callback: (state: S, result: T | null, err: unknown, dispatch: DispatchF) => void,
  ): Promise<T> => {
    const actionType = `pi/promise/settle/${uuidv7()}`;

    addReducer<S, any>(actionType, {
      mapperOnce: (state, action, dispatch) => {
        callback(state, action._result ?? null, action._err ?? null, dispatch);
        return true;
      },
    });

    promise.then(
      (result) =>
        delayedDispatcher({ type: actionType, _result: result, _err: null } as any),
      (err) => delayedDispatcher({ type: actionType, _result: null, _err: err } as any),
    );
    return promise;
  };

  const piReducer: PiReducer = {
    register: registerReducer,
    registerOneShot,
    dispatch: (a: any): string => {
      const id = ensureId(a);
      deproxyAction(a);
      dispatcher(a);
      return id;
    },
    dispatchFromReducer: delayedDispatcher,
    onResolve,
  };

  return [reducer, piReducer];
}

/**
 * Recursively walk an action (or any plain object/array) and replace every
 * Immer draft encountered with its plain `current()` snapshot.  Plain objects
 * and arrays that are NOT drafts are descended into so nested drafts are also
 * caught.
 */
function deproxyAction(a: Record<string, any> | any[]): void {
  const entries: [string | number, any][] = Array.isArray(a)
    ? a.map((v, i) => [i, v])
    : Object.keys(a).map((k) => [k, (a as Record<string, any>)[k]]);

  for (const [key, val] of entries) {
    if (isDraft(val)) {
      (a as any)[key] = current(val);
    } else if (val !== null && typeof val === "object") {
      deproxyAction(val);
    }
  }
}

function removeReducer(key: string | undefined, m: ReducerDef<ReduxState, Action>[]) {
  if (key) {
    return m.filter((r) => r.key !== key);
  } else {
    return m;
  }
}

// B5: returns the keys of consumed one-shot reducers (not the survivors).
// The caller removes those keys from the LIVE mapping so any reducers
// registered during the loop are not clobbered by a wholesale replacement.
function _reduce(
  ra: ReducerDef<ReduxState, Action>[],
  draft: ReduxState,
  action: Action,
  delayedDispatcher: DispatchF,
  opts: ReduceOpts<ReduxState>,
): string[] {
  const consumed: string[] = [];
  ra.forEach((m) => {
    try {
      if (m.mapperMulti) {
        draft.pihanga?.reducers?.push(m.definedIn || m.key || "unknown");
        m.mapperMulti(draft, action, delayedDispatcher, opts);
        // multi-fire: keep in mapping — nothing to record
      } else if (m.mapperOnce) {
        draft.pihanga?.reducers?.push(m.definedIn || m.key || "unknown");
        const done = m.mapperOnce(draft, action, delayedDispatcher, opts);
        if (done && m._internalId) {
          consumed.push(m._internalId); // consumed → will be filtered out by caller
        }
      }
    } catch (err: any) {
      logger.error(err.message, action, m);
    }
  });
  return consumed;
}

function _get_source_frame(
  frames: StackTrace.StackFrame[],
): StackTrace.StackFrame | undefined {
  // Heuristic: frame 0 = Error, 1 = getCallerSiteInBrowser, 2 = your function, 3 = its caller
  for (let i = 3; i < frames.length; i++) {
    const f = frames[i];
    const fn = f.fileName;
    if (_is_src_file(fn)) {
      return f;
    }
  }
  return undefined;
}

function _is_src_file(url: string | undefined): boolean {
  if (!url) return false;
  const m = url.match(/^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/]+\/([^/?#]+)/);
  if (m) {
    const p1 = m[1];
    const flag = !(p1.startsWith("@") || p1 === "node_modules");
    return flag;
  }
  return true;
}
