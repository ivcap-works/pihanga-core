/**
 * Vitest test-harness utilities for Pihanga REST mocks.
 *
 * Eliminates the per-test-file boilerplate that every REST test previously had
 * to copy manually.  Only two Vitest-specific lines remain unavoidable in each
 * test file (because `vi.hoisted` / `vi.mock` must appear in the file being
 * transformed):
 *
 * ```ts
 * const _s = vi.hoisted(() => createPiMockState())
 * vi.mock("@pihanga2/core", (io) => piCoreMockFactory(io, _s))
 * ```
 *
 * Everything else is handled by this module:
 *
 * ```ts
 * import { createPiMockState, piCoreMockFactory,
 *          createRestTestHarness } from "@pihanga2/core/rest/mock"
 *
 * const _s = vi.hoisted(() => createPiMockState())
 * vi.mock("@pihanga2/core", (io) => piCoreMockFactory(io, _s))
 *
 * const { createSetup, flush, afterEachCleanup } = createRestTestHarness(_s)
 * afterEach(() => { clearRestMocks(); afterEachCleanup() })
 * ```
 */

import { registerGET } from "./get";
import { registerPOST, registerPUT, registerPATCH } from "./postPutPatch";
import { registerDELETE } from "./delete";

// ── Types ──────────────────────────────────────────────────────────────────────

/** One-shot reducer entry registered by a dispatch pipe. */
export type PiOneShotEntry = {
  handler: (s: any, a: any, d: any, opts: any) => boolean;
  cancel: () => void;
};

/**
 * Shared mock state created by {@link createPiMockState}.
 *
 * Pass the same instance to {@link piCoreMockFactory} AND
 * {@link createRestTestHarness} so that `vi.mock`'s `register` override and
 * the per-test `createSetup()` share the same live references.
 */
export type PiMockState = {
  /** Set by `createSetup()` each test — null between tests. */
  currentPiRegister: any;
  /** One-shot reducer entries keyed by action type. */
  oneShotHandlers: Record<string, PiOneShotEntry[]>;
  /**
   * Module-level `register(fn)` calls that arrived before `createSetup()` ran.
   * `createSetup()` replays them against the mock PiRegister, mirroring how
   * `start()` replays the real buffer in production.
   */
  pendingCallbacks: Array<(r: any) => void>;
};

// ── createPiMockState ─────────────────────────────────────────────────────────

/**
 * Create the shared mock state object.
 *
 * Call this inside `vi.hoisted(...)` so the reference is available in the
 * `vi.mock` factory:
 *
 * ```ts
 * const _s = vi.hoisted(() => createPiMockState())
 * vi.mock("@pihanga2/core", (io) => piCoreMockFactory(io, _s))
 * ```
 */
export function createPiMockState(): PiMockState {
  return {
    currentPiRegister: null,
    oneShotHandlers: {},
    pendingCallbacks: [],
  };
}

// ── piCoreMockFactory ─────────────────────────────────────────────────────────

/**
 * `vi.mock` factory for `@pihanga2/core` (or `"../index"` in co-located tests).
 *
 * Spreads the real module so every export remains available, then overrides:
 * - `register` — buffers or fires against the mock PiRegister
 * - `createOnDispatchPipe` — re-implemented to use the mock register
 *   (necessary because `createOnDispatchPipe` closes over the real `register`
 *    in the same module scope; ESM intra-module calls cannot be intercepted by
 *    `vi.mock`)
 *
 * Usage — place these two lines verbatim near the top of each test file:
 *
 * ```ts
 * const _s = vi.hoisted(() => createPiMockState())
 * vi.mock("@pihanga2/core", (io) => piCoreMockFactory(io, _s))
 * // For tests co-located with the core (src/rest/):
 * // vi.mock("../index", (io) => piCoreMockFactory(io, _s))
 * ```
 */
export async function piCoreMockFactory(
  importOriginal: () => Promise<any>,
  mockState: PiMockState,
): Promise<any> {
  const real = await importOriginal();

  const mockRegister = (fn: (r: any) => void) => {
    if (mockState.currentPiRegister) {
      fn(mockState.currentPiRegister);
    } else {
      mockState.pendingCallbacks.push(fn);
    }
  };

  // Re-implement createOnDispatchPipe using mockRegister.
  // The original closes over the module's own `register`; vi.mock cannot
  // intercept that intra-module call in ESM.
  const createOnDispatchPipe =
    <TEvent extends object, TResult extends object, TError extends object = object>(
      dispatchAction: string,
      awaitAction: string,
      errorAwaitAction?: string,
    ) =>
    <S>(d: any, ev: TEvent, onReply: any, onError?: any): void => {
      const evID = d({ ...ev, type: dispatchAction });
      const isReply = (a: any) => a._replyTo === evID;
      mockRegister((r) => {
        let ec: any = null;
        const rc = r.reducer.registerOneShot(
          awaitAction,
          (s: any, a: any, d: any, opts: any) => {
            if (!isReply(a)) return false;
            if (ec) ec();
            onReply(s, a, d, opts);
            return true;
          },
          0,
          evID,
        );
        if (errorAwaitAction && onError) {
          ec = r.reducer.registerOneShot(
            errorAwaitAction,
            (s: any, a: any, d: any, opts: any) => {
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

  return { ...real, register: mockRegister, createOnDispatchPipe };
}

// ── createRestTestHarness ─────────────────────────────────────────────────────

/**
 * Build the per-test setup utilities bound to `mockState`.
 *
 * Returns `{ createSetup, flush, afterEachCleanup }`:
 *
 * - **`createSetup()`** — call once per `it()` block; creates a fresh mock
 *   reducer + dispatch function and activates `mockState.currentPiRegister`.
 *   Also replays any buffered module-level `register()` calls.
 * - **`flush()`** — waits for all pending microtasks/macrotasks to settle
 *   (i.e. lets the async mock fetch resolve).
 * - **`afterEachCleanup()`** — resets `currentPiRegister` and clears one-shot
 *   handlers; call inside `afterEach`.
 *
 * ```ts
 * const { createSetup, flush, afterEachCleanup } = createRestTestHarness(_s)
 * afterEach(() => { clearRestMocks(); afterEachCleanup() })
 *
 * it("...", async () => {
 *   registerRestMock("GET /api/items/:id", () => ({ status: 200, body: { id: "1" } }))
 *   const { dispatch, dispatched } = createSetup()
 *   dispatch({ type: "ITEM/LOAD", id: "1" })
 *   await flush()
 *   expect(dispatched.find(a => a.type === "ITEM/LOADED")).toBeDefined()
 * })
 * ```
 */
export function createRestTestHarness(mockState: PiMockState): {
  createSetup: () => {
    handlers: Record<string, (state: any, action: any, dispatch: any) => any>;
    dispatched: any[];
    mockReducer: { register: (type: string, handler: any) => void };
    dispatch: (action: any) => string;
  };
  flush: () => Promise<void>;
  afterEachCleanup: () => void;
} {
  function createSetup() {
    const handlers: Record<string, (state: any, action: any, dispatch: any) => any> = {};
    const dispatched: any[] = [];

    const mockReducer = {
      register: (type: string, handler: any) => {
        handlers[type] = handler;
      },
    };

    const dispatch = (action: any): string => {
      if (!action._id) action._id = crypto.randomUUID();
      dispatched.push(action);
      handlers[action.type]?.({}, action, dispatch);
      // Fire one-shot reducers (registered by dispatch pipes)
      for (const entry of (mockState.oneShotHandlers[action.type] ?? []).slice()) {
        if (entry.handler({}, action, dispatch, {})) entry.cancel();
      }
      return action._id;
    };

    mockState.currentPiRegister = {
      reducer: {
        register: (type: string, handler: any) => mockReducer.register(type, handler),
        registerOneShot: (type: string, handler: any) => {
          if (!mockState.oneShotHandlers[type]) mockState.oneShotHandlers[type] = [];
          const entry: PiOneShotEntry = {
            handler,
            cancel: () => {
              const arr = mockState.oneShotHandlers[type];
              const idx = arr?.indexOf(entry) ?? -1;
              if (idx >= 0) arr.splice(idx, 1);
            },
          };
          mockState.oneShotHandlers[type].push(entry);
          return entry.cancel;
        },
      },
      GET: registerGET(mockReducer as any),
      POST: registerPOST(mockReducer as any),
      PUT: registerPUT(mockReducer as any),
      PATCH: registerPATCH(mockReducer as any),
      DELETE: registerDELETE(mockReducer as any),
    };

    // Replay buffered module-level register() calls (mirrors start()'s buffer flush)
    for (const fn of mockState.pendingCallbacks) fn(mockState.currentPiRegister);

    return { handlers, dispatched, mockReducer, dispatch };
  }

  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  function afterEachCleanup() {
    mockState.currentPiRegister = null;
    for (const key of Object.keys(mockState.oneShotHandlers)) {
      delete mockState.oneShotHandlers[key];
    }
  }

  return { createSetup, flush, afterEachCleanup };
}
