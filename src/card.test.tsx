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
import {Card} from "./card";
import {addCardComponent, _registerCard} from "./register_cards";
import type {PiRegisterReducerF} from "./types";

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
