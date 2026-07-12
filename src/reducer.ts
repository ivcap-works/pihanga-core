import {Action, Reducer} from "@reduxjs/toolkit";
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
import {produce} from "immer";
import {RegisterCardState, UPDATE_STATE_ACTION} from "./card";
import StackTrace from "stacktrace-js";
import {getLogger} from "./logger";
import {Dispatch} from "react";
import {currentRoute} from "./router";
import {uuidv7} from "./uuid";

const logger = getLogger("reducer");

type ReducerDef<S extends ReduxState, A extends ReduxAction> = {
  mapperMulti?: ReduceF<S, A>;
  mapperOnce?: ReduceOnceF<S, A>;
  priority?: number;
  key?: string;
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
  const mappings: {[k: string]: ReducerDef<ReduxState, Action>[]} = {};
  mappings[UPDATE_STATE_ACTION] = [
    {
      mapperMulti: RegisterCardState.reducer,
      key: "@builtin:card:UPDATE_STATE_ACTION",
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

      return (reply: any) =>
        reply?.type === replyType && reply?._replyTo === requestId;
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

      return (reply: any) =>
        reply?.type === errorType && reply?._replyTo === requestId;
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
  const reducer = (
    state: ReduxState | undefined,
    action: Action,
  ): ReduxState => {
    const s = state || initialState;
    const ra = mappings[action.type];
    const rany = mappings["*"];
    if ((!ra || ra.length === 0) && (!rany || rany.length === 0)) {
      const ra = s.pihanga?.reducers;
      if (ra && ra.length > 0) {
        return produce<ReduxState, ReduxState>(s, (draft) => {
          if (draft.pihanga) {
            draft.pihanga.reducers = [];
          }
        });
      }
      return s;
    }

    const nextState = produce<ReduxState, ReduxState>(s, (draft) => {
      const opts: ReduceOpts<ReduxState> = {
        rawState: s,
        dispatchPipe: dispatchPipe,
      };
      if (!draft.pihanga) {
        draft.pihanga = {};
      }
      draft.pihanga.reducers = [];
      if (ra) {
        // B5: _reduce returns only the keys of consumed one-shots; we remove
        // them from the LIVE mapping so any reducers added during the loop
        // (e.g. by dispatchPipe or by a handler that calls piReducer.register)
        // are not clobbered by a wholesale array replacement.
        const consumed = _reduce(ra, draft, action, delayedDispatcher, opts);
        if (consumed.length > 0) {
          mappings[action.type] = (mappings[action.type] || []).filter(
            (m) => !m.key || !consumed.includes(m.key),
          );
        }
      }
      if (rany) {
        const consumed2 = _reduce(rany, draft, action, delayedDispatcher, opts);
        if (consumed2.length > 0) {
          mappings["*"] = (mappings["*"] || []).filter(
            (m) => !m.key || !consumed2.includes(m.key),
          );
        }
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
    return addReducer(eventType, {mapperOnce: mapper, priority, key});
  };

  const nonCancelF = () => {};

  function addReducer<S extends ReduxState, A extends ReduxAction>(
    eventType: string,
    reducerDef: ReducerDef<S, A>,
  ): PiReducerCancelF {
    // B6: assign the fallback stack-trace key FIRST so that deduplication
    // (removeReducer) and the cancel closure both use the final key value.
    // Previously `key` was captured before this block ran, so auto-keyed
    // registrations always returned nonCancelF and never deduped.
    if (!reducerDef.key) {
      const frames = StackTrace.getSync();
      const sf = _get_source_frame(frames);
      if (sf) {
        reducerDef.key = sf.toString();
      } else {
        reducerDef.definedIn = sf;
        console.log(">> cannot find source frame", eventType, frames);
      }
    }

    const key = reducerDef.key;
    let m = mappings[eventType] || [];
    m = removeReducer(key, m);
    m.push(reducerDef as any as ReducerDef<ReduxState, Action<any>>); // keep typing happy
    m.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    mappings[eventType] = m;

    return key
      ? () => {
          const m = mappings[eventType] || [];
          mappings[eventType] = removeReducer(key, m);
        }
      : nonCancelF;
  }

  const piReducer: PiReducer = {
    register: registerReducer,
    registerOneShot,
    dispatch: (a: any): string => {
      const id = ensureId(a);
      dispatcher(a);
      return id;
    },
    dispatchFromReducer: delayedDispatcher,
  };

  return [reducer, piReducer];
}

function removeReducer(
  key: string | undefined,
  m: ReducerDef<ReduxState, Action>[],
) {
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
        if (done && m.key) {
          consumed.push(m.key); // consumed → will be filtered out by caller
        }
      }
    } catch (err: any) {
      logger.error(err.message, m.definedIn);
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
