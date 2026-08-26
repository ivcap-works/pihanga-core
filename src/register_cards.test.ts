/**
 * Tests for register_cards.ts — card declaration helpers and the memo utility.
 *
 * We focus on pure / side-effect-free helpers (isCardRef, createCardDeclaration,
 * memo) and the addCardComponent registry so that the tests are straightforward
 * and don't depend on a running Redux store.
 */
import { describe, expect, it, vi } from "vitest";
import {
  _createCardMapping,
  _registerCard,
  _updateCard,
  addCardComponent,
  cardMappings,
  cardTypes,
  createCardDeclaration,
  createCardDeclaration2,
  isCardRef,
  memo,
  metaCardCtxtPropsStore,
  registerMetacard,
  removeCardMapping,
  resolveCardType,
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
    expect(isCardRef({ cardType: "ui/button" })).toBe(true);
  });

  it("returns true even when cardType is an empty string", () => {
    // The check is only `!== undefined`, so an empty string still qualifies
    expect(isCardRef({ cardType: "" })).toBe(true);
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
    expect(isCardRef({ title: "Hello" })).toBe(false);
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
    const Button = createCardDeclaration<{ label: string }>("ui/button");
    const def = Button({ label: "Click me" } as any);
    expect(def.cardType).toBe("ui/button");
    expect(def.label).toBe("Click me");
  });

  it("preserves every prop from the input", () => {
    type Props = { count: number; label: string; active: boolean };
    const Widget = createCardDeclaration<Props>("ui/widget");
    const def = Widget({ count: 5, label: "hi", active: true } as any);
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
    const A = createCardDeclaration<{ x: number }>("ns/type-a");
    const B = createCardDeclaration<{ y: string }>("ns/type-b");

    const defA = A({ x: 1 } as any);
    const defB = B({ y: "hello" } as any);

    expect(defA.cardType).toBe("ns/type-a");
    expect(defB.cardType).toBe("ns/type-b");
    // They must not bleed into each other
    expect((defA as any).y).toBeUndefined();
    expect((defB as any).x).toBeUndefined();
  });

  it("later props can override cardType if explicitly set (plain spread)", () => {
    // createCardDeclaration spreads then adds cardType last, so cardType wins.
    const Card = createCardDeclaration<{ label: string }>("ui/original");
    // Even if the prop object tries to set cardType, the declared type wins
    const def = Card({ label: "test", cardType: "ui/override" } as any);
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
    addCardComponent({ name, component });
    expect(cardTypes[name]).toBeDefined();
    expect(cardTypes[name].component).toBe(component);
  });

  it("stores the supplied events map alongside the component", () => {
    const name = uid();
    const events = { onClick: "ui/click", onHover: "ui/hover" };
    addCardComponent({ name, component: () => null, events });
    expect(cardTypes[name].events).toEqual(events);
  });

  it("overwrites a previous registration for the same name", () => {
    const name = uid();
    const first = () => null;
    const second = () => null;
    addCardComponent({ name, component: first });
    addCardComponent({ name, component: second });
    expect(cardTypes[name].component).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// memo
// ---------------------------------------------------------------------------

type AppState = ReduxState & { items: string[] };

function makeAppState(items: string[]): AppState {
  return { route: { path: [], query: {}, url: "/" }, pihanga: {}, items };
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
      (_items: string[], context: StateMapperContext<unknown>, state: AppState) =>
        `${context.cardKey ?? "-"}:${state.items.length}`,
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

    addCardComponent({ name: innerType, component: () => null });
    registerMetacard(registerCardF)({
      type: metaType,
      mapper: (_name, _props, _rc) => ({ cardType: innerType }),
    });

    _registerCard(metaName, { cardType: metaType }, noopReducer);

    const mapping = cardMappings[metaName];
    expect(mapping).toBeDefined();
    expect(mapping.metaCard).toEqual({ name: metaName, topCard: metaName });
  });

  it("sets metaCard on sub-cards registered by the mapper", () => {
    const innerType = `inner-${uid()}`;
    const metaType = `meta-${uid()}`;
    const metaName = `instance-${uid()}`;

    addCardComponent({ name: innerType, component: () => null });
    registerMetacard(registerCardF)({
      type: metaType,
      mapper: (_name, _props, rc) => {
        rc("child", { cardType: innerType });
        return { cardType: innerType };
      },
    });

    _registerCard(metaName, { cardType: metaType }, noopReducer);

    const subMapping = cardMappings[`${metaName}/child`];
    expect(subMapping).toBeDefined();
    expect(subMapping.metaCard).toEqual({ name: metaName, topCard: metaName });
  });

  it("metaCard.name and metaCard.topCard both equal the metacard's registered name", () => {
    const innerType = `inner-${uid()}`;
    const metaType = `meta-${uid()}`;
    const metaName = `instance-${uid()}`;

    addCardComponent({ name: innerType, component: () => null });
    registerMetacard(registerCardF)({
      type: metaType,
      mapper: (_name, _props, rc) => {
        rc("a", { cardType: innerType });
        rc("b", { cardType: innerType });
        return { cardType: innerType };
      },
    });

    _registerCard(metaName, { cardType: metaType }, noopReducer);

    for (const key of [metaName, `${metaName}/a`, `${metaName}/b`]) {
      expect(cardMappings[key]?.metaCard?.name).toBe(metaName);
      expect(cardMappings[key]?.metaCard?.topCard).toBe(metaName);
    }
  });

  it("does NOT set metaCard on ordinary (non-metacard) cards", () => {
    const plainType = `plain-${uid()}`;
    const plainName = `plain-instance-${uid()}`;

    addCardComponent({ name: plainType, component: () => null });
    _registerCard(plainName, { cardType: plainType }, noopReducer);

    expect(cardMappings[plainName]).toBeDefined();
    expect(cardMappings[plainName].metaCard).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Event mapper / metacard event forwarding
// ---------------------------------------------------------------------------

describe("metacard event mapper — onXxxMapper forwarded from mapper-returned card", () => {
  const uid = () => Math.random().toString(36).slice(2);
  const noopReducer = (() => () => {}) as unknown as PiRegisterReducerF;
  const registerCardF: RegisterCardF = (name, params) =>
    _registerCard(name, params, noopReducer);

  /**
   * Reproduces the bug where a metacard mapper returns an inner card that
   * carries `onSelectedMapper` / `onSelected` props, and the metacard's
   * `events` object uses RAW uppercase keys (as produced by `registerActions`).
   *
   * Before the fix:
   *   - `processEventParameter("onSelectedMapper", ..., { SELECTED: "..." })`
   *     cannot match "SELECTED" against "onSelectedMapper" → returns false
   *   - `onSelectedMapper` ends up in `mapping.props` instead of
   *     `mapping.eventMappers`, causing it to be called as a state mapper in
   *     `getCardProps` and the event interception never fires.
   *
   * After the fix the mc.events keys are normalised to camelCase "on…" form
   * before being used as `cardEvents`, so `processEventParameter` can match
   * them correctly.
   */
  it("onXxxMapper from the mapper-returned card lands in eventMappers, not props", () => {
    // 1. Register the inner card type (DropDownMenu-like) with its own events.
    const innerType = `inner-ddm-${uid()}`;
    addCardComponent({
      name: innerType,
      component: () => null,
      events: { onSelected: `${innerType}/selected` },
    });

    // 2. Metacard action constants — uppercase keys, as registerActions produces.
    const metaType = `meta-cs-${uid()}`;
    const metaName = `instance-cs-${uid()}`;
    const META_SELECTED = `${metaType}/selected`;
    const META_ACTION = { SELECTED: META_SELECTED } as const;

    // 3. Mapper that returns the inner card definition WITH an onSelectedMapper.
    const mapperFn = (ev: any) => ({ ...ev, type: META_SELECTED });
    const handlerFn = () => {};
    registerMetacard(registerCardF)({
      type: metaType,
      mapper: () =>
        ({
          cardType: innerType,
          onSelectedMapper: mapperFn,
          onSelected: handlerFn,
        }) as any,
      events: META_ACTION as any,
    });

    // 4. Register an instance of the metacard.
    _registerCard(metaName, { cardType: metaType } as any, noopReducer);

    // 5. Assertions — the mapper must live in eventMappers, NOT in props.
    const mapping = cardMappings[metaName];
    expect(mapping).toBeDefined();

    // onSelectedMapper must NOT be treated as a regular prop.
    expect(mapping.props["onSelectedMapper"]).toBeUndefined();
    // onSelected (handler) must NOT be treated as a regular prop either.
    expect(mapping.props["onSelected"]).toBeUndefined();

    // The mapper function must be reachable via eventMappers["onSelected"].
    expect(mapping.eventMappers["onSelected"]).toBe(mapperFn);
  });

  /**
   * Reproduces the second part of the metacard event bug: when the consumer of
   * a metacard supplies an `onSelected` handler at the call site, the handler
   * must be registered as a reducer for the metacard's action type
   * (`CONTENT_SELECTOR_ACTION.SELECTED`).
   *
   * The mapper internally re-maps the inner card's raw `onSelected` via
   * `onSelectedMapper` to the metacard's action type.  The consumer's handler
   * must fire when that remapped action is dispatched with the metacard
   * instance's `cardID`.
   */
  it("consumer's onSelected handler on metacard call-site gets registered as a reducer", () => {
    const innerType = `inner-cs2-${uid()}`;
    addCardComponent({
      name: innerType,
      component: () => null,
      events: { onSelected: `${innerType}/selected` },
    });

    const metaType = `meta-cs2-${uid()}`;
    const metaName = `instance-cs2-${uid()}`;
    const META_SELECTED = `${metaType}/selected`;
    const META_ACTION = { SELECTED: META_SELECTED } as const;

    // Track what action types the reducer was registered for, and with what handler.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registrations: Array<{ type: string; wrapper: (...args: any[]) => any }> = [];
    const trackingReducer: PiRegisterReducerF = (
      eventType,
      mapper,
      _priority?,
      _key?,
      _targetMapper?,
    ) => {
      registrations.push({ type: eventType, wrapper: mapper });
      return () => {};
    };
    const trackingRegisterCardF: RegisterCardF = (name, params) =>
      _registerCard(name, params, trackingReducer);

    const mapperFn = (ev: any) => ({ ...ev, type: META_SELECTED });
    registerMetacard(trackingRegisterCardF)({
      type: metaType,
      mapper: () =>
        ({
          cardType: innerType,
          onSelectedMapper: mapperFn,
        }) as any,
      events: META_ACTION as any,
    });

    // Consumer passes onSelected handler at call site.
    const consumerHandler = vi.fn();
    _registerCard(
      metaName,
      { cardType: metaType, onSelected: consumerHandler } as any,
      trackingReducer,
    );

    // A reducer for the metacard's action type must have been registered.
    const metaRegistration = registrations.find((r) => r.type === META_SELECTED);
    expect(metaRegistration).toBeDefined();

    // The registered wrapper must call consumerHandler when cardID matches.
    const fakeState = {};
    const fakeDispatch = vi.fn();
    const fakeOpts = {} as any;
    metaRegistration!.wrapper(
      fakeState,
      { type: META_SELECTED, cardID: metaName },
      fakeDispatch,
      fakeOpts,
    );
    expect(consumerHandler).toHaveBeenCalledOnce();

    // Must NOT be called when cardID is a different card.
    metaRegistration!.wrapper(
      fakeState,
      { type: META_SELECTED, cardID: "some-other-card" },
      fakeDispatch,
      fakeOpts,
    );
    expect(consumerHandler).toHaveBeenCalledOnce(); // still only once
  });

  /**
   * Demonstrates the bug where the mapper-returned card carries `on*` props
   * that match the **inner card type's** events (not the metacard's events).
   *
   * Scenario:
   *   - Inner card type has event `onClicked` → "inner/clicked"
   *   - Metacard has a DIFFERENT event `onButtonClicked` → "meta/button-clicked"
   *   - The mapper returns `{ cardType: innerType, onClickedMapper: remapFn }`
   *     to intercept the raw button click and re-dispatch as the metacard action.
   *
   * Bug (before fix):
   *   `_registerCard(metaName, top, registerReducer, normalizedMcEvents)` is
   *   called with `overrideEvents = { onButtonClicked: "meta/button-clicked" }`.
   *   Inside `_createCardMapping`, `cardEvents` only contains the metacard events,
   *   so `processEventParameter("onClickedMapper", ...)` finds no matching entry
   *   and `onClickedMapper` silently falls through into `mapping.props` instead of
   *   `mapping.eventMappers`.
   *
   * Expected (after fix):
   *   The inner card type's events are also considered when processing the
   *   mapper-returned top card's `on*` props, so `onClickedMapper` correctly
   *   lands in `mapping.eventMappers["onClicked"]`.
   */
  it("BUG: onXxxMapper on mapper-returned card using inner card's event name ends up in eventMappers, not props", () => {
    const innerType = `inner-btn-${uid()}`;
    // Inner card type has its own "onClicked" event.
    addCardComponent({
      name: innerType,
      component: () => null,
      events: { onClicked: `${innerType}/clicked` },
    });

    const metaType = `meta-btn-${uid()}`;
    const metaName = `instance-btn-${uid()}`;
    // Metacard has a DIFFERENT event name — "onButtonClicked" — to prove the bug.
    const META_BTN_CLICKED = `${metaType}/button-clicked`;

    // The mapper returns the inner card WITH an onClickedMapper that remaps
    // the inner card's raw "clicked" action to the metacard's action type.
    const remapFn = (ev: any) => ({ ...ev, type: META_BTN_CLICKED });
    registerMetacard(registerCardF)({
      type: metaType,
      mapper: () =>
        ({
          cardType: innerType,
          onClickedMapper: remapFn,
        }) as any,
      events: { onButtonClicked: META_BTN_CLICKED } as any,
    });

    _registerCard(metaName, { cardType: metaType } as any, noopReducer);

    const mapping = cardMappings[metaName];
    expect(mapping).toBeDefined();

    // onClickedMapper must NOT fall through to regular props.
    expect(mapping.props["onClickedMapper"]).toBeUndefined();
    // It must be in eventMappers under the inner card's event name "onClicked",
    // so that card.tsx can intercept the inner card's dispatch and remap it.
    expect(mapping.eventMappers["onClicked"]).toBe(remapFn);
  });

  it("regular (non-metacard) card still correctly puts onXxxMapper in eventMappers", () => {
    const cardType = `plain-with-mapper-${uid()}`;
    const cardName = `plain-mapper-inst-${uid()}`;
    addCardComponent({
      name: cardType,
      component: () => null,
      events: { onClicked: `${cardType}/clicked` },
    });

    const myMapper = (ev: any) => ({ ...ev, type: "custom/action" });
    _createCardMapping(
      cardName,
      { cardType, onClickedMapper: myMapper } as any,
      noopReducer,
      { onClicked: `${cardType}/clicked` },
    );

    const mapping = cardMappings[cardName];
    expect(mapping.props["onClickedMapper"]).toBeUndefined();
    expect(mapping.eventMappers["onClicked"]).toBe(myMapper);
  });
});

// ---------------------------------------------------------------------------
// `resolve` support in plain onXxx event-handler reducers (metacard props)
// ---------------------------------------------------------------------------

describe("processEventParameter — plain onXxx handlers receive opts.resolve", () => {
  const uid = () => Math.random().toString(36).slice(2);

  // Tracking reducer captures the wrapped handler so we can invoke it directly,
  // simulating a dispatched action for the card.
  function makeTrackingReducer(): {
    reducer: PiRegisterReducerF;
    registrations: Array<{ type: string; wrapper: (...args: any[]) => any }>;
  } {
    const registrations: Array<{ type: string; wrapper: (...args: any[]) => any }> =
      [];
    const reducer: PiRegisterReducerF = (eventType, mapper) => {
      registrations.push({ type: eventType, wrapper: mapper });
      return () => {};
    };
    return { reducer, registrations };
  }

  it("plain onXxx handler on a regular (non-metacard) card receives a resolve() that returns plain values as-is", () => {
    const cardType = `resolve-plain-${uid()}`;
    const cardName = `resolve-plain-inst-${uid()}`;
    const { reducer, registrations } = makeTrackingReducer();

    addCardComponent({
      name: cardType,
      component: () => null,
      events: { onClicked: `${cardType}/clicked` },
    });

    let capturedResolve: ((prop: any) => any) | undefined;
    const handler = vi.fn((_s: any, _a: any, _d: any, opts: any) => {
      capturedResolve = opts.resolve;
    });

    _createCardMapping(cardName, { cardType, onClicked: handler } as any, reducer, {
      onClicked: `${cardType}/clicked`,
    });

    const reg = registrations.find((r) => r.type === `${cardType}/clicked`);
    expect(reg).toBeDefined();

    reg!.wrapper({}, { type: `${cardType}/clicked`, cardID: cardName }, vi.fn(), {});
    expect(handler).toHaveBeenCalledOnce();
    expect(capturedResolve).toBeTypeOf("function");
    // Plain (non-function) values pass through resolve() unchanged.
    expect(capturedResolve!("plain-value")).toBe("plain-value");
    expect(capturedResolve!(42)).toBe(42);
  });

  it("plain onXxx handler receives a resolve() that invokes a state-mapper function prop", () => {
    const cardType = `resolve-fn-${uid()}`;
    const cardName = `resolve-fn-inst-${uid()}`;
    const { reducer, registrations } = makeTrackingReducer();

    addCardComponent({
      name: cardType,
      component: () => null,
      events: { onClicked: `${cardType}/clicked` },
    });

    let capturedResolve: ((prop: any) => any) | undefined;
    const handler = vi.fn((_s: any, _a: any, _d: any, opts: any) => {
      capturedResolve = opts.resolve;
    });

    _createCardMapping(cardName, { cardType, onClicked: handler } as any, reducer, {
      onClicked: `${cardType}/clicked`,
    });

    const reg = registrations.find((r) => r.type === `${cardType}/clicked`);
    const fakeState = { value: 99 };
    reg!.wrapper(fakeState, { type: `${cardType}/clicked`, cardID: cardName }, vi.fn(), {});

    // A "selector"-style prop: (state, ctx) => value
    const selector = vi.fn((s: any) => s.value * 2);
    expect(capturedResolve!(selector)).toBe(198);
    expect(selector).toHaveBeenCalledWith(fakeState, expect.anything());
  });

  it("resolve() for a metacard's plain onXxx handler resolves against the metacard's ctxtProps (metaCtxtProps)", () => {
    const innerType = `resolve-meta-inner-${uid()}`;
    const metaType = `resolve-meta-${uid()}`;
    const metaName = `resolve-meta-inst-${uid()}`;
    const { reducer, registrations } = makeTrackingReducer();

    addCardComponent({
      name: innerType,
      component: () => null,
      events: { onClicked: `${innerType}/clicked` },
    });

    const registerCardF: RegisterCardF = (name, params) =>
      _registerCard(name, params, reducer);

    registerMetacard(registerCardF)({
      type: metaType,
      mapper: () => ({ cardType: innerType }) as any,
      events: { onSelected: `${metaType}/selected` } as any,
    });

    let capturedResolve: ((prop: any) => any) | undefined;
    const consumerHandler = vi.fn((_s: any, _a: any, _d: any, opts: any) => {
      capturedResolve = opts.resolve;
    });

    // Register the metacard instance with a `value` prop that is a state
    // selector, and a plain onSelected handler.
    const valueSelector = (s: any) => s.count;
    _registerCard(
      metaName,
      { cardType: metaType, value: valueSelector, onSelected: consumerHandler } as any,
      reducer,
    );

    // Simulate the top card's render writing its ctxtProps into the store
    // (this is normally done synchronously by GenericCardComponent in card.tsx).
    metaCardCtxtPropsStore[metaName] = {
      cardName: metaName,
      value: valueSelector,
    } as any;

    const reg = registrations.find((r) => r.type === `${metaType}/selected`);
    expect(reg).toBeDefined();

    const fakeState = { count: 7 };
    reg!.wrapper(fakeState, { type: `${metaType}/selected`, cardID: metaName }, vi.fn(), {});

    expect(consumerHandler).toHaveBeenCalledOnce();
    expect(capturedResolve).toBeTypeOf("function");
    // resolve(props.value) should invoke the selector against the current state.
    expect(capturedResolve!(valueSelector)).toBe(7);

    delete metaCardCtxtPropsStore[metaName];
  });

  it("resolve() is only exposed to the top card of a metacard, not treated as metaCtxtProps for itself", () => {
    // The top card of a metacard instance has metaCard.topCard === cardName,
    // so its own resolve() should NOT look up metaCardCtxtPropsStore (that store
    // entry is only relevant for SUB-cards of the metacard instance).
    const cardType = `resolve-top-${uid()}`;
    const metaType = `resolve-top-meta-${uid()}`;
    const metaName = `resolve-top-inst-${uid()}`;
    const { reducer, registrations } = makeTrackingReducer();

    addCardComponent({
      name: cardType,
      component: () => null,
      events: { onClicked: `${cardType}/clicked` },
    });

    const registerCardF: RegisterCardF = (name, params) =>
      _registerCard(name, params, reducer);

    registerMetacard(registerCardF)({
      type: metaType,
      mapper: () => ({ cardType }) as any,
      events: { onClicked: `${metaType}/clicked` } as any,
    });

    let capturedResolve: ((prop: any) => any) | undefined;
    const handler = vi.fn((_s: any, _a: any, _d: any, opts: any) => {
      capturedResolve = opts.resolve;
    });

    _registerCard(
      metaName,
      { cardType: metaType, onClicked: handler } as any,
      reducer,
    );

    const reg = registrations.find((r) => r.type === `${metaType}/clicked`);
    expect(reg).toBeDefined();

    reg!.wrapper({}, { type: `${metaType}/clicked`, cardID: metaName }, vi.fn(), {});
    expect(handler).toHaveBeenCalledOnce();
    // Even without any metaCardCtxtPropsStore entry, resolve() must still work
    // for plain values (falls back to ctxtProps: {}).
    expect(capturedResolve!("static")).toBe("static");
  });
});

// ---------------------------------------------------------------------------
// Inline card declarations in array props are auto-registered
// ---------------------------------------------------------------------------

describe("array prop containing inline card declarations is auto-registered", () => {
  const uid = () => Math.random().toString(36).slice(2);
  const noopReducer = (() => () => {}) as unknown as PiRegisterReducerF;
  const registerCardF: RegisterCardF = (name, params) =>
    _registerCard(name, params, noopReducer);

  /**
   * Reproduces the pattern:
   *   Box({ content: [Typography({ text: "BOOO" })] })
   * returned directly from a meta card mapper.  Before the fix the
   * Typography PiCardDef would be silently ignored (only a warning was
   * emitted); after the fix it must be registered as
   * `${metaName}/content/0`.
   */
  it("registers each inline card declaration in an array prop under name/prop/index", () => {
    const boxType = `box-${uid()}`;
    const textType = `text-${uid()}`;
    const metaType = `meta-array-${uid()}`;
    const metaName = `instance-array-${uid()}`;

    addCardComponent({ name: boxType, component: () => null });
    addCardComponent({ name: textType, component: () => null });

    registerMetacard(registerCardF)({
      type: metaType,
      // mapper returns a Box whose `content` array contains a raw Typography declaration
      mapper: () =>
        ({
          cardType: boxType,
          content: [{ cardType: textType, text: "BOOO" }],
        }) as any,
    });

    _registerCard(metaName, { cardType: metaType } as any, noopReducer);

    // The Box card itself must be registered
    expect(cardMappings[metaName]).toBeDefined();
    expect(cardMappings[metaName].cardType).toBe(boxType);

    // The inline Typography must be auto-registered as name/content/0
    const childKey = `${metaName}/content/0`;
    expect(cardMappings[childKey]).toBeDefined();
    expect(cardMappings[childKey].cardType).toBe(textType);

    // The `content` prop stored on the Box card must be the child name string, not the raw def
    expect(cardMappings[metaName].props["content"]).toEqual([childKey]);
  });

  it("mixed arrays: card defs are registered, plain values are kept as-is", () => {
    const containerType = `container-${uid()}`;
    const itemType = `item-${uid()}`;
    const name = `mixed-array-inst-${uid()}`;

    addCardComponent({ name: containerType, component: () => null });
    addCardComponent({ name: itemType, component: () => null });

    _createCardMapping(
      name,
      {
        cardType: containerType,
        // mix of plain strings and an inline card declaration
        items: ["string-a", { cardType: itemType, label: "x" }, "string-b"],
      } as any,
      noopReducer,
      {},
    );

    const childKey = `${name}/items/1`;
    expect(cardMappings[childKey]).toBeDefined();
    expect(cardMappings[childKey].cardType).toBe(itemType);

    const stored = cardMappings[name].props["items"] as unknown[];
    expect(stored[0]).toBe("string-a");
    expect(stored[1]).toBe(childKey); // replaced with the registered name
    expect(stored[2]).toBe("string-b");
  });
});

// ---------------------------------------------------------------------------
// B1 — null prop value must not crash _createCardMapping
// ---------------------------------------------------------------------------

describe("B1 — null prop does not crash _createCardMapping", () => {
  const uid = () => Math.random().toString(36).slice(2);
  const noopReducer = (() => () => {}) as unknown as PiRegisterReducerF;

  it("stores null as a plain prop without throwing", () => {
    const cardType = `b1-card-${uid()}`;
    const cardName = `b1-instance-${uid()}`;
    addCardComponent({ name: cardType, component: () => null });

    // Before the fix typeof null === "object" caused `.cardType` access to throw.
    expect(() =>
      _createCardMapping(
        cardName,
        { cardType, someNullProp: null } as any,
        noopReducer,
        {},
      ),
    ).not.toThrow();

    // The null value should be stored as a plain prop, not treated as a card ref.
    expect(cardMappings[cardName]).toBeDefined();
    expect(cardMappings[cardName].props["someNullProp"]).toBeNull();
  });

  it("still registers nested card refs that are non-null objects with cardType", () => {
    const innerType = `b1-inner-${uid()}`;
    const outerType = `b1-outer-${uid()}`;
    const outerName = `b1-outer-instance-${uid()}`;
    addCardComponent({ name: innerType, component: () => null });
    addCardComponent({ name: outerType, component: () => null });

    _createCardMapping(
      outerName,
      { cardType: outerType, child: { cardType: innerType } } as any,
      noopReducer,
      {},
    );

    // child should have been recursively registered as a named card
    expect(cardMappings[`${outerName}/child`]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// A8 — memo() cache key uses cardName (unique per instance)
// ---------------------------------------------------------------------------

describe("A8 — memo cache key is cardName, not cardKey", () => {
  const makeCtxt = (cardName: string, cardKey?: string) => ({
    cardName,
    cardKey,
    ctxtProps: {},
    metaCtxtProps: undefined,
    resolve: (p: any) => p,
  });

  it("two distinct card instances share no cache slot when both lack a cardKey", () => {
    const filterFn = vi.fn((s: any) => s.value);
    const mapperFn = vi.fn((v: number) => v * 2);
    const memoFn = memo(filterFn, mapperFn);

    const state1 = { value: 10 };
    const state2 = { value: 20 };

    memoFn(state1 as any, makeCtxt("card-alpha") as any);
    // Previously both went to the "-" bucket, so the second call would
    // thrash card-alpha's cache. Now each has its own slot.
    memoFn(state2 as any, makeCtxt("card-beta") as any);

    // Force a second call for card-alpha with the same state — must use the cache.
    memoFn(state1 as any, makeCtxt("card-alpha") as any);

    // mapperFn should have been called only twice (once per unique instance),
    // not three times (which would happen if the cache was shared).
    expect(mapperFn).toHaveBeenCalledTimes(2);
  });

  it("tabular rows with the same cardName are distinguished by cardKey", () => {
    const filterFn = vi.fn((s: any) => s.value);
    const mapperFn = vi.fn((v: number) => v * 3);
    const memoFn = memo(filterFn, mapperFn);

    const state = { value: 5 };

    memoFn(state as any, makeCtxt("row-card", "row-1") as any);
    memoFn(state as any, makeCtxt("row-card", "row-2") as any);

    // Different cardKeys within the same cardName → separate cache slots.
    expect(mapperFn).toHaveBeenCalledTimes(2);
  });

  it("repeated call with unchanged filter value returns cached result (no mapper re-run)", () => {
    let filterCalls = 0;
    let mapperCalls = 0;
    const memoFn = memo(
      (s: any) => {
        filterCalls++;
        return s.x;
      },
      (v: number) => {
        mapperCalls++;
        return v + 1;
      },
    );

    const state = { x: 7 };
    const ctx = makeCtxt("stable-card") as any;

    memoFn(state, ctx); // first: filter + mapper
    memoFn(state, ctx); // second: filter only (same ref → cached)

    expect(filterCalls).toBe(2);
    expect(mapperCalls).toBe(1); // mapper NOT re-run for same filter value
  });
});

// ---------------------------------------------------------------------------
// createCardDeclaration2 — typed dynamic/static split
// ---------------------------------------------------------------------------

describe("createCardDeclaration2", () => {
  it("adds cardType to the returned PiCardDef", () => {
    const Card = createCardDeclaration2<{ value: number }, { label: string }>("ui/split");
    const def = Card({ value: 1, label: "hi" } as any);
    expect(def.cardType).toBe("ui/split");
  });

  it("preserves all dynamic and static props in the output", () => {
    const Card = createCardDeclaration2<{ count: number }, { name: string }>("ui/mixed");
    const def = Card({ count: 42, name: "test" } as any);
    expect((def as any).count).toBe(42);
    expect((def as any).name).toBe("test");
  });

  it("the declared cardType always wins over any prop value", () => {
    const Card = createCardDeclaration2("ui/canonical");
    const def = Card({ cardType: "ui/override" } as any);
    expect(def.cardType).toBe("ui/canonical");
  });

  it("two declarations for different types produce independent factories", () => {
    const A = createCardDeclaration2<{ x: number }, {}>("ns/cd2-a");
    const B = createCardDeclaration2<{}, { y: string }>("ns/cd2-b");
    expect(A({ x: 1 } as any).cardType).toBe("ns/cd2-a");
    expect(B({ y: "hello" } as any).cardType).toBe("ns/cd2-b");
  });

  it("works with an empty props object", () => {
    const Card = createCardDeclaration2("ui/empty");
    const def = Card({} as any);
    expect(def.cardType).toBe("ui/empty");
  });
});

// ---------------------------------------------------------------------------
// removeCardMapping — cleanup of named and child mappings
// ---------------------------------------------------------------------------

describe("removeCardMapping", () => {
  const uid = () => Math.random().toString(36).slice(2);
  const noopReducer = (() => () => {}) as unknown as PiRegisterReducerF;

  it("removes the named card mapping", () => {
    const type = `rm-plain-${uid()}`;
    const name = `rm-inst-${uid()}`;
    addCardComponent({ name: type, component: () => null });
    _registerCard(name, { cardType: type }, noopReducer);
    expect(cardMappings[name]).toBeDefined();

    removeCardMapping(name);
    expect(cardMappings[name]).toBeUndefined();
  });

  it("removes child card mappings (name/key prefix) but not unrelated cards", () => {
    const outerType = `rm-outer-${uid()}`;
    const innerType = `rm-inner-${uid()}`;
    const outerName = `rm-outer-inst-${uid()}`;
    const siblingName = `rm-sibling-${uid()}`;
    addCardComponent({ name: outerType, component: () => null });
    addCardComponent({ name: innerType, component: () => null });

    // Register the outer card with a nested child card ref.
    _createCardMapping(
      outerName,
      { cardType: outerType, child: { cardType: innerType } } as any,
      noopReducer,
      {},
    );
    // Register a completely separate card that must survive the removal.
    _registerCard(siblingName, { cardType: innerType }, noopReducer);

    const childKey = `${outerName}/child`;
    expect(cardMappings[outerName]).toBeDefined();
    expect(cardMappings[childKey]).toBeDefined();
    expect(cardMappings[siblingName]).toBeDefined();

    removeCardMapping(outerName);

    expect(cardMappings[outerName]).toBeUndefined();
    expect(cardMappings[childKey]).toBeUndefined();
    // Sibling (unrelated card) must survive
    expect(cardMappings[siblingName]).toBeDefined();
  });

  it("calls the reducer cancel functions for the removed card's event handlers", () => {
    const type = `rm-cancel-${uid()}`;
    const name = `rm-cancel-inst-${uid()}`;
    const cancelFn = vi.fn();
    const trackingReducer = ((_: any, __: any) =>
      cancelFn) as unknown as PiRegisterReducerF;
    addCardComponent({
      name: type,
      component: () => null,
      events: { onClick: `${type}/click` },
    });

    _createCardMapping(
      name,
      { cardType: type, onClick: () => {} } as any,
      trackingReducer,
      { onClick: `${type}/click` },
    );

    removeCardMapping(name);
    expect(cancelFn).toHaveBeenCalled();
  });

  it("is idempotent — calling it twice on the same name does not throw", () => {
    const type = `rm-idm-${uid()}`;
    const name = `rm-idm-inst-${uid()}`;
    addCardComponent({ name: type, component: () => null });
    _registerCard(name, { cardType: type }, noopReducer);

    expect(() => {
      removeCardMapping(name);
      removeCardMapping(name); // second call on an already-removed key must not throw
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// _updateCard — merging new props onto an existing card mapping
// ---------------------------------------------------------------------------

describe("_updateCard", () => {
  const uid = () => Math.random().toString(36).slice(2);
  const noopReducer = (() => () => {}) as unknown as PiRegisterReducerF;

  it("registers a new card when no previous mapping exists", () => {
    const type = `upd-new-${uid()}`;
    const name = `upd-new-inst-${uid()}`;
    addCardComponent({ name: type, component: () => null });

    _updateCard(name, { cardType: type, label: "initial" } as any, noopReducer);
    expect(cardMappings[name]).toBeDefined();
    expect(cardMappings[name].props["label"]).toBe("initial");
  });

  it("merges new props onto the existing mapping without losing unchanged props", () => {
    const type = `upd-merge-${uid()}`;
    const name = `upd-merge-inst-${uid()}`;
    addCardComponent({ name: type, component: () => null });

    _registerCard(name, { cardType: type, a: "first", b: "keep" } as any, noopReducer);
    _updateCard(name, { a: "updated" } as any, noopReducer);

    expect(cardMappings[name].props["a"]).toBe("updated");
    expect(cardMappings[name].props["b"]).toBe("keep");
  });

  it("new props added via _updateCard are visible in the mapping", () => {
    const type = `upd-add-${uid()}`;
    const name = `upd-add-inst-${uid()}`;
    addCardComponent({ name: type, component: () => null });

    _registerCard(name, { cardType: type } as any, noopReducer);
    _updateCard(name, { extra: "newvalue" } as any, noopReducer);

    expect(cardMappings[name].props["extra"]).toBe("newvalue");
  });
});

// ---------------------------------------------------------------------------
// resolveCardType — component lookup with optional framework fallback
// ---------------------------------------------------------------------------

describe("resolveCardType", () => {
  const uid = () => Math.random().toString(36).slice(2);

  it("returns the registered component for a known card type", () => {
    const name = `resolve-${uid()}`;
    const component = () => null;
    addCardComponent({ name, component });
    const resolved = resolveCardType(name);
    expect(resolved).toBeDefined();
    expect(resolved!.component).toBe(component);
  });

  it("returns undefined for an unknown card type", () => {
    expect(resolveCardType(`no-such-type-${uid()}`)).toBeUndefined();
  });

  it("the resolved component includes the events map when one was registered", () => {
    const name = `resolve-events-${uid()}`;
    const events = { onClick: "test/click" };
    addCardComponent({ name, component: () => null, events });
    expect(resolveCardType(name)!.events).toEqual(events);
  });
});
