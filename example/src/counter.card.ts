/**
 * @file counter.card.ts
 *
 * ## Meta Card: Counter
 *
 * This file defines a **meta card** — a reusable, higher-level card that is
 * itself composed entirely of other Pihanga cards (primitive or meta). Meta
 * cards are the primary building block for complex, self-contained UI widgets
 * that can be independently developed, tested, and dropped into any Pihanga
 * application.
 *
 * ### Composition
 * The `Counter` meta card is assembled inside `CounterMapper` using three
 * standard `@pihanga2/shadcn` cards:
 *
 * - **`Stack`** — lays out its children in a horizontal row.
 * - **`Button`** (×2) — decrement ("−") and increment ("+") controls.
 * - **`Typography`** — displays the current count, re-evaluated reactively
 *   on every state change via a resolver function.
 *
 * Because `CounterMapper` receives a `registerCard` helper, child cards can
 * either be returned inline (anonymous) or pre-registered under a stable name
 * (e.g. `"plus"`) so they participate in Pihanga's card registry and can be
 * referenced elsewhere if needed.
 *
 * ### Event Re-Mapping
 * Each `Button` internally dispatches a low-level `onClicked` event. Inside
 * `CounterMapper` those clicks are **re-mapped** via `onClickedMapper` into
 * the semantically meaningful `COUNTER_ACTION.CHANGED` action — the only
 * event that leaks out of this meta card.
 *
 * ```
 * Button.onClicked  ──► onClickedMapper ──► COUNTER_ACTION.CHANGED
 *                                              { value: newCount }
 * ```
 *
 * Consumers of `Counter` never need to know about raw click events; they
 * simply listen with `onCounterChanged` and receive the updated numeric value.
 * This encapsulation mirrors the way React components emit domain-specific
 * callbacks rather than exposing DOM events.
 *
 * ### Independent Testability
 * Because `CounterMapper` is a plain function that returns a `PiCardDef`
 * tree, it can be unit-tested in isolation: supply mock `props` and a mock
 * `registerCard`, then assert on the returned card definition without
 * mounting a full Redux store or rendering to the DOM.
 */

import {
  createCardDeclaration,
  createOnAction,
  registerActions,
  registerMetaCard,
} from "@pihanga2/core";
import type {
  PiCardDef,
  PiMapProps,
  PiRegisterMetaCard,
  RegisterCardF,
} from "@pihanga2/core";
import { Stack, Button, Typography } from "@pihanga2/shadcn";
import { AppState } from "./app.state";

const COUNTER_CARD = "meta/counter";

/**
 * Card declaration for `Counter`. Use this to embed a Counter inside any
 * other card definition:
 *
 * ```ts
 * Counter({ value: (_, {resolve}) => resolve(state.count) })
 * ```
 */
export const Counter = createCardDeclaration<CounterProps, CounterEvents>(COUNTER_CARD);

/**
 * Namespaced action constants for the Counter meta card.
 * - `COUNTER_ACTION.CHANGED` — dispatched whenever the user increments or
 *   decrements the counter; payload is `{ value: number }`.
 */
export const COUNTER_ACTION = registerActions(COUNTER_CARD, ["changed"]);

/**
 * Convenience helper for registering a reducer that responds to the
 * `COUNTER_ACTION.CHANGED` event emitted by any Counter instance.
 *
 * @example
 * ```ts
 * onCounterChanged((state, { value }) => ({ ...state, count: value }));
 * ```
 */
export const onCounterChanged = createOnAction<CounterChangeEvent>(
  COUNTER_ACTION.CHANGED,
);

/** Props exposed to consumers of the Counter meta card. */
type CounterProps = {
  /** The current numeric value displayed by the counter. */
  value: number;
};

/** Payload carried by the `COUNTER_ACTION.CHANGED` action. */
export type CounterChangeEvent = {
  /** The new counter value after the user interaction. */
  value: number;
};

/** Events (outbound actions) that Counter can emit. */
type CounterEvents = {
  onChange: CounterChangeEvent;
};

/**
 * Mapper function that constructs the Counter meta card's internal card tree.
 *
 * This is where composition happens: the mapper builds a `Stack` containing
 * two `Button` cards and a `Typography` card. Each button's raw `onClicked`
 * event is re-mapped (via `onClickedMapper`) to the higher-level
 * `COUNTER_ACTION.CHANGED` action so that external reducers only ever see a
 * clean domain event — not the raw UI interaction.
 *
 * @param _            - Card name (unused here).
 * @param props        - Resolved/lazy props including `value`.
 * @param registerCard - Registers a child card under a stable name so it can
 *                       participate in Pihanga's card registry (optional, but
 *                       shown here for the "plus" button as an example).
 * @returns            A `PiCardDef` describing the full card subtree.
 */
function CounterMapper(
  _: string,
  props: PiMapProps<CounterProps & CounterEvents>,
  registerCard: RegisterCardF,
): PiCardDef {
  // Register the increment button under the name "plus" so it has a stable
  // identity in the card registry. Its onClickedMapper re-maps the generic
  // click event into COUNTER_ACTION.CHANGED with value + 1.
  const plusButton = registerCard(
    "plus",
    Button({
      label: "+",
      opts: { size: "lg" },
      onClickedMapper: (_, { resolve }) => ({
        type: COUNTER_ACTION.CHANGED,
        value: resolve(props.value) + 1,
      }),
    }),
  );

  return Stack<AppState>({
    direction: "row",
    alignItems: "center",
    spacing: 4,
    className: "p-16 justify-center",
    content: [
      // Decrement button — re-maps click → COUNTER_ACTION.CHANGED { value - 1 }
      Button<AppState>({
        label: () => {
          return "−";
        },
        opts: { size: "lg" },
        onClickedMapper: (_, { resolve }) => ({
          type: COUNTER_ACTION.CHANGED,
          value: resolve(props.value) - 1,
        }),
      }),

      // Live count display — re-renders on every state change because `text`
      // is a resolver function rather than a static string.
      Typography<AppState>({
        text: (_, { resolve }) => `Count: ${resolve(props.value)}`,
        level: "h2",
        className: "min-w-[120px] text-center",
      }),

      // Increment button (pre-registered above)
      plusButton,
    ],
  });
}

/**
 * Register the Counter meta card with Pihanga's card registry.
 * After this call, any card definition that uses `Counter({...})` will be
 * rendered by `CounterMapper` at runtime.
 */
registerMetaCard({
  type: COUNTER_CARD,
  mapper: CounterMapper,
  events: COUNTER_ACTION,
} satisfies PiRegisterMetaCard);
