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
import { render, act } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { describe, it, expect } from "vitest";
import { Card, usePiReducer } from "./card";
import {
  addCardComponent,
  _registerCard,
  cardMappings,
  metacardTypes,
  dispatch2registerReducer,
} from "./register_cards";
import type { PiRegisterReducerF } from "./types";
import { vi } from "vitest";

// ── test helpers ──────────────────────────────────────────────────────────────

/** No-op registerReducer for cards that don't need reducers in tests. */
const noopReducer: PiRegisterReducerF = () => () => {};

/** Unique identifier to avoid collisions with the shared module-level registries. */
const uid = () => Math.random().toString(36).slice(2);

/**
 * Registers a minimal card component and returns a shared `renders` counter.
 * Each time the component body executes, `renders.count` is incremented.
 */
function makeCountingCard(type: string): { count: number } {
  const renders = { count: 0 };
  const Component = (_props: any) => {
    renders.count++;
    return <div data-testid={type} />;
  };
  addCardComponent({ name: type, component: Component });
  return renders;
}

/**
 * Creates a minimal Redux store with a simple key/value reducer.
 * Dispatch `{ type: 'TEST/SET', key: string, value: any }` to update state.
 */
function createTestStore(extra: Record<string, unknown> = {}) {
  const initial = {
    route: { path: [], query: {}, url: "/" },
    pihanga: {},
    ...extra,
  };
  return configureStore({
    reducer: (state: any = initial, action: any) => {
      if (action.type === "TEST/SET") {
        return { ...state, [action.key]: action.value };
      }
      return state;
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}

/**
 * Default test wrapper: <StrictMode> + <Provider>.
 *
 * StrictMode is deliberate and must stay: the production entry points
 * (root.tsx, example/) render inside <React.StrictMode>, which runs every
 * effect as setup → cleanup → setup on mount and double-invokes component
 * bodies. Because this library keeps its registries at module level and
 * touches them from render/effects, any effect cleanup that mutates them
 * must have a setup that can restore it — rendering the tests through
 * StrictMode is what catches violations of that rule.
 *
 * Consequence for assertions: never assert EXACT render counts (StrictMode
 * doubles them). Assert deltas ("did not change") or compare the LAST
 * captured (i.e. committed) value before and after an update instead.
 */
function storeWrapper(store: ReturnType<typeof createTestStore>) {
  return ({ children }: { children: React.ReactNode }) => (
    <React.StrictMode>
      <Provider store={store}>{children}</Provider>
    </React.StrictMode>
  );
}

// ── A1: React.memo(Card) ──────────────────────────────────────────────────────

describe("A1 — React.memo(Card) prevents cascade re-renders from parent", () => {
  it("parent re-render with the same cardName prop does not re-render the Card subtree", () => {
    const type = uid();
    const renders = makeCountingCard(type);
    const name = uid();
    _registerCard(name, { cardType: type }, noopReducer);

    const store = createTestStore();
    let parentRenderCount = 0;

    function Parent({ trigger }: { trigger: number }) {
      parentRenderCount++;
      return <Card cardName={name} parentCard="" />;
    }

    const { rerender } = render(<Parent trigger={0} />, {
      wrapper: storeWrapper(store),
    });

    const snapParent = parentRenderCount;
    const snapCard = renders.count;

    // Re-render parent with a different `trigger` — same `cardName` prop to Card.
    rerender(<Parent trigger={1} />);

    // StrictMode double-invokes bodies, so assert direction, not exact counts.
    expect(parentRenderCount).toBeGreaterThan(snapParent); // parent DID re-render
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
    _registerCard(name, { cardType: type, text: "static" }, noopReducer);

    const store = createTestStore({ counter: 0 });
    render(<Card cardName={name} parentCard="" />, {
      wrapper: storeWrapper(store),
    });
    const afterMount = renders.count;

    act(() => {
      store.dispatch({ type: "TEST/SET", key: "counter", value: 99 });
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
    _registerCard(nameA, { cardType: typeA, value: (s: any) => s.counter }, noopReducer);
    // Card B has only static props → state change is irrelevant.
    _registerCard(nameB, { cardType: typeB, text: "static" }, noopReducer);

    const store = createTestStore({ counter: 0 });
    render(
      <>
        <Card cardName={nameA} parentCard="" />
        <Card cardName={nameB} parentCard="" />
      </>,
      { wrapper: storeWrapper(store) },
    );
    const snap = { a: rendersA.count, b: rendersB.count };

    act(() => {
      store.dispatch({ type: "TEST/SET", key: "counter", value: 1 });
    });

    expect(rendersA.count).toBeGreaterThan(snap.a); // A re-rendered (state changed)
    expect(rendersB.count).toBe(snap.b); // B did NOT re-render
  });

  it("event handler reference is stable across re-renders triggered by state changes", () => {
    const type = uid();
    const capturedHandlers: unknown[] = [];

    // Component records the `onClicked` prop reference on every render.
    const Component = ({ onClicked, value }: any) => {
      capturedHandlers.push(onClicked);
      return <div>{value}</div>;
    };
    addCardComponent({
      name: type,
      component: Component,
      events: { onClicked: `${type}/clicked` },
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

    const store = createTestStore({ counter: 0 });
    render(<Card cardName={name} parentCard="" />, {
      wrapper: storeWrapper(store),
    });
    // StrictMode double-invokes bodies and may discard the first invocation's
    // useMemo results, so compare COMMITTED (last-captured) values, not indices.
    expect(capturedHandlers.length).toBeGreaterThan(0);
    const mountCaptures = capturedHandlers.length;
    const committedHandler = capturedHandlers[capturedHandlers.length - 1];

    act(() => {
      store.dispatch({ type: "TEST/SET", key: "counter", value: 1 });
    });

    // The card SHOULD re-render because `value` changed.
    expect(capturedHandlers.length).toBeGreaterThan(mountCaptures);
    // A2: the `onClicked` handler is stable — same reference across commits.
    expect(capturedHandlers[capturedHandlers.length - 1]).toBe(committedHandler);
  });

  it("_cls prop is stable across re-renders triggered by state changes", () => {
    const type = uid();
    const capturedCls: unknown[] = [];

    const Component = ({ _cls, value }: any) => {
      capturedCls.push(_cls);
      return <div>{value}</div>;
    };
    addCardComponent({ name: type, component: Component });

    const name = uid();
    _registerCard(name, { cardType: type, value: (s: any) => s.counter }, noopReducer);

    const store = createTestStore({ counter: 0 });
    render(<Card cardName={name} parentCard="" />, {
      wrapper: storeWrapper(store),
    });
    // Committed-value comparison — see storeWrapper docs re StrictMode counts.
    expect(capturedCls.length).toBeGreaterThan(0);
    const mountCaptures = capturedCls.length;
    const committedCls = capturedCls[capturedCls.length - 1];

    act(() => {
      store.dispatch({ type: "TEST/SET", key: "counter", value: 5 });
    });

    expect(capturedCls.length).toBeGreaterThan(mountCaptures);
    // A2: `_cls` is memoised — same function reference after re-render.
    expect(capturedCls[capturedCls.length - 1]).toBe(committedCls);
  });
});

// ── A4: ErrorCardComponent ────────────────────────────────────────────────────

describe("A4 — ErrorCardComponent does not re-render on unrelated dispatches", () => {
  it("renders an error message for an unknown card name", () => {
    const store = createTestStore();
    const { container } = render(<Card cardName="no-such-card-a4-abc" parentCard="" />, {
      wrapper: storeWrapper(store),
    });
    expect(container.textContent).toContain("no-such-card-a4-abc");
  });

  it("renders nothing (no error) when cardName is undefined — optional metacard slot", () => {
    // When a metacard mapper places `params.someSlot` directly into a content array
    // and the caller didn't pass that prop, cardName arrives as undefined.
    // The framework must silently render nothing rather than log an error.
    const store = createTestStore();
    const { container } = render(
      <Card cardName={undefined as any} parentCard="parent" />,
      { wrapper: storeWrapper(store) },
    );
    // Nothing rendered — empty container, no error text.
    expect(container.textContent).toBe("");
  });

  it("renders nothing (no error) when cardName is null", () => {
    const store = createTestStore();
    const { container } = render(<Card cardName={null as any} parentCard="parent" />, {
      wrapper: storeWrapper(store),
    });
    expect(container.textContent).toBe("");
  });

  it("error card DOM is unchanged after an unrelated dispatch", () => {
    const store = createTestStore({ x: 0 });
    const { container } = render(
      <Card cardName="no-such-card-a4-stable" parentCard="" />,
      {
        wrapper: storeWrapper(store),
      },
    );
    const before = container.innerHTML;

    act(() => {
      store.dispatch({ type: "TEST/SET", key: "x", value: 42 });
    });

    // A4: ErrorCardComponent has no useSelector subscription — DOM must not change.
    expect(container.innerHTML).toBe(before);
  });
});

// ── A5 — usePiReducer: no spurious re-registrations ──────────────────────────

describe("A5 — usePiReducer: no spurious re-registrations", () => {
  it("keeps exactly one ACTIVE registration even when the parent re-renders multiple times", async () => {
    const store = createTestStore({ x: 0 });
    // Attach a mock piReducer so usePiReducer has something to call.
    // StrictMode runs the effect as setup → cleanup → setup on mount, so the
    // raw call count is not meaningful — track ACTIVE registrations instead
    // (register increments, the returned cancel fn decrements).
    let active = 0;
    const mockRegister = vi.fn(() => {
      active++;
      return () => {
        active--;
      };
    });
    (store as any).piReducer = { register: mockRegister, dispatch: vi.fn() };

    let forceParentRender!: () => void;
    const Parent = () => {
      const [, setN] = React.useState(0);
      forceParentRender = () => setN((n) => n + 1);

      // useId() inside usePiReducer — must be called unconditionally.
      usePiReducer("A5/TEST", (_s: any) => {}, "");
      return <div />;
    };

    render(<Parent />, { wrapper: storeWrapper(store) });

    // Exactly one live registration after mount (StrictMode's extra
    // setup/cleanup cycle must net out to one).
    expect(active).toBe(1);
    const callsAfterMount = mockRegister.mock.calls.length;

    // Force several parent re-renders.
    await act(async () => {
      forceParentRender();
      forceParentRender();
    });

    // A5: dep array [eventType, key, store] prevents re-registration on re-renders.
    expect(mockRegister.mock.calls.length).toBe(callsAfterMount);
    expect(active).toBe(1);
  });

  it("re-registers only when eventType changes", async () => {
    const store = createTestStore();
    const mockRegister = vi.fn((..._args: any[]) => () => {}); // spread → calls typed as any[][]
    (store as any).piReducer = { register: mockRegister, dispatch: vi.fn() };

    let setEventType!: (t: string) => void;
    const Parent = () => {
      const [eventType, setEt] = React.useState("A5/FIRST");
      setEventType = setEt;
      usePiReducer(eventType, (_s: any) => {}, "my-card");
      return <div />;
    };

    render(<Parent />, { wrapper: storeWrapper(store) });
    // Raw counts are inflated by StrictMode's mount cycle — snapshot and diff.
    const callsAfterMount = mockRegister.mock.calls.length;
    expect(mockRegister.mock.calls[callsAfterMount - 1][0]).toBe("A5/FIRST");

    await act(async () => {
      setEventType("A5/SECOND");
    });

    // A5: eventType changed → effect re-runs exactly once → one new register call.
    expect(mockRegister.mock.calls.length).toBe(callsAfterMount + 1);
    expect(mockRegister.mock.calls[callsAfterMount][0]).toBe("A5/SECOND");
  });
});

// ── A7 — Stable anonymous-card IDs + cleanup on unmount ──────────────────────

/**
 * Anonymous card registration (checkForAnonymousCard) looks up the store's
 * dispatch in dispatch2registerReducer, which is populated by addCard() inside
 * start().  In tests that don't call start() we must seed it manually and clean
 * up afterwards to avoid leaking into other tests.
 */
function withAnonSupport<T>(store: ReturnType<typeof createTestStore>, cb: () => T): T {
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
    addCardComponent({ name: anonType, component: () => <div /> });
    const store = createTestStore();

    const beforeKeys = new Set(Object.keys(cardMappings));

    const { unmount } = withAnonSupport(store, () =>
      render(<Card cardName={{ cardType: anonType } as any} parentCard="a7-parent" />, {
        wrapper: storeWrapper(store),
      }),
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
    addCardComponent({ name: type2, component: () => <div /> });
    const store = createTestStore();

    const beforeKeys = new Set(Object.keys(cardMappings));
    withAnonSupport(store, () =>
      render(
        <>
          <Card cardName={{ cardType: type2 } as any} parentCard="a7-twin-parent" />
          <Card cardName={{ cardType: type2 } as any} parentCard="a7-twin-parent" />
        </>,
        { wrapper: storeWrapper(store) },
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

// ── A3 — metacard-in-content: expanded props must survive re-render ───────────

describe("A3 — metacard inside content: expanded props survive a re-render with new PiCardDef reference", () => {
  it("does not overwrite expanded top-card props when CardImpl re-renders with a structurally identical but new PiCardDef", () => {
    // This reproduces the bug where a metacard placed inside another card's
    // `content` array had its properly-expanded mapping overwritten with the raw
    // metacard PiCardDef on every re-render, corrupting the layout.

    // 1. Register the card type the metacard expands TO.
    const expandedType = `a3mc-expanded-${uid()}`;
    addCardComponent({
      name: expandedType,
      component: (_props: any) => <div data-testid={expandedType} />,
    });

    // 2. Register the metacard type with a mapper that produces a distinctive prop.
    const metaType = `a3mc-meta-${uid()}`;
    metacardTypes[metaType] = {
      type: metaType,
      registerCard: (n: string, p: any) => _registerCard(n, p, noopReducer),
      mapper: (_name: string, _params: any, _rc: any) => ({
        cardType: expandedType,
        expandedProp: "expanded-value",
      }),
    };

    // 3. First render — creates the metacard mapping via _registerMetadataCard.
    const store = createTestStore();
    const metacardDef1 = { cardType: metaType, rawProp: "raw-value" };

    const { rerender } = withAnonSupport(store, () =>
      render(<Card cardName={metacardDef1 as any} parentCard="a3mc-parent" />, {
        wrapper: storeWrapper(store),
      }),
    );

    // 4. Find the mapping created by the metacard expansion.
    const expandedKey = Object.keys(cardMappings).find(
      (k) => k.startsWith("a3mc-parent") && cardMappings[k].cardType === expandedType,
    );
    expect(expandedKey).toBeDefined();
    expect(cardMappings[expandedKey!].cardType).toBe(expandedType);
    expect((cardMappings[expandedKey!].props as any).expandedProp).toBe("expanded-value");

    // 5. Re-render with a NEW PiCardDef reference (same shape, different identity).
    //    This simulates the real-world case where content items are produced by a
    //    state mapper — new objects each render — so React.memo allows re-render.
    const metacardDef2 = { cardType: metaType, rawProp: "raw-value" };
    withAnonSupport(store, () => {
      rerender(<Card cardName={metacardDef2 as any} parentCard="a3mc-parent" />);
    });

    // 6. The expanded card's mapping must NOT be overwritten with raw metacard props.
    expect(cardMappings[expandedKey!].cardType).toBe(expandedType);
    expect((cardMappings[expandedKey!].props as any).expandedProp).toBe("expanded-value");
    // rawProp is a metacard INPUT prop — it must not appear in the expanded card's props.
    expect((cardMappings[expandedKey!].props as any).rawProp).toBeUndefined();
  });

  it("state-mapper functions inside a content array are resolved per-render", () => {
    // A metacard mapper may place `params.someSlot` (which is a StateMapper) directly
    // into a content array.  Without array-item resolution the function would be passed
    // to <Card cardName={fn} /> and produce an error; with it the function is called
    // each render and the resolved value (card name / PiCardDef) is used instead.

    // Card that will be dynamically selected from state.
    // Must be both registered as a component type AND as a named card instance
    // so that <Card cardName={dynamicType} /> resolves correctly.
    const dynamicType = `a3mc-dyn-${uid()}`;
    addCardComponent({
      name: dynamicType,
      component: (_props: any) => <div data-testid={dynamicType} />,
    });
    _registerCard(dynamicType, { cardType: dynamicType }, noopReducer);

    // Container type that maps its `content` array, including any state-mapper items.
    const containerType = `a3mc-ctr-${uid()}`;
    const capturedContent: unknown[][] = [];
    addCardComponent({
      name: containerType,
      component: ({ content, cardName: cn }: any) => {
        capturedContent.push(content ?? []);
        return (
          <div>
            {(content ?? []).map((item: any, i: number) => (
              <Card key={i} cardName={item} parentCard={cn} />
            ))}
          </div>
        );
      },
    });

    // State mapper that resolves to the dynamic card name.
    const dynamicSlot = (s: any) => (s.showDynamic ? dynamicType : undefined);

    const containerName = `a3mc-ctr-inst-${uid()}`;
    _registerCard(
      containerName,
      {
        cardType: containerType,
        // content array contains a static string AND a state-mapper function item.
        content: ["not-a-real-card", dynamicSlot],
      },
      noopReducer,
    );

    const store = createTestStore({ showDynamic: false });
    const { container } = render(<Card cardName={containerName} parentCard="" />, {
      wrapper: storeWrapper(store),
    });

    // Initially showDynamic=false → dynamicSlot resolves to undefined → not rendered.
    expect(capturedContent.length).toBeGreaterThan(0);
    const firstContent = capturedContent[capturedContent.length - 1];
    // The state-mapper item should have been resolved to undefined (not a raw function).
    expect(typeof firstContent[1]).not.toBe("function");

    // Enable the dynamic card.
    act(() => {
      store.dispatch({ type: "TEST/SET", key: "showDynamic", value: true });
    });

    const lastContent = capturedContent[capturedContent.length - 1];
    // After state change the mapper resolves to dynamicType string.
    expect(lastContent[1]).toBe(dynamicType);
    expect(container.querySelector(`[data-testid="${dynamicType}"]`)).not.toBeNull();
  });
});

// ── StrictMode safety ─────────────────────────────────────────────────────────
//
// React 18 <StrictMode> runs every effect's setup → cleanup → setup on mount.
// Effect cleanups that delete module-level registry state (cardMappings,
// metaCardCtxtPropsStore) must therefore RESTORE that state in their setup,
// otherwise the deleted entries stay gone while the component remains mounted
// and cards visibly disappear after the first paint.  The production apps
// (root.tsx, example/) render inside <StrictMode>, so these tests must too.

describe("StrictMode safety — effect cleanups must be idempotent", () => {
  it("anonymous card keeps its mapping (and mapped props) after StrictMode mount", () => {
    const type = `sm-anon-${uid()}`;
    addCardComponent({
      name: type,
      component: ({ label }: any) => <div data-testid={type}>{label}</div>,
    });
    const store = createTestStore();
    const beforeKeys = new Set(Object.keys(cardMappings));

    const { container } = withAnonSupport(store, () =>
      render(
        <React.StrictMode>
          <Provider store={store}>
            <Card
              cardName={{ cardType: type, label: "hello" } as any}
              parentCard="sm-parent"
            />
          </Provider>
        </React.StrictMode>,
      ),
    );

    // The mapping must still exist after StrictMode's simulated unmount/remount
    // (the cleanup deletes it; the effect setup must re-register it).
    const anonKey = Object.keys(cardMappings).find(
      (k) => !beforeKeys.has(k) && k.includes(type),
    );
    expect(anonKey).toBeDefined();
    expect(cardMappings[anonKey!]).toBeDefined();
    expect(container.textContent).toContain("hello");

    // The card must keep its mapped props on subsequent selector passes: with
    // the mapping deleted, getCardProps falls back to raw ctxtProps and the
    // mapped `label` prop silently disappears on the next dispatch.
    act(() => {
      store.dispatch({ type: "TEST/SET", key: "unrelated", value: 1 });
    });
    expect(container.textContent).toContain("hello");
  });

  it("metacard sub-cards keep metaCtxtProps after StrictMode mount", () => {
    // Sub-card whose prop mapper depends on the metacard's ctxtProps.
    const subType = `sm-sub-${uid()}`;
    addCardComponent({
      name: subType,
      component: ({ fromCtxt }: any) => <div data-testid={subType}>{fromCtxt}</div>,
    });
    // Expanded top card renders the sub-card slot.
    const topType = `sm-top-${uid()}`;
    addCardComponent({
      name: topType,
      component: ({ sub, cardName: cn }: any) => (
        <Card cardName={sub} parentCard={cn} />
      ),
    });
    // Metacard: registers the sub-card and returns the expanded top card.
    const metaType = `sm-meta-${uid()}`;
    metacardTypes[metaType] = {
      type: metaType,
      registerCard: (n: string, p: any) => _registerCard(n, p, noopReducer),
      mapper: (_name: string, _params: any, registerCard: any) => {
        const sub = registerCard("sub", {
          cardType: subType,
          fromCtxt: (_s: any, ctx: any) => ctx.metaCtxtProps?.someCtxt ?? "MISSING",
        });
        return { cardType: topType, sub };
      },
    };

    const store = createTestStore();
    const { container } = withAnonSupport(store, () =>
      render(
        <React.StrictMode>
          <Provider store={store}>
            <Card
              cardName={{ cardType: metaType } as any}
              parentCard="sm-mparent"
              someCtxt="from-context"
            />
          </Provider>
        </React.StrictMode>,
      ),
    );
    expect(container.textContent).toContain("from-context");

    // With the StrictMode bug, metaCardCtxtPropsStore[topCard] was deleted after
    // mount; the next dispatch re-runs the sub-card's selector with
    // metaCtxtProps === undefined and the content degrades to "MISSING".
    act(() => {
      store.dispatch({ type: "TEST/SET", key: "unrelated", value: 1 });
    });
    expect(container.textContent).toContain("from-context");
    expect(container.textContent).not.toContain("MISSING");
  });
});

// ── A6 — propEq is a pure comparison with no side effects ────────────────────

describe("A6 — propEq is a pure comparison (side effects moved to useEffect)", () => {
  it("unrelated dispatch does not trigger debug logging for an unchanged card", async () => {
    const type = `a6-card-${uid()}`;
    const renders = makeCountingCard(type);
    const store = createTestStore({ score: 0 });
    _registerCard(type, { cardType: type }, noopReducer);

    render(<Card cardName={type} parentCard="" />, {
      wrapper: storeWrapper(store),
    });
    const rendersBefore = renders.count;

    await act(async () => {
      store.dispatch({ type: "TEST/SET", key: "unrelated", value: 99 });
    });

    // A6: with propEq as a pure gate, no renders should happen for an unchanged card.
    expect(renders.count).toBe(rendersBefore);
  });
});
