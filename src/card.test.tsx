/**
 * Render-minimisation tests for card.tsx.
 *
 * Each test directly tracks how many times a card component renders by
 * incrementing a counter inside the component body.  Tests are grouped by
 * the finding they verify:
 *
 *  A1 — React.memo(Card): parent re-render must not cascade into the Card subtree.
 *  A2 — Stable handler identities: only the card whose mapped state changed
 *        should re-render; event handler references must survive a re-render.
 *  A4 — ErrorCardComponent: an unknown-card error must not re-render on
 *        unrelated store dispatches.
 */
import React from "react";
import {render, act} from "@testing-library/react";
import {configureStore} from "@reduxjs/toolkit";
import {Provider} from "react-redux";
import {describe, it, expect} from "vitest";
import {Card, usePiReducer} from "./card";
import {
  addCardComponent,
  _registerCard,
  cardMappings,
  dispatch2registerReducer,
} from "./register_cards";
import type {PiRegisterReducerF} from "./types";
import {vi} from "vitest";

// ── test helpers ──────────────────────────────────────────────────────────────

/** No-op registerReducer for cards that don't need reducers in tests. */
const noopReducer: PiRegisterReducerF = () => () => {};

/** Unique identifier to avoid collisions with the shared module-level registries. */
const uid = () => Math.random().toString(36).slice(2);

/**
 * Registers a minimal card component and returns a shared `renders` counter.
 * Each time the component body executes, `renders.count` is incremented.
 */
function makeCountingCard(type: string): {count: number} {
  const renders = {count: 0};
  const Component = (_props: any) => {
    renders.count++;
    return <div data-testid={type} />;
  };
  addCardComponent({name: type, component: Component});
  return renders;
}

/**
 * Creates a minimal Redux store with a simple key/value reducer.
 * Dispatch `{ type: 'TEST/SET', key: string, value: any }` to update state.
 */
function createTestStore(extra: Record<string, unknown> = {}) {
  const initial = {
    route: {path: [], query: {}, url: "/"},
    pihanga: {},
    ...extra,
  };
  return configureStore({
    reducer: (state: any = initial, action: any) => {
      if (action.type === "TEST/SET") {
        return {...state, [action.key]: action.value};
      }
      return state;
    },
    middleware: (getDefault) => getDefault({serializableCheck: false}),
  });
}

function storeWrapper(store: ReturnType<typeof createTestStore>) {
  return ({children}: {children: React.ReactNode}) => (
    <Provider store={store}>{children}</Provider>
  );
}

// ── A1: React.memo(Card) ──────────────────────────────────────────────────────

describe("A1 — React.memo(Card) prevents cascade re-renders from parent", () => {
  it("parent re-render with the same cardName prop does not re-render the Card subtree", () => {
    const type = uid();
    const renders = makeCountingCard(type);
    const name = uid();
    _registerCard(name, {cardType: type}, noopReducer);

    const store = createTestStore();
    let parentRenderCount = 0;

    function Parent({trigger}: {trigger: number}) {
      parentRenderCount++;
      return <Card cardName={name} parentCard="" />;
    }

    const {rerender} = render(
      <Provider store={store}>
        <Parent trigger={0} />
      </Provider>,
    );

    const snapParent = parentRenderCount;
    const snapCard = renders.count;

    // Re-render parent with a different `trigger` — same `cardName` prop to Card.
    rerender(
      <Provider store={store}>
        <Parent trigger={1} />
      </Provider>,
    );

    expect(parentRenderCount).toBe(snapParent + 1); // parent DID re-render
    expect(renders.count).toBe(snapCard); // card subtree did NOT re-render
  });
});

// ── A2: stable handler identities / isolated re-renders ───────────────────────

describe("A2 — stable handler identities / isolated re-renders", () => {
  it("dispatching an unrelated action does not re-render a card with unchanged state", () => {
    const type = uid();
    const renders = makeCountingCard(type);
    const name = uid();
    // Static text — not derived from store state → props never change.
    _registerCard(name, {cardType: type, text: "static"}, noopReducer);

    const store = createTestStore({counter: 0});
    render(<Card cardName={name} parentCard="" />, {
      wrapper: storeWrapper(store),
    });
    const afterMount = renders.count;

    act(() => {
      store.dispatch({type: "TEST/SET", key: "counter", value: 99});
    });

    expect(renders.count).toBe(afterMount); // zero extra renders
  });

  it("only the card whose mapped state changed re-renders; its sibling does not", () => {
    const typeA = uid();
    const typeB = uid();
    const rendersA = makeCountingCard(typeA);
    const rendersB = makeCountingCard(typeB);
    const nameA = uid();
    const nameB = uid();

    // Card A has a state-mapped prop → re-renders when `counter` changes.
    _registerCard(
      nameA,
      {cardType: typeA, value: (s: any) => s.counter},
      noopReducer,
    );
    // Card B has only static props → state change is irrelevant.
    _registerCard(nameB, {cardType: typeB, text: "static"}, noopReducer);

    const store = createTestStore({counter: 0});
    render(
      <Provider store={store}>
        <Card cardName={nameA} parentCard="" />
        <Card cardName={nameB} parentCard="" />
      </Provider>,
    );
    const snap = {a: rendersA.count, b: rendersB.count};

    act(() => {
      store.dispatch({type: "TEST/SET", key: "counter", value: 1});
    });

    expect(rendersA.count).toBeGreaterThan(snap.a); // A re-rendered (state changed)
    expect(rendersB.count).toBe(snap.b); // B did NOT re-render
  });

  it("event handler reference is stable across re-renders triggered by state changes", () => {
    const type = uid();
    const capturedHandlers: unknown[] = [];

    // Component records the `onClicked` prop reference on every render.
    const Component = ({onClicked, value}: any) => {
      capturedHandlers.push(onClicked);
      return <div>{value}</div>;
    };
    addCardComponent({
      name: type,
      component: Component,
      events: {onClicked: `${type}/clicked`},
    });

    const name = uid();
    _registerCard(
      name,
      {
        cardType: type,
        // `value` is state-mapped → card re-renders when counter changes.
        value: (s: any) => s.counter,
        // `onClicked` registers a reducer; its component prop is a stable dispatcher.
        onClicked: (_state: any) => {},
      },
      noopReducer,
    );

    const store = createTestStore({counter: 0});
    render(<Card cardName={name} parentCard="" />, {
      wrapper: storeWrapper(store),
    });
    expect(capturedHandlers).toHaveLength(1); // initial render only

    act(() => {
      store.dispatch({type: "TEST/SET", key: "counter", value: 1});
    });

    // The card SHOULD re-render because `value` changed.
    expect(capturedHandlers).toHaveLength(2);
    // A2: the `onClicked` handler is stable — same reference across renders.
    expect(capturedHandlers[1]).toBe(capturedHandlers[0]);
  });

  it("_cls prop is stable across re-renders triggered by state changes", () => {
    const type = uid();
    const capturedCls: unknown[] = [];

    const Component = ({_cls, value}: any) => {
      capturedCls.push(_cls);
      return <div>{value}</div>;
    };
    addCardComponent({name: type, component: Component});

    const name = uid();
    _registerCard(
      name,
      {cardType: type, value: (s: any) => s.counter},
      noopReducer,
    );

    const store = createTestStore({counter: 0});
    render(<Card cardName={name} parentCard="" />, {
      wrapper: storeWrapper(store),
    });
    expect(capturedCls).toHaveLength(1);

    act(() => {
      store.dispatch({type: "TEST/SET", key: "counter", value: 5});
    });

    expect(capturedCls).toHaveLength(2);
    // A2: `_cls` is memoised — same function reference after re-render.
    expect(capturedCls[1]).toBe(capturedCls[0]);
  });
});

// ── A4: ErrorCardComponent ────────────────────────────────────────────────────

describe("A4 — ErrorCardComponent does not re-render on unrelated dispatches", () => {
  it("renders an error message for an unknown card name", () => {
    const store = createTestStore();
    const {container} = render(
      <Card cardName="no-such-card-a4-abc" parentCard="" />,
      {
        wrapper: storeWrapper(store),
      },
    );
    expect(container.textContent).toContain("no-such-card-a4-abc");
  });

  it("error card DOM is unchanged after an unrelated dispatch", () => {
    const store = createTestStore({x: 0});
    const {container} = render(
      <Card cardName="no-such-card-a4-stable" parentCard="" />,
      {
        wrapper: storeWrapper(store),
      },
    );
    const before = container.innerHTML;

    act(() => {
      store.dispatch({type: "TEST/SET", key: "x", value: 42});
    });

    // A4: ErrorCardComponent has no useSelector subscription — DOM must not change.
    expect(container.innerHTML).toBe(before);
  });
});

// ── A5 — usePiReducer: no spurious re-registrations ──────────────────────────

describe("A5 — usePiReducer: no spurious re-registrations", () => {
  it("registers the reducer exactly once even when the parent re-renders multiple times", async () => {
    const store = createTestStore({x: 0});
    // Attach a mock piReducer so usePiReducer has something to call.
    const mockRegister = vi.fn(() => () => {}); // returns cancel fn
    (store as any).piReducer = {register: mockRegister, dispatch: vi.fn()};

    let forceParentRender!: () => void;
    const Parent = () => {
      const [, setN] = React.useState(0);
      forceParentRender = () => setN((n) => n + 1);

      // useId() inside usePiReducer — must be called unconditionally.
      usePiReducer("A5/TEST", (_s: any) => {}, "");
      return <div />;
    };

    render(<Parent />, {wrapper: storeWrapper(store)});

    // register should have been called exactly once on mount.
    expect(mockRegister).toHaveBeenCalledTimes(1);

    // Force several parent re-renders.
    await act(async () => {
      forceParentRender();
      forceParentRender();
    });

    // A5: dep array [eventType, key, store] prevents re-registration on re-renders.
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it("re-registers only when eventType changes", async () => {
    const store = createTestStore();
    const mockRegister = vi.fn((..._args: any[]) => () => {}); // spread → calls typed as any[][]
    (store as any).piReducer = {register: mockRegister, dispatch: vi.fn()};

    let setEventType!: (t: string) => void;
    const Parent = () => {
      const [eventType, setEt] = React.useState("A5/FIRST");
      setEventType = setEt;
      usePiReducer(eventType, (_s: any) => {}, "my-card");
      return <div />;
    };

    render(<Parent />, {wrapper: storeWrapper(store)});
    expect(mockRegister).toHaveBeenCalledTimes(1);

    await act(async () => {
      setEventType("A5/SECOND");
    });

    // A5: eventType changed → effect re-runs → cancel old + register new.
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(mockRegister.mock.calls[1][0]).toBe("A5/SECOND");
  });
});

// ── A7 — Stable anonymous-card IDs + cleanup on unmount ──────────────────────

/**
 * Anonymous card registration (checkForAnonymousCard) looks up the store's
 * dispatch in dispatch2registerReducer, which is populated by addCard() inside
 * start().  In tests that don't call start() we must seed it manually and clean
 * up afterwards to avoid leaking into other tests.
 */
function withAnonSupport<T>(
  store: ReturnType<typeof createTestStore>,
  cb: () => T,
): T {
  const entry: [React.Dispatch<any>, PiRegisterReducerF] = [
    store.dispatch as any,
    noopReducer,
  ];
  dispatch2registerReducer.push(entry);
  try {
    return cb();
  } finally {
    const idx = dispatch2registerReducer.indexOf(entry);
    if (idx >= 0) dispatch2registerReducer.splice(idx, 1);
  }
}

describe("A7 — anonymous cards: stable IDs and cleanup on unmount", () => {
  const anonType = `a7-anon-${uid()}`;

  it("registers an anonymous card in cardMappings when rendered", () => {
    addCardComponent({name: anonType, component: () => <div />});
    const store = createTestStore();

    const beforeKeys = new Set(Object.keys(cardMappings));

    const {unmount} = withAnonSupport(store, () =>
      render(
        <Card cardName={{cardType: anonType} as any} parentCard="a7-parent" />,
        {wrapper: storeWrapper(store)},
      ),
    );

    // A new entry whose key contains the anonType should have appeared.
    const newKeys = Object.keys(cardMappings).filter((k) => !beforeKeys.has(k));
    const anonKey = newKeys.find((k) => k.includes(anonType));
    expect(anonKey).toBeDefined();

    // A7: the mapping must be removed when the card unmounts.
    unmount();
    expect(cardMappings[anonKey!]).toBeUndefined();
  });

  it("two simultaneously mounted anonymous cards of the same type get distinct names", () => {
    const type2 = `a7-twin-${uid()}`;
    addCardComponent({name: type2, component: () => <div />});
    const store = createTestStore();

    const beforeKeys = new Set(Object.keys(cardMappings));
    withAnonSupport(store, () =>
      render(
        <>
          <Card
            cardName={{cardType: type2} as any}
            parentCard="a7-twin-parent"
          />
          <Card
            cardName={{cardType: type2} as any}
            parentCard="a7-twin-parent"
          />
        </>,
        {wrapper: storeWrapper(store)},
      ),
    );

    const newKeys = Object.keys(cardMappings)
      .filter((k) => !beforeKeys.has(k))
      .filter((k) => k.includes(type2));

    // A7: useId() gives each instance a unique id — no collision.
    expect(newKeys.length).toBe(2);
    expect(new Set(newKeys).size).toBe(2);
  });
});

// ── A6 — propEq is a pure comparison with no side effects ────────────────────

describe("A6 — propEq is a pure comparison (side effects moved to useEffect)", () => {
  it("unrelated dispatch does not trigger debug logging for an unchanged card", async () => {
    const type = `a6-card-${uid()}`;
    const renders = makeCountingCard(type);
    const store = createTestStore({score: 0});
    _registerCard(type, {cardType: type}, noopReducer);

    render(<Card cardName={type} parentCard="" />, {
      wrapper: storeWrapper(store),
    });
    const rendersBefore = renders.count;

    await act(async () => {
      store.dispatch({type: "TEST/SET", key: "unrelated", value: 99});
    });

    // A6: with propEq as a pure gate, no renders should happen for an unchanged card.
    expect(renders.count).toBe(rendersBefore);
  });
});
