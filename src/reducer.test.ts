/**
 * Tests for reducer.ts — the createReducer factory.
 *
 * We instantiate the reducer directly (no Redux store) so we can call it as a
 * plain function and assert on the returned state objects.  This keeps the
 * tests fast and free of React/DOM setup.
 */
import {describe, it, expect, vi, afterEach} from "vitest";
import {createReducer} from "./reducer";
import {ReduxAction, ReduxState} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_STATE: ReduxState = {
  route: {path: [], query: {}, url: "/"},
  pihanga: {},
};

/** Create a fresh reducer + piReducer pair with a mock dispatcher. */
function setup() {
  const dispatcher = vi.fn();
  const [reducer, piReducer] = createReducer(BASE_STATE, dispatcher);
  return {reducer, piReducer, dispatcher};
}

// Convenience: dispatch an action through the reducer, bypassing TS's
// strict Action type so tests can include extra payload fields.
function dispatch(
  reducer: ReturnType<typeof setup>["reducer"],
  action: object,
) {
  return reducer(BASE_STATE, action as any);
}

// ---------------------------------------------------------------------------
// Basic dispatch / state pass-through
// ---------------------------------------------------------------------------

describe("createReducer – pass-through", () => {
  it("returns the initial state for an unknown action type", () => {
    const {reducer} = setup();
    const state = reducer(undefined, {type: "@@NO_HANDLER_XYZ"});
    expect(state.route).toEqual(BASE_STATE.route);
  });

  it("returns the same reference when nothing changes", () => {
    const {reducer} = setup();
    const state = reducer(BASE_STATE, {type: "@@NO_HANDLER_XYZ"});
    // No handler → the exact same object must come back
    expect(state).toBe(BASE_STATE);
  });
});

// ---------------------------------------------------------------------------
// register — multi-fire reducers
// ---------------------------------------------------------------------------

describe("createReducer – register (multi-fire)", () => {
  it("calls the registered mapper when its action type is dispatched", () => {
    const {reducer, piReducer} = setup();
    const handler = vi.fn();
    piReducer.register("MY_ACTION", handler, 0, "key-call");
    dispatch(reducer, {type: "MY_ACTION"});
    expect(handler).toHaveBeenCalledOnce();
  });

  it("registered mapper can mutate state via the Immer draft", () => {
    const {reducer, piReducer} = setup();

    piReducer.register<ReduxState, ReduxAction & {value: string}>(
      "SET_VALUE",
      (state, action) => {
        state.pihanga!.value = action.value;
      },
      0,
      "key-set-value",
    );

    const next = dispatch(reducer, {type: "SET_VALUE", value: "hello"});
    expect(next.pihanga!.value).toBe("hello");
    // Must not mutate the original state object
    expect(BASE_STATE.pihanga!.value).toBeUndefined();
  });

  it("mapper receives the dispatched action payload", () => {
    const {reducer, piReducer} = setup();
    let seen: any;

    piReducer.register<ReduxState, ReduxAction & {payload: number}>(
      "CHECK_PAYLOAD",
      (_state, action) => {
        seen = action.payload;
      },
      0,
      "key-check-payload",
    );

    dispatch(reducer, {type: "CHECK_PAYLOAD", payload: 42});
    expect(seen).toBe(42);
  });

  it("fires on every dispatch of the same action type", () => {
    const {reducer, piReducer} = setup();
    const handler = vi.fn();
    piReducer.register("MULTI_ACTION", handler, 0, "key-multi");
    dispatch(reducer, {type: "MULTI_ACTION"});
    dispatch(reducer, {type: "MULTI_ACTION"});
    dispatch(reducer, {type: "MULTI_ACTION"});
    expect(handler).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// registerOneShot
// ---------------------------------------------------------------------------

describe("createReducer – registerOneShot", () => {
  it("fires exactly once when the mapper returns true (consumed)", () => {
    const {reducer, piReducer} = setup();
    const handler = vi.fn(() => true); // true = consumed → remove
    piReducer.registerOneShot("ONE_SHOT", handler);
    dispatch(reducer, {type: "ONE_SHOT"});
    dispatch(reducer, {type: "ONE_SHOT"});
    expect(handler).toHaveBeenCalledOnce();
  });

  it("continues firing when the mapper returns false (not yet consumed)", () => {
    const {reducer, piReducer} = setup();
    const handler = vi.fn(() => false); // false = keep
    piReducer.registerOneShot("STAY_ACTION", handler);
    dispatch(reducer, {type: "STAY_ACTION"});
    dispatch(reducer, {type: "STAY_ACTION"});
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("can be consumed conditionally based on action content", () => {
    const {reducer, piReducer} = setup();
    let callCount = 0;
    piReducer.registerOneShot<ReduxState, ReduxAction & {done: boolean}>(
      "CONDITIONAL",
      (_s, action) => {
        callCount++;
        return action.done; // consume when done=true
      },
    );

    dispatch(reducer, {type: "CONDITIONAL", done: false});
    dispatch(reducer, {type: "CONDITIONAL", done: false});
    dispatch(reducer, {type: "CONDITIONAL", done: true}); // consumed here
    dispatch(reducer, {type: "CONDITIONAL", done: false}); // must NOT fire
    expect(callCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Cancel functions
// ---------------------------------------------------------------------------

describe("createReducer – cancel", () => {
  it("calling the cancel function removes the reducer", () => {
    const {reducer, piReducer} = setup();
    const handler = vi.fn();
    const cancel = piReducer.register("CANCEL_ME", handler, 0, "cancel-key");

    dispatch(reducer, {type: "CANCEL_ME"}); // fires once
    cancel();
    dispatch(reducer, {type: "CANCEL_ME"}); // must NOT fire again
    expect(handler).toHaveBeenCalledOnce();
  });

  it("cancelling one keyed reducer does not affect other keyed reducers", () => {
    const {reducer, piReducer} = setup();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    const cancelA = piReducer.register("SHARED_TYPE", handlerA, 0, "key-a");
    piReducer.register("SHARED_TYPE", handlerB, 0, "key-b");

    cancelA();

    dispatch(reducer, {type: "SHARED_TYPE"});
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledOnce();
  });

  it("re-registering a key replaces the previous handler", () => {
    const {reducer, piReducer} = setup();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    piReducer.register("REPLACE_ME", firstHandler, 0, "shared-key");
    piReducer.register("REPLACE_ME", secondHandler, 0, "shared-key"); // replaces

    dispatch(reducer, {type: "REPLACE_ME"});
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

describe("createReducer – priority ordering", () => {
  it("calls higher-priority reducers before lower-priority ones", () => {
    const {reducer, piReducer} = setup();
    const callOrder: number[] = [];

    piReducer.register("PRIORITY_ACTION", () => callOrder.push(1), 1, "prio-1");
    piReducer.register(
      "PRIORITY_ACTION",
      () => callOrder.push(10),
      10,
      "prio-10",
    );
    piReducer.register("PRIORITY_ACTION", () => callOrder.push(5), 5, "prio-5");

    dispatch(reducer, {type: "PRIORITY_ACTION"});
    expect(callOrder).toEqual([10, 5, 1]);
  });
});

// ---------------------------------------------------------------------------
// Wildcard "*" catch-all
// ---------------------------------------------------------------------------

describe("createReducer – wildcard *", () => {
  it("calls a wildcard reducer for any action type", () => {
    const {reducer, piReducer} = setup();
    const handler = vi.fn();
    piReducer.register("*", handler, 0, "wildcard-key");

    dispatch(reducer, {type: "ANYTHING"});
    dispatch(reducer, {type: "SOMETHING_ELSE"});
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("calls both the specific and the wildcard reducer for the same action", () => {
    const {reducer, piReducer} = setup();
    const specific = vi.fn();
    const wildcard = vi.fn();

    piReducer.register("SPECIFIC_TYPE", specific, 0, "specific-key");
    piReducer.register("*", wildcard, 0, "wildcard-key2");

    dispatch(reducer, {type: "SPECIFIC_TYPE"});
    expect(specific).toHaveBeenCalledOnce();
    expect(wildcard).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// piReducer.dispatch — ensures _id is populated
// ---------------------------------------------------------------------------

describe("piReducer.dispatch", () => {
  it("preserves a pre-existing _id and returns it", () => {
    const {piReducer} = setup();
    const action: ReduxAction = {type: "TEST", _id: "preset-id"};
    const id = piReducer.dispatch(action);
    expect(id).toBe("preset-id");
  });

  it("generates a new _id when the action does not have one", () => {
    const {piReducer} = setup();
    const action: ReduxAction = {type: "TEST"};
    const id = piReducer.dispatch(action);
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    // The action itself is mutated so the caller gets the same id
    expect(action._id).toBe(id);
  });

  it("calls the underlying dispatcher with the action", () => {
    const {piReducer, dispatcher} = setup();
    const action: ReduxAction = {type: "DISPATCH_TEST"};
    piReducer.dispatch(action);
    expect(dispatcher).toHaveBeenCalledWith(action);
  });
});

// ---------------------------------------------------------------------------
// dispatchPipe — request/reply correlation
// ---------------------------------------------------------------------------

describe("createReducer – dispatchPipe", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onReply when a matching reply action is dispatched", () => {
    vi.useFakeTimers();
    const {reducer, piReducer} = setup();
    const onReply = vi.fn();

    // Register a reducer that starts the pipe when triggered
    piReducer.register(
      "PIPE_TRIGGER",
      (_state, _action, _dispatch, opts) => {
        opts.dispatchPipe(
          {type: "PIPE_REQUEST", _id: "req-001"},
          {replyType: "PIPE_REPLY"},
          onReply,
        );
      },
      0,
      "pipe-trigger-key",
    );

    // Fire the trigger — this registers the reply handler internally
    dispatch(reducer, {type: "PIPE_TRIGGER"});

    // Advance timers so the delayed request dispatch runs
    vi.runAllTimers();

    // Simulate the reply arriving (correlated via _replyTo)
    dispatch(reducer, {type: "PIPE_REPLY", _replyTo: "req-001"});

    expect(onReply).toHaveBeenCalledOnce();
  });

  it("does NOT call onReply for a reply with the wrong correlation id", () => {
    vi.useFakeTimers();
    const {reducer, piReducer} = setup();
    const onReply = vi.fn();

    piReducer.register(
      "PIPE_TRIGGER2",
      (_state, _action, _dispatch, opts) => {
        opts.dispatchPipe(
          {type: "PIPE_REQUEST2", _id: "req-correct"},
          {replyType: "PIPE_REPLY2"},
          onReply,
        );
      },
      0,
      "pipe-trigger-key2",
    );

    dispatch(reducer, {type: "PIPE_TRIGGER2"});
    vi.runAllTimers();

    // Wrong correlation id — should not trigger onReply
    dispatch(reducer, {type: "PIPE_REPLY2", _replyTo: "req-WRONG"});

    expect(onReply).not.toHaveBeenCalled();
  });

  it("calls onError when an error reply arrives", () => {
    vi.useFakeTimers();
    const {reducer, piReducer} = setup();
    const onReply = vi.fn();
    const onError = vi.fn();

    piReducer.register(
      "PIPE_TRIGGER3",
      (_state, _action, _dispatch, opts) => {
        opts.dispatchPipe(
          {type: "PIPE_REQUEST3", _id: "req-err-001"},
          {replyType: "PIPE_REPLY3", errorType: "PIPE_ERROR3"},
          onReply,
          onError,
        );
      },
      0,
      "pipe-trigger-key3",
    );

    dispatch(reducer, {type: "PIPE_TRIGGER3"});
    vi.runAllTimers();

    // Dispatch the error reply
    dispatch(reducer, {type: "PIPE_ERROR3", _replyTo: "req-err-001"});

    expect(onError).toHaveBeenCalledOnce();
    expect(onReply).not.toHaveBeenCalled();
  });

  it("settles only once — subsequent matching replies are ignored", () => {
    vi.useFakeTimers();
    const {reducer, piReducer} = setup();
    const onReply = vi.fn();
    const onError = vi.fn();

    piReducer.register(
      "PIPE_TRIGGER4",
      (_state, _action, _dispatch, opts) => {
        opts.dispatchPipe(
          {type: "PIPE_REQUEST4", _id: "req-double"},
          {replyType: "PIPE_REPLY4", errorType: "PIPE_ERROR4"},
          onReply,
          onError,
        );
      },
      0,
      "pipe-trigger-key4",
    );

    dispatch(reducer, {type: "PIPE_TRIGGER4"});
    vi.runAllTimers();

    // First a successful reply → settles the pipe
    dispatch(reducer, {type: "PIPE_REPLY4", _replyTo: "req-double"});
    // Then an error arrives — must be ignored because already settled
    dispatch(reducer, {type: "PIPE_ERROR4", _replyTo: "req-double"});

    expect(onReply).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onTimeout and dispatches a timeout action when the timer fires", () => {
    vi.useFakeTimers();
    const {reducer, piReducer, dispatcher} = setup();
    const onReply = vi.fn();
    const onTimeout = vi.fn();

    piReducer.register(
      "PIPE_TRIGGER5",
      (_state, _action, _dispatch, opts) => {
        opts.dispatchPipe(
          {type: "PIPE_REQUEST5", _id: "req-timeout"},
          {replyType: "PIPE_REPLY5", timeoutMs: 5000},
          onReply,
          undefined,
          onTimeout,
        );
      },
      0,
      "pipe-trigger-key5",
    );

    dispatch(reducer, {type: "PIPE_TRIGGER5"});

    // Advance past the timeout — the 5 s timer fires and schedules a
    // delayedDispatcher call, then run all remaining timers to flush it.
    vi.advanceTimersByTime(6000);
    vi.runAllTimers();

    // The timeout action was dispatched through the mocked dispatcher.
    // Find it, then feed it back into the reducer so the registered handler runs.
    const timeoutAction = dispatcher.mock.calls
      .map(([a]) => a)
      .find((a: any) => a?.type === "pi/dispatchPipe/timeout");

    expect(timeoutAction).toBeDefined();

    // Drive the timeout through the reducer
    if (timeoutAction) {
      dispatch(reducer, timeoutAction);
    }

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onReply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B5 — reducer registered during reduction is not lost
// ---------------------------------------------------------------------------

describe("B5 — reducer added inside a handler survives the reduction", () => {
  it("a multi-fire reducer registered by a handler is present on the next dispatch", () => {
    const {reducer, piReducer} = setup();
    let secondFired = 0;

    // On the first "TRIGGER", register a new reducer for the same type.
    piReducer.register(
      "B5_TRIGGER",
      () => {
        piReducer.register(
          "B5_TRIGGER",
          () => {
            secondFired++;
          },
          0,
          "b5-second",
        );
      },
      0,
      "b5-first",
    );

    dispatch(reducer, {type: "B5_TRIGGER"}); // b5-first runs, registers b5-second
    dispatch(reducer, {type: "B5_TRIGGER"}); // b5-first + b5-second should both run
    expect(secondFired).toBeGreaterThan(0); // b5-second was NOT clobbered
  });

  it("a one-shot reducer registered during reduction fires on the next dispatch", () => {
    const {reducer, piReducer} = setup();
    let onceFired = false;

    piReducer.register(
      "B5_ONESHOT",
      () => {
        piReducer.registerOneShot("B5_ONESHOT", () => {
          onceFired = true;
          return true; // consumed
        });
      },
      0,
      "b5-trigger",
    );

    dispatch(reducer, {type: "B5_ONESHOT"}); // registers the one-shot
    dispatch(reducer, {type: "B5_ONESHOT"}); // one-shot fires
    expect(onceFired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B6 — auto-keyed reducers deduplicate and return a working cancel function
// ---------------------------------------------------------------------------

describe("B6 — auto-keyed reducers (no explicit key)", () => {
  // Note: stack-trace-based deduplication of truly auto-keyed registrations
  // is environment-dependent (StackTrace.getSync heuristics). The primary
  // observable fix of B6 is that the cancel function returned for an
  // auto-keyed reducer is functional (previously always returned nonCancelF).

  it("cancel function returned for auto-keyed reducer actually removes it", () => {
    const {reducer, piReducer} = setup();
    const handler = vi.fn();

    // Register without an explicit key — previously returned nonCancelF.
    const cancel = piReducer.register("B6_CANCEL", handler);

    dispatch(reducer, {type: "B6_CANCEL"});
    expect(handler).toHaveBeenCalledOnce();

    cancel(); // B6 fix: this should now remove the reducer
    dispatch(reducer, {type: "B6_CANCEL"});
    expect(handler).toHaveBeenCalledOnce(); // still only 1 — cancel worked
  });
});
