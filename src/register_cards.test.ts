/**
 * Tests for register_cards.ts — card declaration helpers and the memo utility.
 *
 * We focus on pure / side-effect-free helpers (isCardRef, createCardDeclaration,
 * memo) and the addCardComponent registry so that the tests are straightforward
 * and don't depend on a running Redux store.
 */
import {describe, expect, it, vi} from "vitest";
import {
  _registerCard,
  addCardComponent,
  cardMappings,
  cardTypes,
  createCardDeclaration,
  isCardRef,
  memo,
  registerMetacard,
} from "./register_cards";
import {
  PiRegisterReducerF,
  ReduxState,
  RegisterCardF,
  StateMapperContext,
} from "./types";

// ---------------------------------------------------------------------------
// isCardRef
// ---------------------------------------------------------------------------

describe("isCardRef", () => {
  it("returns true for an object that has a cardType property", () => {
    expect(isCardRef({cardType: "ui/button"})).toBe(true);
  });

  it("returns true even when cardType is an empty string", () => {
    // The check is only `!== undefined`, so an empty string still qualifies
    expect(isCardRef({cardType: ""})).toBe(true);
  });

  it("returns false for a plain string (card name reference)", () => {
    expect(isCardRef("my-card-name")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCardRef(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isCardRef(undefined)).toBe(false);
  });

  it("returns false for an object that has no cardType property", () => {
    expect(isCardRef({title: "Hello"})).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isCardRef(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createCardDeclaration
// ---------------------------------------------------------------------------

describe("createCardDeclaration", () => {
  it("creates a factory that adds cardType to all props", () => {
    const Button = createCardDeclaration<{label: string}>("ui/button");
    const def = Button({label: "Click me"} as any);
    expect(def.cardType).toBe("ui/button");
    expect(def.label).toBe("Click me");
  });

  it("preserves every prop from the input", () => {
    type Props = {count: number; label: string; active: boolean};
    const Widget = createCardDeclaration<Props>("ui/widget");
    const def = Widget({count: 5, label: "hi", active: true} as any);
    expect(def.count).toBe(5);
    expect(def.label).toBe("hi");
    expect(def.active).toBe(true);
    expect(def.cardType).toBe("ui/widget");
  });

  it("cardType in the output matches the argument to createCardDeclaration", () => {
    const cardTypeId = "my-framework/special-card";
    const Special = createCardDeclaration(cardTypeId);
    const def = Special({} as any);
    expect(def.cardType).toBe(cardTypeId);
  });

  it("two declarations for different types produce independent factories", () => {
    const A = createCardDeclaration<{x: number}>("ns/type-a");
    const B = createCardDeclaration<{y: string}>("ns/type-b");

    const defA = A({x: 1} as any);
    const defB = B({y: "hello"} as any);

    expect(defA.cardType).toBe("ns/type-a");
    expect(defB.cardType).toBe("ns/type-b");
    // They must not bleed into each other
    expect((defA as any).y).toBeUndefined();
    expect((defB as any).x).toBeUndefined();
  });

  it("later props can override cardType if explicitly set (plain spread)", () => {
    // createCardDeclaration spreads then adds cardType last, so cardType wins.
    const Card = createCardDeclaration<{label: string}>("ui/original");
    // Even if the prop object tries to set cardType, the declared type wins
    const def = Card({label: "test", cardType: "ui/override"} as any);
    // The implementation does { ...p, cardType }, so the declared type wins
    expect(def.cardType).toBe("ui/original");
  });
});

// ---------------------------------------------------------------------------
// addCardComponent
// ---------------------------------------------------------------------------

describe("addCardComponent", () => {
  // Use a unique suffix per test to avoid collisions with the shared module state
  const uid = () => `test-card-${Math.random().toString(36).slice(2)}`;

  it("registers a card component under its name", () => {
    const name = uid();
    const component = () => null;
    addCardComponent({name, component});
    expect(cardTypes[name]).toBeDefined();
    expect(cardTypes[name].component).toBe(component);
  });

  it("stores the supplied events map alongside the component", () => {
    const name = uid();
    const events = {onClick: "ui/click", onHover: "ui/hover"};
    addCardComponent({name, component: () => null, events});
    expect(cardTypes[name].events).toEqual(events);
  });

  it("overwrites a previous registration for the same name", () => {
    const name = uid();
    const first = () => null;
    const second = () => null;
    addCardComponent({name, component: first});
    addCardComponent({name, component: second});
    expect(cardTypes[name].component).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// memo
// ---------------------------------------------------------------------------

type AppState = ReduxState & {items: string[]};

function makeAppState(items: string[]): AppState {
  return {route: {path: [], query: {}, url: "/"}, pihanga: {}, items};
}

function ctx(key = "card-key") {
  const c = {
    cardName: "test-card",
    cardKey: key,
    ctxtProps: {},
    resolve: (prop: any) => (typeof prop === "function" ? prop({}, c) : prop),
  };
  return c;
}

describe("memo", () => {
  it("calls mapF on the very first invocation", () => {
    const mapF = vi.fn((items: string[]) => items.join(","));
    const memoized = memo<string[], string, AppState>((s) => s.items, mapF);

    const result = memoized(makeAppState(["a", "b"]), ctx());
    expect(result).toBe("a,b");
    expect(mapF).toHaveBeenCalledOnce();
  });

  it("returns the cached value and does NOT call mapF again when filter is unchanged", () => {
    const mapF = vi.fn((items: string[]) => items.join(","));
    const memoized = memo<string[], string, AppState>((s) => s.items, mapF);

    const items = ["a", "b"];
    const context = ctx();

    memoized(makeAppState(items), context);
    // Same deep value → should NOT recompute
    const result = memoized(makeAppState(items), context);

    expect(result).toBe("a,b");
    expect(mapF).toHaveBeenCalledOnce();
  });

  it("calls mapF again when the filter value changes", () => {
    const mapF = vi.fn((items: string[]) => items.join(","));
    const memoized = memo<string[], string, AppState>((s) => s.items, mapF);

    const context = ctx();

    memoized(makeAppState(["a"]), context);
    const result = memoized(makeAppState(["a", "b"]), context);

    expect(result).toBe("a,b");
    expect(mapF).toHaveBeenCalledTimes(2);
  });

  it("maintains separate caches for different cardKey values", () => {
    const mapF = vi.fn((items: string[]) => items.join(","));
    const memoized = memo<string[], string, AppState>((s) => s.items, mapF);

    const items = ["x"];
    // Two different contexts → each gets its own cache entry
    memoized(makeAppState(items), ctx("key-1"));
    memoized(makeAppState(items), ctx("key-2"));

    expect(mapF).toHaveBeenCalledTimes(2);

    // Second call for each key still hits the cache
    memoized(makeAppState(items), ctx("key-1"));
    memoized(makeAppState(items), ctx("key-2"));
    expect(mapF).toHaveBeenCalledTimes(2); // still 2 — both were cache hits
  });

  it("passes the context and full state to mapF", () => {
    const mapF = vi.fn(
      (
        _items: string[],
        context: StateMapperContext<unknown>,
        state: AppState,
      ) => `${context.cardKey ?? "-"}:${state.items.length}`,
    );
    const memoized = memo<string[], string, AppState>((s) => s.items, mapF);

    const context = ctx("my-key");
    const result = memoized(makeAppState(["a", "b", "c"]), context);
    expect(result).toBe("my-key:3");
  });

  it("uses deep equality so structurally equal arrays are treated as unchanged", () => {
    const mapF = vi.fn((items: string[]) => items.length);
    const memoized = memo<string[], number, AppState>((s) => s.items, mapF);

    const context = ctx();

    memoized(makeAppState(["a", "b"]), context);
    // Different array reference but same contents
    memoized(makeAppState(["a", "b"]), context);

    // deep-equal → no re-computation
    expect(mapF).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// metacard metaCard tagging (CardMapping.metaCard)
// ---------------------------------------------------------------------------

describe("metacard metaCard tagging", () => {
  // Unique IDs per test to avoid collisions in the shared module-level registries
  const uid = () => Math.random().toString(36).slice(2);

  // Minimal no-op registerReducer — returns a cancel fn, ignores all arguments
  const noopReducer = (() => () => {}) as unknown as PiRegisterReducerF;

  // A stable registerCard wrapper used when calling registerMetacard()
  const registerCardF: RegisterCardF = (name, params) =>
    _registerCard(name, params, noopReducer);

  it("sets metaCard on the top card of a metacard instance", () => {
    const innerType = `inner-${uid()}`;
    const metaType = `meta-${uid()}`;
    const metaName = `instance-${uid()}`;

    addCardComponent({name: innerType, component: () => null});
    registerMetacard(registerCardF)({
      type: metaType,
      mapper: (_name, _props, _rc) => ({cardType: innerType}),
    });

    _registerCard(metaName, {cardType: metaType}, noopReducer);

    const mapping = cardMappings[metaName];
    expect(mapping).toBeDefined();
    expect(mapping.metaCard).toEqual({name: metaName, topCard: metaName});
  });

  it("sets metaCard on sub-cards registered by the mapper", () => {
    const innerType = `inner-${uid()}`;
    const metaType = `meta-${uid()}`;
    const metaName = `instance-${uid()}`;

    addCardComponent({name: innerType, component: () => null});
    registerMetacard(registerCardF)({
      type: metaType,
      mapper: (_name, _props, rc) => {
        rc("child", {cardType: innerType});
        return {cardType: innerType};
      },
    });

    _registerCard(metaName, {cardType: metaType}, noopReducer);

    const subMapping = cardMappings[`${metaName}/child`];
    expect(subMapping).toBeDefined();
    expect(subMapping.metaCard).toEqual({name: metaName, topCard: metaName});
  });

  it("metaCard.name and metaCard.topCard both equal the metacard's registered name", () => {
    const innerType = `inner-${uid()}`;
    const metaType = `meta-${uid()}`;
    const metaName = `instance-${uid()}`;

    addCardComponent({name: innerType, component: () => null});
    registerMetacard(registerCardF)({
      type: metaType,
      mapper: (_name, _props, rc) => {
        rc("a", {cardType: innerType});
        rc("b", {cardType: innerType});
        return {cardType: innerType};
      },
    });

    _registerCard(metaName, {cardType: metaType}, noopReducer);

    for (const key of [metaName, `${metaName}/a`, `${metaName}/b`]) {
      expect(cardMappings[key]?.metaCard?.name).toBe(metaName);
      expect(cardMappings[key]?.metaCard?.topCard).toBe(metaName);
    }
  });

  it("does NOT set metaCard on ordinary (non-metacard) cards", () => {
    const plainType = `plain-${uid()}`;
    const plainName = `plain-instance-${uid()}`;

    addCardComponent({name: plainType, component: () => null});
    _registerCard(plainName, {cardType: plainType}, noopReducer);

    expect(cardMappings[plainName]).toBeDefined();
    expect(cardMappings[plainName].metaCard).toBeUndefined();
  });
});
